-- Add per-user appearance preferences to profiles.
-- Values are stored as plain text; the app validates them before writing.
-- NULL means "use default" — the app falls back to localStorage / built-in defaults.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme      varchar(20),
  ADD COLUMN IF NOT EXISTS color_mode varchar(10);
