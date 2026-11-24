import { useEffect, useMemo, useState } from 'react';
import { ovrStyle } from './ovr-color';
import { Shirt } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import { SYSTEM_TAKEOVER_MIN, marketNow } from './market';
import type { MarketPending, MyOrder } from './inventory-server';
import { SeasonBadge } from './badges';
import { positionGroup } from './squad';
import { faceOf } from './portraits';
import './market-detail.css';

// Tab "Lịch sử chuyển nhượng" ở TTCN (chợ giữa người chơi), bố cục kiểu FC Online: mỗi dòng một nhóm lệnh giống nhau
// (cùng loại, cầu thủ, cấp, giá, trạng thái): lệnh đang treo + giao dịch thành công còn chờ nhận (migration 202611170011).
// Tick chọn lệnh đang treo để Bán lại / Huỷ. Hai nút Nhận tất cả chỉ hiện khi có thẻ mua được / BP bán được đang chờ.
type Props = {
  load: () => Promise<MyOrder[]>;
  onCancel: (orderId: number) => Promise<boolean>;
  onRefreshClaims?: () => void | Promise<void>;
  // Bán lại: lệnh bán đã chọn được huỷ (thẻ về kho) rồi mở cửa sổ Bán hàng loạt để treo giá mới.
  onRelist?: () => void;
  pending?: MarketPending;
  onTake?: (kind: 'buy' | 'sell') => Promise<boolean>;
  levelBadge: (level: number) => string;
};
type Group = { key: string; ids: number[]; order: MyOrder; open: boolean; claimBp: number };
const STATUS_ORDER: Record<MyOrder['status'], number> = { open: 0, filled: 1, system: 2, expired: 3, cancelled: 4 };
const statusText = (o: MyOrder) => o.status === 'open' ? (o.side === 'sell' ? 'Đang bán' : 'Đang mua')
  : o.status === 'filled' ? (o.side === 'sell' ? 'Đã bán' : 'Đã mua') : o.status === 'system' ? 'Hệ thống nhận' : o.status === 'expired' ? 'Hết hạn' : 'Đã hủy';
