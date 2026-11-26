# Evaluation results

## Held-out evaluation (v2.3): the honest number
Our first benchmark (69 cases below) was written by the same person who wrote the rules, so its 1.000 / 0.814 says more about fit than about generalisation. For v2.3 we measured the way you should:

1. **Frozen held-out set** (`eval/heldout/`): a separate agent that never saw the rule code wrote 12 Confluence pages for a fictional home-health company (ADRs, meeting notes, handbook pages with "Rule"/"Standard" headings) and 80 labelled tickets (13 in Korean). We recorded its checksums before any tuning and scored it **once**, after the code was frozen. No rule was changed after seeing it.
2. **Red-team rounds** (`eval/redteam_r1.json`, `eval/redteam_r2/`, `eval/redteam_r3/`): an adversarial agent that *did* read the code wrote false-positive traps and false-negative probes, round 2 and 3 in new domains (IoT fleet, e-commerce marketplace). We fixed only what had a general fix (Korean particles, parser headings and negations, scoped exceptions, language rules scoped to backend/firmware/mobile, a structural fallback for "X must not V Y" prohibitions) and recorded each round's first-shot score before fixing.

| Set | Author saw the code? | v2.2 (before) P / R | v2.3 P / R |
|---|---|---|---|
| **Held-out, home health (80 cases)** | **no — scored once** | **0.583 / 0.184** | **0.833 / 0.395** |
| Red team r3, e-commerce (72) | yes | 0.545 / 0.162 | first shot 0.889 / 0.216 → 0.944 / 0.459 after general fixes |
| Red team r2, IoT fleet (71) | yes | 0.571 / 0.229 | first shot 0.563 / 0.257 → 1.000 / 0.943 |
| Red team r1, fintech traps (62) | yes | 0.333 / 0.135 | 1.000 / 0.865 |
| Original dev set, fintech (69) | yes | 1.000 / 0.814 | 1.000 / 0.977 |

Reproduce: `node eval/run_heldout.mjs` (held-out), `node eval/run_heldout.mjs eval/redteam_r3`, `node eval/run_rules.mjs`.

**What this means.** Deterministic rules are reliable on what they can see — explicit technology choices, rejected vendors and paraphrases (MSK ⇒ Kafka), and prohibitions phrased as "X must not V Y" — and they say *why* with both quotes. On decisions they have never seen, most obligation-style rules ("every clinical write emits an audit event", "schema changes stay compatible with the previous release", "tokens only in the Keychain") still need judgement: on the held-out set recall is 0.40. That is the design boundary: every check also returns the **related decisions** it could not judge, and the calling agent (Claude Code, Cursor, Rovo) reads them. The held-out misses are exactly those cases; none of the 3 false alarms came from obligation rules (two were a ticket asking about, or finishing removal of, a rejected tool; one was a rejected tool named in a sentence that rules it out).

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
