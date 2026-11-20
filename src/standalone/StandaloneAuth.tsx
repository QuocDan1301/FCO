import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { accountClient, accountError } from '../account-client';
import { loginIdentity } from '../account-identity';

// Đăng nhập cho trang riêng (nap.html, quan-ly-nap.html). Cùng tên miền với game nên đã đăng nhập trong game là vào thẳng
// (dùng chung phiên Supabase lưu trên trình duyệt). Người dùng tự gõ tài khoản / mật khẩu của mình.
export default function StandaloneAuth({ title, note, children }: { title: string; note: string; children: (session: Session, logout: ReactNode) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accountClient) { setSession(null); return; }
    void accountClient.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = accountClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!accountClient) return <div className="sa-page"><div className="sa-card"><h1>{title}</h1><p className="sa-error">Chưa cấu hình máy chủ.</p></div></div>;
  if (session === undefined) return <div className="sa-page"><div className="sa-card"><p>Đang tải…</p></div></div>;
  const logout = <button type="button" className="sa-logout" onClick={() => void accountClient!.auth.signOut()}><LogOut size={15}/>Đăng xuất</button>;
  if (session) return <>{children(session, logout)}</>;
  const login = async () => {
    setBusy(true); setError('');
    try {
      const { error: e } = await accountClient!.auth.signInWithPassword({ email: loginIdentity(identifier), password });
      if (e) setError(accountError(e));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="sa-page"><form className="sa-card sa-login" onSubmit={e => { e.preventDefault(); void login(); }}>
    <h1>{title}</h1><p>{note}</p>
    <label><span>Gmail hoặc tên đăng nhập</span><input value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" spellCheck={false}/></label>
    <label><span>Mật khẩu</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/></label>
    {error && <p className="sa-error" role="alert">{error}</p>}
    <button type="submit" className="primary-button" disabled={busy || !identifier.trim() || !password}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
  </form></div>;
}
