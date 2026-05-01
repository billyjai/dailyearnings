// ── Firebase setup
const firebaseConfig = {
  apiKey:            "AIzaSyDgrEANg15JP2blhj162IceUFi9dSoK1NQ",
  authDomain:        "daily-earning-85ced.firebaseapp.com",
  projectId:         "daily-earning-85ced",
  storageBucket:     "daily-earning-85ced.firebasestorage.app",
  messagingSenderId: "614792192006",
  appId:             "1:614792192006:web:2db4602661343a76216387"
};
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();
db.enablePersistence().catch(() => {}); // offline support

const configDoc   = db.collection('data').doc('config');
const entriesColl = db.collection('entries');

// ── Local storage keys (used as instant cache)
const KEY_NAMES   = 'de_itemNames';
const KEY_PRICES  = 'de_itemPrices';
const KEY_ENTRIES = 'de_entries';

// ── State
const state = {
  tab: 0,
  month: new Date(),
  itemNames:  ['SP', 'X-Ray', 'Mouth Wash', 'ID Brush'],
  itemPrices: [170, 300, 0, 0],
  entries: {},
  editDate: null,
  editQty:  [0,0,0,0],
  reportStart: firstOfMonth(new Date()),
  reportEnd:   new Date(),
};

// ── Load: localStorage first (instant), then Firestore (fresh)
function loadData() {
  try {
    const n = localStorage.getItem(KEY_NAMES);
    const p = localStorage.getItem(KEY_PRICES);
    const e = localStorage.getItem(KEY_ENTRIES);
    if (n) state.itemNames  = JSON.parse(n);
    if (p) state.itemPrices = JSON.parse(p);
    if (e) state.entries    = JSON.parse(e);
  } catch(_) {}

  // Fetch fresh data from Firestore in background
  Promise.all([configDoc.get(), entriesColl.get()]).then(([cfg, snap]) => {
    if (cfg.exists) {
      const d = cfg.data();
      if (d.itemNames)  state.itemNames  = d.itemNames;
      if (d.itemPrices) state.itemPrices = d.itemPrices;
    }
    if (!snap.empty) {
      state.entries = {};
      snap.forEach(doc => { state.entries[doc.id] = doc.data(); });
    }
    // Update local cache
    localStorage.setItem(KEY_NAMES,   JSON.stringify(state.itemNames));
    localStorage.setItem(KEY_PRICES,  JSON.stringify(state.itemPrices));
    localStorage.setItem(KEY_ENTRIES, JSON.stringify(state.entries));
    // Re-render with fresh data
    switchTab(state.tab);
  }).catch(() => {});
}

// ── Save config (names + prices)
function saveConfig() {
  localStorage.setItem(KEY_NAMES,  JSON.stringify(state.itemNames));
  localStorage.setItem(KEY_PRICES, JSON.stringify(state.itemPrices));
  configDoc.set({ itemNames: state.itemNames, itemPrices: state.itemPrices }).catch(() => {});
}

// ── Save a single entry
function saveEntryToCloud(key, quantities) {
  localStorage.setItem(KEY_ENTRIES, JSON.stringify(state.entries));
  entriesColl.doc(key).set({ quantities }).catch(() => {});
}

