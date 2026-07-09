ALTER TABLE public.vault_accounts
  ADD COLUMN IF NOT EXISTS crypto_version smallint NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.vault_accounts.crypto_version IS
  'Per-row encryption format version. 2 = AES-GCM with no AAD (legacy). 3 = AES-GCM with additionalData = utf8(user_id||"|"||account_id). Migrator upgrades 2 -> 3 in-place.';