(function () {
  const { $, esc } = ISS;
  let role = '', userName = '', types = [], events = {}, subfolders = {}, docs = [], query = '';
  let filter = { from: 0, to: 0, year: '' };
  let customYears = new Set();
  let selectMode = false;
  let selected = new Set();
  let visibleIds = [];
  const view = $('#view'), crumbs = $('#crumbs');
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byId = (id) => docs.find((d) => d.id === id);
  const canManage = () => role !== 'Officer';

  function enterSelectMode() {
    selectMode = true;
    render();
  }

  function exitSelectMode() {
    selectMode = false;
    selected.clear();
    render();
  }

  /* ---------- month-range & year filter helpers ---------- */
 function matchesUploadRange(doc) {
    if (!filter.from && !filter.to && !filter.year) return true;
    const raw = doc.document_date || doc.uploaded_at || '';
    const m = /^(\d{4})-(\d{2})-\d{2}/.exec(raw);
    if (!m) return false;
    const yr = m[1], mo = Number(m[2]);
    if (filter.year && yr !== filter.year) return false;
    if (filter.from || filter.to) {
      const start = filter.from || filter.to;
      const end = filter.to || filter.from;
      const lo = Math.min(start, end), hi = Math.max(start, end);
      if (mo < lo || mo > hi) return false;
    }
    return true;
  }

  const hasActiveFilter = () => Boolean(query.trim() || filter.from || filter.to || filter.year);

  function rebuildYearOptions(selectedYear = filter.year) {
    const currentYear = new Date().getFullYear();
    const defaultRecentYears = [
      String(currentYear),
      String(currentYear - 1),
      String(currentYear - 2),
    ];
    const docYears = docs
      .map((doc) => (doc.document_date || doc.uploaded_at || '').slice(0, 4))
      .filter((y) => /^\d{4}$/.test(y));
    const years = [...new Set([...defaultRecentYears, ...docYears, ...customYears])].sort().reverse();

    $('#mYear').innerHTML =
      '<option value="">All years</option>' +
      years.map((y) => `<option value="${y}">${y}</option>`).join('') +
      '<option value="__add_year__">+ Add year…</option>';

    $('#mYear').value = years.includes(selectedYear) ? selectedYear : '';
    filter.year = $('#mYear').value;
  }

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

  /* ---------- selection & report bar (only shown when selectMode is true) ---------- */
  function selectionBarHtml(list) {
    visibleIds = list.map((d) => d.id);
    if (!selectMode) return '';

    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const count = selected.size;
    return `
      <div id="selBar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;margin-bottom:14px;border-radius:16px;background:linear-gradient(135deg,#f6f5ff 0%,#effafc 100%);border:1px solid rgba(75,47,209,.25);box-shadow:0 6px 18px rgba(75,47,209,.07)">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;font-weight:700;color:#1e1b4b;margin:0">
            <input type="checkbox" id="selAll" ${allChecked ? 'checked' : ''} style="width:17px;height:17px;accent-color:#4b2fd1;cursor:pointer;margin:0" />
            <span>Select all in view (${list.length})</span>
          </label>
          <span class="muted" style="font-size:12.5px">Tip: Click any document card or its checkbox to include it</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge ${count ? 'badge-indigo' : ''}" style="font-weight:700;padding:5px 11px">${count} selected</span>
          <button type="button" class="btn btn-primary btn-sm" id="btnGenReport" ${count ? '' : 'disabled'} style="color:#fff">
            <i class="fa-solid fa-file-contract"></i> Generate Report
          </button>
          <button type="button" class="btn btn-ghost btn-sm" id="btnExitSel" title="Cancel report selection">
            <i class="fa-solid fa-xmark"></i> Cancel
          </button>
        </div>
      </div>`;
  }

  function renderDocList(list, emptyHtml) {
    if (!list.length) {
      visibleIds = [];
      return emptyHtml;
    }
    return selectionBarHtml(list) + `<div class="doc-list">${list.map((d) => ISS.docs.row(d, role, {
      edit: true,
      remove: true,
      select: selectMode,
      checked: selectMode && selected.has(d.id),
    })).join('')}</div>`;
  }

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
    visibleIds = [];
    crumbs.innerHTML = `<span class="here"><i class="fa-solid fa-house"></i> All departments</span>
      ${selectMode && selected.size ? `<span class="grow"></span><button type="button" class="btn btn-primary btn-sm" id="crumbReport" style="color:#fff"><i class="fa-solid fa-file-contract"></i> Generate Report (${selected.size})</button>` : ''}`;
    view.innerHTML = types.length
      ? `<div class="folders">${types.map((c, i) => folderHtml({
          name: c, i, icon: ISS.catIcon(c), tone: ISS.toneFor(c),
          sub: plural(docs.filter((d) => d.category === c).length, 'file'),
          attrs: `data-go="${esc(c)}"`,
        })).join('')}</div>`
      : '<div class="empty"><i class="fa-regular fa-folder-open"></i><strong>No departments available</strong></div>';
  }

  function renderEvents(cat) {
    visibleIds = [];
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i><span class="here">${esc(cat)}</span><span class="grow"></span>
      ${selectMode && selected.size ? `<button type="button" class="btn btn-primary btn-sm" id="crumbReport" style="color:#fff"><i class="fa-solid fa-file-contract"></i> Generate Report (${selected.size})</button>` : ''}
      ${canManage() ? '<button class="btn btn-primary btn-sm" id="addEvent" style="color:#fff"><i class="fa-solid fa-calendar-plus"></i> Add event</button>' : ''}`;
    const tone = ISS.toneFor(cat);
    const general = folderHtml({ name: 'General', i: 0, icon: 'fa-calendar-day', tone: 't-indigo', sub: `${plural(docsInEvent(cat, 'General').length, 'file')} · no event`, attrs: 'data-go-event="General"' });
    const list = (events[cat] || []).map((e, i) => folderHtml({
      name: e.name, i: i + 1, icon: 'fa-ticket', tone, sub: plural(docsInEvent(cat, e.name).length, 'file'), attrs: `data-go-event="${esc(e.name)}"`,
      tools: canManage() ? `<div class="folder-tools"><button class="tool" data-rename-ev="${e.id}" title="Rename event" aria-label="Rename ${esc(e.name)}"><i class="fa-solid fa-pen"></i></button><button class="tool danger" data-delete-ev="${e.id}" title="Move event to Recycle Bin" aria-label="Delete ${esc(e.name)}"><i class="fa-solid fa-trash"></i></button></div>` : '',
    })).join('');
    view.innerHTML = `<div class="folders">${general}${list}</div>`;
  }

  function renderDocTypes(cat, ev) {
    visibleIds = [];
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-cat>${esc(cat)}</button><i class="fa-solid fa-chevron-right sep"></i><span class="here">${esc(ev)}</span><span class="grow"></span>
      ${selectMode && selected.size ? `<button type="button" class="btn btn-primary btn-sm" id="crumbReport" style="color:#fff"><i class="fa-solid fa-file-contract"></i> Generate Report (${selected.size})</button>` : ''}
      ${canManage() ? '<button class="btn btn-primary btn-sm" id="addSub" style="color:#fff"><i class="fa-solid fa-folder-plus"></i> Add document type</button>' : ''}`;
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
    const reportTrigger = list.length && !selectMode
      ? '<button type="button" class="btn btn-ghost btn-sm" id="startReportMode"><i class="fa-solid fa-file-contract"></i> Generate Report</button>'
      : '';
    crumbs.innerHTML = `<button data-home><i class="fa-solid fa-house"></i> Departments</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-cat>${esc(cat)}</button><i class="fa-solid fa-chevron-right sep"></i>
      <button data-back-ev>${esc(ev)}</button><i class="fa-solid fa-chevron-right sep"></i>
      <span class="here">${esc(dt)}</span><span class="grow"></span>
      ${reportTrigger}
      <a class="btn btn-primary btn-sm" style="color:#fff" href="/upload?category=${encodeURIComponent(cat)}&subfolder=${encodeURIComponent(ev)}&doc_type=${encodeURIComponent(dt)}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload here</a>`;
    view.innerHTML = renderDocList(
      list,
      '<div class="empty"><i class="fa-regular fa-folder-open"></i><strong>This folder is empty</strong>Use “Upload here” to add the first file.</div>'
    );
  }

  function renderFiltered() {
    const t = query.trim().toLowerCase();
    const { cat, ev, dt } = route();
    const list = docs.filter((d) => {
      if (cat && d.category !== cat) return false;
      if (ev && (d.subfolder || 'General') !== ev) return false;
      if (dt && (d.doc_type || 'General') !== dt) return false;
      if (!matchesUploadRange(d)) return false;
      if (t && !`${d.title} ${d.standardized_file_name} ${d.category} ${d.subfolder || ''} ${d.doc_type || ''}`.toLowerCase().includes(t)) return false;
      return true;
    }).slice(0, 150);

    const parts = [];
    if (cat) parts.push([cat, ev, dt].filter(Boolean).join(' / '));
    if (filter.from || filter.to) {
      const lo = Math.min(filter.from || filter.to, filter.to || filter.from);
      const hi = Math.max(filter.from || filter.to, filter.to || filter.from);
      parts.push(lo === hi ? MONTHS[lo] : `${MONTHS[lo]}–${MONTHS[hi]}`);
    }
    if (filter.year) parts.push(filter.year);
    if (t) parts.push(`“${esc(query.trim())}”`);

    const reportTrigger = list.length && !selectMode
      ? '<span class="grow"></span><button type="button" class="btn btn-ghost btn-sm" id="startReportMode"><i class="fa-solid fa-file-contract"></i> Generate Report</button>'
      : '';

    crumbs.innerHTML = `<span class="here"><i class="fa-solid fa-filter"></i> ${plural(list.length, 'file')} (${parts.join(' · ')})</span>${reportTrigger}`;
    view.innerHTML = renderDocList(
      list,
      '<div class="empty"><i class="fa-regular fa-folder-open"></i><strong>No matching documents</strong>Adjust your month range or search filters.</div>'
    );
  }

  function render() {
    $('#resetFilter').hidden = !hasActiveFilter();
    if (hasActiveFilter()) return renderFiltered();
    const { cat, ev, dt } = route();
    if (!cat) renderDepartments();
    else if (!ev) renderEvents(cat);
    else if (!dt) renderDocTypes(cat, ev);
    else renderFiles(cat, ev, dt);
  }

  /* ---------- Consolidated Abstract Report Generator ---------- */
  const getSelectedDocs = () => docs.filter((d) => selected.has(d.id));

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureParsers() {
    await Promise.all([
      window.mammoth ? Promise.resolve() : loadScriptOnce('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js').catch(() => {}),
      window.XLSX ? Promise.resolve() : loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').catch(() => {}),
      window.pdfjsLib ? Promise.resolve() : loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js').then(() => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
      }).catch(() => {}),
    ]);
  }

  /* Extractive abstract & key-point builder */
  function buildAbstractFromText(rawText, doc) {
    const clean = (rawText || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (!clean) {
      return {
        abstract: `This record (${doc.title}) is filed under ${doc.category} (${doc.subfolder || 'General'}) and contains no selectable text layer.`,
        highlights: [],
        metrics: [],
        paragraphs: [],
        wordCount: 0,
      };
    }

    const words = clean.split(/\s+/).filter(Boolean);
    const lines = clean.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);

    const rawSentences = clean
      .replace(/\n+/g, '. ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length >= 25 && s.length <= 420);

    const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'will', 'have', 'has', 'had', 'been', 'into', 'also', 'their', 'they', 'them', 'which', 'about', 'would', 'could', 'should', 'other', 'more', 'some', 'such', 'than', 'then', 'when', 'where', 'what', 'who', 'whom', 'whose', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'most', 'none', 'one', 'two', 'per', 'via']);
    const freq = {};
    words.forEach((w) => {
      const k = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (k.length > 3 && !stopWords.has(k)) freq[k] = (freq[k] || 0) + 1;
    });

    const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);

    const scored = rawSentences.map((sentence, idx) => {
      const tokens = sentence.toLowerCase().split(/\W+/).filter(Boolean);
      let score = tokens.reduce((acc, t) => acc + (freq[t] || 0), 0) / Math.max(tokens.length, 6);
      if (idx === 0) score += 2.5;
      else if (idx <= 2) score += 1.4;
      if (idx === rawSentences.length - 1) score += 0.8;
      if (/\b(purpose|objective|summary|resolved|approved|total|budget|target|schedule|conducted|aims|concludes|recommends|implemented)\b/i.test(sentence)) score += 1.6;
      if (/(\d+%|\bphp\b|\b₱\s?\d|\d{1,3}(,\d{3})+)/i.test(sentence)) score += 1.2;
      return { sentence, idx, score };
    });

    const topSentences = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.sentence.replace(/\.+$/, '') + '.');

    const metricMatches = clean.match(/(?:₱\s?\d[\d,.]*|PHP\s?\d[\d,.]*|\b\d+(?:\.\d+)?%|\b\d+\s+(?:participants|members|students|officers|attendees|days|items|files|rooms|sessions)\b)/gi) || [];
    const metrics = [...new Set(metricMatches.map((m) => m.trim()))].slice(0, 5);

    const abstractText = topSentences.length
      ? topSentences.join(' ')
      : lines.slice(0, 3).join(' ').slice(0, 380) + (clean.length > 380 ? '…' : '');

    const highlights = scored
      .slice(0, 6)
      .map((s) => s.sentence.replace(/\.+$/, '') + '.')
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .slice(0, 3);

    return {
      abstract: abstractText,
      highlights,
      metrics,
      keywords,
      paragraphs: lines,
      wordCount: words.length,
    };
  }

  async function extractFileContent(doc) {
    const fileName = doc.standardized_file_name || '';
    const ext = fileName.split('.').pop().toLowerCase();

    try {
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        return {
          kind: 'Visual Attachment',
          wordCount: 0,
          abstract: `Visual documentation titled “${doc.title}” (${ext.toUpperCase()} image) filed under ${doc.category} — ${doc.subfolder || 'General'} (${ISS.fmtDate(doc.document_date)}).`,
          highlights: [`Attached image record: ${fileName}`],
          metrics: [],
          keywords: [doc.category.toLowerCase(), (doc.doc_type || 'image').toLowerCase()],
          rawHtml: `<div style="text-align:center;padding:10px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
                      <img src="${esc(doc.file_url)}" alt="${esc(doc.title)}" style="max-width:100%;max-height:340px;border-radius:8px;object-fit:contain" />
                    </div>`,
          plainText: `[Image file: ${fileName}]`,
        };
      }

      const res = await fetch(doc.file_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (ext === 'docx' && window.mammoth) {
        const buf = await res.arrayBuffer();
        const { value } = await window.mammoth.extractRawText({ arrayBuffer: buf });
        const info = buildAbstractFromText(value, doc);
        return {
          kind: 'Word Document',
          wordCount: info.wordCount,
          abstract: info.abstract,
          highlights: info.highlights,
          metrics: info.metrics,
          keywords: info.keywords,
          rawHtml: info.paragraphs.length
            ? info.paragraphs.map((p) => `<p style="margin:0 0 8px;line-height:1.6">${esc(p)}</p>`).join('')
            : '<p class="muted">No extractable text found.</p>',
          plainText: value.trim(),
        };
      }

      if (ext === 'pdf' && window.pdfjsLib) {
        const buf = await res.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let fullText = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const pageText = content.items.map((it) => it.str).join(' ');
          fullText += (p > 1 ? '\n\n' : '') + pageText;
        }
        const info = buildAbstractFromText(fullText, doc);
        return {
          kind: `PDF (${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'})`,
          wordCount: info.wordCount,
          abstract: info.abstract,
          highlights: info.highlights,
          metrics: info.metrics,
          keywords: info.keywords,
          rawHtml: info.paragraphs.length
            ? info.paragraphs.map((p) => `<p style="margin:0 0 8px;line-height:1.6">${esc(p)}</p>`).join('')
            : '<p class="muted">Scanned or image-only PDF (no selectable text layer).</p>',
          plainText: fullText.trim(),
        };
      }

      if (['xlsx', 'xls'].includes(ext) && window.XLSX) {
        const buf = await res.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        let totalRows = 0;
        const sheetSummaries = [];
        const sections = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name];
          const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const nonEmpty = rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
          totalRows += Math.max(0, nonEmpty.length - 1);
          const headers = nonEmpty[0] ? nonEmpty[0].map((c) => String(c).trim()).filter(Boolean) : [];
          sheetSummaries.push(`“${name}” (${Math.max(0, nonEmpty.length - 1)} records${headers.length ? `: ${headers.slice(0, 5).join(', ')}` : ''})`);
          if (!nonEmpty.length) return `<p class="muted">Sheet "${esc(name)}" is empty.</p>`;
          const tblRows = nonEmpty.slice(0, 30).map((r, rIdx) => {
            const tag = rIdx === 0 ? 'th' : 'td';
            return `<tr>${r.map((c) => `<${tag}>${esc(String(c))}</${tag}>`).join('')}</tr>`;
          }).join('');
          return `<div style="margin-bottom:12px">
            <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px">Sheet: ${esc(name)} (${nonEmpty.length} rows)</div>
            <div style="overflow-x:auto"><table class="rpt-mini-tbl">${tblRows}</table></div>
          </div>`;
        }).join('');
        const plain = wb.SheetNames.map((n) => window.XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
        return {
          kind: `Spreadsheet (${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? '' : 's'})`,
          wordCount: plain.split(/\s+/).filter(Boolean).length,
          abstract: `Structured dataset containing ${wb.SheetNames.length} worksheet(s) and approximately ${totalRows} data record(s): ${sheetSummaries.join('; ')}.`,
          highlights: sheetSummaries,
          metrics: [`${wb.SheetNames.length} sheet(s)`, `${totalRows} row(s)`],
          keywords: wb.SheetNames.map((s) => s.toLowerCase()),
          rawHtml: sections,
          plainText: plain.trim(),
        };
      }

      const text = await res.text();
      const info = buildAbstractFromText(text, doc);
      return {
        kind: ext.toUpperCase() || 'Text File',
        wordCount: info.wordCount,
        abstract: info.abstract,
        highlights: info.highlights,
        metrics: info.metrics,
        keywords: info.keywords,
        rawHtml: info.paragraphs.length
          ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;line-height:1.6">${esc(text.trim())}</pre>`
          : '<p class="muted">Empty file.</p>',
        plainText: text.trim(),
      };
    } catch (err) {
      return {
        kind: ext.toUpperCase() || 'File',
        wordCount: 0,
        abstract: `Unable to extract readable text from “${doc.title}” (${err.message}).`,
        highlights: [],
        metrics: [],
        keywords: [],
        rawHtml: `<p style="color:#b91c1c;margin:0">Unable to read file content (${esc(err.message)}).</p>`,
        plainText: '',
      };
    }
  }

  let lastExtracted = [];

  function synthesizeMasterAbstract(entries) {
    const depts = [...new Set(entries.map((e) => e.doc.category))];
    const evs = [...new Set(entries.map((e) => e.doc.subfolder).filter((s) => s && s !== 'General'))];
    const dtypes = [...new Set(entries.map((e) => e.doc.doc_type).filter((s) => s && s !== 'General'))];
    const dates = entries.map((e) => e.doc.document_date).filter(Boolean).sort();
    const dateSpan = dates.length
      ? (dates[0] === dates[dates.length - 1] ? ISS.fmtDate(dates[0]) : `${ISS.fmtDate(dates[0])} to ${ISS.fmtDate(dates[dates.length - 1])}`)
      : 'unspecified dates';

    const opening = `This consolidated report synthesizes ${entries.length} selected document${entries.length === 1 ? '' : 's'} from ${depts.join(', ')}${evs.length ? ` covering ${evs.join(', ')}` : ''}${dtypes.length ? ` (${dtypes.join(', ')})` : ''}, dated ${dateSpan}.`;

    const perDocSynthesis = entries.map((e) => {
      const lead = e.extracted.abstract.split(/(?<=[.!?])\s+/)[0] || e.extracted.abstract;
      return `In “${e.doc.title},” ${lead.charAt(0).toLowerCase() + lead.slice(1)}`;
    }).join(' ');

    const allKeywords = [...new Set(entries.flatMap((e) => e.extracted.keywords || []))].slice(0, 8);
    return { narrative: `${opening} ${perDocSynthesis}`, keywords: allKeywords };
  }

  function buildContentReportHtml(entries, generatedAt) {
    const totalWords = entries.reduce((sum, e) => sum + (e.extracted.wordCount || 0), 0);
    const master = synthesizeMasterAbstract(entries);

    const sectionsHtml = entries.map((e, idx) => `
      <section class="rpt-doc-card">
        <div class="rpt-doc-head">
          <div>
            <span class="rpt-num">Source ${idx + 1} of ${entries.length}</span>
            <h3 style="margin:3px 0 2px;font-size:16.5px;color:#0f172a">${esc(e.doc.title)}</h3>
            <div style="font-size:12px;color:#64748b">
              ${esc(e.doc.category)} &rsaquo; ${esc(e.doc.subfolder || 'General')} &rsaquo; ${esc(e.doc.doc_type || 'General')}
              &nbsp;·&nbsp; Date: ${ISS.fmtDate(e.doc.document_date)}
            </div>
          </div>
          <div style="text-align:right;font-size:12px;color:#475569">
            <span class="rpt-pill">${esc(e.extracted.kind)}</span>
            ${e.extracted.wordCount ? `<div style="margin-top:4px;font-weight:600">${e.extracted.wordCount.toLocaleString()} words</div>` : ''}
          </div>
        </div>
        <div class="rpt-doc-body">
          <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#4b2fd1;margin-bottom:6px">Document Abstract</div>
          <p style="margin:0 0 10px;line-height:1.7;color:#1e293b;text-align:justify">${esc(e.extracted.abstract)}</p>

          ${e.extracted.metrics && e.extracted.metrics.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              ${e.extracted.metrics.map((m) => `<span style="font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0">${esc(m)}</span>`).join('')}
            </div>` : ''}

          ${e.extracted.highlights && e.extracted.highlights.length > 1 ? `
            <div style="background:#f8fafc;border-left:3px solid #4b2fd1;padding:8px 12px;border-radius:0 8px 8px 0;margin-bottom:10px">
              <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">KEY POINTS</div>
              <ul style="margin:0;padding-left:16px;font-size:12.5px;color:#334155;display:grid;gap:3px">
                ${e.extracted.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}
              </ul>
            </div>` : ''}

          <details class="rpt-raw-toggle" style="margin-top:8px">
            <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#64748b;user-select:none">View full extracted source text</summary>
            <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:13px;color:#334155">
              ${e.extracted.rawHtml}
            </div>
          </details>
        </div>
      </section>`).join('');

    return `
      <div class="rpt-sheet">
        <div class="rpt-banner">
          <div>
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.82;font-weight:700">Information Systems Society · Consolidated Abstract</div>
            <h2 style="margin:4px 0 2px;font-size:21px;color:#fff">Consolidated Document Abstract Report</h2>
            <div style="font-size:12.5px;opacity:.9">Prepared on ${esc(generatedAt)} by ${esc(userName || role)} (${esc(role)})</div>
          </div>
          <div style="text-align:right;font-size:12.5px;opacity:.95">
            <div><strong>${entries.length}</strong> Source Document${entries.length === 1 ? '' : 's'}</div>
            <div><strong>${totalWords.toLocaleString()}</strong> Total Words Analyzed</div>
          </div>
        </div>

        <div class="rpt-exec">
          <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#3b22b8;margin-bottom:8px">
            <i class="fa-solid fa-align-left"></i> Consolidated Abstract
          </div>
          <p style="margin:0;font-size:14px;line-height:1.75;color:#1e293b;text-align:justify">
            ${esc(master.narrative)}
          </p>
          ${master.keywords.length ? `
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(75,47,209,.15);font-size:12.5px;color:#475569">
              <strong style="color:#3b22b8">Keywords:</strong> ${master.keywords.map((k) => esc(k)).join(' · ')}
            </div>` : ''}
        </div>

        <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#475569;margin:0 0 10px">
          Individual Document Abstracts
        </div>
        <div style="display:grid;gap:14px">
          ${sectionsHtml}
        </div>
      </div>`;
  }

  let reportModal = null;
  async function openReportModal() {
    const items = getSelectedDocs();
    if (!items.length) return ISS.toast('Select at least one file first.', 'warn');

    if (!reportModal) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog class="dlg wide" id="reportDlg" aria-label="Consolidated Document Abstract Report" style="width:min(1140px,95vw);max-width:95vw;margin:auto;padding:0;border:1px solid rgba(75,47,209,.25);border-radius:20px;overflow:hidden;box-shadow:0 28px 70px rgba(15,18,36,.38)">
          <div class="dlg-card left" style="width:100%;max-width:100%;padding:0;border-radius:0;background:#f8fafc">
            <div class="dlg-head" style="margin:0;padding:14px 22px;background:#13172e;color:#fff;border-bottom:1px solid rgba(255,255,255,.12)">
              <div style="display:flex;align-items:center;gap:10px">
                <i class="fa-solid fa-file-lines" style="color:#8fe3f2;font-size:18px"></i>
                <h3 style="color:#fff;margin:0;font-size:16px">Consolidated Abstract Report</h3>
              </div>
              <div class="row-wrap" style="gap:8px">
                <button type="button" class="btn btn-sm" id="rptPrint" style="background:#fff;color:#3b22b8;font-weight:700;border:0"><i class="fa-solid fa-print"></i> Print / Save PDF</button>
                <button type="button" class="btn btn-sm" id="rptCsv" title="Download summary table for Microsoft Excel or Google Sheets" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.22)"><i class="fa-solid fa-file-excel"></i> Export to Excel</button>
                <button type="button" class="icon-btn" data-close aria-label="Close" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2)"><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>
            <div id="rptBody" style="max-height:82vh;overflow:auto;padding:22px"></div>
          </div>
        </dialog>`);
      reportModal = $('#reportDlg');
      $('#rptPrint').addEventListener('click', printReport);
      $('#rptCsv').addEventListener('click', exportCsvReport);
    }

    $('#rptBody').innerHTML = `<div style="padding:48px;text-align:center;color:#475569">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:26px;color:#4b2fd1;margin-bottom:10px"></i>
      <div style="font-weight:700;font-size:15px">Analyzing &amp; generating consolidated abstract from ${items.length} file${items.length === 1 ? '' : 's'}…</div>
    </div>`;
    reportModal.showModal();

    await ensureParsers();
    lastExtracted = await Promise.all(items.map(async (doc) => ({
      doc,
      extracted: await extractFileContent(doc),
    })));

    const nowStr = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
    $('#rptBody').innerHTML = reportStyles() + buildContentReportHtml(lastExtracted, nowStr);
  }

  function reportStyles() {
    return `<style>
      .rpt-sheet{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;color:#0f172a;box-shadow:0 8px 24px rgba(15,23,42,.06)}
      .rpt-banner{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;padding:20px 24px;border-radius:14px;background:linear-gradient(135deg,#3b22b8 0%,#4b2fd1 55%,#0e8aa8 100%);color:#fff;margin-bottom:18px}
      .rpt-exec{background:#f8f7ff;border:1px solid rgba(75,47,209,.22);border-radius:12px;padding:18px 22px;margin-bottom:20px}
      .rpt-doc-card{border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;page-break-inside:avoid}
      .rpt-doc-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
      .rpt-num{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4b2fd1}
      .rpt-pill{display:inline-block;padding:3px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-weight:700;font-size:11.5px}
      .rpt-doc-body{padding:16px 20px;font-size:13.5px;color:#1e293b}
      .rpt-mini-tbl{width:100%;border-collapse:collapse;font-size:12px}
      .rpt-mini-tbl th,.rpt-mini-tbl td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
      .rpt-mini-tbl th{background:#f1f5f9;font-weight:700}
      @media print{.rpt-raw-toggle:not([open]){display:none}.rpt-raw-toggle summary{display:none}}
    </style>`;
  }

  function printReport() {
    if (!lastExtracted.length) return;
    const nowStr = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
    const win = window.open('', '_blank', 'width=1050,height=780');
    if (!win) return ISS.toast('Allow pop-ups to print or save as PDF.', 'warn');
    win.document.write(`<!doctype html><html><head><title>Consolidated Document Abstract Report</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:20px;color:#0f172a}@media print{body{margin:0}.rpt-sheet{border:0;box-shadow:none;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
      ${reportStyles()}</head><body>${buildContentReportHtml(lastExtracted, nowStr)}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  async function exportCsvReport() {
    const items = getSelectedDocs();
    if (!items.length) return ISS.toast('Select at least one file first.', 'warn');
    await ensureParsers();
    const entries = lastExtracted.length === items.length
      ? lastExtracted
      : await Promise.all(items.map(async (doc) => ({ doc, extracted: await extractFileContent(doc) })));

    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['#', 'Document Title', 'Department', 'Event', 'Document Type', 'Document Date', 'Word Count', 'Document Abstract', 'Key Points'];
    const lines = [headers.map(q).join(',')].concat(
      entries.map(({ doc, extracted }, i) => [
        i + 1, doc.title, doc.category, doc.subfolder || 'General',
        doc.doc_type || 'General', doc.document_date || '',
        extracted.wordCount || 0, extracted.abstract, (extracted.highlights || []).join(' | '),
      ].map(q).join(','))
    );
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `ISS_Consolidated_Abstract_${new Date().toISOString().slice(0, 10)}.csv`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ISS.toast(`Downloaded Excel summary for ${entries.length} document${entries.length === 1 ? '' : 's'}.`);
  }

  /* ---------- data loading ---------- */
  async function load() {
    const [f, d] = await Promise.all([ISS.api('/api/folders'), ISS.api('/api/documents')]);
    types = f.types; events = f.events; subfolders = f.subfolders || {}; docs = d.documents;

    const validIds = new Set(docs.map((doc) => doc.id));
    selected = new Set([...selected].filter((id) => validIds.has(id)));

    rebuildYearOptions($('#mYear').value);
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
  view.addEventListener('change', (e) => {
    if (e.target.id === 'selAll') {
      if (e.target.checked) visibleIds.forEach((id) => selected.add(id));
      else visibleIds.forEach((id) => selected.delete(id));
      render();
      return;
    }
    const cb = e.target.closest('[data-doc-select]');
    if (!cb) return;
    const id = +cb.dataset.docSelect;
    if (cb.checked) selected.add(id); else selected.delete(id);
    render();
  });

  view.addEventListener('click', (e) => {
    if (e.target.closest('#btnGenReport')) return openReportModal();
    if (e.target.closest('#btnExitSel')) return exitSelectMode();
    if (selectMode && !e.target.closest('button,a,input,label')) {
      const cardRow = e.target.closest('[data-doc-row]');
      if (cardRow) {
        const id = +cardRow.dataset.docRow;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        render();
        return;
      }
    }

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
    if (e.target.closest('#startReportMode')) return enterSelectMode();
    if (e.target.closest('#crumbReport')) return openReportModal();
    if (e.target.closest('[data-home]')) { $('#q').value = ''; query = ''; selectMode = false; selected.clear(); go(); }
    else if (e.target.closest('[data-back-cat]')) go(cat);
    else if (e.target.closest('[data-back-ev]')) go(cat, ev);
    else if (e.target.closest('#addEvent')) addEvent(cat);
    else if (e.target.closest('#addSub')) addSub(cat, ev);
  });

  ISS.docs.bind(view, byId, { edit: openEdit, remove: removeDoc, changed: (d) => { d.approval_status = 'Approved'; render(); } });
  $('#q').addEventListener('input', ISS.debounce((e) => { query = e.target.value; render(); }, 140));
  $('#mFrom').addEventListener('change', (e) => { filter.from = Number(e.target.value) || 0; render(); });
  $('#mTo').addEventListener('change', (e) => { filter.to = Number(e.target.value) || 0; render(); });
  $('#mYear').addEventListener('change', async (e) => {
    if (e.target.value === '__add_year__') {
      e.target.value = filter.year || '';
      const yr = await ISS.prompt({
        icon: 'fa-calendar',
        title: 'Filter by custom year',
        confirm: 'Apply year',
        input: {
          placeholder: 'e.g. 2024',
          validate: (v) => /^\d{4}$/.test(v.trim()) ? '' : 'Enter a valid 4-digit year (e.g. 2024).',
        },
      });
      if (yr) {
        const cleanYr = yr.trim();
        customYears.add(cleanYr);
        rebuildYearOptions(cleanYr);
        render();
      }
      return;
    }
    filter.year = e.target.value;
    render();
  });
  $('#resetFilter').addEventListener('click', () => {
    $('#q').value = ''; query = '';
    $('#mFrom').value = ''; $('#mTo').value = ''; $('#mYear').value = '';
    filter = { from: 0, to: 0, year: '' };
    render();
  });
  addEventListener('hashchange', render);

  ISS.ready.then(async (me) => {
    role = me.role;
    userName = me.fullName || me.full_name || me.username || '';
    try { await load(); } catch (err) { view.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Could not load documents</strong>${esc(err.message)}</div>`; }
  });
})();