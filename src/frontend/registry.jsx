// Confluence global page: the decision registry, page sync and settings.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Link,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Toggle,
  Label,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const STATUS = { accepted: 'success', superseded: 'removed', proposed: 'inprogress' };

function DecisionsTab({ decisions }) {
  if (decisions.length === 0) {
    return (
      <EmptyState
        header="No decisions yet"
        description='Label pages with "decision" or "adr" (or title them "ADR-…"), then press Sync on the Sources tab.'
      />
    );
  }
  const head = {
    cells: [
      { key: 'title', content: 'Decision' },
      { key: 'rejected', content: 'Rejected options' },
      { key: 'status', content: 'Status' },
      { key: 'date', content: 'Date' },
      { key: 'source', content: 'Source' },
    ],
  };
  const rows = decisions.map((d) => ({
    key: d.id,
    cells: [
      {
        key: 'title',
        content: (
          <Stack space="space.050">
            <Text weight="bold">{d.title}</Text>
            <Text size="small">{d.decision}</Text>
          </Stack>
        ),
      },
      { key: 'rejected', content: <Text size="small">{(d.alternativesRejected || []).join(', ') || '—'}</Text> },
      { key: 'status', content: <Lozenge appearance={STATUS[d.status] || 'default'}>{d.status}</Lozenge> },
      { key: 'date', content: <Text size="small">{d.date || '—'}</Text> },
      {
        key: 'source',
        content: d.pageUrl ? <Link href={d.pageUrl} openNewTab>{d.pageTitle}</Link> : <Text>{d.pageTitle}</Text>,
      },
    ],
  }));
  return <DynamicTable head={head} rows={rows} rowsPerPage={15} />;
}

function SourcesTab({ onSynced }) {
  const [pages, setPages] = useState(null);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('findPages').then(setPages).catch((e) => setError(e.message));
  }, []);

  // Pages are synced one by one from the browser so each call stays well within
  // the Forge function time limit, and the user sees progress.
  const syncAll = async (force) => {
    setError(null);
    setLog([]);
    const list = await invoke('findPages');
    setPages(list);
    for (let i = 0; i < list.length; i++) {
      setProgress((i + 0.5) / list.length);
      try {
        const r = await invoke('syncPage', { pageId: list[i].id, force });
        setLog((l) => [...l, r]);
      } catch (e) {
        setLog((l) => [...l, { title: list[i].title, error: e.message }]);
      }
    }
    setProgress(null);
    onSynced();
  };

  return (
    <Stack space="space.200">
      <Text>
        Precedent reads Confluence pages labelled decision, decisions, adr or architecture-decision, and pages whose title
        contains "ADR" or "Decision". Pages re-sync automatically when edited.
      </Text>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={progress !== null} onClick={() => syncAll(false)}>
          Sync decision pages
        </Button>
        <Button isDisabled={progress !== null} onClick={() => syncAll(true)}>
          Re-extract all
        </Button>
      </Inline>
      {progress !== null && <ProgressBar value={progress} />}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      {log.map((r, i) => (
        <Text key={i} size="small">
          {r.error
            ? `✗ ${r.title}: ${r.error}`
            : `${r.skipped ? '• unchanged' : '✓ synced'} — ${r.title}: ${r.count} decisions`}
        </Text>
      ))}
      {pages && log.length === 0 && (
        <Stack space="space.050">
          <Heading size="small">{`${pages.length} decision pages found`}</Heading>
          {pages.map((p) => (
            <Text key={p.id} size="small">{`• ${p.title}`}</Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    invoke('getSettings').then(setSettings);
  }, []);
  if (!settings) return <Text>Loading…</Text>;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Toggle
          id="autoComment"
          isChecked={settings.autoComment}
          onChange={async () => setSettings(await invoke('saveSettings', { autoComment: !settings.autoComment }))}
        />
        <Label labelFor="autoComment">Comment on new Jira issues that conflict with a decision</Label>
      </Inline>
      <Text size="small">
        Coding agents (Claude Code, Cursor, …) can query decisions through the Precedent MCP server. See the README for setup.
      </Text>
    </Stack>
  );
}

function App() {
  const [decisions, setDecisions] = useState([]);
  const load = () => invoke('listDecisions').then(setDecisions);
  useEffect(() => {
    load();
  }, []);

  return (
    <Box padding="space.300">
      <Stack space="space.200">
        <Heading size="large">Precedent</Heading>
        <Text>Your team's decisions, checked against new work — for people and coding agents.</Text>
        <Tabs id="precedent-tabs">
          <TabList>
            <Tab>{`Decisions (${decisions.length})`}</Tab>
            <Tab>Sources</Tab>
            <Tab>Settings</Tab>
          </TabList>
          <TabPanel>
            <Box paddingBlock="space.200">
              <DecisionsTab decisions={decisions} />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.200">
              <SourcesTab onSynced={load} />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.200">
              <SettingsTab />
            </Box>
          </TabPanel>
        </Tabs>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
