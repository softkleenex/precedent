import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisions, sentences } from '../src/lib/parse.js';
import { ruleCheck } from '../src/lib/rules.js';
import { mentionedTechs } from '../src/lib/tech.js';

const adr = {
  id: '1',
  title: 'ADR-002: Use SQS for asynchronous jobs, not Kafka',
  storage:
    '<p><strong>Status:</strong> Accepted &middot; <strong>Date:</strong> 2026-03-04</p><h2>Decision</h2><p>We use Amazon SQS queues for asynchronous work. Kafka was rejected: too much operational load.</p><h2>Revisit when</h2><p>Revisit if we exceed 5,000 messages per second.</p>',
};

test('parseDecisions reads status, date, chosen and rejected options', () => {
  const [d] = parseDecisions(adr);
  assert.equal(d.status, 'accepted');
  assert.equal(d.date, '2026-03-04');
  assert.deepEqual(d.alternativesRejected, ['Kafka']);
  assert.deepEqual(d.chosen, ['SQS']);
  assert.match(d.revisitWhen, /5,000 messages/);
  assert.match(d.quote, /^We use Amazon SQS/);
});

test('sentences keeps Node.js and version numbers intact', () => {
  assert.deepEqual(sentences('Write it in Node.js. Use Python 3.13 now.'), ['Write it in Node.js.', 'Use Python 3.13 now.']);
});

test('aliases map paraphrases to the same technology', () => {
  assert.equal(mentionedTechs('Create an Amazon MSK cluster')[0].name, 'Kafka');
  assert.equal(mentionedTechs('use Apollo Server')[0].name, 'GraphQL');
});

const [sqs] = parseDecisions(adr).map((d) => ({ ...d, id: 'sqs' }));

test('flags adopting a rejected option via paraphrase', () => {
  const r = ruleCheck('Event backbone on Amazon MSK. Publish transfer events to a topic.', [sqs]);
  assert.equal(r.verdict, 'conflict');
  assert.equal(r.findings[0].relation, 'revisits');
  assert.equal(r.findings[0].workQuote, 'Event backbone on Amazon MSK');
});

test('ignores negation, migrations away and research spikes', () => {
  assert.equal(ruleCheck('Document why we do not use Kafka.', [sqs]).verdict, 'clear');
  assert.equal(ruleCheck('Migrate the last Kafka consumer to SQS.', [sqs]).verdict, 'clear');
  assert.equal(ruleCheck('Spike: should we revisit Kafka next year? Analysis only.', [sqs]).verdict, 'clear');
});

test('flags a different technology in the chosen category', () => {
  const r = ruleCheck('Set up RabbitMQ for the webhook workers.', [sqs]);
  assert.equal(r.findings[0].relation, 'conflicts');
});

// Obligation / prohibition decisions (src/lib/policy.js).
const pii = { id: 'pii', title: 'PII', decision: 'PII is encrypted with KMS; PII must never be written to logs.', alternativesRejected: [], status: 'accepted' };
const idem = { id: 'idem', title: 'Idempotency', decision: 'Every endpoint that moves money must require an Idempotency-Key header, and retries must reuse the same key.', alternativesRejected: [], status: 'accepted' };
const prs = { id: 'prs', title: 'Ledger reviews', decision: 'Pull requests that touch the ledger package need two approvals, one from the Platform team.', alternativesRejected: [], status: 'accepted' };

test('flags work that does what a prohibition forbids', () => {
  assert.equal(ruleCheck('Send the customer date of birth and passport number to Sentry.', [pii]).verdict, 'conflict');
  assert.equal(ruleCheck('Mask the date of birth before it is logged.', [pii]).verdict, 'clear');
  assert.equal(ruleCheck('Log the payout id on failure.', [pii]).verdict, 'clear');
});

test('flags skipped or contradicted obligations inside their scope', () => {
  assert.equal(ruleCheck('Refund API: retry a timed-out refund with a fresh request id.', [idem]).verdict, 'conflict');
  assert.equal(ruleCheck('송금 API 재시도 시 멱등성 키는 생략합니다.', [idem]).verdict, 'conflict');
  assert.equal(ruleCheck('Retry payouts and reuse the same Idempotency-Key.', [idem]).verdict, 'clear');
  assert.equal(ruleCheck('Merge the ledger fix with one approval.', [prs]).verdict, 'conflict');
  assert.equal(ruleCheck('Ledger fix merged after two approvals including Platform.', [prs]).verdict, 'clear');
  assert.equal(ruleCheck('Merge the docs typo fix with one approval.', [prs]).verdict, 'clear');
});

