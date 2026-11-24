---
name: precedent-check
description: Check work against the team's recorded decisions (ADRs, design docs). Use before proposing a technology, library, architecture or process change, and when reviewing a Jira issue or implementation plan.
---

1. Before recommending a technology, library, data store, architecture or process, call `search-decisions` with the topic.
2. Before work starts on a plan, call `check-plan` with a few sentences describing the plan.
3. If the result starts with STOP, tell the user which decision conflicts, quote it, and link the source page. Ask whether to change the plan or revisit the decision. Do not silently proceed.
4. Never claim a decision exists unless a tool returned it.
