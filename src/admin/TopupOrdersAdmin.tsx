import { useEffect, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { money, packs } from '../game';
import { adminTopupDecide, adminTopupEventEnd, adminTopupEvents, adminTopupEventSave, adminTopupGiftTiers, adminTopupGiftTiersSave, adminTopupOrders, adminTopupTiersSave, fetchTopupConfig } from '../wallet';
import { giftRewardText, TOPUP_STATUS } from '../topup-orders';
import type { AdminTopupEvent, AdminTopupEvents, AdminTopupGifts, AdminTopupList, AdminTopupOrder, TopupConfig, TopupGiftReward, TopupGiftTier, TopupTier } from '../topup-orders';

// Quản trị FC → Đơn nạp (migration 202611200002_fco_topup_orders.sql): duyệt / từ chối đơn nạp một chạm, sửa mốc khuyến mãi.
// Duyệt = máy chủ cộng FC gốc của đơn (tính doanh thu + Top Đặc Huấn). KM tính theo tổng nạp cộng dồn, người chơi tự nhận (202611200004).
type Filter = 'open' | 'approved' | 'rejected' | 'all';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'open', label: 'Chờ duyệt' }, { id: 'approved', label: 'Đã duyệt' }, { id: 'rejected', label: 'Từ chối / huỷ' }, { id: 'all', label: 'Tất cả' }];
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const time = (ms: number | null) => ms ? new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '';
export type TopupAdminApi = { list: (f: Filter, q: string) => Promise<AdminTopupList>; decide: (id: number, ok: boolean, note: string) => Promise<AdminTopupOrder>;
  config: () => Promise<TopupConfig>; saveTiers: (t: TopupTier[]) => Promise<TopupTier[]>;
  events: () => Promise<AdminTopupEvents>; saveEvent: (id: number | null, title: string, s: Date, e: Date) => Promise<AdminTopupEvents>; endEvent: (id: number) => Promise<AdminTopupEvents>;
  gifts?: () => Promise<AdminTopupGifts>; saveGifts?: (t: TopupGiftTier[]) => Promise<AdminTopupGifts> };
const LIVE: TopupAdminApi = { list: adminTopupOrders, decide: adminTopupDecide, config: fetchTopupConfig, saveTiers: adminTopupTiersSave,
  events: adminTopupEvents, saveEvent: adminTopupEventSave, endEvent: adminTopupEventEnd, gifts: adminTopupGiftTiers, saveGifts: adminTopupGiftTiersSave };

