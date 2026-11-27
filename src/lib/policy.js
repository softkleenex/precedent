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
import { techsIn } from './tech.js';

// concept -> patterns. English patterns are word-bounded; Korean ones match as substrings.
export const CONCEPTS = {
  pii: ['pii', 'personal data', 'personally identifiable', 'personal information', 'full name', 'customer name', 'customer names', 'date of birth', 'dob', 'birthday', 'home address', 'postal address', 'passport', 'ssn', 'social security', 'national id', 'phone number', 'email address', 'phi', 'protected health information', 'health information', 'mrn', 'medical record number', 'insurance (?:id|number|member id)', 'icd-?10(?: code)?', 'patient (?:name|age|address|phone|dob)', 'patient data', 'medical record', 'health record', 'diagnos\\w*', "(?:customer|user|applicant|patient|member|client|player|account|buyer|student)(?:'s|s'|s)? (?:full )?(?:name|email|e-mail|phone|mobile|address|date of birth|ip)\\w*", 'kyc (?:payload|submission|data|documents?|details)', 'identif\\w+ (?:information|data)', 'personally identifying', '식별할 수 있는 정보', '개인 식별', '학번', 'student (?:number|id)', 'card (?:number|last ?4|fragments?)', 'billing (?:name|address)', 'ip address(?:es)?', 'gps', 'gps coordinates', 'coordinates', 'lat/lng', 'lat/lon', 'latitude', 'longitude', 'geolocation', 'precise location', 'device location', '위치 정보', '좌표', '집 주소', '자택 주소', 'email and phone', '개인정보', '실명', '성명', '생년월일', '여권', '주민등록', '전화번호', '휴대폰 번호', '계좌번호', '환자 정보', '진단', '(?:고객|회원|사용자|환자|신청자)\\s*(?:의\\s*)?(?:이름|주소|휴대폰|전화|이메일|계좌)'],
  secret: ['secret', 'secrets', 'api key', 'access tokens?', 'refresh tokens?', 'auth tokens?', 'bearer tokens?', 'api tokens?', 'jwts?', 'session tokens?', 'password', 'passwords', 'credential\\w*', '토큰', '비밀번호', '시크릿'],
  log: ['log', 'logs', 'logged', 'logging', 'logger', 'logs?', 'sentry', 'datadog', 'stdout', 'splunk', 'cloudwatch', 'log line', 'error tracker', 'crash report\\w*', 'crash dumps?', 'dumps?', '덤프', '로그', '로깅'],
  analytics: ['analytics', 'segment\\.(?:io|com)', 'segment track', 'mixpanel', 'amplitude', 'google analytics', 'tracking event', 'telemetry event', 'track call', 'segment identify', 'identify (?:call|traits)', 'event propert\\w*', 'third-party analytics', 'posthog', 'heap analytics', '이벤트 속성', '분석 이벤트', '애널리틱스'],
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
  audit: ['audit\\w*', 'audit log', 'audit event', 'audit trail', '감사 로그', '감사'],
  migration: ['migration', 'migrations', 'schema change\\w*', 'alter table', 'drop column', 'rename column', 'drop (?:the )?(?:[\\w.]+ ){0,2}columns?', 'rename (?:the )?(?:[\\w.]+ ){0,2}columns?', 'renam\\w* [\\w.]+ to [\\w.]+', '컬럼', '마이그레이션', '스키마 변경'],
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
  feature_flag: ['feature flags?', 'flags?', 'toggles?', 'feature toggles?', 'kill switch', '플래그', '토글'],
  production: ['production', 'prod', 'prod-[\\w-]+', '운영', '프로덕션'],
};

