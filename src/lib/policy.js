// Obligation and prohibition decisions ("every endpoint that moves money must require an
// Idempotency-Key", "PII must never be written to logs", "ledger PRs need two approvals").
// Technology-choice rules can't judge these, so we map both sides onto a small, explainable
// concept lexicon (English + Korean) and look for three explicit violation signals:
//   - prohibition: one work sentence does everything the rule forbids (PII + logs)
//   - omission:    work in the rule's scope says it skips the required thing ("without review")
//   - contrary:    work does the opposite of a "same"/count requirement ("fresh request id",
//                  "one approval" when two are needed)
// Anything subtler is left to the calling agent through "related decisions".

import { sentences } from './parse.js';
import { tokens } from './text.js';

// concept -> patterns. English patterns are word-bounded; Korean ones match as substrings.
export const CONCEPTS = {
  pii: ['pii', 'personal data', 'personally identifiable', 'personal information', 'full name', 'customer name', 'customer names', 'date of birth', 'dob', 'birthday', 'home address', 'postal address', 'passport', 'ssn', 'social security', 'national id', 'phone number', 'email address', 'phi', 'patient data', 'medical record', 'health record', 'diagnos\\w*', "(?:customer|user|applicant|patient|member|client)(?:'s|s'|s)? (?:full )?(?:name|email|e-mail|phone|mobile|address|date of birth)\\w*", 'kyc (?:payload|submission|data|documents?|details)', 'gps', 'gps coordinates', 'coordinates', 'lat/lng', 'lat/lon', 'latitude', 'longitude', 'geolocation', 'precise location', 'device location', '위치 정보', '좌표', '집 주소', '자택 주소', 'email and phone', '개인정보', '실명', '성명', '생년월일', '여권', '주민등록', '전화번호', '휴대폰 번호', '계좌번호', '환자 정보', '진단', '(?:고객|회원|사용자|환자|신청자)\\s*(?:의\\s*)?(?:이름|주소|휴대폰|전화|이메일|계좌)'],
  secret: ['secret', 'secrets', 'api key', 'access tokens?', 'refresh tokens?', 'auth tokens?', 'bearer tokens?', 'api tokens?', 'jwts?', 'session tokens?', 'password', 'passwords', 'credential\\w*', '토큰', '비밀번호', '시크릿'],
  log: ['log', 'logs', 'logged', 'logging', 'logger', 'logs?', 'sentry', 'datadog', 'stdout', 'splunk', 'cloudwatch', 'log line', 'error tracker', 'crash report\\w*', '로그', '로깅'],
  analytics: ['analytics', 'segment\\.(?:io|com)', 'segment track', 'mixpanel', 'amplitude', 'google analytics', 'tracking event', 'telemetry event', 'track call', 'event propert\\w*', 'third-party analytics', 'posthog', 'heap analytics', '이벤트 속성', '분석 이벤트', '애널리틱스'],
  browser_storage: ['localstorage', 'local storage', 'sessionstorage', 'session storage', 'indexeddb', 'cookie', 'cookies', '로컬 스토리지', '쿠키'],
  cache: ['cache', 'cached', 'caching', 'memoize', 'ttl', 'cdn', 'redis', 'memcached', 'elasticache', '캐시', '캐싱'],
  balance: ['balance', 'balances', 'available funds', '잔액', '잔고', '남은 금액'],
  money: ['payout', 'payouts', 'refund', 'refunds', 'transfer', 'transfers', 'payment', 'payments', 'charge', 'charges', 'disburse\\w*', 'withdraw\\w*', 'moves? money', 'money', '송금', '환불', '이체', '결제', '출금', '지급'],
  endpoint: ['endpoint', 'endpoints', 'api', 'apis', 'route', 'POST', 'PUT', 'handler', '엔드포인트'],
  retry: ['retry', 'retries', 'retried', 'retrying', 'resend', 'send (?:it |the request )?again', 're-?submit\\w*', 'auto-retry', '재시도', '다시 보내', '재전송'],
  idempotency: ['idempotency', 'idempotency-key', 'idempotent', 'idempotency key', 'request id', 'request-id', 'dedup\\w* key', '멱등', '요청 id'],
  approval: ['approval', 'approvals', 'approve', 'approved', 'approver', 'review', 'reviews', 'reviewed', 'reviewer', 'sign-?off', 'self-merge\\w*', 'auto-merge\\w*', '승인', '리뷰', '검토자'],
  pull_request: ['pull requests?', 'prs?', 'merge', 'merged', 'merging', 'self-merge\\w*', 'auto-merge\\w*', 'code change\\w*', '머지', '풀 리퀘스트'],
  ledger: ['ledger', '원장'],
  audit: ['audit', 'audit log', 'audit event', 'audit trail', '감사 로그', '감사'],
  migration: ['migration', 'migrations', 'schema change\\w*', 'alter table', 'drop column', 'rename column', '마이그레이션', '스키마 변경'],
  test: ['tests?', 'test coverage', 'unit tests?', 'integration tests?', '테스트'],
  encryption: ['encrypt\\w*', 'kms', '암호화'],
  rollout_all: ['all devices', 'whole fleet', 'entire fleet', 'fleet-wide', 'at once', 'in one go', 'all at once', 'big bang', 'straight to 100%?', '100% (?:of )?(?:the )?(?:fleet|users|traffic)', 'skip (?:the )?canary', 'without (?:a )?canary', '전체 기기', '전체 사용자', '일괄', '한 번에', '한번에'],
  staged_rollout: ['canary', 'staged', 'rollout stages?', 'phased', 'rollout cohorts?', '1% cohort', 'gradual\\w*', 'percentage rollout', '단계적', '단계별', '카나리'],
  deploy: ['deploy\\w*', 'ship\\w*', 'push\\w*', 'pushed', 'release\\w*', 'roll(?:ed|s)? out', 'rollout', '배포', '출시'],
  firmware: ['firmware', 'ota', 'bootloader', 'embedded', '펌웨어'],
  certificate: ['certificates?', 'certs?', 'tls cert\\w*', 'x\\.?509', '인증서'],
  rotation: ['rotat\\w*', 'renew\\w*', 'expir\\w*', '교체', '갱신', '만료'],
  long_lived: ['long-lived', 'long lived', 'never expir\\w*', 'valid for (?:\\d+|one|two|three|five|ten) years?', '\\d+-year (?:cert\\w*|tokens?|keys?)', '유효기간[을를]? ?\\d+년', '\\d+년 (?:유효|만료)', '만료 없\\w*'],
  hardcode: ['hard-?cod\\w*', 'hardcod\\w*', 'bake\\w* (?:it )?into', '#define', 'compile-time constant', '하드코딩'],
  production: ['production', 'prod', '운영', '프로덕션'],
};

