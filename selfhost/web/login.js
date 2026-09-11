const form = document.getElementById('login-form');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const error = document.getElementById('login-error');
  error.textContent = ''; button.disabled = true; button.textContent = 'Comprobando acceso…';
  try {
    const response = await fetch('/admin/login', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo iniciar sesión. Intenta de nuevo.');
    }
    form.reset(); location.replace('/admin');
  } catch (failure) { error.textContent = failure.message; }
  finally { button.disabled = false; button.textContent = 'Entrar al panel'; }
});
