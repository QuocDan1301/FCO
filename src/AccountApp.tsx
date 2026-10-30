import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import App from './App';
import { accountClient, accountError, saveRemote } from './account-client';
import { CloudSaveStore } from './cloud-save';
import { STORAGE_KEY } from './game';
import { asset } from './asset';
import { clearAccountCache, loginIdentity, registrationIdentity } from './account-identity';
import DeleteAccountDialog from './DeleteAccountDialog';
import { deleteAccount } from './account-deletion';
import './account.css';

function AccountFrame({ children }: { children: ReactNode }) {
  return <main className="account-screen" data-ui="account"><img className="account-background" src={asset('/assets/login-background.png')} alt="" aria-hidden="true"/><div className="account-layout">
    <header className="account-brand"><img src={asset('/assets/fco-vip-logo.png')} alt=""/><strong>FCO VIP</strong><span>Tài khoản huấn luyện viên</span></header>
    <section className="account-intro"><h1>Đội bóng của bạn.<br/> Trên mọi thiết bị.</h1><p>Đăng nhập để tiếp tục hành trình mở thẻ, xây đội hình và nâng cấp cầu thủ.</p><dl><div><dt>Kho cầu thủ riêng</dt><dd>Tài khoản mới bắt đầu với kho cầu thủ trống.</dd></div><div><dt>Tiến trình theo bạn</dt><dd>Kho thẻ, BP, FC và vật phẩm được lưu cùng tài khoản.</dd></div></dl><small>Dự án giả lập của người hâm mộ. Không có thanh toán bằng tiền thật.</small></section>
    <section className="account-panel">{children}</section>
  </div></main>;
}

