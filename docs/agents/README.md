# How Vega is run with agents

Vega is built like a small company of Claude Code sessions plus human contributors. Playbook: the `agent-software-company` skill (v1.2.0). This file is the Vega-specific version. Owner decisions: `.agents/decisions/`.

## Roles

| Role | Who | Does |
|---|---|---|
| Owner | @DhruvHarani1 | business and design decisions, approves merges to `main` and every release, holds all access |
| Boss | main Claude session | plans sprints, triages, reviews risk, integrates into `staging`, prepares release PRs. Never merges or publishes without the owner's word |
| Managers | one per area (`.agents/ROSTER.json`) | triage, build via sub-agents (fixer, reviewer, tester) |
| QA reviewer | independent session | re-runs checks, proves new tests fail on old code (red proof), names the SHA in the verdict |
| Security reviewer | read-only | files issues, never fixes alone |
| Contributors | outside humans (and their agents) | claim an issue, open a PR; cannot merge |

## Branches and flow

```
agent/<issue>-<slug>  ->  PR into staging  ->  verified batch  ->  release PR staging -> main  ->  tag vX.Y.Z (owner approves)
```

- `main` deploys the web app (Vercel) and is what releases are cut from. `staging` is the integration branch (Vercel preview).
- PR required on both; no force push or deletion. The owner may bypass for hotfixes.
- Hotfix (P0): branch from `main`, PR to `main`, then merge into `staging`.

## Every change passes

1. Issue with acceptance criteria and risk level. 2. Failing test first when logic is involved. 3. `npm run typecheck` and `npm test` (the whole suite). 4. Independent review naming the head SHA. 5. UI changes: screenshots at desktop and phone width. 6. Merged into `staging`, full suite re-run after each batch. 7. Release PR with changes, checks, what is not included, rollback.

## Safety (Vega specifics)

- **Real data:** the only Supabase project is the production one. Agents never sign in to it, never read or write user rows, never run migrations. Migrations are written in `supabase/migrations/`, reviewed, and run by the owner.
- **Test runs:** use `npm run dev:agent` (cloud features off, nothing leaves the machine except public catalogue calls). A test Supabase project can replace this later.
- **Secrets:** never in the repo or chat. `YT_API_KEY` lives in Vercel env only. `.env*` is git-ignored.
- **YouTube:** never circumvent bot checks or spoof clients; never store or redistribute copyrighted audio.
- **Releases/tags:** only after the owner approves in their own words. Agents never publish.
- **Stop and ask** when checks fail for a reason you do not understand, a permission is denied, or something touches production unexpectedly.

## Coordination

- Claim before building: comment + label `claimed:<org>`. One owner per issue.
- Standup: one living comment per team on the "Standup" issue.
- Labels: `area:*`, `P0..P3`, `agent-found`, `proposal`, `blocked`, `needs-boss`, `risk-high`, `claimed:<org>`.
- Terse style between agents; plain language for the owner and for anything risky.

## Sprint cadence

About a week. Planning issue "Sprint N plan" with a milestone; fixed cut-off; retro file `docs/agents/retro-sprint-N.md`. Max 2 sessions at once.

## Priorities

P0 security / data loss / site down: hotfix same day. P1 wrong behaviour or blocks a main flow: this sprint. P2 workaround exists: next planning. P3 polish.
