// ── CONFIG ────────────────────────────────────────────────────────────────────
// No API keys here — both ANTHROPIC_API_KEY and API_BIBLE_KEY live in
// Netlify environment variables and are accessed server-side only.
const NASB_BIBLE_ID = '40072c4a5aba4022-01'; // verify in API.Bible dashboard
const NLT_BIBLE_ID  = '65eec8e0b60e656b-01';  // verify in API.Bible dashboard
const INITIAL_SHOW  = 5;

const DEPTH_LABELS = ['Foundational', 'Standard', 'Deep dive'];
const DEPTH_PCTS   = ['0%', '50%', '100%'];

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentTrans = 'WEB';
let currentDepth = 1;
let dropdownOpen = false;
let webBible = {};

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load embedded WEB Bible
  try {
    const res = await fetch('/data/web-bible.json');
    webBible = await res.json();
  } catch (e) {
    console.warn('Could not load WEB Bible data:', e);
  }

  updateDepth(1);

  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });

  document.addEventListener('click', e => {
    if (dropdownOpen && !e.target.closest('#trans-btn') && !e.target.closest('#trans-dropdown')) {
      closeDropdown();
    }
  });
});

// ── DEPTH SLIDER ──────────────────────────────────────────────────────────────
function updateDepth(val) {
  currentDepth = parseInt(val);
  const pct = DEPTH_PCTS[val];
  document.getElementById('slider-fill').style.width = pct;
  document.getElementById('slider-thumb').style.left = pct;
  document.getElementById('depth-slider').value = val;
  for (let i = 0; i < 3; i++) {
    document.getElementById('lbl-' + i).classList.toggle('active', i === currentDepth);
  }
}

// ── TRANSLATION DROPDOWN ──────────────────────────────────────────────────────
function toggleDropdown() {
  dropdownOpen ? closeDropdown() : openDropdown();
}
function openDropdown() {
  dropdownOpen = true;
  document.getElementById('trans-btn').classList.add('open');
  document.getElementById('trans-dropdown').classList.add('open');
}
function closeDropdown() {
  dropdownOpen = false;
  document.getElementById('trans-btn').classList.remove('open');
  document.getElementById('trans-dropdown').classList.remove('open');
}
function selectTrans(t) {
  currentTrans = t;
  document.getElementById('trans-label').textContent = t;
  ['WEB', 'NASB', 'NLT'].forEach(id => {
    document.getElementById('opt-' + id).classList.toggle('selected', id === t);
  });
  const showWarn = t === 'NASB' || t === 'NLT';
  document.getElementById('dd-warn').classList.toggle('visible', showWarn);
  closeDropdown();
}

// ── DARK MODE ─────────────────────────────────────────────────────────────────
let isDark = false;
function toggleDark() {
  isDark = !isDark;
  document.body.classList.toggle('dark', isDark);
  const icon  = document.getElementById('dark-icon');
  const label = document.getElementById('dark-label');
  if (isDark) {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    label.textContent = 'Light mode';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    label.textContent = 'Dark mode';
  }
}

// ── EXAMPLE PILLS ─────────────────────────────────────────────────────────────
function fillExample(ref) {
  document.getElementById('search-input').value = ref;
  runSearch();
}

