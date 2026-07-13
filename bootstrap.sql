-- ============================================================================
-- bootstrap.sql — one-time seed of the first system_admin
-- ----------------------------------------------------------------------------
-- Day After Day has NO self-service signup that awards a privileged role. The
-- very first system_admin is seeded here, by hand, exactly once.
--
-- HOW TO RUN
--   1. Deploy the schema (migrations) to the project.
--   2. Edit `operator_email` below to the operator's real address.
--   3. Paste this whole file into Supabase Studio → SQL Editor → Run.
--   4. Visit /login, switch to the OTP tab, enter that email, receive the code,
--      sign in, set a full name + password in the profile-setup modal, then
--      enrol TOTP on /profil when /admin asks for it (AAL2).
--
-- SAFETY
--   * Guarded: aborts if a system_admin already exists ("already initialized").
--   * Idempotent: re-running after an aborted/partial run is safe — an existing
--     auth.users row for the email is reused, the role insert is an upsert.
--   * NOT a migration: this file lives at the repo root, never in
--     supabase/migrations/, so the operator's email is never committed to
--     permanent migration history.
-- ============================================================================

DO $$
DECLARE
  operator_email text := 'REPLACE_WITH_OPERATOR_EMAIL';   -- ⚠ set to the operator's real address before running (see header)
  v_email        text;
  v_user_id      uuid;
BEGIN
  -- ── Concurrency guard ─────────────────────────────────────────────────────
  -- Serialize any concurrent bootstrap runs across the whole DB. Without this,
  -- two operators racing this script under READ COMMITTED could BOTH pass the
  -- "system_admin already exists" check and end up creating two sysadmins.
  -- The lock is transaction-scoped (auto-released on COMMIT / ROLLBACK) and
  -- the magic number is just an arbitrary DAD-bootstrap marker — any other
  -- session running this same script will block here until the holder ends.
  PERFORM pg_advisory_xact_lock(4914518780321333249);  -- arbitrary "DAD bootstrap" id

  -- ── Guard 0: email must be edited ─────────────────────────────────────────
  IF operator_email IS NULL OR operator_email = 'CHANGE_ME@example.com' THEN
    RAISE EXCEPTION 'Bootstrap aborted: edit operator_email before running this script.';
  END IF;

  v_email := lower(trim(operator_email));

  -- ── Guard 1: refuse to re-initialise ──────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'system_admin') THEN
    RAISE EXCEPTION 'Bootstrap aborted: a system_admin already exists. App is already initialized.';
  END IF;

  -- ── Reuse an existing auth.users row for this email, else create one ───────
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    -- Confirmed e-mail user with no password. OTP / magic-link is the only
    -- sign-in path until the operator sets a password in the profile modal.
    --
    -- Token columns set to '' explicitly: they're nullable in Postgres but
    -- GoTrue's Go layer refuses to scan NULLs into string fields, so a fresh
    -- seed with NULLs makes every subsequent /otp and /token request 500 with
    -- "converting NULL to string is unsupported".
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      reauthentication_token, phone_change, phone_change_token,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,                       -- no `role` key: handle_new_user assigns nothing
      '', '',                            -- confirmation_token, recovery_token
      '', '', '',                        -- email_change*, email_change_token_new/_current
      '', '', '',                        -- reauthentication_token, phone_change, phone_change_token
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Repair pass: if a previous run inserted the auth.users row before this
  -- patch existed (or any other path left NULLs in these columns), backfill
  -- to '' so GoTrue can scan the row without crashing.
  UPDATE auth.users
  SET confirmation_token         = COALESCE(confirmation_token,         ''),
      recovery_token             = COALESCE(recovery_token,             ''),
      email_change_token_new     = COALESCE(email_change_token_new,     ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      email_change               = COALESCE(email_change,               ''),
      reauthentication_token     = COALESCE(reauthentication_token,     ''),
      phone_change               = COALESCE(phone_change,               ''),
      phone_change_token         = COALESCE(phone_change_token,         '')
  WHERE id = v_user_id;

  -- ── Identity row (outside the IF so a partial previous run is repaired). ──
  -- Without an auth.identities row for the email provider, GoTrue rejects
  -- signInWithOtp on the address. If the previous run failed AFTER inserting
  -- auth.users but BEFORE the identity, re-running used to silently skip
  -- this — now we always upsert. The unique key is (provider_id, provider).
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    now(), now(), now()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- ── Assign system_admin (global, no expiry). Upsert keeps re-runs safe. ────
  INSERT INTO public.user_roles (user_id, role, expires_at)
  VALUES (v_user_id, 'system_admin', NULL)
  ON CONFLICT (user_id) DO UPDATE SET role = 'system_admin', expires_at = NULL;

  RAISE NOTICE 'Bootstrap complete: % is now system_admin (user_id %).', v_email, v_user_id;
END $$;
