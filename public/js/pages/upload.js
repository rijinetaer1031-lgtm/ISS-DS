(function () {
      if (typeof ISS === 'undefined' || typeof ISS.picker !== 'function') {
        document.getElementById('content').insertAdjacentHTML('afterbegin', '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Old script detected</strong>Replace public/js/app.js with the latest version, then press Ctrl+F5.</div>');
        return;
      }
      const { $, esc } = ISS;
      const MAX = 25 * 1024 * 1024, OK_EXT = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','png','jpg','jpeg'];
      const form = $('#form'), fileInput = $('#file'), drop = $('#drop');
      let events = {}, existing = [];
      const cat = ISS.picker($('#catPicker'), { name: 'category', placeholder: 'Choose a type', icon: 'fa-layer-group', onChange: () => { fillEvents(); updatePreview(); } });
      const sub = ISS.picker($('#subPicker'), { name: 'subfolder', placeholder: 'No specific event', icon: 'fa-ticket', onChange: () => updatePreview() });

      $('#date').value = ISS.todayYMD();

      /* ---- live file-name preview (mirrors the server's naming rule) ---- */
      const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      function updatePreview() {
        const title = $('#title').value.trim(), c = cat.value, date = $('#date').value;
        const f = fileInput.files[0], ext = f ? '.' + f.name.split('.').pop().toLowerCase() : '.ext';
        let v = 1;
        if (title && c) {
          const same = existing.filter((d) => d.title === title && d.category === c && (d.subfolder || 'General') === sub.value);
          if (same.length) v = Math.max(...same.map((d) => d.version_number)) + 1;
          $('#versionNote').textContent = same.length ? `A document with this title exists — this will be version ${v}.` : 'This will be the first version.';
        } else $('#versionNote').textContent = '';
        const part = (txt, ph) => txt ? esc(txt) : `<em>${ph}</em>`;
        $('#fname').innerHTML = `${part(c && safe(c), 'Type')}_${part(title && title.replace(/[^a-zA-Z0-9]/g, '_'), 'Title')}_${part(date, 'Date')}_v${v}${esc(ext)}`;
      }

      /* ---- dependent dropdowns ---- */
      function fillEvents(selected = 'General') {
        sub.setItems([{ value: 'General', label: 'No specific event', icon: 'fa-calendar-day', tone: 't-indigo' },
          ...(events[cat.value] || []).map((e) => ({ value: e.name, label: e.name, icon: 'fa-ticket', tone: ISS.toneFor(cat.value) }))]);
        sub.value = sub.has(selected) ? selected : 'General';
      }
      fillEvents();

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
      fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
      $('#clearFile').addEventListener('click', () => { fileInput.value = ''; setFile(null); });
      ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; setFile(fileInput.files[0]); } });

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
        if (!cat.value) return ISS.toast('Choose a document type.', 'warn'), cat.focus();
        if (!$('#date').value) return ISS.toast('Pick the document date.', 'warn'), $('#date').focus();
        if (!fileInput.files[0]) return ISS.toast('Choose a file to upload.', 'warn');

        const bar = $('#progress'), fill = $('i', bar);
        bar.hidden = false; fill.style.width = '0';
        try {
          const result = await ISS.busy($('#submit'), () => send(new FormData(form), (p) => { fill.style.width = `${Math.round(p * 100)}%`; }), 'Uploading…');
          const goView = await ISS.confirm({ icon: 'fa-circle-check', tone: 'ok', title: `Uploaded as version ${result.version}`, text: result.name, confirm: 'Open in My Documents', cancel: 'Upload another' });
          if (goView) {
            const path = [cat.value, sub.value !== 'General' ? sub.value : 'General'].map(encodeURIComponent).join('/');
            location.href = `/documents#/${path}`;
            return;
          }
          const keepCat = cat.value, keepSub = sub.value;
          form.reset(); $('#date').value = ISS.todayYMD(); cat.value = keepCat; fillEvents(keepSub); setFile(null);
          load(); // refresh version estimates
        } catch (err) { ISS.toast(err.message, 'err', 6000); }
        finally { bar.hidden = true; }
      });

      /* ---- initial data ---- */
      async function load() {
        const [f, d] = await Promise.all([ISS.api('/api/folders'), ISS.api('/api/documents')]);
        events = f.events; existing = d.documents;
        const keep = cat.value;
        cat.setItems(f.types.map((t) => ({ value: t, label: t, icon: ISS.catIcon(t), tone: ISS.toneFor(t) })));
        if (keep) cat.value = keep;
        updatePreview();
      }

      ISS.ready.then(async () => {
        try { await load(); } catch (err) { ISS.toast(err.message, 'err'); }
        const p = new URLSearchParams(location.search), c = p.get('category'), s = p.get('subfolder');
        if (c && cat.has(c)) { cat.value = c; fillEvents(s || 'General'); updatePreview(); }
      });
    })();