// Confluence global page: the decision registry.
// Tabs: Decisions (search + detail), Try it (check any text), Sources (sync), Connect agents, Settings.

import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  CodeBlock,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  Pressable,
  ProgressBar,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TagGroup,
  Text,
  TextArea,
  Textfield,
  Toggle,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { FindingCard, Quote, RelatedList, Stat } from './components.jsx';

const STATUS = { accepted: 'success', superseded: 'removed', proposed: 'inprogress' };
const APP_ID = 'd461354f-ea80-4fd5-b6ac-207c677f72cd';
const pageStyle = xcss({ maxWidth: '1120px', paddingInline: 'space.400', paddingBlock: 'space.300' });
const searchStyle = xcss({ width: '320px' });
const titleStyle = xcss({
  backgroundColor: 'color.background.neutral.subtle',
  color: 'color.link',
  fontWeight: 'font.weight.semibold',
  textAlign: 'left',
  padding: 'space.0',
  ':hover': { textDecoration: 'underline' },
});
const statusStyle = xcss({ width: '200px' });

/* ---------- Decisions ---------- */

function Section({ title, children }) {
  return (
    <Stack space="space.050">
      <Text size="small" weight="semibold" color="color.text.subtle">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function DecisionModal({ d, onClose }) {
  return (
    <ModalTransition>
      {d && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>{d.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.200">
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance={STATUS[d.status] || 'default'}>{d.status}</Lozenge>
                <Text size="small" color="color.text.subtle">
                  {d.date || 'undated'}
                </Text>
              </Inline>
              <Quote caption="As written on the page" decision>
                {d.quote}
              </Quote>
              {d.alternativesRejected?.length > 0 && (
                <Section title="REJECTED OPTIONS">
                  <TagGroup>
                    {d.alternativesRejected.map((a) => (
                      <Tag key={a} text={a} color="redLight" />
                    ))}
                  </TagGroup>
                </Section>
              )}
              {d.exceptions && (
                <Section title="STILL ALLOWED / SCOPE">
                  <Text>{d.exceptions}</Text>
                </Section>
              )}
              {d.revisitWhen && (
                <Section title="REVISIT WHEN">
                  <Text>{d.revisitWhen}</Text>
                </Section>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            {d.pageUrl && (
              <Link href={d.pageUrl} openNewTab>
                {`Open ${d.pageTitle}`}
              </Link>
            )}
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

function DecisionsTab({ decisions }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (decisions || []).filter(
      (d) =>
        (!status || d.status === status.value) &&
        (!q || [d.title, d.decision, ...(d.alternativesRejected || [])].join(' ').toLowerCase().includes(q))
    );
  }, [decisions, query, status]);

  if (decisions === null) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" label="Loading decisions" />
        <Text color="color.text.subtle">Loading decisions…</Text>
      </Inline>
    );
  }
  if (decisions.length === 0) {
    return (
      <EmptyState
        header="No decisions yet"
        description='Label pages "decision" or "adr" (or title them "ADR-…"). They appear here as soon as they are saved, or press Sync now on the Sources tab.'
      />
    );
  }

  const head = {
    cells: [
      { key: 'title', content: 'Decision', isSortable: true, width: 46 },
      { key: 'rejected', content: 'Rejected', width: 20 },
      { key: 'status', content: 'Status', isSortable: true, width: 10 },
      { key: 'date', content: 'Date', isSortable: true, width: 10 },
      { key: 'source', content: 'Source', width: 14 },
    ],
  };
  const rows = visible.map((d) => ({
    key: d.id,
    cells: [
      {
        key: d.title,
        content: (
          <Stack space="space.025">
            <Pressable xcss={titleStyle} onClick={() => setOpen(d)}>
              {d.title}
            </Pressable>
            {!d.decision.startsWith(d.title.replace(/…$/, '')) && (
              <Text size="small" color="color.text.subtle">
                {d.decision}
              </Text>
            )}
          </Stack>
        ),
      },
      {
        key: 'rejected',
        content: d.alternativesRejected?.length ? (
          <TagGroup>
            {d.alternativesRejected.slice(0, 3).map((a) => (
              <Tag key={a} text={a} color="redLight" />
            ))}
          </TagGroup>
        ) : (
          <Text color="color.text.subtlest">—</Text>
        ),
      },
      { key: d.status, content: <Lozenge appearance={STATUS[d.status] || 'default'}>{d.status}</Lozenge> },
      { key: d.date || '', content: <Text size="small">{d.date || '—'}</Text> },
      {
        key: 'source',
        content: d.pageUrl ? (
          <Link href={d.pageUrl} openNewTab>
            {d.pageTitle}
          </Link>
        ) : (
          <Text>{d.pageTitle}</Text>
        ),
      },
    ],
  }));

  return (
    <Stack space="space.200">
      <Inline space="space.150" alignBlock="end" shouldWrap>
        <Box xcss={searchStyle}>
          <Label labelFor="q">Search</Label>
          <Textfield id="q" placeholder="database, Kafka, auth…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Box>
        <Box xcss={statusStyle}>
          <Label labelFor="status">Status</Label>
          <Select
            inputId="status"
            isClearable
            placeholder="Any status"
            value={status}
            onChange={setStatus}
            options={['accepted', 'superseded', 'proposed'].map((s) => ({ label: s, value: s }))}
          />
        </Box>
      </Inline>
      {visible.length === 0 ? (
        <Text color="color.text.subtle">No decision matches this search.</Text>
      ) : (
        <DynamicTable head={head} rows={rows} rowsPerPage={12} />
      )}
      <DecisionModal d={open} onClose={() => setOpen(null)} />
    </Stack>
  );
}

/* ---------- Try it ---------- */

const SAMPLES = [
  'Set up an Amazon MSK cluster and publish payment events to a topic so other teams can subscribe.',
  'Expose an Apollo GraphQL endpoint for partners to query accounts in one round trip.',
  'Add a JSONB metadata column to transactions so partners can send arbitrary fields.',
  'Retry timed-out payouts automatically with a fresh request id on each attempt.',
  '대량 송금 API는 이번 스프린트에 멱등성 키 검증 없이 먼저 출시합니다.',
];

function TryTab() {
  const [text, setText] = useState(SAMPLES[0]);
  const [areaKey, setAreaKey] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await invoke('checkText', { text }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.200">
      <Text color="color.text.subtle">
        Paste a ticket or an implementation plan. It runs the same check Jira runs on new issues and coding agents run
        through the check-plan tool.
      </Text>
      <Inline space="space.100" shouldWrap>
        {SAMPLES.map((s, i) => (
          <Button key={i} spacing="compact" onClick={() => {
            setText(s);
            setAreaKey((k) => k + 1);
          }}>
            {`Example ${i + 1}`}
          </Button>
        ))}
      </Inline>
      <TextArea key={areaKey} defaultValue={text} onChange={(e) => setText(e.target.value)} minimumRows={4} />
      <Inline>
        <Button appearance="primary" isDisabled={busy || text.trim().length < 10} onClick={check}>
          {busy ? 'Checking…' : 'Check against decisions'}
        </Button>
      </Inline>
      {error && (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      {result && (
        <Stack space="space.150">
          {result.findings.length === 0 ? (
            <SectionMessage appearance="success" title="Consistent with recorded decisions">
              <Text>{`${result.considered} decisions checked.`}</Text>
            </SectionMessage>
          ) : (
            result.findings.map((f, i) => <FindingCard key={i} f={f} workLabel="Your text" />)
          )}
          <RelatedList related={result.related} />
        </Stack>
      )}
    </Stack>
  );
}

/* ---------- Sources ---------- */

function SourcesTab({ onSynced }) {
  const [pages, setPages] = useState(null);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('findPages').then(setPages).catch((e) => setError(e.message));
  }, []);

  // Pages sync one by one from the browser so each call stays short and progress is visible.
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
      <Text color="color.text.subtle">
        Pages labelled decision, decisions, adr or architecture-decision, and pages titled "ADR…" or "…Decision…", are
        read whenever they are saved. Precedent copies what the page says — Status, Date, the Decision section,
        Alternatives considered, Revisit when and "Decision:" bullets. It never invents a decision.
      </Text>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={progress !== null} onClick={() => syncAll(false)}>
          Sync now
        </Button>
        <Button isDisabled={progress !== null} onClick={() => syncAll(true)}>
          Re-read all pages
        </Button>
      </Inline>
      {progress !== null && <ProgressBar value={progress} ariaLabel="Sync progress" />}
      {error && (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      {log.map((r, i) => (
        <Text key={i} size="small">
          {r.error
            ? `✗ ${r.title}: ${r.error}`
            : `${r.skipped ? '• unchanged' : '✓ read'} — ${r.title}: ${r.count} ${r.count === 1 ? 'decision' : 'decisions'}`}
        </Text>
      ))}
      {pages && log.length === 0 && (
        <Stack space="space.050">
          <Heading size="xsmall">{`${pages.length} source pages`}</Heading>
          {pages.map((p) => (
            <Text key={p.id} size="small">{`• ${p.title}`}</Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/* ---------- Connect agents ---------- */

const MCP_JSON = `{
  "mcpServers": {
    "precedent": {
      "type": "http",
      "url": "https://mcp.atlassian.com/forge/${APP_ID}"
    }
  }
}`;

const CLAUDE_MD = `## Team decisions
Before choosing a technology, data store, library or architecture, call search-decisions.
Before writing code for a non-trivial change, summarise the plan and call check-plan.
If it returns STOP, don't write the code: quote the decision, link it, and ask the user.`;

function AgentsTab() {
  return (
    <Stack space="space.250">
      <Text color="color.text.subtle">
        Give Claude Code, Cursor or any MCP client the same decisions your team sees. Tools run with the signed-in user's
        own Atlassian permissions.
      </Text>
      <Stack space="space.100">
        <Heading size="xsmall">1. Enable tools (site admin, once)</Heading>
        <Text>Administration → Apps → Sites → Connected apps → Precedent → Expose tools to MCP-compatible apps.</Text>
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">2. Add the server to the repository's .mcp.json</Heading>
        <CodeBlock language="json" text={MCP_JSON} showLineNumbers={false} />
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">3. Tell the agent when to use it (CLAUDE.md or AGENTS.md)</Heading>
        <CodeBlock language="text" text={CLAUDE_MD} showLineNumbers={false} />
      </Stack>
      <Stack space="space.100">
        <Heading size="xsmall">Tools</Heading>
        <Text>search-decisions · get-decision · check-plan (returns STOP, REVIEW or OK) · check-issue</Text>
      </Stack>
    </Stack>
  );
}

/* ---------- Settings ---------- */

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    invoke('getSettings').then(setSettings);
  }, []);
  if (!settings) return <Text>Loading…</Text>;
  return (
    <Inline space="space.100" alignBlock="center">
      <Toggle
        id="autoComment"
        isChecked={settings.autoComment}
        onChange={async () => setSettings(await invoke('saveSettings', { autoComment: !settings.autoComment }))}
      />
      <Label labelFor="autoComment">Comment on new Jira issues that conflict with a decision</Label>
    </Inline>
  );
}

/* ---------- Page ---------- */

function App() {
  const [decisions, setDecisions] = useState(null);
  const [stats, setStats] = useState(null);
  const load = () => {
    invoke('listDecisions').then(setDecisions);
    invoke('getStats').then(setStats);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <Box xcss={pageStyle}>
      <Stack space="space.300">
        <Stack space="space.100">
          <Heading size="large">Precedent</Heading>
          <Text color="color.text.subtle">
            Your team already decided. Precedent makes sure people — and coding agents — remember.
          </Text>
        </Stack>
        <Inline space="space.150" shouldWrap>
          <Stat value={stats ? stats.decisions : '–'} label="Decisions" />
          <Stat value={stats ? stats.pages : '–'} label="Source pages" />
          <Stat value={stats ? stats.rejected : '–'} label="Rejected options tracked" />
          <Stat value={stats ? stats.flagged : '–'} label="Issues flagged" />
        </Inline>
        <Tabs id="precedent-tabs">
          <TabList>
            <Tab>Decisions</Tab>
            <Tab>Try it</Tab>
            <Tab>Sources</Tab>
            <Tab>Connect agents</Tab>
            <Tab>Settings</Tab>
          </TabList>
          <TabPanel>
            <Box paddingBlock="space.250">
              <DecisionsTab decisions={decisions} />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.250">
              <TryTab />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.250">
              <SourcesTab onSynced={load} />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.250">
              <AgentsTab />
            </Box>
          </TabPanel>
          <TabPanel>
            <Box paddingBlock="space.250">
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
