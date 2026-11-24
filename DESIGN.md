# Design notes

## References
- Atlassian Design System tokens and patterns via Forge UI Kit (`@forge/react` 12): `xcss` with ADS tokens (`elevation.surface.raised`, `color.border.danger`, `color.background.accent.blue.subtlest`, `space.*`, `border.radius.*`), `Lozenge`, `SectionMessage`, `DynamicTable`, `Modal`, `TagGroup`, `CodeBlock`, `EmptyState`.
- Forge skills (`forge-app-builder` → UI Kit reference) and the ADS MCP server, installed per project with `forge skills install`.
- ECC `frontend-design-direction` design contract (purpose → audience → tone → one memorable detail → states).

## Contract
| | |
|---|---|
| Purpose | Tell a developer, in two seconds, whether this work contradicts something the team already decided — and show exactly where. |
| Audience | Engineers and tech leads in Jira/Confluence every day; coding agents via MCP. |
| Tone | Quiet, dense, Atlassian-native. No custom colours outside ADS tokens. |
| Memorable detail | The **collision card**: the sentence from the work and the sentence from the decision, stacked, colour-coded (neutral = your text, blue = the decision), with a one-line reason that names the paraphrase ("MSK is Kafka, which was explicitly rejected"). |

## States
| Surface | Loading | Empty | Error | Clear | Conflict |
|---|---|---|---|---|---|
| Issue panel | spinner + "Checking…" | "No decisions recorded yet" + how to label pages | message + Try again | green "Consistent" + related decisions | red count lozenge + collision cards |
| Registry | "–" stat tiles | EmptyState with labelling guidance; "No decision matches" for searches | SectionMessage | — | Try it tab shows collision cards |

## Severity colours
- Conflict (different choice in a decided category) → `removed` lozenge, `color.border.danger`.
- Rejected option revisited → `moved` lozenge, `color.border.warning`.
