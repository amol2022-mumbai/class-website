async function api(path, options = {}) {
  if (options.raw) {
    const res = await fetch(path, options);
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (_) {}
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return res;
  }
  const opts = { ...options, headers: { 'Content-Type': 'application/json' } };
  if (options.body && typeof options.body !== 'string') opts.body = JSON.stringify(options.body);
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function roleHome(role) {
  return role === 'admin' ? '/admin.html'
    : role === 'faculty' ? '/faculty.html'
    : role === 'parent' ? '/parent.html'
    : '/student.html';
}

async function requireAuth(expectedRole) {
  try {
    const { user } = await api('/api/auth/me');
    if (expectedRole && user.role !== expectedRole) {
      window.location.href = roleHome(user.role);
      return null;
    }
    return user;
  } catch (_) {
    window.location.href = '/login.html';
    return null;
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/login.html';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
