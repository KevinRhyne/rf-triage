// Portal: months rail and an item list whose cards expand in place.

const P = Portal;
let view = null; // a month id, 'backlog', or 'requests' (set once data loads)
let openId = null;
let composing = false;    // new-request card showing
const triage = {};        // admin's type/points picks per pending request (not saved until accepted)
const drafts = {};        // unsaved title/description edits per request
let confirmDelete = null; // request id waiting for a second click on Delete


const admin = () => P.isAdmin();
const frozen = (it) => it.status === 'Shipped';
const editable = (open) => (open ? 'contenteditable="plaintext-only"' : '');

// Type + points tile on the left of each card, tinted by type.
// Requests have no points yet, so their tile shows just the type.
function typeTile(type, pts, isRequest) {
  const t = type || 'Request';
  const n = pts ?? (isRequest ? null : '?');
  const label = t === 'Feature' ? 'Feat' : t; // short label fits the tile
  return `<span class="type-tile ${t.toLowerCase()}" title="${t}">${n != null ? `<strong>${n}</strong>` : ''}<span>${label}</span></span>`;
}

function seg(act, id, options, current) {
  return `<span class="seg-toggle">${options.map((o) =>
    `<button type="button" data-act="${act}" data-id="${id}" data-val="${o}" class="${String(current) === String(o) ? 'on' : ''}">${o}</button>`).join('')}</span>`;
}

function pointsInput(act, id, value) {
  return `<label class="pts-input"><input type="number" min="1" step="1" inputmode="numeric" value="${value || ''}" placeholder="0" data-input="${act}" data-id="${id}"><span>pts</span></label>`;
}

function comment(c) {
  return `
    <li class="comment">
      <div class="c-body">
        <div class="c-head"><span class="who">${P.esc(c.by)}</span><span class="when">${P.fmtDate(c.at)}</span></div>
        <p>${P.esc(c.text)}</p>
      </div>
    </li>`;
}

// ---------- items ----------

