(function () {
      const { $, esc } = ISS;
      const ROLES = ['Officer', 'Secretary', 'Treasurer', 'President', 'Administrator'];
      let me, users = [];
      const list = $('#users');

      // Presidents may not hand out or touch Administrator accounts (the server enforces this too)
      const assignable = () => (me.role === 'Administrator' ? ROLES : ROLES.filter((r) => r !== 'Administrator'));
      const locked = (u) => u.id === me.userId || (me.role !== 'Administrator' && u.access_level === 'Administrator');
      const isOff = (u) => String(u.status || 'active').toLowerCase() === 'inactive';

      function render() {
        $('#userCount').textContent = `${users.length} account${users.length === 1 ? '' : 's'}`;
        if (!users.length) { list.innerHTML = '<div class="empty"><i class="fa-solid fa-users"></i><strong>No accounts yet</strong></div>'; return; }
        list.innerHTML = users.map((u) => {
          const self = u.id === me.userId, off = isOff(u), lock = locked(u);
          const opts = ROLES.filter((r) => assignable().includes(r) || r === u.access_level)
            .map((r) => `<option ${r === u.access_level ? 'selected' : ''}>${r}</option>`).join('');
          return `<article class="user-row ${off ? 'off' : ''}" data-id="${u.id}">
            <div class="who"><div class="avatar">${esc(u.full_name.trim().charAt(0).toUpperCase())}</div>
              <div style="min-width:0"><strong>${esc(u.full_name)}${self ? ' <span class="badge badge-violet">You</span>' : ''}</strong><small>@${esc(u.username)} · joined ${ISS.fmtDate(String(u.date_created).slice(0, 10))}</small></div></div>
            <div class="row-wrap" style="gap:8px">
              <select class="select" data-role aria-label="Access level for ${esc(u.full_name)}" ${lock ? 'disabled' : ''} style="padding:9px 36px 9px 12px;border-radius:12px;width:auto">${opts}</select>
              <span class="badge ${off ? 'badge-rose' : 'badge-ok'}">${off ? 'Inactive' : 'Active'}</span>
            </div>
            <div class="user-actions">
              <button class="btn btn-ghost btn-sm" data-act="reset" ${me.role !== 'Administrator' && u.access_level === 'Administrator' ? 'disabled' : ''}><i class="fa-solid fa-key"></i><span>Reset password</span></button>
              <button class="btn btn-ghost btn-sm" data-act="${off ? 'activate' : 'deactivate'}" ${lock ? 'disabled' : ''} style="${off ? '' : 'color:var(--rose)'}"><i class="fa-solid ${off ? 'fa-user-check' : 'fa-user-slash'}"></i><span>${off ? 'Reactivate' : 'Deactivate'}</span></button>
            </div></article>`;
        }).join('');
      }

      async function load() { users = await ISS.api('/api/users'); render(); }
      async function run(task, msg) { try { await task(); ISS.toast(msg); await load(); } catch (err) { ISS.toast(err.message, 'err'); render(); } }

      list.addEventListener('change', async (e) => {
        const sel = e.target.closest('[data-role]'); if (!sel) return;
        const u = users.find((x) => x.id === +sel.closest('.user-row').dataset.id);
        const ok = await ISS.confirm({ icon: 'fa-shield-halved', title: 'Change access level?', text: `${u.full_name} will become ${sel.value}.`, confirm: 'Change level' });
        if (!ok) return render();
        run(() => ISS.api(`/api/users/${u.id}/role`, { method: 'PUT', body: { newRole: sel.value } }), 'Access level updated.');
      });

      list.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const u = users.find((x) => x.id === +b.closest('.user-row').dataset.id);
        const act = b.dataset.act;
        if (act === 'reset') {
          const pw = await ISS.prompt({ icon: 'fa-key', title: `New password for @${u.username}`, confirm: 'Reset password', input: { placeholder: 'At least 8 characters', validate: (v) => v.length < 8 ? 'Use at least 8 characters.' : '' } });
          if (pw) run(() => ISS.api(`/api/users/${u.id}/reset-password`, { method: 'PUT', body: { newPassword: pw } }), 'Password reset.');
        } else if (act === 'deactivate') {
          const ok = await ISS.confirm({ icon: 'fa-user-slash', tone: 'danger', title: 'Deactivate account?', text: `@${u.username} will not be able to sign in. You can reactivate them later.`, confirm: 'Deactivate' });
          if (ok) run(() => ISS.api(`/api/users/${u.id}/deactivate`, { method: 'PUT' }), 'Account deactivated.');
        } else if (act === 'activate') {
          run(() => ISS.api(`/api/users/${u.id}/activate`, { method: 'PUT' }), 'Account reactivated.');
        }
      });

      $('#createForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { full_name: $('#full_name').value.trim(), username: $('#username').value.trim(), password: $('#password').value, access_level: $('#access_level').value };
        if (!body.full_name || !body.username) return ISS.toast('Enter a name and a username.', 'warn');
        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(body.username)) return ISS.toast('Username: 3–32 letters, numbers, dot, dash or underscore.', 'warn');
        if (body.password.length < 8) return ISS.toast('Password needs at least 8 characters.', 'warn');
        try {
          await ISS.busy($('#createForm button[type=submit]'), () => ISS.api('/api/users', { method: 'POST', body }), 'Creating…');
          ISS.toast(`Account @${body.username} created.`);
          e.target.reset(); $('#access_level').value = 'Officer';
          await load();
        } catch (err) { ISS.toast(err.message, 'err'); }
      });

      $('#backupBtn').addEventListener('click', (e) => ISS.busy(e.currentTarget, async () => {
        try {
          const res = await fetch('/api/backup', { credentials: 'same-origin' });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Backup failed on the server.');
          const url = URL.createObjectURL(await res.blob());
          const a = Object.assign(document.createElement('a'), { href: url, download: `ISS_DS_Backup_${ISS.todayYMD()}.zip` });
          document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          ISS.toast('Backup downloaded.');
        } catch (err) { ISS.toast(err.message, 'err'); }
      }, 'Packing files…'));

      ISS.ready.then(async (user) => {
        me = user;
        $('#backupPanel').hidden = me.role !== 'Administrator';
        $('#access_level').innerHTML = assignable().map((r) => `<option>${r}</option>`).join('');
        try { await load(); } catch (err) { list.innerHTML = `<div class="empty"><i class="fa-solid fa-lock"></i><strong>Could not load accounts</strong>${esc(err.message)}</div>`; }
      });
    })();