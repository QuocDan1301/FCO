import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Coins, Gift, Lock, Pause, Play, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { money, packs } from './game';
import { ago, hours, vnd } from './Stats';
import { giftRewardText } from './gift-codes';
import { adminAccountDelete, adminAccountLock, adminAccountTier, adminCreditStp, adminResetPassword, adminAccountReset, adminAccounts, adminAccountsDelete, adminAccountsPause, adminCredit, adminGiftList, adminLedger, adminSendGift, LEDGER_REASONS } from './wallet';
import type { AdminAccount, AdminAccountList, AdminGift, LedgerRow } from './wallet';
import { CreditKindField, LedgerKindButton } from './LedgerKind';
import type { CreditKind } from './LedgerKind';

// Quản lý tài khoản (supabase/migrations/202611080008_fco_admin_accounts.sql): mọi tài khoản đã đăng ký, cộng / trừ FC, sổ cái, khoá, xoá.
// Máy chủ kiểm tra quyền ở mọi thao tác và không cho khoá / xoá tài khoản admin.
const PAGE_SIZE = 50;
// Sắp xếp (migration 202611100011): bấm tiêu đề cột; lần đầu giảm dần (lớn / mới nhất trước), bấm lại thì tăng dần.
type Sort = 'new' | 'active' | 'play' | 'fc' | 'bp' | 'cards' | 'packs' | 'topup';
// Bộ lọc trạng thái (migration 202611090014): đang hoạt động = đang online (2 phút gần nhất), không hoạt động = còn lại.
const STATUSES: { id: string | null; label: string }[] = [{ id: null, label: 'Tất cả' }, { id: 'active', label: 'Đang hoạt động' }, { id: 'inactive', label: 'Không hoạt động' }, { id: 'paused', label: 'Đang tạm dừng' }];
const SORTS: { id: Sort; column: string; label: string; asc: string }[] = [
  { id: 'new', column: 'Đăng ký', label: 'Mới đăng ký', asc: 'Đăng ký lâu nhất' },
  { id: 'active', column: 'Hoạt động', label: 'Mới vào game', asc: 'Lâu không vào game' },
  { id: 'play', column: 'Giờ chơi', label: 'Chơi nhiều', asc: 'Chơi ít' },
  { id: 'fc', column: 'FC', label: 'FC nhiều', asc: 'FC ít' },
  { id: 'bp', column: 'BP', label: 'BP nhiều', asc: 'BP ít' },
  { id: 'cards', column: 'Thẻ', label: 'Nhiều thẻ', asc: 'Ít thẻ' },
  { id: 'packs', column: 'Gói', label: 'Nhiều gói', asc: 'Ít gói' },
  { id: 'topup', column: 'Đã nạp', label: 'Nạp nhiều', asc: 'Nạp ít' },
];
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