function itemExpansion(it) {
  const inMonth = !!P.monthOf(it.id);
  const controls = admin() ? `
    <section class="admin-row">
      ${seg('type', it.id, ['Bug', 'Feature'], it.type)}
      ${pointsInput('points', it.id, it.points)}
      ${inMonth ? `<button type="button" class="chip-btn ${it.status === 'Shipped' ? 'on' : ''}" data-act="ship" data-id="${it.id}">&#10003; Shipped</button>` : ''}
    </section>` : '';
  return `
    <div class="p-expand"><div class="p-expand-inner">
      ${controls}
      ${commentSection(it.comments, 'data-comment', it.id)}
    </div></div>`;
}

function card(it) {
  const open = openId === it.id;
  const canEdit = admin();
  const classes = ['p-card', open && 'open', it.status === 'Shipped' && 'shipped', !it.points && 'unsized'].filter(Boolean).join(' ');
  return `
    <article class="${classes}" data-toggle="${it.id}" data-kind="item" data-editable="${canEdit}" data-movable="${!frozen(it)}">
      ${typeTile(it.type, it.points, false)}
      <div class="p-body">
        <p class="p-title"><span data-edit="title" ${editable(open && canEdit)}>${P.esc(it.title)}</span></p>
        ${it.description || canEdit ? `<p class="p-desc" data-edit="description" data-placeholder="Add a description" ${editable(open && canEdit)}>${P.esc(it.description)}</p>` : ''}
        ${it.status === 'Shipped' ? '<p class="p-shipped">&#10003; Shipped</p>' : ''}
      </div>
      ${itemExpansion(it)}
    </article>`;
}

// ---------- requests ----------

function commentSection(comments, attr, id, cls = '') {
  return `
    <section class="${cls}">
      ${comments.length ? `<ul class="comments">${comments.map(comment).join('')}</ul>` : ''}
      <form class="c-form" ${attr}="${id}">
        <input name="text" placeholder="Write a comment" autocomplete="off" required>
      </form>
    </section>`;
}

const reqType = (r) => drafts[r.id]?.type ?? r.type;

function requestEditActions(r) {
  const confirming = confirmDelete === r.id;
  return `
    <button type="button" class="btn-sm delete ${confirming ? 'confirm' : ''}" data-act="delete-request" data-id="${r.id}">${confirming ? 'Delete request?' : 'Delete'}</button>
    <button type="button" class="btn-sm save" data-act="save-request" data-id="${r.id}" ${drafts[r.id] ? '' : 'hidden'}>Save</button>`;
}

function requestExpansion(r) {
  if (r.status !== 'pending') return '<div class="p-expand"><div class="p-expand-inner"></div></div>';
  const comments = commentSection(r.comments || [], 'data-comment-request', r.id, 'plain');
  if (!admin()) {
    return `
      <div class="p-expand"><div class="p-expand-inner">
        <section class="actions plain">
          ${seg('r-type', r.id, ['Bug', 'Feature'], reqType(r))}
          <span class="actions-spacer"></span>
          ${requestEditActions(r)}
        </section>
        ${comments}
      </div></div>`;
  }
  const pick = triage[r.id] || {};
  return `
    <div class="p-expand"><div class="p-expand-inner">
      <section class="admin-row">
        ${seg('r-type', r.id, ['Bug', 'Feature'], reqType(r))}
        ${pointsInput('t-points', r.id, pick.points)}
      </section>
      <section class="actions">
        <button type="button" class="btn-primary" data-act="accept" data-id="${r.id}" ${reqType(r) && pick.points ? '' : 'disabled'}>Add to backlog</button>
        <button type="button" class="btn-quiet" data-act="decline" data-id="${r.id}">Decline</button>
        <span class="actions-spacer"></span>
        ${requestEditActions(r)}
      </section>
      ${comments}
    </div></div>`;
}

function requestCard(r) {
  const open = openId === r.id;
  const pending = r.status === 'pending';
  const classes = ['p-card', 'req', r.status, open && 'open'].filter(Boolean).join(' ');
  return `
    <article class="${classes}" data-toggle="${r.id}" data-kind="request" data-shown-type="${reqType(r)}" data-editable="${pending}" data-movable="false">
      ${typeTile(reqType(r), null, true)}
      <div class="p-body">
        <p class="p-title"><span data-edit="title" ${editable(open && pending)}>${P.esc(drafts[r.id]?.title ?? r.title)}</span></p>
        <p class="p-desc" data-edit="description" data-placeholder="Add a description" ${editable(open && pending)}>${P.esc(drafts[r.id]?.description ?? r.description)}</p>
        <p class="p-from">
          <span class="p-author">${P.esc(r.by)} · ${P.fmtDate(r.at)}</span>${pending ? '' : '<span class="declined-note">Declined</span>'}
        </p>
      </div>
      ${requestExpansion(r)}
    </article>`;
}

// A card-styled button that expands into an editor.
// kind 'request': client's new request. kind 'item': Kevin adding straight to the backlog (adds a points field).
function composer(kind = 'request') {
  const isItem = kind === 'item';
  return `
    <form class="p-card composer ${composing ? 'open' : ''}" data-form="${isItem ? 'new-item' : 'new-request'}">
      <button type="button" class="composer-trigger" data-act="compose" tabindex="${composing ? -1 : 0}">
        <span class="plus">+</span> ${isItem ? 'Add to backlog' : 'New request'}
      </button>
      <div class="p-expand"><div class="p-expand-inner">
        <div class="composer-body">
          ${typeTile('New', null, true)}
          <div class="p-body">
            <input class="ghost-input title" name="title" placeholder="Title" autocomplete="off" required>
            <textarea class="ghost-input" name="description" placeholder="Description" rows="3"></textarea>
            <input type="hidden" name="type" value="">
            <div class="actions">
              ${seg('c-type', 'new', ['Bug', 'Feature'], '')}
              ${isItem ? '<label class="pts-input"><input type="number" name="points" min="1" step="1" inputmode="numeric" placeholder="0"><span>pts</span></label>' : ''}
              <span class="actions-spacer"></span>
              <button type="button" class="btn-quiet" data-act="cancel-compose">Cancel</button>
              <button type="submit" class="btn-primary">${isItem ? 'Add' : 'Submit'}</button>
            </div>
          </div>
        </div>
      </div></div>
    </form>`;
}

// Open/close the composer on the live DOM so the expand animation plays.
function setComposing(on) {
  composing = on;
  const form = app.querySelector('.composer');
  if (!form) return;
  form.classList.toggle('open', on);
  form.querySelector('.composer-trigger').tabIndex = on ? -1 : 0;
  if (on) {
    if (openId) setOpen(null);
    setTimeout(() => form.querySelector('input.title').focus(), 200);
  } else {
    form.reset();
    form.querySelectorAll('[data-act="c-type"]').forEach((b) => b.classList.remove('on'));
    form.querySelector('.type-tile').outerHTML = typeTile('New', null, true);
  }
}

// ---------- rail ----------

function folder(id, name, num, pct, over) {
  const track = !pct ? '' : `<span class="track"><i style="width:${pct}%"></i></span>`;
  const droppable = id !== 'requests';
  return `
    <button class="folder ${view === id ? 'active' : ''} ${over ? 'over' : ''}" data-view="${id}" ${droppable ? 'data-droppable' : ''}>
      <span class="row"><span class="name">${name}</span><span class="num">${num}</span></span>
      ${track}
    </button>`;
}

function rail() {
  const months = P.openMonths();
  const pending = P.state.requests.filter((r) => r.status === 'pending').length;
  return `
    <nav class="rail"><div class="rail-panel">
      <div class="brand">
        <span class="mark">R&amp;F</span>
        <span class="brand-text">
          ${P.state.clients.length > 1
            ? `<select class="client client-switch" data-client-switch>${P.state.clients.map((c) => `<option value="${c.id}" ${c.id === P.state.client.id ? 'selected' : ''}>${P.esc(c.name)}</option>`).join('')}</select>`
            : `<span class="client">${P.esc(P.state.client.name)}</span>`}
          <span class="product">${P.esc(P.state.client.plan)}</span>
        </span>
      </div>
      <div class="group first">
        ${months.map((m) => {
          const u = P.used(m);
          return folder(m.id, m.label, `${u}/${m.capacity}`, Math.min(100, (u / m.capacity) * 100), u > m.capacity);
        }).join('')}
      </div>
      <div class="group">
        ${folder('backlog', 'Backlog', P.state.backlog.length)}
        ${folder('requests', 'Requests', pending || '')}
      </div>
      <div class="rail-foot">
        <span>${P.esc(P.state.user.name)}${P.isAdmin() ? ' · Admin' : ''}</span>
        <button type="button" class="btn-quiet" data-act="sign-out">Sign out</button>
      </div>
    </div></nav>`;
}

// ---------- list ----------

function capacityBar(m) {
  const u = P.used(m);
  const pct = Math.min(100, (u / m.capacity) * 100);
  return `
    <div class="pb ${u > m.capacity ? 'is-over' : ''}">
      <div class="pb-track"><span class="pb-fill" style="width:${pct}%"></span><span class="pb-label">${u} of ${m.capacity} points</span></div>
    </div>`;
}

function list() {
  if (view === 'requests') {
    const reqs = P.state.requests;
    const ordered = [...reqs.filter((r) => r.status === 'pending'), ...reqs.filter((r) => r.status === 'declined')];
    return `
      <section class="list-pane">
        <div class="list-head"><h1>Requests</h1></div>
        <div class="head-rule"></div>
        <div class="cards">
          ${admin() ? '' : composer()}
          ${ordered.map(requestCard).join('') || (admin() ? '<p class="p-empty">No requests yet</p>' : '')}
        </div>
      </section>`;
  }
  const isBacklog = view === 'backlog';
  const m = isBacklog ? null : P.month(view);
  const items = isBacklog ? P.backlog() : P.monthItems(view);
  const head = isBacklog
    ? '<div class="list-head"><h1>Backlog</h1></div>'
    : `<div class="list-head month">
        <div class="title-row"><h1>${m.label}</h1></div>
        ${capacityBar(m)}
      </div>`;
  return `
    <section class="list-pane">
      ${head}
      <div class="head-rule"></div>
      <div class="cards">
        ${isBacklog && admin() ? composer('item') : ''}
        ${items.map(card).join('') || `<p class="p-empty">${isBacklog ? 'Backlog is empty' : 'Drag items from the backlog onto this release'}</p>`}
      </div>
    </section>`;
}

function signInScreen() {
  return `
    <div class="signin">
      <form class="signin-form" data-form="sign-in">
        <span class="mark">R&amp;F</span>
        <h1>Triage</h1>
        <input name="code" placeholder="Client code" autocomplete="username" autocapitalize="characters" required>
        <input name="name" placeholder="Your name" autocomplete="name" value="${P.esc(P.savedName())}" required>
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required>
        <button type="submit" class="btn-primary">Sign in</button>
        <p class="signin-error" hidden></p>
      </form>
    </div>`;
}

function render() {
  if (!P.ready) {
    app.classList.add('signed-out');
    app.innerHTML = signInScreen();
    app.querySelector('[name="code"]')?.focus();
    return;
  }
  app.classList.remove('signed-out');
  if (!view || (view !== 'backlog' && view !== 'requests' && !P.month(view))) view = P.openMonths()[0]?.id || 'backlog';
  const scroll = app.querySelector('.list-pane')?.scrollTop || 0;
  app.innerHTML = rail() + list();
  const pane = app.querySelector('.list-pane');
  if (pane) pane.scrollTop = scroll;
}

// ---------- open / close ----------

// Toggle open state on the live DOM (no re-render) so the CSS transition plays.
function setOpen(id) {
  const prev = openId && app.querySelector(`[data-toggle="${openId}"]`);
  if (prev) {
    prev.classList.remove('open');
    prev.querySelectorAll('[data-edit]').forEach((el) => el.removeAttribute('contenteditable'));
    discardDraft(prev);
  }
  openId = id;
  const next = id && app.querySelector(`[data-toggle="${id}"]`);
  if (next) {
    next.classList.add('open');
    if (next.dataset.editable === 'true') next.querySelectorAll('[data-edit]').forEach((el) => el.setAttribute('contenteditable', 'plaintext-only'));
    setTimeout(() => next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 360);
  }
}

// Closing a request throws away edits that weren't saved.
function discardDraft(cardEl) {
  const id = cardEl.dataset.toggle;
  if (cardEl.dataset.kind !== 'request' || !drafts[id]) return;
  delete drafts[id];
  const r = P.request(id);
  cardEl.querySelector('[data-edit="title"]').textContent = r.title;
  cardEl.querySelector('[data-edit="description"]').textContent = r.description;
  const save = cardEl.querySelector('[data-act="save-request"]');
  if (save) save.hidden = true;
  if (r.type !== cardEl.dataset.shownType) requestAnimationFrame(render); // type changed in the draft; redraw its label
}

// ---------- events ----------

const app = document.getElementById('app');

function act(el) {
  const { act: a, id, val } = el.dataset;
  switch (a) {
    case 'sign-out': openId = null; composing = false; view = null; return P.signOut();
    case 'compose': return setComposing(true);
    case 'cancel-compose': return setComposing(false);
    case 'type': return P.updateItem(id, { type: val });
    case 'ship': return P.toggleShipped(id);
    case 'r-type': {
      const r = P.request(id);
      const d = { title: r.title, description: r.description, type: r.type, ...drafts[id], type: val };
      if (d.title === r.title && d.description === r.description && d.type === r.type) delete drafts[id];
      else drafts[id] = d;
      return render();
    }
    case 'c-type': {
      const form = el.closest('form');
      form.elements.type.value = val;
      form.querySelectorAll('[data-act="c-type"]').forEach((b) => b.classList.toggle('on', b === el));
      form.querySelector('.type-tile').outerHTML = typeTile(val, null, true);
      return;
    }
    case 'accept': {
      if (drafts[id]) { P.updateRequest(id, drafts[id], true); delete drafts[id]; }
      const it = P.acceptRequest(id, P.request(id).type, triage[id].points);
      delete triage[id];
      openId = null;
      P.toast(`Added "${it.title}" to the backlog`);
      return;
    }
    case 'decline': openId = null; delete drafts[id]; return P.declineRequest(id);
    case 'save-request':
      P.updateRequest(id, drafts[id]);
      delete drafts[id];
      render();
      return P.toast('Saved');
    case 'delete-request':
      if (confirmDelete !== id) { confirmDelete = id; return render(); }
      confirmDelete = null;
      delete drafts[id];
      openId = null;
      P.deleteRequest(id);
      return P.toast('Request deleted');
  }
}

app.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (confirmDelete && a?.dataset.act !== 'delete-request') { confirmDelete = null; if (!a) render(); }
  if (a) return act(a);
  const f = e.target.closest('[data-view]');
  if (f) { view = f.dataset.view; openId = null; composing = false; return render(); }
  if (e.target.closest('.p-expand') || e.target.closest('.composer')) return; // clicks inside the open area don't toggle
  if (e.target.closest('[contenteditable]')) return; // editing text in an open card
  const c = e.target.closest('[data-toggle]');
  if (c) setOpen(openId === c.dataset.toggle ? null : c.dataset.toggle);
});

// Points: item points save on change; triage points update the Add button without re-rendering.
app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-input="points"]');
  if (!el) return;
  const n = Math.round(Number(el.value));
  if (n > 0) P.updateItem(el.dataset.id, { points: n });
  else { el.value = P.item(el.dataset.id).points || ''; P.toast('Points must be a whole number above 0'); }
});
app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input="t-points"]');
  if (!el) return;
  const n = Math.round(Number(el.value));
  triage[el.dataset.id] = { ...triage[el.dataset.id], points: n > 0 ? n : null };
  const pick = triage[el.dataset.id];
  el.closest('.p-card').querySelector('[data-act="accept"]').disabled = !(reqType(P.request(el.dataset.id)) && pick.points);
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-input]')) e.target.blur();
});

// Request edits are held as a draft until Save; item edits (Kevin) save as you type.
app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-edit]');
  if (!el) return;
  const c = el.closest('[data-toggle]');
  const id = c.dataset.toggle;
  if (c.dataset.kind === 'request') {
    const r = P.request(id);
    const draft = {
      title: c.querySelector('[data-edit="title"]').textContent.trim(),
      description: c.querySelector('[data-edit="description"]').textContent.trim(),
      type: reqType(r),
    };
    const changed = draft.title !== r.title || draft.description !== r.description || draft.type !== r.type;
    if (changed) drafts[id] = draft; else delete drafts[id];
    c.querySelector('[data-act="save-request"]').hidden = !changed || !draft.title;
  } else {
    P.updateItem(id, { [el.dataset.edit]: el.textContent.trim() }, true);
  }
});
app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-edit="title"]')) { e.preventDefault(); e.target.blur(); }
});

app.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-client-switch]');
  if (!sel) return;
  openId = null; composing = false; view = null;
  P.switchClient(sel.value);
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'sign-in') {
    const data = new FormData(f);
    const err = f.querySelector('.signin-error');
    const btn = f.querySelector('button');
    btn.disabled = true;
    err.hidden = true;
    try {
      await P.signIn(String(data.get('code')), String(data.get('name')), String(data.get('password')));
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
    return;
  }
  if (f.dataset.form === 'new-item') {
    const data = new FormData(f);
    const points = Math.round(Number(data.get('points')));
    if (!data.get('type')) return P.toast('Pick Bug or Feature');
    if (!(points > 0)) return P.toast('Add points');
    const it = P.addItem(data.get('type'), points, String(data.get('title')).trim(), String(data.get('description')).trim());
    composing = false;
    render();
    P.toast(`Added "${it.title}" to the backlog`);
    return;
  }
  if (f.dataset.form === 'new-request') {
    const data = new FormData(f);
    if (!data.get('type')) return P.toast('Pick Bug or Feature');
    P.addRequest(data.get('type'), String(data.get('title')).trim(), String(data.get('description')).trim());
    composing = false;
    render();
    P.toast('Request sent');
    return;
  }
  if (f.dataset.comment) {
    P.comment(f.dataset.comment, new FormData(f).get('text').trim());
    app.querySelector(`[data-comment="${f.dataset.comment}"] input`)?.focus();
  }
  if (f.dataset.commentRequest) {
    P.commentRequest(f.dataset.commentRequest, new FormData(f).get('text').trim());
    app.querySelector(`[data-comment-request="${f.dataset.commentRequest}"] input`)?.focus();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (composing) return setComposing(false);
  if (openId) setOpen(null);
});

// ---------- drag to reorder ----------
// Pointer-based so we control the motion: the card lifts into a floating copy, its slot
// travels through the list while other cards slide aside, and drops onto rail folders move it.

const DRAG_START_PX = 5;
let drag = null;
let suppressClick = false;

function cardEls(list) {
  return [...list.children].filter((c) => c.classList.contains('p-card') && !c.classList.contains('composer'));
}

// Animate cards from their old positions to new ones after a DOM change (FLIP).
function flip(list, mutate) {
  const cards = cardEls(list);
  const before = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
  mutate();
  cards.forEach((c) => {
    const dy = before.get(c) - c.getBoundingClientRect().top;
    if (!dy) return;
    c.style.transition = 'none';
    c.style.transform = `translateY(${dy}px)`;
    c.offsetHeight; // commit the inverted position before animating back
    c.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    c.style.transform = '';
  });
}

function startDrag(e) {
  const d = drag;
  // Collapse any open card instantly so heights are stable while dragging.
  if (openId) {
    const list = d.el.parentNode;
    list.classList.add('instant');
    app.querySelector(`[data-toggle="${openId}"]`)?.classList.remove('open');
    openId = null;
    list.offsetHeight;
    list.classList.remove('instant');
  }
  const r = d.el.getBoundingClientRect();
  d.dx = d.x0 - r.left;
  d.dy = d.y0 - r.top;
  d.ghost = d.el.cloneNode(true);
  d.ghost.classList.add('drag-ghost');
  Object.assign(d.ghost.style, { width: `${r.width}px`, left: '0px', top: '0px' });
  document.body.appendChild(d.ghost);
  d.el.classList.add('drag-slot');
  document.body.classList.add('is-dragging');
  d.active = true;
  d.list = d.el.parentNode;
  d.pane = d.list.closest('.list-pane');
  moveGhost(e);
}

function moveGhost(e) {
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-0.6deg)`;
}

