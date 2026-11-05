-- =============================================================================
-- Function privileges, reference data, default configuration, storage and
-- realtime. Reference data is not user data: no profiles are seeded, ever.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE to PUBLIC by default; we
-- revoke everything and grant only the API surface.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Predicates used inside RLS policies must be executable by the caller.
grant execute on function
  public.is_admin(), public.is_staff(), public.is_blocked_pair(uuid, uuid), public.are_connected(uuid, uuid),
  public.has_pending_request(uuid, uuid), public.current_account_status(), public.can_view_profile(uuid),
  public.is_conversation_member(uuid), public.can_post_message(uuid), public.can_access_think_project(uuid),
  public.can_view_startup_project(uuid), public.check_rate_limit(text, int, interval), public.tz_offset_hours(text)
to authenticated;

-- Client API surface (web + Android).
grant execute on function
  public.get_recommendations(int, int, text),
  public.refresh_recommendations(),
  public.search_profiles(text, text[], text[], text[], text[], public.startup_stage[], public.availability_level[],
                         public.user_intent[], public.work_mode[], text, numeric, int, int, int),
  public.send_connection_request(uuid, text),
  public.respond_connection_request(uuid, boolean),
  public.withdraw_connection_request(uuid),
  public.remove_connection(uuid),
  public.get_connection_requests(text),
  public.get_connections(int, int),
  public.block_user(uuid), public.unblock_user(uuid), public.get_blocked_users(),
  public.report_user(uuid, public.report_reason, text, uuid),
  public.mark_conversation_read(uuid), public.set_conversation_muted(uuid, boolean),
  public.get_conversations(int, int),
  public.mark_notifications_read(uuid[]),
  public.register_device_token(text, text), public.unregister_device_token(text),
  public.touch_activity(text), public.get_my_invite_code(), public.think_status(), public.export_my_data(),
  public.submit_deletion_request(text, text),
  public.admin_list_users(text, public.account_status, int, int),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.admin_update_report(uuid, public.report_status, text),
  public.admin_set_flag(text, boolean, jsonb, text),
  public.admin_update_ai_provider(uuid, jsonb),
  public.admin_grant_role(uuid, public.admin_role), public.admin_revoke_role(uuid),
  public.admin_update_deletion_request(uuid, text, text),
  public.admin_metrics(int)
to authenticated;

grant execute on function public.submit_deletion_request(text, text) to anon;

-- Keep future functions closed by default too.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
insert into public.skill_categories(slug, name, sort_order) values
  ('engineering', 'Software engineering', 10),
  ('ai_ml', 'AI & machine learning', 20),
  ('mobile', 'Mobile', 30),
  ('design', 'Design', 40),
  ('product', 'Product', 50),
  ('growth', 'Growth & marketing', 60),
  ('sales', 'Sales & partnerships', 70),
  ('operations', 'Operations', 80),
  ('business', 'Business & strategy', 90),
  ('finance', 'Finance', 100),
  ('legal', 'Legal', 110),
  ('domain', 'Domain expertise', 120);