// Loại tài khoản Classic / Premium (migration 202611110003): admin đặt để người chơi nhận ưu đãi riêng; không phải gói thành viên trong Shop.
function AccountTierField({ account, busy, run }: { account: AdminAccount; busy: boolean; run: (task: () => Promise<string>) => void }) {
  const [tier, setTier] = useState<'classic' | 'premium' | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  useEffect(() => { void adminAccountTier(account.id).then(r => { setTier(r.tier); setUntil(r.until ?? null); }).catch(() => setTier(null)); }, [account.id]);
  const date = (ms: number | null) => ms ? new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';
  // Premium có hạn 7 ngày; bấm lại khi còn hạn thì cộng thêm 7 ngày. Huỷ = về Classic ngay.
  const set = (next: 'classic' | 'premium') => run(async () => { const r = await adminAccountTier(account.id, next); setTier(r.tier); setUntil(r.until ?? null);
    return r.tier === 'premium' ? `${account.login} là Premium tới ${date(r.until ?? null)}.` : `Đã huỷ Premium của ${account.login}.`; });
  return <form onSubmit={e => e.preventDefault()}>
    <h3>Loại tài khoản</h3>
    <p className="pa-gift-note">Hiện tại: <b>{tier === 'premium' ? `Premium · hết hạn ${date(until)}` : tier ? 'Classic' : '…'}</b>. Premium có hạn 7 ngày: giảm 65% thuế bán (không cộng dồn giảm giá khác) và hiệu ứng tên. Không liên quan gói thành viên trong Shop.</p>
    <div className="pa-row"><button type="button" className="primary-button" disabled={busy || !tier} onClick={() => set('premium')}>{tier === 'premium' ? 'Gia hạn thêm 7 ngày' : 'Đặt Premium 7 ngày'}</button>
    {tier === 'premium' && <button type="button" className="secondary-button" disabled={busy} onClick={() => set('classic')}>Huỷ Premium</button>}</div>
  </form>;
}
// Đặt lại mật khẩu (202611110015): không xem được mật khẩu cũ (chỉ lưu mã băm). Admin nhập hoặc tạo mật khẩu tạm, gửi cho người chơi;
// tài khoản bị đăng xuất ở mọi thiết bị. Mật khẩu tạm chỉ hiện lại ở đây sau khi đặt thành công để admin chép gửi đi.
const randomPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const v = crypto.getRandomValues(new Uint32Array(10)); return Array.from(v, n => a[n % a.length]).join(''); };
function ResetPasswordField({ account, busy, run }: { account: AdminAccount; busy: boolean; run: (task: () => Promise<string>) => void }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState('');
  const valid = password.length >= 6 && new TextEncoder().encode(password).length <= 72;
  if (account.admin) return null;
  return <form onSubmit={e => { e.preventDefault(); if (valid) run(async () => { await adminResetPassword(account.id, password); setDone(password); setPassword(''); return `Đã đặt mật khẩu mới cho ${account.login} và đăng xuất tài khoản này ở mọi thiết bị.`; }); }}>
    <h3>Đặt lại mật khẩu</h3>
    <p className="pa-gift-note">Không xem được mật khẩu cũ (máy chủ chỉ lưu mã băm). Đặt mật khẩu tạm rồi gửi cho người chơi; tài khoản bị đăng xuất ở mọi thiết bị.</p>
    <div className="pa-row"><label className="pa-field"><span>Mật khẩu mới</span><input value={password} autoComplete="new-password" spellCheck={false} maxLength={72} placeholder="Ít nhất 6 ký tự" onChange={e => { setPassword(e.target.value); setDone(''); }}/></label>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => { setPassword(randomPassword()); setDone(''); }}>Tạo ngẫu nhiên</button></div>
    <button type="submit" className="primary-button" disabled={busy || !valid}>Đặt lại mật khẩu</button>
    {done && <p className="pa-gift-note">Gửi cho người chơi: tài khoản <b>{account.login}</b> · mật khẩu <b className="pa-password">{done}</b></p>}
  </form>;
}
// Star Point (202611110007): admin cộng / trừ STP cho tài khoản (số âm để trừ). Nguồn nhận STP cho người chơi (nhiệm vụ) sẽ thêm sau.
function StarPointField({ account, busy, run }: { account: AdminAccount; busy: boolean; run: (task: () => Promise<string>) => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = Number(amount.replace(/[.\s]/g, ''));
  const valid = /^-?[\d.\s]+$/.test(amount.trim()) && Number.isSafeInteger(value) && value !== 0;
  return <form onSubmit={e => { e.preventDefault(); if (valid) run(async () => { const r = await adminCreditStp(account.login, value, note.trim()); setAmount(''); setNote(''); return `${value > 0 ? 'Đã cộng' : 'Đã trừ'} ${money(Math.abs(value))} STP cho ${account.login}. Số dư: ${money(r.stp)} STP.`; }); }}>
    <h3>Star Point</h3>
    <p className="pa-gift-note">Cộng hoặc trừ (số âm) Star Point để người chơi mua gói STP trong Shop.</p>
    <label className="pa-field"><span>Số STP</span><input inputMode="numeric" value={amount} placeholder="vd. 100 hoặc -15" onChange={e => setAmount(e.target.value.replace(/[^\d.\s-]/g, '').slice(0, 14))}/></label>
    <label className="pa-field"><span>Ghi chú</span><input value={note} maxLength={200} onChange={e => setNote(e.target.value)}/></label>
    <button type="submit" className="primary-button" disabled={busy || !valid}>Cập nhật Star Point</button>
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
      <AccountTierField account={account} busy={busy} run={task => void run(task)}/>
      <StarPointField account={account} busy={busy} run={task => void run(task)}/>
      <ResetPasswordField account={account} busy={busy} run={task => void run(task)}/>
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
  const [asc, setAsc] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Chọn hàng loạt: danh sách id, giữ khi đổi trang; allMatching = mọi tài khoản khớp tìm kiếm + bộ lọc, kể cả trang khác.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Xoá hàng loạt: mở ô xác nhận, phải gõ đúng số tài khoản đã chọn.
  const [bulkDelete, setBulkDelete] = useState(false);
  const [bulkDeleteText, setBulkDeleteText] = useState('');
  const request = useRef(0);
  const view = useRef({ search, sort, asc, page, status }); view.current = { search, sort, asc, page, status };
  // Chỉ nhận kết quả của lần tải mới nhất: bấm đổi trang / sắp xếp nhanh thì phản hồi cũ về sau không ghi đè.
  const load = async () => {
    const id = ++request.current, current = view.current;
    setBusy(true);
    try {
      const result = await adminAccounts(current.search, current.asc ? `${current.sort}_asc` : current.sort, PAGE_SIZE, current.page * PAGE_SIZE, current.status);
      if (id !== request.current) return;
      // Trang hiện tại vừa hết tài khoản (vd. xoá dòng cuối): lùi về trang cuối còn dữ liệu.
      if (!result.accounts.length && current.page > 0) { setPage(Math.max(0, Math.ceil(result.matched / PAGE_SIZE) - 1)); return; }
      setData(result); setError('');
    } catch (e) { if (id === request.current) setError((e as Error).message); }
    finally { if (id === request.current) setBusy(false); }
  };
  useEffect(() => { void load(); }, [search, sort, asc, page, status]);
  const sortBy = (id: Sort, ascending = id === sort ? !asc : false) => { setSort(id); setAsc(ascending); setPage(0); setOpen(''); };
  const sortHeader = (id: Sort) => {
    const on = sort === id, column = SORTS.find(o => o.id === id)!.column;
    return <th aria-sort={on ? (asc ? 'ascending' : 'descending') : undefined}><button type="button" className={`pa-sort ${on ? 'is-on' : ''}`} onClick={() => sortBy(id)} title={on && !asc ? 'Bấm để sắp tăng dần' : 'Bấm để sắp giảm dần'}>{column}{on ? (asc ? <ArrowUp size={13}/> : <ArrowDown size={13}/>) : <ArrowUpDown size={13}/>}</button></th>;
  };
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000); return () => clearInterval(timer); }, []);
  const pages = Math.max(1, Math.ceil((data?.matched ?? 0) / PAGE_SIZE));
  const clearSelection = () => { setSelected(new Set()); setAllMatching(false); setBulkDelete(false); setBulkDeleteText(''); };
  // Admin không tạm dừng / xoá được nên không chọn được.
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
  // Máy chủ xoá tối đa 200 tài khoản mỗi lần: danh sách id chia lô 200, "tất cả khớp bộ lọc" thì gọi lại tới khi remaining = 0.
  const bulkRemove = async () => {
    if (bulkDeleteText.trim() !== String(selectedCount)) return;
    setBusy(true); setError(''); setNotice(''); setOpen('');
    let deleted = 0, skippedAdmins = 0;
    try {
      if (allMatching) {
        for (let round = 0; round < 1000; round++) {
          const result = await adminAccountsDelete({ all: true, search, status });
          deleted += result.deleted; skippedAdmins = result.skippedAdmins;
          if (!result.remaining || !result.deleted) break;
        }
      } else {
        const ids = [...selected];
        for (let i = 0; i < ids.length; i += 200) {
          const result = await adminAccountsDelete({ users: ids.slice(i, i + 200) });
          deleted += result.deleted; skippedAdmins += result.skippedAdmins;
        }
      }
      setNotice(`Đã xoá vĩnh viễn ${money(deleted)} tài khoản${skippedAdmins ? `, bỏ qua ${money(skippedAdmins)} admin` : ''}.`);
      clearSelection();
      await load();
    } catch (e) {
      setError(`${(e as Error).message}${deleted ? ` (đã xoá ${money(deleted)} tài khoản trước khi lỗi)` : ''}`);
      if (deleted) { clearSelection(); await load(); } else setBusy(false);
    }
  };
  return <section className="pa-form pa-accounts" aria-label="Quản lý tài khoản">
    <div className="pa-row"><h2 className="pa-gift-title">Tài khoản</h2><button type="button" className="secondary-button pa-gift-random" disabled={busy} onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    <p className="pa-gift-note">Mọi tài khoản đã đăng ký, kể cả tài khoản chưa từng vào game. BP, thẻ và gói lấy từ lần đồng bộ gần nhất của người chơi.</p>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {notice && <p className="pa-message is-ok" role="status">{notice}</p>}
    <form className="pa-row" onSubmit={e => { e.preventDefault(); setPage(0); setOpen(''); clearSelection(); setSearch(input.trim()); }}>
      <label className="pa-field"><span>Tìm tài khoản</span><input value={input} onChange={e => setInput(e.target.value)} placeholder="tên đăng nhập" spellCheck={false}/></label>
      <label className="pa-field pa-narrow-sort"><span>Sắp xếp</span><select value={`${sort}${asc ? '_asc' : ''}`} onChange={e => { const [id, dir] = e.target.value.split('_'); sortBy(id as Sort, dir === 'asc'); }}>{SORTS.map(o => <Fragment key={o.id}><option value={o.id}>{o.label}</option><option value={`${o.id}_asc`}>{o.asc}</option></Fragment>)}</select></label>
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
      <button type="button" className="secondary-button pa-account-bulk-delete" disabled={busy} aria-expanded={bulkDelete} onClick={() => { setBulkDelete(!bulkDelete); setBulkDeleteText(''); }}><Trash2 size={15}/>Xoá</button>
      <button type="button" className="pa-account-link" disabled={busy} onClick={clearSelection}>Bỏ chọn</button>
      {!allMatching && pageAllSelected && data && data.matched > data.accounts.length && <button type="button" className="pa-account-link" disabled={busy} onClick={() => setAllMatching(true)}>Chọn tất cả {money(data.matched)} tài khoản{search || status ? ' đang lọc' : ''}</button>}
      {bulkDelete && <form className="pa-account-bulk-confirm" onSubmit={e => { e.preventDefault(); void bulkRemove(); }}>
        <label className="pa-field"><span>Xoá vĩnh viễn {allMatching ? 'tất cả ' : ''}{money(selectedCount)} tài khoản: gõ <b>{selectedCount}</b> để xác nhận <small>Mất thẻ, BP, FC và sổ cái của các tài khoản này; không khôi phục được. Tài khoản admin được bỏ qua.{allMatching ? ' Tài khoản khớp bộ lọc lúc bấm xoá đều bị xoá, kể cả tài khoản mới đăng ký sau khi chọn.' : ''}</small></span><input value={bulkDeleteText} onChange={e => setBulkDeleteText(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" aria-label={`Gõ ${selectedCount} để xác nhận xoá`}/></label>
        <button type="submit" className="pa-account-delete" disabled={busy || bulkDeleteText !== String(selectedCount)}><Trash2 size={16}/>{busy ? 'Đang xoá…' : `Xoá ${money(selectedCount)} tài khoản`}</button>
      </form>}
    </div>}
    {data && <div className="pa-stat-players">
      <table><thead><tr><th className="pa-account-pick"><input type="checkbox" aria-label="Chọn mọi tài khoản trong trang" checked={allMatching || pageAllSelected} disabled={!pageIds.length} onChange={togglePage}/></th><th>Tài khoản</th>{SORTS.map(o => <Fragment key={o.id}>{sortHeader(o.id)}</Fragment>)}<th/></tr></thead>
        <tbody>{data.accounts.map(a => <Fragment key={a.id}>
          <tr className={a.locked ? 'is-locked' : undefined}>
            <td className="pa-account-pick"><input type="checkbox" aria-label={`Chọn ${a.login}`} title={a.admin ? 'Không tạm dừng hoặc xoá được tài khoản admin' : undefined} disabled={a.admin} checked={!a.admin && (allMatching || selected.has(a.id))} onChange={() => { if (allMatching) { setSelected(new Set(pageIds)); } toggleOne(a.id); }}/></td>
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