// Sự kiện nạp tích luỹ (202611200005): ngoài thời gian sự kiện không có KM tích luỹ. Giờ nhập theo giờ máy admin (giờ Việt Nam).
const localInput = (ms: number) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const dt = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function EventEditor({ api }: { api: TopupAdminApi }) {
  const [data, setData] = useState<AdminTopupEvents | null>(null);
  const [form, setForm] = useState<{ id: number | null; title: string; start: string; end: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.events().then(setData).catch(e => setMsg({ ok: false, text: (e as Error).message }));
  useEffect(() => { void load(); }, []);
  if (!data) return msg ? <p className="pa-message is-error">{msg.text}</p> : null;
  const now = Date.now(), graceMs = data.claimDays * 86_400_000;
  const status = (e: AdminTopupEvent) => now < e.startsAt ? ['Sắp diễn ra', 'is-soon'] : now < e.endsAt ? ['Đang diễn ra', 'is-live'] : graceMs > 0 && now < e.endsAt + graceMs ? [`Đã kết thúc · nhận quà tới ${dt(e.endsAt + graceMs)}`, 'is-grace'] : ['Đã kết thúc', 'is-closed'];
  const startNew = () => { const s = Date.now(); setForm({ id: null, title: 'Nạp tích luỹ', start: localInput(s), end: localInput(s + 3 * 86_400_000) }); setMsg(null); };
  const save = () => { if (!form) return; const s = new Date(form.start), e = new Date(form.end);
    if (!(e > s)) return setMsg({ ok: false, text: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    void api.saveEvent(form.id, form.title, s, e).then(d => { setData(d); setForm(null); setMsg({ ok: true, text: 'Đã lưu sự kiện. Người chơi thấy thanh tích luỹ khi tới giờ bắt đầu.' }); }).catch(err => setMsg({ ok: false, text: (err as Error).message })); };
  const end = (e: AdminTopupEvent) => { if (!confirm(now < e.startsAt ? `Xoá sự kiện "${e.title}" (chưa bắt đầu)?` : `Kết thúc ngay "${e.title}"? Sự kiện tắt hẳn: không còn khuyến mãi tích luỹ, đơn chưa duyệt sẽ không được tính.`)) return;
    void api.endEvent(e.id).then(d => { setData(d); setMsg({ ok: true, text: 'Đã cập nhật sự kiện.' }); }).catch(err => setMsg({ ok: false, text: (err as Error).message })); };
  return <section className="tpa-tiers tpa-events" aria-label="Sự kiện nạp tích luỹ">
    <div className="pa-row"><h3>Sự kiện nạp tích luỹ</h3>{!form && <button type="button" className="primary-button" onClick={startNew}><Plus size={15}/>Tạo sự kiện</button>}</div>
    <p className="pa-gift-note">Chỉ trong thời gian sự kiện người chơi mới thấy thanh và được tự cộng FC khuyến mãi theo tổng tiền nạp (mốc ở phần dưới). Hết giờ là sự kiện tắt hẳn: nhớ duyệt các đơn của người chơi TRƯỚC giờ kết thúc để họ được tính khuyến mãi. Mỗi sự kiện tính lại từ đầu.</p>
    {form && <div className="tpa-event-form">
      <label className="pa-field"><span>Tên sự kiện</span><input value={form.title} maxLength={60} onChange={e => setForm({ ...form, title: e.target.value })}/></label>
      <label className="pa-field"><span>Bắt đầu</span><input type="datetime-local" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })}/></label>
      <label className="pa-field"><span>Kết thúc</span><input type="datetime-local" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })}/></label>
      <div className="pa-row"><button type="button" className="primary-button" onClick={save}>{form.id ? 'Lưu thay đổi' : 'Tạo sự kiện'}</button><button type="button" className="secondary-button" onClick={() => setForm(null)}>Huỷ</button></div>
    </div>}
    {!data.events.length && !form && <p className="pa-empty">Chưa có sự kiện nào. Hiện người chơi không thấy khuyến mãi tích luỹ.</p>}
    {data.events.map(e => { const [label, cls] = status(e);
      return <div key={e.id} className="tpa-event">
        <div><b>{e.title}</b><small>{dt(e.startsAt)} → {dt(e.endsAt)}</small></div>
        <span className={`tpa-event-status ${cls}`}>{label}</span>
        <small>{money(e.players)} người nhận · {money(e.claims)} lượt · {money(e.bonusFc)} FC KM</small>
        {now < e.endsAt && <div className="tpa-actions"><button type="button" className="secondary-button" onClick={() => setForm({ id: e.id, title: e.title, start: localInput(e.startsAt), end: localInput(e.endsAt) })}>Sửa</button>
          <button type="button" className="secondary-button" onClick={() => end(e)}>{now < e.startsAt ? 'Xoá' : 'Kết thúc ngay'}</button></div>}
      </div>; })}
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
    <h3>Mốc khuyến mãi (tích luỹ)</h3>
    <p className="pa-gift-note">Dùng trong sự kiện nạp tích luỹ: tổng tiền người chơi nạp trong thời gian sự kiện qua mốc nào thì máy chủ TỰ CỘNG FC khuyến mãi của mốc đó ngay lúc duyệt đơn / nạp bill, mỗi mốc một lần mỗi sự kiện. Ngoài sự kiện đơn nạp chỉ cộng FC gốc. Tỉ giá: {vnd(rate)} = 1.000 FC. Các ô bên dưới cũng là nút chọn nhanh số tiền ở trang nạp.</p>
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

