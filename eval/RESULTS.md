# Evaluation results

## Shipped pipeline: deterministic, zero AI cost
Precedent ships **without any LLM calls**. Extraction reads the structure teams already use for ADRs and meeting notes (`src/lib/parse.js`); checks combine explicit rejections with a small technology-category knowledge base (`src/lib/rules.js`, `src/lib/tech.js`). Deeper judgement is delegated to the agent that is already in the loop — Claude Code, Cursor or Rovo — through the MCP/Rovo tools, which return the flagged conflicts **and** the related decisions to reason about.

Run it yourself, free and offline:
```bash
node eval/run_rules.mjs --verbose
```

### Conflict check — 69 labelled work items, 20 decisions
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
