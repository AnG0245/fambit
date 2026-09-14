import {useEffect, useState, type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from '../../app/workspace';
import '../../selfhost/web/portal.css';
import '../../app/globals.css';

declare const __FAMBIT_EMULATOR__: boolean;
type User = {name: string; email: string};
type Usage = {downloadBytes: number; dailyLimitBytes: number; storedBytes: number; storageLimitBytes: number};
const authOrigin = __FAMBIT_EMULATOR__ ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1' : 'https://identitytoolkit.googleapis.com/v1';

async function firebaseAuth(action: string, body: unknown) {
  const configResponse = await fetch('/__/firebase/init.json', {cache: 'no-store'});
  const config = __FAMBIT_EMULATOR__ ? {apiKey: 'demo-key'} : await configResponse.json() as {apiKey?: string};
  if (!config?.apiKey) throw new Error('Falta registrar la aplicación web en Firebase. Revisa la guía de publicación.');
  const response = await fetch(authOrigin + '/' + action + '?key=' + encodeURIComponent(config.apiKey), {
    method: 'POST', headers: {'Content-Type': 'application/json', 'X-Firebase-Locale': 'es'}, body: JSON.stringify(body),
  });
  const data = await response.json() as {idToken: string};
  if (!response.ok) throw new Error('No se pudo completar el acceso. Revisa tu correo y contraseña o espera unos minutos.');
  return data;
}

function Admin() {
  const [user, setUser] = useState<User | null>(null), [usage, setUsage] = useState<Usage | undefined>(), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [verificationToken, setVerificationToken] = useState(''), [notice, setNotice] = useState('');
  const loadUsage = async () => { const r = await fetch('/api/admin/usage', {cache: 'no-store'}); if (r.ok) setUsage(await r.json()); };
  useEffect(() => {
    let live = true;
    fetch('/api/admin/session', {cache: 'no-store'}).then(async r => {
      if (r.ok) { const u = await r.json() as User; if (live) { setUser(u); void loadUsage(); } }
      else if (r.status !== 401 && live) setError('El servidor no está disponible. Recarga esta página en unos minutos.');
    }).catch(() => { if (live) setError('No se pudo conectar. Revisa tu conexión a internet.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form);
    setBusy(true); setError(''); setNotice(''); setVerificationToken('');
    try {
      // ID and refresh tokens never enter localStorage, sessionStorage, cookies or URLs.
      const identity = await firebaseAuth('accounts:signInWithPassword', {email: values.get('email'), password: values.get('password'), returnSecureToken: true});
      const response = await fetch('/api/admin/session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idToken: identity.idToken, code: values.get('code')})});
      const data = await response.json() as {code?: string; error?: string};
      if (!response.ok) {
        if (data.code === 'EMAIL_VERIFICATION_REQUIRED') setVerificationToken(identity.idToken);
        throw new Error(data.error || 'No se pudo iniciar sesión.');
      }
      form.reset(); window.location.replace('/admin');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function verifyEmail() {
    setBusy(true); setError('');
    try {
      await firebaseAuth('accounts:sendOobCode', {requestType: 'VERIFY_EMAIL', idToken: verificationToken});
      setVerificationToken(''); setNotice('Revisa tu correo, confirma el enlace y vuelve a iniciar sesión.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (loading) return <main className="login-layout"><p role="status">Abriendo tu espacio…</p></main>;
  if (user) return <Workspace name={user.name} email={user.email} logoutAction="/api/admin/logout" usage={usage} onRefreshUsage={() => void loadUsage()}/>;
  return <main className="login-layout"><section className="login-card">
    <a className="wordmark" href="/"><img src="/brand/fambit-mark.png" alt="" width="38" height="38"/><span>FAMBIT</span></a>
    <p className="eyebrow">ADMINISTRACIÓN</p><h1>Tu biblioteca,<br/>en tus manos.</h1>
    <p className="muted">Accede para gestionar las familias y las licencias de tus clientes.</p>
    <form onSubmit={login}>
      <label htmlFor="email">Correo administrativo</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required/>
      <label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required/>
      <label htmlFor="code">Código de tu autenticador</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required/>
      <p className="hint">Introduce el código de seis dígitos de tu aplicación de autenticación.</p>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="hint" role="status">{notice}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Comprobando acceso…' : 'Entrar al panel'}</button>
      {verificationToken && <button className="button secondary" type="button" onClick={() => void verifyEmail()} disabled={busy}>Enviar enlace de verificación</button>}
    </form><a className="back-link" href="/">Volver a FAMBIT</a>
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<Admin/>);
