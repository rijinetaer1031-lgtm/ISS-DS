(function () {
  const { $, esc } = ISS;
  let role = '', types = [], events = {}, subfolders = {}, docs = [], query = '';
  const view = $('#view'), crumbs = $('#crumbs');
  const byId = (id) => docs.find((d) => d.id === id);
  const canManage = () => role !== 'Officer';

  /* ---------- routing: #/Department/Event/DocTypeFolder ---------- */
  function route() {
    let parts = [];
    try { parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); } catch {}
    const cat = types.includes(parts[0]) ? parts[0] : null;
    const ev = cat ? parts[1] || null : null;
    const dt = ev ? parts[2] || null : null;
    return { cat, ev, dt };
  }
  const go = (cat, ev, dt) => { location.hash = '/' + [cat, ev, dt].filter(Boolean).map(encodeURIComponent).join('/'); };

  /* ---------- data helpers ---------- */
  const activeEventNames = (cat) => new Set((events[cat] || []).map((e) => e.name));
  const activeSubNames = (cat, ev) => new Set((((subfolders[cat] || {})[ev]) || []).map((s) => s.name));

  const docsInEvent = (cat, ev) => {
    const names = activeEventNames(cat);
    return docs.filter((d) => d.category === cat && (ev === 'General'
      ? (!d.subfolder || d.subfolder === 'General' || !names.has(d.subfolder))
      : d.subfolder === ev));
  };

  const docsInFolder = (cat, ev, dt) => {
    const subNames = activeSubNames(cat, ev);
    return docsInEvent(cat, ev).filter((d) => dt === 'General'
      ? (!d.doc_type || d.doc_type === 'General' || !subNames.has(d.doc_type))
      : d.doc_type === dt);
  };

  /* ---------- views ---------- */
  function folderHtml({ name, sub, icon, tone, i, attrs, tools = '' }) {
    return `<div class="folder-wrap">
      <button class="folder ${tone}" style="--i:${Math.min(i, 10)}" ${attrs}>
        <div class="folder__back"></div><div class="folder__sheet"></div><div class="folder__sheet"></div>
        <div class="folder__front"><div class="folder__ico"><i class="fa-solid ${icon}"></i></div><div><h3>${esc(name)}</h3><p>${sub}</p></div></div>
      </button>${tools}</div>`;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function renderDepartments() {
    crumbs.innerHTML = '<span class="here"><i class="fa-solid fa-house"></i> All departments</span>';
    view.innerHTML = types.length
      ? `<div class="folders">${types.map((c, i) => folderHtml({
          name: c, i, icon: ISS.catIcon(c), tone: ISS.toneFor(c),
          sub: plural(docs.filter((d) => d.category === c).length, 'file'),
          attrs: `data-go="${esc(c)}"`,
        })).join('')}</div>`
      : '<div class="empty"><i class="fa-regular fa-folder-open"></i><strong>No departments available</strong></div>';
  }

  function renderEvents(cat) {
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i><span class="here">${esc(cat)}</span>
      ${canManage() ? '<span class="grow"></span><button class="btn btn-primary btn-sm" id="addEvent" style="color:#fff"><i class="fa-solid fa-calendar-plus"></i> Add event</button>' : ''}`;
    const tone = ISS.toneFor(cat);
    const general = folderHtml({ name: 'General', i: 0, icon: 'fa-calendar-day', tone: 't-indigo', sub: `${plural(docsInEvent(cat, 'General').length, 'file')} · no event`, attrs: 'data-go-event="General"' });
    const list = (events[cat] || []).map((e, i) => folderHtml({
      name: e.name, i: i + 1, icon: 'fa-ticket', tone, sub: plural(docsInEvent(cat, e.name).length, 'file'), attrs: `data-go-event="${esc(e.name)}"`,
      tools: canManage() ? `<div class="folder-tools"><button class="tool" data-rename-ev="${e.id}" title="Rename event" aria-label="Rename ${esc(e.name)}"><i class="fa-solid fa-pen"></i></button><button class="tool danger" data-delete-ev="${e.id}" title="Move event to Recycle Bin" aria-label="Delete ${esc(e.name)}"><i class="fa-solid fa-trash"></i></button></div>` : '',
    })).join('');
    view.innerHTML = `<div class="folders">${general}${list}</div>`;
  }

  function renderDocTypes(cat, ev) {
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-cat>${esc(cat)}</button><i class="fa-solid fa-chevron-right sep"></i><span class="here">${esc(ev)}</span>
      ${canManage() ? '<span class="grow"></span><button class="btn btn-primary btn-sm" id="addSub" style="color:#fff"><i class="fa-solid fa-folder-plus"></i> Add document type</button>' : ''}`;
    const subs = ((subfolders[cat] || {})[ev]) || [];
    const general = folderHtml({ name: 'General', i: 0, icon: 'fa-folder', tone: 't-indigo', sub: `${plural(docsInFolder(cat, ev, 'General').length, 'file')} · uncategorized`, attrs: 'data-go-sub="General"' });
    const list = subs.map((s, i) => folderHtml({
      name: s.name, i: i + 1, icon: 'fa-folder-open', tone: ISS.toneFor(s.name), sub: plural(docsInFolder(cat, ev, s.name).length, 'file'), attrs: `data-go-sub="${esc(s.name)}"`,
      tools: canManage() ? `<div class="folder-tools"><button class="tool" data-rename-sub="${s.id}" title="Rename folder" aria-label="Rename ${esc(s.name)}"><i class="fa-solid fa-pen"></i></button><button class="tool danger" data-delete-sub="${s.id}" title="Move folder to Recycle Bin" aria-label="Delete ${esc(s.name)}"><i class="fa-solid fa-trash"></i></button></div>` : '',
    })).join('');
    view.innerHTML = `<div class="folders">${general}${list}</div>`;
  }

  function renderFiles(cat, ev, dt) {
    const list = docsInFolder(cat, ev, dt);
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-cat>${esc(cat)}</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-ev>${esc(ev)}</button><i class="fa-solid fa-chevron-right sep"></i>
      <span class="here">${esc(dt)}</span><span class="grow"></span>
      <a class="btn btn-primary btn-sm" style="color:#fff" href="/upload?category=${encodeURIComponent(cat)}&subfolder=${encodeURIComponent(ev)}&doc_type=${encodeURIComponent(dt)}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload here</a>`;
    view.innerHTML = list.length
      ? `<div class="doc-list">${list.map((d) => ISS.docs.row(d, role, { edit: true, remove: true })).join('')}</div>`
      : '<div class="empty"><i class="fa-regular fa-folder-open"></i><strong>This folder is empty</strong>Use “Upload here” to add the first file.</div>';
  }

  function renderSearch(q) {
    const t = q.toLowerCase();
    const list = docs.filter((d) => `${d.title} ${d.standardized_file_name} ${d.category} ${d.subfolder || ''} ${d.doc_type || ''}`.toLowerCase().includes(t));
    crumbs.innerHTML = `<span class="here"><i class="fa-solid fa-magnifying-glass"></i> ${plural(list.length, 'result')} for “${esc(q)}”</span>`;
    view.innerHTML = list.length
      ? `<div class="doc-list">${list.slice(0, 100).map((d) => ISS.docs.row(d, role, { edit: true, remove: true })).join('')}</div>`
      : '<div class="empty"><i class="fa-solid fa-magnifying-glass"></i><strong>No matching documents</strong>Try a different word.</div>';
  }

  function render() {
    if (query.trim()) return renderSearch(query.trim());
    const { cat, ev, dt } = route();
    if (!cat) renderDepartments();
    else if (!ev) renderEvents(cat);
    else if (!dt) renderDocTypes(cat, ev);
    else renderFiles(cat, ev, dt);
  }

  /* ---------- data loading ---------- */
  async function load() {
    const [f, d] = await Promise.all([ISS.api('/api/folders'), ISS.api('/api/documents')]);
    types = f.types; events = f.events; subfolders = f.subfolders || {}; docs = d.documents;
    render();
  }

  async function mutate(task, okMsg) {
    try { await task(); ISS.toast(okMsg); await load(); } catch (err) { ISS.toast(err.message, 'err'); }
  }

  /* ---------- Event actions ---------- */
  async function addEvent(cat) {
    const name = await ISS.prompt({ icon: 'fa-calendar-plus', title: `New event in ${cat}`, confirm: 'Add event',
      input: { placeholder: 'e.g. Foundation Day', validate: (v) => v.length < 2 ? 'Use at least 2 characters.' : v.toLowerCase() === 'general' ? '“General” is reserved.' : (events[cat] || []).some((e) => e.name.toLowerCase() === v.toLowerCase()) ? 'That event already exists.' : '' } });
    if (name) mutate(() => ISS.api('/api/folders', { method: 'POST', body: { category: cat, name } }), 'Event created.');
  }

  async function renameEvent(cat, id) {
    const ev = (events[cat] || []).find((e) => e.id === id); if (!ev) return;
    const name = await ISS.prompt({ icon: 'fa-pen', title: 'Rename event', confirm: 'Save name',
      input: { value: ev.name, validate: (v) => v.length < 2 ? 'Use at least 2 characters.' : v.toLowerCase() === 'general' ? '“General” is reserved.' : (events[cat] || []).some((e) => e.id !== id && e.name.toLowerCase() === v.toLowerCase()) ? 'That event already exists.' : '' } });
    if (name && name !== ev.name) mutate(() => ISS.api(`/api/folders/${id}`, { method: 'PUT', body: { name } }), 'Event renamed.');
  }

  async function deleteEvent(cat, id) {
    const ev = (events[cat] || []).find((e) => e.id === id); if (!ev) return;
    const ok = await ISS.confirm({ icon: 'fa-trash-can', tone: 'danger', title: `Delete “${ev.name}”?`, text: 'The event moves to the Recycle Bin. Its files stay safe and show under General until you restore it.', confirm: 'Move to Recycle Bin' });
    if (ok) mutate(() => ISS.api(`/api/folders/${id}`, { method: 'DELETE' }), 'Event moved to the Recycle Bin.');
  }

  /* ---------- Level-3 Document Type folder actions ---------- */
  async function addSub(cat, ev) {
    const name = await ISS.prompt({ icon: 'fa-folder-plus', title: `New document type folder in ${ev}`, confirm: 'Create folder',
      input: { placeholder: 'e.g. Attendance, Minutes, Receipts', validate: (v) => v.length < 2 ? 'Use at least 2 characters.' : v.toLowerCase() === 'general' ? '“General” is reserved.' : (((subfolders[cat] || {})[ev]) || []).some((s) => s.name.toLowerCase() === v.toLowerCase()) ? 'That folder already exists.' : '' } });
    if (name) mutate(() => ISS.api('/api/subfolders', { method: 'POST', body: { category: cat, eventName: ev, name } }), 'Document type folder created.');
  }

  async function renameSub(cat, ev, id) {
    const sf = (((subfolders[cat] || {})[ev]) || []).find((s) => s.id === id); if (!sf) return;
    const name = await ISS.prompt({ icon: 'fa-pen', title: 'Rename document type folder', confirm: 'Save name',
      input: { value: sf.name, validate: (v) => v.length < 2 ? 'Use at least 2 characters.' : v.toLowerCase() === 'general' ? '“General” is reserved.' : (((subfolders[cat] || {})[ev]) || []).some((s) => s.id !== id && s.name.toLowerCase() === v.toLowerCase()) ? 'That folder already exists.' : '' } });
    if (name && name !== sf.name) mutate(() => ISS.api(`/api/subfolders/${id}`, { method: 'PUT', body: { name } }), 'Folder renamed.');
  }

  async function deleteSub(cat, ev, id) {
    const sf = (((subfolders[cat] || {})[ev]) || []).find((s) => s.id === id); if (!sf) return;
    const ok = await ISS.confirm({ icon: 'fa-trash-can', tone: 'danger', title: `Delete folder “${sf.name}”?`, text: 'The folder moves to the Recycle Bin. Its files stay safe under General until you restore it.', confirm: 'Move to Recycle Bin' });
    if (ok) mutate(() => ISS.api(`/api/subfolders/${id}`, { method: 'DELETE' }), 'Folder moved to the Recycle Bin.');
  }

  async function removeDoc(doc) {
    const ok = await ISS.confirm({ icon: 'fa-trash-can', tone: 'danger', title: 'Move to Recycle Bin?', text: `“${doc.title}” will leave the active repository. You can restore it later.`, confirm: 'Move to Recycle Bin' });
    if (ok) mutate(() => ISS.api(`/api/documents/soft-delete/${doc.id}`, { method: 'POST' }), 'Moved to the Recycle Bin.');
  }

  /* ---------- edit dialog ---------- */
  const editDlg = $('#editDlg'), editForm = $('#editForm');
  let editing = null;
  function openEdit(doc) {
    editing = doc;
    $('#eTitle').value = doc.title; $('#eDate').value = doc.document_date;
    $('#eCat').innerHTML = types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    $('#eCat').value = doc.category;
    editDlg.showModal();
  }
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { title: $('#eTitle').value.trim(), category: $('#eCat').value, date: $('#eDate').value };
    if (!body.title || !body.date) return ISS.toast('Title and date are required.', 'warn');
    try {
      await ISS.busy($('button[type=submit]', editForm), () => ISS.api(`/api/documents/${editing.id}`, { method: 'PUT', body }), 'Saving…');
      editDlg.close(); ISS.toast('Document updated.'); await load();
    } catch (err) { ISS.toast(err.message, 'err'); }
  });

  /* ---------- wiring ---------- */
  view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-go-event],[data-go-sub],[data-rename-ev],[data-delete-ev],[data-rename-sub],[data-delete-sub]');
    if (!t) return;
    const { cat, ev } = route();
    if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.goEvent) go(cat, t.dataset.goEvent);
    else if (t.dataset.goSub) go(cat, ev, t.dataset.goSub);
    else if (t.dataset.renameEv) renameEvent(cat, +t.dataset.renameEv);
    else if (t.dataset.deleteEv) deleteEvent(cat, +t.dataset.deleteEv);
    else if (t.dataset.renameSub) renameSub(cat, ev, +t.dataset.renameSub);
    else if (t.dataset.deleteSub) deleteSub(cat, ev, +t.dataset.deleteSub);
  });
  crumbs.addEventListener('click', (e) => {
    const { cat, ev } = route();
    if (e.target.closest('[data-home]')) { $('#q').value = ''; query = ''; go(); }
    else if (e.target.closest('[data-back-cat]')) go(cat);
    else if (e.target.closest('[data-back-ev]')) go(cat, ev);
    else if (e.target.closest('#addEvent')) addEvent(cat);
    else if (e.target.closest('#addSub')) addSub(cat, ev);
  });
  ISS.docs.bind(view, byId, { edit: openEdit, remove: removeDoc, changed: (d) => { d.approval_status = 'Approved'; render(); } });
  $('#q').addEventListener('input', ISS.debounce((e) => { query = e.target.value; render(); }, 140));
  addEventListener('hashchange', render);

  ISS.ready.then(async (me) => {
    role = me.role;
    try { await load(); } catch (err) { view.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Could not load documents</strong>${esc(err.message)}</div>`; }
  });
})();