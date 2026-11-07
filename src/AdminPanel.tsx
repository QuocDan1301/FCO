import { useEffect, useState } from 'react';
import { Coins, Gift, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { money, packs } from './game';
import GiftCodeAdmin from './admin/GiftCodeAdmin';
import Anomalies from './Anomalies';
import { adminCredit, adminLedger } from './wallet';
import type { LedgerRow } from './wallet';
import './admin/pack-admin.css';

// Bảng admin trong game (chỉ hiện với tài khoản trong bảng fco_admins): cộng FC sau khi kiểm tra bill chuyển khoản,
// xem sổ cái FC, quản lý gift code và xem cảnh báo bản lưu bất thường. Máy chủ kiểm tra quyền admin ở mọi thao tác.
type Status = { kind: 'ok' | 'error'; text: string } | null;
const REASONS: Record<string, string> = { admin: 'Admin', daily: 'Quà ngày', shop: 'Mua gói', event: 'Chơi sự kiện', event_jar: 'Hũ sự kiện', jackpot: 'Jackpot', gift: 'Gift code' };
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function CreditFc() {
  const [login, setLogin] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const load = (who = filter) => adminLedger(who.trim()).then(setRows).catch(e => setStatus({ kind: 'error', text: (e as Error).message }));
  useEffect(() => { void load(''); }, []);
  const value = Number(amount.replace(/[.\s]/g, ''));
  const submit = async () => {
    if (!login.trim()) return setStatus({ kind: 'error', text: 'Nhập tên đăng nhập của người chơi.' });
    if (!Number.isSafeInteger(value) || value === 0) return setStatus({ kind: 'error', text: 'Nhập số FC (số âm để trừ).' });
    if (!confirm(`${value > 0 ? 'Cộng' : 'Trừ'} ${money(Math.abs(value))} FC ${value > 0 ? 'cho' : 'của'} ${login.trim()}?`)) return;
    setBusy(true); setStatus(null);
    try {
      const result = await adminCredit(login, value, note.trim());
      setStatus({ kind: 'ok', text: `Đã ${value > 0 ? 'cộng' : 'trừ'} ${money(Math.abs(value))} FC · ${result.login} còn ${money(result.fc)} FC.` });
      setAmount(''); setNote(''); setFilter(result.login); void load(result.login);
    } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return <section className="pa-gift" aria-label="Nạp FC">
    <form className="pa-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <h2 className="pa-gift-title">Cộng FC cho người chơi</h2>
      <p className="pa-gift-note">Kiểm tra bill chuyển khoản (tỷ lệ 2.000 VND = 1.000 FC), rồi nhập tên đăng nhập trong game của người chơi. Số âm để trừ khi cộng nhầm. Mỗi lần cộng / trừ được ghi vào sổ cái.</p>
      {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
      <label className="pa-field"><span>Tên đăng nhập</span><input value={login} onChange={e => setLogin(e.target.value)} placeholder="vd. player_123" autoComplete="off" spellCheck={false}/></label>
      <label className="pa-field"><span>Số FC <small>{Number.isSafeInteger(value) && value ? `= ${money(value)} FC · ${(Math.abs(value) * 2).toLocaleString('vi-VN')} VND` : ''}</small></span><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="vd. 100000"/></label>
      <label className="pa-field"><span>Ghi chú <small>vd. mã giao dịch ngân hàng</small></span><input value={note} onChange={e => setNote(e.target.value)} maxLength={200}/></label>
      <div className="pa-actions"><button type="submit" className="primary-button" disabled={busy}><Coins size={16}/>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button></div>
    </form>
    <div className="pa-gift-list">
      <h2 className="pa-gift-title">Sổ cái FC</h2>
      <form className="pa-row" onSubmit={e => { e.preventDefault(); void load(); }}>
        <label className="pa-field"><span>Lọc theo tài khoản</span><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="để trống = tất cả" spellCheck={false}/></label>
        <button type="submit" className="secondary-button pa-gift-random"><RotateCcw size={15}/>Tải</button>
      </form>
      {rows && !rows.length && <p className="pa-empty">Chưa có giao dịch.</p>}
      {rows?.map((row, i) => <div key={`${row.time}-${i}`} className="pa-gift-item">
        <div><b className={row.delta > 0 ? 'pa-plus' : 'pa-minus'}>{row.delta > 0 ? '+' : '−'}{money(Math.abs(row.delta))} FC · {row.login}</b>
          <small>{REASONS[row.reason] ?? row.reason}{row.note ? ` · ${row.note}` : ''} · còn {money(row.balance)} FC</small><small>{time(row.time)}</small></div>
      </div>)}
    </div>
  </section>;
}

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'fc' | 'gift' | 'audit'>('fc');
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [onClose]);
  return <div className="pack-admin" role="dialog" aria-modal="true" aria-label="Quản trị FC">
    <header className="pa-header">
      <div><h1>Quản trị FC</h1><p>Chỉ tài khoản admin thấy trang này. Mọi thao tác được máy chủ kiểm tra quyền.</p></div>
      <button className="icon-button" onClick={onClose} aria-label="Đóng trang quản trị"><X/></button>
    </header>
    <div className="pa-body">
      <aside className="pa-list" aria-label="Mục quản trị">
        <button className="pa-new pa-gift-nav" onClick={() => setTab('fc')} aria-pressed={tab === 'fc'}><Coins size={16}/>Nạp FC</button>
        <button className="pa-new pa-gift-nav" onClick={() => setTab('gift')} aria-pressed={tab === 'gift'}><Gift size={16}/>Gift code</button>
        <button className="pa-new pa-gift-nav" onClick={() => setTab('audit')} aria-pressed={tab === 'audit'}><ShieldAlert size={16}/>Bất thường</button>
      </aside>
      {tab === 'fc' ? <CreditFc/> : tab === 'audit' ? <Anomalies/> : <GiftCodeAdmin packs={packs.filter(pack => !pack.draft).map(pack => ({ id: pack.id, name: pack.name }))}/>}
    </div>
  </div>;
}
