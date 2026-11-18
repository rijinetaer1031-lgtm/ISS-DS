(function () {
  const { $, esc } = ISS;
  let role = '', tab = 'docs', docs = [], folders = [], subfolders = [];
  const list = $('#list');
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

  function actions(kind, id) {
    return `<button class="btn btn-ghost btn-sm" data-act="restore" data-kind="${kind}" data-id="${id}"><i class="fa-solid fa-rotate-left"></i><span>Restore</span></button>` +
      (role === 'Administrator' ? `<button class="btn btn-ghost btn-sm" data-act="purge" data-kind="${kind}" data-id="${id}" style="color:var(--rose)"><i class="fa-solid fa-fire"></i><span>Delete forever</span></button>` : '');
  }

  function render() {
    $('#nDocs').textContent = docs.length; $('#nEvents').textContent = folders.length; $('#nFolders').textContent = subfolders.length;
    ['Docs', 'Events', 'Folders'].forEach((t) => $('#tab' + t).setAttribute('aria-selected', tab === t.toLowerCase()));
    const empty = '<div class="empty"><i class="fa-solid fa-leaf"></i><strong>Nothing here</strong>Deleted items will show up in this list.</div>';
    if (tab === 'docs') {
      list.innerHTML = docs.length ? docs.map((d) => {
        const m = ISS.fileMeta(d.standardized_file_name);
        return `<article class="doc ${m.cls}"><div class="doc-ico"><i class="fa-solid ${m.icon}"></i></div>
          <div class="doc-main"><h4>${esc(d.title)}</h4><div class="doc-meta"><span><i class="fa-solid fa-building-columns"></i>${esc(d.category)}</span><span><i class="fa-regular fa-calendar"></i>${ISS.fmtDate(d.document_date)}</span><span><i class="fa-solid fa-code-branch"></i>v${d.version_number}</span></div></div>
          <div class="doc-actions">${actions('doc', d.id)}</div></article>`;
      }).join('') : empty;
    } else if (tab === 'folders') {
      list.innerHTML = subfolders.length ? subfolders.map((s) =>
        `<article class="doc" style="--ft:var(--aqua)"><div class="doc-ico"><i class="fa-solid fa-folder-open"></i></div>
          <div class="doc-main"><h4>${esc(s.name)}</h4><div class="doc-meta"><span><i class="fa-solid fa-building-columns"></i>${esc(s.category)}</span><span><i class="fa-solid fa-ticket"></i>${esc(s.event_name)}</span><span><i class="fa-regular fa-trash-can"></i>Deleted ${when(s.deleted_at)}</span></div></div>
          <div class="doc-actions">${actions('folder', s.id)}</div></article>`).join('') : empty;
    } else {
      list.innerHTML = folders.length ? folders.map((f) =>
        `<article class="doc" style="--ft:var(--amber)"><div class="doc-ico"><i class="fa-solid fa-ticket"></i></div>
          <div class="doc-main"><h4>${esc(f.name)}</h4><div class="doc-meta"><span><i class="fa-solid fa-building-columns"></i>${esc(f.category)}</span><span><i class="fa-regular fa-trash-can"></i>Deleted ${when(f.deleted_at)}</span></div></div>
          <div class="doc-actions">${actions('event', f.id)}</div></article>`).join('') : empty;
    }
  }

  async function load() {
    const [d, f, s] = await Promise.all([ISS.api('/api/documents/deleted'), ISS.api('/api/folders/deleted'), ISS.api('/api/subfolders/deleted')]);
    docs = d.documents; folders = f.folders; subfolders = s.subfolders; render();
  }
  async function run(task, msg) { try { await task(); ISS.toast(msg); await load(); } catch (err) { ISS.toast(err.message, 'err'); } }

  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { act, kind, id } = b.dataset;
    const url = {
      doc: [`/api/documents/restore/${id}`, `/api/documents/permanent-delete/${id}`],
      event: [`/api/folders/restore/${id}`, `/api/folders/permanent/${id}`],
      folder: [`/api/subfolders/restore/${id}`, `/api/subfolders/permanent/${id}`],
    }[kind];
    if (act === 'restore') return run(() => ISS.api(url[0], { method: 'POST' }), 'Restored.');
    const item = kind === 'doc' ? docs.find((x) => x.id === +id) : kind === 'event' ? folders.find((x) => x.id === +id) : subfolders.find((x) => x.id === +id);
    const name = item ? (kind === 'doc' ? item.title : item.name) : 'this item';
    const extra = kind === 'doc' ? 'and all of its versions and files ' : '';
    const ok = await ISS.confirm({ icon: 'fa-fire', tone: 'danger', title: 'Delete forever?', text: `“${name}” ${extra}will be permanently removed. This cannot be undone.`, confirm: 'Delete forever' });
    if (ok) run(() => ISS.api(url[1], { method: 'DELETE' }), 'Deleted permanently.');
  });
  $('#tabDocs').addEventListener('click', () => { tab = 'docs'; render(); });
  $('#tabEvents').addEventListener('click', () => { tab = 'events'; render(); });
  $('#tabFolders').addEventListener('click', () => { tab = 'folders'; render(); });

  ISS.ready.then(async (me) => {
    role = me.role;
    try { await load(); } catch (err) { list.innerHTML = `<div class="empty"><i class="fa-solid fa-lock"></i><strong>Could not load the bin</strong>${esc(err.message)}</div>`; }
  });
})();