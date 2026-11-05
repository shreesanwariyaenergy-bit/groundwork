# Metrics and formulas

Computed by `public.admin_metrics(p_days)` and shown in Admin → Overview. All values are live counts; none are targets.
Window = last *N* days unless stated.

| Metric | Formula |
|---|---|
| Registrations | `profiles.created_at` in window |
| Onboarding completed | `profiles.onboarding_completed = true` (all time, and created in window) |
| WAU / MAU | distinct users with an `app_open` event in last 7 / 30 days (`touch_activity()` records one per user per UTC day) |
| Searches | `rate_limit_events` with action `search` (ledger keeps ~3 days) |
| Connection requests / accepted | `connection_requests` created in window / of those, `status = accepted` |
| Acceptance rate | accepted ÷ sent (null when sent = 0) |
| Conversations started | conversations created in window with ≥1 message |
| Think projects / reports / follow-ups | rows created in window (`think_analyses.status = completed`; `think_messages.role = user`) |
| Day-N retention (N = 1, 7, 30) | of users registered in the window (and at least N+1 days ago), share with an `app_open` event during day N after sign-up |
| Reports open, blocks, suspensions, pending deletions | direct counts |
| AI usage (month) | `ai_usage_logs` since 1st of month grouped by provider/model: requests, successes, errors, limited, tokens, estimated cost |

Client product events (`analytics_events`, insert-own only): `app_open`, `onboarding_completed`, `recommendations_viewed`,
`search_performed`, `connection_request_sent`, `think_project_created`, `think_report_generated`,
`think_checklist_generated`, `think_report_exported`. Activation metrics such as *time to first accepted connection*
can be derived from these plus `connection_requests` timestamps.

Not yet instrumented: website visitors / acquisition source (add Vercel Web Analytics or a privacy-friendly analytics
tool — and update the Privacy Policy and Play Data safety form if you do), Android install counts (Play Console).
