# 0001 Setup (2026-11-01), owner decisions

- Branch flow: `agent/<issue>-<slug>` -> PR into `staging` -> verified batch -> release PR `staging` -> `main`.
- Protection on `main` and `staging`: pull request required, no force push, no deletion. The owner (admin) may bypass for hotfixes and release commits.
- No test database yet. Agent runs use `npm run dev:agent` (cloud off, no Supabase, no sign-in). Agents never use the real Supabase project's data.
- Releases and tags only after the owner says so in their own words.
- Outside contributors (currently @Aaqibhafeezkhan) work through pull requests; they cannot merge.
