// deno test --allow-net --allow-env supabase/functions/tests/gemini_test.ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { complete, isGemini3Plus, ProviderError, type ProviderConfig } from '../_shared/ai.ts';
import { buildResearchSources } from '../_shared/deep.ts';
import { extractJson } from '../_shared/think.ts';
import { normalizeAssessment } from '../_shared/assessment.ts';

function serve(handler: (req: Request) => Response | Promise<Response>) {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen() {} }, handler);
  return { url: `http://localhost:${(server.addr as Deno.NetAddr).port}`, close: async () => { ac.abort(); await server.finished; } };
}

const cfg: ProviderConfig = {
  id: 'g', key: 'gemini-free', provider: 'gemini', label: 'Gemini', model: 'gemini-3.8-flash', base_url: null, api_key_env: 'TEST_GEMINI_KEY',
  is_paid: false, paid_approved: false, timeout_ms: 5000, max_output_tokens: 16384, max_input_chars: 12000,
  requests_per_minute: 10, daily_request_limit: 100, cost_per_1m_input_usd: 0, cost_per_1m_output_usd: 0, monthly_budget_usd: 0,
};
Deno.env.set('TEST_GEMINI_KEY', 'test-key-not-real');
Deno.env.set('AI_RETRY_DELAYS_MS', '10,10');

Deno.test('model detection', () => {
  assert(isGemini3Plus('gemini-3.8-flash'));
  assert(isGemini3Plus('gemini-3.5-flash-lite'));
  assert(!isGemini3Plus('gemini-2.5-flash'));
});

Deno.test('Gemini 3: JSON mode, default temperature, thinking level, model override, thinking tokens counted', async () => {
  let seen: Record<string, unknown> = {};
  let path = '';
  let key = '';
  const s = serve(async (req) => {
    path = new URL(req.url).pathname; key = req.headers.get('x-goog-api-key') ?? '';
    seen = await req.json();
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"parameters":[]}' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 30 },
    });
  });
  try {
    const res = await complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 8192, reasoning: 'medium', model: 'gemini-3.5-flash-lite' });
    assertEquals(path, '/models/gemini-3.5-flash-lite:generateContent');
    assertEquals(key, 'test-key-not-real');
    const gc = seen.generationConfig as Record<string, unknown>;
    assertEquals(gc.temperature, undefined);
    assertEquals(gc.responseMimeType, 'application/json');
    assertEquals(gc.thinkingConfig, { thinkingLevel: 'medium' });
    assertEquals(seen.tools, undefined);
    assertEquals(res.text, '{"parameters":[]}', 'thought parts excluded');
    assertEquals(res.outputTokens, 80, 'thinking tokens billed as output');
    assertEquals(res.model, 'gemini-3.5-flash-lite');
  } finally { await s.close(); }
});

Deno.test('search grounding: tool attached, no JSON mode, metadata returned', async () => {
  let seen: Record<string, unknown> = {};
  const s = serve(async (req) => {
    seen = await req.json();
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'F1. Brand A sells spray at ₹399.' }] }, groundingMetadata: {
      webSearchQueries: ['sea salt spray india price'],
      groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x', title: 'branda.com' } }],
      groundingSupports: [{ segment: { text: 'F1. Brand A sells spray at ₹399.' }, groundingChunkIndices: [0] }],
      searchEntryPoint: { renderedContent: '<div>chips</div>' },
    } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
  });
  try {
    const res = await complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 4096, search: true });
    assertEquals(seen.tools, [{ google_search: {} }]);
    assertEquals((seen.generationConfig as Record<string, unknown>).responseMimeType, undefined);
    assertEquals(res.grounding!.queries, ['sea salt spray india price']);
    assertEquals(res.grounding!.searchEntryPointHtml, '<div>chips</div>');
    const { sources, notes } = buildResearchSources(res.text, res.grounding!.chunks, res.grounding!.supports, '2026-11-07');
    assertEquals(sources[0]!.id, 'S1');
    assert(notes.includes('[S1]'));
  } finally { await s.close(); }
});

Deno.test('truncated output is an error, not a partial report', async () => {
  const s = serve(() => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"parameters":[{"key":' }] } }] }));
  try {
    const e = await assertRejects(() => complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 100 }), ProviderError);
    assertEquals(e.code, 'provider_truncated');
  } finally { await s.close(); }
});

Deno.test('rejected thinking setting → one retry on the SAME model without it', async () => {
  const calls: { path: string; thinking: unknown }[] = [];
  const s = serve(async (req) => {
    const b = await req.json();
    calls.push({ path: new URL(req.url).pathname, thinking: (b.generationConfig as Record<string, unknown>).thinkingConfig });
    if (calls.length === 1) return Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'thinking_level is not supported for this model' } }, { status: 400 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] });
  });
  try {
    await complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 100, reasoning: 'high' });
    assertEquals(calls.length, 2);
    assertEquals(calls[0]!.path, calls[1]!.path);
    assertEquals(calls[1]!.thinking, undefined);
  } finally { await s.close(); }
});

Deno.test('quota errors carry the provider description (never the key)', async () => {
  const s = serve(() => Response.json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20' } }, { status: 429 }));
  try {
    const e = await assertRejects(() => complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 100 }), ProviderError);
    assertEquals(e.code, 'provider_rate_limited');
    assert(e.detail!.includes('limit: 20'));
    assert(!e.detail!.includes('test-key-not-real'));
  } finally { await s.close(); }
});

Deno.test('search is never sent to a non-Gemini provider', async () => {
  const e = await assertRejects(() => complete({ ...cfg, provider: 'openai_compatible', base_url: 'http://localhost:1' }, { system: 'S', messages: [], json: false, maxOutputTokens: 10, search: true }), ProviderError);
  assertEquals(e.code, 'provider_no_search');
});

Deno.test('model JSON → assessment end to end', () => {
  const r = normalizeAssessment(extractJson('```json\n{"category":"saas","parameters":[{"key":"competition","rating":"weak","finding":"Crowded"}]}\n```'), { generatedBy: 'ai' });
  assertEquals(r.assessment!.parameters.find((p) => p.key === 'competition')!.rating, 'weak');
});

Deno.test('503 high demand → retried on the same model, then succeeds', async () => {
  const paths: string[] = [];
  const s = serve((req) => {
    paths.push(new URL(req.url).pathname);
    if (paths.length < 3) return Response.json({ error: { status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }, { status: 503 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] });
  });
  try {
    const r = await complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 100 });
    assertEquals(paths.length, 3);
    assert(paths.every((p) => p === paths[0]), 'same model every time');
    assertEquals(r.text, '{}');
  } finally { await s.close(); }
});

Deno.test('persistent 503 gives up after bounded retries', async () => {
  let n = 0;
  const s = serve(() => { n++; return Response.json({ error: { status: 'UNAVAILABLE', message: 'high demand' } }, { status: 503 }); });
  try {
    const e = await assertRejects(() => complete({ ...cfg, base_url: s.url }, { system: 'S', messages: [{ role: 'user', content: 'U' }], json: true, maxOutputTokens: 100 }), ProviderError);
    assertEquals(e.code, 'provider_http_503');
    assertEquals(n, 3);
  } finally { await s.close(); }
});