const COMPILED = Object.fromEntries(
  Object.entries(CONCEPTS).map(([k, pats]) => [
    k,
    // Upper-case patterns (POST, PUT) are case-sensitive so "post a reply" is not an endpoint.
    pats.map((p) => (/[가-힣]/.test(p) ? new RegExp(p, 'i') : new RegExp(`(?<![\\w-])${p}(?![\\w-])`, /^[A-Z]+$/.test(p) ? '' : 'i'))),
  ])
);

/** Concepts mentioned in a piece of text, with the position of their first mention. */
export function conceptsIn(text = '') {
  const found = new Map();
  for (const [k, res] of Object.entries(COMPILED)) {
    for (const re of res) {
      const m = re.exec(text);
      if (m && (!found.has(k) || m.index < found.get(k).index)) found.set(k, { index: m.index, word: m[0] });
    }
  }
  return found;
}

const NEG_MODAL = /\b(must not|must never|never|may not|cannot|can't|shall not|should not|are not|is not|no longer allowed)\b|금지|하지 않|해서는 안|하면 안|안 된다|안 됩니다|불가/i;
const POS_MODAL = /\b(must|needs?|require[sd]?|required|always|only|shall|has to|have to)\b|해야|필수/i;
const NO_X_IN_Y = /^\s*no\s+\w+/i;
const SAME = /\b(same|reuse[sd]?|identical)\b|동일|같은/i;
const OMIT = /\b(without|skip\w*|omit\w*|bypass\w*|no need for|don't need|drop(?:ping)? the|disable\w*|ignore\w*|leave out|not required|optional|enforce it later|later|next sprint|turn(?:ing)? off|switch(?:ing)? off|retroactiv\w*|self-merge\w*|auto-merge\w*|no)\b|생략|없이|건너뛰|빼고|안 하고|않고|다음 스프린트|나중에|만 받고|없앱|없애|끄고|끕니다/i;
const FRESH_KEY = /\b(?:fresh|new|different|another|random|regenerated)\s+(?:\w+\s+)?(?:key|id|idempotency[- ]key|request[- ]id)\b|새(?:로운)?\s*(?:요청\s*)?(?:키|id)/i;
const NEGATED = /\b(never|not|don't|doesn't|won't|must not|instead of)\b|않|말고|금지/i;
const PARTIAL = /\b(already|so far|still needs?|waiting for|pending)\b|아직|이미/i;
const COMPLY = /\b(redact\w*|mask\w*|scrub\w*|hash\w*|strip\w*|exclud\w*|remove\w*|removing|anonymi[sz]\w*|pseudonymi[sz]\w*|tokeni[sz]\w*|stop\w*|no longer|without|never|not|no)\b|마스킹|제외|제거|익명|없이|않|중단|그만|옮깁|옮기|이전합|전환합/i;
const NUMBERS = { one: 1, single: 1, a: 1, two: 2, three: 3, four: 4, '1': 1, '2': 2, '3': 3, '4': 4, 한: 1, 두: 2, 세: 3, 하나: 1, 둘: 2 };
const COUNT = /\b(one|single|two|three|four|[1-4])\s+(?:\w+\s+)?(approvals?|reviews?|reviewers?|sign-?offs?)\b|(한|두|세|[1-4])\s*(?:명|개|건)?\s*(?:의\s*)?(승인|리뷰)/i;

function countOf(text) {
  const m = COUNT.exec(text);
  if (!m) return null;
  return NUMBERS[(m[1] || m[3]).toLowerCase()] ?? null;
}

/**
 * Turn a decision into policy clauses. Each clause: { text, kind: 'forbid'|'require', scope, required, same, count }.
 * scope = concepts before the modal word (who the rule applies to); required = concepts after it.
 */
export function policyClauses(decision) {
  const source = [decision.decision, decision.quote, decision.body].filter(Boolean).join('. ');
  const out = [];
  const seen = new Set();
  for (const sentence of sentences(source.replace(/;/g, '.'))) {
    // "..., and retries must reuse the same key": split coordinated rules.
    const parts = sentence.split(/,\s*(?:and|but)\s+(?=[\w가-힣-]+(?:\s+[\w가-힣-]+){0,4}\s+(?:must|need|needs|are|is|should|may)\b)/i);
    let prevRequired = [];
    let prevScope = [];
    for (const part of parts) {
      const key = part.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const neg = NEG_MODAL.exec(part);
      const pos = POS_MODAL.exec(part);
      const noXinY = NO_X_IN_Y.test(part);
      if (!neg && !pos && !noXinY) continue;
      const kind = neg || noXinY ? 'forbid' : 'require';
      const cut = noXinY ? 0 : (neg || pos).index;
      const all = conceptsIn(part);
      const scope = [...all].filter(([, v]) => v.index < cut).map(([k]) => k);
      let required = [...all].filter(([, v]) => v.index >= cut).map(([k]) => k);
      // "the same key" refers back to the previous clause's required thing.
      if (SAME.test(part) && /\b(key|id|token|value)\b/i.test(part) && prevRequired.length) required = [...new Set([...required, ...prevRequired])];
      if (kind === 'forbid' && scope.length + required.length < 2) {
        const w = wordClause(part, neg || { index: 0, 0: '' });
        if (w) out.push(w);
        continue;
      }
      // A coordinated clause inherits who the rule applies to ("endpoints that move money ..., and retries must ...").
      const inherited = prevScope.filter((k) => !scope.includes(k));
      if (kind === 'require' && (required.length === 0 || scope.length + inherited.length === 0)) continue;
      out.push({ text: part.trim().replace(/[.\s]+$/, ''), kind, scope, inherited, required, same: SAME.test(part), count: countOf(part) });
      prevRequired = required;
      prevScope = [...new Set([...scope, ...prevScope])];
    }
  }
  return out;
}

// Fallback for prohibitions the concept lexicon doesn't cover ("sellers must not edit, hide or delete buyer
// reviews"): who (words before the modal), what action (verb groups below) and on what (words after the verb).
const VERB_GROUPS = {
  share: ['share', 'includ', 'expos', 'show', 'displ', 'send', 'attac', 'expor', 'revea', 'pass', 'give', 'forwa', '공유', '포함', '노출', '표시', '보여', '전달', '제공', '보내'],
  edit: ['edit', 'modif', 'chang', 'updat', 'alter', 'rewri', 'lower', 'raise', 'adjus', 'overr', '수정', '변경', '편집', '인하', '인상', '조정', '바꾸', '바꿉'],
  delete: ['delet', 'remov', 'erase', 'purge', 'drop', '삭제', '제거'],
  hide: ['hide', 'hidin', 'unpub', 'suppr', '숨기', '숨김', '비공'],
  publish: ['publi', 'post', '게시', '공개'],
  pay: ['pay', 'paid', 'relea', 'payou', 'disbu', '지급', '정산', '송금'],
  store: ['store', 'save', 'persi', 'keep', 'write', 'writt', '저장', '보관'],
  call: ['call', 'invok', 'integ', 'use', 'usin', '호출', '연동', '사용'],
  rename: ['renam', '이름'],
};
const VERB_OF = new Map(Object.entries(VERB_GROUPS).flatMap(([g, ws]) => ws.map((w) => [w, g])));
const SKIP_WORDS = /^(be|been|being|is|are|was|were|the|a|an|to|of|in|on|at|by|with|for|from|any|all|their|own|its|our|we|they|must|not|never|may|cannot|should|shall|only|also|ever|directly|직접|없이|동의|있으며|있다|된다|안|수|있는|없는|같은)$/i;
const KO_PARTICLE = /(에서는|에서|으로|에게|해서는|하면|해서|하는|하고|하지|이나|나|을|를|이|가|은|는|에|로|의|도|만|와|과)$/;
const wstem = (t) => {
  if (/[가-힣]/.test(t)) return t.replace(KO_PARTICLE, '').slice(0, 2);
  const u = t.length > 4 ? t.replace(/s$/, '') : t;
  return u.slice(0, 5);
};
const verbGroup = (t) => VERB_OF.get(wstem(t)) || VERB_OF.get(t.slice(0, 4)) || null;

function wordClause(part, modal) {
  const before = tokens(part.slice(0, modal.index)).filter((t) => !SKIP_WORDS.test(t));
  const after = tokens(part.slice(modal.index + modal[0].length)).filter((t) => !SKIP_WORDS.test(t));
  // Korean puts the verb last: treat every recognised verb anywhere in the clause as the action.
  const all = [...before, ...after];
  const verbs = new Set(all.map(verbGroup).filter(Boolean));
  if (verbs.size === 0) return null;
  const content = (ws) => [...new Set(ws.filter((t) => !verbGroup(t) && t.length >= 2).map(wstem))].filter((w) => w.length >= 2);
  // Korean is verb-final, so the modal comes last: treat the whole clause as one bag of words.
  const korean = (part.match(/[가-힣]/g) || []).length > part.length / 4;
  const actors = korean ? content(all) : content(before);
  const objects = korean ? [] : content(after);
  if (actors.length + objects.length < 2) return null;
  return { text: part.trim().replace(/[.\s]+$/, ''), kind: 'forbid-words', actors, objects, verbs, scope: [], required: [] };
}

function wordViolation(c, s) {
  const words = tokens(s);
  const stems = new Set(words.map(wstem));
  const verbs = new Set(words.map(verbGroup).filter(Boolean));
  if (![...c.verbs].some((v) => verbs.has(v))) return false;
  const need = (list) => (list.length >= 3 ? 2 : list.length ? 1 : 0);
  const a = c.actors.filter((w) => stems.has(w)).length;
  const o = c.objects.filter((w) => stems.has(w)).length;
  return a >= need(c.actors) && o >= need(c.objects) && a + o >= 2;
}

const near = (s, a, b, gap) => Math.abs(a - b) <= gap;

/** Returns { s, clause, why } for the first work sentence that violates a policy clause, or null. */
export function policyViolation(workText, decision) {
  const clauses = policyClauses(decision);
  if (clauses.length === 0) return null;
  const work = sentences(workText.replace(/\n+/g, '. '));
  const workConcepts = conceptsIn(workText);

  for (const c of clauses) {
    // The rule only applies to work inside its scope ("endpoints that move money", "ledger PRs").
    if (c.scope.length && !c.scope.every((k) => workConcepts.has(k))) continue;
    if (c.inherited?.length && !c.inherited.some((k) => workConcepts.has(k))) continue;
    for (const s of work) {
      const sc = conceptsIn(s);
      // "retry with a fresh request id" when the rule says retries reuse the same key.
      const fk = FRESH_KEY.exec(s);
      const negatedKey = fk && NEGATED.test(s.slice(Math.max(0, fk.index - 30), fk.index + fk[0].length + 12));
      if (c.kind === 'require' && c.same && fk && !negatedKey && (sc.has('retry') || workConcepts.has('retry'))) {
        return { s, clause: c, why: `The decision requires reusing the same value: "${c.text}".` };
      }
      if (c.kind === 'forbid-words') {
        const main = s.split(/\b(?:so that|so|because|since|to avoid)\b|위해|때문/i)[0];
        if (wordViolation(c, s) && !COMPLY.test(main)) return { s, clause: c, why: `This decision forbids it: "${c.text}".` };
        continue;
      }
      if (c.kind === 'forbid') {
        const needed = [...new Set([...c.scope, ...c.required])];
        // Everything the rule forbids is in this sentence, or all but one of it is and the rest is elsewhere in the work.
        const inSentence = needed.filter((k) => sc.has(k)).length;
        const covered = needed.every((k) => workConcepts.has(k)) && inSentence >= Math.max(2, needed.length - 1);
        // Only the main clause counts for compliance: "so installers stop seeing errors" is a reason, not a fix.
        const main = s.split(/\b(?:so that|so|because|since|to avoid)\b|위해|때문/i)[0];
        if (needed.length >= 2 && covered && !COMPLY.test(main)) {
          return { s, clause: c, why: `This decision forbids it: "${c.text}".` };
        }
        continue;
      }
      // Required thing mentioned together with an omission marker close to it.
      for (const k of c.required) {
        if (!sc.has(k)) continue;
        const at = sc.get(k).index;
        const om = OMIT.exec(s);
        if (om && near(s, om.index, at, 40)) return { s, clause: c, why: `This work skips what the decision requires: "${c.text}".` };
        const n = countOf(s);
        if (c.count && n !== null && n < c.count && !PARTIAL.test(s)) return { s, clause: c, why: `The decision requires ${c.count}: "${c.text}".` };
      }
    }
  }
  return null;
}
