import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Medal, RefreshCw, Shield, Swords, Trophy, Users, Volume2, VolumeX, X } from 'lucide-react';
import type { Save } from './game';
import { FORMATIONS, DEFAULT_FORMATION } from './squad';
import { RANKED_START, RANKED_WAGE_CAP, nextTier, rankedTeam, tierById, tierOf } from './ranked';
import type { RankedFinish, RankedMatch, RankedState } from './ranked';
import { MatchSim, ballAt, minuteAt, statsAt } from './ranked-sim';
import type { SimEvent, SimSlot } from './ranked-sim';
import { isNameEffect, nameEffectClass } from './name-effects';
import type { NameEffect } from './name-effects';
import { clubLogoUrl } from './club-logo';
import { CrowdAudio, saveRankedMute, savedRankedMute } from './penalty-audio';
import { fitScale } from './device';

// Xếp hạng giả lập: máy chủ ghép đối thủ + quyết định kết quả (fco_ranked_play), trang này diễn lại trận trên sân 2D:
// đội mình ở dưới (chấm xanh, có tên), đối thủ ở trên (chấm đỏ, không tên). Không giới hạn số trận.
type Props = {
  save: Save; online: boolean;
  load: () => Promise<RankedState>;
  play: (team: { formation: string; slots: { uid: string; role: string; x: number; y: number; ovr: number }[] }) => Promise<RankedMatch>;
  // Hết trận: máy chủ tính điểm (chỉ nhận khi đã đá đủ thời gian). Bỏ dở = xử thua.
  finish: () => Promise<RankedFinish>;
  // Bỏ trận (người chơi tự bấm): xử thua 0 – 3.
  abandon: () => Promise<RankedFinish>;
  onLineup: () => void;
  // Đang mở trận (App tắt nhạc nền, chỉ còn tiếng khán đài + còi).
  onMatchChange?: (active: boolean) => void;
};

const ME = '#38c6ff', OPP = '#ff5b5b';
const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
const date = (ms: number) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function TierBadge({ id, points }: { id: string; points?: number }) {
  const tier = tierById(id);
  return <span className="rkd-tier" style={{ '--tier': tier.color } as CSSProperties}><Medal size={14}/>{tier.name}{points !== undefined && <b>{fmt(points)}</b>}</span>;
}

