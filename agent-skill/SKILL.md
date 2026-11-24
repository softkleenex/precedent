---
name: precedent
description: Check your plan against the team's recorded decisions (Confluence ADRs, design docs, meeting notes) before writing code. Use before choosing a technology, data store, library, architecture or process, and before implementing any non-trivial change.
---

# Precedent: respect team decisions

The `precedent` MCP server exposes the team's decisions recorded in Confluence.

## When to use
- Before recommending or adding a technology, library, data store, queue, auth method, API style or process.
- Before implementing any change larger than a small bug fix.
- When the user asks "why do we use X?" or "did we decide on Y?".

## How
1. Search: call `search-decisions` with the topic (e.g. "database", "message queue").
2. Check: write your plan in 2-5 sentences, naming the technologies you intend to use, and call `check-plan`.
3. If the result starts with **STOP**:
   - Do not write the code.
   - Tell the user which decision conflicts, quote the decision, and link the source page.
   - Offer options: change the plan to comply, or open a discussion to revisit the decision.
4. If the result starts with **OK**, proceed, and mention any decisions the plan follows.

Never claim a decision exists unless a tool returned it.
