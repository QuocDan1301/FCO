import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import App from './App';
import { accountClient, accountError, saveRemote } from './account-client';
import { CloudSaveStore } from './cloud-save';
import { STORAGE_KEY } from './game';
import { asset } from './asset';
import { clearAccountCache, loginIdentity, normalizeGmail } from './account-identity';
import DeleteAccountDialog from './DeleteAccountDialog';
import { deleteAccount } from './account-deletion';
import { useMaintenance } from './maintenance';
import { ACCOUNT_PAUSED_MESSAGE, maintenanceBlocks, maintenanceText } from './maintenance-state';
import type { MaintenanceState } from './maintenance-state';
import ZaloIcon from './ZaloIcon';
import { ZALO_GROUP } from './config';
import './account.css';

function AccountFrame({ children }: { children: ReactNode }) {
  return <main className="account-screen" data-ui="account"><img className="account-background" src={asset('/assets/login-background.png')} alt="" aria-hidden="true"/><div className="account-layout">
    <header className="account-brand"><img src={asset('/assets/fco-vip-logo.png')} alt=""/><strong>FCO VIP</strong><span>Tài khoản huấn luyện viên</span>
      {/* Nhóm Zalo cộng đồng (người dùng 2026-11-14): hỏi đáp / hỗ trợ khi chưa vào được game, vd. không nhận được mã Gmail. */}
      <a className="account-zalo" href={ZALO_GROUP} target="_blank" rel="noopener noreferrer" aria-label="Nhóm Zalo cộng đồng" title="Tham gia nhóm Zalo"><ZaloIcon size={30}/><span>Nhóm Zalo</span></a></header>
    <section className="account-intro"><h1>Đội bóng của bạn.<br/> Trên mọi thiết bị.</h1><p>Đăng nhập để tiếp tục hành trình mở thẻ, xây đội hình và nâng cấp cầu thủ.</p><dl><div><dt>Kho cầu thủ riêng</dt><dd>Tài khoản mới bắt đầu với kho cầu thủ trống.</dd></div><div><dt>Tiến trình theo bạn</dt><dd>Kho thẻ, BP, FC và vật phẩm được lưu cùng tài khoản.</dd></div></dl><small>Dự án giả lập của người hâm mộ. Không có thanh toán bằng tiền thật.</small></section>
    <section className="account-panel">{children}</section>
  </div></main>;
}

// Đăng nhập / đăng ký bằng Gmail + mã xác nhận 6 số / quên mật khẩu (2026-11-11, migration 202611110016).
// Tài khoản cũ vẫn đăng nhập bằng tên đăng nhập. Mã do Supabase gửi qua SMTP riêng (mẫu email có {{ .Token }}).
type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const RESEND_SECONDS = 60;

