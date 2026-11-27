# Held-out set v3 — SkyNest Travel (online travel booking)

Independent, frozen test set. Written without reading `src/`, `test/`, eval scripts, results or earlier held-out sets; `eval/pages.json` / `eval/cases.json` were read only for the JSON format. Labels are bare page ids (each page holds exactly one decision).

## Company

SkyNest Travel: flights (GDS + NDC), hotels (bedbanks/channel managers), car rental, SkyNest loyalty points, partner/affiliate API, payments, support console.

## Pages (15, `pages.json`)

| id | title | kind | lang | notes |
|---|---|---|---|---|
| 6104821 | ADR-009 OpenSearch for hotel/car search | tech (Algolia, Elastic Cloud, Solr rejected) | en | exception: help-center/CMS search out of scope |
| 6112907 | ADR-014 Adyen as PSP | tech (Stripe, Braintree, Checkout.com rejected) | en | exception: Toss Payments for KRW bookings only |
| 6120544 | ADR-021 예약 이벤트 Kafka(MSK) | tech (RabbitMQ, SQS/SNS rejected) | ko | exception: service-internal SQS work queues |
| 6131260 | ADR-006 Xamarin.Forms | **superseded** by ADR-018 | en | must never be a problem label |
| 6131788 | ADR-018 React Native | tech (Flutter, Xamarin, native/KMP rejected) | en | exception: Wallet pass + 3DS native modules |
| 6140032 | RFC-031 GraphQL federation | **proposed** | en | must never be a problem label |
| 6152219 | Mobile & Web weekly sync | tech, meeting notes (Crashlytics, Bugsnag rejected) | en | single "Decision:" bullet |
| 6163045 | Handbook › Supplier connectivity | must go through supplier-gateway | en | exception: content SFTP ingest |
| 6170918 | SEC-03 Cardholder data | data must never leave vault | en | |
| 6182376 | 개인정보 처리 원칙 — 여권 정보 | retention 30 days, no copy to BigQuery/logs | ko | exception: legal hold |
| 6195507 | Release council 2026-07-23 | time window deploy freeze | en | exception: IC-approved hotfix; marketing site out of scope |
| 6203614 | Support Handbook › Refunds | approval above EUR 400 | en | exemption: involuntary auto refunds |
| 6214470 | Loyalty: our approach to points balances | must go through loyalty-ledger API | en | allowed: display cache TTL ≤ 5 min |
| 6226081 | Guideline: onboarding a new supplier | ordered steps (cert → 7-day shadow → sign-off) | en | |
| 6238893 | 고객지원 도구 규칙 — 데이터 내보내기 | limit 200 rows, DPO approval, no Google Sheets | ko | |

Active tech choices 5 + superseded + proposed = 7/15; obligations/prohibitions 8/15. Korean pages: 3.

## Cases (90, `cases.json`)

- Conflicting: 43 (multi-decision: x29, x31, x38). Clean: 47.
- Korean tickets: 23 (11 conflicting, 12 clean).
- Every active decision has ≥2 conflicting tickets; superseded/proposed pages have none.
- Conflict styles: direct vendor mention (x01, x03), paraphrase/SDK names (x10 "FirebaseCrashlytics pod", x12 "amadeus-node SDK"), indirect obligation violations (x13 log full authorize body, x34 card form in localStorage, x26 shadow "in parallel" with live bookings, x43 balance cache TTL 30 min vs 5-min cap), buried in chore lists (x29, x30), exception boundary violated (x05 Toss for JPY).
- Clean styles: unrelated chores (x44, x76, x80, x83), migrating away (x47, x52, x55), research of rejected options (x49, x82), inside an exception (x46, x48, x50, x53, x58, x62, x64, x67, x69, x87), complying (x59, x61, x66, x70, x72, x73, x78, x88), same topic but fine (x45, x51, x75, x77, x86), proposed RFC work (x56), clean chore list (x85).

## Borderline / judgement calls

- **x65** marketing landing page deployed Friday 22:00 — notes say marketing site is out of scope → clean, `acceptable: [6195507]`.
- **x81** Flutter for an internal airport-desk tablet app — ADR-018 covers *customer* apps → clean, `acceptable: [6131788]`.
- **x46** Algolia DocSearch for help-center FAQ — explicit ADR-009 exception → clean, no acceptable.
- **x56** GraphQL gateway prototype — RFC-031 is only proposed → clean.
- **x26** Hotelbeds v3: cert passed, bookings on today, shadow "in parallel" → conflict (guideline forbids skipping/parallel steps).
- **x33** editing a screen in Xamarin.Forms → conflict with ADR-018 (not with superseded ADR-006).
- **x05** Toss Payments reused for JPY → conflict; the PSP exception is KRW-only.
- **x13** dumping the authorize request body "temporarily" → conflict with SEC-03 (card object in logs).
- **x87** 3DS native module fix → clean (ADR-018 exception).
- **x69** balance cached 3 min → clean; **x43** cache TTL 30 min → conflict (5-min cap).
- **x88** removing passport numbers from logs → clean (remediation, complies).
