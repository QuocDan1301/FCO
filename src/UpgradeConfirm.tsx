import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUp, RefreshCcw, ShieldPlus, Smile } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import { marketQuote } from './market';
import type { Card, Tier } from './game';
import './upgrade-confirm.css';

type Props = {
  target: Card;
  materials: Card[];
  energy: number;
  protection: { pct: number; cost: number | null } | null;
  reduced: boolean;
  renderCard: (card: Card, compact?: boolean) => ReactNode;
  seasonShort: (tier: Tier) => string;
  levelBadge: (level: number) => string;
  onBack: () => void;
  // Đập thật; trả về kết quả để màn này tự hiện thẻ lên / rớt, hoặc null nếu lỗi.
  onConfirm: () => { success: boolean; card: Card; before: number } | null;
};

// Bục LED: lưới tam giác 3 dải. Mỗi chu kỳ: tối → dải giữa sáng từ hai đầu vào tâm (hai dải bên ửng hồng theo)
// → từ tâm lan ra phủ kín cả 3 dải → sáng toàn bục → tắt. Cập nhật thẳng thuộc tính DOM mỗi khung hình, không render lại React.
const LED_COLS = 32, LED_W = 20, LED_H = 17.32, LED_CYCLE = 5430;
// Đổi thời gian thực của chu kỳ sang pha LED: dải giữa chạy đều; pha lan ra hai đầu chậm dần (ease-out);
// sau đó giữ sáng toàn bục rồi tắt mờ dần (pha ≥ .9 tắt, CSS kéo dài chuyển màu lúc tắt).
const easeOut = (x: number) => 1 - (1 - x) ** 3;
// Mốc theo mili giây trong chu kỳ: dải giữa 2320 · lan ra 2204 · giữ sáng 500 · tắt mờ 406.
const LED_MARKS = [2320, 4524, 5024].map(ms => ms / LED_CYCLE);
const ledPhase = (raw: number) => { const [line, spread, hold] = LED_MARKS; return raw < line ? raw / line * .5 : raw < spread ? .5 + .3 * easeOut((raw - line) / (spread - line)) : raw < hold ? .85 : .95; };
const LED_TRIS = Array.from({ length: 3 }, (_, row) => Array.from({ length: LED_COLS * 2 }, (_, k) => {
  const x = k * LED_W / 2, top = row * LED_H, bottom = top + LED_H, up = (k + row) % 2 === 0;
  const points = up ? `${x},${bottom} ${x + LED_W},${bottom} ${x + LED_W / 2},${top}` : `${x},${top} ${x + LED_W},${top} ${x + LED_W / 2},${bottom}`;
  const u = (x + LED_W / 2) / (LED_COLS * LED_W + LED_W / 2), fromEnd = Math.min(u, 1 - u) * 2;
  return { row, points, fromEnd, fromCenter: 1 - fromEnd };
})).flat();
const ledLevel = (tri: typeof LED_TRIS[number], t: number) => {
  if (t >= .9) return 0;
  const line = .1 + .38 * tri.fromEnd;
  if (tri.row === 1) return t >= line ? 2 : 0;
  if (t >= .5 + .3 * tri.fromCenter) return 2;
  return t >= line + .04 ? 1 : 0;
};

// Lúc dồn năng lượng: lấp đầy từ hai đầu vào tâm trong 0,4 s, rồi các dải tối hình mũi tên (dải giữa nhô trước)
// chạy từ hai đầu vào tâm trên nền sáng toàn bục. data-l: 2 sáng, 3 dải tối.
const CHARGE_FILL = 400, CHARGE_BANDS = 3, CHARGE_SPEED = .75;
const chargeLevel = (tri: typeof LED_TRIS[number], ms: number) => {
  if (tri.fromEnd > ms / CHARGE_FILL) return 0;
  const lead = tri.row === 1 ? -.045 : 0;
  const band = ((tri.fromEnd + lead) * CHARGE_BANDS - ms / 1000 * CHARGE_SPEED * CHARGE_BANDS) % 1;
  return (band + 1) % 1 < .26 ? 3 : 2;
};