function setFolderTarget(folder) {
  if (drag.folder === folder) return;
  drag.folder?.classList.remove('p-can', 'p-cant');
  drag.folder = folder;
  if (!folder) return;
  drag.reason = folder.dataset.view === view ? null : P.canMove(drag.id, folder.dataset.view);
  folder.classList.add(drag.reason ? 'p-cant' : 'p-can');
}

function updateDrag(e) {
  moveGhost(e);
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const folder = hit?.closest('[data-droppable]');
  setFolderTarget(folder && folder.dataset.view !== view ? folder : null);
  if (drag.folder) return;

  // Reorder inside the visible list using layout positions (immune to running transforms).
  if (P.canMove(drag.id, view)) return;
  const listTop = drag.list.getBoundingClientRect().top;
  const others = cardEls(drag.list).filter((c) => c !== drag.el);
  const idx = others.filter((c) => listTop + c.offsetTop + c.offsetHeight / 2 < e.clientY).length;
  const ref = others[idx] || null;
  if (drag.el.nextElementSibling === ref || (!ref && drag.el === drag.list.lastElementChild)) return;
  flip(drag.list, () => drag.list.insertBefore(drag.el, ref));

  // Auto-scroll near the edges of the list pane.
  const pr = drag.pane.getBoundingClientRect();
  if (e.clientY < pr.top + 60) drag.pane.scrollTop -= 12;
  else if (e.clientY > pr.bottom - 60) drag.pane.scrollTop += 12;
}

