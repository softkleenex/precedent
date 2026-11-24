# Evaluation results

All numbers come from the **deployed** Forge app (development environment), called through a secret-protected web trigger, so they measure the real prompt, model, retrieval and quote-verification path.

## Conflict check — 69 labelled work items, 20 decisions
Decisions: 8 extracted live from Confluence ADRs/meeting notes + 12 distractors (money representation, IaC, observability, flags, time zones, mobile, PII, CI, language, caching, code review, email).
Cases: obvious conflicts, paraphrases (Amazon MSK ⇒ Kafka, Couchbase ⇒ document DB, Apollo ⇒ GraphQL, Firebase Auth ⇒ own auth), negations ("document that we will *not* use MongoDB"), conflicts buried in long chore tickets, scoped exceptions (internal tools, JSONB), research spikes, superseded decisions, multi-decision conflicts, and 7 Korean tickets against English decisions.
Scoring: a finding counts if its decision id and relation (conflicts / revisits) match the label; "follows" is context and is not scored. Pairs labelled *acceptable* (defensible either way) are ignored.

### Iterations
| Version | Change | Model | Precision | Recall | F1 |
|---|---|---|---|---|---|
| v1 (45 cases) | baseline prompt | Haiku 5.5 | 0.875 | 1.000 | 0.933 |
| v2 (45 cases) | extract `exceptions` + `revisitWhen`; prompt respects scope, ignores spikes | Haiku 5.5 | 0.933 | 1.000 | 0.966 |
| v4 (69 cases ×3) | +24 hard cases, PII moderation fallback | Haiku 4.5 | 0.976 | 0.984 | 0.980 |
| v4 | | Haiku 5.5 | 0.962 | 0.992 | 0.977 |
| v4 | | Sonnet 5.5 | **1.000** | 0.984 | **0.992** |
| v4 | | Opus 5.5 | **1.000** | 0.984 | **0.992** |
| v5 (69 cases ×1) | top-15 retrieval (smaller prompt) | Haiku 5.5 | 1.000 | 1.000 | 1.000 |

v4 recall misses for Sonnet/Opus were rate-limit errors (Forge LLM per-tenant token limit), not wrong answers.
v5 is a single run: treat it as "no regression from the smaller prompt", not as a perfect model.

### Model choice
Sonnet 5.5 and Opus 5.5 had zero false alarms but cost 4× and 8× more per token than Haiku 5.5; Opus is also ~3× slower (p50 4.6 s vs 1.6 s).
Precedent ships with **Haiku 5.5**: its occasional extra finding is filtered by the quote gate or is a defensible adjacent decision, and it keeps the developer's Forge LLM bill low.

### Findings that changed the product
- **Scope matters more than model size.** The biggest gain (v1→v2) came from extracting each decision's exceptions and revisit conditions, not from a bigger model.
- **Atlassian AI moderation blocks some prompts.** Tickets containing personal data (name + date of birth + passport number) are refused as PII. Precedent now reports this in the panel and falls back to keyword-matched related decisions.
- **Per-tenant token limits exist** (500k tokens per model per window in development). The daily call cap and content-hash caching keep normal use far below it.

## Decision extraction — 8 pages ×2
Pages: a retro with no decisions, an accepted ADR with a rejected alternative, a superseded ADR, meeting notes with numbered decisions and a deferred item, a Korean ADR, a proposal, coding conventions, and a scoped ADR.
Checks: decision count range, key facts present, rejected options captured, status (superseded / proposed), scope exceptions captured.

| Model | Pages fully correct |
|---|---|
| Haiku 5.5 | 16/16 after relabelling e02 (the extra decision, "secrets rotate every 90 days", is legitimate) |

Hallucination guard: across all extraction runs, 0 decisions were dropped for a missing quote on real Confluence pages.

## Reproduce
```bash
python3 eval/run.py claude-haiku-5-5 --repeat 3 --tag mine
python3 eval/run_extract.py claude-haiku-5-5
```
Cost note: Forge LLM usage is billed to the app developer; a 69-case run costs about $0.15 on Haiku 5.5 and about $1.30 on Opus 5.5.