// ── Date helpers
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isToday(key) { return key === dateKey(new Date()); }
function hasEntry(key) {
  const e = state.entries[key];
  return e && e.quantities.some(q => q > 0);
}
function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function fmt(date) {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

// ── Tab navigation
function switchTab(n) {
  state.tab = n;
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', i === n));
  document.querySelectorAll('.view').forEach((v, i) =>
    v.classList.toggle('active', i === n));
  if (n === 0) renderCalendar();
  if (n === 1) renderReport();
  if (n === 2) renderPrices();
}

// ── Calendar view
function renderCalendar() {
  const year  = state.month.getFullYear();
  const month = state.month.getMonth();
  const label = state.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWday   = new Date(year, month, 1).getDay();

  let cells = '';
  for (let i = 0; i < startWday; i++)
    cells += '<div class="day-cell empty"><span class="day-num"></span><span class="entry-dot"></span></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key   = dateKey(new Date(year, month, d));
    const today = isToday(key);
    const has   = hasEntry(key);
    cells += `<div class="day-cell${today ? ' today' : ''}${has ? ' has-entry' : ''}"
      onclick="openEntry('${key}')">
      <span class="day-num">${d}</span>
      <span class="entry-dot"></span>
    </div>`;
  }

  document.getElementById('view-calendar').innerHTML = `
    <div class="header">
      <div class="header-title">Sales Calendar</div>
      <div class="header-sub">Tap a day to record your earnings</div>
    </div>
    <div class="scroll-area">
      <div class="month-nav">
        <button class="nav-btn" onclick="changeMonth(-1)">&#8249;</button>
        <span class="month-label">${label}</span>
        <button class="nav-btn" onclick="changeMonth(1)">&#8250;</button>
      </div>
      <div class="card">
        <div class="weekday-header">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
            `<div class="weekday">${d}</div>`).join('')}
        </div>
        <div class="day-grid">${cells}</div>
      </div>
      <div class="legend">
        <span class="legend-dot accent"></span><span>Has entry</span>
        &nbsp;&nbsp;
        <span class="legend-dot accent"></span><span>Today</span>
      </div>
    </div>`;
}

function changeMonth(offset) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1);
  renderCalendar();
}

// ── Entry sheet
function openEntry(key) {
  state.editDate = key;
  const existing = state.entries[key];
  const qty = existing ? [...existing.quantities] : [0,0,0,0];
  state.editQty = [...qty, 0, 0, 0, 0].slice(0, 4);
  showEntrySheet();
  document.getElementById('modal').removeAttribute('hidden');
}

function closeEntry() {
  document.getElementById('modal').setAttribute('hidden', '');
  state.editDate = null;
}

function adjustQty(i, delta) {
  state.editQty[i] = Math.max(0, state.editQty[i] + delta);
  showEntrySheet();
}

function saveEntry() {
  if (!state.editDate) return;
  const quantities = [...state.editQty];
  state.entries[state.editDate] = { quantities };
  saveEntryToCloud(state.editDate, quantities);
  closeEntry();
  renderCalendar();
}

function entryDayTotal() {
  return state.editQty.reduce((s, q, i) => s + q * (state.itemPrices[i] || 0), 0);
}

