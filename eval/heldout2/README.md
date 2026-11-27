# Held-out set v2: university LMS ("Coursewell", fictional)

Built independently of `src/`, `test/`, the earlier eval sets and their results. The tool was never run while this set was being written. Freeze it and run it once.

## Company
Coursewell is a fictional LMS sold to universities. It covers courses, gradebooks, lecture video, remote proctoring, SIS sync and student records, and its tenants teach in English and Korean. The stack: Python, Kong gateway, Temporal, OpenSearch, Unleash, Postmark, Honorlock, Amplitude/Segment.

## Pages (`pages.json`): 15, one decision each
| id | title | kind |
|---|---|---|
| 5201101 | ADR-004 OpenSearch (rejected Algolia, Elastic Cloud, Postgres FTS); exception: exact-ID back-office lookups | tech choice |
| 5201102 | ADR-006 Temporal (rejected Celery, Step Functions, Airflow); exception: short tasks on RQ | tech choice |
| 5201103 | ADR-009 Proctorio: **Superseded** | tech choice |
| 5201104 | ADR-015 Honorlock replaces Proctorio (rejected ProctorU, Examity, in-house) | tech choice |
| 5201105 | Korean meeting notes: all outgoing mail via Postmark (rejected SendGrid, SES, Mailgun) | tech choice |
| 5201106 | ADR-011 Unleash (rejected LaunchDarkly, Flagsmith) | tech choice |
| 5201107 | Release Standard: features behind a flag, off by default; exceptions: copy/translation, security, restoring documented behaviour | obligation |
| 5201108 | Published grade changes need a second approver; exception: answer-key regrade that only raises scores | obligation |
| 5201109 | Student records are never exported to spreadsheets or email attachments; exception: aggregates with at least 10 students per cell | prohibition |
| 5201110 | Korean 원칙: every video goes through the media pipeline and is never served raw; exception: external embeds | obligation |
| 5201111 | Korean 규칙: no PII in analytics events; exception: internal audit/security logs | prohibition |
| 5201112 | API guild meeting notes: new gateway endpoints need a rate limit; exception: internal mesh endpoints | obligation |
| 5201113 | ADR-017 LTI 1.3 only: **Proposed** | obligation |
| 5201114 | Captions required before a recorded lecture is published; exception: live sessions, with reviewed captions within 48h | obligation |
| 5201115 | No direct writes to production student data; exception: break-glass with IC approval | prohibition |

That gives 6 technology choices (40%), 9 obligations or prohibitions, 1 superseded page, 1 proposed page and 9 scoped exceptions. Two pages are written entirely in Korean, and one is Korean meeting notes.

## Cases (`cases.json`): 90
- 41 conflicting (u01–u41) and 49 clean (u42–u90).
- 23 Korean tickets (26%), spread across both groups.
- Multi-decision cases: u12 (GRADE + DB) and u26 (FLAG + RL + PII).
- Conflicts buried in long chore tickets: u24 (Mixpanel PII), u25 (xlsx export), u37 (captions, in Korean).
- Indirect obligation violations: u11, u27 and u35 (grade-change paths), u31 (raw files module), u32 (SQL console), u41 (dropping caption review).
- Rejected option named directly: u01, u06, u07, u09, u28, u33, u34, u36 (Flagsmith), u39 (Airflow).
- Clean but on the same topic: research spikes (u46, u90), migrating away (u47, u48, u51, u82), inside an exception (u50, u53–u56, u59, u61, u62, u65, u68, u69, u74, u89), complying (u45, u49, u52, u57, u70, u73, u76, u83).
- The labels never contain 5201103 (superseded) or 5201113 (proposed) as `problems`.

## Borderline (put in `acceptable`, not in `problems`)
- **u16**: streaming the raw upload is a clear media-pipeline violation. It also lets students watch a lecture before it has captions, so CAP (5201114) is acceptable.
- **u31**: lecture mp4s streamed from the Files module break MED. Uncaptioned publishing is implied, so CAP is acceptable.
- **u71**: a new LTI 1.1 integration conflicts only with the *proposed* ADR-017, so 5201113 is acceptable. The case's `problems` is empty.
- **u88**: students downloading **their own** grades as CSV. The rule was written about staff exports, so whether it applies is unclear; 5201109 is acceptable.

Other judgment calls, all labelled clean:
- u62: YouTube embeds fall under the explicit external-embed exception, and the videos have their own captions.
- u75: read-only queries on the replica are explicitly allowed.
- u43, u58, u76, u77 and u83: user-facing features that state they ship behind a flag.
- Clean tickets that simply don't mention a flag are not marked as FLAG violations. Only tickets that explicitly release to everyone, or say no toggle is needed, are labelled (u10, u26, u30).
- u05 and u40 (Proctorio) are labelled against the current ADR-015 (5201104), not the superseded ADR-009.
