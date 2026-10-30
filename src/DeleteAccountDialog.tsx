import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

export default function DeleteAccountDialog({ name, onClose, onDelete }: { name: string; onClose: () => void; onDelete: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !running.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
      if (!items.length) { event.preventDefault(); panel.current?.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running.current || confirmation.trim().toUpperCase() !== 'XOA' || !password) return;
    running.current = true; setBusy(true); setError('');
    try { await onDelete(password); }
    catch (error) { setError(error instanceof Error ? error.message : 'Chưa xóa được tài khoản. Hãy thử lại.'); setPassword(''); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="delete-account-backdrop"><div ref={panel} className="delete-account-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" tabIndex={-1}>
    <h2 id="delete-account-title">Xóa tài khoản?</h2><p id="delete-account-description">Tài khoản <strong>{name}</strong> và toàn bộ kho cầu thủ, BP, FC, vật phẩm, đội hình, lịch sử sẽ bị xóa vĩnh viễn. Bạn không thể khôi phục sau khi xác nhận.</p>
    <form onSubmit={event => void submit(event)} aria-busy={busy}><fieldset disabled={busy}>
      <label htmlFor="delete-password">Mật khẩu hiện tại<input id="delete-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></label>
      <label htmlFor="delete-confirmation">Nhập XOA để xác nhận<input id="delete-confirmation" autoComplete="off" spellCheck={false} required value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>
    </fieldset>{error && <p className="delete-account-error" role="alert">{error}</p>}<div className="delete-account-actions"><button type="button" disabled={busy} onClick={onClose}>Giữ tài khoản</button><button className="delete-account-confirm" type="submit" disabled={busy || !password || confirmation.trim().toUpperCase() !== 'XOA'}>{busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}</button></div></form>
  </div></div>;
}