test('Korean particles after a Latin product name still match', () => {
  assert.equal(mentionedTechs('Kafka를 도입합니다')[0].name, 'Kafka');
  assert.equal(ruleCheck('결제 이벤트를 Kafka로 발행합니다.', [sqs]).verdict, 'conflict');
});

test('language rules only apply to the part of the system they name', () => {
  const fw = { id: 'fw', title: 'Firmware in Rust', decision: 'New firmware modules are written in Rust; no new C code in the firmware repo.', alternativesRejected: [], chosen: ['Rust'], status: 'accepted' };
  assert.equal(ruleCheck('Write the BLE pairing firmware module in C.', [fw]).verdict, 'conflict');
  assert.equal(ruleCheck('Create the new alerts backend service in Kotlin.', [fw]).verdict, 'clear');
});

test('scoped exceptions and superseded decisions are respected', () => {
  const cert = { id: 'c', title: 'Certs', decision: 'Device certificates must be rotated every 90 days; long-lived certificates are not allowed.', exceptions: 'Devices on the lab bench network are exempt.', alternativesRejected: [], status: 'accepted' };
  assert.equal(ruleCheck('Issue 5-year certificates for gateways.', [cert]).verdict, 'conflict');
  assert.equal(ruleCheck('Issue 2-year certificates for devices on the lab bench network.', [cert]).verdict, 'clear');
  assert.equal(ruleCheck('Set up RabbitMQ for the webhook workers.', [{ ...sqs, status: 'superseded' }]).verdict, 'clear');
});

// v2.5 general mechanisms
const dec = (id, decision, extra = {}) => ({ id, title: extra.title || id, decision, quote: decision, body: decision, alternativesRejected: [], status: 'accepted', ...extra });

test('numeric limits: retention and timeouts, in either language', () => {
  const keep = dec('keep', 'No customer data may be kept longer than 30 days after contract termination or account cancellation.');
  assert.equal(ruleCheck('Keep churned customer workspaces for 12 months after cancellation.', [keep]).verdict, 'conflict');
  assert.equal(ruleCheck('Purge cancelled customer data after 14 days.', [keep]).verdict, 'clear');
  const tmo = dec('tmo', '대시보드 인터랙티브 쿼리의 타임아웃은 60초를 초과할 수 없다.');
  assert.equal(ruleCheck('Raise the interactive dashboard query timeout to 180s.', [tmo]).verdict, 'conflict');
  assert.equal(ruleCheck('예약 리포트 배치 타임아웃을 12분으로 조정.', [tmo]).verdict, 'clear');
});

test('definitions on the page widen the rule ("PHI here means name, address, phone")', () => {
  const phi = dec('phi', 'Protected health information must never be written to application logs, traces or analytics events. PHI here means anything that identifies a patient: name, address, phone, date of birth, MRN.');
  assert.equal(ruleCheck('Add patient_mrn and patient_dob to the log context.', [phi]).verdict, 'conflict');
  assert.equal(ruleCheck('Log the opaque patient_id on errors.', [phi]).verdict, 'clear');
});

test('routing rules: providers must be reached through the named service', () => {
  const via = dec('via', 'All patient SMS and email are sent through notify-svc. No other service may integrate a provider SDK directly; this includes Twilio, Vonage and AWS SNS.');
  assert.equal(ruleCheck('billing-svc: use the Twilio client directly to text the caregiver.', [via]).verdict, 'conflict');
  assert.equal(ruleCheck('Move reminders-worker off Twilio and publish to notify-svc instead.', [via]).verdict, 'clear');
});

test('freeze windows and skipped prerequisites', () => {
  const fz = dec('fz', 'No live-event configuration changes go out between Friday 18:00 and Monday 10:00 KST.');
  assert.equal(ruleCheck('Push the Halloween drop-rate config Saturday morning.', [fz]).verdict, 'conflict');
  assert.equal(ruleCheck('Push the Halloween event config Thursday 15:00 KST.', [fz]).verdict, 'clear');
  const ga = dec('ga', 'Before any connector goes GA, it must pass a load test and an AppSec security review.');
  assert.equal(ruleCheck('Promote the Salesforce connector to GA Friday; the load test can follow next sprint.', [ga]).verdict, 'conflict');
});
