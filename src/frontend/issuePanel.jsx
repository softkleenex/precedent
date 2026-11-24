// Jira issue panel: shows which team decisions this issue touches.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  EmptyState,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Em,
  Strong,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const RELATION = {
  conflicts: { appearance: 'error', label: 'Conflicts with' },
  revisits: { appearance: 'warning', label: 'Revisits a rejected option in' },
  follows: { appearance: 'information', label: 'Follows' },
};

function Finding({ f }) {
  const r = RELATION[f.relation];
  return (
    <SectionMessage appearance={r.appearance} title={`${r.label}: ${f.decisionTitle}`}>
      <Stack space="space.100">
        <Text>{f.explanation}</Text>
        <Text>
          <Strong>This issue: </Strong>
          <Em>“{f.workQuote}”</Em>
        </Text>
        <Text>
          <Strong>Decision ({f.date || 'undated'}): </Strong>
          <Em>“{f.decisionQuote}”</Em>
        </Text>
        {f.pageUrl ? <Link href={f.pageUrl} openNewTab>Source: {f.pageTitle}</Link> : <Text>Source: {f.pageTitle}</Text>}
      </Stack>
    </SectionMessage>
  );
}

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

  if (loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>Checking this issue against your team's decisions…</Text>
      </Inline>
    );
  }
  if (error) {
    return (
      <SectionMessage appearance="error" title="Precedent couldn't check this issue">
        <Text>{error}</Text>
        <Button onClick={() => run(true)}>Try again</Button>
      </SectionMessage>
    );
  }
  if (result.verdict === 'no-decisions') {
    return (
      <EmptyState
        header="No decisions recorded yet"
        description='Label Confluence pages with "decision" or "adr", then open Precedent in Confluence and press Sync.'
      />
    );
  }

  if (result.verdict === 'unavailable') {
    return (
      <SectionMessage appearance="warning" title="AI check skipped for this issue">
        <Stack space="space.100">
          <Text>
            Atlassian's AI safety filter declined to analyse this issue ({result.reason}). This usually means it contains
            personal data. Remove it from the description and press Re-check.
          </Text>
          {(result.related || []).map((r) => (
            <Text key={r.decisionId}>
              Possibly relevant: {r.pageUrl ? <Link href={r.pageUrl} openNewTab>{r.decisionTitle}</Link> : r.decisionTitle}
            </Text>
          ))}
          <Button onClick={() => run(true)}>Re-check</Button>
        </Stack>
      </SectionMessage>
    );
  }

  const problems = result.findings.filter((f) => f.relation !== 'follows').length;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        {problems > 0 ? (
          <Lozenge appearance="removed" isBold>{`${problems} decision ${problems === 1 ? 'conflict' : 'conflicts'}`}</Lozenge>
        ) : (
          <Lozenge appearance="success" isBold>Consistent with team decisions</Lozenge>
        )}
        <Button appearance="subtle" onClick={() => run(true)}>Re-check</Button>
      </Inline>
      {result.findings.length === 0 && (
        <Text>No recorded decision is affected ({result.considered} relevant decisions checked).</Text>
      )}
      {result.findings.map((f, i) => (
        <Finding key={`${f.decisionId}-${i}`} f={f} />
      ))}
      <Box>
        <Text size="small">
          Every finding is backed by a quote found in this issue and in the source page.
        </Text>
      </Box>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
