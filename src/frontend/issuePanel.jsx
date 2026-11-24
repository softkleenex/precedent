// Jira issue panel: is this issue consistent with what the team already decided?
// States: loading, error (retry), no decisions yet (empty), clear, conflict.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, EmptyState, Inline, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { FindingCard, RelatedList } from './components.jsx';

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await invoke('getIssueCheck', { force }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run(false);
  }, []);

  if (loading && !result) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" label="Checking" />
        <Text color="color.text.subtle">Checking against your team's decisions…</Text>
      </Inline>
    );
  }
  if (error) {
    return (
      <SectionMessage appearance="error" title="Precedent couldn't check this issue">
        <Stack space="space.100">
          <Text>{error}</Text>
          <Inline>
            <Button onClick={() => run(true)}>Try again</Button>
          </Inline>
        </Stack>
      </SectionMessage>
    );
  }
  if (result.verdict === 'no-decisions') {
    return (
      <EmptyState
        header="No decisions recorded yet"
        description='Label Confluence ADRs or meeting notes with "decision" or "adr". Precedent picks them up as soon as they are saved.'
      />
    );
  }

  const n = result.findings.length;
  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Inline space="space.100" alignBlock="center">
          {n > 0 ? (
            <Lozenge appearance="removed" isBold>{`${n} ${n === 1 ? 'conflict' : 'conflicts'}`}</Lozenge>
          ) : (
            <Lozenge appearance="success" isBold>
              Consistent
            </Lozenge>
          )}
          <Text size="small" color="color.text.subtle">
            {`${result.considered} decisions checked`}
          </Text>
        </Inline>
        <Button appearance="subtle" spacing="compact" isDisabled={loading} onClick={() => run(true)}>
          {loading ? 'Checking…' : 'Re-check'}
        </Button>
      </Inline>
      {result.findings.map((f, i) => (
        <FindingCard key={`${f.decisionId}-${i}`} f={f} />
      ))}
      {n === 0 && <Text color="color.text.subtle">Nothing in this issue contradicts a recorded decision.</Text>}
      <RelatedList related={result.related} />
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