function AccountForm({ maintenance, onHold }: { maintenance: MaintenanceState | null; onHold: (hold: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [gmail, setGmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const submitting = useRef(false);
  const configured = !!accountClient;
  // Bảo trì: chỉ còn đăng nhập (admin vẫn phải vào được để tắt), không mở đăng ký.
  const closed = !!maintenance?.enabled;
  useEffect(() => { if (closed && mode !== 'login') { setMode('login'); setError(''); setMessage(''); } }, [closed]);
  useEffect(() => { if (cooldown <= 0) return; const t = window.setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const changeMode = (next: Mode) => { setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmation(''); setCode(''); };
  const sentTo = (email: string, next: Mode, text: string) => { setGmail(email); setMode(next); setCode(''); setCooldown(RESEND_SECONDS); setMessage(text); setError(''); };

  async function run(task: () => Promise<void>) {
    if (!accountClient || submitting.current) return;
    setError(''); setMessage('');
    submitting.current = true; setBusy(true);
    try { await task(); }
    catch (error) { setError(error instanceof Error && !('code' in error) ? error.message : accountError(error)); }
    finally { submitting.current = false; setBusy(false); }
  }
  const client = () => accountClient!;

  const login = () => run(async () => {
    const email = loginIdentity(identifier);
    const { error } = await client().auth.signInWithPassword({ email, password });
    // Gmail chưa nhập mã xác nhận: chuyển sang ô nhập mã, KHÔNG tự gửi mã mới (mã mới làm mã trong mail mất hiệu lực).
    if (error && ((error as { code?: string }).code === 'email_not_confirmed' || /email not confirmed/i.test(error.message))) {
      setGmail(email); setMode('verify'); setCode(''); setCooldown(0); setError('');
      setMessage(`Gmail ${email} chưa xác nhận. Nhập mã 6 số trong mail mới nhất (xem cả Spam / Quảng cáo), hoặc bấm "Gửi lại mã".`);
      return;
    }
    if (error) throw error;
  });

  const register = () => run(async () => {
    if (!name.trim()) throw new Error('Hãy nhập tên huấn luyện viên.');
    const email = normalizeGmail(gmail);
    if (password !== confirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
    const { data, error } = await client().auth.signUp({ email, password, options: { data: { display_name: name.trim().slice(0, 40) } } });
    if (error) throw error;
    if (data.session) return; // Máy chủ chưa bật xác nhận email: vào game luôn.
    // Gmail đã có tài khoản (Supabase không báo lỗi để chống dò email): identities rỗng.
    // Gmail đã đăng ký trước đó (Supabase không nói rõ đã xác nhận hay chưa): gửi lại mã và mở ô nhập mã cho trường hợp chưa xác nhận.
    if (data.user && data.user.identities?.length === 0) {
      const again = await client().auth.resend({ type: 'signup', email });
      if (again.error) throw new Error('Gmail này đã có tài khoản. Hãy đăng nhập, hoặc dùng "Quên mật khẩu".');
      sentTo(email, 'verify', `Gmail này đã đăng ký nhưng chưa xác nhận. Đã gửi lại mã 6 số tới ${email}. Nếu bạn đã xác nhận rồi, hãy bấm "Quay lại đăng nhập".`);
      return;
    }
    sentTo(email, 'verify', `Đã gửi mã 6 số tới ${email}. Mở Gmail (xem cả mục Spam / Quảng cáo) và nhập mã để hoàn tất.`);
  });

  const verify = () => run(async () => {
    const { error } = await client().auth.verifyOtp({ email: normalizeGmail(gmail), token: code.trim(), type: 'signup' });
    if (error) throw error;
  });

  const forgot = () => run(async () => {
    const email = normalizeGmail(gmail);
    const { error } = await client().auth.resetPasswordForEmail(email);
    if (error) throw error;
    sentTo(email, 'reset', `Nếu ${email} có tài khoản, mã 6 số đã được gửi tới Gmail đó.`);
  });

  // Đặt lại mật khẩu: nhập mã (đăng nhập tạm) rồi đổi mật khẩu; giữ màn này tới khi đổi xong mới vào game.
  const reset = () => run(async () => {
    if (password !== confirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
    if (password.length < 8) throw new Error('Mật khẩu mới cần ít nhất 8 ký tự.');
    onHold(true);
    try {
      const { error } = await client().auth.verifyOtp({ email: gmail, token: code.trim(), type: 'recovery' });
      if (error) throw error;
      const updated = await client().auth.updateUser({ password });
      if (updated.error) { await client().auth.signOut({ scope: 'local' }); throw updated.error; }
    } finally { onHold(false); }
  });

  const resend = () => run(async () => {
    const email = normalizeGmail(gmail);
    const { error } = mode === 'reset' ? await client().auth.resetPasswordForEmail(email) : await client().auth.resend({ type: 'signup', email });
    if (error) throw error;
    setGmail(email); setCooldown(RESEND_SECONDS); setMessage(`Đã gửi lại mã tới ${email}. Chỉ mã trong mail MỚI NHẤT dùng được.`);
  });

  const submit = (event: FormEvent) => { event.preventDefault(); void ({ login, register, verify, forgot, reset }[mode])(); };
  const passwordField = (label: string, auto: string, id = 'account-password') => <label htmlFor={id}>{label}<span className="account-password"><input id={id} name="password" type={visible ? 'text' : 'password'} autoComplete={auto} minLength={mode === 'login' ? undefined : 8} maxLength={72} required value={password} onChange={e => setPassword(e.target.value)}/><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>;
  const confirmField = <label htmlFor="account-confirmation">Nhập lại mật khẩu<input id="account-confirmation" name="confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>;
  const codeField = <label htmlFor="account-code">Mã xác nhận (6 số)<input id="account-code" className="account-code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,10}" maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}/></label>;
  const gmailField = <label htmlFor="account-gmail">Gmail<input id="account-gmail" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="tenban@gmail.com" value={gmail} onChange={e => setGmail(e.target.value)}/></label>;
  const titles: Record<Mode, [string, string]> = {
    login: ['Trở lại sân cỏ', 'Đăng nhập bằng Gmail. Tài khoản cũ vẫn dùng tên đăng nhập như trước.'],
    register: ['Tạo tài khoản mới', 'Đăng ký bằng Gmail. Mã xác nhận 6 số sẽ được gửi về Gmail của bạn.'],
    verify: ['Xác nhận Gmail', 'Nhập mã 6 số trong mail gửi tới Gmail để mở tài khoản.'],
    forgot: ['Quên mật khẩu', 'Nhập Gmail đã đăng ký để nhận mã đặt lại mật khẩu.'],
    reset: ['Đặt mật khẩu mới', 'Nhập mã 6 số trong Gmail và mật khẩu mới.'],
  };
  const button: Record<Mode, string> = { login: 'Đăng nhập', register: 'Tạo tài khoản', verify: 'Xác nhận', forgot: 'Gửi mã', reset: 'Đổi mật khẩu' };
  return <AccountFrame><div className="account-tabs" aria-label="Tài khoản"><button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => changeMode('login')}>Đăng nhập</button>{!closed && <button type="button" aria-pressed={mode === 'register' || mode === 'verify'} disabled={busy} onClick={() => changeMode('register')}>Đăng ký</button>}</div>
    <h2>{titles[mode][0]}</h2><p>{titles[mode][1]}</p>
    {closed && <p className="account-maintenance" role="status"><b>Game đang bảo trì</b>{maintenanceText(maintenance)}</p>}
    {!configured && <p className="account-notice" role="status">Máy chủ tài khoản chưa được kết nối. Hãy thử lại sau.</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || !configured}>
        {mode === 'login' && <><label htmlFor="account-username">Gmail hoặc tên đăng nhập<input id="account-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={254} value={identifier} onChange={e => setIdentifier(e.target.value)}/></label>{passwordField('Mật khẩu', 'current-password')}</>}
        {mode === 'register' && <><label htmlFor="account-name">Tên huấn luyện viên<input id="account-name" name="name" autoComplete="nickname" required maxLength={40} value={name} onChange={e => setName(e.target.value)}/></label>{gmailField}<small>Chỉ nhận địa chỉ @gmail.com. Mỗi Gmail một tài khoản.</small>{passwordField('Mật khẩu', 'new-password')}<small>Dùng ít nhất 8 ký tự.</small>{confirmField}</>}
        {mode === 'verify' && <>{gmailField}{codeField}</>}
        {mode === 'forgot' && gmailField}
        {mode === 'reset' && <>{codeField}{passwordField('Mật khẩu mới', 'new-password')}{confirmField}</>}
        <button className="account-primary" type="submit">{busy ? 'Đang xử lý…' : button[mode]}<ArrowRight size={18}/></button>
        {(mode === 'verify' || mode === 'reset') && <button type="button" className="account-guest" disabled={busy || cooldown > 0 || !gmail.trim()} onClick={() => void resend()}>{cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : 'Gửi lại mã'}</button>}
        {mode === 'login' && <button type="button" className="account-guest" disabled={busy} onClick={() => { changeMode('forgot'); if (identifier.includes('@')) setGmail(identifier); }}>Quên mật khẩu?</button>}
        {/* Đã đăng ký nhưng lỡ đóng màn nhập mã: vào thẳng ô nhập mã (không gửi mã mới). */}
        {(mode === 'login' || mode === 'register') && !closed && <button type="button" className="account-guest" disabled={busy} onClick={() => { const g = mode === 'login' && identifier.includes('@') ? identifier : gmail; changeMode('verify'); setGmail(g); setMessage('Nhập Gmail đã đăng ký và mã 6 số trong mail mới nhất. Chưa có mã thì bấm "Gửi lại mã".'); }}>Đã đăng ký? Nhập mã xác nhận</button>}
        {(mode === 'forgot' || mode === 'reset' || mode === 'verify') && <button type="button" className="account-guest" disabled={busy} onClick={() => changeMode('login')}>Quay lại đăng nhập</button>}
      </fieldset>
      {error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
    </form>
    {mode === 'forgot' && <p className="account-footnote">Tài khoản cũ đăng ký bằng tên đăng nhập (chưa liên kết Gmail): liên hệ quản trị game để đặt lại mật khẩu.</p>}
  </AccountFrame>;
}

function SavedGame({ user, maintenance, onSignOut, onDeleted }: { user: User; maintenance: MaintenanceState | null; onSignOut: () => Promise<void>; onDeleted: () => void }) {
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
    const timer = window.setInterval(refresh, 30000);
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
  // Tài khoản bị admin tạm dừng: popup chặn, game không chạy phía sau (hết nhạc, hết gửi lên máy chủ); bỏ tạm dừng thì tự mở lại.
  if (maintenance?.paused) return <main className="account-screen account-paused-screen" data-ui="account"><img className="account-background" src={asset('/assets/login-background.png')} alt="" aria-hidden="true"/><div className="account-paused" role="alertdialog" aria-modal="true" aria-labelledby="account-paused-title"><h2 id="account-paused-title">{ACCOUNT_PAUSED_MESSAGE}</h2>{error && <p role="alert" className="account-error">{error}</p>}<button className="account-guest" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div></main>;
  // Màn bảo trì nằm trong SavedGame để bản lưu vẫn đồng bộ nốt phần vừa chơi; hết bảo trì thì game tự mở lại từ bản lưu.
  if (maintenanceBlocks(maintenance)) return <AccountFrame><h2>Game đang bảo trì</h2><p>{maintenanceText(maintenance)}</p><p className="account-maintenance-note">Tiến trình của bạn vẫn được giữ. Game sẽ tự mở lại khi bảo trì xong, không cần tải lại trang.</p>{error && <p role="alert" className="account-error">{error}</p>}<button className="account-guest" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></AccountFrame>;
  // Lỗi kết nối khi đã có dữ liệu: vẫn chơi tiếp (lưu trên máy, tự gửi lại), chỉ chặn khi chưa tải được lần đầu hoặc xung đột hai máy.
  const blocked = !store || store.status === 'loading' || store.status === 'conflict' || (store.status === 'error' && !store.ready);
  if (blocked) return <>{deleteDialog}<AccountFrame><h2>{store?.status === 'conflict' ? 'Có hai bản tiến trình' : store?.status === 'error' ? 'Chưa kết nối được' : 'Đang tải kho thẻ…'}</h2><p>{store?.error || 'Đang lấy dữ liệu mới nhất của tài khoản. Vui lòng chờ.'}</p>{store && store.status !== 'loading' && <div className="account-recovery"><button className="account-primary" onClick={() => void store.initialize().catch(() => {})}>Thử đồng bộ lại</button><button onClick={backup}>Tải bản sao trên máy này</button>{store.status === 'conflict' && <><p>Nạp bản máy chủ sẽ thay tiến trình đang mở. Bản trên máy này được giữ thêm trong bản sao lưu.</p><button onClick={() => void store.useCloudCopy().then(() => remount(value => value + 1)).catch(error => setError((error as Error).message))}>Nạp bản mới từ máy chủ</button></>}</div>}{error && <p role="alert" className="account-error">{error}</p>}<button className="account-guest" onClick={() => void onSignOut().catch(() => setError('Không đăng xuất được. Hãy thử lại.'))}>Đăng xuất, giữ bản lưu trên máy</button><button className="account-guest account-delete-link" onClick={() => setDeleteOpen(true)}>Xóa tài khoản</button></AccountFrame></>;
  return <>{deleteDialog}<App key={`${user.id}:${generation}`} online storage={store} storageKey={store.key} accountName={name} accountEmail={user.email ?? null} joined={Date.parse(user.created_at) || null} syncStatus={store.status === 'saving' ? 'Đang đồng bộ…' : store.status === 'error' ? 'Mất kết nối · đang thử lại' : 'Đã đồng bộ'} onLogout={() => void signOut()} signingOut={signingOut} onDeleteAccount={() => setDeleteOpen(true)}/>{maintenance?.enabled && <div className="maintenance-badge" role="status">Đang bảo trì · chỉ admin vào được</div>}{error && <div className="account-floating-error" role="alert">{error}<button onClick={() => setError('')}>Đóng</button></div>}</>;
}

export default function AccountApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!accountClient);
  const [error, setError] = useState('');
  const { state: maintenance, checked } = useMaintenance(user?.id ?? null);
  // Đặt lại mật khẩu: nhập mã làm phát sinh phiên đăng nhập trước khi kịp đổi mật khẩu; giữ màn đăng nhập tới khi đổi xong.
  const hold = useRef(false);
  const held = useRef<User | null | undefined>(undefined);
  const holdSession = (value: boolean) => {
    hold.current = value;
    if (!value && held.current !== undefined) { const next = held.current; held.current = undefined; setUser(next); }
  };
  useEffect(() => {
    const client = accountClient;
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (hold.current) { held.current = session?.user ?? null; return; }
      setUser(session?.user ?? null); setLoading(false);
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(accountError(error));
      setUser(data.session?.user ?? null); setLoading(false);
    }).catch(() => { if (active) { setError('Không đọc được phiên đăng nhập. Hãy tải lại trang.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  if (loading) return <AccountFrame><h2>Đang kiểm tra đăng nhập…</h2><p>Vui lòng chờ trong giây lát.</p></AccountFrame>;
  // Chờ kiểm tra bảo trì xong mới mở game (tối đa vài giây; lỗi thì vẫn mở), kẻo người chơi thấy game lóe lên rồi bị đưa ra.
  if (user && !checked) return <AccountFrame><h2>Đang kiểm tra đăng nhập…</h2><p>Vui lòng chờ trong giây lát.</p></AccountFrame>;
  if (user) return <SavedGame user={user} maintenance={maintenance} onDeleted={() => { setUser(null); setError('Đã xóa tài khoản và tiến trình trên máy chủ.'); }} onSignOut={async () => { const result = await accountClient!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }}/ >;
  // Không còn chế độ khách (2026-11-07): phải đăng nhập mới vào game.
  return <>{error && <div className="account-floating-error" role="alert">{error}</div>}<AccountForm maintenance={maintenance} onHold={holdSession}/></>;
}
