(function () {
      const form = document.getElementById('loginForm'), btn = document.getElementById('submit');
      const alertBox = document.getElementById('alert'), alertText = document.getElementById('alertText');
      const pw = document.getElementById('password');

      const showError = (msg) => {
        alertText.textContent = msg;
        alertBox.classList.remove('show'); void alertBox.offsetWidth; // restart the shake animation
        alertBox.classList.add('show');
      };

      document.getElementById('peek').addEventListener('click', (e) => {
        const show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        e.currentTarget.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = form.username.value.trim(), password = pw.value;
        if (!username || !password) return showError('Enter your username and password.');

        alertBox.classList.remove('show');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i><span>Signing in…</span>';
        try {
          const res = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Sign-in failed. Try again.');
          location.href = data.redirect || '/dashboard';
        } catch (err) {
          showError(err.message === 'Failed to fetch' ? 'Cannot reach the server. Check your connection.' : err.message);
          btn.disabled = false;
          btn.innerHTML = '<span>Sign in</span><i class="fa-solid fa-arrow-right"></i>';
          pw.select();
        }
      });

      document.getElementById('username').focus();
    })();