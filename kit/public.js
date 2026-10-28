// Public lesson kit, used on the shared website instead of lesson.js.
// Same questions, math, French glosses and Ask button as the private kit, but:
// nothing is sent anywhere. Progress lives in the visitor's own browser (localStorage).
(function () {
  'use strict';

  const main = document.querySelector('main.lesson');
  if (!main) return;

  // ---------- where am I: <root>/content/<leaf>/lessons/NN-slug.html ----------
  const path = decodeURIComponent(location.pathname);
  const m = path.match(/\/content\/(.+)\/lessons\/(\d+)[^/]*$/);
  const leaf = m ? m[1] : 'unknown';
  const lessonN = m ? Number(m[2]) : 0;
  const root = m ? path.slice(0, path.indexOf('/content/') + 1) : '/';
  const eyebrow = (main.querySelector('.eyebrow')?.textContent || '').trim();
  const title = (main.querySelector('h1')?.textContent || document.title).trim();

  // ---------- local progress ----------
  const KEY = 'learn.progress.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const write = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; } };
  const lessonKey = `${leaf}#${lessonN}`;
  const saved = (read().lessons || {})[lessonKey];

  window.Study = { leaf, lesson: lessonN, event() {}, renderMath: () => {}, toast: (t) => toast(t) };

  // ---------- math ----------
  const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = KATEX + 'katex.min.css';
  document.head.appendChild(css);
  const addScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const opts = { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false };
  addScript(KATEX + 'katex.min.js').then(() => addScript(KATEX + 'contrib/auto-render.min.js')).then(() => {
    window.renderMathInElement(document.body, opts);
    window.Study.renderMath = (el) => window.renderMathInElement(el, opts);
  }).catch(() => {});

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.kit-toast');
    if (!t) { t = document.createElement('div'); t.className = 'kit-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
  }

  // ---------- top bar ----------
  const bar = document.createElement('nav');
  bar.className = 'kit-bar';
  bar.innerHTML = `<a href="${root}content/${leaf}/">‹ Lessons</a><div class="kit-progress" aria-hidden="true"><i></i></div><span class="kit-count"></span>`;
  document.body.prepend(bar);

  const qs = [...main.querySelectorAll('.q')];
  const results = new Map();
  function progress() {
    bar.querySelector('.kit-progress > i').style.width = qs.length ? `${(results.size / qs.length) * 100}%` : '0';
    bar.querySelector('.kit-count').textContent = qs.length ? `${results.size}/${qs.length}` : '';
    const fin = document.querySelector('.kit-score');
    if (fin) renderScore(fin);
  }

  // ---------- Ask: copy context for any AI assistant ----------
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove(); return ok;
    }
  }
  function askButton(contextFn, inline) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'kit-ask' + (inline ? ' inline' : ''); b.textContent = '?';
    b.setAttribute('aria-label', 'Copy this to ask an AI assistant');
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const text = `I'm working through a self-study lesson and have a question.\nLesson: ${title} (${eyebrow})\nPage: ${location.href.split('#')[0]}\nWhere I am: ${contextFn()}\n\nPlease answer briefly, at my level, with a small worked example if it helps.\n\nMy question: `;
      const ok = await copy(text);
      toast(ok ? 'Copied. Paste it into ChatGPT, Claude or any assistant, then type your question.' : 'Copy didn’t work here. Long-press to select the text instead.');
    });
    return b;
  }
  for (const h of main.querySelectorAll('section > h2')) {
    h.appendChild(askButton(() => `the section “${h.firstChild.textContent.trim()}”`, true));
  }

  // ---------- questions ----------
  const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  const strip = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  function verdict(q, ok, extra) {
    let v = q.querySelector('.verdict');
    if (!v) { v = document.createElement('div'); q.insertBefore(v, q.querySelector('.explain') || null); }
    v.className = 'verdict ' + (ok ? 'ok' : 'no');
    v.textContent = (ok ? 'Right' : 'Not quite') + (extra ? ` · ${extra}` : '');
    q.classList.add('answered');
  }
  function record(q, ok) {
    if (results.has(q.dataset.id)) return;
    results.set(q.dataset.id, ok);
    progress();
  }

  qs.forEach((q, i) => {
    if (!q.dataset.id) q.dataset.id = `q${i + 1}`;
    const type = q.dataset.type || (q.querySelector('button') ? 'mcq' : 'self');
    const promptText = (q.querySelector('p')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    q.appendChild(askButton(() => `question ${q.dataset.id}: ${promptText}`));

    if (type === 'mcq') {
      const opts = [...q.querySelectorAll(':scope > button, :scope .options > button')];
      opts.forEach((b) => b.setAttribute('data-option', ''));
      opts.forEach((b) => b.addEventListener('click', () => {
        if (q.classList.contains('locked')) return;
        const ok = b.hasAttribute('data-correct');
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) opts.find((o) => o.hasAttribute('data-correct'))?.classList.add('right');
        q.classList.add('locked');
        verdict(q, ok); record(q, ok);
      }));
    } else if (type === 'num' || type === 'text') {
      const row = document.createElement('div'); row.className = 'kit-row';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = 'ans-' + q.dataset.id; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false;
      if (type === 'num') inp.inputMode = 'decimal';
      inp.setAttribute('aria-label', 'Your answer');
      const go = document.createElement('button'); go.type = 'button'; go.className = 'kit-btn primary'; go.textContent = 'Check';
      row.append(inp, go);
      q.insertBefore(row, q.querySelector('.explain') || null);
      const check = () => {
        const val = inp.value.trim();
        if (!val) return;
        let ok = false, extra = '';
        if (type === 'num') {
          const want = Number(q.dataset.answer), tol = Number(q.dataset.tol || 1e-6);
          const digits = val.replace(',', '.').replace(/[^0-9eE+\-.]/g, '');
          const got = digits ? Number(digits) : NaN;
          ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
          if (!ok) extra = `answer: ${q.dataset.answer}`;
        } else {
          const alts = (q.dataset.answer || '').split('|');
          ok = alts.some((a) => norm(a) === norm(val));
          if (!ok && alts.some((a) => strip(a) === strip(val))) { ok = true; extra = `watch the accents: ${alts[0]}`; }
          else if (!ok) extra = `answer: ${alts[0]}`;
        }
        verdict(q, ok, extra); record(q, ok);
      };
      go.addEventListener('click', check);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    } else {
      const row = document.createElement('div'); row.className = 'kit-row';
      const show = document.createElement('button'); show.type = 'button'; show.className = 'kit-btn'; show.textContent = 'Show answer';
      row.appendChild(show);
      q.insertBefore(row, q.querySelector('.explain') || null);
      show.addEventListener('click', () => {
        q.classList.add('answered'); row.innerHTML = '';
        const mk = (t, ok) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'kit-btn'; b.textContent = t; b.addEventListener('click', () => { row.innerHTML = `<div class="verdict ${ok ? 'ok' : 'no'}">${t}</div>`; record(q, ok); }); return b; };
        row.append(mk('Got it', true), mk('Missed it', false));
        q.appendChild(row);
      });
    }
  });

  // ---------- French: tap a sentence for the translation, a word for its gloss ----------
  main.querySelectorAll('.bi').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('.g')) return;
    el.classList.toggle('open');
  }));
  let glossBox;
  main.querySelectorAll('.g').forEach((g) => g.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!glossBox) { glossBox = document.createElement('div'); glossBox.className = 'kit-gloss'; glossBox.setAttribute('role', 'status'); document.body.appendChild(glossBox); document.addEventListener('click', () => { glossBox.hidden = true; }); }
    glossBox.textContent = g.dataset.gloss; glossBox.hidden = false;
    g.classList.add('seen');
  }));

  // ---------- finish: saved in this browser only ----------
  const fin = document.createElement('section');
  fin.className = 'kit-finish';
  fin.innerHTML = `
    <h2>Finish</h2>
    <div class="kit-score"></div>
    <p class="kit-fine">${saved ? `You finished this lesson before${saved.score != null ? `, scoring ${Math.round(saved.score * 100)}%` : ''}. Finishing again updates your score.` : 'Marking it finished saves your score in this browser, so the lesson list shows what you’ve done.'}</p>
    <button type="button" class="kit-btn primary" id="kit-done">Finish lesson</button>`;
  main.appendChild(fin);
  function renderScore(el) {
    const n = results.size, right = [...results.values()].filter(Boolean).length;
    el.innerHTML = qs.length ? `${right}/${n}<small>${n < qs.length ? `${qs.length - n} questions not tried yet` : 'all questions tried'}</small>` : '<small>No questions in this lesson</small>';
  }
  renderScore(fin.querySelector('.kit-score'));
  fin.querySelector('#kit-done').addEventListener('click', () => {
    const n = results.size, right = [...results.values()].filter(Boolean).length;
    const p = read();
    p.lessons = p.lessons || {};
    p.lessons[lessonKey] = { done: true, score: n ? Math.round((right / n) * 100) / 100 : null, answered: n, total: qs.length, ts: Date.now() };
    const ok = write(p);
    fin.innerHTML = `<h2>${ok ? 'Saved' : 'Finished'}</h2><p style="margin:0">${ok ? 'Your progress is saved in this browser, and this lesson’s flashcards are now in <a href="' + root + 'review.html">Flashcards</a>.' : 'This browser isn’t letting the page save, so your progress won’t be remembered here.'}</p><a class="kit-btn primary" href="${root}content/${leaf}/" style="text-decoration:none">Back to the lesson list</a>`;
  });

  progress();
})();
