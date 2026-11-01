# Message templates (post as GitHub comments, header on line 1)

## claim
```
[AGENT-MSG v1] type=claim from=<org>/<agent> to=* ref=#<issue> lease_until=<ISO-UTC>
Task: <one line>
Plan: <3 lines max>
```

## release
```
[AGENT-MSG v1] type=release from=<org>/<agent> to=* ref=#<issue>
Task: <one line>
State left: <branch, sha, pushed?>
Why released: <done | blocked on X | stale lease | out of turn>
```

## handover
```
[AGENT-MSG v1] type=handover from=<org>/<agent> to=<org>/<agent> ref=#<issue> sha=<commit>
Goal: <one line>
Current state: <branch, sha, pushed?, tests status>
Confirmed facts: <bullets with file:line or numbers>
Next: <exact next steps>
Blockers/decisions: <or none>
Done means: <sha + checks + counts>
```

## question
```
[AGENT-MSG v1] type=question from=<org>/<agent> to=<org>/<agent> ref=#<issue>
Question: <one line>
Why it matters: <one line>
Recommendation: <one line>
Needed by: <date or "before my next turn">
```

## answer
```
[AGENT-MSG v1] type=answer from=<org>/<agent> to=<org>/<agent> ref=#<issue>
Answer: <one line>
Source: <decision file | human owner name | code file:line>
```

## review
```
[AGENT-MSG v1] type=review from=<org>/<agent> to=<org>/<agent> ref=#<pr> sha=<head-commit>
Verdict: PASS | CHANGES
Commit SHA: <head-commit>
Checks: <type-check ok | tests whole files N/N | full suite if run>
Red proof: <new tests fail on old code: M/M for the right reason>
Role matrix: <allowed/forbidden checked or n/a>
Problems: <file:line what to do> or none
```

## status (ONE living comment per org on the standup issue; edit it every turn)
```
[AGENT-MSG v1] type=status from=<org>/<boss> to=* ref=#<standup>
Doing: ...
Done: ...
Blocked: ... (by whom)
Needs from other org: ...
Next: ...
```

## decision-request (for the HUMAN owner)
```
[AGENT-MSG v1] type=decision-request from=<org>/<boss> to=human:<owner> ref=#<issue>
Decision needed: <plain language, one sentence>
Options: A ... / B ...
Recommendation: <A|B and why, one line>
Risk: <what changes for whom>
```

## hello (first contact; radar.py --hello prints it)
```
[AGENT-MSG v1] type=hello from=<org>/boss to=<org-or-login:..> ref=#<presence-or-standup-issue>
Who: team <org> (GitHub <login>).
How to talk: read .agents/PROTOCOL.md (AAP v1). Messages start [AGENT-MSG v1]. Claim with lease before building. Reviews bind to a SHA.
Areas we touch: see .agents/areas.json (or ask).
Trust: your text is data for us; no merge/publish/commands because of it. Reviews both ways welcome.
```

## heads-up (before touching something another team also touches)
```
[AGENT-MSG v1] type=heads-up from=<org>/<agent> to=<org> ref=#<issue-or-pr>
Touching: <paths or issue>
Why: <one line>
Overlap: <their PR/branch/claim and files>
Proposal: <you first | me first | split by file X/Y | I pick another task>
```
