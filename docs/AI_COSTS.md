# Think: AI usage and cost controls

## Defaults (as shipped)
* `think.ai_enabled` = **off**. Think offers only the non-AI checklist until an admin turns it on.
* All four providers in `ai_provider_configs` are **disabled** and marked free (`is_paid = false`).
* Quotas (`think.limits`): 3 analyses + 20 follow-ups per user per UTC day; 500 AI requests per day globally.
* Expected spend with defaults: **$0** (free tiers only). Free tiers can change or end; re-check terms monthly.

## Guarantees enforced in code
| Rule | Where |
|---|---|
| No call unless master switch on and ≥1 provider enabled | `think/index.ts` |
| Paid provider cannot be enabled without `paid_approved = true` **and** `monthly_budget_usd > 0` | DB check constraint `paid_requires_approval` |
| Paid provider skipped once this month's estimated spend ≥ budget | `eligibleProviders()` |
| Fallback only among *eligible* providers (never silently to an unapproved paid one); can be disabled (`allow_free_fallback`) | `runWithProviders()` |
| Per-provider requests/minute and requests/day caps | `eligibleProviders()` |
| Per-user daily quotas + global daily cap; failures do not consume the user's quota | `think/index.ts` (counts `success` only) |
| One running analysis per project at a time | `analysis_in_progress` check |
| Input truncated to `max_input_chars`; output capped by `max_output_tokens` | adapter + prompt builder |
| Every call logged (provider, model, tokens, estimated cost, latency, error) — **no prompt/completion text** | `ai_usage_logs` |
| Provider unavailable → clear error; user may *choose* the labelled checklist | client + `action: 'checklist'` |
| Only the project owner can trigger AI (shared viewers are read-only) | owner check in function |

## Enabling a free provider (example: Gemini)
1. Create a key in Google AI Studio and read the current free-tier terms (data use, rate limits).
2. `supabase secrets set GEMINI_API_KEY=...`
3. Admin → AI providers → *Google Gemini (free tier)* → verify model name → **Enabled**.
4. Admin → AI providers → **Think AI master switch** on.
5. Run one analysis on a test account; check Admin → Overview → *AI usage this month*.
6. Update the Privacy Policy section "AI processing" with the provider actually used.

Groq / OpenRouter: same steps with `GROQ_API_KEY` / `OPENROUTER_API_KEY` (OpenAI-compatible adapter). On OpenRouter
use only `:free` model IDs. Ollama: point `base_url` at your own server reachable from Supabase Edge Functions —
the infrastructure cost is yours.

## Approving a paid provider (only after an explicit business decision)
Set `is_paid`, `cost_per_1m_input_usd`, `cost_per_1m_output_usd`, a `monthly_budget_usd`, then toggle *I approve paid
usage*. All changes are written to the audit log. Costs are **estimates** from token counts; reconcile with the
provider's invoice.

## Privacy
Before a user's first AI analysis the app shows which provider will process the idea and records the acknowledgement
(`profile_preferences.ai_processing_acknowledged_at`). Do not claim providers never retain data unless their terms say so.

## Operational costs (other)
| Service | Free tier suitable for beta? | Notes |
|---|---|---|
| Supabase | Yes (2 free projects per org — currently both used) | Pro ($25/mo) adds backups/PITR; recommended before public launch |
| Vercel | Hobby is non-commercial | Pro needed for a commercial product |
| Expo EAS | Free tier has limited build minutes | Push notifications are free |
| Google Play | One-time $25 developer fee | |
| Resend (optional) | Free tier | Only for transactional email |
Prices change — verify before budgeting.