function showEntrySheet() {
  const date = new Date(state.editDate + 'T12:00:00');
  const dateLabel = date.toLocaleDateString('en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const rows = state.itemNames.map((name, i) => `
    <div class="item-row${i < 3 ? ' bordered' : ''}">
      <div class="item-info">
        <div class="item-name">${name}</div>
        ${state.itemPrices[i] > 0
          ? `<div class="item-price">@ ${fmtCurrency(state.itemPrices[i])} each</div>` : ''}
      </div>
      <div class="stepper">
        <button class="step-btn minus" onclick="adjustQty(${i},-1)"
          ${state.editQty[i] === 0 ? 'disabled' : ''}>−</button>
        <span class="step-val">${state.editQty[i]}</span>
        <button class="step-btn plus" onclick="adjustQty(${i},1)">+</button>
      </div>
    </div>`).join('');

  document.getElementById('modal').innerHTML = `
    <div class="modal-sheet">
      <div class="modal-toolbar">
        <button class="modal-btn cancel" onclick="closeEntry()">Cancel</button>
        <span class="modal-title">Daily Entry</span>
        <button class="modal-btn save" onclick="saveEntry()">Save</button>
      </div>
      <div class="modal-scroll">
        <div class="card"><div class="date-label">${dateLabel}</div></div>
        <div class="card">
          <div class="section-label">UNITS SOLD</div>
          ${rows}
        </div>
        <div class="card total-card">
          <span class="total-label">Day Total</span>
          <span class="total-amount">${fmtCurrency(entryDayTotal())}</span>
        </div>
      </div>
    </div>`;
}

// ── Report view
function renderReport() {
  const startKey = dateKey(state.reportStart);
  const endKey   = dateKey(state.reportEnd);

  const unitTotals = [0,0,0,0];
  const itemTotals = [0,0,0,0];
  let grand = 0;

  let d = new Date(state.reportStart);
  d.setHours(12, 0, 0, 0);
  const end = new Date(state.reportEnd);
  end.setHours(23, 59, 59, 999);

  while (d <= end) {
    const key = dateKey(d);
    const entry = state.entries[key];
    if (entry) {
      entry.quantities.forEach((q, i) => {
        unitTotals[i] += q;
        const amt = q * (state.itemPrices[i] || 0);
        itemTotals[i] += amt;
        grand += amt;
      });
    }
    d.setDate(d.getDate() + 1);
  }

  const rows = state.itemNames.map((name, i) => `
    <div class="item-row${i < 3 ? ' bordered' : ''}">
      <div class="item-info">
        <div class="item-name">${name}</div>
        <div class="item-price">${unitTotals[i]} units</div>
      </div>
      <div class="report-amount ${itemTotals[i] > 0 ? 'accent' : 'muted'}">
        ${itemTotals[i] > 0 ? fmtCurrency(itemTotals[i]) : '—'}
      </div>
    </div>`).join('');

  document.getElementById('view-report').innerHTML = `
    <div class="header">
      <div class="header-title">Income Report</div>
      <div class="header-sub">Select a period to see your earnings</div>
    </div>
    <div class="scroll-area">
      <div class="card">
        <div class="section-label">PERIOD</div>
        <div class="date-row">
          <span class="date-row-label">From</span>
          <input type="date" class="date-input" value="${startKey}"
            onchange="state.reportStart=new Date(this.value+'T12:00:00');renderReport()">
        </div>
        <div class="divider"></div>
        <div class="date-row">
          <span class="date-row-label">To</span>
          <input type="date" class="date-input" value="${endKey}"
            onchange="state.reportEnd=new Date(this.value+'T12:00:00');renderReport()">
        </div>
      </div>
      <div class="card">
        <div class="section-label">ITEM BREAKDOWN</div>
        ${rows}
      </div>
      <div class="card total-card gradient-card">
        <div>
          <div class="total-label">Total Income</div>
          <div class="total-sub">${fmt(state.reportStart)} – ${fmt(state.reportEnd)}</div>
        </div>
        <div class="grand-total">${fmtCurrency(grand)}</div>
      </div>
    </div>`;
}

// ── Prices view
function renderPrices() {
  const rows = state.itemNames.map((name, i) => `
    <div class="price-row${i < 3 ? ' bordered' : ''}">
      <input class="name-input" type="text" value="${name}" placeholder="Item ${i+1} name"
        oninput="state.itemNames[${i}]=this.value">
      <div class="price-input-wrap">
        <span class="dollar">$</span>
        <input class="price-input" type="number" step="0.01" min="0"
          value="${state.itemPrices[i] > 0 ? state.itemPrices[i] : ''}"
          placeholder="0.00" inputmode="decimal"
          oninput="state.itemPrices[${i}]=parseFloat(this.value)||0">
      </div>
    </div>`).join('');

  document.getElementById('view-prices').innerHTML = `
    <div class="header">
      <div class="header-title">Item Prices</div>
      <div class="header-sub">Set names & prices for your 4 items</div>
    </div>
    <div class="scroll-area">
      <div class="card">
        <div class="section-label">ITEM NAMES & PRICES</div>
        ${rows}
      </div>
      <div class="info-card">
        <span class="info-icon">ⓘ</span>
        <span class="info-text">Prices are used to automatically calculate your daily and monthly revenue.</span>
      </div>
      <button class="save-btn" id="save-prices-btn" onclick="savePrices()">Save Prices</button>
      <button class="logout-btn" onclick="logout()">Sign Out</button>
    </div>`;
}

function savePrices() {
  saveConfig();
  const btn = document.getElementById('save-prices-btn');
  btn.textContent = 'Saved!';
  btn.classList.add('saved');
  setTimeout(() => {
    btn.textContent = 'Save Prices';
    btn.classList.remove('saved');
  }, 2000);
}

// ── Auth
function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  auth.signInWithEmailAndPassword(email, password)
    .catch(() => { errEl.textContent = 'Invalid email or password.'; });
}

function logout() {
  auth.signOut();
}

// ── Boot
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-screen').setAttribute('hidden', '');
    document.getElementById('app').removeAttribute('hidden');
    loadData();
    switchTab(0);
  } else {
    document.getElementById('login-screen').removeAttribute('hidden');
    document.getElementById('app').setAttribute('hidden', '');
  }
});
