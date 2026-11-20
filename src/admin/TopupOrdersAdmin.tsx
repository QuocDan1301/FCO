import { useEffect, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { money, packs } from '../game';
import type { EventReward } from '../game';
import { giftRewardText } from '../gift-codes';
import { adminTopupDecide, adminTopupMilestones, adminTopupMilestonesSave, adminTopupOrders, adminTopupTiersSave, fetchTopupConfig } from '../wallet';
import { TOPUP_STATUS } from '../topup-orders';
import type { AdminTopupList, AdminTopupOrder, TopupConfig, TopupMilestone, TopupTier } from '../topup-orders';

// Quản trị FC → Đơn nạp (migration 202611200002_fco_topup_orders.sql): duyệt / từ chối đơn nạp một chạm, sửa mốc khuyến mãi.
// Duyệt = máy chủ cộng FC gốc (tính doanh thu + Top Đặc Huấn) + FC khuyến mãi (không tính) theo số đã lưu trong đơn.
type Filter = 'open' | 'approved' | 'rejected' | 'all';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'open', label: 'Chờ duyệt' }, { id: 'approved', label: 'Đã duyệt' }, { id: 'rejected', label: 'Từ chối / huỷ' }, { id: 'all', label: 'Tất cả' }];
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const time = (ms: number | null) => ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '';
export type TopupAdminApi = { list: (f: Filter, q: string) => Promise<AdminTopupList>; decide: (id: number, ok: boolean, note: string) => Promise<AdminTopupOrder>;
  config: () => Promise<TopupConfig>; saveTiers: (t: TopupTier[]) => Promise<TopupTier[]>;
  milestones: () => Promise<TopupMilestone[]>; saveMilestones: (l: { fc: number; rewards: EventReward[] }[]) => Promise<TopupMilestone[]> };
const LIVE: TopupAdminApi = { list: adminTopupOrders, decide: adminTopupDecide, config: fetchTopupConfig, saveTiers: adminTopupTiersSave,
  milestones: adminTopupMilestones, saveMilestones: adminTopupMilestonesSave };

