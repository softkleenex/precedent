# Evaluation results

## Held-out evaluation: the honest numbers
A benchmark written by the person who writes the rules mostly measures fit. So every reported number below comes from a **frozen held-out set**: a separate agent that never saw the rule code wrote Confluence pages (ADRs, meeting notes, handbook pages, some in Korean) for a fictional company in a new domain plus labelled tickets. We recorded the set's checksums, froze the code, and scored it **once**. After that the set becomes development data and the next version is measured on a new one.

| Frozen set (scored once) | v2.2 (first submission) | v2.3 / v2.4 (deployed then) | **v2.5 (current)** |
|---|---|---|---|
| **v3: travel booking, 90 tickets, 15 pages** | P 1.000 / R 0.022 | v2.4: P 0.700 / R 0.152 | **P 0.720 / R 0.391 (F1 0.51)** |
| v2: university LMS, 90 tickets, 15 pages | P 0.786 / R 0.250 | v2.4: P 0.882 / R 0.341 | (now development data) |
| v1: home health, 80 tickets, 12 pages | P 0.583 / R 0.184 | v2.3: P 0.833 / R 0.395 | (now development data) |

Reproduce: `node eval/run_heldout.mjs eval/heldout3`.

Development data (tuned on, shown only to make regressions visible): 7 sets / 562 tickets in seven domains (fintech, home health, university LMS, IoT, e-commerce, B2B analytics, game backend). v2.5 holds **precision 1.000 on all seven**, recall 0.64–0.98 — `sh eval/run_all_dev.sh`.

**What changed in v2.5 (all general mechanisms, no per-ticket rules):** numeric limits ("timeouts cannot exceed 60 s", "kept no longer than 30 days", Korean units), freeze windows ("between Friday 18:00 and Monday 10:00"), routing rules ("SMS only through notify-svc; never Twilio directly"), region rules ("only in eu-west-1"), skipped prerequisites ("load test can follow next sprint"), page-defined terms ("PHI here means name, address, phone …", parenthetical and dash lists), disjunctive sinks ("logs, traces or analytics"), noun prohibitions ("No direct access (psql, DB console) …"), conditional prohibitions ("without prior notice" — a deferred notice does not comply), a Korean↔English engineering glossary, direction (importing a CSV is not exporting), and a larger technology catalogue (payments, search, storage, CDN, schedulers, maps).

**What this means.** Explicit technology choices, rejected vendors and well-formed rules are caught with quotes on both sides. On an unseen company, roughly 6 in 10 conflicts still need judgement — mostly rules about timing ("only after the return window closes"), indirect actions ("bulk UPDATE instead of the service") and implied data. That is the design boundary: every check also returns the **related decisions** it could not judge, and the calling agent (Claude Code, Cursor, Rovo) reads them. Precision on unseen data is ~0.7, so Jira auto-comments quote both sides and say *why*, which makes a wrong flag cheap to dismiss.

## Shipped pipeline: deterministic, zero AI cost (original dev benchmark)
Precedent ships **without any LLM calls**. Extraction reads the structure teams already use for ADRs and meeting notes (`src/lib/parse.js`); checks combine explicit rejections with a small technology-category knowledge base (`src/lib/rules.js`, `src/lib/tech.js`). Deeper judgement is delegated to the agent that is already in the loop — Claude Code, Cursor or Rovo — through the MCP/Rovo tools, which return the flagged conflicts **and** the related decisions to reason about.

Run it yourself, free and offline:
```bash
node eval/run_rules.mjs --verbose
```

### Conflict check — 69 labelled work items, 19 decisions
Decisions: 7 parsed from the live Confluence ADRs/meeting notes (`eval/pages.json`) + 12 distractors.
Cases: obvious conflicts, paraphrases (Amazon MSK ⇒ Kafka, Couchbase ⇒ document DB, Apollo ⇒ GraphQL, Firebase Auth ⇒ Auth0 category), negations, conflicts buried in long chore tickets, scoped exceptions (internal tools, JSONB), research spikes, migrations away from rejected tools, superseded decisions, multi-decision conflicts, and 7 Korean tickets against English decisions.

| Pipeline | Precision | Recall | F1 | Cost per check |
|---|---|---|---|---|
| Rules v1 | 0.969 | 0.721 | 0.827 | $0 |
| **Rules v2 (shipped)** — sentence split fix, negated-partner exception, Korean aliases, prohibition clauses | **1.000** | **0.814** | **0.897** | **$0** |

Zero false alarms. The 8 remaining misses are obligation-style rules that keywords can't judge ("every money-moving endpoint must require an Idempotency-Key", "PII must never be written to logs", "ledger PRs need two approvals") — exactly the cases handed to the calling agent as *related decisions*.

### End-to-end with Claude Code (MCP)
Prompt: *"Store transaction history in MongoDB so we can keep arbitrary fields without migrations."*
`check-plan` → **STOP** quoting ADR-001. Claude Code wrote no code, cited the ADR and its URL, also applied the related meeting-notes decision ("new features go into the existing ledger service"), and proposed a JSONB column — the alternative the same ADR allows. Transcript: `../demo_run2.jsonl`.

## What we tried first: LLM extraction and checking (Forge LLMs)
Before shipping, the same 69 cases were run through an LLM pipeline (Forge LLMs, quote-verified structured output) on the deployed app:

| Model | Precision | Recall | F1 |
|---|---|---|---|
| Haiku 5.5 (baseline prompt, 45 cases) | 0.875 | 1.000 | 0.933 |
| Haiku 5.5 (scope-aware prompt) | 0.962 | 0.992 | 0.977 |
| Sonnet 5.5 | 1.000 | 0.984 | 0.992 |
| Opus 5.5 | 1.000 | 0.984 | 0.992 |

LLMs catch the obligation-style cases rules miss, but every check is billed to the app developer, Atlassian AI moderation refuses some tickets (personal data), and per-tenant token limits apply. Since every Precedent surface that matters for agents already has an LLM on the calling side, we moved judgement there and kept the app free to run. The biggest lesson carried over: **scope beats model size** — extracting each decision's exceptions and revisit conditions fixed more false alarms than switching to a larger model.