const left = (ms: number) => { if (ms <= 0) return 'sắp xử lý'; const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} giờ ${m} phút` : m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s} giây`; };
const when = (at: number) => new Date(at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

export default function MarketOrders({ load, onCancel, onRefreshClaims, onRelist, pending, onTake, levelBadge }: Props) {
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => marketNow());
  const [tick, setTick] = useState(0);
  const [statusAsc, setStatusAsc] = useState(true);
  const [checked, setChecked] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let alive = true;
    load().then(rows => { if (alive) { setOrders(rows); setError(false); } }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [tick]);
  useEffect(() => {
    void onRefreshClaims?.();
    const clock = window.setInterval(() => setNow(marketNow()), 1000);
    const poll = window.setInterval(() => { setTick(t => t + 1); void onRefreshClaims?.(); }, 15_000);
    return () => { window.clearInterval(clock); window.clearInterval(poll); };
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const o of orders ?? []) {
      if (o.status !== 'open' && !o.pending) continue;   // đang treo hoặc còn phần chờ nhận; đã nhận / huỷ / hết hạn thì ẩn
      const price = o.fillPrice ?? o.price;
      const key = `${o.side}:${o.playerId}:${o.level}:${price}:${o.status}`;
      const g = map.get(key);
      if (g) { g.ids.push(o.id); g.claimBp += o.claimBp ?? 0; if (o.createdAt < g.order.createdAt) g.order = o; } else map.set(key, { key, ids: [o.id], order: o, open: o.status === 'open', claimBp: o.claimBp ?? 0 });
    }
    return [...map.values()].sort((a, b) => (statusAsc ? 1 : -1) * (STATUS_ORDER[a.order.status] - STATUS_ORDER[b.order.status])
      || (b.order.closedAt ?? b.order.createdAt) - (a.order.closedAt ?? a.order.createdAt));
  }, [orders, statusAsc]);
  const checkedSet = new Set(checked);
  const chosen = groups.filter(g => checkedSet.has(g.key) && g.open);
  const chosenSell = chosen.filter(g => g.order.side === 'sell');
  const selectable = groups.filter(g => g.open);
  const allChecked = selectable.length > 0 && selectable.every(g => checkedSet.has(g.key));
  const toggle = (key: string) => setChecked(list => list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  // Huỷ lần lượt từng lệnh (máy chủ khoá bản lưu mỗi lượt), dừng khi có lệnh lỗi.
  const cancelGroups = async (list: Group[]) => {
    for (const g of list) for (const id of g.ids) if (!await onCancel(id)) return false;
    return true;
  };
  const run = async (fn: () => Promise<unknown>) => { if (working) return; setWorking(true); try { await fn(); } finally { setChecked([]); setTick(t => t + 1); setWorking(false); } };
  const cancelChosen = () => run(() => cancelGroups(chosen));
  const relist = () => run(async () => { if (await cancelGroups(chosenSell)) onRelist?.(); });
  const take = (kind: 'buy' | 'sell') => run(async () => { await onTake?.(kind); });

  const body = error ? <div className="mo-empty"><p>Không tải được lịch sử chuyển nhượng.</p><button className="secondary-button" onClick={() => setTick(t => t + 1)}>Thử lại</button></div>
    : !orders ? <div className="mo-empty"><p>Đang tải…</p></div>
    : !groups.length ? <div className="mo-empty"><p>Chưa có giao dịch nào.</p><small>Bán = xong ngay: khớp lệnh mua của người chơi hoặc hệ thống mua đúng giá bán, BP chờ nhận ở đây. Lệnh đặt mua treo tới khi khớp, không hết hạn.</small></div>
    : <div className="mo-rows" role="table" aria-label="Lịch sử chuyển nhượng">
      {groups.map(g => {
        const o = g.order, p = getPlayer(o), f = faceOf(p), on = checkedSet.has(g.key);
        const due = o.createdAt + SYSTEM_TAKEOVER_MIN * 60_000;
        const sub = g.open ? (o.side === 'sell' ? (SYSTEM_TAKEOVER_MIN > 0 ? `Hệ thống mua sau ${left(due - now)}` : 'Hệ thống đang mua') : 'Chờ người bán')
          : o.side === 'sell' ? `Chờ nhận ${money(g.claimBp)} BP` : 'Chờ nhận thẻ';
        return <div className={`mo-row is-${o.side} is-${o.status}${on ? ' is-on' : ''}`} role="row" key={g.key}>
          {g.open ? <input type="checkbox" checked={on} onChange={() => toggle(g.key)} aria-label={`Chọn ${p.name} +${o.level}`}/> : <span/>}
          <span className={`squad-pos pos-${positionGroup(p.pos)}`}>{p.pos}</span>
          <span className={`market-face${f.portrait ? ' is-portrait' : ''}`}><img src={f.src} alt="" loading="lazy"/></span>
          <span className="mo-player"><SeasonBadge tier={p.tier}/><b>{p.name}</b></span>
          <span className="squad-wage" aria-label={`Lương ${p.wage ?? 0}`}>{p.wage ?? 0}</span>
          <strong className="mo-ovr" style={ovrStyle(ovr(o))}>{ovr(o)}</strong>
          <span className="mo-level"><img src={levelBadge(o.level)} alt={`+${o.level}`}/></span>
          <span className="mo-club">{p.club}</span>
          <strong className="mo-price" title={o.fillPrice !== null && o.fillPrice !== o.price ? `Giá đặt ${money(o.price)}` : undefined}>{money(o.fillPrice ?? o.price)}</strong>
          <strong className="mo-count">{g.ids.length}</strong>
          <span className="mo-status">{statusText(o)}{sub && <small>{sub}</small>}</span>
        </div>;
      })}
    </div>;

  return <div className="mo-list">
    <div className="mo-row mo-head" role="row">
      <input type="checkbox" aria-label="Chọn tất cả lệnh đang treo" checked={allChecked} disabled={!selectable.length} onChange={() => setChecked(allChecked ? [] : selectable.map(g => g.key))}/>
      <span>Vị trí</span><span/><span>Tên cầu thủ</span><span className="is-center">Lương</span><span className="is-center">OVR</span><span className="is-center">Thẻ</span><span>CLB</span><span className="is-right">Giá</span><span className="is-center">Số lượng</span>
      <button className="mo-sort" onClick={() => setStatusAsc(v => !v)} aria-label={`Sắp xếp trạng thái ${statusAsc ? 'giảm dần' : 'tăng dần'}`}>Trạng thái{statusAsc ? '▲' : '▼'}</button>
    </div>
    {body}
    <footer className="mo-foot">
      <button className="mo-btn" disabled={working || !chosenSell.length || !onRelist} onClick={() => void relist()} title="Huỷ các lệnh bán đã chọn (thẻ về kho) rồi mở Bán hàng loạt để treo giá mới">Bán lại CT Đã Chọn</button>
      <button className="mo-btn" disabled={working || !chosen.length} onClick={() => void cancelChosen()} title="Huỷ lệnh đã chọn: thẻ đang bán về kho, BP đặt mua được trả lại">Hủy Bán Đã Chọn</button>
      <span className="mo-foot-gap"/>
      {onTake && !!pending?.cards && <button className="mo-btn is-go" disabled={working} onClick={() => void take('buy')} title={`Nhận ${pending.cards} thẻ mua được vào kho`}><span>Nhận tất cả</span><Shirt size={16}/></button>}
      {onTake && !!pending?.sells && <button className="mo-btn is-go" disabled={working} onClick={() => void take('sell')} title={`Nhận ${money(pending.bp)} BP từ ${pending.sells} lần bán`}><span>Nhận tất cả</span><i className="mo-bp">B</i></button>}
    </footer>
  </div>;
}