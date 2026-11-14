import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BarChart3, Boxes, Coins, Copy, Gift, RotateCcw, Search, ShieldAlert, ShieldCheck, Users, Wrench, X } from 'lucide-react';
import { money, packs } from './game';
import GiftCodeAdmin from './admin/GiftCodeAdmin';
import Accounts from './Accounts';
import Anomalies from './Anomalies';
import GuardPanel from './GuardPanel';
import CloneSuspects from './CloneSuspects';
import MaintenancePanel from './MaintenancePanel';
import InventoryAdmin from './InventoryAdmin';
import Stats from './Stats';
import { adminAnomalies, adminCloneGroups, adminCredit, adminLedger, fetchMaintenanceState, LEDGER_REASONS, adminGuardSummary } from './wallet';
import { fetchInventoryState } from './inventory-server';
import { catalogVersion } from './inventory-catalog';
import type { LedgerRow } from './wallet';
import './admin/pack-admin.css';
import { TOPUP_VND_PER_1000_FC } from './config';
import { CreditKindField, LedgerKindButton } from './LedgerKind';
import type { CreditKind } from './LedgerKind';

// Bảng admin trong game (chỉ hiện với tài khoản trong bảng fco_admins): cộng FC sau khi kiểm tra bill chuyển khoản,
// xem sổ cái FC, quản lý gift code và xem cảnh báo bản lưu bất thường. Máy chủ kiểm tra quyền admin ở mọi thao tác.
type Status = { kind: 'ok' | 'error'; text: string } | null;
const time = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function CreditFc() {
  const [login, setLogin] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<CreditKind>('topup');
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
    const gift = kind === 'gift';
    if (gift && value < 0) return setStatus({ kind: 'error', text: 'Tặng FC chỉ nhận số dương.' });
    if (!confirm(gift ? `Tặng ${money(value)} FC cho ${login.trim()}? (không tính vào Đã nạp)` : `${value > 0 ? 'Nạp' : 'Trừ'} ${money(Math.abs(value))} FC ${value > 0 ? 'cho' : 'của'} ${login.trim()}? (tính vào Đã nạp)`)) return;
    setBusy(true); setStatus(null);
    try {
      const result = await adminCredit(login, value, note.trim(), gift);
      setStatus({ kind: 'ok', text: `Đã ${gift ? 'tặng' : value > 0 ? 'nạp' : 'trừ'} ${money(Math.abs(value))} FC · ${result.login} còn ${money(result.fc)} FC.` });
      setAmount(''); setNote(''); setFilter(result.login); void load(result.login);
    } catch (e) { setStatus({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return <section className="pa-gift" aria-label="Nạp FC">
    <form className="pa-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <h2 className="pa-gift-title">Cộng FC cho người chơi</h2>
      <p className="pa-gift-note">Nạp: kiểm tra bill chuyển khoản (tỷ lệ {TOPUP_VND_PER_1000_FC.toLocaleString('vi-VN')} VND = 1.000 FC), số này tính vào Đã nạp và doanh thu; số âm để trừ khi cộng nhầm. Tặng FC miễn phí thì chọn loại "Tặng FC", không tính nạp. Ở sổ cái, nút "Là quà tặng" / "Là nạp" đổi lại các lần cộng đã ghi nhầm loại.</p>
      {status && <p className={`pa-message is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
      <CreditKindField kind={kind} onChange={setKind}/>
      <label className="pa-field"><span>Tên đăng nhập</span><input value={login} onChange={e => setLogin(e.target.value)} placeholder="vd. player_123" autoComplete="off" spellCheck={false}/></label>
      <label className="pa-field"><span>Số FC <small>{Number.isSafeInteger(value) && value ? `= ${money(value)} FC · ${Math.round(Math.abs(value) / 1000 * TOPUP_VND_PER_1000_FC).toLocaleString('vi-VN')} VND` : ''}</small></span><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="vd. 100000"/></label>
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
          <small>{LEDGER_REASONS[row.reason] ?? row.reason}{row.note ? ` · ${row.note}` : ''} · còn {money(row.balance)} FC</small><small>{time(row.time)}</small></div>
        <LedgerKindButton row={row} onChanged={() => void load()} onError={text => setStatus({ kind: 'error', text })}/>
      </div>)}
    </div>
  </section>;
}

// Mục quản trị, chia nhóm. Huy hiệu: việc đang cần xử lý (bất thường chưa xem, nhóm nghi clone, bảo trì đang bật, kho thẻ cần đồng bộ).
export type AdminTab = 'stats' | 'accounts' | 'fc' | 'gift' | 'guard' | 'audit' | 'clones' | 'maintenance' | 'inventory';
type Tab = AdminTab;
type Badges = { audit?: number; clones?: number; maintenance?: boolean; inventory?: 'sync' | 'off' | null; guard?: number | 'off' };
const GROUPS: { title: string; items: { id: Tab; label: string; hint: string; icon: typeof Users }[] }[] = [
  { title: 'Tổng quan', items: [{ id: 'stats', label: 'Thống kê', hint: 'Người chơi, giờ chơi, doanh thu', icon: BarChart3 }] },
  { title: 'Người chơi', items: [
    { id: 'accounts', label: 'Tài khoản', hint: 'Tìm, nạp FC, tặng quà, hạng, khoá', icon: Users },
    { id: 'fc', label: 'Nạp FC & sổ cái', hint: 'Cộng FC theo bill, xem giao dịch', icon: Coins },
    { id: 'gift', label: 'Gift code', hint: 'Tạo và quản lý mã quà', icon: Gift },
  ] },
  { title: 'An ninh', items: [
    { id: 'guard', label: 'Chống gian lận', hint: 'Bảo vệ một chạm, sổ nghi vấn, khoá nhanh', icon: ShieldCheck },
    { id: 'audit', label: 'Bất thường', hint: 'Bản lưu tăng BP / thẻ bất thường', icon: ShieldAlert },
    { id: 'clones', label: 'Nghi clone', hint: 'Nhiều tài khoản cùng thiết bị / IP', icon: Copy },
  ] },
  { title: 'Hệ thống', items: [
    { id: 'inventory', label: 'Kho thẻ', hint: 'Đồng bộ dữ liệu cầu thủ, gói, giá', icon: Boxes },
    { id: 'maintenance', label: 'Bảo trì', hint: 'Đóng game, thông báo người chơi', icon: Wrench },
  ] },
];
const TAB_KEY = 'fco-admin-tab';
const savedTab = (): Tab => { try { const v = localStorage.getItem(TAB_KEY) as Tab | null; return v && GROUPS.some(g => g.items.some(i => i.id === v)) ? v : 'stats'; } catch { return 'stats'; } };

// Đếm việc cần xử lý cho huy hiệu thanh bên (mỗi phút một lần; lỗi thì bỏ qua huy hiệu đó).
async function loadBadges(): Promise<Badges> {
  const [audit, clones, maintenance, inventory, local, guard] = await Promise.allSettled([adminAnomalies(), adminCloneGroups(), fetchMaintenanceState(), fetchInventoryState(), catalogVersion(), adminGuardSummary()]);
  const ok = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : undefined;
  const inv = ok(inventory), ver = ok(local);
  return {
    audit: ok(audit)?.length,
    clones: ok(clones)?.filter(g => !g.allowed).length,
    maintenance: ok(maintenance)?.enabled,
    inventory: inv ? (inv.version !== ver ? 'sync' : !inv.enforced ? 'off' : null) : null,
    // Chống gian lận: chưa bắt buộc kho / dữ liệu lệch thì báo đỏ, không thì số HLV nghi vấn mới.
    guard: inv && (!inv.enforced || inv.version !== ver) ? 'off' : ok(guard)?.suspects,
  };
}

// initialTab: nút khiên trên thanh trên cùng mở thẳng mục Chống gian lận.
export default function AdminPanel({ onClose, initialTab }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTabState] = useState<Tab>(() => initialTab ?? savedTab());
  const [badges, setBadges] = useState<Badges>({});
  const [query, setQuery] = useState('');
  // Tìm người chơi ở đầu trang: mở Tài khoản với từ khoá (key đổi để danh sách tải lại theo từ khoá mới).
  const [find, setFind] = useState({ text: '', n: 0 });
  const setTab = (next: Tab) => { setTabState(next); try { localStorage.setItem(TAB_KEY, next); } catch { /* chỉ nhớ trong phiên */ } };
  useEffect(() => { const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [onClose]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadBadges().then(b => { if (alive) setBadges(b); }).catch(() => {}); };
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [tab]);
  const badgeOf = (id: Tab) => {
    if (id === 'guard' && badges.guard === 'off') return <b className="pa-nav-badge is-danger">Chưa bảo vệ</b>;
    if (id === 'guard' && typeof badges.guard === 'number' && badges.guard > 0) return <b className="pa-nav-badge is-danger">{badges.guard > 99 ? '99+' : badges.guard}</b>;
    if (id === 'audit' && badges.audit) return <b className="pa-nav-badge is-warn">{badges.audit > 99 ? '99+' : badges.audit}</b>;
    if (id === 'clones' && badges.clones) return <b className="pa-nav-badge is-warn">{badges.clones > 99 ? '99+' : badges.clones}</b>;
    if (id === 'maintenance' && badges.maintenance) return <b className="pa-nav-badge is-danger">Đang bật</b>;
    if (id === 'inventory' && badges.inventory === 'sync') return <b className="pa-nav-badge is-danger">Cần đồng bộ</b>;
    if (id === 'inventory' && badges.inventory === 'off') return <b className="pa-nav-badge is-warn">Chưa bắt buộc</b>;
    return null;
  };
  const current = GROUPS.flatMap(g => g.items).find(i => i.id === tab)!;
  const search = (event: FormEvent) => { event.preventDefault(); const text = query.trim(); setFind(f => ({ text, n: f.n + 1 })); setTab('accounts'); };
  return <div className="pack-admin pa-admin" role="dialog" aria-modal="true" aria-label="Quản trị FCO VIP">
    <header className="pa-header pa-admin-header">
      <div className="pa-admin-title"><h1>Quản trị FCO VIP</h1><p>Chỉ tài khoản admin thấy trang này · mọi thao tác được máy chủ kiểm tra quyền</p></div>
      <form className="pa-admin-search" role="search" onSubmit={search}>
        <Search size={16} aria-hidden="true"/>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm người chơi: tên đăng nhập, Gmail…" aria-label="Tìm người chơi" spellCheck={false}/>
        <button type="submit" className="primary-button">Tìm</button>
      </form>
      <button className="icon-button" onClick={onClose} aria-label="Đóng trang quản trị"><X/></button>
    </header>
    <div className="pa-body pa-admin-body">
      <nav className="pa-list pa-admin-nav" aria-label="Mục quản trị">
        {GROUPS.map(group => <div key={group.title} className="pa-nav-group">
          <h2>{group.title}</h2>
          {group.items.map(item => <button key={item.id} type="button" className="pa-nav-item" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
            <item.icon size={18} aria-hidden="true"/>
            <span><b>{item.label}</b><small>{item.hint}</small></span>
            {badgeOf(item.id)}
          </button>)}
        </div>)}
      </nav>
      <main className="pa-admin-main" aria-label={current.label}>
        <div className="pa-admin-crumb"><current.icon size={16} aria-hidden="true"/><span>{GROUPS.find(g => g.items.includes(current))!.title}</span><b>{current.label}</b></div>
        {tab === 'stats' ? <Stats/> : tab === 'accounts' ? <Accounts key={find.n} initialSearch={find.text}/> : tab === 'fc' ? <CreditFc/> : tab === 'guard' ? <GuardPanel onOpenTab={setTab} onFind={text => { setFind(f => ({ text, n: f.n + 1 })); setTab('accounts'); }}/> : tab === 'audit' ? <Anomalies/> : tab === 'clones' ? <CloneSuspects/> : tab === 'maintenance' ? <MaintenancePanel/> : tab === 'inventory' ? <InventoryAdmin/> : <GiftCodeAdmin packs={packs.filter(pack => !pack.draft).map(pack => ({ id: pack.id, name: pack.name }))}/>}
      </main>
    </div>
  </div>;
}
