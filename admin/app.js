/* GK Beauty Salon · Owner dashboard (/admin)
 * Plain JavaScript + Supabase (publishable key + Row Level Security).
 * All times are shown in Europe/Athens.
 */
(() => {
  'use strict';

  const CFG = window.GK_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const TZ = 'Europe/Athens';
  const app = document.getElementById('app');

  /* =====================================================================
   * Helpers
   * ===================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  function parts(t) {
    const o = {};
    for (const p of fmt.formatToParts(new Date(t))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour % 24, M: +o.minute };
  }
  const ymd = (t) => { const p = parts(t); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
  const hm = (t) => { const p = parts(t); return `${pad(p.H)}:${pad(p.M)}`; };
  const minOfDay = (t) => { const p = parts(t); return p.H * 60 + p.M; };
  function offsetMin(t) {
    const tm = Math.floor(t / 60000) * 60000;
    const p = parts(tm);
    return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.H, p.M) - tm) / 60000);
  }
  // Athens local date + time → real moment (handles summer/winter time)
  function toUtc(day, time) {
    const [y, m, d] = day.split('-').map(Number);
    const [H, M] = time.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, H, M);
    let t = guess - offsetMin(guess) * 60000;
    t = guess - offsetMin(t) * 60000;
    return new Date(t);
  }
  function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function isoDow(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  }
  const today = () => ymd(Date.now());
  const monthStart = (day) => day.slice(0, 7) + '-01';
  function addMonths(day, n) {
    const [y, m] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return t.toISOString().slice(0, 10);
  }
  const daysInMonth = (day) => { const [y, m] = day.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

  const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
  const DAYS3 = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];
  const DAYS1 = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'];
  const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
  const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];

  const dayNum = (day) => +day.slice(8, 10);
  const monthIdx = (day) => +day.slice(5, 7) - 1;
  const dayLabel = (day) => `${DAYS[isoDow(day) - 1]} ${dayNum(day)} ${MONTHS_GEN[monthIdx(day)]}`;
  const dayShort = (day) => `${DAYS3[isoDow(day) - 1]} ${dayNum(day)}/${monthIdx(day) + 1}`;
  const monthLabel = (day) => `${MONTHS[monthIdx(day)]} ${day.slice(0, 4)}`;
  function relDay(day) {
    const t = today();
    if (day === t) return 'Σήμερα';
    if (day === addDays(t, 1)) return 'Αύριο';
    if (day === addDays(t, -1)) return 'Χθες';
    return '';
  }
  const fmtDur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} ώ. ${m} λ.` : `${h} ώ.`) : `${m} λ.`; };
  const shortT = (t) => { const [H, M] = t.slice(0, 5).split(':'); return M === '00' ? String(+H) : `${+H}:${M}`; };
  const money = (v) => (v === null || v === undefined || v === '' ? '' : `${Number(v).toLocaleString('el-GR', { maximumFractionDigits: 2 })}€`);
  const minsBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

  function timeOptions(sel, from = 6 * 60, to = 23 * 60 + 45, step = 15) {
    let h = '';
    let found = false;
    for (let m = from; m <= to; m += step) {
      const v = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      if (v === sel) found = true;
      h += `<option value="${v}"${v === sel ? ' selected' : ''}>${v}</option>`;
    }
    if (sel && !found) h = `<option value="${sel}" selected>${sel}</option>` + h;
    return h;
  }
  function durOptions(sel) {
    const vals = [5, 10];
    for (let m = 15; m <= 360; m += 15) vals.push(m);
    vals.push(420, 480, 540, 600, 660, 720);
    if (sel && !vals.includes(+sel)) vals.push(+sel), vals.sort((a, b) => a - b);
    return vals.map((m) => `<option value="${m}"${m === +sel ? ' selected' : ''}>${fmtDur(m)}</option>`).join('');
  }

  function intlPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10) d = '30' + d;
    return '+' + d;
  }
  const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const smsHref = (phone, body) => `sms:${intlPhone(phone)}${body ? `${isApple ? '&' : '?'}body=${encodeURIComponent(body)}` : ''}`;
  const telHref = (phone) => `tel:${intlPhone(phone)}`;

  const STATUS = {
    pending: 'Αναμονή',
    confirmed: 'Επιβεβαιωμένο',
    completed: 'Ολοκληρώθηκε',
    no_show: 'Δεν ήρθε',
    cancelled: 'Ακυρώθηκε',
  };
  const ACTIVE = ['pending', 'confirmed'];

  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }
  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if ((e && e.code === '23P01') || m.includes('no_overlap')) return 'Υπάρχει ήδη ραντεβού εκείνη την ώρα για αυτή την τεχνίτρια.';
    if (m.includes('Invalid login')) return 'Λάθος email ή κωδικός.';
    if (m.includes('Email not confirmed')) return 'Το email δεν έχει επιβεβαιωθεί.';
    if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed')) return 'Δεν υπάρχει σύνδεση στο internet. Δοκίμασε ξανά.';
    if (e && e.code === '42501') return 'Δεν έχεις πρόσβαση.';
    if (e && e.code === '23503') return 'Δεν γίνεται: χρησιμοποιείται σε ραντεβού. Κάν’ το καλύτερα ανενεργό.';
    return m;
  }

  let toastTimer;
  function toast(msg, bad = false) {
    $('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), bad ? 4500 : 2200);
  }
  const fail = (e) => { console.error(e); toast(errMsg(e), true); };

  /* ---------- bottom sheet ---------- */
  let sheetStack = [];
  function openSheet(title, html) {
    closeSheet();
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    const sh = document.createElement('div');
    sh.className = 'sheet';
    sh.setAttribute('role', 'dialog');
    sh.innerHTML = `<div class="sheet-h"><h2>${esc(title)}</h2><button class="close" data-act="sheet-close" aria-label="Κλείσιμο">✕</button></div><div class="sheet-b">${html}</div>`;
    bd.addEventListener('click', closeSheet);
    document.body.append(bd, sh);
    document.body.style.overflow = 'hidden';
    sheetStack = [bd, sh];
    return sh.querySelector('.sheet-b');
  }
  function closeSheet() {
    sheetStack.forEach((el) => el.remove());
    sheetStack = [];
    document.body.style.overflow = '';
  }
  const sheetBody = () => $('.sheet .sheet-b');
  const setSheetTitle = (t) => { const h = $('.sheet .sheet-h h2'); if (h) h.textContent = t; };

  /* =====================================================================
   * State + catalogue
   * ===================================================================== */
  const S = {
    user: null,
    tab: safeGet('gk_tab') || 'cal',
    day: today(),
    calMode: 'day',
    month: monthStart(today()),
    monthStaff: '',
    remDay: addDays(today(), 1),
    remTpl: null,
    remQueue: null,
    clientSearch: '',
    staff: [], services: [], options: [], links: [], settings: null,
  };
  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  async function loadCatalog() {
    const [staff, services, options, links, settings] = await Promise.all([
      q(sb.from('staff').select('*').order('sort_order').order('id')),
      q(sb.from('services').select('*').order('sort_order').order('id')),
      q(sb.from('service_options').select('*').order('sort_order').order('id')),
      q(sb.from('staff_services').select('*')),
      q(sb.from('booking_settings').select('*').eq('id', 1).maybeSingle()),
    ]);
    Object.assign(S, { staff, services, options, links, settings: settings || {} });
  }
  const staffById = (id) => S.staff.find((s) => s.id === id);
  const svcById = (id) => S.services.find((s) => s.id === id);
  const optsOf = (sid) => S.options.filter((o) => o.service_id === sid);
  const activeStaff = () => S.staff.filter((s) => s.active);
  function staffDoes(staffId, serviceId) {
    const forSvc = S.links.filter((l) => l.service_id === serviceId);
    return forSvc.length === 0 || forSvc.some((l) => l.staff_id === staffId);
  }
  function avatar(s, cls = '') {
    if (!s) return `<span class="av ${cls}">?</span>`;
    if (s.photo_url) return `<img class="av ${cls}" src="${esc(s.photo_url)}" alt="" loading="lazy" />`;
    const ini = s.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return `<span class="av ${cls}">${esc(ini)}</span>`;
  }
  const svcLabel = (a) => [a.service_name, a.option_name].filter(Boolean).join(' · ') || 'Ραντεβού';
  const svcShort = (a) => [a.service_name, a.option_name ? a.option_name.replace(/Νούμερο\s*/i, 'Ν') : ''].filter(Boolean).join(' ');

  function fillTpl(tpl, a) {
    const s = staffById(a.staff_id);
    const day = ymd(a.starts_at);
    const map = {
      '{όνομα}': (a.customer_name || '').trim().split(/\s+/)[0] || '',
      '{ημέρα}': `${DAYS[isoDow(day) - 1]} ${dayNum(day)}/${monthIdx(day) + 1}`,
      '{ώρα}': hm(a.starts_at),
      '{υπηρεσία}': svcLabel(a),
      '{τεχνίτρια}': s ? s.name : '',
    };
    return String(tpl || '').replace(/\{(όνομα|ημέρα|ώρα|υπηρεσία|τεχνίτρια)\}/g, (m) => map[m]);
  }

  /* =====================================================================
   * Auth screens
   * ===================================================================== */
  function viewLogin(msg = '') {
    app.innerHTML = `
      <div class="login"><div class="login-card">
        <img src="/admin/icons/icon-192.png" alt="GK Beauty Salon" />
        <h1>${esc(CFG.salonName)}</h1>
        <p class="muted small">Πίνακας διαχείρισης</p>
        <form id="loginForm">
          <label class="f">Email<input type="email" name="email" autocomplete="username" required inputmode="email" /></label>
          <label class="f">Κωδικός<input type="password" name="password" autocomplete="current-password" required /></label>
          <button class="b b-pri b-block" type="submit">Είσοδος</button>
        </form>
        <button class="linkbtn" data-act="forgot">Ξέχασα τον κωδικό</button>
        ${msg ? `<p class="small" style="margin-top:10px;color:var(--bad)">${esc(msg)}</p>` : ''}
      </div></div>`;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Σύνδεση…';
      const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
      if (error) { btn.disabled = false; btn.textContent = 'Είσοδος'; toast(errMsg(error), true); return; }
      start();
    });
  }
  function viewNoAccess(email) {
    app.innerHTML = `
      <div class="login"><div class="login-card">
        <img src="/admin/icons/icon-192.png" alt="" />
        <h1>Δεν έχεις πρόσβαση</h1>
        <p class="muted small" style="margin:8px 0 16px">Ο λογαριασμός <b>${esc(email)}</b> δεν είναι διαχειριστής του σαλονιού.</p>
        <button class="b b-block" data-act="logout">Αποσύνδεση</button>
      </div></div>`;
  }
  function viewNewPassword() {
    app.innerHTML = `
      <div class="login"><div class="login-card">
        <img src="/admin/icons/icon-192.png" alt="" />
        <h1>Νέος κωδικός</h1>
        <form id="pwForm">
          <label class="f">Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)<input type="password" name="pw" minlength="8" autocomplete="new-password" required /></label>
          <button class="b b-pri b-block" type="submit">Αποθήκευση</button>
        </form>
      </div></div>`;
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('pw') });
      if (error) return toast(errMsg(error), true);
      toast('Ο κωδικός άλλαξε ✓');
      history.replaceState(null, '', '/admin/');
      start();
    });
  }

  /* =====================================================================
   * Shell + tabs
   * ===================================================================== */
  const TABS = [
    ['cal', '📅', 'Ημερολόγιο'],
    ['today', '☀️', 'Σήμερα'],
    ['upcoming', '⏭️', 'Επόμενα'],
    ['month', '🗓️', 'Μήνας'],
    ['clients', '👩', 'Πελάτισσες'],
    ['services', '💅', 'Υπηρεσίες'],
    ['staff', '🎨', 'Τεχνίτριες'],
    ['hours', '🕘', 'Ωράριο'],
    ['settings', '⚙️', 'Ρυθμίσεις'],
  ];
  const VIEWS = {};

  function shell() {
    app.innerHTML = `
      <header class="top">
        <img src="/admin/icons/icon-192.png" alt="" />
        <div class="t"><b>${esc(CFG.salonName)}</b><span>${esc(S.user?.email || '')}</span></div>
        <button class="b b-sm" data-act="logout">Έξοδος</button>
      </header>
      <nav class="tabs">${TABS.map(([k, i, l]) => `<button class="tab" data-act="tab" data-tab="${k}"><i>${i}</i><span>${l}</span></button>`).join('')}</nav>
      <main id="main"></main>
      <button class="fab" data-act="new-appt" aria-label="Νέο ραντεβού">+</button>`;
  }

  let renderSeq = 0;
  async function render() {
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === S.tab));
    const main = $('#main');
    if (!main) return;
    const seq = ++renderSeq;
    if (!main.innerHTML) main.innerHTML = '<div class="loading">Φόρτωση…</div>';
    try {
      const html = await VIEWS[S.tab]();
      if (seq !== renderSeq) return;
      main.innerHTML = html;
      afterRender[S.tab]?.(main);
    } catch (e) {
      if (seq !== renderSeq) return;
      main.innerHTML = `<div class="empty">Κάτι πήγε στραβά: ${esc(errMsg(e))}<br/><br/><button class="b" data-act="reload">Δοκίμασε ξανά</button></div>`;
      console.error(e);
    }
  }
  const afterRender = {};

  /* =====================================================================
   * Appointment list item
   * ===================================================================== */
  function apptRow(a, showDay = false) {
    const s = staffById(a.staff_id);
    const dur = minsBetween(a.starts_at, a.ends_at);
    return `<button class="appt" data-act="appt" data-id="${a.id}">
      <div class="tm">${hm(a.starts_at)}<small>${showDay ? dayShort(ymd(a.starts_at)) : fmtDur(dur)}</small></div>
      <div class="who"><b>${esc(a.customer_name)}</b><span>${esc(svcLabel(a))}${s ? ' · ' + esc(s.name) : ''}</span></div>
      <span class="chip st-${a.status}">${STATUS[a.status]}</span>
    </button>`;
  }

  /* =====================================================================
   * 1. Ημερολόγιο
   * ===================================================================== */
  const PX = 1.3; // pixels per minute

  VIEWS.cal = async () => {
    const day = S.day;
    const wStart = addDays(day, -(isoDow(day) - 1));
    const weekDays = [...Array(7)].map((_, i) => addDays(wStart, i));
    const weekAppts = await q(sb.from('appointments').select('starts_at,status')
      .gte('starts_at', toUtc(wStart, '00:00').toISOString())
      .lt('starts_at', toUtc(addDays(wStart, 7), '00:00').toISOString())
      .neq('status', 'cancelled'));
    const busy = new Set(weekAppts.map((a) => ymd(a.starts_at)));
    const t = today();
    const head = `
      <div class="week">
        <button class="arr" data-act="cal-week" data-n="-7" aria-label="Προηγούμενη εβδομάδα">‹</button>
        ${weekDays.map((d, i) => `<button class="wd${d === day ? ' on' : ''}${d === t ? ' today' : ''}" data-act="cal-day" data-day="${d}"><small>${DAYS1[i]}</small><b>${dayNum(d)}</b><i class="dot${busy.has(d) ? '' : ' no'}"></i></button>`).join('')}
        <button class="arr" data-act="cal-week" data-n="7" aria-label="Επόμενη εβδομάδα">›</button>
      </div>
      <div class="calbar">
        <div class="ttl">${S.calMode === 'day' ? `${relDay(day) ? relDay(day) + ' · ' : ''}${dayLabel(day)}` : `Ομάδα · ${monthLabel(day)}`}</div>
        <button class="b b-sm" data-act="cal-today">Σήμερα</button>
        <input type="date" value="${day}" data-change="cal-pick" aria-label="Διάλεξε ημέρα" />
        <div class="seg"><button class="${S.calMode === 'day' ? 'on' : ''}" data-act="cal-mode" data-mode="day">Ημέρα</button><button class="${S.calMode === 'team' ? 'on' : ''}" data-act="cal-mode" data-mode="team">Μήνας ομάδας</button></div>
      </div>`;
    return head + (S.calMode === 'team' ? await teamMonth(day) : await dayGrid(day));
  };

  async function dayGrid(day) {
    const start = toUtc(day, '00:00');
    const end = toUtc(addDays(day, 1), '00:00');
    const [all, sched, offs] = await Promise.all([
      q(sb.from('appointments').select('*').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at')),
      q(sb.rpc('get_schedule', { p_from: day, p_to: day })),
      q(sb.from('time_off').select('*').lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString())),
    ]);
    const appts = all.filter((a) => a.status !== 'cancelled');
    const cancelled = all.filter((a) => a.status === 'cancelled');
    const ids = new Set(appts.map((a) => a.staff_id));
    const cols = S.staff.filter((s) => s.active || ids.has(s.id));
    if (!cols.length) return `<div class="empty">Δεν υπάρχουν τεχνίτριες. Πρόσθεσε στην καρτέλα «Τεχνίτριες».</div>`;

    const clampMin = (t) => (new Date(t) <= start ? 0 : new Date(t) >= end ? 24 * 60 : minOfDay(t));
    let lo = 8 * 60, hi = 21 * 60;
    for (const r of sched) { lo = Math.min(lo, clampMin(r.starts_at)); hi = Math.max(hi, clampMin(r.ends_at)); }
    for (const a of appts) { lo = Math.min(lo, clampMin(a.starts_at)); hi = Math.max(hi, clampMin(a.ends_at)); }
    lo = Math.floor(lo / 60) * 60; hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
    const H = (hi - lo) * PX;
    const y = (m) => (m - lo) * PX;

    let gutter = '';
    let lines = '';
    for (let m = lo; m <= hi; m += 60) {
      if (m > lo) gutter += `<span style="top:${y(m)}px">${pad(m / 60)}:00</span>`;
      lines += `<div class="hl" style="top:${y(m)}px"></div>`;
    }

    const colsHtml = cols.map((s) => {
      const work = sched.filter((r) => r.staff_id === s.id).map((r) => {
        const a = clampMin(r.starts_at), b = clampMin(r.ends_at);
        return `<div class="work" style="top:${y(a)}px;height:${(b - a) * PX}px"></div>`;
      }).join('');
      const off = offs.filter((o) => o.staff_id === null || o.staff_id === s.id).map((o) => {
        const a = clampMin(o.starts_at), b = clampMin(o.ends_at);
        return `<div class="off" style="top:${y(Math.max(a, lo))}px;height:${(Math.min(b, hi) - Math.max(a, lo)) * PX}px">⛔ ${esc(o.reason || 'Κλειστό')}</div>`;
      }).join('');
      const blocks = appts.filter((a) => a.staff_id === s.id).map((a) => {
        const a0 = clampMin(a.starts_at), a1 = clampMin(a.ends_at);
        const dur = minsBetween(a.starts_at, a.ends_at);
        const h = Math.max((a1 - a0) * PX, 22);
        if (dur <= 40) {
          return `<button class="blk short ${a.status}" style="top:${y(a0)}px;height:${h}px" data-act="appt" data-id="${a.id}"><b>${hm(a.starts_at)}</b><span>${esc(a.customer_name)} · ${esc(svcShort(a))}</span></button>`;
        }
        return `<button class="blk ${a.status}" style="top:${y(a0)}px;height:${h}px" data-act="appt" data-id="${a.id}"><b>${hm(a.starts_at)}–${hm(a.ends_at)}</b><span>${esc(a.customer_name)}</span><span>${esc(svcShort(a))}</span><span class="muted">${fmtDur(dur)}</span></button>`;
      }).join('');
      return `<div class="col" data-act="cal-slot" data-staff="${s.id}" data-lo="${lo}">${work}${lines}${off}${blocks}</div>`;
    }).join('');

    let now = '';
    if (day === today()) {
      const m = minOfDay(Date.now());
      if (m >= lo && m <= hi) now = `<div class="nowline" style="top:${y(m)}px"></div>`;
    }

    return `
      <div class="cal">
        <div class="cal-head"><div class="g"></div>${cols.map((s) => `<div class="ch">${avatar(s)}<span>${esc(s.name)}</span></div>`).join('')}</div>
        <div class="cal-body" style="height:${H}px"><div class="g">${gutter}</div>${colsHtml}${now}</div>
      </div>
      <div class="legend">
        <span><i style="background:var(--tc-soft);border-left:3px solid var(--tc)"></i>Ραντεβού</span>
        <span><i style="background:var(--warn-soft)"></i>Αναμονή</span>
        <span><i style="background:repeating-linear-gradient(135deg,#f1eeee 0 3px,#e2dede 3px 6px)"></i>Δεν δουλεύει</span>
        <span><i style="background:#d9d6d6"></i>Κλειστό/διάλειμμα</span>
        <span><i style="background:#e53935;height:3px"></i>Τώρα</span>
      </div>
      <p class="muted small" style="margin-top:6px">Πάτα σε κενό σημείο για νέο ραντεβού σε εκείνη την ώρα.</p>
      ${cancelled.length ? `<div class="sec"><h3>Ακυρωμένα (${cancelled.length})</h3>${cancelled.map((a) => apptRow(a)).join('')}</div>` : ''}`;
  }

  async function teamMonth(day) {
    const first = monthStart(day);
    const n = daysInMonth(day);
    const last = addDays(first, n - 1);
    const from = toUtc(first, '00:00').toISOString();
    const to = toUtc(addDays(last, 1), '00:00').toISOString();
    const [sched, appts, offs] = await Promise.all([
      q(sb.rpc('get_schedule', { p_from: first, p_to: last })),
      q(sb.from('appointments').select('staff_id,starts_at,status').gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelled')),
      q(sb.from('time_off').select('*').lt('starts_at', to).gt('ends_at', from)),
    ]);
    const cols = activeStaff();
    if (!cols.length) return `<div class="empty">Δεν υπάρχουν ενεργές τεχνίτριες.</div>`;
    const totals = Object.fromEntries(cols.map((s) => [s.id, { appts: 0, days: 0 }]));
    const t = today();
    let rows = '';
    for (let i = 0; i < n; i++) {
      const d = addDays(first, i);
      const dS = toUtc(d, '00:00'), dE = toUtc(addDays(d, 1), '00:00');
      const dow = isoDow(d);
      rows += `<tr class="${dow >= 6 ? 'we' : ''}${d === t ? ' today' : ''}" data-act="cal-open-day" data-day="${d}"><td>${DAYS3[dow - 1]} ${dayNum(d)}</td>`;
      for (const s of cols) {
        const iv = sched.filter((r) => r.staff_id === s.id && r.day === d);
        const closed = offs.some((o) => (o.staff_id === null || o.staff_id === s.id) && new Date(o.starts_at) <= dS && new Date(o.ends_at) >= dE);
        const partial = !closed && offs.some((o) => o.staff_id === null || o.staff_id === s.id ? new Date(o.starts_at) < dE && new Date(o.ends_at) > dS : false);
        const cnt = appts.filter((a) => a.staff_id === s.id && ymd(a.starts_at) === d).length;
        totals[s.id].appts += cnt;
        let txt;
        if (closed) txt = '⛔';
        else if (!iv.length) txt = '<span class="rep">Ρεπό</span>';
        else { totals[s.id].days++; txt = iv.map((r) => `${shortT(hm(r.starts_at))}–${shortT(hm(r.ends_at))}`).join('<br/>') + (partial ? ' ⛔' : ''); }
        rows += `<td>${txt}${cnt ? `<br/><span class="cnt">${cnt}</span>` : ''}</td>`;
      }
      rows += '</tr>';
    }
    return `
      <div class="monthnav"><button data-act="cal-month" data-n="-1" aria-label="Προηγούμενος μήνας">‹</button><b>${monthLabel(first)}</b><button data-act="cal-month" data-n="1" aria-label="Επόμενος μήνας">›</button></div>
      <table class="tm-table">
        <thead><tr><th>Ημέρα</th>${cols.map((s) => `<th>${avatar(s)}<span>${esc(s.name)}</span></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Σύνολο</td>${cols.map((s) => `<td>${totals[s.id].appts} ραντ.<br/>${totals[s.id].days} ημ.</td>`).join('')}</tr></tfoot>
      </table>
      <p class="muted small" style="margin-top:6px">Πάτα μια ημέρα για να την ανοίξεις. Ο αριθμός = ραντεβού.</p>`;
  }

  /* =====================================================================
   * 2. Σήμερα + κέντρο υπενθυμίσεων
   * ===================================================================== */
  VIEWS.today = async () => {
    const t = today();
    const tS = toUtc(t, '00:00').toISOString();
    const tomS = toUtc(addDays(t, 1), '00:00').toISOString();
    const tomE = toUtc(addDays(t, 2), '00:00').toISOString();
    const remS = toUtc(S.remDay, '00:00').toISOString();
    const remE = toUtc(addDays(S.remDay, 1), '00:00').toISOString();
    const [todayA, tomA, next, remA] = await Promise.all([
      q(sb.from('appointments').select('*').gte('starts_at', tS).lt('starts_at', tomS).neq('status', 'cancelled').order('starts_at')),
      q(sb.from('appointments').select('id').gte('starts_at', tomS).lt('starts_at', tomE).in('status', ACTIVE)),
      q(sb.from('appointments').select('*').gt('starts_at', new Date().toISOString()).in('status', ACTIVE).order('starts_at').limit(1)),
      q(sb.from('appointments').select('*').gte('starts_at', remS).lt('starts_at', remE).in('status', ACTIVE).order('starts_at')),
    ]);
    if (S.remTpl === null) S.remTpl = S.settings.sms_reminder || '';
    remFirst = remA[0] || null;
    const nx = next[0];
    const queue = S.remQueue && S.remQueue.day === S.remDay ? S.remQueue : null;
    return `
      <h2>${dayLabel(t)}</h2>
      <div class="stats">
        <div class="stat"><b>${todayA.length}</b><span>σήμερα</span></div>
        <div class="stat"><b>${tomA.length}</b><span>αύριο</span></div>
        <div class="stat"><b>${todayA.filter((a) => a.status === 'completed').length}</b><span>ολοκληρώθηκαν</span></div>
      </div>
      ${nx ? `<button class="next b-block" data-act="appt" data-id="${nx.id}" style="border:0;text-align:left;width:100%"><small>Επόμενο ραντεβού · ${relDay(ymd(nx.starts_at)) || dayShort(ymd(nx.starts_at))}</small><b>${hm(nx.starts_at)} · ${esc(nx.customer_name)}</b><small>${esc(svcLabel(nx))} · ${esc(staffById(nx.staff_id)?.name || '')}</small></button>` : ''}
      <div class="sec-h"><h3>Τα σημερινά ραντεβού</h3></div>
      ${todayA.length ? todayA.map((a) => apptRow(a)).join('') : '<div class="empty">Κανένα ραντεβού σήμερα.</div>'}

      <div class="sec-h"><h3>⏰ Κέντρο υπενθυμίσεων</h3></div>
      <div class="card stack">
        <label class="f">Ημέρα ραντεβού<input type="date" value="${S.remDay}" data-change="rem-day" /></label>
        <label class="f">Μήνυμα
          <textarea id="remTpl" data-input="rem-tpl">${esc(S.remTpl)}</textarea>
        </label>
        <div class="ph">${['{όνομα}', '{ημέρα}', '{ώρα}', '{υπηρεσία}', '{τεχνίτρια}'].map((p) => `<button data-act="ph" data-target="remTpl" data-ph="${p}">${p}</button>`).join('')}</div>
        ${remA[0] ? `<div><span class="muted small">Προεπισκόπηση:</span><div class="preview" id="remPreview">${esc(fillTpl(S.remTpl, remA[0]))}</div></div>` : ''}
        <div>
          ${remA.length ? remA.map((a) => `
            <label class="rem"><input type="checkbox" class="remChk" value="${a.id}" ${a.reminder_sent_at ? '' : 'checked'} />
              <div class="who"><b>${hm(a.starts_at)} · ${esc(a.customer_name)}</b><span>${esc(svcLabel(a))}</span></div>
              ${a.reminder_sent_at ? '<span class="sent">✓ Στάλθηκε</span>' : '<span></span>'}
            </label>`).join('') : '<div class="empty">Δεν υπάρχουν ραντεβού αυτή την ημέρα.</div>'}
        </div>
        ${remA.length ? (queue
          ? `<button class="b b-pri b-block" data-act="rem-next">📩 Επόμενη ${queue.i + 1}/${queue.ids.length}</button><button class="b b-block" data-act="rem-stop">Τέλος αποστολής</button>`
          : `<button class="b b-pri b-block" data-act="rem-start">📩 Αποστολή υπενθυμίσεων</button>`) : ''}
        <button class="b b-sm b-soft" data-act="rem-save-tpl">Αποθήκευση μηνύματος ως προεπιλογή</button>
        <p class="muted small">Ανοίγει τα Μηνύματα του κινητού με έτοιμο κείμενο. Πατάς «Αποστολή» και γυρνάς εδώ για την επόμενη.</p>
      </div>`;
  };

  /* =====================================================================
   * 3. Επόμενα ραντεβού
   * ===================================================================== */
  VIEWS.upcoming = async () => {
    const rows = await q(sb.from('appointments').select('*').gte('starts_at', toUtc(today(), '00:00').toISOString())
      .in('status', ACTIVE).order('starts_at').limit(500));
    if (!rows.length) return '<h2>Επόμενα ραντεβού</h2><div class="empty">Δεν υπάρχουν επόμενα ραντεβού.</div>';
    let html = `<h2>Επόμενα ραντεβού (${rows.length})</h2>`;
    let curM = '', curD = '';
    for (const a of rows) {
      const d = ymd(a.starts_at);
      if (d.slice(0, 7) !== curM) { curM = d.slice(0, 7); html += `<div class="monthgroup">${monthLabel(d)}</div>`; }
      if (d !== curD) { curD = d; html += `<div class="daygroup">${relDay(d) ? relDay(d) + ' · ' : ''}${dayLabel(d)}</div>`; }
      html += apptRow(a);
    }
    return html;
  };

  /* =====================================================================
   * 4. Μήνας
   * ===================================================================== */
  VIEWS.month = async () => {
    const first = S.month;
    const n = daysInMonth(first);
    const from = toUtc(first, '00:00').toISOString();
    const to = toUtc(addMonths(first, 1), '00:00').toISOString();
    let qb = sb.from('appointments').select('staff_id,starts_at,status').gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelled');
    if (S.monthStaff) qb = qb.eq('staff_id', +S.monthStaff);
    const [appts, offs] = await Promise.all([q(qb), q(sb.from('time_off').select('*').lt('starts_at', to).gt('ends_at', from).is('staff_id', null))]);
    const counts = {};
    appts.forEach((a) => { const d = ymd(a.starts_at); counts[d] = (counts[d] || 0) + 1; });
    const lead = isoDow(first) - 1;
    const t = today();
    let cells = DAYS1.map((d) => `<div class="h">${d}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += '<div class="d x"></div>';
    for (let i = 0; i < n; i++) {
      const d = addDays(first, i);
      const dS = toUtc(d, '00:00'), dE = toUtc(addDays(d, 1), '00:00');
      const closed = offs.some((o) => new Date(o.starts_at) <= dS && new Date(o.ends_at) >= dE);
      cells += `<button class="d${d === t ? ' today' : ''}${closed ? ' closed' : ''}" data-act="cal-open-day" data-day="${d}"><b>${i + 1}</b>${closed ? '<span class="s">⛔ Κλειστά</span>' : ''}${counts[d] ? `<span class="n">${counts[d]}</span>` : ''}</button>`;
    }
    return `
      <div class="monthnav"><button data-act="month-nav" data-n="-1" aria-label="Προηγούμενος μήνας">‹</button><b>${monthLabel(first)}</b><button data-act="month-nav" data-n="1" aria-label="Επόμενος μήνας">›</button></div>
      <label class="f" style="margin-bottom:10px">Τεχνίτρια
        <select data-change="month-staff"><option value="">Όλες</option>${S.staff.map((s) => `<option value="${s.id}"${String(s.id) === S.monthStaff ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      </label>
      <div class="mg">${cells}</div>
      <p class="muted small" style="margin-top:8px">Σύνολο μήνα: <b>${appts.length}</b> ραντεβού. Πάτα μια ημέρα για να δεις το ημερολόγιό της.</p>`;
  };

  /* =====================================================================
   * 5. Πελάτισσες
   * ===================================================================== */
  let clientsCache = null;
  VIEWS.clients = async () => {
    const rows = await q(sb.from('appointments').select('id,customer_name,phone,phone_norm,starts_at,status,service_name,staff_id').order('starts_at', { ascending: false }).limit(5000));
    const now = Date.now();
    const map = new Map();
    for (const a of rows) {
      const k = a.phone_norm || a.phone;
      if (!map.has(k)) map.set(k, { name: a.customer_name, phone: a.phone, visits: 0, noShow: 0, last: null, next: null, svc: {}, stf: {}, total: 0 });
      const c = map.get(k);
      c.total++;
      const t = new Date(a.starts_at).getTime();
      if (a.status === 'no_show') c.noShow++;
      if (a.status === 'completed' || (a.status === 'confirmed' && t < now)) {
        c.visits++;
        if (!c.last || t > c.last) c.last = t;
      }
      if (ACTIVE.includes(a.status) && t >= now && (!c.next || t < c.next)) c.next = t;
      if (a.status !== 'cancelled') {
        if (a.service_name) c.svc[a.service_name] = (c.svc[a.service_name] || 0) + 1;
        c.stf[a.staff_id] = (c.stf[a.staff_id] || 0) + 1;
      }
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0];
    clientsCache = [...map.values()].map((c) => ({ ...c, usualSvc: top(c.svc), usualStaff: staffById(+top(c.stf))?.name }))
      .sort((a, b) => b.visits - a.visits || b.total - a.total || (b.last || 0) - (a.last || 0));
    return `
      <h2>Πελάτισσες (${clientsCache.length})</h2>
      <input type="search" placeholder="🔍 Αναζήτηση με όνομα ή τηλέφωνο" value="${esc(S.clientSearch)}" data-input="client-search" style="margin-bottom:10px" />
      <div id="clientList">${clientList()}</div>`;
  };
  function clientList() {
    const s = S.clientSearch.trim().toLowerCase();
    const sd = s.replace(/\D/g, '');
    const list = clientsCache.filter((c) => !s || c.name.toLowerCase().includes(s) || (sd && c.phone.replace(/\D/g, '').includes(sd)));
    if (!list.length) return '<div class="empty">Δεν βρέθηκε πελάτισσα.</div>';
    const d = (t) => (t ? dayShort(ymd(t)) : '—');
    return list.slice(0, 300).map((c) => `
      <div class="card client">
        <div class="nm"><b>${c.visits >= 5 ? '⭐ ' : ''}${esc(c.name)}</b>
          <a class="b b-sm" href="${telHref(c.phone)}" aria-label="Κλήση">📞</a>
          <a class="b b-sm" href="${smsHref(c.phone, '')}" aria-label="SMS">💬</a></div>
        <div class="muted small">${esc(c.phone)}</div>
        <div class="kv">
          <div><span>Επισκέψεις:</span> <b>${c.visits}</b></div>
          <div><span>Δεν ήρθε:</span> <b style="color:${c.noShow ? 'var(--bad)' : 'inherit'}">${c.noShow}</b></div>
          <div><span>Τελευταία:</span> ${d(c.last)}</div>
          <div><span>Επόμενο:</span> ${c.next ? `<b>${d(c.next)} ${hm(c.next)}</b>` : '—'}</div>
          <div><span>Συνήθως:</span> ${esc(c.usualSvc || '—')}</div>
          <div><span>Με:</span> ${esc(c.usualStaff || '—')}</div>
        </div>
      </div>`).join('');
  }

  /* =====================================================================
   * 6. Υπηρεσίες & τιμές
   * ===================================================================== */
  VIEWS.services = async () => {
    await loadCatalog();
    const cards = S.services.map((s) => {
      const opts = optsOf(s.id);
      return `
      <div class="card svc" data-svc="${s.id}">
        <div class="svc-h"><b>${esc(s.name)}</b>${s.active ? '' : '<span class="chip st-cancelled">Ανενεργή</span>'}
          <button class="b b-sm" data-act="svc-move" data-id="${s.id}" data-n="-1" aria-label="Πάνω">↑</button>
          <button class="b b-sm" data-act="svc-move" data-id="${s.id}" data-n="1" aria-label="Κάτω">↓</button></div>
        <details class="fold"${opts.length ? '' : ''}>
          <summary>Επεξεργασία</summary>
          <div class="stack" style="margin-top:8px">
            <label class="f">Όνομα<input name="name" value="${esc(s.name)}" /></label>
            <label class="f">Όνομα στα αγγλικά (για /en)<input name="name_en" value="${esc(s.name_en || '')}" /></label>
            <div class="grid2">
              <label class="f">Διάρκεια<select name="duration_min">${durOptions(s.duration_min)}</select></label>
              <label class="f">Τιμή (€)<input name="price" inputmode="decimal" value="${s.price ?? ''}" /></label>
            </div>
            <div class="grid2">
              <label class="f">Προετοιμασία μετά<select name="buffer_min">${[0, 5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}"${m === s.buffer_min ? ' selected' : ''}>${m ? fmtDur(m) : 'Καθόλου'}</option>`).join('')}</select></label>
              <label class="f">Προκαταβολή (€)<input name="deposit" inputmode="decimal" value="${s.deposit ?? 0}" /></label>
            </div>
            <label class="f">Περιγραφή<textarea name="description" rows="2">${esc(s.description || '')}</textarea></label>
            <label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''} /> Ενεργή (φαίνεται στο site)</label>
            <div class="btns"><button class="b b-pri" data-act="svc-save" data-id="${s.id}">Αποθήκευση</button><button class="b b-bad" data-act="svc-del" data-id="${s.id}">Διαγραφή</button></div>
          </div>
        </details>
        <details class="fold"${opts.length ? ' open' : ''}>
          <summary>Επιλογές / νούμερα (${opts.length})</summary>
          <p class="muted small" style="margin:4px 0 8px">${opts.length ? 'Η πελάτισσα διαλέγει νούμερο. Διάρκεια και τιμή έρχονται από το νούμερο.' : 'Χωρίς επιλογές: ισχύουν η διάρκεια και η τιμή της υπηρεσίας.'}</p>
          <div class="opts">${opts.map((o) => optRow(o)).join('')}</div>
          ${opts.length ? `<div class="row" style="margin-top:8px"><button class="b b-sm" data-act="opt-add" data-svc="${s.id}">+ Επιλογή</button><span class="grow"></span><button class="b b-sm b-pri" data-act="opt-save" data-svc="${s.id}">Αποθήκευση επιλογών</button></div>`
            : `<button class="b b-sm" data-act="opt-add" data-svc="${s.id}">+ Πρόσθεσε επιλογές (π.χ. Νούμερο 1)</button>`}
        </details>
      </div>`;
    }).join('');
    return `
      <div class="sec-h"><h2>Υπηρεσίες & τιμές</h2><button class="b b-sm b-pri" data-act="svc-new">+ Νέα</button></div>
      ${cards || '<div class="empty">Δεν υπάρχουν υπηρεσίες.</div>'}`;
  };
  function optRow(o) {
    return `<div class="opt" data-opt="${o.id || ''}">
      <input name="name" value="${esc(o.name)}" aria-label="Όνομα επιλογής" />
      <select name="duration_min" aria-label="Διάρκεια">${durOptions(o.duration_min)}</select>
      <input name="price" inputmode="decimal" value="${o.price ?? ''}" aria-label="Τιμή" placeholder="€" />
      <button class="x" data-act="opt-del" aria-label="Διαγραφή">✕</button>
    </div>`;
  }
  const num = (v) => { const s = String(v ?? '').replace(',', '.').trim(); return s === '' ? null : Number(s); };

  /* =====================================================================
   * 7. Τεχνίτριες
   * ===================================================================== */
  VIEWS.staff = async () => {
    await loadCatalog();
    const hours = await q(sb.from('staff_hours').select('*').order('weekday').order('start_time'));
    const cards = S.staff.map((s) => {
      const mine = hours.filter((h) => h.staff_id === s.id);
      return `
      <div class="card" data-staff="${s.id}">
        <div class="staff-h">
          ${avatar(s, 'lg')}
          <div class="grow" style="min-width:0">
            <b style="font-size:1.05rem">${esc(s.name)}</b> ${s.active ? '' : '<span class="chip st-cancelled">Ανενεργή</span>'}
            <div class="muted small">${esc(s.role || '')}</div>
            <label class="b b-sm photo-btn" style="margin-top:6px">📷 Φωτογραφία<input type="file" accept="image/*" data-change="staff-photo" data-id="${s.id}" /></label>
          </div>
        </div>
        <button class="b b-soft b-block" style="margin-top:12px" data-act="staff-cal" data-id="${s.id}">📅 Ημερολόγιο της ${esc(s.name)}</button>
        <details class="fold"><summary>Στοιχεία</summary>
          <div class="stack" style="margin-top:8px">
            <label class="f">Όνομα<input name="name" value="${esc(s.name)}" /></label>
            <label class="f">Ρόλος / τίτλος<input name="role" value="${esc(s.role || '')}" placeholder="π.χ. Nail artist" /></label>
            <label class="f">Σειρά εμφάνισης<input name="sort_order" inputmode="numeric" value="${s.sort_order}" /></label>
            <label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''} /> Ενεργή (φαίνεται στο site)</label>
            <div class="btns"><button class="b b-pri" data-act="staff-save" data-id="${s.id}">Αποθήκευση</button><button class="b b-bad" data-act="staff-del" data-id="${s.id}">Διαγραφή</button></div>
          </div>
        </details>
        <details class="fold"><summary>Υπηρεσίες που κάνει</summary>
          <p class="muted small" style="margin:4px 0 8px">Πάτα για να αλλάξεις (αποθηκεύεται αμέσως). Αν μια υπηρεσία δεν έχει καμία τεχνίτρια, την κάνουν όλες.</p>
          <div class="chips">${S.services.map((v) => `<button class="${S.links.some((l) => l.staff_id === s.id && l.service_id === v.id) ? 'on' : ''}" data-act="staff-svc" data-staff="${s.id}" data-svc="${v.id}">${esc(v.name)}</button>`).join('')}</div>
        </details>
        <details class="fold"><summary>Εβδομαδιαίο ωράριο</summary>
          <p class="muted small" style="margin:4px 0 8px">${mine.length ? 'Πολλά διαστήματα την ίδια μέρα = σπαστό ωράριο.' : 'Χωρίς δικό της ωράριο ακολουθεί το ωράριο του καταστήματος.'}</p>
          ${weekEditor(mine, 'start_time', 'end_time')}
          <div class="btns" style="margin-top:10px">
            <button class="b b-pri" data-act="staff-hours-save" data-id="${s.id}">Αποθήκευση ωραρίου</button>
            <button class="b" data-act="staff-hours-copy" data-id="${s.id}">Όπως το κατάστημα</button>
          </div>
        </details>
      </div>`;
    }).join('');
    return `<div class="sec-h"><h2>Τεχνίτριες</h2><button class="b b-sm b-pri" data-act="staff-new">+ Νέα</button></div>${cards || '<div class="empty">Δεν υπάρχουν τεχνίτριες.</div>'}`;
  };

  /* ---------- weekly hours editor (shared) ---------- */
  function ivRow(s = '09:00', e = '17:00') {
    return `<div class="iv"><select class="s" aria-label="Από">${timeOptions(s)}</select><span>–</span><select class="e" aria-label="Έως">${timeOptions(e)}</select><button class="x" data-act="iv-del" aria-label="Αφαίρεση">✕</button></div>`;
  }
  function weekEditor(rows, ks, ke) {
    return `<div class="wk">${DAYS.map((name, i) => {
      const r = rows.filter((x) => x.weekday === i + 1);
      return `<div class="wkd" data-wd="${i + 1}"><b>${name}</b><div class="ivs">${r.map((x) => ivRow(x[ks].slice(0, 5), x[ke].slice(0, 5))).join('') || '<div class="closed-lbl">Κλειστά</div>'}<button class="addiv" data-act="iv-add">+ ώρες</button></div></div>`;
    }).join('')}</div>`;
  }
  function readWeek(root) {
    const out = [];
    for (const d of $$('.wkd', root)) {
      for (const iv of $$('.iv', d)) {
        const s = $('.s', iv).value, e = $('.e', iv).value;
        if (e <= s) throw new Error(`${DAYS[+d.dataset.wd - 1]}: η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.`);
        out.push({ weekday: +d.dataset.wd, s, e });
      }
    }
    return out;
  }
  function readIntervals(root) {
    return $$('.iv', root).map((iv) => {
      const s = $('.s', iv).value, e = $('.e', iv).value;
      if (e <= s) throw new Error('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
      return { s, e };
    });
  }

  /* ---------- technician month calendar (sheet) ---------- */
  async function staffCalendar(staffId, month) {
    const s = staffById(staffId);
    const first = monthStart(month);
    const n = daysInMonth(first);
    const last = addDays(first, n - 1);
    const from = toUtc(first, '00:00').toISOString();
    const to = toUtc(addDays(last, 1), '00:00').toISOString();
    const body = sheetBody() || openSheet(`Ημερολόγιο · ${s.name}`, '<div class="loading">Φόρτωση…</div>');
    setSheetTitle(`Ημερολόγιο · ${s.name}`);
    const [sched, over, appts, offs] = await Promise.all([
      q(sb.rpc('get_schedule', { p_from: first, p_to: last })),
      q(sb.from('staff_day_hours').select('day').eq('staff_id', staffId).gte('day', first).lte('day', last)),
      q(sb.from('appointments').select('starts_at').eq('staff_id', staffId).gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelled')),
      q(sb.from('time_off').select('*').lt('starts_at', to).gt('ends_at', from)),
    ]);
    const overSet = new Set(over.map((o) => o.day));
    const cnt = {};
    appts.forEach((a) => { const d = ymd(a.starts_at); cnt[d] = (cnt[d] || 0) + 1; });
    const t = today();
    let cells = DAYS1.map((d) => `<div class="h">${d}</div>`).join('');
    for (let i = 0; i < isoDow(first) - 1; i++) cells += '<div class="d x"></div>';
    for (let i = 0; i < n; i++) {
      const d = addDays(first, i);
      const dS = toUtc(d, '00:00'), dE = toUtc(addDays(d, 1), '00:00');
      const iv = sched.filter((r) => r.staff_id === staffId && r.day === d);
      const closed = offs.some((o) => (o.staff_id === null || o.staff_id === staffId) && new Date(o.starts_at) <= dS && new Date(o.ends_at) >= dE);
      const lbl = closed ? '⛔' : iv.length ? iv.map((r) => `${shortT(hm(r.starts_at))}-${shortT(hm(r.ends_at))}`).join(',') : 'Ρεπό';
      cells += `<button class="d${d === t ? ' today' : ''}${!iv.length || closed ? ' closed' : ''}${overSet.has(d) ? ' ov' : ''}" data-act="sday" data-staff="${staffId}" data-day="${d}"><b>${i + 1}</b><span class="s">${lbl}</span>${cnt[d] ? `<span class="n">${cnt[d]}</span>` : ''}</button>`;
    }
    body.innerHTML = `
      <div class="monthnav"><button data-act="scal-nav" data-staff="${staffId}" data-month="${addMonths(first, -1)}" aria-label="Προηγούμενος">‹</button><b>${monthLabel(first)}</b><button data-act="scal-nav" data-staff="${staffId}" data-month="${addMonths(first, 1)}" aria-label="Επόμενος">›</button></div>
      <div class="mg">${cells}</div>
      <p class="muted small" style="margin-top:8px">Πάτα μια ημέρα για να βάλεις ειδικό ωράριο ή ρεπό. Διακεκομμένο πλαίσιο = ειδικό ωράριο. Ο αριθμός = ραντεβού.</p>`;
  }

  async function staffDay(staffId, day) {
    const s = staffById(staffId);
    const body = sheetBody();
    setSheetTitle(`${s.name} · ${dayShort(day)}`);
    body.innerHTML = '<div class="loading">Φόρτωση…</div>';
    const [rows, sched, appts] = await Promise.all([
      q(sb.from('staff_day_hours').select('*').eq('staff_id', staffId).eq('day', day).order('start_time')),
      q(sb.rpc('get_schedule', { p_from: day, p_to: day })),
      q(sb.from('appointments').select('*').eq('staff_id', staffId).gte('starts_at', toUtc(day, '00:00').toISOString()).lt('starts_at', toUtc(addDays(day, 1), '00:00').toISOString()).neq('status', 'cancelled').order('starts_at')),
    ]);
    const mode = !rows.length ? 'week' : rows.every((r) => !r.start_time) ? 'off' : 'custom';
    const cur = sched.filter((r) => r.staff_id === staffId);
    const ivs = mode === 'custom' ? rows.filter((r) => r.start_time).map((r) => ivRow(r.start_time.slice(0, 5), r.end_time.slice(0, 5))).join('')
      : cur.length ? cur.map((r) => ivRow(hm(r.starts_at), hm(r.ends_at))).join('') : ivRow();
    body.innerHTML = `
      <button class="b b-sm" data-act="scal-nav" data-staff="${staffId}" data-month="${monthStart(day)}">‹ Πίσω στον μήνα</button>
      <h3 style="margin-top:12px">${dayLabel(day)}</h3>
      <p class="muted small">Τώρα: ${cur.length ? cur.map((r) => `${hm(r.starts_at)}–${hm(r.ends_at)}`).join(', ') : 'δεν δουλεύει'}</p>
      <div class="stack" style="margin-top:10px" id="sdForm">
        <label class="check"><input type="radio" name="sdm" value="week" ${mode === 'week' ? 'checked' : ''} /> Κανονικό εβδομαδιαίο ωράριο</label>
        <label class="check"><input type="radio" name="sdm" value="off" ${mode === 'off' ? 'checked' : ''} /> Ρεπό</label>
        <label class="check"><input type="radio" name="sdm" value="custom" ${mode === 'custom' ? 'checked' : ''} /> Ειδικό ωράριο αυτή την ημέρα</label>
        <div class="ivs" id="sdIvs">${ivs}<button class="addiv" data-act="iv-add">+ ώρες</button></div>
        <button class="b b-pri b-block" data-act="sday-save" data-staff="${staffId}" data-day="${day}">Αποθήκευση</button>
      </div>
      <div class="sec-h"><h3>Ραντεβού της ημέρας (${appts.length})</h3></div>
      ${appts.length ? appts.map((a) => apptRow(a)).join('') : '<div class="empty">Κανένα ραντεβού.</div>'}`;
  }

  /* =====================================================================
   * 8. Ωράριο & αργίες
   * ===================================================================== */
  VIEWS.hours = async () => {
    await loadCatalog();
    const [bh, offs] = await Promise.all([
      q(sb.from('business_hours').select('*').order('weekday').order('open_time')),
      q(sb.from('time_off').select('*').gt('ends_at', new Date().toISOString()).order('starts_at')),
    ]);
    const t = today();
    const offList = offs.map((o) => {
      const s = new Date(o.starts_at), e = new Date(o.ends_at);
      const allDay = hm(s) === '00:00' && hm(e) === '00:00';
      const d1 = ymd(s), d2 = allDay ? addDays(ymd(e), -1) : ymd(e);
      const when = allDay ? (d1 === d2 ? dayLabel(d1) : `${dayShort(d1)} έως ${dayShort(d2)}`) : `${dayShort(d1)} ${hm(s)} – ${d1 === d2 ? '' : dayShort(d2) + ' '}${hm(e)}`;
      const who = o.staff_id ? staffById(o.staff_id)?.name || '—' : 'Όλο το κατάστημα';
      return `<div class="card row"><div class="grow"><b>⛔ ${esc(when)}</b><div class="muted small">${esc(who)}${o.reason ? ' · ' + esc(o.reason) : ''}</div></div><button class="x" data-act="off-del" data-id="${o.id}" aria-label="Διαγραφή">✕</button></div>`;
    }).join('');
    return `
      <h2>Ωράριο καταστήματος</h2>
      <div class="card" id="bhCard">
        <p class="muted small" style="margin-bottom:10px">Φαίνεται ζωντανά στο site. Οι τεχνίτριες χωρίς δικό τους ωράριο ακολουθούν αυτό.</p>
        ${weekEditor(bh, 'open_time', 'close_time')}
        <button class="b b-pri b-block" style="margin-top:12px" data-act="bh-save">Αποθήκευση ωραρίου</button>
      </div>
      <div class="sec-h"><h2>Αργίες & κλεισίματα</h2></div>
      <div class="card stack" id="offForm">
        <label class="f">Ποιος
          <select name="who"><option value="">Όλο το κατάστημα</option>${S.staff.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </label>
        <div class="grid2">
          <label class="f">Από<input type="date" name="d1" value="${t}" /></label>
          <label class="f">Έως<input type="date" name="d2" value="${t}" /></label>
        </div>
        <label class="check"><input type="checkbox" name="allday" checked data-change="off-allday" /> Όλη την ημέρα</label>
        <div class="grid2 hidden" id="offTimes">
          <label class="f">Ώρα από<select name="t1">${timeOptions('13:00')}</select></label>
          <label class="f">Ώρα έως<select name="t2">${timeOptions('14:00')}</select></label>
        </div>
        <label class="f">Αιτία (προαιρετικό)<input name="reason" placeholder="π.χ. Αργία, Διάλειμμα, Άδεια" /></label>
        <button class="b b-pri" data-act="off-add">+ Προσθήκη κλεισίματος</button>
      </div>
      <div class="sec-h"><h3>Προγραμματισμένα</h3></div>
      ${offList || '<div class="empty">Δεν υπάρχουν κλεισίματα.</div>'}`;
  };

  /* =====================================================================
   * 9. Ρυθμίσεις κρατήσεων
   * ===================================================================== */
  VIEWS.settings = async () => {
    await loadCatalog();
    const st = S.settings;
    const sample = { customer_name: 'Μαρία Παπαδοπούλου', starts_at: toUtc(addDays(today(), 1), '11:30').toISOString(), service_name: 'Τεχνητά νύχια', option_name: 'Νούμερο 3', staff_id: activeStaff()[0]?.id };
    const sel = (name, vals, cur) => `<select name="${name}">${vals.map(([v, l]) => `<option value="${v}"${+v === +cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    S._sample = sample;
    return `
      <h2>Ρυθμίσεις κρατήσεων</h2>
      <button class="bigswitch${st.online_booking_open ? '' : ' off'}" data-act="toggle-online">
        <span class="knob"></span>
        <span><b>Online κρατήσεις ${st.online_booking_open ? 'ΑΝΟΙΧΤΕΣ' : 'ΚΛΕΙΣΤΕΣ'}</b>
        <span>${st.online_booking_open ? 'Οι πελάτισσες κλείνουν μόνες τους από το site.' : 'Το site δείχνει «Καλέστε μας». Εσύ μπορείς να βάζεις ραντεβού κανονικά.'}</span></span>
      </button>
      <div class="card stack sec" id="rulesForm">
        <h3>Κανόνες</h3>
        <label class="f">Ώρες ανά (βήμα)${sel('slot_step_min', [[5, '5 λεπτά'], [10, '10 λεπτά'], [15, '15 λεπτά'], [20, '20 λεπτά'], [30, '30 λεπτά'], [60, '1 ώρα']], st.slot_step_min)}</label>
        <label class="f">Ελάχιστη προειδοποίηση${sel('min_notice_min', [[0, 'Καμία'], [30, '30 λεπτά'], [60, '1 ώρα'], [120, '2 ώρες'], [180, '3 ώρες'], [360, '6 ώρες'], [720, '12 ώρες'], [1440, '1 ημέρα'], [2880, '2 ημέρες']], st.min_notice_min)}</label>
        <label class="f">Μέχρι πόσες ημέρες μπροστά${sel('max_days_ahead', [[7, '1 εβδομάδα'], [14, '2 εβδομάδες'], [30, '1 μήνας'], [60, '2 μήνες'], [90, '3 μήνες'], [180, '6 μήνες']], st.max_days_ahead)}</label>
        <label class="f">Μέγιστα ενεργά ραντεβού ανά τηλέφωνο${sel('max_active_per_phone', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [10, '10']], st.max_active_per_phone)}</label>
        <label class="check"><input type="checkbox" name="require_confirmation" ${st.require_confirmation ? 'checked' : ''} /> Θέλω να εγκρίνω κάθε online κράτηση (αλλιώς επιβεβαιώνονται αυτόματα)</label>
      </div>
      <div class="card stack sec" id="smsForm">
        <h3>Μηνύματα SMS</h3>
        <label class="f">📩 Επιβεβαίωση<textarea id="smsC" name="sms_confirmation" data-input="sms-prev" data-prev="prevC">${esc(st.sms_confirmation || '')}</textarea></label>
        <div class="ph">${['{όνομα}', '{ημέρα}', '{ώρα}', '{υπηρεσία}', '{τεχνίτρια}'].map((p) => `<button data-act="ph" data-target="smsC" data-ph="${p}">${p}</button>`).join('')}</div>
        <div class="preview" id="prevC">${esc(fillTpl(st.sms_confirmation, sample))}</div>
        <label class="f">⏰ Υπενθύμιση<textarea id="smsR" name="sms_reminder" data-input="sms-prev" data-prev="prevR">${esc(st.sms_reminder || '')}</textarea></label>
        <div class="ph">${['{όνομα}', '{ημέρα}', '{ώρα}', '{υπηρεσία}', '{τεχνίτρια}'].map((p) => `<button data-act="ph" data-target="smsR" data-ph="${p}">${p}</button>`).join('')}</div>
        <div class="preview" id="prevR">${esc(fillTpl(st.sms_reminder, sample))}</div>
      </div>
      <button class="b b-pri b-block sec" data-act="settings-save">Αποθήκευση ρυθμίσεων</button>
      <div class="hint sec">💡 Για να μπαίνει το admin σαν εφαρμογή: στο Safari πάτα <b>Κοινοποίηση</b> → <b>Προσθήκη στην οθόνη Αφετηρίας</b>.</div>`;
  };

  /* =====================================================================
   * Appointment details sheet
   * ===================================================================== */
  async function openAppt(id) {
    const body = openSheet('Ραντεβού', '<div class="loading">Φόρτωση…</div>');
    try {
      const a = await q(sb.from('appointments').select('*').eq('id', id).single());
      const s = staffById(a.staff_id);
      const d = ymd(a.starts_at);
      const dur = minsBetween(a.starts_at, a.ends_at);
      setSheetTitle(a.customer_name);
      const act = (k, label, cls = '') => `<button class="b ${cls}" data-act="st" data-id="${a.id}" data-st="${k}">${label}</button>`;
      let actions = '';
      if (a.status === 'pending') actions = act('confirmed', '✓ Επιβεβαίωση', 'b-ok') + act('cancelled', 'Ακύρωση', 'b-bad');
      else if (a.status === 'confirmed') actions = act('completed', '✓ Ολοκληρώθηκε', 'b-ok') + act('no_show', '✗ Δεν ήρθε') + `<button class="b" data-act="appt-edit" data-id="${a.id}">🕒 Αλλαγή ώρας</button>` + act('cancelled', 'Ακύρωση', 'b-bad');
      else actions = act('confirmed', '↺ Επαναφορά', 'b-soft full');
      body.innerHTML = `
        <div class="row" style="margin-bottom:12px"><span class="chip st-${a.status}">${STATUS[a.status]}</span><span class="muted small">${a.source === 'online' ? '🌐 Online' : '📞 Τηλέφωνο'}</span></div>
        <div class="info card">
          <div class="l"><span>Ημέρα</span><div><b>${relDay(d) ? relDay(d) + ' · ' : ''}${dayLabel(d)}</b></div></div>
          <div class="l"><span>Ώρα</span><div><b>${hm(a.starts_at)} – ${hm(a.ends_at)}</b> (${fmtDur(dur)})</div></div>
          <div class="l"><span>Υπηρεσία</span><div>${esc(svcLabel(a))}${a.price != null ? ` · ${money(a.price)}` : ''}</div></div>
          <div class="l"><span>Τεχνίτρια</span><div>${esc(s?.name || '—')}</div></div>
          <div class="l"><span>Τηλέφωνο</span><div><a href="${telHref(a.phone)}">${esc(a.phone)}</a></div></div>
          ${a.email ? `<div class="l"><span>Email</span><div><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></div></div>` : ''}
          ${a.notes ? `<div class="l"><span>Σημειώσεις</span><div>${esc(a.notes)}</div></div>` : ''}
        </div>
        <div class="btns sec">
          <a class="b b-pri" href="${telHref(a.phone)}">📞 Κλήση</a>
          <button class="b" data-act="appt-edit" data-id="${a.id}">✏️ Αλλαγή</button>
          <a class="b" href="${smsHref(a.phone, fillTpl(S.settings.sms_confirmation, a))}" data-act="sms-mark" data-id="${a.id}" data-kind="confirmation_sent_at">📩 SMS επιβεβαίωσης${a.confirmation_sent_at ? ' ✓' : ''}</a>
          <a class="b" href="${smsHref(a.phone, fillTpl(S.settings.sms_reminder, a))}" data-act="sms-mark" data-id="${a.id}" data-kind="reminder_sent_at">⏰ SMS υπενθύμισης${a.reminder_sent_at ? ' ✓' : ''}</a>
        </div>
        <h3 class="sec">Κατάσταση</h3>
        <div class="btns">${actions}</div>
        <p class="muted small sec">Κλείστηκε: ${dayShort(ymd(a.created_at))} ${hm(a.created_at)}</p>`;
    } catch (e) { body.innerHTML = `<div class="empty">${esc(errMsg(e))}</div>`; }
  }

  /* =====================================================================
   * New / edit appointment form
   * ===================================================================== */
  async function openApptForm({ id = null, staffId = null, day = S.day, time = null } = {}) {
    let a = null;
    if (id) a = await q(sb.from('appointments').select('*').eq('id', id).single());
    const svcs = S.services.filter((s) => s.active || (a && s.id === a.service_id));
    const svcId = a ? a.service_id : '';
    const d = a ? ymd(a.starts_at) : day;
    const tm = a ? hm(a.starts_at) : time || '10:00';
    const sid = a ? a.staff_id : staffId || '';
    const body = openSheet(a ? 'Αλλαγή ραντεβού' : 'Νέο ραντεβού', `
      <form class="stack" id="apptForm" data-id="${a ? a.id : ''}">
        <label class="f">Υπηρεσία
          <select name="service" data-change="af-svc" required><option value="">— Διάλεξε —</option>${svcs.map((s) => `<option value="${s.id}"${s.id === svcId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        </label>
        <div id="afOpt"></div>
        <label class="f">Τεχνίτρια<select name="staff" id="afStaff" required></select></label>
        <div class="grid2">
          <label class="f">Ημέρα<input type="date" name="day" value="${d}" required /></label>
          <label class="f">Ώρα<select name="time">${timeOptions(tm, 6 * 60, 23 * 60 + 45, 15)}</select></label>
        </div>
        <div id="afDur" class="muted small"></div>
        <label class="f">Ονοματεπώνυμο<input name="name" value="${esc(a?.customer_name || '')}" autocomplete="off" required /></label>
        <label class="f">Τηλέφωνο<input type="tel" name="phone" value="${esc(a?.phone || '')}" inputmode="tel" autocomplete="off" required /></label>
        <label class="f">Email (προαιρετικό)<input type="email" name="email" value="${esc(a?.email || '')}" inputmode="email" /></label>
        <label class="f">Σημειώσεις<textarea name="notes" rows="2">${esc(a?.notes || '')}</textarea></label>
        <button class="b b-pri b-block" type="submit">${a ? 'Αποθήκευση αλλαγών' : 'Αποθήκευση ραντεβού'}</button>
        ${a ? '' : '<p class="muted small center">Αποθηκεύεται ως επιβεβαιωμένο. Επιτρέπεται και εκτός ωραρίου, αλλά ποτέ πάνω σε άλλο ραντεβού.</p>'}
      </form>`);
    const form = $('#apptForm', body);
    const refresh = () => {
      const svc = svcById(+form.service.value);
      const opts = svc ? optsOf(svc.id).filter((o) => o.active || (a && o.id === a.option_id)) : [];
      const curOpt = form.option ? form.option.value : a?.option_id ? String(a.option_id) : '';
      $('#afOpt', body).innerHTML = opts.length
        ? `<label class="f">Επιλογή<select name="option" data-change="af-opt" required><option value="">— Διάλεξε —</option>${opts.map((o) => `<option value="${o.id}"${String(o.id) === curOpt ? ' selected' : ''}>${esc(o.name)} · ${fmtDur(o.duration_min)}${o.price != null ? ' · ' + money(o.price) : ''}</option>`).join('')}</select></label>`
        : '';
      const curStaff = $('#afStaff', body).value || String(sid);
      const list = S.staff.filter((s) => (s.active && (!svc || staffDoes(s.id, svc.id))) || String(s.id) === curStaff);
      $('#afStaff', body).innerHTML = `<option value="">— Διάλεξε —</option>` + list.map((s) => `<option value="${s.id}"${String(s.id) === curStaff ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
      durInfo();
    };
    const durInfo = () => {
      const svc = svcById(+form.service.value);
      const opt = form.option && form.option.value ? S.options.find((o) => o.id === +form.option.value) : null;
      const dur = opt ? opt.duration_min : svc ? svc.duration_min : a ? minsBetween(a.starts_at, a.ends_at) : 0;
      const price = opt ? opt.price : svc ? svc.price : null;
      $('#afDur', body).textContent = dur ? `Διάρκεια ${fmtDur(dur)}${price != null ? ' · ' + money(price) : ''}` : '';
    };
    form.addEventListener('change', (e) => {
      if (e.target.name === 'service') { if (form.option) form.option.value = ''; refresh(); }
      if (e.target.name === 'option') durInfo();
    });
    refresh();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      try {
        const svc = svcById(+form.service.value);
        if (!svc) throw new Error('Διάλεξε υπηρεσία.');
        const hasOpts = optsOf(svc.id).some((o) => o.active || (a && o.id === a.option_id));
        const opt = form.option && form.option.value ? S.options.find((o) => o.id === +form.option.value) : null;
        if (hasOpts && !opt) throw new Error('Διάλεξε επιλογή (νούμερο).');
        if (!form.staff.value) throw new Error('Διάλεξε τεχνίτρια.');
        const name = form.name.value.trim();
        const phone = form.phone.value.trim();
        if (!name) throw new Error('Γράψε όνομα.');
        if (phone.replace(/\D/g, '').length < 10) throw new Error('Γράψε σωστό τηλέφωνο (10 ψηφία).');
        const dur = opt ? opt.duration_min : svc.duration_min;
        const start = toUtc(form.day.value, form.time.value);
        const row = {
          service_id: svc.id,
          option_id: opt ? opt.id : null,
          staff_id: +form.staff.value,
          customer_name: name,
          phone,
          email: form.email.value.trim() || null,
          notes: form.notes.value.trim() || null,
          starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + dur * 60000).toISOString(),
          buffer_min: svc.buffer_min || 0,
          service_name: svc.name,
          option_name: opt ? opt.name : null,
          price: opt ? opt.price : svc.price,
        };
        btn.disabled = true;
        if (a) await q(sb.from('appointments').update(row).eq('id', a.id).select());
        else await q(sb.from('appointments').insert({ ...row, status: 'confirmed', source: 'phone', deposit: svc.deposit || 0 }).select());
        closeSheet();
        toast(a ? 'Το ραντεβού άλλαξε ✓' : 'Το ραντεβού αποθηκεύτηκε ✓');
        S.day = form.day.value;
        render();
      } catch (err) { btn.disabled = false; fail(err); }
    });
  }

  /* =====================================================================
   * Actions (event delegation)
   * ===================================================================== */
  const ACT = {
    'sheet-close': closeSheet,
    reload: () => render(),
    logout: async () => { await sb.auth.signOut(); viewLogin(); },
    forgot: async () => {
      const email = $('#loginForm input[name=email]')?.value.trim();
      if (!email) return toast('Γράψε πρώτα το email σου.', true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
      if (error) return fail(error);
      toast('Σου στείλαμε email για νέο κωδικό.');
    },
    tab: (el) => { S.tab = el.dataset.tab; safeSet('gk_tab', S.tab); $('#main').innerHTML = ''; render(); window.scrollTo(0, 0); },
    'new-appt': () => openApptForm({ day: S.tab === 'cal' ? S.day : today() }).catch(fail),
    appt: (el) => openAppt(+el.dataset.id),
    'appt-edit': (el) => openApptForm({ id: +el.dataset.id }).catch(fail),

    // calendar
    'cal-day': (el) => { S.day = el.dataset.day; render(); },
    'cal-week': (el) => { S.day = addDays(S.day, +el.dataset.n); render(); },
    'cal-today': () => { S.day = today(); render(); },
    'cal-mode': (el) => { S.calMode = el.dataset.mode; render(); },
    'cal-month': (el) => { S.day = addMonths(S.day, +el.dataset.n); render(); },
    'cal-open-day': (el) => { S.day = el.dataset.day; S.calMode = 'day'; S.tab = 'cal'; safeSet('gk_tab', 'cal'); render(); window.scrollTo(0, 0); },
    'cal-slot': (el, e) => {
      const r = el.getBoundingClientRect();
      const m = +el.dataset.lo + (e.clientY - r.top) / PX;
      const snap = Math.max(0, Math.min(23 * 60 + 45, Math.floor(m / 15) * 15));
      openApptForm({ staffId: +el.dataset.staff, day: S.day, time: `${pad(Math.floor(snap / 60))}:${pad(snap % 60)}` }).catch(fail);
    },

    // status
    st: async (el) => {
      const st = el.dataset.st;
      if (st === 'cancelled' && !confirm('Να ακυρωθεί το ραντεβού;')) return;
      try {
        await q(sb.from('appointments').update({ status: st }).eq('id', +el.dataset.id).select());
        closeSheet(); toast(`${STATUS[st]} ✓`); render();
      } catch (e) { fail(e); }
    },
    'sms-mark': (el) => {
      // the link opens Messages; we just remember that it was opened
      sb.from('appointments').update({ [el.dataset.kind]: new Date().toISOString() }).eq('id', +el.dataset.id).then(() => {});
      return 'follow';
    },

    // month tab
    'month-nav': (el) => { S.month = addMonths(S.month, +el.dataset.n); render(); },

    // reminders
    ph: (el) => {
      const ta = document.getElementById(el.dataset.target);
      const p = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, p) + el.dataset.ph + ta.value.slice(ta.selectionEnd ?? p);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
    },
    'rem-start': () => {
      const ids = $$('.remChk').filter((c) => c.checked).map((c) => +c.value);
      if (!ids.length) return toast('Διάλεξε τουλάχιστον μία πελάτισσα.', true);
      S.remQueue = { day: S.remDay, ids, i: 0 };
      sendReminder();
    },
    'rem-next': () => sendReminder(),
    'rem-stop': () => { S.remQueue = null; render(); },
    'rem-save-tpl': async () => {
      try { await q(sb.from('booking_settings').update({ sms_reminder: S.remTpl }).eq('id', 1).select()); S.settings.sms_reminder = S.remTpl; toast('Αποθηκεύτηκε ✓'); } catch (e) { fail(e); }
    },

    // services
    'svc-new': async () => {
      const name = prompt('Όνομα νέας υπηρεσίας:');
      if (!name || !name.trim()) return;
      try {
        await q(sb.from('services').insert({ name: name.trim(), duration_min: 60, price: null, sort_order: (Math.max(0, ...S.services.map((s) => s.sort_order)) + 1) }).select());
        toast('Προστέθηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'svc-save': async (el) => {
      const card = el.closest('[data-svc]');
      const v = (n) => card.querySelector(`[name=${n}]`);
      try {
        if (!v('name').value.trim()) throw new Error('Γράψε όνομα.');
        await q(sb.from('services').update({
          name: v('name').value.trim(), name_en: v('name_en').value.trim() || null,
          duration_min: +v('duration_min').value, buffer_min: +v('buffer_min').value,
          price: num(v('price').value), deposit: num(v('deposit').value) || 0,
          description: v('description').value.trim() || null, active: v('active').checked,
        }).eq('id', +el.dataset.id).select());
        toast('Αποθηκεύτηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'svc-del': async (el) => {
      if (!confirm('Διαγραφή υπηρεσίας; Τα παλιά ραντεβού κρατάνε το όνομά της. (Καλύτερα: κάν’ την ανενεργή.)')) return;
      try { await q(sb.from('services').delete().eq('id', +el.dataset.id).select()); toast('Διαγράφηκε'); render(); } catch (e) { fail(e); }
    },
    'svc-move': async (el) => {
      const list = [...S.services];
      const i = list.findIndex((s) => s.id === +el.dataset.id);
      const j = i + +el.dataset.n;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      try {
        await Promise.all(list.map((s, k) => (s.sort_order !== k + 1 ? q(sb.from('services').update({ sort_order: k + 1 }).eq('id', s.id).select()) : null)));
        render();
      } catch (e) { fail(e); }
    },
    'opt-add': (el) => {
      const card = el.closest('[data-svc]');
      const fold = el.closest('details');
      let box = fold.querySelector('.opts');
      const rows = $$('.opt', box);
      const svc = svcById(+card.dataset.svc);
      let name = 'Νούμερο 1', dur = svc.duration_min, price = svc.price ?? '';
      if (rows.length) {
        const last = rows[rows.length - 1];
        const ln = last.querySelector('[name=name]').value;
        const mm = ln.match(/^(.*?)(\d+)\s*$/);
        name = mm ? `${mm[1]}${+mm[2] + 1}` : `${ln} 2`;
        dur = +last.querySelector('[name=duration_min]').value;
        const lp = num(last.querySelector('[name=price]').value);
        price = lp == null ? '' : lp + 5;
      }
      box.insertAdjacentHTML('beforeend', optRow({ id: '', name, duration_min: dur, price }));
      if (!fold.querySelector('[data-act=opt-save]')) {
        el.insertAdjacentHTML('afterend', `<button class="b b-sm b-pri" data-act="opt-save" data-svc="${card.dataset.svc}" style="margin-left:8px">Αποθήκευση επιλογών</button>`);
      }
    },
    'opt-del': async (el) => {
      const row = el.closest('.opt');
      const id = row.dataset.opt;
      if (!id) { row.remove(); return; }
      if (!confirm('Διαγραφή επιλογής;')) return;
      try { await q(sb.from('service_options').delete().eq('id', +id).select()); row.remove(); toast('Διαγράφηκε'); await loadCatalog(); } catch (e) { fail(e); }
    },
    'opt-save': async (el) => {
      const sid = +el.dataset.svc;
      const rows = $$('.opt', el.closest('details'));
      try {
        let k = 0;
        for (const r of rows) {
          k++;
          const v = (n) => r.querySelector(`[name=${n}]`).value;
          if (!v('name').trim()) throw new Error('Κάθε επιλογή χρειάζεται όνομα.');
          const row = { service_id: sid, name: v('name').trim(), duration_min: +v('duration_min'), price: num(v('price')), sort_order: k };
          if (r.dataset.opt) await q(sb.from('service_options').update(row).eq('id', +r.dataset.opt).select());
          else await q(sb.from('service_options').insert(row).select());
        }
        toast('Οι επιλογές αποθηκεύτηκαν ✓'); render();
      } catch (e) { fail(e); }
    },

    // staff
    'staff-new': async () => {
      const name = prompt('Όνομα νέας τεχνίτριας:');
      if (!name || !name.trim()) return;
      try {
        await q(sb.from('staff').insert({ name: name.trim(), role: 'Nail artist', sort_order: Math.max(0, ...S.staff.map((s) => s.sort_order)) + 1 }).select());
        toast('Προστέθηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'staff-save': async (el) => {
      const card = el.closest('[data-staff]');
      const v = (n) => card.querySelector(`[name=${n}]`);
      try {
        if (!v('name').value.trim()) throw new Error('Γράψε όνομα.');
        await q(sb.from('staff').update({ name: v('name').value.trim(), role: v('role').value.trim() || null, sort_order: +v('sort_order').value || 0, active: v('active').checked }).eq('id', +el.dataset.id).select());
        toast('Αποθηκεύτηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'staff-del': async (el) => {
      if (!confirm('Διαγραφή τεχνίτριας; Αν έχει ραντεβού δεν θα γίνει — τότε κάν’ την ανενεργή.')) return;
      try { await q(sb.from('staff').delete().eq('id', +el.dataset.id).select()); toast('Διαγράφηκε'); render(); } catch (e) { fail(e); }
    },
    'staff-svc': async (el) => {
      const st = +el.dataset.staff, sv = +el.dataset.svc;
      const on = el.classList.toggle('on');
      try {
        if (on) await q(sb.from('staff_services').insert({ staff_id: st, service_id: sv }).select());
        else await q(sb.from('staff_services').delete().eq('staff_id', st).eq('service_id', sv).select());
        await loadCatalog();
        toast(on ? 'Προστέθηκε ✓' : 'Αφαιρέθηκε ✓');
      } catch (e) { el.classList.toggle('on'); fail(e); }
    },
    'staff-hours-save': async (el) => {
      const id = +el.dataset.id;
      try {
        const rows = readWeek(el.closest('details'));
        await q(sb.from('staff_hours').delete().eq('staff_id', id).select());
        if (rows.length) await q(sb.from('staff_hours').insert(rows.map((r) => ({ staff_id: id, weekday: r.weekday, start_time: r.s, end_time: r.e }))).select());
        toast('Το ωράριο αποθηκεύτηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'staff-hours-copy': async (el) => {
      if (!confirm('Να ακολουθεί το ωράριο του καταστήματος; (Σβήνει το δικό της εβδομαδιαίο ωράριο)')) return;
      try { await q(sb.from('staff_hours').delete().eq('staff_id', +el.dataset.id).select()); toast('Ακολουθεί το ωράριο καταστήματος ✓'); render(); } catch (e) { fail(e); }
    },
    'staff-cal': (el) => { openSheet('Ημερολόγιο', '<div class="loading">Φόρτωση…</div>'); staffCalendar(+el.dataset.id, today()).catch(fail); },
    'scal-nav': (el) => staffCalendar(+el.dataset.staff, el.dataset.month).catch(fail),
    sday: (el) => staffDay(+el.dataset.staff, el.dataset.day).catch(fail),
    'sday-save': async (el) => {
      const staffId = +el.dataset.staff, day = el.dataset.day;
      const mode = $('#sdForm input[name=sdm]:checked').value;
      try {
        const ivs = mode === 'custom' ? readIntervals($('#sdIvs')) : [];
        if (mode === 'custom' && !ivs.length) throw new Error('Πρόσθεσε τουλάχιστον ένα διάστημα ωρών.');
        await q(sb.from('staff_day_hours').delete().eq('staff_id', staffId).eq('day', day).select());
        if (mode === 'off') await q(sb.from('staff_day_hours').insert({ staff_id: staffId, day, start_time: null, end_time: null }).select());
        if (mode === 'custom') await q(sb.from('staff_day_hours').insert(ivs.map((r) => ({ staff_id: staffId, day, start_time: r.s, end_time: r.e }))).select());
        toast('Αποθηκεύτηκε ✓');
        staffCalendar(staffId, day);
      } catch (e) { fail(e); }
    },

    // week editor
    'iv-add': (el) => {
      el.parentElement.querySelector('.closed-lbl')?.remove();
      el.insertAdjacentHTML('beforebegin', ivRow());
    },
    'iv-del': (el) => {
      const box = el.closest('.ivs');
      el.closest('.iv').remove();
      if (box.closest('.wkd') && !box.querySelector('.iv')) box.insertAdjacentHTML('afterbegin', '<div class="closed-lbl">Κλειστά</div>');
    },

    // business hours + closures
    'bh-save': async () => {
      try {
        const rows = readWeek($('#bhCard'));
        await q(sb.from('business_hours').delete().gte('weekday', 1).select());
        if (rows.length) await q(sb.from('business_hours').insert(rows.map((r) => ({ weekday: r.weekday, open_time: r.s, close_time: r.e }))).select());
        toast('Το ωράριο αποθηκεύτηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'off-add': async () => {
      const f = $('#offForm');
      const v = (n) => f.querySelector(`[name=${n}]`);
      try {
        const d1 = v('d1').value, d2 = v('d2').value;
        if (!d1 || !d2 || d2 < d1) throw new Error('Έλεγξε τις ημερομηνίες.');
        let s, e;
        if (v('allday').checked) { s = toUtc(d1, '00:00'); e = toUtc(addDays(d2, 1), '00:00'); }
        else { s = toUtc(d1, v('t1').value); e = toUtc(d2, v('t2').value); }
        if (e <= s) throw new Error('Το τέλος πρέπει να είναι μετά την αρχή.');
        await q(sb.from('time_off').insert({ staff_id: v('who').value ? +v('who').value : null, starts_at: s.toISOString(), ends_at: e.toISOString(), reason: v('reason').value.trim() || null }).select());
        toast('Προστέθηκε ✓'); render();
      } catch (e) { fail(e); }
    },
    'off-del': async (el) => {
      if (!confirm('Διαγραφή κλεισίματος;')) return;
      try { await q(sb.from('time_off').delete().eq('id', +el.dataset.id).select()); toast('Διαγράφηκε'); render(); } catch (e) { fail(e); }
    },

    // settings
    'toggle-online': async () => {
      const open = !S.settings.online_booking_open;
      if (!open && !confirm('Να κλείσουν οι online κρατήσεις; Το site θα δείχνει «Καλέστε μας».')) return;
      try { await q(sb.from('booking_settings').update({ online_booking_open: open }).eq('id', 1).select()); toast(open ? 'Online κρατήσεις ΑΝΟΙΧΤΕΣ ✓' : 'Online κρατήσεις ΚΛΕΙΣΤΕΣ'); render(); } catch (e) { fail(e); }
    },
    'settings-save': async () => {
      const r = $('#rulesForm'), m = $('#smsForm');
      const v = (root, n) => root.querySelector(`[name=${n}]`);
      try {
        await q(sb.from('booking_settings').update({
          slot_step_min: +v(r, 'slot_step_min').value,
          min_notice_min: +v(r, 'min_notice_min').value,
          max_days_ahead: +v(r, 'max_days_ahead').value,
          max_active_per_phone: +v(r, 'max_active_per_phone').value,
          require_confirmation: v(r, 'require_confirmation').checked,
          sms_confirmation: v(m, 'sms_confirmation').value,
          sms_reminder: v(m, 'sms_reminder').value,
          updated_at: new Date().toISOString(),
        }).eq('id', 1).select());
        S.remTpl = null;
        toast('Οι ρυθμίσεις αποθηκεύτηκαν ✓'); render();
      } catch (e) { fail(e); }
    },
  };

  async function sendReminder() {
    const qd = S.remQueue;
    if (!qd) return;
    if (qd.i >= qd.ids.length) { S.remQueue = null; toast('Όλες οι υπενθυμίσεις άνοιξαν ✓'); render(); return; }
    const id = qd.ids[qd.i];
    try {
      const a = await q(sb.from('appointments').select('*').eq('id', id).single());
      qd.i++;
      location.href = smsHref(a.phone, fillTpl(S.remTpl, a));
      await q(sb.from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id).select());
      if (qd.i >= qd.ids.length) { S.remQueue = null; toast('Τελευταία υπενθύμιση ✓'); }
      render();
    } catch (e) { fail(e); }
  }

  const CHANGE = {
    'cal-pick': (el) => { if (el.value) { S.day = el.value; render(); } },
    'month-staff': (el) => { S.monthStaff = el.value; render(); },
    'rem-day': (el) => { if (el.value) { S.remDay = el.value; S.remQueue = null; render(); } },
    'off-allday': (el) => $('#offTimes').classList.toggle('hidden', el.checked),
    'staff-photo': async (el) => {
      const file = el.files && el.files[0];
      if (!file) return;
      const id = +el.dataset.id;
      try {
        toast('Ανέβασμα φωτογραφίας…');
        const blob = await squareJpeg(file, 512);
        const path = `staff/${id}-${Date.now()}.jpg`;
        const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        const url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
        await q(sb.from('staff').update({ photo_url: url }).eq('id', id).select());
        toast('Η φωτογραφία άλλαξε ✓'); render();
      } catch (e) { fail(e); }
    },
  };
  const INPUT = {
    'rem-tpl': (el) => { S.remTpl = el.value; const p = $('#remPreview'); if (p) p.textContent = fillTpl(el.value, remSample()); },
    'sms-prev': (el) => { const p = document.getElementById(el.dataset.prev); if (p) p.textContent = fillTpl(el.value, S._sample); },
    'client-search': (el) => { S.clientSearch = el.value; $('#clientList').innerHTML = clientList(); },
  };
  let remFirst = null;
  const remSample = () => remFirst || { customer_name: 'Μαρία', starts_at: toUtc(S.remDay, '10:00').toISOString(), service_name: 'Μανικιούρ', staff_id: activeStaff()[0]?.id };

  async function squareJpeg(file, size) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Η φωτογραφία δεν διαβάστηκε.')); i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = Math.min(size, side);
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    } finally { URL.revokeObjectURL(url); }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !ACT[el.dataset.act]) return;
    const r = ACT[el.dataset.act](el, e);
    if (r !== 'follow' && el.tagName !== 'A') e.preventDefault();
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  /* =====================================================================
   * Start
   * ===================================================================== */
  let recovering = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; viewNewPassword(); }
  });

  async function start() {
    if (recovering) return viewNewPassword();
    const { data } = await sb.auth.getSession();
    const session = data && data.session;
    if (!session) return viewLogin();
    S.user = session.user;
    try {
      const isAdmin = await q(sb.rpc('is_salon_admin'));
      if (!isAdmin) return viewNoAccess(S.user.email);
      await loadCatalog();
    } catch (e) {
      return viewLogin(errMsg(e));
    }
    shell();
    render();
  }

  // refresh when the app comes back to the foreground (e.g. after sending an SMS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && $('#main') && !$('.sheet')) render();
  });

  start();
})();
