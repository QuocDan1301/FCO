import { Fragment, useEffect, useRef, useState } from 'react';
import { Coins, Gift, Lock, Pause, Play, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { money, packs } from './game';
import { ago, hours, vnd } from './Stats';
import { giftRewardText } from './gift-codes';
import { adminAccountDelete, adminAccountLock, adminAccountReset, adminAccounts, adminAccountsPause, adminCredit, adminGiftList, adminLedger, adminSendGift, LEDGER_REASONS } from './wallet';
import type { AdminAccount, AdminAccountList, AdminGift, LedgerRow } from './wallet';
import { CreditKindField, LedgerKindButton } from './LedgerKind';
import type { CreditKind } from './LedgerKind';

// Quản lý tài khoản (supabase/migrations/202611080008_fco_admin_accounts.sql): mọi tài khoản đã đăng ký, cộng / trừ FC, sổ cái, khoá, xoá.
// Máy chủ kiểm tra quyền ở mọi thao tác và không cho khoá / xoá tài khoản admin.
const PAGE_SIZE = 50;
type Sort = 'new' | 'active' | 'topup' | 'fc';
// Bộ lọc trạng thái (migration 202611090014): đang hoạt động = đang online (2 phút gần nhất), không hoạt động = còn lại.
const STATUSES: { id: string | null; label: string }[] = [{ id: null, label: 'Tất cả' }, { id: 'active', label: 'Đang hoạt động' }, { id: 'inactive', label: 'Không hoạt động' }, { id: 'paused', label: 'Đang tạm dừng' }];
const SORTS: { id: Sort; label: string }[] = [{ id: 'new', label: 'Mới đăng ký' }, { id: 'active', label: 'Mới vào game' }, { id: 'topup', label: 'Nạp nhiều' }, { id: 'fc', label: 'FC nhiều' }];
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

// Quà admin tặng (supabase/migrations/202611090002_fco_admin_gifts.sql): FC hoặc gói cầu thủ, không tính vào Đã nạp và doanh thu.
function SendGift({ account, busy, run, onSent }: { account: AdminAccount; busy: boolean; run: (task: () => Promise<string>) => void; onSent: () => void }) {
  const { id, login } = account;
  const [kind, setKind] = useState<'fc' | 'pack'>('pack');
  const [amount, setAmount] = useState('1');
  const [pack, setPack] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [gifts, setGifts] = useState<AdminGift[] | null>(null);
  const list = () => adminGiftList(id).then(rows => { setGifts(rows.slice(0, 5)); setError(''); }).catch(e => setError((e as Error).message));
  useEffect(() => { void list(); }, [id]);
  const options = packs.filter(p => !p.draft);
  const value = Number(amount);
  const send = () => {
    if (!Number.isSafeInteger(value) || value <= 0) return setError(kind === 'fc' ? 'Nhập số FC muốn tặng.' : 'Nhập số gói muốn tặng.');
    if (kind === 'pack' && !pack) return setError('Chọn gói muốn tặng.');
    if (kind === 'pack' && value > 1000) return setError('Mỗi lần tặng tối đa 1.000 gói.');
    const gift = kind === 'fc' ? { fc: value } : { pack, count: value };
    const text = giftRewardText(gift);
    if (!confirm(`Tặng ${text} cho ${login}?`)) return;
    setError('');
    run(async () => {
      await adminSendGift(id, gift, note);
      setNote(''); setAmount(kind === 'fc' ? '' : '1'); void list(); onSent();
      return `Đã tặng ${text} cho ${login}.`;
    });
  };
  return <form onSubmit={e => { e.preventDefault(); send(); }}>
    <h3>Tặng quà</h3>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    <label className="pa-field"><span>Loại quà</span><select value={kind} onChange={e => { setKind(e.target.value as 'fc' | 'pack'); setAmount(e.target.value === 'pack' ? '1' : ''); }}><option value="pack">Gói cầu thủ</option><option value="fc">FC</option></select></label>
    {kind === 'pack' && <label className="pa-field"><span>Gói</span><select value={pack} onChange={e => setPack(e.target.value)}><option value="">Chọn gói…</option>{options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <label className="pa-field"><span>{kind === 'fc' ? 'Số FC' : 'Số gói'}</span><input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={kind === 'fc' ? 'vd. 5000' : '1'} autoComplete="off"/></label>
    <label className="pa-field"><span>Lời nhắn <small>người chơi thấy trong lịch sử</small></span><input value={note} onChange={e => setNote(e.target.value)} maxLength={200}/></label>
    <button type="submit" className="primary-button" disabled={busy}><Gift size={16}/>Tặng quà</button>
    <p className="pa-gift-note">Không tính vào Đã nạp và doanh thu. FC vào ví ngay; gói vào kho khi người chơi mở game.</p>
    {gifts?.map(g => <p key={g.id} className="pa-account-gift"><b>{g.rewards.map(giftRewardText).join(', ')}</b> <small>{g.claimed ? 'Đã nhận' : 'Chờ nhận'}{g.note ? ` · ${g.note}` : ''} · {time(g.time)}</small></p>)}
  </form>;
}

function ManageAccount({ account, onChanged, onDeleted }: { account: AdminAccount; onChanged: () => void; onDeleted: (login: string) => void }) {
  const { login } = account;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<CreditKind>('topup');
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [resetText, setResetText] = useState('');
  const [resetFc, setResetFc] = useState(false);
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
    const gift = kind === 'gift';
    if (gift && value < 0) return setStatus({ kind: 'error', text: 'Tặng FC chỉ nhận số dương.' });
    if (!confirm(gift ? `Tặng ${money(value)} FC cho ${login}? (không tính vào Đã nạp)` : `${value > 0 ? 'Nạp' : 'Trừ'} ${money(Math.abs(value))} FC ${value > 0 ? 'cho' : 'của'} ${login}? (tính vào Đã nạp)`)) return;
    void run(async () => {
      const result = await adminCredit(login, value, note.trim(), gift);
      setAmount(''); setNote(''); void loadLedger();
      return `Đã ${gift ? 'tặng' : value > 0 ? 'nạp' : 'trừ'} ${money(Math.abs(value))} FC · ${login} còn ${money(result.fc)} FC.`;
    });
  };
  const lock = () => {
    if (!account.locked && !confirm(`Khoá ${login}? Người chơi bị đăng xuất và không vào game được cho tới khi mở khoá. Dữ liệu được giữ nguyên.`)) return;
    void run(async () => { await adminAccountLock(account.id, !account.locked); return account.locked ? `Đã mở khoá ${login}.` : `Đã khoá ${login}.`; });
  };
  const pause = () => {
    if (!account.paused && !confirm(`Tạm dừng ${login}? Người chơi thấy thông báo máy chủ bảo trì và không chơi được cho tới khi bỏ tạm dừng.`)) return;
    void run(async () => { await adminAccountsPause(!account.paused, { users: [account.id] }); return account.paused ? `Đã bỏ tạm dừng ${login}.` : `Đã tạm dừng ${login}.`; });
  };
  const reset = () => {
    if (resetText !== login) return;
    void run(async () => {
      const result = await adminAccountReset(account.id, resetFc);
      setResetText(''); setResetFc(false); void loadLedger();
      return `Đã reset ${login}, còn ${money(result.fc)} FC.`;
    });
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
        <CreditKindField kind={kind} onChange={setKind}/>
        <label className="pa-field"><span>Số FC <small>{Number.isSafeInteger(value) && value ? `${value > 0 ? '+' : '−'}${money(Math.abs(value))} FC` : 'số âm để trừ'}</small></span><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="vd. 100000" autoComplete="off"/></label>
        <label className="pa-field"><span>Ghi chú <small>vd. mã giao dịch ngân hàng</small></span><input value={note} onChange={e => setNote(e.target.value)} maxLength={200}/></label>
        <button type="submit" className="primary-button" disabled={busy}><Coins size={16}/>Xác nhận</button>
      </form>
      <SendGift account={account} busy={busy} run={task => void run(task)} onSent={() => void loadLedger()}/>
      <div className="pa-account-ledger">
        <h3>Sổ cái FC gần đây</h3>
        {ledger && !ledger.length && <p className="pa-empty">Chưa có giao dịch.</p>}
        {ledger?.map((row, i) => <p key={`${row.time}-${i}`}><b className={row.delta > 0 ? 'pa-plus' : 'pa-minus'}>{row.delta > 0 ? '+' : '−'}{money(Math.abs(row.delta))} FC</b> <small>{LEDGER_REASONS[row.reason] ?? row.reason}{row.note ? ` · ${row.note}` : ''} · còn {money(row.balance)} · {time(row.time)}</small> <LedgerKindButton row={row} onChanged={() => { void loadLedger(); onChanged(); }} onError={text => setStatus({ kind: 'error', text })}/></p>)}
      </div>
      <div className="pa-account-danger">
        <h3>Khoá / tạm dừng / reset / xoá</h3>
        {!account.admin && <button type="button" className="secondary-button" disabled={busy} onClick={lock}>{account.locked ? <Unlock size={16}/> : <Lock size={16}/>}{account.locked ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}</button>}
        {!account.admin && <button type="button" className="secondary-button" disabled={busy} onClick={pause}>{account.paused ? <Play size={16}/> : <Pause size={16}/>}{account.paused ? 'Bỏ tạm dừng' : 'Tạm dừng tài khoản'}</button>}
        <form onSubmit={e => { e.preventDefault(); reset(); }}>
          <label className="pa-field"><span>Reset về như mới: gõ <b>{login}</b> để xác nhận <small>Mất thẻ, BP, gói, đội hình, lịch sử, tiến trình sự kiện, chuỗi điểm danh và kỷ lục BXH; không khôi phục được. Giữ tên đăng nhập, mật khẩu và sổ cái.</small></span><input value={resetText} onChange={e => setResetText(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`Gõ ${login} để xác nhận reset`}/></label>
          <label className="pa-account-check"><input type="checkbox" checked={resetFc} onChange={e => setResetFc(e.target.checked)}/>Xoá luôn FC (đang có {money(account.fc)} FC)</label>
          <button type="submit" className="pa-account-delete" disabled={busy || resetText !== login}><RotateCcw size={16}/>Reset tài khoản</button>
        </form>
        {account.admin ? <p className="pa-gift-note">Tài khoản admin không khoá hoặc xoá được.</p> : <form onSubmit={e => { e.preventDefault(); if (deleteText === login) void remove(); }}>
          <label className="pa-field"><span>Xoá vĩnh viễn: gõ <b>{login}</b> để xác nhận <small>Mất thẻ, BP, FC và sổ cái của tài khoản; không khôi phục được.</small></span><input value={deleteText} onChange={e => setDeleteText(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`Gõ ${login} để xác nhận xoá`}/></label>
          <button type="submit" className="pa-account-delete" disabled={busy || deleteText !== login}><Trash2 size={16}/>Xoá tài khoản</button>
        </form>}
      </div>
    </div>
  </div>;
}

export default function Accounts() {
  const [data, setData] = useState<AdminAccountList | null>(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [status, setStatus] = useState<string | null>(null);
  // Chọn hàng loạt: danh sách id, giữ khi đổi trang; allMatching = mọi tài khoản khớp tìm kiếm + bộ lọc, kể cả trang khác.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const view = useRef({ search, sort, page, status }); view.current = { search, sort, page, status };
  // Chỉ nhận kết quả của lần tải mới nhất: bấm đổi trang / sắp xếp nhanh thì phản hồi cũ về sau không ghi đè.
  const load = async () => {
    const id = ++request.current, current = view.current;
    setBusy(true);
    try {
      const result = await adminAccounts(current.search, current.sort, PAGE_SIZE, current.page * PAGE_SIZE, current.status);
      if (id !== request.current) return;
      // Trang hiện tại vừa hết tài khoản (vd. xoá dòng cuối): lùi về trang cuối còn dữ liệu.
      if (!result.accounts.length && current.page > 0) { setPage(Math.max(0, Math.ceil(result.matched / PAGE_SIZE) - 1)); return; }
      setData(result); setError('');
    } catch (e) { if (id === request.current) setError((e as Error).message); }
    finally { if (id === request.current) setBusy(false); }
  };
  useEffect(() => { void load(); }, [search, sort, page, status]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); return () => clearInterval(timer); }, []);
  const pages = Math.max(1, Math.ceil((data?.matched ?? 0) / PAGE_SIZE));
  const clearSelection = () => { setSelected(new Set()); setAllMatching(false); };
  // Admin không tạm dừng được nên không chọn được.
  const pageIds = (data?.accounts ?? []).filter(a => !a.admin).map(a => a.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const toggleOne = (id: string) => { setAllMatching(false); setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const togglePage = () => { setAllMatching(false); setSelected(current => { const next = new Set(current); pageIds.forEach(id => { if (pageAllSelected) next.delete(id); else next.add(id); }); return next; }); };
  const selectedCount = allMatching ? data?.matched ?? 0 : selected.size;
  const bulkPause = async (paused: boolean) => {
    if (paused && !confirm(`Tạm dừng ${allMatching ? 'tất cả ' : ''}${money(selectedCount)} tài khoản? Người chơi thấy thông báo máy chủ bảo trì và không chơi được cho tới khi bỏ tạm dừng.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminAccountsPause(paused, allMatching ? { all: true, search, status } : { users: [...selected] });
      setNotice(`Đã ${paused ? 'tạm dừng' : 'bỏ tạm dừng'} ${money(result.changed)} tài khoản${result.skippedAdmins ? `, bỏ qua ${money(result.skippedAdmins)} admin` : ''}.`);
      clearSelection();
      await load();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <section className="pa-form pa-accounts" aria-label="Quản lý tài khoản">
    <div className="pa-row"><h2 className="pa-gift-title">Tài khoản</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Mọi tài khoản đã đăng ký, kể cả tài khoản chưa từng vào game. BP, thẻ và gói lấy từ lần đồng bộ gần nhất của người chơi.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {notice && <p className="pa-message is-ok" role="status">{notice}</p>}
    <form className="pa-row" onSubmit={e => { e.preventDefault(); setPage(0); setOpen(''); clearSelection(); setSearch(input.trim()); }}>
      <label className="pa-field"><span>Tìm tài khoản</span><input value={input} onChange={e => setInput(e.target.value)} placeholder="tên đăng nhập" spellCheck={false}/></label>
      <label className="pa-field pa-narrow-sort"><span>Sắp xếp</span><select value={sort} onChange={e => { setSort(e.target.value as Sort); setPage(0); setOpen(''); }}>{SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </form>
    <div className="pa-status-filter" role="group" aria-label="Lọc theo trạng thái">
      {STATUSES.map(s => <button key={s.id ?? 'all'} type="button" className={`secondary-button ${status === s.id ? 'is-on' : ''}`} aria-pressed={status === s.id}
        onClick={() => { setStatus(s.id); setPage(0); setOpen(''); clearSelection(); }}>
        {s.label}{s.id === 'active' && data?.online !== undefined ? <b>{money(data.online)}</b> : s.id === 'inactive' && data?.online !== undefined ? <b>{money(data.total - data.online)}</b> : null}
      </button>)}
    </div>
    {data && <p className="pa-account-count"><b>{money(data.total)}</b> tài khoản{search ? ` · ${money(data.matched)} khớp "${search}"` : ''}</p>}
    {selectedCount > 0 && <div className="pa-account-bulk" role="region" aria-label="Thao tác hàng loạt">
      <b>Đã chọn {money(selectedCount)} tài khoản</b>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void bulkPause(true)}><Pause size={15}/>Tạm dừng</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void bulkPause(false)}><Play size={15}/>Bỏ tạm dừng</button>
      <button type="button" className="pa-account-link" disabled={busy} onClick={clearSelection}>Bỏ chọn</button>
      {!allMatching && pageAllSelected && data && data.matched > data.accounts.length && <button type="button" className="pa-account-link" disabled={busy} onClick={() => setAllMatching(true)}>Chọn tất cả {money(data.matched)} tài khoản{search || status ? ' đang lọc' : ''}</button>}
    </div>}
    {data && <div className="pa-stat-players">
      <table><thead><tr><th className="pa-account-pick"><input type="checkbox" aria-label="Chọn mọi tài khoản trong trang" checked={allMatching || pageAllSelected} disabled={!pageIds.length} onChange={togglePage}/></th><th>Tài khoản</th><th>Đăng ký</th><th>Hoạt động</th><th>Giờ chơi</th><th>FC</th><th>BP</th><th>Thẻ</th><th>Gói</th><th>Đã nạp</th><th/></tr></thead>
        <tbody>{data.accounts.map(a => <Fragment key={a.id}>
          <tr className={a.locked ? 'is-locked' : undefined}>
            <td className="pa-account-pick"><input type="checkbox" aria-label={`Chọn ${a.login}`} title={a.admin ? 'Không tạm dừng được tài khoản admin' : undefined} disabled={a.admin} checked={!a.admin && (allMatching || selected.has(a.id))} onChange={() => { if (allMatching) { setSelected(new Set(pageIds)); } toggleOne(a.id); }}/></td>
            <td>{a.online && <i className="pa-dot" aria-label="đang online"/>}{a.login}{a.admin && <span className="pa-badge is-admin">Admin</span>}{a.locked && <span className="pa-badge is-locked">Đã khoá</span>}{a.paused && <span className="pa-badge is-paused">Tạm dừng</span>}</td>
            <td>{new Date(a.registered).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td>{ago(a.lastSeen, data.now)}</td><td>{hours(a.playSeconds)}</td>
            <td>{money(a.fc)}</td><td>{a.hasSave ? money(a.bp) : '—'}</td><td>{a.hasSave ? money(a.cards) : '—'}</td><td>{a.hasSave ? money(a.packs) : '—'}</td><td>{a.topupFc ? vnd(a.topupVnd) : '—'}</td>
            <td><button type="button" className="secondary-button pa-account-toggle" aria-expanded={open === a.id} onClick={() => { setNotice(''); setOpen(open === a.id ? '' : a.id); }}>{open === a.id ? 'Đóng' : 'Quản lý'}</button></td>
          </tr>
          {open === a.id && <tr className="pa-account-detail"><td colSpan={11}><ManageAccount account={a} onChanged={() => void load()} onDeleted={login => { setOpen(''); setNotice(`Đã xoá tài khoản ${login}.`); void load(); }}/></td></tr>}
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