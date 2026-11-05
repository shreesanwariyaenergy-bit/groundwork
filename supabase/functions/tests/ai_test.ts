// deno test --allow-net --allow-env supabase/functions/tests/ai_test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { complete, estimateCost, ProviderError, type ProviderConfig } from '../_shared/ai.ts';
import { buildAnalysisPrompt, extractJson, normalizeReport, THINK_SECTIONS } from '../_shared/think.ts';

const fakeReport = { overall_signal: 'uncertain', sections: THINK_SECTIONS.map((s) => ({ key: s.key, summary: 'S', points: [{ text: 'p', label: 'verified' }] })) };

function serve(handler: (req: Request) => Response | Promise<Response>) {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen() {} }, handler);
  return { url: `http://localhost:${(server.addr as Deno.NetAddr).port}`, close: async () => { ac.abort(); await server.finished; } };
}

const base: ProviderConfig = {
  id: 'x', key: 'mock', provider: 'openai_compatible', label: 'Mock', model: 'm', base_url: null, api_key_env: 'MOCK_KEY',
  is_paid: false, paid_approved: false, timeout_ms: 2000, max_output_tokens: 4096, max_input_chars: 12000,
  requests_per_minute: 10, daily_request_limit: 100, cost_per_1m_input_usd: 0, cost_per_1m_output_usd: 0, monthly_budget_usd: 0,
};

Deno.test('openai-compatible adapter → normalized report', async () => {
  Deno.env.set('MOCK_KEY', 'secret');
  let auth = '';
  const s = serve(async (req) => {
    auth = req.headers.get('authorization') ?? '';
    const body = await req.json();
    assertEquals(body.messages[0].role, 'system');
    return Response.json({ choices: [{ message: { content: '```json\n' + JSON.stringify(fakeReport) + '\n```' } }], usage: { prompt_tokens: 100, completion_tokens: 900 } });
  });
  try {
    const p = buildAnalysisPrompt('T', 'An idea about clinics and scheduling software for small teams', {});
    const res = await complete({ ...base, base_url: s.url }, { system: p.system, messages: [{ role: 'user', content: p.user }], json: true, maxOutputTokens: 8000 });
    assertEquals(auth, 'Bearer secret');
    assertEquals(res.outputTokens, 900);
    const report = normalizeReport(extractJson(res.text), { generatedBy: 'ai' });
    assertEquals(report.sections.length, 20);
    // model claimed "verified" without sources → downgraded
    assertEquals(report.sections.every((x) => x.points.every((pt) => pt.label === 'assumption')), true);
    assertEquals(report.overall_signal, 'uncertain');
  } finally { await s.close(); }
});

Deno.test('gemini adapter uses header key and maps usage', async () => {
  Deno.env.set('MOCK_KEY', 'gkey');
  const s = serve((req) => {
    assertEquals(req.headers.get('x-goog-api-key'), 'gkey');
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"sections":[]}' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 } });
  });
  try {
    const res = await complete({ ...base, provider: 'gemini', base_url: s.url }, { system: 's', messages: [{ role: 'user', content: 'u' }], json: true, maxOutputTokens: 100 });
    assertEquals([res.inputTokens, res.outputTokens], [5, 7]);
  } finally { await s.close(); }
});

Deno.test('rate limit, auth and missing key errors are typed', async () => {
  const s = serve(() => new Response('slow down', { status: 429 }));
  try {
    Deno.env.set('MOCK_KEY', 'k');
    await assertRejects(() => complete({ ...base, base_url: s.url }, { system: 's', messages: [], json: false, maxOutputTokens: 10 }), ProviderError, 'provider_rate_limited');
    Deno.env.delete('MOCK_KEY');
    await assertRejects(() => complete({ ...base, base_url: s.url }, { system: 's', messages: [], json: false, maxOutputTokens: 10 }), ProviderError, 'provider_not_configured');
  } finally { await s.close(); }
});

Deno.test('cost estimate', () => {
  assertEquals(estimateCost({ ...base, cost_per_1m_input_usd: 1, cost_per_1m_output_usd: 2 }, 1_000_000, 500_000), 2);
});
