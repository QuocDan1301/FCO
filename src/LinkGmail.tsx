import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { accountClient, accountError } from './account-client';
import { isLegacyEmail, normalizeGmail } from './account-identity';

// Tài khoản cũ (tên đăng nhập, email giả @players.fco.invalid) liên kết Gmail để tự đặt lại mật khẩu (migration 202611110016).
// Supabase gửi mã 6 số tới Gmail mới (mẫu "Change Email Address" có {{ .Token }}); cần TẮT "Secure email change" vì email cũ là giả.
// Sau khi liên kết vẫn đăng nhập được bằng Gmail; tên đăng nhập cũ thôi dùng.
export default function LinkGmail({ email }: { email: string | null | undefined }) {
  const [gmail, setGmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = window.setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  if (!accountClient || (!isLegacyEmail(email) && !done)) return null;
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error && !('code' in e) ? e.message : accountError(e)); } finally { setBusy(false); }
  };
  const send = () => run(async () => {
    const target = normalizeGmail(gmail);
    const { error } = await accountClient!.auth.updateUser({ email: target });
    if (error) throw error;
    setSent(target); setCode(''); setCooldown(60);
  });
  const confirm = () => run(async () => {
    const { error } = await accountClient!.auth.verifyOtp({ email: sent, token: code.trim(), type: 'email_change' });
    if (error) throw error;
    setDone(sent); setSent('');
  });
  if (done) return <section className="profile-link-gmail is-done"><Mail size={15}/>Đã liên kết <b>{done}</b>. Từ giờ đăng nhập bằng Gmail này và tự đặt lại mật khẩu khi quên.</section>;
  return <section className="profile-link-gmail" aria-label="Liên kết Gmail">
    <h3><Mail size={15}/>Liên kết Gmail</h3>
    <p>Tài khoản đang dùng tên đăng nhập. Liên kết Gmail để tự đặt lại mật khẩu khi quên. Sau khi liên kết, đăng nhập bằng Gmail.</p>
    {!sent ? <form onSubmit={e => { e.preventDefault(); void send(); }}>
      <input type="email" autoComplete="email" placeholder="tenban@gmail.com" value={gmail} maxLength={254} onChange={e => setGmail(e.target.value)} aria-label="Gmail cần liên kết"/>
      <button type="submit" className="primary-button" disabled={busy || !gmail.trim()}>Gửi mã</button>
    </form> : <form onSubmit={e => { e.preventDefault(); void confirm(); }}>
      <input inputMode="numeric" autoComplete="one-time-code" placeholder="Mã 6 số" value={code} maxLength={10} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label={`Mã gửi tới ${sent}`}/>
      <button type="submit" className="primary-button" disabled={busy || code.length < 6}>Xác nhận</button>
      <button type="button" className="secondary-button" disabled={busy || cooldown > 0} onClick={() => void send()}>{cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại'}</button>
    </form>}
    {sent && <small>Đã gửi mã tới {sent} (xem cả mục Spam).</small>}
    {error && <p className="profile-link-error" role="alert">{error}</p>}
  </section>;
}
