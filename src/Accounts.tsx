import { Fragment, useEffect, useRef, useState } from 'react';
import { Coins, Lock, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { money } from './game';
import { ago, hours, vnd } from './Stats';
import { adminAccountDelete, adminAccountLock, adminAccounts, adminCredit, adminLedger, LEDGER_REASONS } from './wallet';
import type { AdminAccount, AdminAccountList, LedgerRow } from './wallet';

// Quản lý tài khoản (supabase/migrations/202611080008_fco_admin_accounts.sql): mọi tài khoản đã đăng ký, cộng / trừ FC, sổ cái, khoá, xoá.
// Máy chủ kiểm tra quyền ở mọi thao tác và không cho khoá / xoá tài khoản admin.
const PAGE_SIZE = 50;
type Sort = 'new' | 'active' | 'topup' | 'fc';
const SORTS: { id: Sort; label: string }[] = [{ id: 'new', label: 'Mới đăng ký' }, { id: 'active', label: 'Mới vào game' }, { id: 'topup', label: 'Nạp nhiều' }, { id: 'fc', label: 'FC nhiều' }];
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function ManageAccount({ account, onChanged, onDeleted }: { account: AdminAccount; onChanged: () => void; onDeleted: (login: string) => void }) {
  const { login } = account;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const value = Number(amount.replace(/[.\s]/g, ''));
  const loadLedger = () => adminLedger(login).then(rows => setLedger(rows.slice(0, 10))).catch(e => setStatus({ kind: 'error', text: (e as Error).message }));
  useEffect(() => { void loadLedger(); }, [login]);
  const run = async (task: () => Promise<string>) => {
    setBusy(true); setStatus(null);
    try { const text = await task(); setStatus({ kind: 'ok', text }); onChanged(); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const credit = () => {
    if (!Number.isSafeInteger(value) || value === 0) return setStatus({ kind: 'error', text: 'Nhập số FC (số âm để trừ).' });
    if (!confirm(`${value > 0 ? 'Cộng' : 'Trừ'} ${money(Math.abs(value))} FC ${value > 0 ? 'cho' : 'của'} ${login}?`)) return;
    void run(async () => {
      const result = await adminCredit(login, value, note.trim());
      setAmount(''); setNote(''); void loadLedger();
      return `Đã ${value > 0 ? 'cộng' : 'trừ'} ${money(Math.abs(value))} FC · ${login} còn ${money(result.fc)} FC.`;
    });
  };
  const lock = () => {
    if (!account.locked && !confirm(`Khoá ${login}? Người chơi bị đăng xuất và không vào game được cho tới khi mở khoá. Dữ liệu được giữ nguyên.`)) return;
    void run(async () => { await adminAccountLock(account.id, !account.locked); return account.locked ? `Đã mở khoá ${login}.` : `Đã khoá ${login}.`; });
  };
  const remove = async () => {
    setBusy(true); setStatus(null);
    try { await adminAccountDelete(account.id); onDeleted(login); }
    catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); setBusy(false); }
  };
  return <div className="pa-account-manage">
    {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    <div className="pa-account-columns">
      <form onSubmit={e => { e.preventDefault(); credit(); }}>
        <h3>Cộng / trừ FC</h3>
        <label className="pa-field"><span>Số FC <small>{Number.isSafeInteger(value) && value ? `${value > 0 ? '+' : '−'}${money(Math.abs(value))} FC` : 'số âm để trừ'}</small></span><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="vd. 100000" autoComplete="off"/></label>
        <label className="pa-field"><span>Ghi chú <small>vd. mã giao dịch ngân hàng</small></span><input value={note} onChange={e => setNote(e.target.value)} maxLength={200}/></label>
        <button type="submit" className="primary-button" disabled={busy}><Coins size={16}/>Xác nhận</button>
      </form>
      <div className="pa-account-ledger">
        <h3>Sổ cái FC gần đây</h3>
        {ledger && !ledger.length && <p className="pa-empty">Chưa có giao dịch.</p>}
        {ledger?.map((row, i) => <p key={`${row.time}-${i}`}><b className={row.delta > 0 ? 'pa-plus' : 'pa-minus'}>{row.delta > 0 ? '+' : '−'}{money(Math.abs(row.delta))} FC</b> <small>{LEDGER_REASONS[row.reason] ?? row.reason}{row.note ? ` · ${row.note}` : ''} · còn {money(row.balance)} · {time(row.time)}</small></p>)}
      </div>
      {account.admin ? <p className="pa-gift-note">Tài khoản admin không khoá hoặc xoá được ở đây.</p> : <div className="pa-account-danger">
        <h3>Khoá / xoá tài khoản</h3>
        <button type="button" className="secondary-button" disabled={busy} onClick={lock}>{account.locked ? <Unlock size={16}/> : <Lock size={16}/>}{account.locked ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}</button>
        <form onSubmit={e => { e.preventDefault(); if (deleteText === login) void remove(); }}>
          <label className="pa-field"><span>Xoá vĩnh viễn: gõ <b>{login}</b> để xác nhận <small>Mất thẻ, BP, FC và sổ cái của tài khoản; không khôi phục được.</small></span><input value={deleteText} onChange={e => setDeleteText(e.target.value)} autoComplete="off" spellCheck={false}/></label>
          <button type="submit" className="pa-account-delete" disabled={busy || deleteText !== login}><Trash2 size={16}/>Xoá tài khoản</button>
        </form>
      </div>}
    </div>
  </div>;
}

export default function Accounts() {
  const [data, setData] = useState<AdminAccountList | null>(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const view = useRef({ search, sort, page }); view.current = { search, sort, page };
  // Chỉ nhận kết quả của lần tải mới nhất: bấm đổi trang / sắp xếp nhanh thì phản hồi cũ về sau không ghi đè.
  const load = async () => {
    const id = ++request.current, current = view.current;
    setBusy(true);
    try {
      const result = await adminAccounts(current.search, current.sort, PAGE_SIZE, current.page * PAGE_SIZE);
      if (id !== request.current) return;
      // Trang hiện tại vừa hết tài khoản (vd. xoá dòng cuối): lùi về trang cuối còn dữ liệu.
      if (!result.accounts.length && current.page > 0) { setPage(Math.max(0, Math.ceil(result.matched / PAGE_SIZE) - 1)); return; }
      setData(result); setError('');
    } catch (e) { if (id === request.current) setError((e as Error).message); }
    finally { if (id === request.current) setBusy(false); }
  };
  useEffect(() => { void load(); }, [search, sort, page]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); return () => clearInterval(timer); }, []);
  const pages = Math.max(1, Math.ceil((data?.matched ?? 0) / PAGE_SIZE));
  return <section className="pa-form pa-accounts" aria-label="Quản lý tài khoản">
    <div className="pa-row"><h2 className="pa-gift-title">Tài khoản</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Mọi tài khoản đã đăng ký, kể cả tài khoản chưa từng vào game. BP, thẻ và gói lấy từ lần đồng bộ gần nhất của người chơi.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {notice && <p className="pa-message is-ok" role="status">{notice}</p>}
    <form className="pa-row" onSubmit={e => { e.preventDefault(); setPage(0); setOpen(''); setSearch(input.trim()); }}>
      <label className="pa-field"><span>Tìm tài khoản</span><input value={input} onChange={e => setInput(e.target.value)} placeholder="tên đăng nhập" spellCheck={false}/></label>
      <label className="pa-field pa-narrow-sort"><span>Sắp xếp</span><select value={sort} onChange={e => { setSort(e.target.value as Sort); setPage(0); setOpen(''); }}>{SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </form>
    {data && <p className="pa-account-count"><b>{money(data.total)}</b> tài khoản{search ? ` · ${money(data.matched)} khớp "${search}"` : ''}</p>}
    {data && <div className="pa-stat-players">
      <table><thead><tr><th>Tài khoản</th><th>Đăng ký</th><th>Hoạt động</th><th>Giờ chơi</th><th>FC</th><th>BP</th><th>Thẻ</th><th>Gói</th><th>Đã nạp</th><th/></tr></thead>
        <tbody>{data.accounts.map(a => <Fragment key={a.id}>
          <tr className={a.locked ? 'is-locked' : undefined}>
            <td>{a.online && <i className="pa-dot" aria-label="đang online"/>}{a.login}{a.admin && <span className="pa-badge is-admin">Admin</span>}{a.locked && <span className="pa-badge is-locked">Đã khoá</span>}</td>
            <td>{new Date(a.registered).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td>{ago(a.lastSeen, data.now)}</td><td>{hours(a.playSeconds)}</td>
            <td>{money(a.fc)}</td><td>{a.hasSave ? money(a.bp) : '—'}</td><td>{a.hasSave ? money(a.cards) : '—'}</td><td>{a.hasSave ? money(a.packs) : '—'}</td><td>{a.topupFc ? vnd(a.topupFc) : '—'}</td>
            <td><button type="button" className="secondary-button pa-account-toggle" aria-expanded={open === a.id} onClick={() => { setNotice(''); setOpen(open === a.id ? '' : a.id); }}>{open === a.id ? 'Đóng' : 'Quản lý'}</button></td>
          </tr>
          {open === a.id && <tr className="pa-account-detail"><td colSpan={10}><ManageAccount account={a} onChanged={() => void load()} onDeleted={login => { setOpen(''); setNotice(`Đã xoá tài khoản ${login}.`); void load(); }}/></td></tr>}
        </Fragment>)}</tbody></table>
      {!data.accounts.length && <p className="pa-empty">Không có tài khoản nào.</p>}
    </div>}
    {data && pages > 1 && <nav className="pa-account-pages" aria-label="Phân trang tài khoản">
      <button type="button" className="secondary-button" disabled={busy || page === 0} onClick={() => { setOpen(''); setPage(page - 1); }}>Trước</button>
      <span role="status">Trang {page + 1} / {pages}</span>
      <button type="button" className="secondary-button" disabled={busy || page + 1 >= pages} onClick={() => { setOpen(''); setPage(page + 1); }}>Sau</button>
    </nav>}
  </section>;
}