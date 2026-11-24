// Shared UI Kit building blocks for the issue panel and the Confluence registry.
// Design direction: quiet, dense, Atlassian-native. The one memorable element is the
// "collision card": the sentence from the work and the sentence from the decision,
// side by side, so the reader sees exactly where they clash.

import React from 'react';
import { Box, Heading, Inline, Link, LinkButton, Lozenge, Stack, Text, Em, xcss } from '@forge/react';

export const RELATION = {
  conflicts: { lozenge: 'removed', label: 'Conflicts with', border: 'color.border.danger' },
  revisits: { lozenge: 'moved', label: 'Revisits a rejected option in', border: 'color.border.warning' },
};

const cardStyle = (border) =>
  xcss({
    borderColor: border,
    borderWidth: 'border.width',
    borderStyle: 'solid',
    borderRadius: 'border.radius.200',
    padding: 'space.200',
    backgroundColor: 'elevation.surface.raised',
    boxShadow: 'elevation.shadow.raised',
  });

const quoteStyle = xcss({
  backgroundColor: 'color.background.neutral',
  borderRadius: 'border.radius.100',
  padding: 'space.150',
  width: '100%',
});

const quoteDecisionStyle = xcss({
  backgroundColor: 'color.background.accent.blue.subtlest',
  borderRadius: 'border.radius.100',
  padding: 'space.150',
  width: '100%',
});

/** One quoted sentence with a small caption above it. */
export function Quote({ caption, children, decision = false }) {
  return (
    <Box xcss={decision ? quoteDecisionStyle : quoteStyle}>
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">
          {caption}
        </Text>
        <Text>
          <Em>“{children}”</Em>
        </Text>
      </Stack>
    </Box>
  );
}

/** The collision card: work sentence vs decision sentence, with source and reason. */
export function FindingCard({ f, workLabel = 'This issue' }) {
  const r = RELATION[f.relation] || RELATION.conflicts;
  return (
    <Box xcss={cardStyle(r.border)}>
      <Stack space="space.150">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance={r.lozenge} isBold>
            {f.relation === 'revisits' ? 'Rejected option' : 'Conflict'}
          </Lozenge>
          <Text weight="semibold">
            {r.label}{' '}
            {f.pageUrl ? (
              <Link href={f.pageUrl} openNewTab>
                {f.decisionTitle}
              </Link>
            ) : (
              f.decisionTitle
            )}
          </Text>
        </Inline>
        <Quote caption={workLabel}>{f.workQuote}</Quote>
        <Quote caption={`${f.pageTitle || 'Decision'} · ${f.date || 'undated'}`} decision>
          {f.decisionQuote}
        </Quote>
        <Inline space="space.100" alignBlock="center" spread="space-between" shouldWrap>
          <Text size="small" color="color.text.subtle">
            {f.explanation}
          </Text>
          {f.pageUrl && (
            <LinkButton href={f.pageUrl} target="_blank" appearance="subtle" spacing="compact">
              Open decision
            </LinkButton>
          )}
        </Inline>
      </Stack>
    </Box>
  );
}

/** Compact list of related decisions that rules didn't flag. */
export function RelatedList({ related }) {
  if (!related?.length) return null;
  return (
    <Stack space="space.075">
      <Text size="small" weight="semibold" color="color.text.subtle">
        RELATED DECISIONS
      </Text>
      {related.map((r) => (
        <Text key={r.decisionId} size="small">
          {r.pageUrl ? (
            <Link href={r.pageUrl} openNewTab>
              {r.decisionTitle}
            </Link>
          ) : (
            r.decisionTitle
          )}
          {` — ${r.decision}`}
        </Text>
      ))}
    </Stack>
  );
}

const statStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'border.radius.200',
  padding: 'space.200',
  minWidth: '140px',
});

/** A single number tile for the registry header. */
export function Stat({ value, label }) {
  return (
    <Box xcss={statStyle}>
      <Stack space="space.050">
        <Heading size="large">{String(value)}</Heading>
        <Text size="small" color="color.text.subtle">
          {label}
        </Text>
      </Stack>
    </Box>
  );
}