// ── SECTION COLLAPSE ──────────────────────────────────────────────────────────
function toggleSection(id) {
  const head = document.getElementById('head-' + id);
  const body = document.getElementById('body-' + id);
  const isCollapsed = body.classList.toggle('collapsed');
  head.classList.toggle('collapsed', isCollapsed);
  if (!isCollapsed) {
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

// ── MOBILE SOURCE ACCORDION ───────────────────────────────────────────────────
function toggleMobileSrc() {
  document.getElementById('mob-src-body').classList.toggle('open');
  document.getElementById('mob-src-chev').classList.toggle('open');
}

// ── CARD VERSE EXPAND ─────────────────────────────────────────────────────────
function toggleCard(btn, ref, trans) {
  const wrap = btn.closest('.card').querySelector('.card-verse-wrap');
  const isOpen = wrap.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  btn.querySelector('span').textContent = isOpen ? 'Hide verse' : 'Show verse';

  if (isOpen && !wrap.dataset.loaded) {
    loadVerse(wrap, ref, trans);
  }
}

async function loadVerse(wrap, ref, trans) {
  wrap.dataset.loaded = '1';
  const loadingEl = wrap.querySelector('.card-verse-loading');
  const verseEl   = wrap.querySelector('.card-verse');

  if (trans === 'WEB') {
    const text = getWEBVerse(ref);
    loadingEl.style.display = 'none';
    verseEl.textContent = text || '(Verse not in embedded dataset — try NASB or NLT for full coverage.)';
    verseEl.style.display = 'block';
    return;
  }

  // API.Bible fetch for NASB / NLT — routed through serverless proxy
  try {
    const bibleId = trans === 'NASB' ? NASB_BIBLE_ID : NLT_BIBLE_ID;
    const res = await fetch('/.netlify/functions/claude-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'verse', ref, bibleId })
    });
    if (!res.ok) throw new Error('Proxy error ' + res.status);
    const data = await res.json();
    loadingEl.style.display = 'none';
    verseEl.textContent = data.text || '(Verse text not available.)';
    verseEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    verseEl.textContent = '(Could not fetch verse — check your API.Bible key in Netlify env vars.)';
    verseEl.style.display = 'block';
  }
}

function getWEBVerse(ref) {
  if (!ref) return null;
  const key = ref.toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // Try exact match first, then strip trailing verse range
  return webBible[key]
      || webBible[key.replace(/-\d+$/, '').trim()]
      || webBible[key.split(',')[0].trim()]
      || null;
}

// ── BUILD CARDS ───────────────────────────────────────────────────────────────
function buildCards(results, tagClass, bodyId) {
  const body = document.getElementById(bodyId);
  body.innerHTML = '';

  if (!results || results.length === 0) {
    body.innerHTML = '<div style="padding:14px 16px;font-size:13px;color:var(--t3)">No results in this category.</div>';
    body.style.maxHeight = body.scrollHeight + 'px';
    return;
  }

  const showCount = Math.min(INITIAL_SHOW, results.length);

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    if (i >= showCount) {
      card.className += ' hidden-result';
      card.style.display = 'none';
    }
    const safeRef  = (r.ref  || '').replace(/'/g, "\\'");
    const safeTrans = currentTrans.replace(/'/g, "\\'");
    card.innerHTML = `
      <div class="card-top">
        <span class="card-ref">${r.ref || ''}</span>
        <span class="tag ${tagClass}">${r.tag || ''}</span>
      </div>
      <div class="card-note">
        <span class="note-dot"></span>
        <span>${r.note || ''}</span>
      </div>
      <button class="card-expand-btn" onclick="toggleCard(this,'${safeRef}','${safeTrans}')">
        <span>Show verse</span>
        <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="card-verse-wrap">
        <div class="card-verse-loading">Loading…</div>
        <div class="card-verse" style="display:none"></div>
      </div>`;
    body.appendChild(card);
  });

  if (results.length > showCount) {
    const remaining = results.length - showCount;
    const row = document.createElement('div');
    row.className = 'show-more-row';
    row.innerHTML = `<button class="show-more-btn" onclick="showMore(this,'${bodyId}')">
      Show ${remaining} more
      <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </button>`;
    body.appendChild(row);
  }

  requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + 2000 + 'px'; });
}

function showMore(btn, bodyId) {
  const body = document.getElementById(bodyId);
  body.querySelectorAll('.hidden-result').forEach(c => { c.style.display = ''; });
  btn.closest('.show-more-row').remove();
  body.style.maxHeight = body.scrollHeight + 2000 + 'px';
}

// ── MAIN SEARCH ───────────────────────────────────────────────────────────────
async function runSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  hideError();
  showState('loading');
  document.getElementById('loading-text').textContent = `Finding parallels for "${query}"…`;

  try {
    const data = await fetchParallels(query);

    // Populate source panel
    const sourceText = data.sourceText
      ? data.sourceText
      : (currentTrans === 'WEB' ? (getWEBVerse(query) || '') : '');

    document.getElementById('src-ref').textContent   = query;
    document.getElementById('src-verse').textContent = sourceText;
    document.getElementById('src-badge-el').textContent = currentTrans;
    document.getElementById('mob-src-ref').textContent   = query;
    document.getElementById('mob-src-badge').textContent = currentTrans;
    document.getElementById('mob-src-verse').textContent = sourceText;

    // Stats
    document.getElementById('stat-syn').textContent = (data.synoptic  || []).length;
    document.getElementById('stat-ot').textContent  = (data.ot        || []).length;
    document.getElementById('stat-th').textContent  = (data.thematic  || []).length;
    document.getElementById('ct-synoptic').textContent = (data.synoptic  || []).length;
    document.getElementById('ct-ot').textContent       = (data.ot        || []).length;
    document.getElementById('ct-thematic').textContent = (data.thematic  || []).length;

    buildCards(data.synoptic  || [], 'tag-s', 'body-synoptic');
    buildCards(data.ot        || [], 'tag-o', 'body-ot');
    buildCards(data.thematic  || [], 'tag-t', 'body-thematic');

    // Reset section collapse states
    ['synoptic', 'ot', 'thematic'].forEach(id => {
      const body = document.getElementById('body-' + id);
      const head = document.getElementById('head-' + id);
      body.classList.remove('collapsed');
      head.classList.remove('collapsed');
    });

    document.getElementById('source-sidebar').style.display = '';
    document.getElementById('mob-source').style.display     = '';

    showState('results');
  } catch (err) {
    console.error(err);
    showError(err.message || 'Something went wrong. Check your API keys and try again.');
    showState('empty');
  }
}

// ── API CALL ──────────────────────────────────────────────────────────────────
async function fetchParallels(query) {
  const res = await fetch('/.netlify/functions/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, depth: currentDepth })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  return res.json();
}

// ── STATE MANAGER ─────────────────────────────────────────────────────────────
function showState(state) {
  document.getElementById('empty-state').style.display    = state === 'empty'   ? '' : 'none';
  document.getElementById('loading-state').style.display  = state === 'loading' ? '' : 'none';
  document.getElementById('results-content').style.display= state === 'results' ? '' : 'none';
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = '⚠ ' + msg;
  el.classList.add('visible');
}

function hideError() {
  document.getElementById('error-banner').classList.remove('visible');
}
