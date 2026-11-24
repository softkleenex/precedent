# Precedent

**Your team already decided. Precedent makes sure people — and coding agents — remember.**

Teams record decisions in Confluence: ADRs, design docs, meeting notes. Then a new Jira issue proposes MongoDB for the ledger the team ruled out in February, or a coding agent happily wires up Kafka the team rejected in March. Nobody notices until review — or production.

Precedent is a Forge app that turns those pages into a quote-backed decision registry and checks new work against it, wherever the work starts:

| Where work starts | What Precedent does |
|---|---|
| A Jira issue is created | Checks it, and comments if it conflicts with a decision, quoting both sides |
| You open a Jira issue | Issue panel shows conflicts, rejected options being revisited, and decisions it follows |
| Claude Code / Cursor / any MCP client | `check-plan` tool returns **STOP** with the conflicting decision before code is written |
| Rovo chat | *Decision Keeper* agent answers "why do we use X?" with the source page |

Built entirely on Forge — UI Kit, Forge LLMs (Atlassian-hosted Claude), KVS, product events, `rovo:agent`, `rovo:skill`, `rovo:mcp`. No external servers, no API keys: **Runs on Atlassian** eligible.

## Why trust it: every claim carries a verbatim quote

LLMs make things up. Precedent never shows a decision or a conflict it can't back with text:

1. **Extraction** — the model must return the decision with a verbatim quote from the page. If the quote isn't found in the page, the decision is dropped.
2. **Checking** — every finding must quote the exact words of the issue/plan that collide with the decision. Findings whose quote isn't in the text are dropped.
3. **Scope awareness** — exceptions ("internal tools may use anything") and revisit conditions ("revisit above 5,000 msg/s") are extracted too, so the check doesn't cry wolf on allowed work or on a research spike.

## Measured, not vibes

`eval/` contains 69 labelled work items (English and Korean) against 20 decisions — 8 extracted live from Confluence plus 12 distractors — including paraphrases (Amazon MSK ⇒ Kafka, Couchbase ⇒ document DB), negations, buried conflicts in long tickets, scoped exceptions and multi-decision conflicts. `eval/run.py` drives the **deployed** Forge code path through a secret-protected dev web trigger, repeated 3× per model.

See [`eval/RESULTS.md`](eval/RESULTS.md) for precision/recall per model and what each prompt change fixed.

## Architecture

```
Confluence page created/updated ──► on-page-changed ──► extract (Forge LLM) ──► quote check ──► KVS registry
Jira issue created ───────────────► on-issue-created ─► check (Forge LLM) ───► quote check ──► comment + cache
Jira issue panel (UI Kit) ────────► resolver ─────────► check (cached by content hash)
Rovo agent / rovo:skill / rovo:mcp ─► actions: search-decisions · get-decision · check-plan · check-issue
```

- `src/lib/extract.js` — decision extraction + verification
- `src/lib/check.js` — conflict check, evidence gate, moderation fallback
- `src/lib/text.js` — normalisation, quote matching, keyword retrieval (pure, unit-testable)
- `src/actions.js` — the four tools shared by the agent, the skill and the MCP server
- `src/events.js` — page and issue triggers
- `src/frontend/` — issue panel and Confluence registry page (UI Kit)

### Cost and safety controls
- Forge LLM calls use Claude Haiku and a per-site daily cap.
- Issue checks are cached per issue by content hash; unchanged pages are never re-extracted.
- Reads in the issue panel and actions run `asUser()`, so nobody sees decisions or issues they can't already see.
- If Atlassian's AI moderation declines a prompt (e.g. an issue full of personal data), Precedent says so and falls back to keyword-matched related decisions instead of failing.

## Install (judges / testers)

1. Open the installation link from the Devpost submission and install into Jira (Confluence is connected automatically).
2. In Confluence, label a few pages `decision` or `adr` (or title them `ADR-…`). Precedent syncs them on save; or open **Apps → Precedent — Decisions → Sources → Sync**.
3. Create a Jira issue that contradicts one of them. Watch the comment arrive and open the **Precedent** panel.

### Connect Claude Code (or any MCP client)
1. Site admin: **Administration → Apps → Sites → Connected apps → Precedent → Expose tools to MCP-compatible apps → Enable tools**.
2. Add to your repo's `.mcp.json`:
   ```json
   { "mcpServers": { "precedent": { "type": "http", "url": "https://mcp.atlassian.com/forge/d461354f-ea80-4fd5-b6ac-207c677f72cd" } } }
   ```
3. Run `/mcp` in Claude Code, authenticate, and add the instructions from [`agent-skill/SKILL.md`](agent-skill/SKILL.md) to your `CLAUDE.md`.

## Develop

```bash
npm install
forge deploy -e development
forge install -p Jira -s <site> -e development && forge install -p Confluence -s <site> -e development
python3 eval/run.py claude-haiku-5-5 --repeat 3   # needs the dev web trigger URL + token in ~/.config/precedent/
```

## License
MIT
