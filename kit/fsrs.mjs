// FSRS-5 scheduler (https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm).
// State is never stored: it is replayed from review events in data/log.jsonl.

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
export const RETENTION = 0.9;
const DAY = 86400000;
const RELEARN_MS = 10 * 60000; // "Again" brings the card back in 10 minutes

const clampD = (d) => Math.min(10, Math.max(1, d));
const initS = (g) => Math.max(W[g - 1], 0.1);
const initD = (g) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
export const retrievability = (elapsedDays, s) => Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
const intervalDays = (s) => Math.max(1, Math.round((s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1)));

function nextD(d, g) {
  const delta = -W[6] * (g - 3);
  const d1 = d + delta * (10 - d) / 9;
  return clampD(W[7] * initD(4) + (1 - W[7]) * d1);
}

function recallS(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetS(d, s, r) {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(f, s);
}

const shortTermS = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

// grade: 1 Again, 2 Hard, 3 Good, 4 Easy. ts in ms. Returns a new state.
export function review(state, grade, ts) {
  if (!state) {
    const s = initS(grade);
    const d = initD(grade);
    const due = grade === 1 ? ts + RELEARN_MS : ts + intervalDays(s) * DAY;
    return { s, d, last: ts, due, reps: 1, lapses: 0 };
  }
  const elapsed = Math.max(0, (ts - state.last) / DAY);
  const d = nextD(state.d, grade);
  let s;
  if (elapsed < 1) s = shortTermS(state.s, grade);
  else {
    const r = retrievability(elapsed, state.s);
    s = grade === 1 ? forgetS(state.d, state.s, r) : recallS(state.d, state.s, r, grade);
  }
  s = Math.max(s, 0.1);
  const due = grade === 1 ? ts + RELEARN_MS : ts + intervalDays(s) * DAY;
  return { s, d, last: ts, due, reps: state.reps + 1, lapses: state.lapses + (grade === 1 ? 1 : 0) };
}

// Labels like "10m", "3d", "2mo" for the grade buttons.
export function preview(state, ts) {
  const out = {};
  for (const g of [1, 2, 3, 4]) out[g] = humanize(review(state, g, ts).due - ts);
  return out;
}

export function humanize(ms) {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  const d = ms / DAY;
  if (d < 1) return `${Math.round(m / 60)}h`;
  if (d < 31) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