// Mốc nạp tích luỹ (202611200003): mỗi mốc = tổng FC đã nạp + 1–10 phần quà (gói / BP / FC). Người đã nhận mốc giữ nguyên khi sửa.
type RewardRow = { kind: 'pack' | 'bp' | 'fc'; amount: string; pack: string };
type MsRow = { fc: string; rewards: RewardRow[]; claims?: number };
const toRow = (r: EventReward): RewardRow => 'pack' in r ? { kind: 'pack', amount: String(r.count), pack: r.pack } : 'bp' in r ? { kind: 'bp', amount: String(r.bp), pack: '' } : { kind: 'fc', amount: String(r.fc), pack: '' };
const digits = (s: string) => Number(s.replace(/[.\s]/g, ''));
function MilestoneEditor({ api }: { api: TopupAdminApi }) {
  const [rows, setRows] = useState<MsRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const options = packs.filter(p => !p.draft);
  const fill = (list: TopupMilestone[]) => setRows(list.map(m => ({ fc: String(m.fc), rewards: m.rewards.map(toRow), claims: m.claims })));
  useEffect(() => { void api.milestones().then(fill).catch(e => setMsg({ ok: false, text: (e as Error).message })); }, []);
  if (!rows) return null;
  const edit = (i: number, next: Partial<MsRow>) => setRows(rows.map((r, j) => j === i ? { ...r, ...next } : r));
  const editReward = (i: number, k: number, next: Partial<RewardRow>) => edit(i, { rewards: rows[i].rewards.map((r, j) => j === k ? { ...r, ...next } : r) });
  const save = () => {
    setMsg(null);
    const list = rows.filter(r => r.fc.trim()).map(r => ({ fc: digits(r.fc), rewards: r.rewards.map(w => { const n = digits(w.amount); return w.kind === 'pack' ? { pack: w.pack, count: n } : w.kind === 'bp' ? { bp: n } : { fc: n }; }) as EventReward[] }));
    if (list.some(m => !Number.isSafeInteger(m.fc) || m.fc <= 0 || !m.rewards.length || m.rewards.some(r => ('pack' in r && !r.pack) || !Object.values(r).every(v => typeof v === 'string' || (Number.isSafeInteger(v) && (v as number) > 0)))))
      return setMsg({ ok: false, text: 'Mỗi mốc cần số FC nguyên dương và ít nhất 1 phần quà có số lượng (chọn gói nếu là quà gói).' });
    void api.saveMilestones(list).then(saved => { fill(saved.map(s => ({ ...s, claims: rows.find(r => digits(r.fc) === s.fc)?.claims }))); setMsg({ ok: true, text: `Đã lưu ${saved.length} mốc. Người chơi thấy ngay ở trang nạp.` }); })
      .catch(e => setMsg({ ok: false, text: (e as Error).message }));
  };
  return <section className="tpa-tiers tpa-ms" aria-label="Mốc nạp tích luỹ">
    <h3>Mốc nạp tích luỹ</h3>
    <p className="pa-gift-note">Tính theo tổng FC đã nạp của người chơi (nạp theo bill + FC gốc của đơn nạp; không tính khuyến mãi, quà). Đạt mốc thì người chơi bấm Nhận ở trang nạp, mỗi mốc một lần. FC cộng ngay; gói / BP vào Quà từ Admin.</p>
    {rows.map((r, i) => <div key={i} className="tpa-ms-row">
      <div className="tpa-ms-top"><label className="pa-field"><span>Mốc (FC đã nạp)</span><input value={r.fc} inputMode="numeric" onChange={e => edit(i, { fc: e.target.value.replace(/[^\d.]/g, '').slice(0, 16) })}/></label>
        {r.claims ? <small>{money(r.claims)} người đã nhận</small> : null}
        <button type="button" className="icon-button" aria-label="Xoá mốc" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15}/></button></div>
      {r.rewards.map((w, k) => <div key={k} className="tpa-ms-reward">
        <select value={w.kind} onChange={e => editReward(i, k, { kind: e.target.value as RewardRow['kind'] })}><option value="pack">Gói</option><option value="bp">BP</option><option value="fc">FC</option></select>
        {w.kind === 'pack' && <select value={w.pack} onChange={e => editReward(i, k, { pack: e.target.value })}><option value="">Chọn gói…</option>{options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <input value={w.amount} inputMode="numeric" placeholder={w.kind === 'pack' ? 'số gói' : w.kind === 'bp' ? 'số BP' : 'số FC'} onChange={e => editReward(i, k, { amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 20) })}/>
        <button type="button" className="icon-button" aria-label="Bỏ phần quà" onClick={() => edit(i, { rewards: r.rewards.filter((_, j) => j !== k) })}><X size={14}/></button>
      </div>)}
      <button type="button" className="secondary-button tpa-ms-add" disabled={r.rewards.length >= 10} onClick={() => edit(i, { rewards: [...r.rewards, { kind: 'pack', amount: '1', pack: '' }] })}><Plus size={14}/>Thêm quà</button>
      {r.rewards.length > 0 && <small className="tpa-ms-preview">{r.rewards.map(w => { const n = digits(w.amount); return n > 0 ? giftRewardText(w.kind === 'pack' ? { pack: w.pack, count: n } : w.kind === 'bp' ? { bp: n } : { fc: n }) : ''; }).filter(Boolean).join(' · ')}</small>}
    </div>)}
    <div className="pa-row"><button type="button" className="secondary-button" onClick={() => setRows([...rows, { fc: '', rewards: [{ kind: 'pack', amount: '1', pack: '' }] }])}><Plus size={15}/>Thêm mốc</button>
      <button type="button" className="primary-button" onClick={save}>Lưu mốc tích luỹ</button></div>
    {msg && <p className={`pa-message ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
  </section>;
}

function TierEditor({ api }: { api: TopupAdminApi }) {
  const [rows, setRows] = useState<{ vnd: string; bonus: string }[] | null>(null);
  const [rate, setRate] = useState(5000);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.config().then(c => { setRate(c.vndPer1000); setRows(c.tiers.map(t => ({ vnd: String(t.vnd), bonus: String(t.bonus) }))); }).catch(e => setMsg({ ok: false, text: (e as Error).message }));
  useEffect(() => { void load(); }, []);
  if (!rows) return null;
  const num = (s: string) => Number(s.replace(/[.\s]/g, ''));
  const set = (i: number, key: 'vnd' | 'bonus', v: string) => setRows(rows.map((r, j) => j === i ? { ...r, [key]: v.replace(/[^\d.]/g, '').slice(0, 13) } : r));
  const save = () => { setMsg(null); const tiers = rows.filter(r => r.vnd.trim()).map(r => ({ vnd: num(r.vnd), bonus: num(r.bonus) || 0 }));
    void api.saveTiers(tiers).then(saved => { setRows(saved.map(t => ({ vnd: String(t.vnd), bonus: String(t.bonus) }))); setMsg({ ok: true, text: `Đã lưu ${saved.length} mốc. Người chơi thấy ngay ở trang nạp.` }); })
      .catch(e => setMsg({ ok: false, text: (e as Error).message })); };
  return <section className="tpa-tiers" aria-label="Mốc khuyến mãi">
    <h3>Mốc khuyến mãi</h3>
    <p className="pa-gift-note">Đơn nạp đạt mốc nào nhận FC khuyến mãi của mốc đó (mốc cao nhất không vượt số tiền). Tỉ giá: {vnd(rate)} = 1.000 FC. Sửa mốc chỉ áp cho đơn tạo sau đó.</p>
    <div className="tpa-tier-rows">
      {rows.map((r, i) => { const v = num(r.vnd), b = num(r.bonus) || 0, base = v ? Math.floor(v * 1000 / rate) : 0;
        return <div key={i} className="tpa-tier-row">
          <label className="pa-field"><span>Mốc (VND)</span><input value={r.vnd} inputMode="numeric" onChange={e => set(i, 'vnd', e.target.value)}/></label>
          <label className="pa-field"><span>FC khuyến mãi</span><input value={r.bonus} inputMode="numeric" onChange={e => set(i, 'bonus', e.target.value)}/></label>
          <small>{v ? `${money(base)} + ${money(b)} = ${money(base + b)} FC${base ? ` (+${Math.round(b / base * 100)}%)` : ''}` : ''}</small>
          <button type="button" className="icon-button" aria-label="Xoá mốc" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15}/></button>
        </div>; })}
    </div>
    <div className="pa-row"><button type="button" className="secondary-button" onClick={() => setRows([...rows, { vnd: '', bonus: '' }])}><Plus size={15}/>Thêm mốc</button>
      <button type="button" className="primary-button" onClick={save}>Lưu mốc</button></div>
    {msg && <p className={`pa-message ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>}
  </section>;
}

export default function TopupOrdersAdmin({ api = LIVE, onChanged }: { api?: TopupAdminApi; onChanged?: () => void }) {
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<AdminTopupList | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const load = (f = filter, q = query) => api.list(f, q.trim()).then(d => { setData(d); setError(''); }).catch(e => setError((e as Error).message));
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20_000); return () => clearInterval(t); }, [filter]);
  const decide = (o: AdminTopupOrder, approve: boolean) => {
    let note = '';
    if (approve) { if (!confirm(`Duyệt đơn ${o.code}?\n${o.login} chuyển ${vnd(o.vnd)} → cộng ${money(o.baseFc)} FC${o.bonusFc ? ` + ${money(o.bonusFc)} FC khuyến mãi` : ''}.`)) return; }
    else { const r = prompt(`Từ chối đơn ${o.code} (${vnd(o.vnd)} của ${o.login})? Lý do người chơi sẽ thấy:`, 'Chưa nhận được tiền'); if (r === null) return; note = r; }
    setBusyId(o.id); setNotice(''); setError('');
    void api.decide(o.id, approve, note).then(r => { setNotice(r.repeat ? `Đơn ${o.code} đã được xử lý trước đó (${TOPUP_STATUS[r.status]}).` : approve ? `Đã duyệt ${o.code}: +${money(o.baseFc + o.bonusFc)} FC cho ${o.login}.` : `Đã từ chối ${o.code}.`); onChanged?.(); return load(); })
      .catch(e => setError((e as Error).message)).finally(() => setBusyId(null));
  };
  const c = data?.counts;
  return <section className="pa-form tpa" aria-label="Đơn nạp">
    <div className="pa-row"><h2 className="pa-gift-title">Đơn nạp</h2><button type="button" className="secondary-button pa-gift-random" onClick={() => void load()}><RotateCcw size={15}/>Tải lại</button></div>
    {c && <div className="pa-account-summary tpa-counts">
      <span><small>Đã báo chuyển</small><b className={c.paid ? 'tpa-hot' : undefined}>{c.paid}</b></span>
      <span><small>Chưa báo chuyển</small><b>{c.pending}</b></span>
      <span><small>Duyệt hôm nay</small><b>{c.approvedToday}</b></span>
      <span><small>Tiền hôm nay</small><b>{vnd(c.vndToday)}</b></span>
    </div>}
    <div className="pa-status-filter" role="group" aria-label="Lọc đơn">
      {FILTERS.map(f => <button key={f.id} type="button" className={`secondary-button ${filter === f.id ? 'is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}{f.id === 'open' && c ? <b>{c.paid + c.pending}</b> : null}</button>)}
    </div>
    <form className="pa-row" onSubmit={e => { e.preventDefault(); void load(); }}>
      <label className="pa-field"><span>Tìm mã đơn / Gmail</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="vd. FCO7K2P9Q hoặc gmail" spellCheck={false}/></label>
      <button type="submit" className="secondary-button">Tìm</button>
    </form>
    {error && <p className="pa-message is-error" role="alert">{error}</p>}
    {notice && <p className="pa-message is-ok" role="status">{notice}</p>}
    {data && !data.orders.length && <p className="pa-empty">Không có đơn nào.</p>}
    <div className="tpa-list">
      {data?.orders.map(o => <article key={o.id} className={`tpa-order is-${o.status}`}>
        <div className="tpa-main">
          <b className="tpa-money">{vnd(o.vnd)}</b>
          <span className="tpa-code">{o.code}</span>
          <span className={`tp-chip is-${o.status}`}>{TOPUP_STATUS[o.status]}</span>
        </div>
        <div className="tpa-who"><b>{o.name}</b><small>{o.login}</small></div>
        <div className="tpa-fc">{money(o.baseFc)} FC{o.bonusFc > 0 && <em> + {money(o.bonusFc)} KM</em>}</div>
        <small className="tpa-time">Tạo {time(o.createdAt)}{o.paidAt ? ` · báo chuyển ${time(o.paidAt)}` : ''}{o.decidedAt ? ` · xử lý ${time(o.decidedAt)}` : ''}{o.adminNote ? ` · ${o.adminNote}` : ''}</small>
        {(o.status === 'pending' || o.status === 'paid') && <div className="tpa-actions">
          <button type="button" className="primary-button" disabled={busyId !== null} onClick={() => decide(o, true)}><Check size={15}/>Duyệt</button>
          <button type="button" className="secondary-button" disabled={busyId !== null} onClick={() => decide(o, false)}><X size={15}/>Từ chối</button>
        </div>}
      </article>)}
    </div>
    <TierEditor api={api}/>
    <MilestoneEditor api={api}/>
  </section>;
}
