# Supabase setup (accounts and cloud sync)

Cloud sync is optional. Without credentials Vega runs fully local.

## 1. Credentials

Copy `.env.example` to `.env` and fill it in (`.env` is gitignored).

| Variable | Where it is used | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client bundle (desktop + web) | No. Public by design; safe because every table has Row Level Security |
| `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_REGION` | `scripts/db-migrate.mjs` only | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/rls-check.mjs` only | **Yes**, bypasses RLS. Never prefix with `VITE_`, never import from `src/` |

Only `VITE_*` variables are compiled into the app. A build check confirms the service key and DB password are not in the bundle.

## 2. Database

```bash
npm run db:migrate     # applies supabase/migrations/*.sql once each (TLS verified against Supabase's root CA)
npm run db:rls-check   # creates two throwaway users and proves they cannot read or write each other's rows
```

## 3. Dashboard settings to review (Authentication)

- **URL Configuration**: set *Site URL* to the deployed web address, and add `http://localhost:5174` and `http://localhost:5173` to *Redirect URLs*. Confirmation and reset-password links land there.
- **Providers > Email**: email confirmation is on by default. For quick local testing you can turn it off; keep it on for production.
- The built-in mail sender is rate limited (a few emails per hour). Configure custom SMTP (Resend, Brevo, ...) before real users sign up.
- Optional later: Google / GitHub OAuth under *Providers* (needs client ids from those services).

## 4. How sync works

- Local-first: the app works signed out; signing in merges local data into the account.
- Likes and playlists: last-write-wins per item using the client edit time; deletes are tombstones, so a delete on one device removes the item everywhere.
- Play events: append-only, idempotent (`<startedAt>-<track>` id), pulled incrementally via the server's `synced_at` cursor.
- A different account signing in on the same device clears the previous account's local copy first (it is already in the cloud), so data never leaks between accounts.
- Local-file tracks sync as metadata only; the audio stays on its device.
