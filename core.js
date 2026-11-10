// Data layer: Supabase-backed state, rules, and helpers. Exposes window.Portal.
// The UI reads an in-memory `state`; every change updates it right away and is written to
// Supabase in the background. If a write fails, we toast and reload from the server.

(function () {
  const cfg = window.TRIAGE_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const NAME_KEY = 'triage-name';
  const CLIENT_KEY = 'triage-client';

  let state = null; // null until signed in and loaded
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn());

  // ---------- auth ----------

  const emailFor = (code) => `${code.trim().toLowerCase()}@${cfg.loginDomain}`;
  const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };

  async function signIn(code, name, password) {
    const { error } = await sb.auth.signInWithPassword({ email: emailFor(code), password });
    if (error) throw new Error('That client code and password don\'t match.');
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch (e) {}
    await load();
  }

  async function signOut() {
    await sb.auth.signOut();
    state = null;
    changed();
  }

  // Resume a saved session on page load. Returns true if signed in.
  async function init() {
    const { data } = await sb.auth.getSession();
    if (!data.session || !savedName()) return false;
    try { await load(); return true; } catch (e) { return false; }
  }

  // ---------- loading ----------

  const monthLabel = (iso, opts) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', opts);

  async function load(clientId) {
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) throw new Error('Not signed in');
    const { data: member, error: mErr } = await sb.from('members').select('role, client_id').eq('user_id', auth.user.id).single();
    if (mErr || !member) throw new Error('This login isn\'t set up for Triage yet.');

    const isAdmin = member.role === 'admin';
    const { data: clients } = await sb.from('clients').select('*').order('name');
    if (!clients || !clients.length) throw new Error('No clients set up yet.');

    let remembered = null;
    try { remembered = localStorage.getItem(CLIENT_KEY); } catch (e) {}
    const client = isAdmin
      ? clients.find((c) => c.id === (clientId || remembered)) || clients[0]
      : clients.find((c) => c.id === member.client_id);
    try { localStorage.setItem(CLIENT_KEY, client.id); } catch (e) {}

    await sb.rpc('ensure_months', { target_client: client.id });
    const thisMonth = new Date();
    const firstOfMonth = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`;

    const [months, items, requests, comments] = await Promise.all([
      sb.from('months').select('*').eq('client_id', client.id).gte('starts_on', firstOfMonth).order('starts_on'),
      sb.from('items').select('*').eq('client_id', client.id).order('position'),
      sb.from('requests').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
      sb.from('comments').select('*').eq('client_id', client.id).order('created_at'),
    ]);
    for (const r of [months, items, requests, comments]) if (r.error) throw r.error;

    const toComment = (c) => ({ id: c.id, by: c.author_name, at: c.created_at, text: c.body });
    const s = {
      user: { name: savedName(), role: isAdmin ? 'admin' : 'client' },
      clients: isAdmin ? clients : [client],
      client: { id: client.id, name: client.name, plan: client.plan, defaultCapacity: client.default_capacity },
      months: months.data.map((m) => ({
        id: m.id,
        label: monthLabel(m.starts_on, { month: 'long' }),
        short: monthLabel(m.starts_on, { month: 'short' }),
        capacity: m.capacity,
        closed: false,
        locked: false,
        order: [],
      })),
      backlog: [],
      items: items.data.map((it) => ({
        id: it.id, type: it.type, points: it.points, title: it.title, description: it.description,
        status: it.status, monthId: it.month_id, position: it.position,
        comments: comments.data.filter((c) => c.item_id === it.id).map(toComment),
      })),
      requests: requests.data.map((r) => ({
        id: r.id, type: r.type, title: r.title, description: r.description, status: r.status,
        by: r.author_name, at: r.created_at,
        comments: comments.data.filter((c) => c.request_id === r.id).map(toComment),
      })),
    };

    // Place items. Unshipped items left in a past month roll to the top of this month.
    const current = s.months[0];
    const rolled = [];
    for (const it of s.items) {
      const m = s.months.find((x) => x.id === it.monthId);
      if (m) m.order.push(it.id);
      else if (!it.monthId) s.backlog.push(it.id);
      else if (it.status !== 'Shipped' && current) rolled.push(it.id);
      // shipped items from past months aren't shown
    }
    if (current && rolled.length) current.order.unshift(...rolled);

    state = s;
    if (rolled.length) savePositions([current.id]);
    changed();
  }

  async function switchClient(id) {
    await load(id);
  }

  // ---------- writes ----------

  function fail(err) {
    console.error(err);
    toast('Couldn\'t save that. Reloading.');
    load(state && state.client.id).catch(() => {});
  }

  async function write(promise) {
    const { error } = await promise;
    if (error) fail(error);
  }

  // Persist month + order for every item in the given lists ('backlog' or month ids).
  function savePositions(lists) {
    const writes = [];
    for (const target of new Set(lists)) {
      const ids = target === 'backlog' ? state.backlog : month(target).order;
      const monthId = target === 'backlog' ? null : target;
      ids.forEach((id, i) => {
        const it = item(id);
        if (it.position === i && it.monthId === monthId) return;
        it.position = i;
        it.monthId = monthId;
        writes.push(sb.from('items').update({ position: i, month_id: monthId }).eq('id', id));
      });
    }
    Promise.all(writes).then((rs) => { const bad = rs.find((r) => r.error); if (bad) fail(bad.error); });
  }

  function log(text, itemId) {
    sb.from('activity').insert({ client_id: state.client.id, item_id: itemId || null, actor_name: state.user.name, text })
      .then(({ error }) => error && console.warn('activity log failed', error));
  }

  // ---------- getters ----------

  const item = (id) => state.items.find((i) => i.id === id);
  const pts = (it) => (it && it.points) || 0;
  const month = (id) => state.months.find((m) => m.id === id);
  const openMonths = () => state.months;
  const monthItems = (id) => month(id).order.map(item);
  const backlog = () => state.backlog.map(item);
  const used = (m) => m.order.reduce((s, id) => s + pts(item(id)), 0);
  const left = (m) => m.capacity - used(m);
  const monthOf = (id) => state.months.find((m) => m.order.includes(id)) || null;
  const where = (id) => (monthOf(id) ? monthOf(id).id : 'backlog');
  const listOf = (target) => (target === 'backlog' ? state.backlog : month(target).order);
  const isAdmin = () => !!state && state.user.role === 'admin';

  // ---------- rules ----------

  // Returns null if allowed, otherwise a human reason string.
  function canMove(id, target) {
    const it = item(id);
    const from = where(id);
    if (it.status === 'Shipped' && from !== target) return 'Shipped items stay in their month.';
    if (target === 'backlog') return null;
    const m = month(target);
    if (!it.points) return 'Kevin needs to estimate this one before it can be planned.';
    if (from !== target && pts(it) > left(m) && !isAdmin()) return `Not enough room in ${m.label}: needs ${pts(it)}, ${left(m)} left.`;
    return null;
  }

  // Move to a list (backlog or month id) at index (default: end). Returns reason or null.
  function move(id, target, index) {
    const reason = canMove(id, target);
    if (reason) { toast(reason); return reason; }
    const from = where(id);
    const src = listOf(from);
    src.splice(src.indexOf(id), 1);
    const dst = listOf(target);
    const idx = index == null ? dst.length : Math.max(0, Math.min(index, dst.length));
    dst.splice(idx, 0, id);
    const it = item(id);
    if (from !== target) log(target === 'backlog' ? `moved "${it.title}" back to the backlog` : `moved "${it.title}" to ${month(target).label}`, id);
    changed();
    savePositions([from, target]);
    return null;
  }

  // ---------- comments ----------

  function addComment(list, row) {
    const c = { id: crypto.randomUUID(), by: state.user.name, at: new Date().toISOString(), text: row.body };
    list.push(c);
    changed();
    write(sb.from('comments').insert({ id: c.id, client_id: state.client.id, author_name: c.by, ...row }));
  }

  function comment(id, text) {
    addComment(item(id).comments, { item_id: id, body: text });
  }

  function commentRequest(id, text) {
    addComment(request(id).comments, { request_id: id, body: text });
  }

  // ---------- requests ----------

  const request = (id) => state.requests.find((r) => r.id === id);

  function addRequest(type, title, description) {
    const r = { id: crypto.randomUUID(), type, title, description, by: state.user.name, at: new Date().toISOString(), status: 'pending', comments: [] };
    state.requests.unshift(r);
    changed();
    write(sb.from('requests').insert({ id: r.id, client_id: state.client.id, type, title, description, author_name: r.by }));
    log(`requested "${title}"`);
    return r;
  }

  function updateRequest(id, fields) {
    Object.assign(request(id), fields);
    changed();
    const row = {};
    for (const k of ['type', 'title', 'description', 'status']) if (k in fields) row[k] = fields[k];
    write(sb.from('requests').update(row).eq('id', id));
  }

  // Turn a pending request into a backlog item (bottom of the backlog). Comments carry over.
  function acceptRequest(id, type, points) {
    const r = request(id);
    const it = { id: crypto.randomUUID(), type, points, title: r.title, description: r.description, status: 'Planned', monthId: null, position: state.backlog.length, comments: r.comments || [] };
    state.items.push(it);
    state.backlog.push(it.id);
    state.requests = state.requests.filter((x) => x.id !== id);
    changed();
    (async () => {
      const ins = await sb.from('items').insert({ id: it.id, client_id: state.client.id, type, points, title: it.title, description: it.description, position: it.position });
      if (ins.error) return fail(ins.error);
      const mv = await sb.from('comments').update({ item_id: it.id, request_id: null }).eq('request_id', id);
      if (mv.error) return fail(mv.error);
      await write(sb.from('requests').delete().eq('id', id));
    })();
    log(`added "${it.title}" to the backlog`, it.id);
    return it;
  }

  function deleteRequest(id) {
    state.requests = state.requests.filter((x) => x.id !== id);
    changed();
    write(sb.from('requests').delete().eq('id', id));
  }

  function declineRequest(id) {
    log(`declined "${request(id).title}"`);
    updateRequest(id, { status: 'declined' });
  }

  // ---------- admin edits ----------

  const pending = {};
  // quiet: update without re-rendering and debounce the write (used while typing inline)
  function updateItem(id, fields, quiet) {
    Object.assign(item(id), fields);
    const row = {};
    for (const k of ['type', 'points', 'title', 'description', 'status']) if (k in fields) row[k] = fields[k];
    if (!quiet) {
      changed();
      return write(sb.from('items').update(row).eq('id', id));
    }
    pending[id] = { ...pending[id], ...row };
    clearTimeout(pending[id].timer);
    const timer = setTimeout(() => {
      const { timer: _, ...data } = pending[id];
      delete pending[id];
      write(sb.from('items').update(data).eq('id', id));
    }, 600);
    pending[id].timer = timer;
  }

  // Kevin adding an item straight to the backlog (bottom).
  function addItem(type, points, title, description) {
    const it = { id: crypto.randomUUID(), type, points, title, description, status: 'Planned', monthId: null, position: state.backlog.length, comments: [] };
    state.items.push(it);
    state.backlog.push(it.id);
    changed();
    write(sb.from('items').insert({ id: it.id, client_id: state.client.id, type, points, title, description, position: it.position }));
    log(`added "${title}" to the backlog`, it.id);
    return it;
  }

  function toggleShipped(id) {
    const it = item(id);
    updateItem(id, { status: it.status === 'Shipped' ? 'Planned' : 'Shipped' });
    log(`marked "${it.title}" ${it.status.toLowerCase()}`, id);
  }

  // Pull fresh data when the tab comes back, so people see each other's changes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state && !Object.keys(pending).length) load(state.client.id).catch(() => {});
  });

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

  window.Portal = {
    get state() { return state; },
    get ready() { return !!state; },
    savedName,
    init, signIn, signOut, switchClient,
    item, pts, month, openMonths, monthItems, backlog, used, left, monthOf, where,
    canMove, move, comment,
    request, addRequest, updateRequest, acceptRequest, declineRequest, deleteRequest, commentRequest,
    addItem, updateItem, toggleShipped, isAdmin,
    esc, fmtDate, toast,
    onChange: (fn) => listeners.push(fn),
  };
})();
