(function () {
  const { $, esc } = ISS;

  function statusBadge(d) {
    const ok = d.approval_status === 'Approved';
    return `<span class="badge ${ok ? 'badge-mint' : 'badge-amber'}"><i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-clock'}"></i>${ok ? 'Approved' : 'Pending'}</span>`;
  }

  function card(doc, role) {
    const m = ISS.fileMeta(doc.standardized_file_name);
    const canApprove = role === 'President' && doc.approval_status !== 'Approved';
    const sub = [doc.category, doc.subfolder && doc.subfolder !== 'General' ? doc.subfolder : '', doc.doc_type && doc.doc_type !== 'General' ? doc.doc_type : ''].filter(Boolean).join(' · ');

    return `<article class="doc-card ${m.cls}">
      <div class="doc-card__top">
        <div class="doc-ico"><i class="fa-solid ${m.icon}"></i></div>
        ${statusBadge(doc)}
      </div>
      <h4 title="${esc(doc.standardized_file_name)}">${esc(doc.title)}</h4>
      <p class="muted" style="font-size:12.5px;margin:2px 0 8px">${esc(sub)}</p>
      <div class="doc-meta" style="margin-top:auto">
        <span><i class="fa-regular fa-calendar"></i>${ISS.fmtDate(doc.document_date)}</span>
        <span><i class="fa-solid fa-code-branch"></i>v${doc.version_number}</span>
      </div>
      <div class="doc-actions" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);justify-content:flex-end">
        ${canApprove ? `<button class="btn btn-mint btn-sm" data-doc-act="approve" data-id="${doc.id}" title="Approve document"><i class="fa-solid fa-check"></i><span>Approve</span></button>` : ''}
        <button class="btn btn-ghost btn-sm" data-doc-act="view" data-id="${doc.id}" title="Preview file"><i class="fa-solid fa-eye"></i><span>View</span></button>
        <a class="btn btn-ghost btn-sm" href="${esc(doc.file_url)}" download="${esc(doc.standardized_file_name)}" title="Download file"><i class="fa-solid fa-download"></i><span>Download</span></a>
      </div>
    </article>`;
  }

  function row(doc, role, opts = {}) {
    const m = ISS.fileMeta(doc.standardized_file_name);
    const event = doc.subfolder && doc.subfolder !== 'General' ? `<span><i class="fa-solid fa-ticket"></i>${esc(doc.subfolder)}</span>` : '';
    const dtype = doc.doc_type && doc.doc_type !== 'General' ? `<span><i class="fa-solid fa-folder-open"></i>${esc(doc.doc_type)}</span>` : '';
    const canApprove = role === 'President' && doc.approval_status !== 'Approved';
    const canModify = role !== 'Officer';

    const checkbox = opts.select
      ? `<label class="doc-pick" title="Select for report" style="display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:${opts.checked ? 'rgba(75,47,209,.12)' : '#f1f5f9'};border:1px solid ${opts.checked ? 'rgba(75,47,209,.4)' : '#cbd5e1'};cursor:pointer;font-size:11.5px;font-weight:700;color:${opts.checked ? '#3b22b8' : '#475569'};flex:none">
           <input type="checkbox" data-doc-select="${doc.id}" ${opts.checked ? 'checked' : ''} aria-label="Select ${esc(doc.title)}" style="width:15px;height:15px;accent-color:#4b2fd1;cursor:pointer;margin:0" />
           <span>${opts.checked ? 'Selected' : 'Select'}</span>
         </label>`
      : '';

    const rowStyle = opts.checked
      ? 'border-color:rgba(75,47,209,.48);background:linear-gradient(135deg,rgba(75,47,209,.04),rgba(14,138,168,.04));box-shadow:0 6px 18px rgba(75,47,209,.09);'
      : '';

    return `<article class="doc ${m.cls}${opts.checked ? ' is-selected' : ''}" data-doc-row="${doc.id}" style="${rowStyle}">
      <div class="doc-ico"><i class="fa-solid ${m.icon}"></i></div>
      <div class="doc-main" style="min-width:0">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;margin-bottom:4px">
          ${checkbox}
          <h4 title="${esc(doc.standardized_file_name)}" style="margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(doc.title)}</h4>
        </div>
        <div class="doc-meta">
          <span title="Standardized file name"><i class="fa-regular fa-file"></i>${esc(doc.standardized_file_name)}</span>
          <span><i class="fa-regular fa-calendar"></i>${ISS.fmtDate(doc.document_date)}</span>
          <span><i class="fa-solid fa-code-branch"></i>v${doc.version_number}</span>${event}${dtype}
        </div>
      </div>
      <div class="doc-actions" style="flex-wrap:nowrap">
        ${statusBadge(doc)}
        ${canApprove ? `<button class="btn btn-mint btn-sm" data-doc-act="approve" data-id="${doc.id}" title="Approve document"><i class="fa-solid fa-check"></i><span>Approve</span></button>` : ''}
        <button class="btn btn-ghost btn-sm" data-doc-act="view" data-id="${doc.id}" title="Preview file"><i class="fa-solid fa-eye"></i><span>View</span></button>
        <a class="btn btn-ghost btn-sm" href="${esc(doc.file_url)}" download="${esc(doc.standardized_file_name)}" title="Download file"><i class="fa-solid fa-download"></i><span>Download</span></a>
        ${opts.edit && canModify ? `<button class="icon-btn" data-doc-act="edit" data-id="${doc.id}" title="Edit details" aria-label="Edit ${esc(doc.title)}"><i class="fa-solid fa-pen"></i></button>` : ''}
        ${opts.remove && canModify ? `<button class="icon-btn danger" data-doc-act="remove" data-id="${doc.id}" title="Move to Recycle Bin" aria-label="Delete ${esc(doc.title)}"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
    </article>`;
  }

  /* ---- Dynamic library loader for Office files ---- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load viewer library'));
      document.head.appendChild(s);
    });
  }

  /* ---- Preview modal ---- */
  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="dlg wide" id="previewDlg" aria-label="Document preview" style="width:min(1140px,95vw);max-width:95vw;margin:auto;padding:0;border:1px solid rgba(75,47,209,.25);border-radius:20px;overflow:hidden;box-shadow:0 28px 70px rgba(15,18,36,.38)">
        <div class="dlg-card left" style="width:100%;max-width:100%;padding:0;border-radius:0;background:#13172e">
          <div class="dlg-head" style="margin:0;padding:16px 22px;background:linear-gradient(135deg,#3b22b8 0%,#4b2fd1 55%,#0e8aa8 100%);color:#fff;border-bottom:1px solid rgba(255,255,255,.14)">
            <div style="display:flex;align-items:center;gap:12px;min-width:0">
              <div style="width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.16);display:grid;place-items:center;flex:none;color:#8fe3f2;font-size:16px">
                <i class="fa-solid fa-file-lines"></i>
              </div>
              <div style="min-width:0">
                <h3 id="pvTitle" style="color:#fff;margin:0;font-size:17px;overflow-wrap:anywhere">Preview</h3>
                <div id="pvSub" style="font-size:12px;color:rgba(255,255,255,.78);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
              </div>
            </div>
            <div class="row-wrap" style="gap:8px;flex:none">
              <a class="btn btn-sm" id="pvDownload" href="#" download style="background:#fff;color:#3b22b8;font-weight:700;border:0;box-shadow:0 4px 12px rgba(0,0,0,.18)"><i class="fa-solid fa-download"></i> Download</a>
              <button type="button" class="icon-btn" data-close aria-label="Close" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2)"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>
          <div id="pvBody" style="width:100%;min-height:76vh;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at top,#1d2347 0%,#0f1224 100%)"></div>
        </div>
      </dialog>`);
    modal = $('#previewDlg');
    modal.addEventListener('close', () => { $('#pvBody').innerHTML = ''; });
    return modal;
  }

  async function openPreview(doc) {
    const dlg = ensureModal();
    $('#pvTitle').textContent = doc.title;
    $('#pvSub').textContent = `${doc.category} · ${doc.subfolder || 'General'}${doc.doc_type && doc.doc_type !== 'General' ? ` · ${doc.doc_type}` : ''} · v${doc.version_number}`;
    $('#pvDownload').href = doc.file_url;
    $('#pvDownload').setAttribute('download', doc.standardized_file_name);
    $('#pvBody').innerHTML = '<div style="padding:40px;color:#a5b0d6;font-weight:600"><i class="fa-solid fa-spinner fa-spin"></i> Loading preview…</div>';
    dlg.showModal();

    try {
      ISS.api(`/api/activity/log-view/${doc.id}`, { method: 'POST' }).catch(() => {});
      const { url } = await ISS.api(`/api/documents/${doc.id}/preview-link`);
      const ext = doc.standardized_file_name.split('.').pop().toLowerCase();

      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
        $('#pvBody').innerHTML = `<img src="${esc(url)}" alt="${esc(doc.title)}" style="max-width:100%;max-height:79vh;object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.45)" />`;

      } else if (ext === 'pdf') {
        $('#pvBody').innerHTML = `<iframe src="${esc(url)}" title="${esc(doc.title)}" style="width:100%;height:79vh;border:0;border-radius:12px;background:#fff;box-shadow:0 16px 40px rgba(0,0,0,.45)"></iframe>`;

      } else if (['txt', 'csv', 'json', 'md', 'log', 'xml', 'html'].includes(ext)) {
        const text = await (await fetch(url)).text();
        $('#pvBody').innerHTML = `<pre style="width:100%;max-height:79vh;overflow:auto;margin:0;padding:24px 28px;border-radius:12px;background:#fff;color:#1e293b;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;box-shadow:0 16px 40px rgba(0,0,0,.45)">${esc(text)}</pre>`;

      } else if (ext === 'docx') {
        await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
        const buf = await (await fetch(url)).arrayBuffer();
        const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        $('#pvBody').innerHTML = `
          <div style="width:100%;max-width:860px;max-height:79vh;overflow:auto;padding:36px 44px;border-radius:12px;background:#fff;color:#1e293b;font-size:15px;line-height:1.65;box-shadow:0 16px 40px rgba(0,0,0,.45)">
            <style>
              #pvDocx table{border-collapse:collapse;width:100%;margin:12px 0}
              #pvDocx td,#pvDocx th{border:1px solid #cbd5e1;padding:6px 10px}
              #pvDocx img{max-width:100%;height:auto}
            </style>
            <div id="pvDocx">${html || '<p class="muted">This document is empty.</p>'}</div>
          </div>`;

      } else if (['xlsx', 'xls'].includes(ext)) {
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        const buf = await (await fetch(url)).arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const sheetsHtml = wb.SheetNames.map((name) => {
          const table = window.XLSX.utils.sheet_to_html(wb.Sheets[name]);
          return `<h4 style="margin:0 0 10px;color:#3b22b8;font-size:14px">${esc(name)}</h4><div style="overflow-x:auto;margin-bottom:22px">${table}</div>`;
        }).join('');
        $('#pvBody').innerHTML = `
          <div style="width:100%;max-height:79vh;overflow:auto;padding:24px 28px;border-radius:12px;background:#fff;color:#1e293b;font-size:13px;box-shadow:0 16px 40px rgba(0,0,0,.45)">
            <style>
              #pvSheet table{border-collapse:collapse;width:100%}
              #pvSheet td,#pvSheet th{border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap}
              #pvSheet tr:first-child td{background:#f1f5f9;font-weight:700}
            </style>
            <div id="pvSheet">${sheetsHtml}</div>
          </div>`;

      } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
        $('#pvBody').innerHTML = `<video src="${esc(url)}" controls style="max-width:100%;max-height:79vh;border-radius:12px;background:#000;box-shadow:0 16px 40px rgba(0,0,0,.45)"></video>`;

      } else if (['mp3', 'wav', 'm4a'].includes(ext)) {
        $('#pvBody').innerHTML = `<audio src="${esc(url)}" controls style="width:min(520px,90%)"></audio>`;

      } else {
        $('#pvBody').innerHTML = `<div class="empty" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#e6ebff"><i class="fa-solid fa-file-arrow-down" style="color:#8fe3f2"></i><strong style="color:#fff">Preview not available for .${esc(ext)} files</strong><a class="btn btn-primary btn-sm" href="${esc(doc.file_url)}" download="${esc(doc.standardized_file_name)}"><i class="fa-solid fa-download"></i> Download to view</a></div>`;
      }
    } catch (err) {
      $('#pvBody').innerHTML = `<div class="empty" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#e6ebff"><i class="fa-solid fa-triangle-exclamation" style="color:#fb7185"></i><strong style="color:#fff">Could not load preview</strong>${esc(err.message)}</div>`;
    }
  }

  function bind(container, byId, handlers = {}) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-doc-act]');
      if (!btn) return;
      const doc = byId(+btn.dataset.id);
      if (!doc) return;
      const act = btn.dataset.docAct;

      if (act === 'view') return openPreview(doc);
      if (act === 'edit' && handlers.edit) return handlers.edit(doc);
      if (act === 'remove' && handlers.remove) return handlers.remove(doc);
      if (act === 'approve') {
        const ok = await ISS.confirm({ icon: 'fa-circle-check', tone: 'ok', title: 'Approve this document?', text: `Mark “${doc.title}” as Approved?`, confirm: 'Approve' });
        if (!ok) return;
        try {
          await ISS.busy(btn, () => ISS.api(`/api/documents/approve/${doc.id}`, { method: 'POST' }), 'Approving…');
          ISS.toast('Document approved.');
          if (handlers.changed) handlers.changed(doc);
        } catch (err) { ISS.toast(err.message, 'err'); }
      }
    });
  }

  ISS.docs = { card, row, bind, openPreview };
})();