type Fx = { me: NameEffect | null; opp: NameEffect | null };
type Ctx = CanvasRenderingContext2D & { createConicGradient?: (angle: number, x: number, y: number) => CanvasGradient; roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
// Màu chấm cầu thủ: sáng (điểm bóng) → chính → tối (viền dưới).
const PAL = { me: ['#d2f5ff', '#2bb5f5', '#0a5a8c'], opp: ['#ffdada', '#f04848', '#951a1a'], meGK: ['#fff6c4', '#ffcc1f', '#a17700'], oppGK: ['#e8dcff', '#9b6bff', '#4b27a0'] } as const;

const conic = (ctx: Ctx, x: number, y: number, rot: number, colors: string[]) => {
  if (!ctx.createConicGradient) return colors[1];
  const g = ctx.createConicGradient(rot, x, y);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
};
// Viền Premium quanh chấm cầu thủ, cùng kiểu hiệu ứng avatar chủ đội đã chọn (Hoàng kim, Lửa, Băng, Neon, Thiên hà).
function premiumRing(ctx: Ctx, x: number, y: number, r: number, fx: NameEffect, t: number, seed: number) {
  const R = r * 1.3, lw = Math.max(2, r * .26);
  ctx.save();
  if (fx === 'gold') { ctx.shadowColor = '#ffd75e'; ctx.shadowBlur = r * .9; ctx.strokeStyle = conic(ctx, x, y, t * 2.4, ['#fff4b8', '#d9a321', '#fff4b8', '#b8860b', '#fff4b8']); }
  else if (fx === 'fire') { const f = .7 + .3 * Math.sin(t * 13 + seed); ctx.shadowColor = '#ff5a1f'; ctx.shadowBlur = r * (.7 + .7 * f); ctx.strokeStyle = conic(ctx, x, y, -t * 3, ['#ffe066', '#ff7a00', '#e8261c', '#ff7a00', '#ffe066']); }
  else if (fx === 'ice') { ctx.shadowColor = '#8fe8ff'; ctx.shadowBlur = r * .8; ctx.strokeStyle = conic(ctx, x, y, t * 1.5, ['#ffffff', '#7fdcff', '#2f9bff', '#7fdcff', '#ffffff']); }
  else if (fx === 'neon') { const h = (t * 120 + seed * 40) % 360; ctx.shadowColor = `hsl(${h},100%,60%)`; ctx.shadowBlur = r; ctx.strokeStyle = conic(ctx, x, y, t * 3, [0, 90, 180, 270, 360].map(d => `hsl(${(h + d) % 360},100%,60%)`)); }
  else { ctx.shadowColor = '#8a5cff'; ctx.shadowBlur = r * .9; ctx.strokeStyle = conic(ctx, x, y, t * 1.8, ['#4b2bd6', '#c86bff', '#3fb5ff', '#c86bff', '#4b2bd6']); }
  ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
  if (fx === 'ice' || fx === 'galaxy') {
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) { const ang = t * (fx === 'ice' ? 1.6 : 2.2) + k * 2.094 + seed; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * R, y + Math.sin(ang) * R, lw * .5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// Sân dọc 68 × 105: cỏ cắt sọc, vạch kẻ đầy đủ (vòng cấm, cung 11 m, chấm phạt đền, cung phạt góc), khung thành có lưới, tối dần ở mép.
function drawPitch(ctx: Ctx, w: number, h: number, pad: number, pw: number, ph: number) {
  const X = (x: number) => pad + x / 100 * pw, Y = (y: number) => pad + y / 100 * ph;
  for (let k = 0; k < 14; k++) { ctx.fillStyle = k % 2 ? '#2c8744' : '#33964d'; ctx.fillRect(0, k * h / 14, w, h / 14 + 1); }
  for (let k = 0; k < 6; k++) if (k % 2) { ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(k * w / 6, 0, w / 6, h); }
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.34)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  const lw = Math.max(1.5, w / 240);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = lw; ctx.shadowColor = 'rgba(255,255,255,.35)'; ctx.shadowBlur = lw * 2;
  ctx.strokeRect(pad, pad, pw, ph);
  ctx.beginPath(); ctx.moveTo(pad, Y(50)); ctx.lineTo(pad + pw, Y(50)); ctx.stroke();
  const cr = pw * .135;
  ctx.beginPath(); ctx.arc(X(50), Y(50), cr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(50), Y(50), lw * 1.6, 0, Math.PI * 2); ctx.fill();
  const corner = pw * .016;
  for (const [cx, cy, a0] of [[pad, pad, 0], [pad + pw, pad, Math.PI / 2], [pad + pw, pad + ph, Math.PI], [pad, pad + ph, Math.PI * 1.5]] as const) {
    ctx.beginPath(); ctx.arc(cx, cy, corner, a0, a0 + Math.PI / 2); ctx.stroke();
  }
  for (const top of [true, false]) {
    ctx.strokeRect(X(20.5), Y(top ? 0 : 84.3), pw * .59, ph * .157);
    ctx.strokeRect(X(36.5), Y(top ? 0 : 94.8), pw * .27, ph * .052);
    const spotY = Y(top ? 10.5 : 89.5), boxY = Y(top ? 15.7 : 84.3);
    ctx.beginPath(); ctx.arc(X(50), spotY, lw * 1.5, 0, Math.PI * 2); ctx.fill();
    const a0 = Math.asin(Math.min(1, Math.abs(boxY - spotY) / cr));
    ctx.beginPath();
    if (top) ctx.arc(X(50), spotY, cr, a0, Math.PI - a0); else ctx.arc(X(50), spotY, cr, Math.PI + a0, Math.PI * 2 - a0);
    ctx.stroke();
  }
  ctx.restore();
  // Khung thành + lưới.
  const gw = pw * .12, gd = pad * .62;
  for (const top of [true, false]) {
    const gx = X(44), gy = top ? pad - gd : pad + ph;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(gx, gy, gw, gd);
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 10; k++) { ctx.moveTo(gx + gw * k / 10, gy); ctx.lineTo(gx + gw * k / 10, gy + gd); }
    for (let k = 1; k < 3; k++) { ctx.moveTo(gx, gy + gd * k / 3); ctx.lineTo(gx + gw, gy + gd * k / 3); }
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.4; ctx.strokeRect(gx, gy, gw, gd);
  }
}

// Vẽ sân và cầu thủ lên canvas (toạ độ sân 0–100). Chấm cầu thủ nổi khối có ký hiệu vị trí; đội mình hiện tên trong nhãn,
// đối thủ không hiện tên; đội có chủ Premium thì cầu thủ có viền hiệu ứng.
// ui: hệ số phóng chữ / chấm khi màn bị thu nhỏ (điện thoại).
function draw(ctx: Ctx, w: number, h: number, sim: MatchSim, fx: Fx, now: number, ui = 1) {
  const pad = Math.round(w * .045), pw = w - pad * 2, ph = h - pad * 2;
  const X = (x: number) => pad + x / 100 * pw, Y = (y: number) => pad + y / 100 * ph;
  ctx.clearRect(0, 0, w, h);
  drawPitch(ctx, w, h, pad, pw, ph);
  const s = sim.state(), r = Math.max(6, w * .024) * Math.min(1.3, ui), t = now / 1000;
  const holderKey = s.holder ? `${s.holder.side}${s.holder.i}` : '';
  const sides = ['opp', 'me'] as const;
  for (const side of sides) {
    const effect = fx[side];
    sim.pos[side].forEach((p, i) => {
      const x = X(p.x), y = Y(p.y), gk = sim.teams[side][i].role === 'GK', held = holderKey === `${side}${i}`;
      const pal = side === 'me' ? (gk ? PAL.meGK : PAL.me) : (gk ? PAL.oppGK : PAL.opp);
      ctx.beginPath(); ctx.ellipse(x, y + r * .62, r * .95, r * .42, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
      if (effect) premiumRing(ctx, x, y, r, effect, t, i);
      const g = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
      g.addColorStop(0, pal[0]); g.addColorStop(.55, pal[1]); g.addColorStop(1, pal[2]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = Math.max(1.2, r * .12); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
      if (held) { ctx.beginPath(); ctx.arc(x, y, r + r * .28 + Math.sin(now / 130) * r * .08, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, r * .18); ctx.strokeStyle = '#fff'; ctx.stroke(); }
      // Ký hiệu vị trí trong chấm.
      const role = sim.teams[side][i].role;
      ctx.font = `800 ${Math.round(r * (role.length > 2 ? .62 : .75))}px "Roboto Condensed", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = gk && side === 'me' ? '#3a2a00' : '#fff'; ctx.fillText(role, x, y + r * .05);
      // Mũi tên hướng chạy / hướng nhìn ngay ngoài chấm (ngoài viền Premium nếu có).
      const f = sim.face[side][i], ax = f.x * pw, ay = f.y * ph, al = Math.hypot(ax, ay) || 1, ux = ax / al, uy = ay / al;
      const out = effect ? r * 1.45 : r + 1.5, tipX = x + ux * (out + r * .85), tipY = y + uy * (out + r * .85), bx = x + ux * out, by = y + uy * out, half = r * .5;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bx - uy * half, by + ux * half); ctx.lineTo(bx + uy * half, by - ux * half); ctx.closePath();
      ctx.fillStyle = side === 'me' ? '#e9fbff' : '#ffe1e1'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
    });
  }
  // Trọng tài: chấm đen viền vàng chữ TT, có mũi tên hướng chạy.
  {
    const x = X(sim.ref.x), y = Y(sim.ref.y), rr = r * .82;
    ctx.beginPath(); ctx.ellipse(x, y + rr * .62, rr * .95, rr * .42, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    const g = ctx.createRadialGradient(x - rr * .35, y - rr * .4, rr * .1, x, y, rr);
    g.addColorStop(0, '#5a5f66'); g.addColorStop(.6, '#1b1e22'); g.addColorStop(1, '#050607');
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, rr * .2); ctx.strokeStyle = '#f5d90a'; ctx.stroke();
    ctx.font = `800 ${Math.round(rr * .7)}px "Roboto Condensed", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f5d90a'; ctx.fillText('TT', x, y + rr * .05);
    const f = sim.refFace, ax = f.x * pw, ay = f.y * ph, al = Math.hypot(ax, ay) || 1, ux = ax / al, uy = ay / al, out = rr + 1.5, half = rr * .5;
    ctx.beginPath(); ctx.moveTo(x + ux * (out + rr * .85), y + uy * (out + rr * .85)); ctx.lineTo(x + ux * out - uy * half, y + uy * out + ux * half); ctx.lineTo(x + ux * out + uy * half, y + uy * out - ux * half); ctx.closePath();
    ctx.fillStyle = '#f5d90a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
  }
  // Tên cầu thủ đội mình trong nhãn nền tối phía trên chấm (người cầm bóng nhãn xanh); đối thủ không hiện tên.
  const fs = Math.round(Math.max(10, w * .024) * ui);
  ctx.font = `700 ${fs}px "Roboto Condensed", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  sim.pos.me.forEach((p, i) => {
    const name = sim.teams.me[i].name; if (!name) return;
    const tw = ctx.measureText(name).width, bw = tw + fs * .8, bh = fs * 1.35;
    const x = X(p.x), y = Y(p.y) - (fx.me ? r * 1.35 : r) - bh / 2 - r * .35;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, bh / 2); else ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
    ctx.fillStyle = holderKey === `me${i}` ? 'rgba(20,130,200,.92)' : 'rgba(4,10,18,.68)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(name, x, y + 1);
  });
  // Bóng: vệt bay mờ dần, bóng đổ, quả bóng có hoa văn xoay theo quãng đường lăn.
  const b = s.ball, br = Math.max(4, w * .0135);
  for (let k = 6; k >= 1; k--) {
    const q = ballAt(sim.tl, Math.max(0, sim.t - k * .03)).ball;
    if (Math.hypot(X(q.x) - X(b.x), Y(q.y) - Y(b.y)) < br * .6) continue;
    ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), br * (1 - k * .1), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${.22 * (1 - k / 7)})`; ctx.fill();
  }
  const bx = X(b.x), by = Y(b.y);
  ctx.beginPath(); ctx.ellipse(bx + br * .3, by + br * .7, br, br * .5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
  const bg = ctx.createRadialGradient(bx - br * .35, by - br * .35, br * .1, bx, by, br);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#cfd5dc');
  ctx.save();
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill(); ctx.clip();
  const spin = (b.x + b.y) * .45;
  ctx.fillStyle = '#1d232b';
  ctx.beginPath();
  for (let k = 0; k < 5; k++) { const ang = spin + k * Math.PI * 2 / 5; const px = bx + Math.cos(ang) * br * .38, py = by + Math.sin(ang) * br * .38; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
  for (let k = 0; k < 5; k++) { const ang = spin + Math.PI / 5 + k * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(bx + Math.cos(ang) * br * 1.02, by + Math.sin(ang) * br * 1.02, br * .3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
}

// Một dòng thống kê: số đội mình · tên · số đối thủ, thanh tỉ lệ bên dưới.
function StatRow({ label, a, b, pct }: { label: string; a: number; b: number; pct?: boolean }) {
  const share = a + b > 0 ? a / (a + b) * 100 : 50;
  return <div className="rkd-stat"><b>{a}{pct ? '%' : ''}</b><span>{label}</span><b>{b}{pct ? '%' : ''}</b><i style={{ '--share': `${share}%` } as CSSProperties}/></div>;
}
const roleLine = (role: string) => role === 'GK' ? 'gk' : /B$/.test(role) ? 'df' : /M/.test(role) ? 'mf' : 'fw';

function MatchView({ match, names, onClose, onAgain, finish, abandon }: { match: RankedMatch; names: Map<string, string>; onClose: () => void; onAgain: () => void; finish: () => Promise<RankedFinish>; abandon: () => Promise<RankedFinish> }) {
  const teams = useMemo(() => {
    const me: SimSlot[] = match.me.slots.map(s => ({ role: s.role, fx: s.x ?? 50, fy: s.y ?? 50, name: s.uid ? names.get(s.uid) : undefined }));
    const base = FORMATIONS[match.opp.formation ?? ''] ?? FORMATIONS['4-3-3'] ?? FORMATIONS[DEFAULT_FORMATION];
    const opp: SimSlot[] = match.opp.slots.map((s, i) => ({ role: s.role, fx: s.x ?? base[i]?.x ?? 50, fy: s.y ?? base[i]?.y ?? 50 }));
    return { me, opp };
  }, [match, names]);
  const sim = useMemo(() => new MatchSim(teams, match.goals, match.seed), [teams, match]);
  // Viền Premium của chủ mỗi đội (máy chủ chỉ gửi khi Premium còn hạn).
  const fx = useMemo<Fx>(() => ({ me: isNameEffect(match.me.effect) ? match.me.effect : null, opp: isNameEffect(match.opp.effect) ? match.opp.effect : null }), [match]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [minute, setMinute] = useState(0);
  const [outcome, setOutcome] = useState<RankedFinish | null>(null);
  const [saveError, setSaveError] = useState('');
  const [quitting, setQuitting] = useState<'ask' | 'busy' | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [log, setLog] = useState<SimEvent[]>([]);
  const [banner, setBanner] = useState<SimEvent | null>(null);
  const [finished, setFinished] = useState(false);
  const shown = useRef(0);
  // Chế độ gọn: màn hiển thị thật nhỏ. fitScale < 0,8 = điện thoại / máy bảng đang thu nhỏ khung PC (chữ thật bị nhỏ đi).
  const compactNow = () => fitScale() < .8 || window.innerWidth < 1100 || window.innerHeight < 720;
  const [compact, setCompact] = useState(compactNow);
  const [zoom, setZoom] = useState(() => Math.min(2, Math.max(1, .85 / fitScale())));
  const [tab, setTab] = useState<'log' | 'stats' | 'team'>('log');
  const uiScale = useRef(1);
  uiScale.current = compact ? Math.min(1.6, zoom) : 1;
  useEffect(() => {
    const on = () => { setCompact(compactNow()); setZoom(Math.min(2, Math.max(1, .85 / fitScale()))); };
    window.addEventListener('resize', on); window.visualViewport?.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); window.visualViewport?.removeEventListener('resize', on); };
  }, []);
  const stopped = useRef(false);
  // Âm thanh trận: tiếng khán đài rì rào + còi trọng tài (không nhạc nền). Trình duyệt chặn tự phát thì bật ở lần chạm đầu tiên.
  const [muted, setMuted] = useState(savedRankedMute);
  const audio = useRef<CrowdAudio | null>(null);
  useEffect(() => {
    const a = new CrowdAudio(savedRankedMute()); audio.current = a;
    a.start();
    if (Math.max(0, match.elapsed ?? 0) < 1) window.setTimeout(() => a.whistle('kickoff'), 600);
    const unlock = () => a.start();
    const visible = () => { if (document.visibilityState === 'visible') a.start(); else a.pause(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('visibilitychange', visible); a.dispose(); audio.current = null; };
  }, [match]);
  const toggleMute = () => { const next = !muted; setMuted(next); saveRankedMute(next); audio.current?.setMuted(next); if (!next) audio.current?.start(); };
  // Hết trận: khán đài nhỏ dần sau tiếng còi mãn cuộc.
  useEffect(() => { if (!finished) return; const t = window.setTimeout(() => audio.current?.pause(), 4000); return () => clearTimeout(t); }, [finished]);
  // Giao bóng ở giữa sân (đầu trận / sau bàn thắng / đầu hiệp 2) → còi.
  const kicks = useMemo(() => sim.tl.keys.filter(k => k.kind === 'reset' && k.x === 50 && k.y === 50 && k.t > 0).map(k => k.t), [sim]);
  // Tiếng chạm bóng: sút to, chuyền / cướp bóng vừa, nhận bóng và dắt bóng nhẹ. Bỏ qua lúc bóng được đưa về giữa sân / về thủ môn phát bóng.
  const touches = useMemo(() => {
    const keys = sim.tl.keys, out: { t: number; level: number }[] = [];
    keys.forEach((k, j) => {
      const next = keys[j + 1];
      if (!k.holder && next && next.kind !== 'reset' && (k.kind === 'shot' || k.kind === 'pass' || k.kind === 'win')) out.push({ t: k.t, level: k.kind === 'shot' ? 1 : k.kind === 'pass' ? .55 : .45 });
      else if (k.holder && k.kind === 'pass') out.push({ t: k.t, level: .3 });
      else if (k.holder && k.kind === 'run' && next?.holder && next.kind === 'run') out.push({ t: k.t, level: .2 });
    });
    return out;
  }, [sim]);
  // Trận chạy theo đồng hồ thật (không tua, không dừng), bắt đầu từ chỗ máy chủ báo trận đã diễn (mở lại sau khi tải lại tab / tắt máy).
  // Ẩn tab thì lúc quay lại trận đã trôi tới đúng thời điểm. Chỉ nút Bỏ trận mới bị xử thua.
  const quit = () => {
    setQuitting('busy');
    abandon().then(r => { setAbandoned(true); setOutcome(r); setFinished(true); }).catch(e => { setSaveError((e as Error).message); setQuitting(null); });
  };
  // Hết trận → gửi kết quả; máy chủ chưa nhận (đồng hồ lệch vài giây) thì thử lại.
  useEffect(() => {
    if (!finished || outcome || abandoned) return;
    let alive = true, tries = 0;
    const send = () => { finish().then(r => { if (alive) setOutcome(r); }).catch(e => {
      if (!alive) return;
      if (tries++ < 20) { setSaveError('Đang lưu kết quả…'); window.setTimeout(send, 3000); } else setSaveError((e as Error).message);
    }); };
    send();
    return () => { alive = false; };
  }, [finished, outcome, abandoned, finish]);
  useEffect(() => {
    // Mốc thời gian lấy từ khung hình đầu (đồng hồ rAF có thể lệch performance.now, dt âm làm trận đứng yên).
    let raf = 0, start = -1;
    const offset = Math.max(0, match.elapsed ?? 0);
    const frame = (now: number) => {
      if (start < 0) start = now;
      const target = offset + Math.max(0, (now - start) / 1000);
      const before = sim.t;
      if (target > sim.t) sim.step(target - sim.t);
      // Còi: chỉ cho sự kiện vừa xảy ra (mở lại giữa trận không thổi bù các pha đã qua).
      const justNow = (at: number) => at > before && at <= sim.t && sim.t - at < .6;
      for (const at of kicks) if (justNow(at)) audio.current?.whistle('kickoff');
      for (const h of touches) if (justNow(h.t)) audio.current?.kick(h.level);
      for (const e of sim.tl.events) if (justNow(e.t)) {
        if (e.kind === 'foul' || e.kind === 'offside') audio.current?.whistle('foul'); else if (e.kind === 'half') audio.current?.whistle('half'); else if (e.kind === 'end') audio.current?.whistle('full');
        else if (e.kind === 'goal') audio.current?.netHit(); else if (e.kind === 'save') audio.current?.save();
      }
      const c = canvas.current, wrap = c?.parentElement;
      if (c && wrap) {
        // Sân dọc tỉ lệ 68 × 105, co vừa cả chiều ngang lẫn chiều dọc của khung (không để CSS tự tính chiều cao theo bề ngang).
        const boxW = wrap.clientWidth, boxH = wrap.clientHeight;
        const cssH = Math.max(120, Math.min(boxH, boxW * 105 / 68)), cssW = cssH * 68 / 105;
        if (c.style.height !== `${Math.round(cssH)}px`) { c.style.height = `${Math.round(cssH)}px`; c.style.width = `${Math.round(cssW)}px`; }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d'); if (ctx) draw(ctx, w, h, sim, fx, now, uiScale.current);
      }
      setMinute(minuteAt(sim.tl, sim.t));
      const events = sim.tl.events.filter(e => e.t <= sim.t);
      if (events.length !== shown.current) {
        const fresh = events.slice(shown.current); shown.current = events.length;
        setLog(events.filter(e => e.kind !== 'end' && e.kind !== 'foul'));
        setScore([events.filter(e => e.kind === 'goal' && e.side === 'me').length, events.filter(e => e.kind === 'goal' && e.side === 'opp').length]);
        const goal = [...fresh].reverse().find(e => e.kind === 'goal');
        if (goal && !sim.done) setBanner(goal);
      }
      if (sim.done || stopped.current) { if (sim.done) setFinished(true); setBanner(null); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim, fx, kicks, touches]);
  useEffect(() => { if (!banner) return; const t = window.setTimeout(() => setBanner(null), 2200); return () => clearTimeout(t); }, [banner]);
  const who = (e: SimEvent, i: number | null | undefined) => i === null || i === undefined ? '' : e.side === 'me' ? teams.me[i]?.name ?? '' : 'Cầu thủ đối phương';
  const result = match.score[0] > match.score[1] ? 'win' : match.score[0] < match.score[1] ? 'loss' : 'draw';
  // Thống kê cập nhật mỗi phút trận; bàn thắng theo cầu thủ đội mình (đã diễn).
  const stats = useMemo(() => statsAt(sim.tl, sim.t), [sim, minute, finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const goalsBy = useMemo(() => { const m = new Map<number, number>(); for (const e of log) if (e.kind === 'goal' && e.side === 'me' && e.scorer !== undefined) m.set(e.scorer, (m.get(e.scorer) ?? 0) + 1); return m; }, [log]);
  const myKeeper = teams.me.find(s => s.role === 'GK')?.name ?? 'Thủ môn';
  const line = (e: SimEvent) => {
    const at = <span>{e.minute >= 0 ? e.minute : minuteAt(sim.tl, e.t)}'</span>;
    if (e.kind === 'half') return <li key={`h${e.t}`} className="is-half">Hết hiệp 1</li>;
    if (e.kind === 'offside') return <li key={`o${e.t}`} className={`is-chance ${e.side === 'me' ? 'is-me' : 'is-opp'}`}>{at}🚩 {e.side === 'me' ? 'Đội bạn' : 'Đối phương'} việt vị</li>;
    if (e.kind === 'goal') return <li key={`g${e.t}`} className={`is-goal ${e.side === 'me' ? 'is-me' : 'is-opp'}`}>{at}⚽ {who(e, e.scorer)}{e.side === 'me' && e.assist !== null && e.assist !== undefined ? <small> · kiến tạo {who(e, e.assist)}</small> : null}</li>;
    const text = e.kind === 'save' ? (e.side === 'me' ? 'Thủ môn đối phương cản phá' : `${myKeeper} cứu thua`) : e.side === 'me' ? 'Đội bạn dứt điểm chệch khung thành' : 'Đối phương sút ra ngoài';
    return <li key={`${e.kind}${e.t}`} className={`is-chance ${e.side === 'me' ? 'is-me' : 'is-opp'}`}>{at}{e.kind === 'save' ? '🧤' : '↗'} {text}</li>;
  };
  const statsBox = <div className="rkd-stats">
        <h3>Thống kê trận</h3>
        <StatRow label="OVR đội" a={match.me.ovr} b={match.opp.ovr}/>
        <StatRow label="Kiểm soát bóng" a={stats.possession[0]} b={stats.possession[1]} pct/>
        <StatRow label="Sút bóng" a={stats.shots[0]} b={stats.shots[1]}/>
        <StatRow label="Sút trúng đích" a={stats.onTarget[0]} b={stats.onTarget[1]}/>
        <StatRow label="Chuyền thành công" a={stats.passes[0]} b={stats.passes[1]}/>
        <StatRow label="Cướp bóng" a={stats.tackles[0]} b={stats.tackles[1]}/>
        <StatRow label="Việt vị" a={stats.offsides[0]} b={stats.offsides[1]}/>
  </div>;
  const logBox = <ol className="rkd-log">
        {log.length === 0 && <li className="is-empty">Trận đấu bắt đầu…</li>}
        {[...log].reverse().map(line)}
  </ol>;
  const lineupBox = <>
      <section>
        <h3 className="is-me">{clubLogoUrl(match.me.club) && <img src={clubLogoUrl(match.me.club)!} alt=""/>}<span className={nameEffectClass(fx.me).trim() || undefined}>Đội bạn</span><small>{match.me.formation}</small></h3>
        <ol>{teams.me.map((s, i) => <li key={i}><span className={`rkd-role is-${roleLine(s.role)}`}>{s.role}</span><span className="rkd-pname">{s.name}{goalsBy.get(i) ? <em> ⚽{goalsBy.get(i)! > 1 ? `×${goalsBy.get(i)}` : ''}</em> : null}</span><b>{match.me.slots[i]?.ovr}</b></li>)}</ol>
      </section>
      <section>
        <h3 className="is-opp">{clubLogoUrl(match.opp.club) && <img src={clubLogoUrl(match.opp.club)!} alt=""/>}<span className={nameEffectClass(fx.opp).trim() || undefined}>{match.opp.name}</span><small>{match.opp.formation ?? '4-3-3'}</small></h3>
        <ol>{match.opp.slots.map((s, i) => <li key={i}><span className={`rkd-role is-${roleLine(s.role)}`}>{s.role}</span><span className="rkd-pname is-hidden">Cầu thủ đối phương</span><b>{s.ovr}</b></li>)}</ol>
      </section>
  </>;
  // Màn nhỏ (điện thoại / máy tính bảng thu nhỏ khung PC, cửa sổ hẹp hoặc thấp): ưu tiên tỉ số + diễn biến cỡ lớn bên trái,
  // thống kê và đội hình chuyển vào tab; chữ phóng theo mức thu nhỏ của màn (--z).
  return <div className={`rkd-match${compact ? ' is-compact' : ''}`} style={compact ? { '--z': zoom } as CSSProperties : undefined} role="dialog" aria-label="Trận GLXH">
    <aside className="rkd-match-side">
      {/* Bảng tỉ số: đội bạn · tỉ số + phút · đối thủ (đội không có logo hiện khiên). */}
      <div className="rkd-board">
        <div className="rkd-board-team">{clubLogoUrl(match.me.club) ? <img className="rkd-board-club" src={clubLogoUrl(match.me.club)!} alt=""/> : <Shield className="rkd-board-club is-me"/>}<span className={`rkd-team is-me${nameEffectClass(fx.me)}`}>Đội bạn</span></div>
        <div className="rkd-board-score" aria-label={`Tỉ số ${score[0]} – ${score[1]}`}><b>{score[0]}</b><i>–</i><b>{score[1]}</b><span className="rkd-minute">{finished ? 'Hết giờ' : `${minute}'`}</span></div>
        <div className="rkd-board-team">{clubLogoUrl(match.opp.club) ? <img className="rkd-board-club" src={clubLogoUrl(match.opp.club)!} alt=""/> : <Shield className="rkd-board-club is-opp"/>}<span className={`rkd-team is-opp${nameEffectClass(fx.opp)}`}>{match.opp.name}{match.opp.bot ? ' (máy)' : ''}</span></div>
      </div>
      <div className="rkd-progress" aria-hidden><i style={{ width: `${finished ? 100 : Math.min(100, minute / 90 * 100)}%` }}/></div>
      {compact ? <>
        <div className="rkd-tabs" role="tablist" aria-label="Thông tin trận">
          {([['log', 'Diễn biến'], ['stats', 'Thống kê'], ['team', 'Đội hình']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {tab === 'log' ? logBox : tab === 'stats' ? statsBox : <div className="rkd-lineups">{lineupBox}</div>}
      </> : <>
        {statsBox}
        <h3 className="rkd-log-title">Diễn biến</h3>
        {logBox}
      </>}
      <div className="rkd-side-actions">
        <button type="button" className="rkd-sound" onClick={toggleMute} aria-pressed={!muted} title={muted ? 'Bật tiếng khán đài và còi' : 'Tắt tiếng'}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}{muted ? 'Tiếng: tắt' : 'Tiếng: bật'}</button>
        {!finished && (quitting === null ? <button type="button" className="rkd-quit" onClick={() => setQuitting('ask')}>Bỏ trận</button>
        : <div className="rkd-quit-ask"><span>Bỏ trận sẽ bị xử thua 0 – 3. Chắc chắn?</span><button type="button" className="rkd-quit" disabled={quitting === 'busy'} onClick={() => { stopped.current = true; quit(); }}>Bỏ trận, chịu thua</button><button type="button" className="secondary-button" disabled={quitting === 'busy'} onClick={() => setQuitting(null)}>Đá tiếp</button></div>)}
      </div>
    </aside>
    <div className="rkd-pitch-wrap">
      <canvas ref={canvas} className="rkd-pitch" aria-label="Sân bóng: đội bạn ở dưới, đối thủ ở trên"/>
      {banner && <div className={`rkd-banner ${banner.side === 'me' ? 'is-me' : 'is-opp'}`}>VÀOOO! <b>{banner.minute}'</b> {who(banner, banner.scorer)}</div>}
      {finished && <div className={`rkd-result is-${result}`}>
        <h2>{abandoned ? 'Bỏ trận · Thua 0 – 3' : `${result === 'win' ? 'Thắng' : result === 'loss' ? 'Thua' : 'Hoà'} ${match.score[0]} – ${match.score[1]}`}</h2>
        {outcome ? <><p className={outcome.delta >= 0 ? 'is-up' : 'is-down'}>{outcome.delta >= 0 ? '+' : ''}{outcome.delta} điểm · {fmt(outcome.points)} điểm</p>
          <TierBadge id={outcome.tier}/>
          <div className="rkd-result-actions"><button type="button" className="primary-button" onClick={onAgain}><Swords size={16}/>Đá tiếp</button><button type="button" className="secondary-button" onClick={onClose}>Đóng</button></div></>
          : <p className="rkd-saving">{saveError || 'Đang lưu kết quả…'}</p>}
      </div>}
    </div>
    {!compact && <aside className="rkd-match-side rkd-lineups">{lineupBox}</aside>}
    {outcome && <button type="button" className="icon-button rkd-close" aria-label="Đóng trận" onClick={onClose}><X/></button>}
  </div>;
}

export default function RankedPage({ save, online, load, play, finish, abandon, onLineup, onMatchChange }: Props) {
  const [state, setState] = useState<RankedState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<RankedMatch | null>(null);
  const team = useMemo(() => rankedTeam(save), [save]);
  const names = useMemo(() => new Map(team.slots.map(s => [s.uid, s.name])), [team]);
  // Có trận đang diễn (tải lại tab / tắt máy giữa trận) thì mở lại để xem tiếp.
  const refresh = useCallback(() => { if (!online) return; load().then(s => { setState(s); setError(''); if (s.live) setMatch(m => m ?? s.live!); }).catch(e => setError((e as Error).message)); }, [load, online]);
  useEffect(() => { refresh(); }, [refresh]);
  const find = async () => {
    if (!team.ready || team.overWage || busy) return;
    setBusy(true); setError('');
    try { setMatch(await play({ formation: team.formation, slots: team.slots.map(({ uid, role, x, y, ovr }) => ({ uid, role, x: x ?? 50, y: y ?? 50, ovr })) })); }
    catch (e) { setError((e as Error).message); refresh(); }
    finally { setBusy(false); }
  };
  const close = () => { setMatch(null); refresh(); };
  // Báo App đang mở trận (tắt nhạc nền); rời trang GLXH thì bật lại.
  useEffect(() => { onMatchChange?.(!!match); }, [match, onMatchChange]);
  useEffect(() => () => onMatchChange?.(false), [onMatchChange]);
  const me = state?.me ?? { points: RANKED_START, tier: tierOf(RANKED_START).id, wins: 0, draws: 0, losses: 0, rank: null };
  const next = nextTier(me.points);
  return <section className="workspace ranked-page" aria-labelledby="ranked-title">
    <div className="rk-head rkd-head"><h1 id="ranked-title"><Trophy/>GLXH</h1><button type="button" className="rk-refresh" onClick={refresh} disabled={!online}><RefreshCw/>Làm mới</button></div>
    {!online && <p className="rkd-error">Hãy đăng nhập để đá GLXH.</p>}
    {error && <p className="rkd-error" role="alert">{error}</p>}
    <div className="rkd-grid">
      <article className="rkd-card rkd-me">
        <h2>Mùa giải của bạn</h2>
        <TierBadge id={me.tier} points={me.points}/>
        <p className="rkd-next">{next ? `Còn ${fmt(next.need)} điểm lên ${next.tier.name}` : 'Bậc cao nhất'}{me.rank ? ` · Hạng ${fmt(me.rank)}` : ''}</p>
        <dl className="rkd-record"><div><dt>Thắng</dt><dd>{me.wins}</dd></div><div><dt>Hoà</dt><dd>{me.draws}</dd></div><div><dt>Thua</dt><dd>{me.losses}</dd></div></dl>
        <div className="rkd-team-box">
          <h3><Users size={15}/>Đội hình thi đấu {team.formation ? `· ${team.formation}` : ''}</h3>
          {team.ready ? <><p>OVR đội <b>{team.ovr}</b> (bộ đội hình đang dùng) · Lương <b className={team.overWage ? 'rkd-over' : undefined}>{team.wage}/{RANKED_WAGE_CAP}</b></p><p className="rkd-names">{team.slots.map(s => s.name).join(' · ')}</p>
            {team.overWage && <p className="rkd-warn">Đội hình vượt mức lương {team.wage - RANKED_WAGE_CAP}. Giảm lương xuống tối đa {RANKED_WAGE_CAP} ở mục Đội hình để thi đấu.</p>}</>
            : <p className="rkd-warn">Bộ đội hình đang dùng mới có {team.filled}/11 cầu thủ. Xếp đủ 11 người ở mục Đội hình để thi đấu.</p>}
          {(!team.ready || team.overWage) && <button type="button" className="secondary-button" onClick={onLineup}>Đến Đội hình</button>}
        </div>
        <button type="button" className="rkd-find" disabled={!online || !team.ready || team.overWage || busy} onClick={() => void find()}><Swords size={20}/>{busy ? 'Đang tìm đối thủ…' : 'Tìm trận'}</button>
      </article>
      <article className="rkd-card">
        <h2>Bảng xếp hạng</h2>
        <ol className="rkd-top">
          {(state?.top ?? []).map((t, k) => <li key={k} className={t.mine ? 'is-mine' : undefined}><span className="rkd-rank">{k + 1}</span><span className={`rkd-name${nameEffectClass(t.effect as never)}`}>{clubLogoUrl(t.club) && <img className="rkd-club" src={clubLogoUrl(t.club)!} alt=""/>}{t.name}</span><TierBadge id={t.tier} points={t.points}/><small>{t.wins}T {t.draws}H {t.losses}B</small></li>)}
          {state && !state.top.length && <li className="is-empty">Chưa có ai thi đấu.</li>}
        </ol>
      </article>
      <article className="rkd-card">
        <h2>Trận gần đây</h2>
        <ol className="rkd-history">
          {(state?.history ?? []).map((m, k) => <li key={k} className={m.for > m.against ? 'is-win' : m.for < m.against ? 'is-loss' : 'is-draw'}>
            <b>{m.for} – {m.against}</b><span>{m.opponent}</span><span className={m.delta >= 0 ? 'is-up' : 'is-down'}>{m.delta >= 0 ? '+' : ''}{m.delta}</span><small>{date(m.time)}</small></li>)}
          {state && !state.history.length && <li className="is-empty">Chưa đá trận nào.</li>}
        </ol>
      </article>
    </div>
    {match && <MatchView key={`${match.seed}`} match={match} names={names} finish={finish} abandon={abandon} onClose={close} onAgain={() => { setMatch(null); void find(); }}/>}
  </section>;
}
