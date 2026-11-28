(function () {
  if (typeof ISS === 'undefined' || typeof ISS.picker !== 'function') {
    document.getElementById('content').insertAdjacentHTML('afterbegin', '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Old script detected</strong>Replace public/js/app.js with the latest version, then press Ctrl+F5.</div>');
    return;
  }
  const { $, esc } = ISS;
  const MAX = 25 * 1024 * 1024, OK_EXT = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','png','jpg','jpeg'];
  const form = $('#form'), fileInput = $('#file'), drop = $('#drop');
  let role = '', events = {}, subfolders = {}, existing = [];

  const cat = ISS.picker($('#catPicker'), {
    name: 'category', placeholder: 'Secretariat or Fiscal', icon: 'fa-building-columns',
    onChange: () => { fillEvents(); updatePreview(); },
  });
  const sub = ISS.picker($('#subPicker'), {
    name: 'subfolder', placeholder: 'No specific event', icon: 'fa-ticket',
    onChange: () => { fillDocTypes(); updatePreview(); },
  });
  const dtype = ISS.picker($('#typePicker'), {
    name: 'doc_type', placeholder: 'General (no sub-folder)', icon: 'fa-folder-open',
    onChange: () => updatePreview(),
  });

  $('#date').value = ISS.todayYMD();

  /* ---- live file-name preview (mirrors the server's naming rule) ---- */
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  function updatePreview() {
    const title = $('#title').value.trim(), c = cat.value, dType = dtype.value, date = $('#date').value;
    const f = fileInput.files[0], ext = f ? '.' + f.name.split('.').pop().toLowerCase() : '.ext';
    let v = 1;
    if (title && c) {
      const same = existing.filter((d) =>
        d.title === title &&
        d.category === c &&
        (d.subfolder || 'General') === sub.value &&
        (d.doc_type || 'General') === dType
      );
      if (same.length) v = Math.max(...same.map((d) => d.version_number)) + 1;
      $('#versionNote').textContent = same.length ? `A document with this title exists here — this will be version ${v}.` : 'This will be the first version.';
    } else $('#versionNote').textContent = '';

    const part = (txt, ph) => txt ? esc(txt) : `<em>${ph}</em>`;
    const typeSegment = dType && dType !== 'General' ? `_${esc(safe(dType))}` : '';
    $('#fname').innerHTML = `${part(c && safe(c), 'Department')}${typeSegment}_${part(title && title.replace(/[^a-zA-Z0-9]/g, '_'), 'Title')}_${part(date, 'Date')}_v${v}${esc(ext)}`;
  }

  /* ---- dependent dropdowns: Department -> Event -> Document Type Folder ---- */
  function fillEvents(selectedEvent = 'General', selectedDocType = 'General') {
    sub.setItems([
      { value: 'General', label: 'No specific event (General)', icon: 'fa-calendar-day', tone: 't-indigo' },
      ...(events[cat.value] || []).map((e) => ({ value: e.name, label: e.name, icon: 'fa-ticket', tone: ISS.toneFor(cat.value) })),
    ]);
    sub.value = sub.has(selectedEvent) ? selectedEvent : 'General';
    fillDocTypes(selectedDocType);
  }

  function fillDocTypes(selectedDocType = 'General') {
    const list = ((subfolders[cat.value] || {})[sub.value]) || [];
    dtype.setItems([
      { value: 'General', label: 'General (no sub-folder)', icon: 'fa-folder', tone: 't-indigo' },
      ...list.map((s) => ({ value: s.name, label: s.name, icon: 'fa-folder-open', tone: ISS.toneFor(s.name) })),
    ]);
    dtype.value = dtype.has(selectedDocType) ? selectedDocType : 'General';
  }
  fillEvents();

  /* ---- create new Level-3 Document Type folder directly from Upload ---- */
  $('#addDocTypeBtn').addEventListener('click', async () => {
    if (!cat.value) return ISS.toast('Choose Secretariat or Fiscal first.', 'warn'), cat.focus();
    const evLabel = sub.value === 'General' ? 'General' : sub.value;
    const name = await ISS.prompt({
      icon: 'fa-folder-plus',
      title: `New document type folder in ${evLabel}`,
      text: `Create a sub-folder inside ${cat.value} → ${evLabel} (e.g. Minutes, Receipts, Attendance).`,
      confirm: 'Create folder',
      input: {
        placeholder: 'e.g. Attendance',
        validate: (v) => v.length < 2 ? 'Use at least 2 characters.' : v.toLowerCase() === 'general' ? '“General” is reserved.' : '',
      },
    });
    if (!name) return;
    try {
      await ISS.api('/api/subfolders', { method: 'POST', body: { category: cat.value, eventName: sub.value, name } });
      ISS.toast(`Folder “${name}” created.`);
      const keepCat = cat.value, keepSub = sub.value;
      await load();
      cat.value = keepCat;
      fillEvents(keepSub, name);
      updatePreview();
    } catch (err) { ISS.toast(err.message, 'err'); }
  });

  /* ---- file picking ---- */
  function setFile(file) {
    const bad = !file ? '' : !OK_EXT.includes(file.name.split('.').pop().toLowerCase()) ? 'That file type is not allowed.' : file.size > MAX ? 'That file is larger than 25 MB.' : '';
    if (bad) { ISS.toast(bad, 'err'); fileInput.value = ''; file = null; }
    $('#picked').hidden = !file;
    if (file) {
      const m = ISS.fileMeta(file.name);
      $('#pickedIcon').className = `doc-ico ${m.cls}`; $('#pickedIcon').innerHTML = `<i class="fa-solid ${m.icon}"></i>`;
      $('#pickedName').textContent = file.name;
      $('#pickedSize').textContent = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    }
    updatePreview();
  }
  let droppedFile = null;
  fileInput.addEventListener('change', () => { droppedFile = null; setFile(fileInput.files[0]); });
  $('#clearFile').addEventListener('click', () => { droppedFile = null; fileInput.value = ''; setFile(null); });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      droppedFile = e.dataTransfer.files[0];
      try { fileInput.files = e.dataTransfer.files; } catch {}
      setFile(droppedFile);
    }
  });
  ['input', 'change'].forEach((t) => { $('#title').addEventListener(t, updatePreview); $('#date').addEventListener(t, updatePreview); });

  /* ---- upload with real progress ---- */
  function send(data, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', '/api/upload'); x.responseType = 'json';
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => {
        if (x.status === 401) { location.href = '/login'; return; }
        x.status >= 200 && x.status < 300 ? resolve(x.response) : reject(new Error((x.response && x.response.error) || `Upload failed (${x.status}).`));
      };
      x.onerror = () => reject(new Error('Network error during upload.'));
      x.send(data);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!$('#title').value.trim()) return ISS.toast('Give the document a title.', 'warn'), $('#title').focus();
    if (!cat.value) return ISS.toast('Choose Secretariat or Fiscal.', 'warn'), cat.focus();
    if (!$('#date').value) return ISS.toast('Pick the document date.', 'warn'), $('#date').focus();
    const chosenFile = droppedFile || fileInput.files[0];
    if (!chosenFile) return ISS.toast('Choose a file to upload.', 'warn');

    const fd = new FormData(form);
    fd.set('file', chosenFile);

    const bar = $('#progress'), fill = $('i', bar);
    bar.hidden = false; fill.style.width = '0';
    try {
      const result = await ISS.busy($('#submit'), () => send(fd, (p) => { fill.style.width = `${Math.round(p * 100)}%`; }), 'Uploading…');
      const goView = await ISS.confirm({ icon: 'fa-circle-check', tone: 'ok', title: `Uploaded as version ${result.version}`, text: result.name, confirm: 'Open in My Documents', cancel: 'Upload another' });
      if (goView) {
        const path = [cat.value, sub.value, dtype.value].map(encodeURIComponent).join('/');
        location.href = `/documents#/${path}`;
        return;
      }
      const keepCat = cat.value, keepSub = sub.value, keepType = dtype.value;
      form.reset(); $('#date').value = ISS.todayYMD(); cat.value = keepCat; fillEvents(keepSub, keepType); setFile(null);
      await load();
    } catch (err) { ISS.toast(err.message, 'err', 6000); }
    finally { bar.hidden = true; }
  });

  /* ---- initial data ---- */
  async function load() {
    const [f, d] = await Promise.all([ISS.api('/api/folders'), ISS.api('/api/documents')]);
    events = f.events; subfolders = f.subfolders || {}; existing = d.documents;
    const keep = cat.value;
    cat.setItems(f.types.map((t) => ({ value: t, label: t, icon: ISS.catIcon(t), tone: ISS.toneFor(t) })));
    if (keep) cat.value = keep;
    updatePreview();
  }

  ISS.ready.then(async (me) => {
    role = me.role;
    $('#addDocTypeBtn').hidden = role === 'Officer';
    try { await load(); } catch (err) { ISS.toast(err.message, 'err'); }
    const p = new URLSearchParams(location.search), c = p.get('category'), s = p.get('subfolder'), dt = p.get('doc_type');
    if (c && cat.has(c)) { cat.value = c; fillEvents(s || 'General', dt || 'General'); updatePreview(); }
  });
})();