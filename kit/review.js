// Flashcard review for the public site. Uses the same FSRS-5 scheduler as the Study app (kit/fsrs.mjs).
// Everything is kept in this browser (localStorage key learn.progress.v1 → reviews).
import { review, preview } from './fsrs.mjs';

const KEY = 'learn.progress.v1';
const NEW_PER_DAY = 15;
const $ = (s) => document.querySelector(s);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; } };
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// math, same as the lessons
const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = KATEX + 'katex.min.css'; document.head.appendChild(link);
const addScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
const mathReady = addScript(KATEX + 'katex.min.js').then(() => addScript(KATEX + 'contrib/auto-render.min.js')).catch(() => {});
const math = (el) => mathReady.then(() => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); });

let cards = [];
let queue = [];
let current = null;
let reviewed = 0;

function buildQueue() {
  const p = read(), done = p.lessons || {}, states = p.reviews || {}, now = Date.now(), today = startOfDay();
  const started = new Set(Object.keys(done).filter((k) => done[k].done).map((k) => k.slice(0, k.lastIndexOf('#'))));
  const unlocked = cards.filter((c) => (c.lesson ? done[`${c.leaf}#${c.lesson}`]?.done : started.has(c.leaf)));
  const due = unlocked.filter((c) => states[c.key] && states[c.key].due <= now).sort((a, b) => states[a.key].due - states[b.key].due);
  const newToday = Object.values(states).filter((s) => s.first >= today).length;
  const fresh = unlocked.filter((c) => !states[c.key]);
  const allowance = Math.max(0, NEW_PER_DAY - newToday);
  const later = unlocked.filter((c) => states[c.key] && states[c.key].due > now).map((c) => states[c.key].due);
  return { queue: [...due, ...fresh.slice(0, allowance)], unlocked: unlocked.length, waitingNew: Math.max(0, fresh.length - allowance), nextDue: later.length ? Math.min(...later) : null };
}

function render() {
  const info = buildQueue();
  if (!queue.length) queue = info.queue;
  current = queue.shift() || null;
  $('#rv-left').textContent = current ? `${queue.length + 1} to go` : '';
  if (!current) {
    $('#rv-card').hidden = true; $('#rv-show').hidden = true; $('#rv-grades').hidden = true;
    const d = $('#rv-done'); d.hidden = false;
    if (!info.unlocked) d.innerHTML = '<strong>No cards yet.</strong><br>Each lesson’s flashcards unlock when you tap <em>Finish lesson</em> at the end of it. <a href="./">Pick a lesson</a>.';
    else {
      const when = info.nextDue ? new Date(info.nextDue) : null;
      const next = when ? (when - Date.now() < 86400000 ? `Next card is due at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : `Next card is due ${when.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}.`) : '';
      d.innerHTML = `<strong>${reviewed ? `Done for now: ${reviewed} card${reviewed === 1 ? '' : 's'} reviewed.` : 'Nothing due right now.'}</strong><br>${next}${info.waitingNew ? ` ${info.waitingNew} new card${info.waitingNew === 1 ? '' : 's'} will unlock tomorrow, ${NEW_PER_DAY} a day.` : ''}`;
    }
    return;
  }
  const st = (read().reviews || {})[current.key];
  $('#rv-done').hidden = true;
  $('#rv-card').hidden = false;
  $('#rv-leaf').textContent = current.leafTitle + (st ? '' : ' · new');
  $('#rv-q').innerHTML = current.q;
  $('#rv-a').innerHTML = current.a;
  $('#rv-a').hidden = true;
  math($('#rv-card'));
  $('#rv-show').hidden = false; $('#rv-grades').hidden = true;
  const pv = preview(st || null, Date.now());
  document.querySelectorAll('#rv-grades button').forEach((b) => { b.querySelector('span').textContent = pv[b.dataset.g]; });
  $('#rv-show').focus({ preventScroll: true });
}

$('#rv-show').addEventListener('click', () => { $('#rv-a').hidden = false; $('#rv-show').hidden = true; $('#rv-grades').hidden = false; });
$('#rv-grades').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-g]');
  if (!b || !current) return;
  const g = Number(b.dataset.g), now = Date.now(), p = read();
  p.reviews = p.reviews || {};
  const prev = p.reviews[current.key];
  p.reviews[current.key] = { ...review(prev || null, g, now), first: prev?.first ?? now };
  write(p);
  reviewed++;
  if (g === 1) queue.push(current); // missed: see it again this session
  render();
});
document.addEventListener('keydown', (e) => {
  if (!current) return;
  if ((e.key === ' ' || e.key === 'Enter') && !$('#rv-show').hidden) { e.preventDefault(); $('#rv-show').click(); }
  if (['1', '2', '3', '4'].includes(e.key) && !$('#rv-grades').hidden) document.querySelector(`#rv-grades [data-g="${e.key}"]`).click();
});

fetch('cards.json', { cache: 'no-cache' }).then((r) => r.json()).then((list) => { cards = list; render(); })
  .catch(() => { $('#rv-done').hidden = false; $('#rv-done').innerHTML = '<strong>Couldn’t load the cards.</strong><br>Check your connection and reload.'; });
