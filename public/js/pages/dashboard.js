(function () {
      const { esc, $ } = ISS;
      let docs = [], role = '', view = { q: '', type: '', pending: false };
      const grid = $('#grid'), tiles = $('#tiles');


      /* ---- rendering ---- */
      function renderTiles() {
        const types = [...new Set(docs.map((d) => d.category))];
        const pending = docs.filter((d) => d.approval_status !== 'Approved').length;
        const t = (key, label, n, icon, tone, extra = '') =>
          `<button class="tile ${tone} ${extra}" data-tile="${esc(key)}" aria-pressed="${isActive(key)}"><div class="ico"><i class="fa-solid ${icon}"></i></div><div><b>${n}</b><br><span>${esc(label)}</span></div></button>`;
        tiles.innerHTML =
          t('__all', 'Total files', docs.length, 'fa-layer-group', 't-violet', 'dark') +
          t('__pending', 'Awaiting approval', pending, 'fa-hourglass-half', 't-amber') +
          types.map((c) => t(c, c, docs.filter((d) => d.category === c).length, ISS.catIcon(c), ISS.toneFor(c))).join('');
      }
      const isActive = (key) => key === '__all' ? (!view.type && !view.pending) : key === '__pending' ? view.pending : view.type === key;

      function renderList() {
        const q = view.q.trim().toLowerCase();
        const list = docs.filter((d) =>
          (!view.type || d.category === view.type) &&
          (!view.pending || d.approval_status !== 'Approved') &&
          (!q || `${d.title} ${d.standardized_file_name} ${d.category} ${d.subfolder || ''}`.toLowerCase().includes(q)));
        const filtered = q || view.type || view.pending;
        $('#listTitle').textContent = filtered ? 'Matching documents' : 'Recent documents';
        $('#listCount').textContent = `${list.length} file${list.length === 1 ? '' : 's'}`;
        grid.innerHTML = list.length
          ? list.slice(0, 60).map((d, i) => ISS.docs.card(d, i, role)).join('')
          : `<div class="empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open"></i><strong>${docs.length ? 'No documents match' : 'Nothing here yet'}</strong>${docs.length ? 'Try another word or clear the filters.' : 'Upload your first document to get started.'}</div>`;
      }

      function renderAll() {
        renderTiles(); renderList();
        const select = $('#typeFilter'), types = [...new Set(docs.map((d) => d.category))];
        select.innerHTML = '<option value="">All types</option>' + types.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        select.value = view.type;
      }

      /* ---- events ---- */
      tiles.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-tile]'); if (!tile) return;
        const k = tile.dataset.tile;
        view.pending = k === '__pending';
        view.type = (k === '__all' || k === '__pending') ? '' : k;
        $('#typeFilter').value = view.type;
        renderTiles(); renderList();
      });
      $('#q').addEventListener('input', ISS.debounce((e) => { view.q = e.target.value; renderList(); }, 120));
      $('#typeFilter').addEventListener('change', (e) => { view.type = e.target.value; view.pending = false; renderTiles(); renderList(); });

      ISS.docs.bind(grid, (id) => docs.find((d) => d.id === id), {
        changed: (doc) => { doc.approval_status = 'Approved'; renderAll(); }, // update in place — no page reload
      });

      /* ---- load ---- */
      ISS.ready.then(async (me) => {
        role = me.role;
        ISS.setHero({ title: `Welcome back, @${me.role}`, sub: 'Here is what is happening in your document repository.' });
        try {
          const data = await ISS.api('/api/documents');
          docs = data.documents;
          const pending = docs.filter((d) => d.approval_status !== 'Approved').length;
          ISS.setHero({ sub: pending ? `${pending} document${pending === 1 ? ' is' : 's are'} waiting for approval.` : 'Everything is approved and up to date.' });
          renderAll();
        } catch (err) {
          tiles.innerHTML = ''; grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i><strong>Could not load documents</strong>${esc(err.message)}</div>`;
        }
      });
    })();