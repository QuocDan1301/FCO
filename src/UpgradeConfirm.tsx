import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUp, RefreshCcw, ShieldPlus, Smile } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import { marketQuote } from './market';
import type { Card, Tier } from './game';
import { asset } from './asset';
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
  onReveal?: (success: boolean) => void;
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
const LED_VB_W = LED_COLS * LED_W + LED_W / 2, LED_VB_H = LED_H * 3;
const LED_TRIS = Array.from({ length: 3 }, (_, row) => Array.from({ length: LED_COLS * 2 }, (_, k) => {
  const x = k * LED_W / 2, top = row * LED_H, bottom = top + LED_H, up = (k + row) % 2 === 0;
  const pts = up ? [x, bottom, x + LED_W, bottom, x + LED_W / 2, top] : [x, top, x + LED_W, top, x + LED_W / 2, bottom];
  const u = (x + LED_W / 2) / LED_VB_W, fromEnd = Math.min(u, 1 - u) * 2;
  return { row, pts, fromEnd, fromCenter: 1 - fromEnd };
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

// Bục vẽ bằng canvas: mỗi khung hình chỉ vẽ lại 192 tam giác trên canvas (không vẽ lại DOM/SVG → không raster lại cả sân khấu).
// Màu lấy từ biến CSS theo mức thẻ; data-full/fading/charging và --glow vẫn đặt trên host cho thanh ray và quầng sáng.
function LedPodium({ reduced, charging, off = false, full = false }: { reduced: boolean; charging: boolean; off?: boolean; full?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = wrap.current, cv = canvas.current, ctx = cv?.getContext('2d');
    if (!host || !cv || !ctx) return;
    const css = getComputedStyle(host), v = (name: string) => css.getPropertyValue(name).trim();
    const palette = [['#8b8592', '#16131a'], [v('--mid'), v('--mid-stroke')], [v('--lit'), v('--lit-stroke')], ['#3d3942', '#1a1720']];
    const chargeLit = [v('--charge'), v('--charge-stroke')];
    const prev = new Int8Array(LED_TRIS.length).fill(-1); let prevMeta = '';
    // Kích thước canvas lấy từ ResizeObserver (đọc clientWidth mỗi khung hình sẽ ép tính lại layout).
    const size = { w: cv.clientWidth, h: cv.clientHeight };
    // levels: mức từng ô; litAlpha < 1 khi đang tắt mờ: vẽ nền tắt rồi phủ màu sáng với độ trong suốt giảm dần.
    // Chỉ vẽ lại khi có ô đổi mức hoặc đổi màu/độ mờ/kích thước.
    const draw = (levels: ArrayLike<number>, chargeColors: boolean, litAlpha = 1, force = false) => {
      const scale = (window.devicePixelRatio || 1) * 1.5, w = Math.round(size.w * scale), h = Math.round(size.h * scale);
      const meta = `${chargeColors}|${litAlpha.toFixed(2)}|${w}x${h}`;
      let changed = force || meta !== prevMeta;
      for (let i = 0; i < levels.length; i++) if (prev[i] !== levels[i]) { prev[i] = levels[i]; changed = true; }
      if (!changed) return;
      prevMeta = meta;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.setTransform(w / LED_VB_W, 0, 0, h / LED_VB_H, 0, 0);
      ctx.clearRect(0, 0, LED_VB_W, LED_VB_H);
      ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
      const pass = (colors: string[], alpha: number, pick: (l: number) => boolean) => {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < levels.length; i++) { if (!pick(levels[i])) continue; any = true; const p = LED_TRIS[i].pts; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath(); }
        if (!any) return;
        ctx.globalAlpha = alpha; ctx.fillStyle = colors[0]; ctx.fill(); ctx.strokeStyle = colors[1]; ctx.stroke(); ctx.globalAlpha = 1;
      };
      if (litAlpha < 1) { pass(palette[0], 1, () => true); pass(chargeColors ? chargeLit : palette[2], litAlpha, l => l === 2); return; }
      for (const level of [0, 1, 2, 3]) pass(level === 2 && chargeColors ? chargeLit : palette[level], 1, l => l === level);
    };
    let redraw = () => {};
    const observer = new ResizeObserver(([entry]) => { size.w = entry.contentRect.width; size.h = entry.contentRect.height; redraw(); });
    observer.observe(cv);
    const n = LED_TRIS.length;
    const setHost = (glow: number, isFull: boolean, isCharging: boolean, fading: boolean) => {
      host.style.setProperty('--glow', glow.toFixed(3)); host.dataset.full = String(isFull); host.dataset.charging = String(isCharging); host.dataset.fading = String(fading);
    };
    let frame = 0;
    // Thẻ rớt: bục tắt hẳn.
    if (off) { const levels = new Array(n).fill(0); redraw = () => draw(levels, false, 1, true); redraw(); setHost(0, false, false, false); }
    // Thẻ lên: bục sáng kín màu đào, đứng yên.
    else if (full) { const levels = new Array(n).fill(2); redraw = () => draw(levels, true, 1, true); redraw(); setHost(1, true, true, false); }
    else if (charging) {
      setHost(1, true, true, false);
      const levels = new Int8Array(n);
      const fill = (ms: number) => { for (let i = 0; i < n; i++) levels[i] = reduced ? 2 : chargeLevel(LED_TRIS[i], ms); };
      redraw = () => draw(levels, true, 1, true);
      if (reduced) { fill(0); redraw(); }
      else {
        const start = performance.now();
        const tick = (now: number) => { fill(now - start); draw(levels, true); frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
      }
    } else {
      const levels = new Int8Array(n); let alpha = 1;
      // Đặt mức các ô theo pha t, trả về tổng mức (để tính độ sáng quầng).
      const fill = (t: number) => { let lit = 0; for (let i = 0; i < n; i++) { const l = ledLevel(LED_TRIS[i], t); levels[i] = l; lit += l; } return lit; };
      const paint = (raw: number) => {
        const t = ledPhase(raw);
        if (t >= .9) {
          // Pha tắt: mờ dần từ toàn bục sáng về tắt trong phần còn lại của chu kỳ.
          const k = Math.min(1, (raw - LED_MARKS[2]) / (1 - LED_MARKS[2])); alpha = 1 - easeOut(k); levels.fill(2);
          draw(levels, false, alpha); setHost(alpha, false, false, true); return;
        }
        alpha = 1; const lit = fill(t);
        draw(levels, false);
        setHost(lit / (n * 2), t >= .8, false, false);
      };
      redraw = () => draw(levels, false, alpha, true);
      if (reduced) { const lit = fill(.6); draw(levels, false); setHost(lit / (n * 2), false, false, false); }
      else {
        const start = performance.now();
        const tick = (now: number) => { paint(((now - start) % LED_CYCLE) / LED_CYCLE); frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
      }
    }
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [reduced, charging, off, full]);
  return <div className="uc-led" ref={wrap}>
    <i className="uc-rail"/>
    <canvas ref={canvas} aria-hidden="true"/>
    <i className="uc-rail"/>
  </div>;
}
// Màn xác nhận trước khi đập: thẻ chính đứng trên bục LED chạy nhịp, các phôi lắc qua lại; bấm "Nâng cấp" mới bắt đầu.
const winPrice = (card: Card) => { const price = marketQuote(card).price; return price === null ? 'Chưa có giá' : `${new Intl.NumberFormat('en-US').format(price)} BP`; };
// Thanh thông báo kết quả ở đáy màn hình (theo FC Online): cấp thẻ, chỉ số và mức thay đổi, giá, nút Tiếp.
// Đặc điểm / Huấn luyện / Kỹ thuật chưa có trong game nên hiện giá trị cố định, không đổi khi nâng cấp.
function ResultBar({ before, after, success, pending, levelBadge, onNext }: { before: Card; after: Card; success: boolean; pending: boolean; levelBadge: (level: number) => string; onNext: () => void }) {
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!pending) next.current?.focus(); }, [pending]);
  const delta = (n: number) => <em className={n > 0 ? 'up' : n < 0 ? 'down' : ''}>{n > 0 ? `+${n}` : n}</em>;
  const price = marketQuote(after).price;
  return <div className={`uc-result ${success ? 'is-up' : 'is-down'}${pending ? ' is-pre' : ''}`} role={pending ? undefined : 'status'} aria-hidden={pending || undefined}>
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
      <button ref={next} className="uc-next" onClick={onNext} tabIndex={pending ? -1 : undefined}>Tiếp</button>
    </div>
  </div>;
}

// Nhóm màu khung cấp thẻ (khớp màu huy hiệu lv-N): LED lấy theo cấp mục tiêu.
const levelTier = (level: number) => level >= 11 ? 'platinum' : level >= 8 ? 'gold' : level >= 5 ? 'silver' : 'bronze';
// Thời gian pha dồn năng lượng sau khi bấm "Nâng cấp", trước khi thực sự đập (khớp với CSS uc-charge-*).
const CHARGE_MS = 5600;
// Tính kết quả + dựng sẵn hiệu ứng kết quả (ẩn, hoạt cảnh tạm dừng) trước lúc lộ một khoảng, khi thẻ đã gần trắng hẳn:
// khung hình lộ kết quả chỉ còn bật hiện, không phải chạy logic/lưu dữ liệu/dựng DOM/vẽ lớp mới cùng lúc (gây khựng).
const PREPARE_LEAD = 600;
export default function UpgradeConfirm({ target, materials, energy, protection, reduced, renderCard, seasonShort, levelBadge, onBack, onConfirm, onReveal }: Props) {
  const p = getPlayer(target);
  const [charging, setCharging] = useState(false);
  const [prepared, setPrepared] = useState<{ success: boolean; card: Card; before: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const outcome = revealed ? prepared : null;
  const failed = outcome && !outcome.success ? outcome : null, won = outcome?.success ? outcome : null;
  // Hiệu ứng kết quả dựng sẵn từ lúc có prepared; trước khi lộ thì gắn is-pre (gần như trong suốt, hoạt cảnh dừng).
  const pFailed = prepared && !prepared.success ? prepared : null, pWon = prepared?.success ? prepared : null;
  const pre = prepared && !revealed ? ' is-pre' : '';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (!charging || outcome)) onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack, charging, outcome]);
  // Tải + giải mã sẵn ảnh cấp thẻ có thể ra (rớt về +1 … lên +1) và ảnh khói để lúc hiện kết quả không khựng vì decode ảnh.
  useEffect(() => {
    const urls = [...Array.from({ length: target.level + 1 }, (_, i) => levelBadge(i + 1)), ...[1, 2, 3].map(n => asset(`/assets/uc-smoke-${n}.webp`))];
    for (const url of urls) { const img = new Image(); img.src = url; void img.decode?.().catch(() => {}); }
  }, []);
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
    const prepare = window.setTimeout(() => { const result = onConfirm(); if (result) setPrepared(result); }, reduced ? 0 : CHARGE_MS - PREPARE_LEAD);
    const reveal = window.setTimeout(() => setRevealed(true), reduced ? 0 : CHARGE_MS);
    return () => { clearTimeout(prepare); clearTimeout(reveal); };
  }, [charging]);
  useEffect(() => { if (outcome) onReveal?.(outcome.success); }, [outcome]);
  return <div className={`uc-screen ${reduced ? 'uc-reduced' : ''} ${charging ? 'is-charging' : ''} ${failed ? 'is-failed' : ''} ${won ? 'is-success' : ''}`} data-tier={levelTier(target.level + 1)} role="dialog" aria-modal="true" aria-label={`Xác nhận nâng cấp ${p.name}`} aria-busy={charging}>
    <div className="uc-stage" aria-hidden="true">
      <div className="uc-zoom">
        <div className="uc-crowd"/><div className="uc-lights">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ '--d': `${(Math.abs(i - 6) * .09).toFixed(2)}s` } as CSSProperties}/>)}</div><div className="uc-wall"/><div className="uc-floor"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="2,8 50,36 98,8"/><polyline points="14,4 50,26 86,4"/></svg></div><div className="uc-fog left"/><div className="uc-fog right"/>
        <div className="uc-chevrons left"><i/><i/><i/></div>
        <div className="uc-chevrons right"><i/><i/><i/></div>
        {charging && !outcome && <>{(['left', 'right'] as const).map(side => <div key={side} className={`uc-flow ${side}`}>{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ '--y': `${18 + (i * 37) % 64}%`, '--d': `${(i * .17) % .9}s`, '--w': `${90 + (i * 53) % 110}px` } as CSSProperties}/>)}</div>)}</>}
        {pFailed && ((['left', 'right'] as const).map(side => <div key={side} className={`uc-sparkler broken ${side}${pre}`}><b className="uc-sparkler-core"/>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--a': `${(-14 + (i * 23) % 28).toFixed(1)}deg`, '--h': `${5 + (i * 7) % 11}vh`, '--d': `${((i * .29) % 1.6).toFixed(2)}s`, '--t': `${(.4 + (i * 13) % 4 / 10).toFixed(1)}s`, '--s': `${6 + (i * 5) % 8}px` } as CSSProperties}/>)}{Array.from({ length: 6 }, (_, i) => <s key={i} className="uc-machine-smoke" style={{ '--x': `${-18 + (i * 13) % 36}px`, '--d': `${(.5 + i * .42).toFixed(2)}s` } as CSSProperties}/>)}</div>))}
        {pWon && <><div className={`uc-warm${pre}`}/>{(['left', 'right'] as const).map(side => <div key={side} className={`uc-sparkler ${side}${pre}`}><b className="uc-sparkler-core"/>{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--a': `${(-3.5 + (i * 29) % 8).toFixed(1)}deg`, '--h': `${30 + (i * 41) % 36}vh`, '--d': `${((i * .061) % 1.3).toFixed(2)}s`, '--t': `${(.9 + (i * 17) % 6 / 10).toFixed(1)}s`, '--s': `${10 + (i * 23) % 18}px` } as CSSProperties}/>)}</div>)}{Array.from({ length: 14 }, (_, i) => <b key={i} className={`uc-confetti${pre}`} style={{ '--x': `${6 + (i * 37) % 88}%`, '--y': `${20 + (i * 23) % 60}%`, '--d': `${(i * .4) % 4}s` } as CSSProperties}/>)}</>}
        <div className="uc-card">{pWon && <div className={`uc-rays${pre}`} aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ '--r': `${(i * 360 / 36 + (i * 7) % 5).toFixed(1)}deg`, '--d': `${(i * .037) % .22}s`, '--l': `${120 + (i * 53) % 170}px`, '--w': `${2 + (i % 3)}px` } as CSSProperties}/>)}</div>}<div className="uc-shake" ref={shake}>{renderCard(outcome?.card ?? target)}{charging && (!outcome || failed) && <div className={`uc-whiteout${failed ? ' is-ash' : ''}`} style={getPlayer(target).cardFace ? { '--mask': `url("${getPlayer(target).cardFace}")` } as CSSProperties : undefined}/>}</div>{pFailed && <div className={`uc-burn${pre}`}>{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--x': `${12 + (i * 37) % 76}%`, '--s': `${.7 + (i * 13) % 6 / 10}`, '--d': `${(i * .06) % .4}s` } as CSSProperties}/>)}</div>}</div>
        <div className="uc-podium"><LedPodium reduced={reduced} charging={charging && !outcome} off={!!failed} full={!!won}/><div className="uc-base"/></div>
      </div>
    </div>
    <header className="uc-title"><h1>Nâng cấp cầu thủ</h1><p>Tiếp tục nâng cấp cầu thủ</p></header>
    {pWon && <header className={`uc-win${pre}`} role={pre ? undefined : 'status'} aria-hidden={pre ? true : undefined}><h2><img src={levelBadge(pWon.card.level)} alt={`+${pWon.card.level}`}/>Nâng cấp thành công</h2><p>{winPrice(pWon.card)}</p></header>}
    {prepared && <ResultBar before={target} after={prepared.card} success={prepared.success} pending={!revealed} levelBadge={levelBadge} onNext={onBack}/>}
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
