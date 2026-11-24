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