function LedPodium({ reduced, charging, off = false, full = false }: { reduced: boolean; charging: boolean; off?: boolean; full?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = wrap.current; if (!host) return;
    const cells = [...host.querySelectorAll<SVGPolygonElement>('polygon')];
    // Thẻ rớt: bục tắt hẳn.
    if (off) { cells.forEach(cell => { cell.dataset.l = '0'; }); host.style.setProperty('--glow', '0'); host.dataset.full = 'false'; host.dataset.charging = 'false'; host.dataset.fading = 'false'; return; }
    // Thẻ lên: bục sáng kín màu đào, đứng yên.
    if (full) { cells.forEach(cell => { cell.dataset.l = '2'; }); host.style.setProperty('--glow', '1'); host.dataset.full = 'true'; host.dataset.charging = 'true'; host.dataset.fading = 'false'; return; }
    if (charging) {
      const set = (ms: number) => cells.forEach((cell, i) => { const value = String(reduced ? 2 : chargeLevel(LED_TRIS[i], ms)); if (cell.dataset.l !== value) cell.dataset.l = value; });
      host.style.setProperty('--glow', '1'); host.dataset.full = 'true'; host.dataset.fading = 'false'; host.dataset.charging = 'true';
      if (reduced) { set(0); return; }
      let frame = 0; const start = performance.now();
      const tick = (now: number) => { set(now - start); frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    const paint = (t: number) => {
      let lit = 0;
      cells.forEach((cell, i) => { const level = ledLevel(LED_TRIS[i], t); lit += level; const value = String(level); if (cell.dataset.l !== value) cell.dataset.l = value; });
      host.style.setProperty('--glow', (lit / (cells.length * 2)).toFixed(3));
      host.dataset.full = String(t >= .8 && t < .9);
      host.dataset.fading = String(t >= .9);
    };
    if (reduced) { paint(.6); return; }
    let frame = 0; const start = performance.now();
    const tick = (now: number) => { paint(ledPhase(((now - start) % LED_CYCLE) / LED_CYCLE)); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, charging, off, full]);
  return <div className="uc-led" ref={wrap}>
    <i className="uc-rail"/>
    <svg viewBox={`0 0 ${LED_COLS * LED_W + LED_W / 2} ${LED_H * 3}`} preserveAspectRatio="none">{LED_TRIS.map((tri, i) => <polygon key={i} points={tri.points} data-l="0"/>)}</svg>
    <i className="uc-rail"/>
  </div>;
}

// Màn xác nhận trước khi đập: thẻ chính đứng trên bục LED chạy nhịp, các phôi lắc qua lại; bấm "Nâng cấp" mới bắt đầu.
const winPrice = (card: Card) => { const price = marketQuote(card).price; return price === null ? 'Chưa có giá' : `${new Intl.NumberFormat('en-US').format(price)} BP`; };
// Thanh thông báo kết quả ở đáy màn hình (theo FC Online): cấp thẻ, chỉ số và mức thay đổi, giá, nút Tiếp.
// Đặc điểm / Huấn luyện / Kỹ thuật chưa có trong game nên hiện giá trị cố định, không đổi khi nâng cấp.
function ResultBar({ before, after, success, levelBadge, onNext }: { before: Card; after: Card; success: boolean; levelBadge: (level: number) => string; onNext: () => void }) {
  const delta = (n: number) => <em className={n > 0 ? 'up' : n < 0 ? 'down' : ''}>{n > 0 ? `+${n}` : n}</em>;
  const price = marketQuote(after).price;
  return <div className={`uc-result ${success ? 'is-up' : 'is-down'}`} role="status">
    <h3>{success ? 'Nâng cấp thành công' : 'Nâng cấp thất bại'}</h3>
    <div className="uc-result-row">
      <dl>
        <div><dt>Cấp thẻ</dt><dd><img src={levelBadge(after.level)} alt={`+${after.level}`}/>{delta(after.level - before.level)}</dd></div>
        <div><dt>C.Số</dt><dd><b>{ovr(after)}</b>{delta(ovr(after) - ovr(before))}</dd></div>
        <div><dt>Đặc điểm</dt><dd><b>0</b><em>+0</em></dd></div>
        <div><dt>Huấn luyện</dt><dd><b>5</b><em>+0</em></dd></div>
        <div><dt>Kỹ thuật</dt><dd className="uc-stars" aria-label="4 trên 6 sao">{Array.from({ length: 6 }, (_, i) => <i key={i} className={i >= 2 ? 'on' : ''}>★</i>)}</dd></div>
        {success ? <div><dt>Độ hài lòng</dt><dd className="uc-mood" aria-label="Hài lòng tăng"><Smile size={22}/><ArrowUp size={12}/></dd></div>
          : <div><dt><RefreshCcw size={13}/>Thẻ nâng cấp lại</dt><dd><button className="uc-retry" disabled>Dùng</button></dd></div>}
      </dl>
      <div className="uc-result-price"><span>Giá</span><b>{price === null ? 'Chưa có giá' : money(price)}</b></div>
      <button className="uc-next" onClick={onNext} autoFocus>Tiếp</button>
    </div>
  </div>;
}

// Nhóm màu khung cấp thẻ (khớp màu huy hiệu lv-N): LED lấy theo cấp mục tiêu.
const levelTier = (level: number) => level >= 11 ? 'platinum' : level >= 8 ? 'gold' : level >= 5 ? 'silver' : 'bronze';
// Thời gian pha dồn năng lượng sau khi bấm "Nâng cấp", trước khi thực sự đập (khớp với CSS uc-charge-*).
const CHARGE_MS = 5600;
export default function UpgradeConfirm({ target, materials, energy, protection, reduced, renderCard, seasonShort, levelBadge, onBack, onConfirm }: Props) {
  const p = getPlayer(target);
  const [charging, setCharging] = useState(false);
  const [outcome, setOutcome] = useState<{ success: boolean; card: Card; before: number } | null>(null);
  const failed = outcome && !outcome.success ? outcome : null, won = outcome?.success ? outcome : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (!charging || outcome)) onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack, charging, outcome]);
  // Rung thẻ khi dồn năng lượng: lắc ngẫu nhiên mỗi khung hình, biên độ tăng dần từ giây 1,4 (≈1 px) tới cuối pha (≈9 px); có kết quả thì dừng.
  const shake = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shake.current;
    if (!charging || outcome || reduced || !el) { if (el) el.style.transform = ''; return; }
    let frame = 0; const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - 1400) / (CHARGE_MS - 1400)));
      const amp = t ? 1 + 8 * t ** 1.6 : 0;
      el.style.transform = `translate(${((Math.random() - .5) * 2 * amp).toFixed(2)}px, ${((Math.random() - .5) * 1.4 * amp).toFixed(2)}px) rotate(${((Math.random() - .5) * .25 * amp).toFixed(2)}deg)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); el.style.transform = ''; };
  }, [charging, outcome, reduced]);
  useEffect(() => {
    if (!charging) return;
    const timer = window.setTimeout(() => { const result = onConfirm(); if (result) setOutcome(result); }, reduced ? 0 : CHARGE_MS);
    return () => clearTimeout(timer);
  }, [charging]);
  return <div className={`uc-screen ${reduced ? 'uc-reduced' : ''} ${charging ? 'is-charging' : ''} ${failed ? 'is-failed' : ''} ${won ? 'is-success' : ''}`} data-tier={levelTier(target.level + 1)} role="dialog" aria-modal="true" aria-label={`Xác nhận nâng cấp ${p.name}`} aria-busy={charging}>
    <div className="uc-stage" aria-hidden="true">
      <div className="uc-zoom">
        <div className="uc-crowd"/><div className="uc-wall"/><div className="uc-floor"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="2,8 50,36 98,8"/><polyline points="14,4 50,26 86,4"/></svg></div><div className="uc-fog left"/><div className="uc-fog right"/>
        <div className="uc-chevrons left"><i/><i/><i/></div>
        <div className="uc-chevrons right"><i/><i/><i/></div>
        {charging && !outcome && <>{(['left', 'right'] as const).map(side => <div key={side} className={`uc-flow ${side}`}>{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ '--y': `${18 + (i * 37) % 64}%`, '--d': `${(i * .17) % .9}s`, '--w': `${90 + (i * 53) % 110}px` } as CSSProperties}/>)}</div>)}</>}
        {failed && ((['left', 'right'] as const).map(side => <div key={side} className={`uc-sparkler broken ${side}`}><b className="uc-sparkler-core"/>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--a': `${(-14 + (i * 23) % 28).toFixed(1)}deg`, '--h': `${5 + (i * 7) % 11}vh`, '--d': `${((i * .29) % 1.6).toFixed(2)}s`, '--t': `${(.4 + (i * 13) % 4 / 10).toFixed(1)}s`, '--s': `${6 + (i * 5) % 8}px` } as CSSProperties}/>)}{Array.from({ length: 6 }, (_, i) => <s key={i} className="uc-machine-smoke" style={{ '--x': `${-18 + (i * 13) % 36}px`, '--d': `${(.5 + i * .42).toFixed(2)}s` } as CSSProperties}/>)}</div>))}
        {won && <><div className="uc-warm"/>{(['left', 'right'] as const).map(side => <div key={side} className={`uc-sparkler ${side}`}><b className="uc-sparkler-core"/>{Array.from({ length: 90 }, (_, i) => <i key={i} style={{ '--a': `${(-3.5 + (i * 29) % 8).toFixed(1)}deg`, '--h': `${30 + (i * 41) % 36}vh`, '--d': `${((i * .061) % 1.3).toFixed(2)}s`, '--t': `${(.9 + (i * 17) % 6 / 10).toFixed(1)}s`, '--s': `${10 + (i * 23) % 18}px` } as CSSProperties}/>)}</div>)}{Array.from({ length: 14 }, (_, i) => <b key={i} className="uc-confetti" style={{ '--x': `${6 + (i * 37) % 88}%`, '--y': `${20 + (i * 23) % 60}%`, '--d': `${(i * .4) % 4}s` } as CSSProperties}/>)}</>}
        <div className="uc-card">{won && <div className="uc-rays" aria-hidden="true">{Array.from({ length: 56 }, (_, i) => <i key={i} style={{ '--r': `${(i * 360 / 56 + (i * 7) % 5).toFixed(1)}deg`, '--d': `${(i * .037) % .22}s`, '--l': `${120 + (i * 53) % 170}px`, '--w': `${2 + (i % 3)}px` } as CSSProperties}/>)}</div>}<div className="uc-shake" ref={shake}>{renderCard(outcome?.card ?? target)}{charging && !outcome && <div className="uc-whiteout" style={getPlayer(target).cardFace ? { '--mask': `url("${getPlayer(target).cardFace}")` } as CSSProperties : undefined}/>}</div>{failed && <div className="uc-burn">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--x': `${12 + (i * 37) % 76}%`, '--s': `${.7 + (i * 13) % 6 / 10}`, '--d': `${(i * .06) % .4}s` } as CSSProperties}/>)}</div>}</div>
        <div className="uc-podium"><LedPodium reduced={reduced} charging={charging && !outcome} off={!!failed} full={!!won}/><div className="uc-base"/></div>
      </div>
    </div>
    {won && <header className="uc-win" role="status"><h2><img src={levelBadge(won.card.level)} alt={`+${won.card.level}`}/>Nâng cấp thành công</h2><p>{winPrice(won.card)}</p></header>}
    {outcome && <ResultBar before={target} after={outcome.card} success={outcome.success} levelBadge={levelBadge} onNext={onBack}/>}
    <aside className="uc-panel">
      <h2><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>{p.name}</h2>
      <div className="uc-materials" aria-label={`${materials.length} cầu thủ sử dụng`}>
        {materials.map((m, i) => <div key={m.uid} className="uc-material" style={{ '--i': i, zIndex: i + 1 } as CSSProperties}>{renderCard(m, true)}</div>)}
      </div>
      <div className="uc-row"><span>Tăng % nâng cấp</span>
        <div className="uc-energy" aria-label={`Năng lượng ${energy}%`}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ '--fill': `${Math.min(100, Math.max(0, energy - (n - 1) * 20) * 5)}%` } as CSSProperties}/>)}</div>
      </div>
      <div className="uc-row"><span><ShieldPlus size={20}/>Bảo vệ cấp độ nâng cấp</span><b className={protection?.pct ? 'on' : ''}>{protection?.pct ? `${protection.pct}%${protection.cost ? ` · ${money(protection.cost)} BP` : ''}` : 'Không sử dụng'}</b></div>
      <div className="uc-row"><span><RefreshCcw size={20}/>Thẻ nâng cấp lại</span><b>0 cái trong kho</b></div>
      <div className="uc-actions">
        <button className="uc-back" onClick={onBack} disabled={charging}>Trở lại</button>
        <button className="uc-go" onClick={() => setCharging(true)} disabled={charging} autoFocus>Nâng cấp</button>
      </div>
    </aside>
  </div>;
}
