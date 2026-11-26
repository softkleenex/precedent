# Held-out eval set (Tidewell Home Care)

Fictional company: **Tidewell Home Care**, a SaaS platform that lets home-health agencies schedule nurse and caregiver visits to patients' homes (auto-scheduler, EVV clock-in, care plans, payroll export, patient SMS reminders). It runs on GCP with Python services and React / React Native apps.

The author wrote this set without reading the tool's source, tests, results, or rule runner. `eval/pages.json` and `eval/cases.json` were opened only to copy the file format. Nothing in this set is shared with them: not the company, the domain, the decisions, or the wording.

## Format notes
- `pages.json`: 12 pages, ids `4100231`–`4100242`. Every page holds exactly one decision.
- `cases.json`: 80 cases. Labels use **bare page ids**, as the brief asked. The original `eval/cases.json` uses `pageId:index`. If the harness expects that form, append `:1` to every label, since each page has one decision.

## Pages
| id | page | kind | decision |
|---|---|---|---|
| 4100231 | ADR-004 | ADR, tech choice | Google Cloud Pub/Sub for messaging. Kafka (self-hosted, Confluent, MSK) and RabbitMQ were rejected |
| 4100232 | ADR-006 | ADR, tech choice + scoped exception | HERE for geocoding/routing. Google Maps Platform, Mapbox and OSRM were rejected. Mobile apps may use native maps for display only |
| 4100233 | 2026-03-19 Platform sync | meeting notes, tech choice | Self-hosted Unleash for feature flags. LaunchDarkly, Split and Optimizely were rejected |
| 4100234 | ADR-009 | ADR, **superseded** | Twilio for patient SMS (superseded by ADR-018) |
| 4100235 | ADR-018 | ADR, prohibition + scope | All patient messaging goes through notify-svc. No direct Twilio/Vonage/SNS/SES/SendGrid. PagerDuty and internal alerts are out of scope |
| 4100236 | Handbook: PHI in logs | policy, prohibition + exception | No PHI in logs, metrics, traces, Sentry or analytics. The clinical-audit trail is exempt |
| 4100237 | ADR-012 | ADR, obligation | Writes to visits, care plans and medications must emit an AuditEvent |
| 4100238 | 2026-08-14 Backend guild | meeting notes, obligation | Expand/contract migrations. No rename, drop or retype of a column that is still in use, all in one release |
| 4100239 | Mobile guild sync 2026-09-02 | meeting notes, prohibition | Tokens go only in Keychain/Keystore. Never in AsyncStorage, MMKV, SharedPreferences or files |
| 4100240 | Architecture review 2026-10-07 | meeting notes, tech choice + exception | Temporal for background and recurring work. No Celery, BullMQ/RQ, crontab or K8s CronJob. One-off K8s Jobs are allowed |
| 4100241 | ADR-021 | ADR, **proposed** | Replace Elasticsearch with Postgres FTS (not yet accepted) |
| 4100242 | Handbook: integration standards | policy, tech choice + exception | New EHR integrations use FHIR R4. No new HL7 v2, CSV or SFTP. The existing 837 SFTP feed is exempt |

The two handbook pages (4100236, 4100242) do not use a "Decision" heading or a "Decision:" bullet. They state the rule under "The rule" and "Standard", the way handbook pages usually do. The ADR-021 page uses "Proposal".

## Cases (80)
| category | ids | count |
|---|---|---|
| **Conflicting** | t01–t36 | **36** |
| direct / named product | t01, t03, t04, t06, t15, t17, t19, t22, t35 | 9 |
| paraphrase (vendor/product/synonym) | t02 MSK, t05 Mapbox, t07 Split, t08 Twilio-under-ADR-018, t09 SNS, t11 Amplitude/ICD, t18 SharedPreferences, t20 CronJob, t21 BullMQ, t23 HL7 ADT, t24 Mixpanel, t31 Confluent, t33 Datadog | 13 |
| obligation violated indirectly | t10, t12, t13, t14, t16, t36 | 6 |
| buried in long chore ticket | t27, t28, t29, t30 | 4 |
| multi-decision | t25 (notify + audit), t26 (notify + Temporal) | 2 |
| Korean (also counted above) | t31–t36 | 6 |
| **Non-conflicting** | t37–t80 | **44** |
| unrelated | t37–t42, t75 | 7 |
| rejected option negated / migrated away / researched | t43, t44, t45, t46, t47, t48, t57, t72, t74 | 9 |
| inside an exception scope | t49 (MapKit display), t50 & t78 (one-off K8s Job), t51 (PHI in audit trail), t52 (837 SFTP), t53 (PagerDuty) | 6 |
| complies with obligation / chosen tech | t54, t55, t56, t58, t59, t60, t61, t62, t76, t77, t79, t80 | 12 |
| same topic, fine | t63, t64, t65, t66, t67, t68, t71, t73 | 8 |
| proposed decision (acceptable only) | t69, t70 → `acceptable: [4100241]` | 2 |
| Korean (also counted above) | t48, t75–t80 | 7 |

Korean cases total 13. The superseded ADR-009 (4100234) never appears as a label. t08 uses Twilio, which is what ADR-009 prescribed, but it conflicts with ADR-018. t43 and t72 mention Twilio while moving away from it.

## Borderline cases
- **t45**: a spike that calls Google and Mapbox in a notebook with trial keys. It is labelled clean because it is research with no production change. A strict reviewer might still flag ADR-006.
- **t20**: the weekly digest runs as a K8s CronJob. The Temporal exception covers only *one-off* Jobs, so a recurring CronJob conflicts.
- **t16, t29, t36**: the H violations sit in the timing ("same release"). Neither the word "migration rule" nor "backward compatible" appears in the ticket text.
- **t14**: the raw UPDATE skips VisitService. The ticket never says "audit". It says "No events needed".
- **t24**: publishing to Pub/Sub is compliant (ADR-004). Only the Mixpanel PHI part conflicts.
- **t51**: puts PHI into the audit payload. This is fine because of the handbook exception, and the ticket says the data is not shipped to Datadog.
- **t69 / t70**: these extend Elasticsearch while ADR-021 is only Proposed. Both are labelled `acceptable` only.
- **t64**: adds `agency_id` to an Amplitude event. An agency is not a patient, so this is not PHI.
