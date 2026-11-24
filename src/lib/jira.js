// Jira access: read an issue's text and post Precedent's findings as a comment.

import api, { route } from '@forge/api';
import { adfToText } from './text.js';

/** Summary + description of an issue as plain text. */
export async function readIssueText(issueKey, { asUser = false } = {}) {
  const requester = asUser ? api.asUser() : api.asApp();
  const res = await requester.requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not read issue ${issueKey} (${res.status})`);
  const issue = await res.json();
  const summary = issue.fields?.summary || '';
  const description = adfToText(issue.fields?.description).trim();
  return `${summary}\n\n${description}`.trim();
}

/** Build an ADF comment listing conflicts, with links back to the source pages. */
function commentBody(findings) {
  const problems = findings.filter((f) => f.relation !== 'follows');
  const items = problems.map((f) => ({
    type: 'listItem',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: f.relation === 'conflicts' ? 'Conflicts with ' : 'Revisits a rejected option in ' },
          {
            type: 'text',
            text: f.decisionTitle,
            marks: f.pageUrl ? [{ type: 'strong' }, { type: 'link', attrs: { href: f.pageUrl } }] : [{ type: 'strong' }],
          },
          { type: 'text', text: ` — ${f.explanation}` },
        ],
      },
      // ADF does not allow blockquotes inside list items, so the quote is an italic paragraph.
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `“${f.decisionQuote}”`, marks: [{ type: 'em' }] }],
      },
    ],
  }));
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Precedent: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'this issue touches decisions your team already made. Worth a look before starting work.' },
        ],
      },
      { type: 'bulletList', content: items },
    ],
  };
}

export async function addFindingsComment(issueKey, findings) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: commentBody(findings) }),
  });
  if (!res.ok) throw new Error(`Could not comment on ${issueKey} (${res.status}): ${await res.text()}`);
}