// Mốc quà tích luỹ (202611250004): song song mốc FC, cùng sự kiện. Mỗi mốc 1–10 phần quà: gói cầu thủ (mã gói + số lượng), BP hoặc STP.
type GiftKind = 'pack' | 'bp' | 'stp';
type GiftDraft = { kind: GiftKind; pack: string; amount: string };
const toDraft = (r: TopupGiftReward): GiftDraft => 'pack' in r ? { kind: 'pack', pack: r.pack, amount: String(r.count) } : 'bp' in r ? { kind: 'bp', pack: '', amount: String(r.bp) } : { kind: 'stp', pack: '', amount: String(r.stp) };
const packLabel = (id: string) => packs.find(p => p.id === id)?.name ?? id;
function GiftTierEditor({ api }: { api: TopupAdminApi }) {
  const [rows, setRows] = useState<{ vnd: string; rewards: GiftDraft[]; claims: number }[] | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = (d: AdminTopupGifts) => { setEventTitle(d.event?.title ?? ''); setRows(d.tiers.map(t => ({ vnd: String(t.vnd), rewards: t.rewards.map(toDraft), claims: t.claims }))); };
  useEffect(() => { void api.gifts?.().then(apply).catch(e => setMsg({ ok: false, text: (e as Error).message })); }, []);
  if (!api.gifts || !api.saveGifts) return null;
  if (!rows) return msg ? <p className="pa-message is-error">{msg.text}</p> : null;
  const num = (s: string) => Number(s.replace(/[.\s]/g, ''));
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const setGift = (i: number, k: number, patch: Partial<GiftDraft>) => setRow(i, { rewards: rows[i].rewards.map((g, j) => j === k ? { ...g, ...patch } : g) });
  const toReward = (g: GiftDraft): TopupGiftReward => g.kind === 'pack' ? { pack: g.pack.trim(), count: num(g.amount) || 1 } : g.kind === 'bp' ? { bp: num(g.amount) } : { stp: num(g.amount) };
  const save = () => { setMsg(null);
    const tiers = rows.filter(r => r.vnd.trim()).map(r => ({ vnd: num(r.vnd), rewards: r.rewards.filter(g => g.kind === 'pack' ? g.pack.trim() : num(g.amount) > 0).map(toReward) }));
    if (tiers.some(t => !t.rewards.length)) return setMsg({ ok: false, text: 'Mỗi mốc cần ít nhất một phần quà.' });
    const unknown = tiers.flatMap(t => t.rewards).filter((r): r is { pack: string; count: number } => 'pack' in r && !packs.some(p => p.id === r.pack));
    if (unknown.length) return setMsg({ ok: false, text: `Không có gói: ${unknown.map(r => r.pack).join(', ')}.` });
    void api.saveGifts!(tiers).then(d => { apply(d); setMsg({ ok: true, text: `Đã lưu ${d.tiers.length} mốc quà. Người chơi thấy ở trang nạp khi đang có sự kiện.` }); }).catch(e => setMsg({ ok: false, text: (e as Error).message })); };
  return <section className="tpa-tiers tpa-gifts" aria-label="Mốc quà tích luỹ">
    <h3>Mốc quà tích luỹ (gói / BP / STP)</h3>
    <p className="pa-gift-note">Chạy song song mốc FC khuyến mãi ở trên, cùng sự kiện nạp tích luỹ và cùng tổng tiền nạp trong sự kiện. Qua mốc nào máy chủ TỰ TRAO quà mốc đó ngay lúc duyệt đơn / nạp bill, mỗi mốc một lần mỗi sự kiện: gói + BP vào kho khi người chơi vào game, STP cộng thẳng. Ngoài sự kiện không có quà.{eventTitle && <> Số người đã nhận tính theo sự kiện gần nhất: <b>{eventTitle}</b>.</>}</p>
    <datalist id="tpa-gift-packs">{packs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</datalist>
    <div className="tpa-gift-rows">
      {rows.map((r, i) => <div key={i} className="tpa-gift-row">
        <div className="tpa-tier-row">
          <label className="pa-field"><span>Mốc (VND)</span><input value={r.vnd} inputMode="numeric" onChange={e => setRow(i, { vnd: e.target.value.replace(/[^\d.]/g, '').slice(0, 13) })}/></label>
          <small>{r.claims ? `${money(r.claims)} người đã nhận` : ''}</small>
          <button type="button" className="icon-button" aria-label="Xoá mốc" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={15}/></button>
        </div>
        {r.rewards.map((g, k) => <div key={k} className="tpa-gift-item">
          <select value={g.kind} aria-label="Loại quà" onChange={e => setGift(i, k, { kind: e.target.value as GiftKind })}><option value="pack">Gói cầu thủ</option><option value="bp">BP</option><option value="stp">STP</option></select>
          {g.kind === 'pack' && <input list="tpa-gift-packs" value={g.pack} placeholder="Mã gói" aria-label="Mã gói" onChange={e => setGift(i, k, { pack: e.target.value.trim().slice(0, 64) })}/>}
          <input value={g.amount} inputMode="numeric" placeholder={g.kind === 'pack' ? 'Số gói' : g.kind === 'bp' ? 'Số BP' : 'Số STP'} aria-label="Số lượng" onChange={e => setGift(i, k, { amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 19) })}/>
          <small>{g.kind === 'pack' ? (g.pack ? packLabel(g.pack) : '') : giftRewardText(toReward(g))}</small>
          <button type="button" className="icon-button" aria-label="Xoá phần quà" onClick={() => setRow(i, { rewards: r.rewards.filter((_, j) => j !== k) })}><X size={14}/></button>
        </div>)}
        {r.rewards.length < 10 && <button type="button" className="secondary-button tpa-gift-add" onClick={() => setRow(i, { rewards: [...r.rewards, { kind: 'pack', pack: '', amount: '1' }] })}><Plus size={14}/>Thêm phần quà</button>}
      </div>)}
    </div>
    <div className="pa-row"><button type="button" className="secondary-button" onClick={() => setRows([...rows, { vnd: '', rewards: [{ kind: 'pack', pack: '', amount: '1' }], claims: 0 }])}><Plus size={15}/>Thêm mốc quà</button>
      <button type="button" className="primary-button" onClick={save}>Lưu mốc quà</button></div>
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
    <EventEditor api={api}/>
    <TierEditor api={api}/>
    <GiftTierEditor api={api}/>
  </section>;
}
