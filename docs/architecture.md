# Aegis — Architecture

Last updated: 2026-07-11

Aegis is a zero-knowledge TOTP authenticator that runs as a Progressive
Web App on top of TanStack Start (React 19 + Vite 7) and Lovable Cloud
(Supabase). A hardened Manifest V3 browser extension shares the same
crypto primitives verbatim.

## System diagram

```text
┌───────────────────────────────────────────────────────────────────┐
│                      User's device (browser)                      │
│                                                                   │
│  ┌────────────┐  ┌────────────────────────────────────────────┐   │
│  │ Extension  │  │ Web app (PWA)                              │   │
│  │  (MV3)     │◀▶│  routes/  components/  lib/vault-*         │   │
│  │  popup +   │  │  ┌───────────────────────┐                 │   │
│  │  content   │  │  │ vault-session (in-RAM)│  ← DEK never    │   │
│  │  scripts   │  │  │  AES-GCM 256-bit key  │    persisted    │   │
│  └────────────┘  │  └───────────────────────┘                 │   │
│                  │  ┌───────────────────────┐                 │   │
│                  │  │ IndexedDB vault_cache │  ← ciphertext   │   │
│                  │  │ (encrypted mirror)    │    only         │   │
│                  │  └───────────────────────┘                 │   │
│                  └────────────────────────────────────────────┘   │
└────────────────────────┬──────────────────────────────────────────┘
                         │  HTTPS  (only ciphertext + metadata)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Lovable Cloud (Supabase)                       │
│                                                                   │
│   Postgres ── RLS on every user table                             │
│    ├─ vault_accounts    (ciphertext + IV, per row)                │
│    ├─ vault_meta        (KDF salt, wrapped DEK)                   │
│    ├─ user_public_keys  (X25519 + Ed25519 pubkeys)                │
│    ├─ vault_shares      (sealed 1:1 & family shares)              │
│    ├─ emergency_contacts (sealed DEK for trusted contact)         │
│    ├─ subscriptions     (Stripe billing state)                    │
│    ├─ client_errors     (feedback + RUM + error telemetry)        │
│    └─ audit tables      (admin_audit, user_login_events)          │
│                                                                   │
│   Auth (managed)  ─  email + Google OAuth                         │
│   Edge functions  ─  Stripe webhook, WebPush sender               │
│   pg_cron         ─  purge_old_client_errors, session cleanup     │
└───────────────────────────────────────────────────────────────────┘
```

## Crypto stack

Frozen and version-locked in `src/lib/vault-crypto.ts`.

| Layer            | Algorithm                                     |
| ---------------- | --------------------------------------------- |
| KDF (v1)         | PBKDF2-HMAC-SHA256, 600 000 iterations        |
| KDF (v2)         | Argon2id (m=19 MiB, t=2, p=1) via `hash-wasm` |
| DEK              | AES-GCM 256-bit                               |
| Row encryption   | AES-GCM per row, 12-byte IV                   |
| AAD (v3 rows)    | `utf8(user_id + '\|' + account_id)`           |
| Sharing wrap     | X25519 ECDH → HKDF-SHA256 → AES-GCM           |
| Recovery kit     | Same as DEK wrap, printed as QR + text        |

The server never sees plaintext — a full database dump is opaque
ciphertext without the user's passphrase.

## Route architecture

- `src/routes/__root.tsx` — head metadata, theme/locale hydration,
  PWA service-worker registration, RUM init, Query + Router providers.
- `src/routes/_authenticated/` — layout gate; redirects to `/auth`
  before any child loader runs.
- `src/routes/_authenticated/_locked/` — nested gate; redirects to
  `/lock` when the in-RAM DEK is missing.
- `src/routes/api/public/*` — bypass-auth webhook + cron endpoints
  (Stripe webhook, health check). Signature verification required in
  every handler.

## Data flow (unlock → decrypt → paint)

1. User enters passphrase on `/lock`.
2. `deriveKey(passphrase, salt)` runs on-device; unwraps the DEK.
3. DEK held in the module-scope `vault-session` singleton (memory only).
4. `vault-cache` (IndexedDB) paints ciphertext instantly.
5. `syncAccountsFromServer` diffs by `last_sync`; merged rows re-encrypt
   into cache.
6. Each row decrypted on demand inside the `AccountCard` render.

## Observability

Three writers to `public.client_errors`, admin-only SELECT:

| Route tag              | Writer                             | Purpose                    |
| ---------------------- | ---------------------------------- | -------------------------- |
| `vault-migrator`       | `src/lib/vault-migrator.ts`        | Crypto v3 migration audit  |
| `feedback:<category>`  | `src/lib/feedback.ts`              | In-app "Report a problem"  |
| `rum:<pathname>`       | `src/lib/rum.ts`                   | LCP/INP/CLS, sampled 10%   |
| (React boundary)       | `src/lib/lovable-error-reporting.ts` | Unhandled render errors  |

A daily `purge_old_client_errors(30)` cron trims the table.

## Deployment topology

- **Web app** — Cloudflare Workers via TanStack Start's Vite adapter.
  Edge cache, HSTS + CSP + Permissions-Policy set in `src/server.ts`.
- **Extension** — Static Chrome/Firefox MV3 build in `dist-ext/` and
  `dist-ext-firefox/`; ships from `extension/` via a second Vite entry.
- **Self-host** — Docker Compose in `self-host/` for Postgres +
  migrations + edge runtime; see `docs/self-host.md`.

## Related documents

- `SECURITY.md` — threat model, disclosure, crypto invariants
- `docs/roadmap.md` — long-horizon phase plan
- `docs/dr.md` — disaster recovery
- `docs/self-host.md` — self-hosted deployment
- `docs/api.md` — public read-only API
- `docs/routing.md` — router conventions
- `docs/i18n.md` — string-freeze policy
- `docs/a11y.md` — WCAG conformance checklist