insert into public.skills(slug, name, category) values
  ('typescript', 'TypeScript', 'engineering'), ('javascript', 'JavaScript', 'engineering'),
  ('python', 'Python', 'engineering'), ('go', 'Go', 'engineering'), ('rust', 'Rust', 'engineering'),
  ('java', 'Java', 'engineering'), ('react', 'React', 'engineering'), ('nextjs', 'Next.js', 'engineering'),
  ('nodejs', 'Node.js', 'engineering'), ('postgres', 'PostgreSQL', 'engineering'),
  ('system_design', 'System design', 'engineering'), ('devops', 'DevOps & cloud', 'engineering'),
  ('security', 'Application security', 'engineering'), ('data_engineering', 'Data engineering', 'engineering'),
  ('blockchain', 'Blockchain development', 'engineering'),
  ('machine_learning', 'Machine learning', 'ai_ml'), ('deep_learning', 'Deep learning', 'ai_ml'),
  ('llm_apps', 'LLM applications', 'ai_ml'), ('nlp', 'Natural language processing', 'ai_ml'),
  ('computer_vision', 'Computer vision', 'ai_ml'), ('mlops', 'MLOps', 'ai_ml'),
  ('data_science', 'Data science', 'ai_ml'), ('rag', 'Retrieval & search systems', 'ai_ml'),
  ('react_native', 'React Native', 'mobile'), ('android', 'Android (Kotlin)', 'mobile'),
  ('ios', 'iOS (Swift)', 'mobile'), ('flutter', 'Flutter', 'mobile'),
  ('ui_design', 'UI design', 'design'), ('ux_research', 'UX research', 'design'),
  ('interaction_design', 'Interaction design', 'design'), ('brand_design', 'Brand design', 'design'),
  ('figma', 'Figma', 'design'), ('design_systems', 'Design systems', 'design'),
  ('product_management', 'Product management', 'product'), ('product_strategy', 'Product strategy', 'product'),
  ('user_interviews', 'Customer discovery', 'product'), ('analytics', 'Product analytics', 'product'),
  ('growth_marketing', 'Growth marketing', 'growth'), ('content_marketing', 'Content marketing', 'growth'),
  ('seo', 'SEO', 'growth'), ('performance_marketing', 'Performance marketing', 'growth'),
  ('community', 'Community building', 'growth'), ('social_media', 'Social media', 'growth'),
  ('b2b_sales', 'B2B sales', 'sales'), ('enterprise_sales', 'Enterprise sales', 'sales'),
  ('partnerships', 'Partnerships', 'sales'), ('customer_success', 'Customer success', 'sales'),
  ('operations_mgmt', 'Operations management', 'operations'), ('project_management', 'Project management', 'operations'),
  ('hiring', 'Hiring & recruiting', 'operations'), ('supply_chain', 'Supply chain', 'operations'),
  ('business_development', 'Business development', 'business'), ('strategy', 'Business strategy', 'business'),
  ('fundraising', 'Fundraising', 'business'), ('pricing', 'Pricing', 'business'),
  ('market_research', 'Market research', 'business'),
  ('financial_modeling', 'Financial modeling', 'finance'), ('accounting', 'Accounting', 'finance'),
  ('startup_law', 'Startup law', 'legal'), ('privacy_compliance', 'Privacy & compliance', 'legal'),
  ('healthcare_domain', 'Healthcare', 'domain'), ('fintech_domain', 'Financial services', 'domain'),
  ('education_domain', 'Education', 'domain'), ('climate_domain', 'Climate & energy', 'domain'),
  ('retail_domain', 'Retail & e-commerce', 'domain');

insert into public.roles(slug, name, categories, is_cofounder_role, sort_order) values
  ('technical_cofounder', 'Technical co-founder', array['engineering','ai_ml','mobile'], true, 10),
  ('business_cofounder', 'Business co-founder', array['business','sales','growth','operations'], true, 20),
  ('product_cofounder', 'Product co-founder', array['product','design'], true, 30),
  ('ai_ml_engineer', 'AI / ML engineer', array['ai_ml'], false, 40),
  ('software_developer', 'Software developer', array['engineering'], false, 50),
  ('fullstack_developer', 'Full-stack developer', array['engineering'], false, 60),
  ('backend_engineer', 'Backend engineer', array['engineering'], false, 70),
  ('frontend_engineer', 'Frontend engineer', array['engineering'], false, 80),
  ('mobile_developer', 'Mobile developer', array['mobile'], false, 90),
  ('product_designer', 'Product / UI-UX designer', array['design'], false, 100),
  ('product_manager', 'Product manager', array['product'], false, 110),
  ('growth_professional', 'Growth & marketing', array['growth'], false, 120),
  ('sales_professional', 'Sales', array['sales'], false, 130),
  ('operations_professional', 'Startup operations', array['operations'], false, 140),
  ('finance_professional', 'Finance', array['finance'], false, 150),
  ('legal_professional', 'Legal', array['legal'], false, 160),
  ('founder', 'Founder', array['business'], false, 170),
  ('other', 'Other expertise', array[]::text[], false, 999);

