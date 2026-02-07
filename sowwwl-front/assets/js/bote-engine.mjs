/* B0te engine: schedule + word filtering/picking (ESM, testable). */

export const DEFAULT_PHASES = Object.freeze([
  { intervalMs: 11_000, quota: 3 },
  { intervalMs: 8_000, quota: 2 },
  { intervalMs: 5_000, quota: 1 },
  { intervalMs: 3_000, quota: 1 },
  { intervalMs: 1_000, quota: Infinity },
]);

export function createInjectionSchedule(phases = DEFAULT_PHASES) {
  const p = Array.isArray(phases) && phases.length ? phases : DEFAULT_PHASES;
  let phaseIndex = 0;
  let injectedInPhase = 0;

  function clampPhase(i) {
    return Math.min(p.length - 1, Math.max(0, i));
  }

  function currentPhase() {
    return p[clampPhase(phaseIndex)];
  }

  return {
    snapshot() {
      const ph = currentPhase();
      const quota = ph.quota;
      const remaining = quota === Infinity ? Infinity : Math.max(0, quota - injectedInPhase);
      return {
        phaseIndex: clampPhase(phaseIndex),
        intervalMs: ph.intervalMs,
        quota: quota,
        injectedInPhase,
        remaining,
      };
    },
    nextDelayMs() {
      return currentPhase().intervalMs;
    },
    recordInjection() {
      const ph = currentPhase();
      injectedInPhase += 1;
      if (ph.quota !== Infinity && injectedInPhase >= ph.quota) {
        phaseIndex = clampPhase(phaseIndex + 1);
        injectedInPhase = 0;
      }
      return this.snapshot();
    },
    reset() {
      phaseIndex = 0;
      injectedInPhase = 0;
      return this.snapshot();
    },
  };
}

function rand01() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

function normalizeToken(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[\u2019']/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, "");
}

export function isAllowedWord(word, bannedSet) {
  const w = normalizeToken(word);
  if (!w) return false;
  if (w.length < 3 || w.length > 14) return false;
  // Avoid mostly numeric tokens.
  if (/^\d+$/.test(w)) return false;
  // Keep it letter-ish.
  if (!/^[\p{L}][\p{L}\p{N}'-]*$/u.test(w)) return false;
  if (bannedSet && bannedSet.has(w)) return false;
  return true;
}

function classWeight(word, lang) {
  const w = normalizeToken(word);
  if (!w) return 0.0;

  if (lang === "fr") {
    // Infinitive verbs (approx)
    if (/(er|ir|re|oir)$/.test(w)) return 2.2;
    // Adjective-ish (approx)
    if (/(eux|euse|able|ible|if|ive|ique|aire|al|elle)$/.test(w)) return 2.0;
    // Noun-ish default
    return 1.4;
  }

  if (lang === "en") {
    if (/^(to\s+)?[a-z]{3,14}$/.test(w) && /(ing|ed)$/.test(w)) return 1.3;
    if (/(ous|ful|less|ive|able)$/.test(w)) return 1.8;
    return 1.4;
  }

  return 1.2;
}

export function pickInjectedWord({ dictionaries, languages, banned, recent } = {}) {
  const dicts = dictionaries || {};
  const langs = Array.isArray(languages) && languages.length ? languages : Object.keys(dicts);
  const bannedSet =
    banned instanceof Set ? banned : new Set(Array.isArray(banned) ? banned.map(normalizeToken) : []);

  const recentSet =
    recent instanceof Set ? recent : new Set(Array.isArray(recent) ? recent.map(normalizeToken) : []);

  const candidates = [];
  langs.forEach((lang) => {
    const words = dicts[lang];
    if (!Array.isArray(words)) return;
    words.forEach((raw) => {
      const w = normalizeToken(raw);
      if (!isAllowedWord(w, bannedSet)) return;
      if (recentSet.has(w)) return;
      candidates.push({ w, lang, weight: classWeight(w, lang) });
    });
  });

  if (!candidates.length) return "";

  const total = candidates.reduce((acc, c) => acc + (Number.isFinite(c.weight) ? c.weight : 1.0), 0);
  let r = rand01() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.w;
  }
  return candidates[candidates.length - 1].w;
}

