import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { RenameInfo } from './wallet';

// Đổi tên HLV (bảng Thông tin HLV, migration 202611160004): lần đầu miễn phí, sau đó 100 FC; 7 ngày đổi 1 lần; không trùng tên người khác.
// Máy chủ kiểm tra lại mọi điều kiện; ở đây chỉ báo sớm lỗi độ dài / ký tự cho người chơi.
export const RENAME_MIN = 3, RENAME_MAX = 24;
const BAD_CHARS = /[\u0000-\u001f<>"'`\\/@#$%^&*(){}[\]|;:=+~?!,]/;
export function renameProblem(raw: string, current: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if ([...name].length < RENAME_MIN || [...name].length > RENAME_MAX) return `Tên HLV cần từ ${RENAME_MIN} đến ${RENAME_MAX} ký tự.`;
  if (BAD_CHARS.test(name)) return 'Tên HLV chỉ dùng chữ, số, dấu cách, dấu chấm, gạch ngang và gạch dưới.';
  if (name === current) return 'Tên mới giống tên hiện tại.';
  return null;
}
const when = (ms: number) => new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

export default function RenameCoach({ current, load, onRename, onClose }: { current: string; load: () => Promise<RenameInfo>; onRename: (name: string) => Promise<boolean>; onClose: () => void }) {
  const [info, setInfo] = useState<RenameInfo | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; load().then(i => { if (alive) setInfo(i); }).catch(e => { if (alive) setError((e as Error).message); }); return () => { alive = false; }; }, [load]);
  const waiting = info?.nextAt && info.nextAt > info.now ? info.nextAt : null;
  const problem = name.trim() ? renameProblem(name, current) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !info || waiting || problem) return;
    const clean = name.trim().replace(/\s+/g, ' ');
    if (info.cost > 0 && !confirm(`Đổi tên thành "${clean}" với giá ${info.cost} FC?`)) return;
    setBusy(true);
    try { if (await onRename(clean)) onClose(); } finally { setBusy(false); }
  };
  return <form className="profile-rename" onSubmit={e => void submit(e)}>
    <label htmlFor="profile-rename-input">Tên HLV mới<small>{RENAME_MIN}–{RENAME_MAX} ký tự, không trùng HLV khác</small></label>
    <div className="profile-rename-row">
      <input id="profile-rename-input" value={name} placeholder={current} maxLength={RENAME_MAX + 8} autoFocus disabled={busy || !!waiting} onChange={e => setName(e.target.value)} aria-invalid={!!problem}/>
      <button type="submit" className="primary-button" disabled={busy || !info || !!waiting || !!problem || !name.trim()}><Check size={15}/>{info && info.cost > 0 ? `Đổi (${info.cost} FC)` : 'Đổi tên'}</button>
      <button type="button" className="secondary-button" onClick={onClose} aria-label="Huỷ đổi tên"><X size={15}/></button>
    </div>
    <p className={`profile-rename-note${problem || error ? ' is-error' : ''}`} role={problem || error ? 'alert' : undefined}>
      {error || problem || (!info ? 'Đang tải…' : waiting ? `Mỗi 7 ngày đổi tên 1 lần. Đổi lại được từ ${when(waiting)}.`
        : info.cost === 0 ? 'Lần đổi tên đầu tiên miễn phí. Các lần sau 100 FC, mỗi 7 ngày 1 lần.' : `Phí đổi tên ${info.cost} FC. Mỗi 7 ngày đổi 1 lần.`)}
    </p>
  </form>;
}
