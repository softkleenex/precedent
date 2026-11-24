# Precedent — Privacy policy

_Last updated: 2026-11-25_

Precedent is a Forge app that runs entirely on Atlassian infrastructure ("Runs on Atlassian").

**What it reads.** Confluence pages labelled `decision`, `decisions`, `adr` or `architecture-decision` (or titled ADR/Decision), and the summary/description of Jira issues it checks.

**What it stores.** Short excerpts of those pages (decision sentence, rejected alternatives, page title, URL, date) and cached check results, in the app's own Forge storage inside your Atlassian site. It does not store user account IDs, emails or credentials.

**What it sends elsewhere.** Nothing. The app declares no external egress and calls no AI model or third-party service; all checks are deterministic rules running inside Forge.

**Retention.** Data is removed when the source page is removed from Precedent (Sources tab) or when the app is uninstalled, following Forge storage deletion rules.

**Contact.** Open an issue at https://github.com/softkleenex/precedent/issues
