    (function () {
      const { $, esc } = ISS;
      const PAGE = 60;
      let logs = [], shown = PAGE, f = { q: '', day: '', group: 'All' };

      /* Visual + category for each action type */
      function describe(type) {
        const t = type.toLowerCase();
        const has = (...w) => w.some((x) => t.includes(x));
        if (has('login')) return { g: 'Sign-ins', icon: 'fa-right-to-bracket', cls: 'ev-aqua' };
        if (has('permanent')) return { g: 'Documents', icon: 'fa-triangle-exclamation', cls: 'ev-rose' };
        if (has('recycle', 'delete')) return { g: 'Documents', icon: 'fa-trash-can', cls: 'ev-amber' };
        if (has('restore')) return { g: 'Documents', icon: 'fa-rotate-left', cls: 'ev-green' };
        if (has('upload')) return { g: 'Documents', icon: 'fa-cloud-arrow-up', cls: 'ev-green' };
        if (has('approve')) return { g: 'Documents', icon: 'fa-stamp', cls: 'ev-green' };
        if (has('view')) return { g: 'Documents', icon: 'fa-eye', cls: 'ev-ink' };
        if (has('edit')) return { g: 'Documents', icon: 'fa-pen', cls: 'ev-ink' };
        if (has('backup')) return { g: 'System', icon: 'fa-server', cls: 'ev-aqua' };
        if (has('event', 'type')) return { g: 'System', icon: 'fa-folder-plus', cls: 'ev-ink' };
        return { g: 'Users', icon: 'fa-user-gear', cls: '' };
      }

      const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      function dayLabel(d) {
        const today = new Date(), y = new Date(Date.now() - 86400000);
        if (ymd(d) === ymd(today)) return 'Today';
        if (ymd(d) === ymd(y)) return 'Yesterday';
        return d.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      }

      function filtered() {
        const q = f.q.trim().toLowerCase();
        return logs.filter((l) =>
          (f.group === 'All' || l.meta.g === f.group) &&
          (!f.day || ymd(l.when) === f.day) && // compares in the viewer's local time, so the date picker matches what they see
          (!q || `${l.username} ${l.action_type} ${l.result || ''} ${l.document_title || ''}`.toLowerCase().includes(q)));
      }

      function render() {
        const list = filtered(), part = list.slice(0, shown);
        $('#count').textContent = `${list.length} entr${list.length === 1 ? 'y' : 'ies'}`;
        $('#reset').hidden = !f.day;
        if (!list.length) {
          $('#timeline').innerHTML = '<div class="empty"><i class="fa-solid fa-clock-rotate-left"></i><strong>No activity found</strong>Try another date or clear the filters.</div>';
          $('#more').hidden = true; return;
        }
        let html = '', last = '';
        part.forEach((l, i) => {
          const label = dayLabel(l.when);
          if (label !== last) { html += `<div class="day">${esc(label)}</div>`; last = label; }
          const doc = l.document_id ? ` · ${esc(l.document_title || 'Document #' + l.document_id)}` : '';
          html += `<div class="event ${l.meta.cls}" style="animation-delay:${Math.min(i, 12) * 25}ms">
            <div class="dot"><i class="fa-solid ${l.meta.icon}"></i></div>
            <div style="min-width:0"><div><strong>@${esc(l.username)}</strong> ${esc(l.action_type)}</div><div class="what">${esc(l.result || '')}${doc}</div></div>
            <time datetime="${l.when.toISOString()}">${l.when.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</time></div>`;
        });
        $('#timeline').innerHTML = html;
        $('#more').hidden = list.length <= shown;
      }

      function renderChips() {
        const groups = ['All', 'Sign-ins', 'Documents', 'Users', 'System'];
        $('#chips').innerHTML = groups.map((g) => {
          const n = g === 'All' ? logs.length : logs.filter((l) => l.meta.g === g).length;
          return `<button class="chip" aria-pressed="${f.group === g}" data-g="${g}">${g} <span class="n">${n}</span></button>`;
        }).join('');
      }

      $('#chips').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; f.group = b.dataset.g; shown = PAGE; renderChips(); render(); });
      $('#q').addEventListener('input', ISS.debounce((e) => { f.q = e.target.value; shown = PAGE; render(); }, 140));
      $('#day').addEventListener('change', (e) => { f.day = e.target.value; shown = PAGE; render(); });
      $('#reset').addEventListener('click', () => { $('#day').value = ''; f.day = ''; render(); });
      $('#more').addEventListener('click', () => { shown += PAGE; render(); });

      ISS.ready.then(async () => {
        try {
          const rows = await ISS.api('/api/activity?limit=1000');
          logs = rows.map((r) => ({ ...r, when: new Date(r.action_date), meta: describe(r.action_type) }));
          renderChips(); render();
        } catch (err) {
          $('#timeline').innerHTML = `<div class="empty"><i class="fa-solid fa-lock"></i><strong>Could not load the log</strong>${esc(err.message)}</div>`;
        }
      });
    })();