function AccountForm({ onGuest }: { onGuest: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const configured = !!accountClient;
  const changeMode = (next: typeof mode) => { setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmation(''); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accountClient || submitting.current) return;
    setError(''); setMessage('');
    if (mode === 'register' && password !== confirmation) { setError('Mật khẩu nhập lại chưa khớp.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Hãy nhập tên huấn luyện viên.'); return; }
    submitting.current = true; setBusy(true);
    try {
      if (mode === 'register') {
        const identity = registrationIdentity(username);
        const { data, error } = await accountClient.auth.signUp({ email: identity.email, password, options: { data: { display_name: name.trim(), login_name: identity.name } } });
        if (error) throw error;
        if (!data.session) { setMessage('Chưa mở được tài khoản. Vui lòng liên hệ quản trị game để kiểm tra cấu hình đăng ký.'); setPassword(''); setConfirmation(''); }
      } else {
        const { error } = await accountClient.auth.signInWithPassword({ email: loginIdentity(username), password });
        if (error) throw error;
      }
    } catch (error) { setError(error instanceof Error && !('code' in error) ? error.message : accountError(error)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <AccountFrame><div className="account-tabs" aria-label="Tài khoản"><button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>Đăng nhập</button><button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => changeMode('register')}>Đăng ký</button></div>
    <h2>{mode === 'login' ? 'Trở lại sân cỏ' : 'Tạo tài khoản mới'}</h2><p>{mode === 'login' ? 'Dùng tên đăng nhập và mật khẩu để mở kho thẻ của bạn.' : 'Bắt đầu hành trình với tên huấn luyện viên của bạn.'}</p>
    {!configured && <p className="account-notice" role="status">Máy chủ tài khoản chưa được kết nối. Bạn vẫn có thể chơi bản lưu trên máy này.</p>}
    <form onSubmit={event => void submit(event)} aria-busy={busy}>
      <fieldset disabled={busy || !configured}>
        {mode === 'register' && <label htmlFor="account-name">Tên huấn luyện viên<input id="account-name" name="name" autoComplete="nickname" required maxLength={40} value={name} onChange={e => setName(e.target.value)}/></label>}
        <label htmlFor="account-username">Tên đăng nhập<input id="account-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={mode === 'register' ? 24 : 254} pattern={mode === 'register' ? "[a-zA-Z0-9_]{3,24}" : undefined} value={username} onChange={e => setUsername(e.target.value)} aria-describedby={mode === 'register' ? 'username-hint' : undefined}/></label>{mode === 'register' && <small id="username-hint">3–24 ký tự: chữ a–z, số và dấu gạch dưới. Không cần email.</small>}
        <label htmlFor="account-password">Mật khẩu<span className="account-password"><input id="account-password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : undefined} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} aria-describedby={mode === 'register' ? 'password-hint' : undefined}/><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
        {mode === 'register' && <><small id="password-hint">Dùng ít nhất 8 ký tự.</small><label htmlFor="account-confirmation">Nhập lại mật khẩu<input id="account-confirmation" name="confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label></>}
        <button className="account-primary" type="submit">{busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}<ArrowRight size={18}/></button>
      </fieldset>
      {error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
    </form>
    <button className="account-guest" disabled={busy} onClick={onGuest}>Chơi trên máy này, không đăng nhập</button><p className="account-footnote">Bản chơi trên máy chỉ lưu trong trình duyệt và không đồng bộ với tài khoản.</p>
  </AccountFrame>;
}

function SavedGame({ user, onSignOut, onDeleted }: { user: User; onSignOut: () => Promise<void>; onDeleted: () => void }) {
  const [store, setStore] = useState<CloudSaveStore | null>(null);
  const [revision, render] = useState(0);
  const [generation, remount] = useState(0);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = typeof user.user_metadata.display_name === 'string' ? user.user_metadata.display_name : user.email?.split('@')[0] ?? 'HLV';
  useEffect(() => {
    const next = new CloudSaveStore(`${STORAGE_KEY}:account:${user.id}`, saveRemote(user.id), localStorage);
    const unsubscribe = next.subscribe(() => render(value => value + 1));
    setStore(next);
    void next.initialize().catch(() => {});
    const refresh = () => { if (document.visibilityState === 'visible') void next.refresh(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (next.status !== 'saved') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { next.dispose(); unsubscribe(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('beforeunload', beforeUnload); };
  }, [user.id]);
  void revision;
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setError('');
    try { if (store) await store.flush(); await onSignOut(); }
    catch { setError('Chưa đăng xuất được. Hãy đồng bộ tiến trình và kiểm tra kết nối rồi thử lại.'); }
    finally { setSigningOut(false); }
  }
  async function removeAccount(password: string) {
    const client = accountClient;
    if (!client || !user.email) throw new Error('Không đọc được tài khoản. Hãy đăng nhập lại.');
    await deleteAccount({
      async authenticate(value) {
        const { data, error } = await client.auth.signInWithPassword({ email: user.email!, password: value });
        if (error) throw new Error(accountError(error));
        return data.user.id;
      },
      async remove() {
        const { data, error } = await client.rpc('fco_delete_account').abortSignal(AbortSignal.timeout(20000));
        if (error?.message.includes('FCO_REAUTH_REQUIRED')) throw new Error('Hãy nhập lại mật khẩu để xác nhận xóa tài khoản.');
        if (error) throw new Error('Chưa xóa được tài khoản. Kiểm tra kết nối rồi thử lại.');
        return data?.deleted === true;
      },
    }, user.id, password);
    store?.dispose();
    try { clearAccountCache(localStorage, `${STORAGE_KEY}:account:${user.id}`); } catch { /* The server account has already been deleted. */ }
    try { await client.auth.signOut({ scope: 'local' }); } finally { onDeleted(); }
  }
  const deleteDialog = deleteOpen && <DeleteAccountDialog name={name} onClose={() => setDeleteOpen(false)} onDelete={removeAccount}/>;
  function backup() {
    if (!store) return;
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([store.backup()], { type: 'application/json' }));
    link.href = url; link.download = `fco-save-${user.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const blocked = !store || ['loading', 'error', 'conflict'].includes(store.status);
  if (blocked) return <>{deleteDialog}<AccountFrame><h2>{store?.status === 'conflict' ? 'Có hai bản tiến trình' : store?.status === 'error' ? 'Chưa kết nối được' : 'Đang tải kho thẻ…'}</h2><p>{store?.error || 'Đang lấy dữ liệu mới nhất của tài khoản. Vui lòng chờ.'}</p>{store && store.status !== 'loading' && <div className="account-recovery"><button className="account-primary" onClick={() => void store.initialize().catch(() => {})}>Thử đồng bộ lại</button><button onClick={backup}>Tải bản sao trên máy này</button>{store.status === 'conflict' && <><p>Nạp bản máy chủ sẽ thay tiến trình đang mở. Bản trên máy này được giữ thêm trong bản sao lưu.</p><button onClick={() => void store.useCloudCopy().then(() => remount(value => value + 1)).catch(error => setError((error as Error).message))}>Nạp bản mới từ máy chủ</button></>}</div>}{error && <p role="alert" className="account-error">{error}</p>}<button className="account-guest" onClick={() => void onSignOut().catch(() => setError('Không đăng xuất được. Hãy thử lại.'))}>Đăng xuất, giữ bản lưu trên máy</button><button className="account-guest account-delete-link" onClick={() => setDeleteOpen(true)}>Xóa tài khoản</button></AccountFrame></>;
  return <>{deleteDialog}<App key={`${user.id}:${generation}`} storage={store} storageKey={store.key} accountName={name} syncStatus={store.status === 'saving' ? 'Đang đồng bộ…' : 'Đã đồng bộ'} onLogout={() => void signOut()} signingOut={signingOut} onDeleteAccount={() => setDeleteOpen(true)}/>{error && <div className="account-floating-error" role="alert">{error}<button onClick={() => setError('')}>Đóng</button></div>}</>;
}

export default function AccountApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!accountClient);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const client = accountClient;
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setLoading(false); if (session?.user) setGuest(false); }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(accountError(error));
      setUser(data.session?.user ?? null); setLoading(false);
    }).catch(() => { if (active) { setError('Không đọc được phiên đăng nhập. Hãy tải lại trang.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  if (loading) return <AccountFrame><h2>Đang kiểm tra đăng nhập…</h2><p>Vui lòng chờ trong giây lát.</p></AccountFrame>;
  if (user) return <SavedGame user={user} onDeleted={() => { setUser(null); setGuest(false); setError('Đã xóa tài khoản và tiến trình trên máy chủ.'); }} onSignOut={async () => { const result = await accountClient!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }}/ >;
  if (guest) return <App accountName="Khách" syncStatus="Chỉ lưu trên máy này" onLogout={() => setGuest(false)}/>;
  return <>{error && <div className="account-floating-error" role="alert">{error}</div>}<AccountForm onGuest={() => setGuest(true)}/></>;
}
