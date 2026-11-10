// Shared state, rules, and helpers. Load after data.js. Exposes window.Portal.

(function () {
  const STORE_KEY = 'portal-mock-v5';
  let state = load();
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        saved.requests.forEach((r) => { r.type = r.type || 'Feature'; }); // older saves had no request type
        return saved;
      }
    } catch (e) {}
    const s = seedState();
    s.user = { name: 'Dana', role: 'client' };
    return s;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function changed() {
    save();
    listeners.forEach((fn) => fn());
  }

  // ---------- getters ----------

  const item = (id) => state.items.find((i) => i.id === id);
  const pts = (it) => (it && it.points) || 0;
  const month = (id) => state.months.find((m) => m.id === id);
  const openMonths = () => state.months.filter((m) => !m.closed);
  const pastMonths = () => state.months.filter((m) => m.closed);
  const monthItems = (id) => month(id).order.map(item);
  const backlog = () => state.backlog.map(item);
  const used = (m) => m.order.reduce((s, id) => s + pts(item(id)), 0);
  const left = (m) => m.capacity - used(m);
  const monthOf = (id) => state.months.find((m) => m.order.includes(id)) || null;
  const where = (id) => (monthOf(id) ? monthOf(id).id : 'backlog');
  const history = (id) => state.activity.filter((a) => a.itemId === id).slice().reverse();
  const listOf = (target) => (target === 'backlog' ? state.backlog : month(target).order);
  const targetLabel = (target) => (target === 'backlog' ? 'the backlog' : month(target).label);

  function log(text, itemId) {
    state.activity.push({ client_id: state.client.id, at: new Date().toISOString(), who: state.user.name, text, itemId });
  }

  // ---------- rules ----------

  // Returns null if allowed, otherwise a human reason string.
  function canMove(id, target) {
    const it = item(id);
    const from = where(id);
    const fromMonth = monthOf(id);
    if (fromMonth && fromMonth.locked && from !== target) return `${fromMonth.label} is locked. Changes go through Kevin.`;
    if (it.status === 'Shipped' && from !== target) return 'Shipped items stay in their month.';
    if (target === 'backlog') return null;
    const m = month(target);
    if (m.locked) return `${m.label} is locked. Changes go through Kevin.`;
    if (!it.points) return 'Kevin needs to estimate this one before it can be planned.';
    if (from !== target && pts(it) > left(m)) return `Not enough room in ${m.label}: needs ${pts(it)}, ${left(m)} left.`;
    return null;
  }

  // Move to a list (backlog or month id) at index (default: end). Returns reason or null.
  function move(id, target, index) {
    const reason = canMove(id, target);
    if (reason) { toast(reason); return reason; }
    const from = where(id);
    const src = listOf(from);
    const oldIdx = src.indexOf(id);
    src.splice(oldIdx, 1);
    const dst = listOf(target);
    const idx = index == null ? dst.length : Math.max(0, Math.min(index, dst.length));
    dst.splice(idx, 0, id);
    const it = item(id);
    if (from === target) {
      if (oldIdx !== idx) log(`ranked "${it.title}" #${idx + 1} in ${targetLabel(target)}`, id);
    } else if (target === 'backlog') {
      log(`moved "${it.title}" back to the backlog`, id);
    } else {
      log(`moved "${it.title}" to ${month(target).label}`, id);
    }
    changed();
    return null;
  }

  // Shift an item up/down within its current list.
  function nudge(id, delta) {
    const list = listOf(where(id));
    const i = list.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const m = monthOf(id);
    if (m && m.locked) return toast(`${m.label} is locked. Changes go through Kevin.`);
    return move(id, where(id), j);
  }

  // "Rank is the schedule" model: takes one ordered list of all unshipped,
  // unlocked item ids and pours them into open, unlocked months in order,
  // filling each to capacity. Items that do not fit (or are unestimated) go to the backlog.
  // Locked months keep their contents.
  function pour(orderedIds) {
    const fillable = openMonths().filter((m) => !m.locked);
    fillable.forEach((m) => { m.order = m.order.filter((id) => item(id).status === 'Shipped'); });
    state.backlog = [];
    let mi = 0;
    for (const id of orderedIds) {
      const it = item(id);
      if (!it.points) { state.backlog.push(id); continue; }
      // Strict order: once an item does not fit, later items start in the next month too.
      while (mi < fillable.length && pts(it) > left(fillable[mi])) mi++;
      if (mi < fillable.length) fillable[mi].order.push(id);
      else state.backlog.push(id);
    }
    log('reordered the plan');
    changed();
  }

  // Flat ranked order across open unlocked months then backlog (for the pour model).
  function flatOrder() {
    const ids = [];
    openMonths().filter((m) => !m.locked).forEach((m) => m.order.forEach((id) => item(id).status !== 'Shipped' && ids.push(id)));
    return ids.concat(state.backlog);
  }

  function comment(id, text) {
    const it = item(id);
    it.comments.push({ by: state.user.name, at: new Date().toISOString(), text });
    log(`commented on "${it.title}"`, id);
    changed();
  }

  // ---------- requests ----------

  const request = (id) => state.requests.find((r) => r.id === id);

  function addRequest(type, title, description) {
    const r = { id: 'r' + Date.now().toString(36), client_id: state.client.id, type, title, description, by: state.user.name, at: new Date().toISOString(), status: 'pending' };
    state.requests.unshift(r);
    log(`requested "${title}"`);
    changed();
    return r;
  }

  // quiet: save without re-rendering (used while typing inline)
  function updateRequest(id, fields, quiet) {
    Object.assign(request(id), fields);
    quiet ? save() : changed();
  }

  // Turn a pending request into a backlog item (bottom of the backlog).
  function acceptRequest(id, type, points) {
    const r = request(id);
    const it = { id: 'i' + Date.now().toString(36), client_id: state.client.id, type, points, title: r.title, description: r.description, status: 'Planned', comments: r.comments || [], rolledFrom: null };
    state.items.push(it);
    state.backlog.push(it.id);
    state.requests = state.requests.filter((x) => x.id !== id);
    log(`added "${it.title}" to the backlog`, it.id);
    changed();
    return it;
  }

  function commentRequest(id, text) {
    const r = request(id);
    (r.comments = r.comments || []).push({ by: state.user.name, at: new Date().toISOString(), text });
    changed();
  }

  function deleteRequest(id) {
    const r = request(id);
    state.requests = state.requests.filter((x) => x.id !== id);
    log(`deleted the request "${r.title}"`);
    changed();
  }

  function declineRequest(id) {
    request(id).status = 'declined';
    log(`declined "${request(id).title}"`);
    changed();
  }

  // ---------- admin edits ----------

  function updateItem(id, fields, quiet) {
    Object.assign(item(id), fields);
    quiet ? save() : changed();
  }

  // Kevin adding an item straight to the backlog (bottom).
  function addItem(type, points, title, description) {
    const it = { id: 'i' + Date.now().toString(36), client_id: state.client.id, type, points, title, description, status: 'Planned', comments: [], rolledFrom: null };
    state.items.push(it);
    state.backlog.push(it.id);
    log(`added "${title}" to the backlog`, it.id);
    changed();
    return it;
  }

  function toggleShipped(id) {
    const it = item(id);
    it.status = it.status === 'Shipped' ? 'Planned' : 'Shipped';
    log(`marked "${it.title}" ${it.status.toLowerCase()}`, id);
    changed();
  }

  function toggleLock(monthId) {
    const m = month(monthId);
    m.locked = !m.locked;
    log(`${m.locked ? 'locked' : 'unlocked'} ${m.label}`);
    changed();
  }

  function setUser(user) {
    state.user = user;
    changed();
  }

  function reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    state = load();
    Portal.state = state;
    changed();
  }

  // ---------- ui helpers ----------

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'p-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // Mockup-only bar with a data reset.
  function mountBar() {
    const bar = document.createElement('div');
    bar.className = 'p-bar';
    bar.innerHTML = '<strong>Mockup</strong><span class="p-bar-spacer"></span><button type="button" data-reset>Reset data</button>';
    bar.querySelector('[data-reset]').addEventListener('click', reset);
    document.body.prepend(bar);
  }

  // Generic drag and drop. Containers: [data-drop="backlog"|monthId]. Draggables: [data-drag="itemId"].
  // Indicator line is inserted between [data-drag] children. Optional opts.axis = 'x' for horizontal lists.
  function enableDrag(root, opts = {}) {
    let dragId = null;
    let invalid = null;
    const ghost = document.createElement('div');
    ghost.className = 'p-drop-line' + (opts.axis === 'x' ? ' x' : '');

    const kids = (zone) => [...zone.querySelectorAll(':scope [data-drag]')].filter((el) => el.closest('[data-drop]') === zone && !el.classList.contains('p-dragging'));
    const indexAt = (zone, e) => {
      const list = kids(zone);
      const i = list.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return opts.axis === 'x' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      });
      return i === -1 ? list.length : i;
    };

    root.addEventListener('dragstart', (e) => {
      const el = e.target.closest('[data-drag]');
      if (!el) return;
      dragId = el.dataset.drag;
      invalid = null;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      requestAnimationFrame(() => el.classList.add('p-dragging'));
    });
    root.addEventListener('dragover', (e) => {
      if (!dragId) return;
      const zone = e.target.closest('[data-drop]');
      root.querySelectorAll('[data-drop]').forEach((z) => z !== zone && z.classList.remove('p-can', 'p-cant'));
      if (!zone) { ghost.remove(); return; }
      const reason = canMove(dragId, zone.dataset.drop);
      if (reason) { invalid = reason; zone.classList.add('p-cant'); ghost.remove(); return; }
      invalid = null;
      e.preventDefault();
      zone.classList.add('p-can');
      const list = kids(zone);
      const idx = indexAt(zone, e);
      if (opts.indicator === false) return;
      if (list[idx]) list[idx].parentNode.insertBefore(ghost, list[idx]);
      else if (list.length) list[list.length - 1].after(ghost);
      else zone.appendChild(ghost);
    });
    root.addEventListener('drop', (e) => {
      if (!dragId) return;
      const zone = e.target.closest('[data-drop]');
      if (!zone) return;
      e.preventDefault();
      const idx = indexAt(zone, e);
      const id = dragId;
      dragId = null;
      ghost.remove();
      move(id, zone.dataset.drop, idx);
    });
    root.addEventListener('dragend', () => {
      if (invalid) toast(invalid);
      dragId = null;
      ghost.remove();
      root.querySelectorAll('.p-dragging').forEach((el) => el.classList.remove('p-dragging'));
      root.querySelectorAll('[data-drop]').forEach((z) => z.classList.remove('p-can', 'p-cant'));
    });
  }

  window.Portal = {
    state, CONFIG,
    item, pts, month, openMonths, pastMonths, monthItems, backlog, used, left, monthOf, where, history,
    canMove, move, nudge, pour, flatOrder, comment, reset,
    request, addRequest, updateRequest, acceptRequest, declineRequest, deleteRequest, commentRequest,
    addItem, updateItem, toggleShipped, toggleLock, setUser,
    isAdmin: () => state.user && state.user.role === 'admin',
    esc, fmtDate, toast, mountBar, enableDrag,
    onChange: (fn) => listeners.push(fn),
  };
})();
