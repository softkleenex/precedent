// Run with: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageToText, adfToText, quoteAppearsIn, rankDecisions, normalise } from '../src/lib/text.js';

test('storageToText keeps paragraph boundaries and decodes entities', () => {
  const t = storageToText('<p>We use <strong>PostgreSQL</strong> &amp; JSONB.</p><ul><li>MongoDB: rejected</li></ul>');
  assert.match(t, /We use PostgreSQL & JSONB\./);
  assert.match(t, /- MongoDB: rejected/);
});

test('adfToText flattens Jira descriptions', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use Kafka' }] }] };
  assert.equal(adfToText(adf).trim(), 'Use Kafka');
});

test('quoteAppearsIn tolerates quotes, dashes and whitespace but not invention', () => {
  const src = 'We use PostgreSQL as the single system of record — no “MongoDB”.';
  assert.ok(quoteAppearsIn('we use postgresql as the single system of record', src));
  assert.ok(quoteAppearsIn('single system of record - no "MongoDB"', src));
  assert.ok(!quoteAppearsIn('We use MongoDB as the single system of record', src));
  assert.ok(!quoteAppearsIn('short', src));
});

test('quoteAppearsIn works for Korean text', () => {
  const src = '거래 이력을 MongoDB 컬렉션에 저장해 스키마 변경 없이 관리하려고 합니다.';
  assert.ok(quoteAppearsIn('거래 이력을 MongoDB 컬렉션에 저장해', src));
});

test('rankDecisions puts the relevant decision first', () => {
  const ds = [
    { id: 'a', title: 'Email via SES', decision: 'Use Amazon SES', keywords: ['email'] },
    { id: 'b', title: 'Queue: SQS', decision: 'Use SQS not Kafka', alternativesRejected: ['Kafka'], keywords: ['queue', 'kafka'] },
  ];
  assert.equal(rankDecisions('publish events to Kafka', ds)[0].id, 'b');
});

test('normalise lowercases and strips punctuation', () => {
  assert.equal(normalise('  Hello,  “World”! '), 'hello world');
});