insert into public.industries(slug, name, sort_order) values
  ('ai', 'Artificial intelligence', 10), ('saas', 'B2B SaaS', 20), ('devtools', 'Developer tools', 30),
  ('fintech', 'Fintech', 40), ('healthtech', 'Healthtech', 50), ('edtech', 'Edtech', 60),
  ('climate', 'Climate & energy', 70), ('ecommerce', 'E-commerce & retail', 80), ('consumer', 'Consumer apps', 90),
  ('marketplaces', 'Marketplaces', 100), ('mobility', 'Mobility & logistics', 110), ('agritech', 'Agritech', 120),
  ('media', 'Media & creator economy', 130), ('gaming', 'Gaming', 140), ('hardware', 'Hardware & IoT', 150),
  ('security', 'Cybersecurity', 160), ('proptech', 'Real estate & proptech', 170), ('hrtech', 'HR & future of work', 180),
  ('legaltech', 'Legaltech', 190), ('social_impact', 'Social impact', 200), ('web3', 'Web3', 210), ('other', 'Other', 999);

-- ---------------------------------------------------------------------------
-- Default runtime configuration (all tunable from the admin dashboard)
-- ---------------------------------------------------------------------------
insert into public.feature_flags(key, enabled, value, description, is_public) values
  ('think.ai_enabled', false, '{}', 'Master switch for AI-generated Think reports. Off until a provider is configured and reviewed.', true),
  ('think.limits', true, '{"analyses_per_day": 3, "followups_per_day": 20, "global_requests_per_day": 500, "allow_free_fallback": true}',
     'Per-user and global Think quotas.', false),
  ('matching.weights', true, '{"role": 0.25, "skill": 0.20, "mutual": 0.15, "intent": 0.15, "industry": 0.08, "stage": 0.05, "availability": 0.05, "timezone": 0.04, "work_mode": 0.03}',
     'Relative weights of matching signals.', false),
  ('matching.settings', true, '{"min_score": 0.35}', 'Minimum score for a recommendation.', false),
  ('limits.connections', true, '{"verified_per_day": 25, "unverified_per_day": 3, "rerequest_cooldown_days": 30}',
     'Connection request limits.', false),
  ('platform.maintenance', false, '{"message": "We are performing maintenance. Please try again shortly."}',
     'When enabled, clients show a maintenance notice and block writes in the UI.', true),
  ('platform.registration_open', true, '{}', 'Allow new registrations.', true),
  ('notifications.recommendations', true, '{"min_score": 0.6, "max_per_week": 2}', 'New recommendation notifications.', false);

-- AI providers ship DISABLED. Keys live in Edge Function secrets, never here.
-- Free tiers and model names change: verify current terms before enabling.
insert into public.ai_provider_configs(key, provider, label, model, base_url, api_key_env, is_enabled, is_paid, priority,
  requests_per_minute, daily_request_limit, notes) values
  ('gemini-free', 'gemini', 'Google Gemini (free tier)', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta',
    'GEMINI_API_KEY', false, false, 10, 8, 200,
    'Free tier quotas are limited and free-tier prompts may be used by the provider to improve products. Review terms and update the in-app disclosure before enabling.'),
  ('groq-free', 'openai_compatible', 'Groq (free tier)', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1',
    'GROQ_API_KEY', false, false, 20, 20, 500, 'Free tier with rate limits. Verify current model availability.'),
  ('openrouter-free', 'openai_compatible', 'OpenRouter (free models)', 'meta-llama/llama-3.3-70b-instruct:free', 'https://openrouter.ai/api/v1',
    'OPENROUTER_API_KEY', false, false, 30, 10, 200, 'Only ":free" model variants are zero-cost; providers behind free models may log prompts.'),
  ('ollama-self-hosted', 'ollama', 'Self-hosted (Ollama)', 'llama3.1:8b', 'http://localhost:11434',
    null, false, false, 40, 30, 2000, 'Requires your own server reachable from Supabase Edge Functions. Infrastructure cost is yours.');

-- ---------------------------------------------------------------------------
-- Storage (avatars). Guarded so the migration also runs on plain Postgres.
-- Public-read bucket with unguessable per-user paths; uploads restricted to
-- the user's own folder, images only, 2 MB max.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy "avatar upload own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatar update own folder" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatar delete own folder" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to postgres_changes; RLS still filters rows.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications, public.connection_requests;
  end if;
end $$;