const COMPILED = Object.fromEntries(
  Object.entries(CONCEPTS).map(([k, pats]) => [
    k,
    // Upper-case patterns (POST, PUT) are case-sensitive so "post a reply" is not an endpoint.
    pats.map((p) => (/[가-힣]/.test(p) ? new RegExp(p, 'i') : new RegExp(`(?<![A-Za-z0-9-])${p}(?![A-Za-z0-9-])`, /^[A-Z]+$/.test(p) ? '' : 'i'))),
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

const NEG_MODAL = /\b(must not|must never|never|may not|cannot|can't|shall not|should not|are not|is not|no longer allowed|nobody|no one|no-one)\b|금지|지 않는다|지 않습니다|지 않음|하지 않|해서는 안|하면 안|안 된다|안 됩니다|불가/i;
const POS_MODAL = /\b(must|needs?|require[sd]?|required|always|only|shall|has to|have to)\b|해야|필수|만 사용한다|만 쓴다/i;
// "Every new feature ships behind a flag": a present-tense rule about every X is an obligation too.
const IMPLICIT = /^\s*(?:every|each|all)\s+[^.]*?\b(ships?|runs?|goes|go|uses?|is|are|gets?|lives?|happens?)\b/i;
const NO_X_IN_Y = /^\s*no\s+\w+/i;
const SAME = /\b(same|reuse[sd]?|identical)\b|동일|같은/i;
const OMIT = /\b(without|skip\w*|omit\w*|bypass\w*|no need for|don't need|drop(?:ping)? the|disable\w*|ignore\w*|leave out|not required|optional|enforce it later|later|next sprint|turn(?:ing)? off|switch(?:ing)? off|retroactiv\w*|self-merge\w*|auto-merge\w*|no)\b|생략|없이|건너뛰|빼고|안 하고|않고|다음 스프린트|나중에|만 받고|없앱|없애|끄고|끕니다/i;
const FRESH_KEY = /\b(?:fresh|new|different|another|random|regenerated)\s+(?:\w+\s+)?(?:key|id|idempotency[- ]key|request[- ]id)\b|새(?:로운)?\s*(?:요청\s*)?(?:키|id)/i;
const NEGATED = /\b(never|not|don't|doesn't|won't|must not|instead of)\b|않|말고|금지/i;
const PARTIAL = /\b(already|so far|still needs?|waiting for|pending)\b|아직|이미/i;
const COMPLY = /\b(redact\w*|mask\w*|scrub\w*|hash\w*|strip\w*|exclud\w*|remove\w*|removing|anonymi[sz]\w*|pseudonymi[sz]\w*|tokeni[sz]\w*|stop\w*|no longer|without|never|not|no|found|discovered|noticed|replac\w*|swap\w*)\b|마스킹|발견|없음|없습니다|아님|않음|제외|제거|익명|없이|않|중단|그만|옮깁|옮기|이전합|전환합/i;
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
// Clauses depend only on the decision text, so they are parsed once per decision version.
const CLAUSE_CACHE = new Map();
export function policyClauses(decision) {
  const key = `${decision.id}|${decision.title}|${decision.decision}|${decision.quote}|${decision.body}`;
  if (CLAUSE_CACHE.has(key)) return CLAUSE_CACHE.get(key);
  const out = buildClauses(decision);
  if (CLAUSE_CACHE.size > 2000) CLAUSE_CACHE.clear();
  CLAUSE_CACHE.set(key, out);
  return out;
}

function buildClauses(decision) {
  const source = [decision.decision, decision.quote, decision.body].filter(Boolean).join('. ');
  const out = [];
  const defs = definitions(source);
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
      const imp = !neg && !POS_MODAL.test(part) ? IMPLICIT.exec(part) : null;
      let pos = POS_MODAL.exec(part) || (imp ? { index: imp.index + imp[0].length - imp[1].length, 0: imp[1] } : null);
      if (imp && pos) {
        // "… are handled by Stripe Billing", "… ships behind a feature flag": the requirement starts after the preposition.
        const prep = part.slice(pos.index).match(/^\S+\s+(?:\w+\s+)?(?:by|behind|through|via|on|in|with|as)\s+/i);
        if (prep) pos = { index: pos.index, 0: prep[0].trim() };
      }
      const noXinY = NO_X_IN_Y.test(part);
      if (!neg && !pos && !noXinY) continue;
      const kind = neg || noXinY ? 'forbid' : 'require';
      const cut = noXinY ? 0 : (neg || pos).index;
      const all = conceptsIn(part);
      // A term the page defines itself ("PHI here means name, address, phone …") counts as a concept too.
      // Concepts that only appear inside a definition list ("payment card fragments") are part of that definition.
      for (const d of defs) {
        for (const [k, v] of [...all]) {
          if (!k.startsWith('def:') && d.terms.some((t) => t.toLowerCase().includes(v.word.toLowerCase())) && !d.nameRe.test(v.word)) all.delete(k);
        }
      }
      for (const d of defs) {
        const at = d.nameRe.exec(part);
        if (!at) continue;
        // "Protected health information" is already the pii concept: the definition widens it instead.
        const same = [...all].find(([, v]) => Math.abs(v.index - at.index) <= 3);
        if (same) d.alias = same[0];
        else if (!all.has(d.key)) all.set(d.key, { index: at.index, word: at[0] });
      }
      const scope = [...all].filter(([, v]) => v.index < cut).map(([k]) => k);
      let required = [...all].filter(([, v]) => v.index >= cut).map(([k]) => k);
      // "the same key" refers back to the previous clause's required thing.
      if (SAME.test(part) && /\b(key|id|token|value)\b/i.test(part) && prevRequired.length) required = [...new Set([...required, ...prevRequired])];
      if (kind === 'forbid' && scope.length + required.length < 2 && !(scope.length && sinkCount(part))) {
        // Limits ("no data kept longer than 30 days") are handled as numbers; named tech ("no new C code") by the tech rules.
        if (MAX_WORDS.test(part) && quantities(part).length) continue;
        if (noXinY && techsIn(part).length) continue;
        const w = wordClause(part, neg || { index: 0, 0: '' }, decision.title);
        if (w) out.push({ ...w, defs: defs.filter((d) => part.includes(d.key.slice(4)) || d.nameRe.test(part)) });
        continue;
      }
      // A coordinated clause inherits who the rule applies to ("endpoints that move money ..., and retries must ...").
      const inherited = prevScope.filter((k) => !scope.includes(k));
      if (kind === 'require' && (required.length === 0 || scope.length + inherited.length === 0)) {
        // "Reviews are published only after automated moderation": the required step, as words.
        const w = requireWords(part, pos, decision.title);
        if (w) out.push(w);
        continue;
      }
      const sinkM = part.match(/\b(?:not|never|no)\s+(?:in|on|to|into|via)\s+([^.;]+)/i) || part.match(/anywhere other than[^:]*:\s*not\s+(?:in|on)\s+([^.;]+)/i);
      const sinks = sinkM ? sinkM[1].split(/,\s*|\s+(?:or|and|nor)\s+/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 30) : [];
      out.push({ text: part.trim().replace(/[.\s]+$/, ''), kind, scope, inherited, required, same: SAME.test(part), count: countOf(part), defs, list: /,|\bor\b/.test(part.slice(cut)), sinks });
      if (kind === 'require') {
        const w = requireWords(part, pos, decision.title);
        if (w) out.push(w);
      }
      prevRequired = required;
      prevScope = [...new Set([...scope, ...prevScope])];
    }
  }
  // Expand/contract style rules: the risky step must happen in a later, separate release.
  // "All patient SMS goes through notify-svc … no other service may integrate Twilio, Vonage or AWS SNS directly."
  const via = VIA.exec(source);
  if (via) {
    const gateway = (via[1] || via[2] || via[3] || '').replace(/[.,;]$/, '');
    const named = [...source.matchAll(/\b(?:includes?|including|such as|e\.g\.|like|currently)\s*:?\s*([^.;()]+)/gi)]
      .flatMap((m) => m[1].split(/,\s*|\s+(?:or|and)\s+|\//))
      .map((t) => t.replace(/^(?:a|an|the)\s+/i, '').trim())
      .filter((t) => /^[A-Z]/.test(t) && t.length <= 30 && !t.toLowerCase().includes(gateway.toLowerCase()));
    if (gateway && named.length) out.push({ text: via[0].trim(), kind: 'via', gateway, named, scope: [], required: [] });
  }
  for (const lim of limits(source)) out.push(lim);
  const fw = freezeWindow(source);
  if (fw) out.push(fw);
  const region = source.match(/\bonly in ([a-z]{2}-[a-z]+-\d)\b/i);
  if (region) {
    const subject = (source.slice(0, region.index).match(/\b([A-Z]{2,})\b(?=[^.]*$)/) || [])[1] || null;
    out.push({ text: (sentences(source).find((x) => x.includes(region[0])) || region[0]).replace(/[.\s]+$/, ''), kind: 'region', region: region[1].toLowerCase(), subject, scope: [], required: [] });
  }
  if (SEPARATE_RELEASE.test(source)) {
    out.push({ text: (sentences(source).find((x) => SEPARATE_RELEASE.test(x)) || '').replace(/[.\s]+$/, ''), kind: 'separate', scope: [], required: [] });
  }
  return out;
}

const VIA = /\b(?:go(?:es)?|is sent|are sent|sent|routed|must go|flows?) through (?:the )?`?([a-z][\w-]*-(?:svc|service|gateway|api|proxy))`?|\bonly (?:via|through) (?:the )?([a-z][\w-]*-(?:svc|service|gateway|api|proxy))|\bother services call ([a-z][\w-]*-(?:svc|service|gateway|api|proxy))/i;
const sinkCount = (part) => (part.match(/\b(?:not|never|no)\s+(?:in|on|to|into|via)\s+[^.;]+/i) ? 1 : 0);
function sinkIn(sink, s) {
  const words = new Set(tokens(s).map(wstem));
  const sw = tokens(sink).filter((t) => !SKIP_WORDS.test(t)).map(wstem);
  // "error tables" also covers "the sync_failures table": the head noun is enough.
  return sw.length > 0 && (sw.every((w) => words.has(w)) || words.has(sw[sw.length - 1]));
}

// "Interactive query timeouts cannot exceed 60 seconds", "No customer data may be kept longer than 30 days",
// "채팅 원문은 최대 30일까지만 보관한다": a number with a unit and the words it applies to.
const UNIT = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, 초: 1, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, 분: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, 시간: 3600, d: 86400, day: 86400, days: 86400, 일: 86400, week: 604800, weeks: 604800, 주: 604800, month: 2592000, months: 2592000, 개월: 2592000, 달: 2592000, year: 31536000, years: 31536000, 년: 31536000 };
const QTY = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|months?|years?|초|분|시간|일|주|개월|달|년)(?![A-Za-z])/gi;
const WORDNUM = { a: 1, one: 1, two: 2, three: 3, six: 6, twelve: 12 };
function quantities(text) {
  const out = [];
  const t = text.replace(/\b(a|one|two|three|six|twelve)\s+(year|month|week|day)s?\b/gi, (m0, n, u) => `${WORDNUM[n.toLowerCase()]} ${u}s`);
  for (const m of t.matchAll(QTY)) out.push({ secs: parseFloat(m[1]) * UNIT[m[2].toLowerCase()], index: m.index });
  if (/indefinitely|forever|영구|무기한/i.test(t)) out.push({ secs: Infinity, index: t.search(/indefinitely|forever|영구|무기한/i) });
  return out;
}
const LIMIT_NOISE = /^(kept|keep|longer|more|than|exceed|after|before|least|maximum|max|only|regardless|same|plan|plans|tier|tiers|있다|없다|초과할|동일하다|관계없이)$/i;
const MAX_WORDS = /\b(?:kept|retained|stored|held)\s+(?:for\s+)?(?:longer|more) than\b|\b(?:cannot|can't|may not|must not|must never|never|not)\s+(?:be\s+)?(?:exceed|longer than|more than|kept longer than|go above|be kept longer than)\b|\b(?:at most|no more than|no longer than|up to|maximum(?: of)?|max\.?)\b|초과할 수 없|넘을 수 없|최대|이하|까지만/i;
// "No live-event config changes go out between Friday 18:00 and Monday 10:00 KST": days fully inside the window.
const DAYS = [/\b(sun(?:day)?)\b|일요일/i, /\b(mon(?:day)?)\b|월요일/i, /\b(tue(?:sday)?)\b|화요일/i, /\b(wed(?:nesday)?)\b|수요일/i, /\b(thu(?:rsday)?)\b|목요일/i, /\b(fri(?:day)?)\b|금요일/i, /\b(sat(?:urday)?)\b|토요일/i];
const DAYNAME = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
function freezeWindow(source) {
  const m = source.match(new RegExp(`\\bbetween\\s+(${DAYNAME})[^.]*?\\band\\s+(${DAYNAME})\\b`, 'i'));
  if (!m || !/\b(no|not|never|freeze|frozen)\b/i.test(source)) return null;
  const idx = (d) => DAYNAME.split('|').indexOf(d.toLowerCase());
  const days = [];
  for (let d = (idx(m[1]) + 1) % 7; d !== idx(m[2]); d = (d + 1) % 7) days.push(d);
  if (!days.length) return null;
  return { text: (sentences(source).find((x) => x.includes(m[0])) || m[0]).replace(/[.\s]+$/, ''), kind: 'freeze', days, scope: [], required: [] };
}

function limits(source) {
  const out = [];
  for (const sent of sentences(source)) {
    if (!MAX_WORDS.test(sent)) continue;
    const q = quantities(sent)[0];
    if (!q || !Number.isFinite(q.secs)) continue;
    const body = sent.replace(MAX_WORDS, ' ').replace(QTY, ' ');
    // One group per source word, so "타임아웃" and its gloss "timeout" count once.
    const groups = tokens(body)
      .filter((t) => t.length >= 3 && !SKIP_WORDS.test(t) && !/^\d/.test(t) && !GENERIC.test(t) && !LIMIT_NOISE.test(t))
      .map((t) => [...new Set(gloss([t]).map(wstem))]);
    if (groups.length) out.push({ text: sent.replace(/[.\s]+$/, ''), kind: 'limit', max: q.secs, groups, scope: [], required: [] });
  }
  return out;
}

const DEFERRED = /\b(later|next (?:week|sprint|patch|release)|after(?:wards)?|follow-up|will post|tomorrow)\b|다음 주|다음 패치|나중에|이후|정기 패치노트/i;
const UMBRELLA = /^(?:aws|amazon|google|microsoft|azure|apache|cloud|api|sdk|the|our)$/i;
const STRICT_OMIT = /\b(without|skip\w*|omit\w*|bypass\w*|no need for|no need to|not needed|no [\w-]+(?: [\w-]+)? (?:needed|required)|leave out|not required|optional|can follow|follow later|later|next sprint|after (?:launch|ga|release)|not yet|no [\w-]+(?: [\w-]+)? (?:yet|planned)|asynchronously|afterwards|in the background|after the fact|retroactiv\w*|unthrottled|no throttling|not configured|unset|for (?:the )?mvp|for now)\b|생략|배치로 몰아서|나중에 일괄|미설정|미적용|없이|없이|건너뛰|빼고|이후|나중에|다음 스프린트/i;
const SEPARATE_RELEASE = /\b(?:later|separate|subsequent|next|following) (?:release|deploy|deployment|migration)\b|별도 (?:배포|릴리스)|다음 배포/i;
const SAME_RELEASE = /\b(?:(?:in )?the same (?:release|deploy|deployment|pr|migration|change)|in one (?:go|migration|deploy|release|pr)|at the same time|together with|alongside)\b|한 번에|함께 배포|같이 배포|동시에/i;

/** "PHI here means anything that identifies a patient: name, address, phone, date of birth, MRN" -> a concept for this decision. */
function definitions(text) {
  const out = [];
  const re = /\b([A-Z][A-Za-z]{1,6}|[A-Za-z][\w-]*(?:\s+[\w-]+){0,3})\s+(?:here\s+)?(?:means|includes|covers|refers to|is defined as)\b[^:]{0,80}:\s*([^.;]+)/g;
  let m;
  const found = [];
  while ((m = re.exec(text))) found.push([m[1], m[2]]);
  // "Customer credentials (warehouse passwords, service account keys, OAuth tokens)", "Raw driver connections (clickhouse_connect, psycopg, JDBC)"
  const paren = /\b((?:[A-Za-z][\w-]*\s+){0,2}[A-Za-z][\w-]*)\s*\(([^()]{3,160},[^()]{2,160})\)/g;
  while ((m = paren.exec(text))) found.push([m[1], m[2]]);
  // "Player PII — email address, phone number, real name, IP address — is never written …"
  const dash = /\b((?:[A-Za-z][\w-]*\s+){0,2}[A-Za-z][\w-]*)\s*[—–]\s*([^—–]{3,200},[^—–]{2,200})\s*[—–]/g;
  while ((m = dash.exec(text))) found.push([m[1], m[2]]);
  for (const km of text.matchAll(/(?:^|[.\n]\s*)([^.\n]{3,120}?)(?:이|가)\s*해당(?:된다|합니다|함)/g)) found.push(['개인정보', km[1]]);
  for (const [rawName, list] of found) {
    m = [null, rawName, list];
    const name = m[1].trim();
    if (/\b(goes|go|is|are|was|were|be|run|runs|gets|becomes)\b/i.test(name)) continue;
    const terms0 = m[2].split(/,\s*|\s+(?:or|and)\s+/).map((t) => t.replace(/^(?:a|an|the|their|its)\s+/i, '').trim()).filter((t) => t.length >= 2 && t.length <= 40);
    // "email address" also matches "account email": keep each term's distinctive word too.
    // "email address" -> "email", "phone number" -> "phone", "IP address" -> "IP"
    const heads = terms0.map((t) => t.split(/\s+/)).filter((w) => w.length === 2 && /^(address|number|name|id|ids|code|codes|card)$/i.test(w[1]) && !/^(real|full|date|home)$/i.test(w[0])).map((w) => w[0]);
    const glossTerms = terms0.flatMap((t) => (/[가-힣]/.test(t) ? gloss([t]).filter((x) => x !== t) : []));
    const terms = [...new Set([...terms0, ...(terms0.length >= 3 ? heads : []), ...glossTerms])];
    if (terms.length < 2) continue;
    const acronym = /^[A-Z]{2,}$/.test(name) ? name : null;
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The name, or a phrase whose initials spell the acronym ("Protected health information" = PHI).
    const namePat = acronym ? `${acronym}|${acronym.split('').map((ch) => `${ch}\\w+`).join('\\s+')}` : esc(name);
    const inName = [...conceptsIn(name).keys()][0];
    out.push({
      alias: inName,
      key: `def:${name.toLowerCase()}`,
      nameRe: new RegExp(`\\b(?:${namePat})\\b`, 'i'),
      termRe: new RegExp(`(?<![A-Za-z0-9-])(?:${terms.map((t) => esc(t.replace(/s$/i, ''))).join('|')})s?(?![A-Za-z0-9-])`, 'i'),
      terms,
    });
  }
  return out;
}

function withDefs(text, defs = []) {
  const found = conceptsIn(text);
  for (const d of defs) {
    const m = d.termRe.exec(text) || d.nameRe.exec(text);
    const key = d.alias || d.key;
    if (m && !found.has(key)) found.set(key, { index: m.index, word: m[0] });
  }
  return found;
}

// Fallback for prohibitions the concept lexicon doesn't cover ("sellers must not edit, hide or delete buyer
// reviews"): who (words before the modal), what action (verb groups below) and on what (words after the verb).
const VERB_GROUPS = {
  share: ['share', 'includ', 'expos', 'show', 'displ', 'send', 'attac', 'expor', 'revea', 'pass', 'give', 'forwa', '공유', '포함', '노출', '표시', '보여', '전달', '제공', '보내'],
  edit: ['edit', 'modif', 'chang', 'updat', 'alter', 'rewri', 'lower', 'raise', 'adjus', 'overr', 'rebal', 'tweak', 'bump', '수정', '변경', '편집', '인하', '인상', '조정', '바꾸', '바꿉', '적용', '상향', '하향', '올리', '내리', '올려'],
  delete: ['delet', 'remov', 'erase', 'purge', 'drop', '삭제', '제거'],
  hide: ['hide', 'hidin', 'unpub', 'suppr', '숨기', '숨김', '비공'],
  publish: ['publi', 'post', '게시', '공개'],
  pay: ['pay', 'paid', 'relea', 'payou', 'disbu', '지급', '정산', '송금'],
  store: ['store', 'save', 'persi', 'keep', 'write', 'writt', '저장', '보관'],
  call: ['call', 'invok', 'integ', 'use', 'usin', '호출', '연동', '사용'],
  rename: ['renam'],
  serve: ['serve', 'servi', 'strea', '서빙', '재생', '스트리'],
};
const VERB_OF = new Map(Object.entries(VERB_GROUPS).flatMap(([g, ws]) => ws.map((w) => [w, g])));
const SKIP_WORDS = /^(be|been|being|is|are|was|were|the|a|an|to|of|in|on|at|by|with|for|from|through|against|via|any|all|every|their|own|its|our|we|they|must|not|never|may|cannot|should|shall|only|also|ever|directly|직접|없이|동의|있으며|있다|된다|안|수|있는|없는|같은)$/i;
const KO_PARTICLE = /(에서는|에서|으로|에게|해서는|하면|해서|하는|하고|하지|이나|나|을|를|이|가|은|는|에|로|의|도|만|와|과)$/;
const wstem = (t) => {
  if (/[가-힣]/.test(t)) return t.replace(KO_PARTICLE, '').slice(0, 2);
  const u = t.length > 4 ? t.replace(/s$/, '') : t;
  // Long identifiers (AuditPublisher, SharedPreferences) are names, not words: keep them whole.
  return u.length > 10 ? u : u.slice(0, 5);
};
// Nouns that share a verb's prefix ("public" vs "publish", "postgres" vs "post").
const NOT_VERB = /^(public|publicly|postgres\w*|poster|postal|payload|payment\w*|passport|password\w*|storefront|keyword\w*|usage|user\w*|useful|chance|changelog|channel\w*|update(?:d_at)?s?)$/i;
const verbGroup = (t) => (t.length > 10 || NOT_VERB.test(t) ? null : VERB_OF.get(wstem(t)) || VERB_OF.get(t.slice(0, 4)) || null);

function wordClause(rawPart, modal, title = '') {
  // Korean "판매자만 변경할 수 있으며, 운영자나 …가 판매자 동의 없이 가격을 수정해서는 안 된다": keep the prohibited clause only.
  let part = rawPart;
  const ko = part.split(/(?:으며|며|고|지만),\s*/);
  if (ko.length > 1 && /[가-힣]/.test(part)) {
    const last = ko[ko.length - 1];
    modal = { index: Math.max(0, modal.index - (part.length - last.length)), 0: modal[0] };
    part = last;
  }
  // "without notice" / "사전 공지 없이": the rule only bites when that condition is missing.
  const condM = part.match(/(\S+)\s+(?:동의\s+)?없이/) || part.match(/\b(?:without|until (?:they|it) (?:have|has|get|gets))\s+(?:an?\s+|the\s+|prior\s+)?(?:open\s+|valid\s+|approved\s+|written\s+)?([\w-]+)/i);
  const condition = condM ? wstem(condM[1].replace(KO_PARTICLE, '')) : null;
  const objM = /[가-힣]/.test(part) ? [...part.matchAll(/([가-힣A-Za-z]+)(?:을|를)\s/g)].pop() : null;
  const koObject = objM ? wstem(objM[1]) : null;
  const koObjectEn = objM && KO_EN[Object.keys(KO_EN).find((g) => objM[1].startsWith(g))] ? wstem(KO_EN[Object.keys(KO_EN).find((g) => objM[1].startsWith(g))]) : null;
  part = part.replace(/\S+\s+동의\s+없이/, '');
  const before = tokens(part.slice(0, modal.index)).filter((t) => !SKIP_WORDS.test(t));
  const after = tokens(part.slice(modal.index + modal[0].length)).filter((t) => !SKIP_WORDS.test(t));
  // Korean puts the verb last: treat every recognised verb anywhere in the clause as the action.
  const all = [...before, ...after];
  const verbs = new Set(gloss(all).map(verbGroup).filter(Boolean));
  // "No direct access (psql, DB console) to production databases …": a noun phrase is the forbidden thing itself.
  const nounRule = /^\s*no\s+/i.test(rawPart);
  const headM = rawPart.match(/^\s*no\s+(?:new\s+|more\s+|further\s+|additional\s+|direct\s+|standing\s+)?([A-Za-z][\w-]*)/i);
  const head = nounRule && headM ? wstem(headM[1].toLowerCase()) : null;
  if (verbs.size === 0 && !nounRule) return null;
  const content = (ws) => [...new Set(gloss(ws).filter((t) => !verbGroup(t) && t.length >= 2).map(wstem))].filter((w) => w.length >= 2);
  // Korean is verb-final, so the modal comes last: treat the whole clause as one bag of words.
  const korean = (part.match(/[가-힣]/g) || []).length > part.length / 4;
  // "They are never written to AsyncStorage": the subject is in the title ("Access and refresh tokens …").
  const pronoun = /^\s*(?:they|it|these|this|those)\b/i.test(part);
  const actors = korean ? content(all) : before.length && !pronoun ? content(before) : content(tokens(title).filter((t) => !SKIP_WORDS.test(t))).slice(0, 6);
  const objects = korean ? [] : content(after);
  if (actors.length + objects.length < 2) return null;
  return { text: rawPart.trim().replace(/[.\s]+$/, ''), kind: 'forbid-words', actors, objects, verbs, scope: [], required: [], condition, koObject, koObjectEn, nounRule, head };
}

const SYN = { predi: ['filte', 'condi', 'where', 'scope', 'scopi'], filte: ['predi', 'condi'], valid: ['verif', 'check'], rate: ['throt'], limit: ['throt'], featu: ['flag', 'toggl'], flag: ['toggl', 'featu'] };
const withSyn = (stems) => [...new Set(stems.flatMap((w) => [w, ...(SYN[w] || [])]))];

function requireWords(part, modal, title = '') {
  const before = tokens(part.slice(0, modal.index)).filter((t) => !SKIP_WORDS.test(t));
  const after = tokens(part.slice(modal.index + modal[0].length)).filter((t) => !SKIP_WORDS.test(t) && !GENERIC.test(t));
  const content = (ws) => [...new Set(gloss(ws).filter((t) => !verbGroup(t) && t.length >= 4).map(wstem))];
  const beforeStems = new Set(content(before));
  const required = content(after).filter((w) => !/^(pass|again|agains|befor|after)/.test(w) && !beforeStems.has(w)).slice(0, 8);
  if (!required.length) return null;
  const actors = content(before.length ? before : tokens(title)).slice(0, 6);
  // The head of the requirement ("approval", "a rate-limit policy", "a feature flag") is what must be skipped.
  // One head per coordinated requirement: "a load test … and an AppSec security review".
  const heads = part.slice(modal.index + modal[0].length).split(/\band\b|,|;/).map((seg) => {
    // A named thing ("Stripe Billing", "Kong") is the requirement; otherwise its first words.
    const first = (seg.match(/[A-Za-z][\w-]*/g) || []).find((w) => !SKIP_WORDS.test(w) && !/^(a|an|the)$/i.test(w));
    const named = first && /^[A-Z][\w-]*[a-z]/.test(first) ? [first.toLowerCase()] : [];
    const pool = named.length ? named.slice(0, 1) : tokens(seg).filter((t) => !SKIP_WORDS.test(t) && !GENERIC.test(t));
    return content(pool).filter((w) => !beforeStems.has(w)).slice(0, 2);
  }).flat();
  return { text: part.trim().replace(/[.\s]+$/, ''), kind: 'require-words', required: withSyn(required), head: withSyn(heads.length ? heads : required.slice(0, 2)), actors, scope: [] };
}
const GENERIC = /^(after|before|first|then|each|every|other|some|time|times|way|ways|thing|things|team|teams|people|day|days|week|weeks|least|most|more|less|least)$/i;

// Small Korean -> English engineering glossary, so a Korean ticket can match an English rule and back.
const KO_EN = {
  토큰: 'token', 저장: 'store', 로그: 'log', 이메일: 'email', 판매자: 'seller', 구매자: 'buyer', 리뷰: 'review', 수정: 'edit',
  가격: 'price', 정산: 'payout', 지급: 'pay', 배송: 'shipment', 주소: 'address', 전화번호: 'phone', 이름: 'name', 사용자: 'user',
  고객: 'customer', 운영자: 'ops', 관리자: 'admin', 배포: 'deploy', 승인: 'approval', 검토: 'review', 삭제: 'delete', 숨김: 'hide',
  공유: 'share', 노출: 'show', 포함: 'include', 비밀번호: 'password', 인증서: 'certificate', 결제: 'payment', 환불: 'refund',
  주문: 'order', 상품: 'product', 재고: 'inventory', 이벤트: 'event', 알림: 'notification', 메일: 'email', 문자: 'sms', 테스트: 'test',
  모더레이션: 'moderation', 검수: 'moderation', 플래그: 'flag', 기능: 'feature', 마이그레이션: 'migration', 컬럼: 'column',
  변경: 'change', 계산식: 'formula', 공식: 'formula', 플래그: 'flag', 토글: 'toggle', 원본: 'original', 파일: 'file', 서빙: 'serve', 영상: 'video', 강의: 'lecture', 자막: 'caption', 엑셀: 'excel', 스프레드시트: 'spreadsheet',
  학생: 'student', 출석: 'attendance', 이메일: 'email', 학번: 'student number', 전화번호: 'phone', 주소: 'address',
  대시보드: 'dashboard', 인터랙티브: 'interactive', 쿼리: 'query', 타임아웃: 'timeout', 데이터: 'data', 해지: 'cancellation', 보관: 'retention',
  접속: 'access', 조건: 'predicate', 스냅샷: 'snapshot', 백업: 'backup', 커넥터: 'connector', 테넌트: 'tenant', 부하: 'load', 보안: 'security',
  플레이어: 'player', 메시지: 'message', 원문: 'raw', 섀도: 'shadow', 모드: 'mode', 레이트: 'rate', 리밋: 'limit', 확률: 'rate',
  영수증: 'receipt', 검증: 'validation', 크래시: 'crash', 덤프: 'dump', 실명: 'name', 공지: 'notice', 엔드포인트: 'endpoint', 매치: 'match', 랭킹: 'leaderboard', 채팅: 'chat', 아이템: 'item', 치트: 'cheat', 학생: 'student', 성적: 'grade',
};
function gloss(words) {
  const out = [];
  for (const w of words) {
    out.push(w);
    if (/[가-힣]/.test(w)) {
      const k = Object.keys(KO_EN).find((g) => w.startsWith(g));
      if (k) out.push(KO_EN[k]);
    }
  }
  return out;
}

function wordViolation(c, s, workText = s) {
  const words = gloss(tokens(s));
  if (c.koObject && !words.some((t) => wstem(t) === c.koObject || (c.koObjectEn && wstem(t) === c.koObjectEn))) return false;
  // The rule is "no X without notice": work that says the notice happened complies.
  if (c.condition) {
    const sents = sentences(workText.replace(/\n+/g, '. '));
    const meets = sents.some((x) => gloss(tokens(x)).some((t) => wstem(t) === c.condition) && !DEFERRED.test(x) && !/(없이|없음|without|\bno\b|skip)/i.test(x));
    if (meets) return false;
  }
  const stems = new Set(words.map(wstem));
  const verbs = new Set(words.map(verbGroup).filter(Boolean));
  if (c.nounRule && !c.verbs.size) {
    const stemsN = new Set(words.map(wstem));
    const headOk = !c.head || stemsN.has(c.head) || (c.defs || []).some((d) => d.termRe.test(s));
    const objHits = c.objects.filter((w) => stemsN.has(w)).length + ((c.defs || []).some((d) => d.termRe.test(s)) ? 1 : 0);
    return headOk && objHits >= 2;
  }
  // Korean tickets often put the action in another sentence ("확률 2배 이벤트 시작 … 공지 없이 진행").
  const verbsAll = c.koObject ? new Set(gloss(tokens(workText)).map(verbGroup).filter(Boolean)) : verbs;
  if (![...c.verbs].some((v) => verbs.has(v) || verbsAll.has(v))) return false;
  const need = (list) => (list.length >= 3 ? 2 : list.length ? 1 : 0);
  const a = c.actors.filter((w) => stems.has(w)).length;
  const o = c.objects.filter((w) => stems.has(w)).length;
  // Once the subject is matched, one forbidden object is enough ("persist the refresh token in AsyncStorage").
  const needO = a >= 1 ? Math.min(1, c.objects.length) : need(c.objects);
  return a >= need(c.actors) && o >= needO && a + o >= 2;
}

const near = (s, a, b, gap) => Math.abs(a - b) <= gap;

/** Returns { s, clause, why } for the first work sentence that violates a policy clause, or null. */
export function policyViolation(workText, decision) {
  const clauses = policyClauses(decision);
  if (clauses.length === 0) return null;
  const work = sentences(workText.replace(/\n+/g, '. '));
  const defs = clauses.find((c) => c.defs)?.defs || [];
  const workConcepts = withDefs(workText, defs);

  for (const c of clauses) {
    if (c.kind === 'via') {
      for (const s of work) {
        const hit = c.named.find((n) => {
          const words = n.split(/\s+/).filter((w) => !UMBRELLA.test(w));
          return words.length && words.every((w) => new RegExp(`(?<![A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(s));
        });
        if (!hit) continue;
        const direct = /\b(directly|sdk|client|api|publish\w*|boto3|account key|creds?|credentials)\b|직접/i.test(s);
        const viaGateway = new RegExp(`\\b(?:via|through|using|call\\w*|publish\\w* to|send\\w* to|to)\\s+(?:the\\s+)?${c.gateway}`, 'i').test(s);
        if (direct && !viaGateway && !NEGATED.test(s) && !/\b(?:remov\w*|migrat\w*|replac\w*|mov\w*\s+(?:\S+\s+){0,3}(?:off|away)|instead)\b/i.test(s)) {
          return { s, clause: c, why: `This decision routes this through ${c.gateway}: "${c.text}".`, alias: hit.split(/\s+/).filter((w) => !UMBRELLA.test(w))[0] };
        }
      }
      continue;
    }
    if (c.kind === 'require-words') {
      for (const s of work) {
        const om = STRICT_OMIT.exec(s);
        if (!om) continue;
        // The skipped thing must be named right next to "skip"/"without".
        const around = gloss(tokens(s.slice(Math.max(0, om.index - 30), om.index + om[0].length + 40)));
        const hitReq = (c.head || c.required).some((w) => around.some((t) => wstem(t) === w));
        const workStems = new Set(gloss(tokens(workText)).map(wstem));
        const actorHits = c.actors.filter((w) => workStems.has(w)).length;
        const hitScope = !c.actors.length || actorHits >= (c.actors.length >= 6 ? 2 : 1);
        if (hitReq && hitScope) return { s, clause: c, why: `This work skips what the decision requires: "${c.text}".` };
      }
      continue;
    }
    if (c.kind === 'freeze') {
      for (const s of work) {
        // The day closest to the change verb is when it goes out ("Push Thursday 15:00, live window Friday-Sunday").
        const verb = /\b(push\w*|deploy\w*|ship\w*|release\w*|apply|applies|go live|goes out|starts?|change\w*)\b|배포|적용|시작|돌려|오픈|변경/i.exec(s);
        if (!verb || NEGATED.test(s) || /\broll(?:ing)?\s*back|rollback|revert|롤백|되돌/i.test(workText)) continue;
        const mentions = DAYS.flatMap((re, d) => [...s.matchAll(new RegExp(re.source, 'gi'))].map((m) => ({ d, at: m.index })));
        if (!mentions.length) continue;
        const day = mentions.sort((a, b) => Math.abs(a.at - verb.index) - Math.abs(b.at - verb.index))[0].d;
        if (c.days.includes(day)) return { s, clause: c, why: `The decision freezes changes in this window: "${c.text}".` };
      }
      continue;
    }
    if (c.kind === 'limit') {
      const ws = new Set(gloss(tokens(workText)).map(wstem));
      const hits = c.groups.filter((g) => g.some((w) => ws.has(w))).length;
      if (hits < Math.min(2, c.groups.length)) continue;
      for (const s of work) {
        const over = quantities(s).find((q) => q.secs > c.max);
        if (over && !NEGATED.test(s.slice(0, over.index))) return { s, clause: c, why: `The decision sets a limit: "${c.text}".` };
      }
      continue;
    }
    if (c.kind === 'region') {
      for (const s of work) {
        const other = (s.match(/\b[a-z]{2}-[a-z]+-\d\b/gi) || []).some((r) => r.toLowerCase() !== c.region);
        const subj = !c.subject || new RegExp(`\\b${c.subject}\\b`).test(workText);
        if (other && subj && !NEGATED.test(s) && !/\b(aggregat\w*|anonymi[sz]\w*|counts only|counters only)\b|집계/i.test(workText)) return { s, clause: c, why: `The decision keeps this in ${c.region}: "${c.text}".` };
      }
      continue;
    }
    if (c.kind === 'separate') {
      for (const s of work) {
        if (conceptsIn(s).has('migration') && SAME_RELEASE.test(s) && !NEGATED.test(s.slice(0, SAME_RELEASE.exec(s).index))) {
          return { s, clause: c, why: `The decision requires this in a separate, later release: "${c.text}".` };
        }
      }
      continue;
    }
    // The rule only applies to work inside its scope ("endpoints that move money", "ledger PRs").
    if (c.scope.length && !c.scope.every((k) => workConcepts.has(k))) continue;
    if (c.inherited?.length && !c.inherited.some((k) => workConcepts.has(k))) continue;
    for (const s of work) {
      const sc = withDefs(s, defs);
      // "retry with a fresh request id" when the rule says retries reuse the same key.
      const fk = FRESH_KEY.exec(s);
      const negatedKey = fk && NEGATED.test(s.slice(Math.max(0, fk.index - 30), fk.index + fk[0].length + 12));
      if (c.kind === 'require' && c.same && fk && !negatedKey && (sc.has('retry') || workConcepts.has('retry'))) {
        return { s, clause: c, why: `The decision requires reusing the same value: "${c.text}".` };
      }
      if (c.kind === 'forbid-words') {
        const main = s.split(/\b(?:so that|so|because|since|to avoid)\b|위해|때문/i)[0];
        // Schema work (renaming a price column) is not the data operation a rule like "never edit prices" is about.
        if (sc.has('migration') && !/migrat|schema|column|컬럼/i.test(c.text)) continue;
        const ownRule = /\bon (?:their|his|her|its) own\b|\balone\b|unilateral|without (?:approval|sign-?off)|단독으로/i.test(c.text);
        if (ownRule && /\bapprov\w*|sign-?off|second (?:person|approver)|reviewer|승인/i.test(s)) continue;
        if (wordViolation(c, s, workText) && !COMPLY.test(main)) return { s, clause: c, why: `This decision forbids it: "${c.text}".` };
        continue;
      }
      if (c.kind === 'forbid') {
        const needed = [...new Set([...c.scope, ...c.required])];
        let covered;
        if (c.scope.length && (c.required.length || (c.sinks || []).length)) {
          // "PHI must never be written to logs, metrics, traces or analytics": the subject plus ANY one of the sinks.
          const sinkHit = (c.sinks || []).some((x) => sinkIn(x, s));
          const anyOf = sinkHit || (c.list ? c.required.some((k) => sc.has(k)) : c.required.every((k) => sc.has(k) || workConcepts.has(k)) && c.required.some((k) => sc.has(k)));
          covered = c.scope.every((k) => workConcepts.has(k)) && c.scope.some((k) => sc.has(k)) && anyOf;
        } else {
          // Everything the rule forbids is in this sentence, or all but one of it is and the rest is elsewhere in the work.
          const inSentence = needed.filter((k) => sc.has(k)).length;
          covered = needed.every((k) => workConcepts.has(k)) && inSentence >= Math.max(2, needed.length - 1);
        }
        // Only the main clause counts for compliance: "so installers stop seeing errors" is a reason, not a fix.
        const main = s.split(/\b(?:so that|so|because|since|to avoid)\b|위해|때문/i)[0];
        // "never exported to spreadsheets" is not violated by importing a CSV.
        const backwards = /\b(export|send|share|upload|push|write)\w*/i.test(c.text) && /\b(import\w*|re-?import\w*|ingest\w*|read\w* from|load\w* from)\b/i.test(s) && !/\b(export|send|share|upload|push)\w*/i.test(s);
        if (needed.length >= 2 && covered && !COMPLY.test(main) && !backwards) {
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