function endDrag() {
  const d = drag;
  drag = null;
  document.body.classList.remove('is-dragging');
  const cleanup = () => { d.ghost.remove(); d.el.classList.remove('drag-slot'); };

  if (d.folder) {
    d.folder.classList.remove('p-can', 'p-cant');
    if (d.reason) {
      P.toast(d.reason);
      // Put the slot back where the card started, since nothing moved.
      flip(d.list, () => d.list.insertBefore(d.el, cardEls(d.list).filter((c) => c !== d.el)[d.startIndex] || null));
      return settle(d, cleanup);
    }
    d.ghost.classList.add('drop-away');
    setTimeout(() => { cleanup(); P.move(d.id, d.folder.dataset.view); }, 160);
    return;
  }
  const index = cardEls(d.list).indexOf(d.el);
  settle(d, () => {
    cleanup();
    if (index !== d.startIndex) P.move(d.id, view, index);
  });
}

// Glide the floating copy into the card's slot, then finish.
function settle(d, done) {
  const r = d.el.getBoundingClientRect();
  d.ghost.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms';
  d.ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
  d.ghost.classList.add('landing');
  setTimeout(done, 180);
}

app.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || drag) return;
  const el = e.target.closest('.p-card');
  if (!el || el.dataset.movable !== 'true' || e.target.closest('.p-expand') || e.target.closest('[contenteditable]')) return;
  drag = { id: el.dataset.toggle, el, x0: e.clientX, y0: e.clientY, active: false, startIndex: cardEls(el.parentNode).indexOf(el) };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START_PX) return;
    startDrag(e);
  }
  e.preventDefault();
  updateDrag(e);
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  if (!drag.active) { drag = null; return; } // plain click, let it through
  suppressClick = true;
  endDrag();
});
window.addEventListener('click', (e) => {
  if (!suppressClick) return;
  suppressClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

P.onChange(render);
app.innerHTML = '';
P.init().finally(render);
