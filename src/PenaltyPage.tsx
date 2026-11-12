import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { CrowdAudio, savePenaltyMute, savedPenaltyMute } from './penalty-audio';
import { BALL_SPOT, SHOT_KINDS, SWEEP_MAX, aimToStage, bezier, flightPath, goalSweepSpeed, keeperToStage, missTargets, sweepMultiplier } from './penalty';
import type { PenaltyShot, PenaltyStart, Point, ShotKind } from './penalty';

// Mini game Penalty — sút phạt đền (nút "Penalty" ở menu trang chủ, trước là mục "Sút phạt" trên thanh dưới). Vạch ngắm lắc qua lại trên khung thành, ↑ / ↓ chỉnh độ cao, chọn kiểu sút
// (Thường / Xoáy / Căng / Trivela, phím 1–4), SÚT (hoặc Space). Máy chủ quyết định vào / bị bắt / vọt xà / dội cột
// (supabase/migrations/202611110005_fco_penalty.sql, 202611110006_fco_penalty_kinds.sql): mỗi bàn +1 điểm, không vào là hết lượt,
// kỷ lục lên BXH. Hình vẽ bằng SVG riêng của FCO VIP; vị trí tính theo % sân khấu 16:10 (src/penalty.ts).
type Phase = 'idle' | 'starting' | 'aiming' | 'shooting' | 'result' | 'over';
type Props = { online: boolean; reduced: boolean; onStart: () => Promise<PenaltyStart>; onShoot: (x: number, y: number, kind: ShotKind) => Promise<PenaltyShot> };

const HEIGHT_STEP = .1;
const SHADOW_SPOT = { left: 50, top: 89.6 };
const CONFETTI = ['#ffd76a', '#ffffff', '#ff5d3a', '#62c3ff', '#d9ba76', '#7dff9a'];
// Số bóng mờ kéo theo khi bóng bay (vệt màu theo kiểu sút).
const GHOSTS = 6;
const RESULT_TEXT = { goal: 'VÀO!', saved: 'BỊ BẮT!', bar: 'VỌT XÀ!', post: 'DỘI CỘT!' } as const;
// Cầu thủ sút: chỉ khác ngoại hình và chân sút (không đổi tỷ lệ), nhớ lựa chọn trên máy này.
type Shooter = 'messi' | 'ronaldo';
const SHOOTERS: { id: Shooter; name: string; foot: string }[] = [{ id: 'messi', name: 'Messi', foot: 'Chân trái' }, { id: 'ronaldo', name: 'Ronaldo', foot: 'Chân phải' }];
const SHOOTER_KEY = 'fco-penalty-shooter';
const savedShooter = (): Shooter => { try { return localStorage.getItem(SHOOTER_KEY) === 'ronaldo' ? 'ronaldo' : 'messi'; } catch { return 'messi'; } };

// Màu dùng chung cho hai tư thế thủ môn (luôn có trên trang, kể cả khi chỉ vẽ một tư thế).
function SharedDefs() {
  return <svg className="pk-defs" width="0" height="0" aria-hidden="true">
    <defs>
      <linearGradient id="pk-gk-shirt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a2f3a"/><stop offset=".55" stopColor="#171a21"/><stop offset="1" stopColor="#0c0e12"/></linearGradient>
      <linearGradient id="pk-gk-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d9a986"/><stop offset="1" stopColor="#a87556"/></linearGradient>
      <radialGradient id="pk-gk-glove" cx=".35" cy=".35" r=".7"><stop offset="0" stopColor="#ffffff"/><stop offset=".55" stopColor="#f3d27a"/><stop offset="1" stopColor="#b8862b"/></radialGradient>
    </defs>
  </svg>;
}

// Thủ môn đứng chờ: khuỵu gối, dang tay; áo than viền vàng, găng trắng vàng.
function KeeperReady() {
  return <svg viewBox="0 0 64 84" aria-hidden="true">
    <ellipse cx="32" cy="81" rx="19" ry="2.6" fill="rgba(0,0,0,.4)"/>
    {/* Chân khuỵu gối */}
    <path d="M23 52 L17 64 L20 79 L26 79 L24 66 L29 56 Z" fill="url(#pk-gk-skin)"/>
    <path d="M41 52 L47 64 L44 79 L38 79 L40 66 L35 56 Z" fill="url(#pk-gk-skin)"/>
    <path d="M17.5 66 L24.5 66 L26 78 L19.6 78 Z" fill="#111318"/><path d="M46.5 66 L39.5 66 L38 78 L44.4 78 Z" fill="#111318"/>
    <rect x="18" y="67.5" width="7" height="1.6" fill="#d9ba76"/><rect x="39" y="67.5" width="7" height="1.6" fill="#d9ba76"/>
    <path d="M17 77 Q22 75.5 27.5 77.5 L27.5 80.5 L16.5 80.5 Z" fill="#f4f1e8"/><path d="M47 77 Q42 75.5 36.5 77.5 L36.5 80.5 L47.5 80.5 Z" fill="#f4f1e8"/>
    {/* Quần + áo */}
    <path d="M20 46 L44 46 L46 58 L35 60 L32 55 L29 60 L18 58 Z" fill="#0f1116"/>
    <path d="M44.6 47 L46 58" stroke="#d9ba76" strokeWidth="1.2"/><path d="M19.4 47 L18 58" stroke="#d9ba76" strokeWidth="1.2"/>
    <path d="M17 22 Q32 16 47 22 L46 48 Q32 51 18 48 Z" fill="url(#pk-gk-shirt)"/>
    <path d="M18.4 21.6 Q32 16.6 45.6 21.6" fill="none" stroke="rgba(255,248,225,.45)" strokeWidth=".8" strokeLinecap="round"/>
    <path d="M22 30 L32 35 L42 30" fill="none" stroke="#d9ba76" strokeWidth="1.6"/><path d="M22 34.5 L32 39.5 L42 34.5" fill="none" stroke="#d9ba76" strokeWidth=".9" opacity=".7"/>
    <path d="M27 20.5 Q32 24 37 20.5" fill="none" stroke="#d9ba76" strokeWidth="1.3"/>
    {/* Tay dang + găng */}
    <path d="M18 23 L8 30 L4 22 L8 19 L10 24 L17 20 Z" fill="url(#pk-gk-shirt)"/><path d="M46 23 L56 30 L60 22 L56 19 L54 24 L47 20 Z" fill="url(#pk-gk-shirt)"/>
    <ellipse cx="5" cy="19" rx="4.2" ry="5" fill="url(#pk-gk-glove)"/><ellipse cx="59" cy="19" rx="4.2" ry="5" fill="url(#pk-gk-glove)"/>
    {/* Đầu */}
    <rect x="29" y="16" width="6" height="5" fill="url(#pk-gk-skin)"/>
    <ellipse cx="32" cy="11" rx="6.6" ry="7.4" fill="url(#pk-gk-skin)"/>
    <path d="M25.4 10 Q25.6 2.6 32 2.4 Q38.6 2.6 38.6 10 Q36 6.8 32 6.6 Q28 6.8 25.4 10 Z" fill="#231a14"/>
    <circle cx="29.6" cy="11.4" r=".75" fill="#1a1410"/><circle cx="34.4" cy="11.4" r=".75" fill="#1a1410"/>
  </svg>;
}

// Thủ môn bay người (sang phải; sang trái thì lật ngang).
function KeeperDive() {
  return <svg viewBox="0 0 110 56" aria-hidden="true">
    <ellipse cx="55" cy="54" rx="34" ry="2.2" fill="rgba(0,0,0,.28)"/>
    <path d="M8 31 L20 27 L22 33 L10 37 Z" fill="#d6a483"/><path d="M6 34 L18 31 L19 36 L7 39 Z" fill="#111318"/>
    <path d="M18 24 L36 22 L37 34 L20 36 Z" fill="#0f1116"/>
    <path d="M34 18 Q55 13 74 18 L74 34 Q55 38 35 34 Z" fill="url(#pk-gk-shirt)"/>
    <path d="M44 20 L50 28 L44 35" fill="none" stroke="#d9ba76" strokeWidth="1.6"/>
    <path d="M72 18 L92 9 L95 14 L75 26 Z" fill="url(#pk-gk-shirt)"/><path d="M73 30 L95 25 L96 30 L75 35 Z" fill="url(#pk-gk-shirt)"/>
    <ellipse cx="97.5" cy="10.5" rx="5" ry="4.2" fill="url(#pk-gk-glove)"/><ellipse cx="99" cy="27.5" rx="5" ry="4.2" fill="url(#pk-gk-glove)"/>
    <rect x="73.5" y="20.5" width="5" height="6" fill="#c99a76"/>
    <ellipse cx="82" cy="22" rx="6.4" ry="6.8" fill="#d6a483"/><path d="M76 20 Q78 14.5 85 15.6 Q88.5 17 88.4 21 Q84.5 18.4 76 20 Z" fill="#231a14"/>
  </svg>;
}

// Cầu thủ sút nhìn từ phía sau, vẽ theo nét nhận ra Messi (người dùng yêu cầu 2026-11-11): áo sọc xanh da trời – trắng số 10 tên MESSI,
// quần đen, tất trắng viền xanh, giày cam, tóc nâu dài vừa, dáng thấp chắc; sút chân trái nên đứng bên phải bóng (CSS .pk-striker).
// Tay (.pk-arm), tay chống hông (.pk-arms-akimbo), đầu (.pk-head), chân (.pk-stand-leg / .pk-kick-leg) tách nhóm để CSS diễn hoạt.
// Hình cách điệu tự vẽ, không dùng logo đội tuyển hay nhà tài trợ.
function Striker() {
  const leg = (x: number) => <>
    <path d={`M${x + 2.2} 74 C${x + 1.4} 79 ${x + 1} 83.6 ${x + 1.4} 87.6 C${x + .2} 91 ${x - .4} 94.2 ${x + .4} 97.4 L${x + 7.4} 97.4 C${x + 8.4} 93.6 ${x + 8.8} 90 ${x + 8.4} 86.8 C${x + 9.2} 82.6 ${x + 9.6} 78.6 ${x + 9.2} 74 Z`} fill="url(#pk-st-leg)"/>
    <path d={`M${x + 2} 88.4 C${x + 3.4} 89.6 ${x + 6.4} 89.6 ${x + 7.8} 88.2`} fill="none" stroke="rgba(90,50,30,.35)" strokeWidth=".55" strokeLinecap="round"/>
    <path d={`M${x + 1.2} 91.4 C${x + .8} 93.4 ${x + 1} 95 ${x + 1.6} 96.4`} fill="none" stroke="rgba(255,235,215,.35)" strokeWidth=".7" strokeLinecap="round"/>
    <path d={`M${x + .2} 96.2 C${x} 100.6 ${x + .2} 104.6 ${x + .4} 108.6 L${x + 7.6} 108.6 C${x + 7.8} 104.6 ${x + 7.8} 100.6 ${x + 7.6} 96.2 Z`} fill="url(#pk-st-sock)"/>
    <rect x={x + .1} y="97.6" width="7.6" height="1.5" fill="#79b4e3"/><rect x={x + .1} y="99.9" width="7.6" height=".8" fill="#79b4e3"/>
    <path d={`M${x + 1} 104.4 C${x + 3} 105.4 ${x + 5.4} 105.2 ${x + 7.2} 104.2 M${x + 1} 106.6 C${x + 3.2} 107.4 ${x + 5.2} 107.2 ${x + 7.2} 106.4`} fill="none" stroke="rgba(120,130,150,.45)" strokeWidth=".45"/>
    <path d={`M${x - 1} 108.4 C${x + 1} 106.6 ${x + 5} 106.4 ${x + 8.6} 107.6 C${x + 9.4} 109 ${x + 9.6} 110.8 ${x + 9.2} 112.4 L${x - 1.4} 112.6 C${x - 1.8} 111 ${x - 1.6} 109.6 ${x - 1} 108.4 Z`} fill="url(#pk-st-boot)"/>
    <path d={`M${x - 1.6} 112 L${x + 9.4} 111.8 L${x + 9.2} 113.2 L${x - 1.4} 113.4 Z`} fill="#20232a"/>
    <path d={`M${x + .4} 108.6 C${x + 2.6} 107.8 ${x + 5.6} 107.8 ${x + 7.6} 108.6`} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth=".6"/>
  </>;
  const arm = (side: 1 | -1) => {
    const s = (x: number) => 32 + side * (x - 32);
    return <>
      <path d={`M${s(14.6)} 28 C${s(11.6)} 32 ${s(9.2)} 37.4 ${s(7.6)} 42.2 L${s(12.8)} 45.2 C${s(14.4)} 41.4 ${s(16.4)} 37.6 ${s(18.4)} 34.6 Z`} fill="url(#pk-st-stripes)"/>
      <path d={`M${s(14.6)} 28 C${s(11.6)} 32 ${s(9.2)} 37.4 ${s(7.6)} 42.2 L${s(12.8)} 45.2 C${s(14.4)} 41.4 ${s(16.4)} 37.6 ${s(18.4)} 34.6 Z`} fill="url(#pk-st-sleeve-shade)"/>
      <path d={`M${s(7.6)} 42.2 L${s(12.8)} 45.2`} stroke="#79b4e3" strokeWidth="1.4" strokeLinecap="round"/>
      <path d={`M${s(8.2)} 43 C${s(7.2)} 46.4 ${s(6)} 50.2 ${s(5.6)} 53.6 C${s(5.4)} 55 ${s(5.6)} 56 ${s(5.8)} 56.8 L${s(9.8)} 57.4 C${s(10.2)} 54.6 ${s(11)} 50.6 ${s(12.2)} 45.2 Z`} fill="url(#pk-st-skin)"/>
      <path d={`M${s(7.4)} 49.2 C${s(8.4)} 49.8 ${s(9.6)} 49.8 ${s(10.6)} 49.2`} fill="none" stroke="rgba(110,65,40,.35)" strokeWidth=".5"/>
      <path d={`M${s(5.4)} 56.4 C${s(4.8)} 58 ${s(5.2)} 59.8 ${s(6.8)} 60.2 C${s(8.6)} 60.4 ${s(10)} 59.4 ${s(10)} 57.6 C${s(9.8)} 56.8 ${s(8.4)} 56.4 ${s(5.4)} 56.4 Z`} fill="#dcab89"/>
      <path d={`M${s(9.6)} 57.2 C${s(10.6)} 57.6 ${s(11)} 58.6 ${s(10.6)} 59.4`} fill="none" stroke="#c8936f" strokeWidth=".9" strokeLinecap="round"/>
    </>;
  };
  // Nắm tay chỉ trời (chỉ hiện khi ăn mừng): ba ngón gập thành đốt, ngón cái ôm vào, ngón TRỎ duỗi ra từ phía ngón cái
  // (phía trong, sát về phía đầu khi giơ tay) chứ không mọc giữa nắm tay, để không bị nhìn thành ngón giữa.
  const point = (side: 1 | -1) => {
    const s = (x: number) => 32 + side * (x - 32);
    return <g className="pk-finger">
      <path d={`M${s(5.4)} 56.6 C${s(4.8)} 58.4 ${s(5.2)} 60.4 ${s(6.8)} 61.2 C${s(8.4)} 61.8 ${s(10)} 61.2 ${s(10.6)} 59.6 C${s(10.9)} 58.2 ${s(10)} 56.8 ${s(8.4)} 56.4 C${s(7.2)} 56.2 ${s(6)} 56.2 ${s(5.4)} 56.6 Z`} fill="#d7a582" stroke="#b17b59" strokeWidth=".35"/>
      <path d={`M${s(5.6)} 60 C${s(6)} 60.8 ${s(6.6)} 61.1 ${s(7.2)} 61 M${s(7.2)} 61 C${s(7.6)} 61.5 ${s(8.2)} 61.6 ${s(8.8)} 61.3`} fill="none" stroke="#a8714f" strokeWidth=".45" strokeLinecap="round"/>
      <path d={`M${s(10.6)} 57.4 C${s(9.6)} 57.9 ${s(9.1)} 58.8 ${s(9.2)} 59.9`} fill="none" stroke="#a8714f" strokeWidth=".55" strokeLinecap="round"/>
      <path d={`M${s(9.6)} 60.6 C${s(9.4)} 62.6 ${s(9.1)} 64.6 ${s(8.7)} 66.4`} fill="none" stroke="#a8714f" strokeWidth="2.1" strokeLinecap="round"/>
      <path d={`M${s(9.6)} 60.6 C${s(9.4)} 62.6 ${s(9.1)} 64.6 ${s(8.7)} 66.4`} fill="none" stroke="#e2b391" strokeWidth="1.45" strokeLinecap="round"/>
      <path d={`M${s(9.3)} 63.4 C${s(9.6)} 63.5 ${s(9.8)} 63.4 ${s(9.9)} 63.2`} fill="none" stroke="#b17b59" strokeWidth=".3"/>
    </g>;
  };  return <svg viewBox="0 0 64 118" aria-hidden="true">
    <defs>
      <pattern id="pk-st-stripes" width="9" height="10" patternUnits="userSpaceOnUse" x="1.5"><rect width="9" height="10" fill="#f7f9fc"/><rect x="0" width="4.6" height="10" fill="#79b4e3"/></pattern>
      <linearGradient id="pk-st-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(10,20,35,.42)"/><stop offset=".2" stopColor="rgba(10,20,35,0)"/><stop offset=".8" stopColor="rgba(10,20,35,0)"/><stop offset="1" stopColor="rgba(10,20,35,.42)"/></linearGradient>
      <linearGradient id="pk-st-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,255,255,.22)"/><stop offset=".35" stopColor="rgba(255,255,255,0)"/><stop offset=".8" stopColor="rgba(8,14,26,.12)"/><stop offset="1" stopColor="rgba(8,14,26,.32)"/></linearGradient>
      <linearGradient id="pk-st-sleeve-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,255,255,.15)"/><stop offset="1" stopColor="rgba(8,14,26,.28)"/></linearGradient>
      <linearGradient id="pk-st-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#b98462"/><stop offset=".5" stopColor="#e6b897"/><stop offset="1" stopColor="#b17b59"/></linearGradient>
      <linearGradient id="pk-st-leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ad7856"/><stop offset=".45" stopColor="#e4b592"/><stop offset="1" stopColor="#a87254"/></linearGradient>
      <linearGradient id="pk-st-sock" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c9d1dc"/><stop offset=".45" stopColor="#ffffff"/><stop offset="1" stopColor="#c3cbd6"/></linearGradient>
      <linearGradient id="pk-st-boot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa05c"/><stop offset=".6" stopColor="#ff6a2c"/><stop offset="1" stopColor="#c8471a"/></linearGradient>
      <linearGradient id="pk-st-shorts" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0b0c10"/><stop offset=".5" stopColor="#23262e"/><stop offset="1" stopColor="#0b0c10"/></linearGradient>
      <linearGradient id="pk-st-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a5030"/><stop offset=".6" stopColor="#5a3820"/><stop offset="1" stopColor="#3a2414"/></linearGradient>
      <radialGradient id="pk-st-neck" cx=".5" cy=".2" r=".9"><stop offset="0" stopColor="#e2b391"/><stop offset="1" stopColor="#a87254"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="114.6" rx="20" ry="3.2" fill="rgba(0,0,0,.5)"/>
    <ellipse cx="32" cy="114.4" rx="13" ry="1.6" fill="rgba(0,0,0,.35)"/>
    <g className="pk-stand-leg">{leg(36)}</g>
    <g className="pk-kick-leg">{leg(19.4)}</g>
    {/* Quần đen: nếp, cạp quần, bóng đổ dưới gấu áo */}
    <path d="M17 60.6 C16.4 66 15.6 71 15.2 76.4 C20 77.6 26 78 30.8 77.8 L32 72.8 L33.2 77.8 C38 78 44 77.6 48.8 76.4 C48.4 71 47.6 66 47 60.6 Z" fill="url(#pk-st-shorts)"/>
    <path d="M17.4 61 L46.6 61 L46.8 64.6 L17.2 64.6 Z" fill="rgba(0,0,0,.45)"/>
    <path d="M21 66 C20.4 70 20 73.4 20.4 76.6 M43 66 C43.6 70 44 73.4 43.6 76.6 M30 66.4 C30.6 69 31.2 71 32 72.6" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth=".7"/>
    <path d="M47.6 62 L48.8 76.4" stroke="#79b4e3" strokeWidth=".9" opacity=".8"/><path d="M16.4 62 L15.2 76.4" stroke="#79b4e3" strokeWidth=".9" opacity=".8"/>
    {/* Tay chống hông (chỉ hiện khi thất vọng). */}
    <g className="pk-arms-akimbo">
      {[1, -1].map(side => { const s = (x: number) => 32 + side * (x - 32); return <g key={side}>
        <path d={`M${s(15.4)} 29 C${s(11.6)} 34 ${s(8.4)} 39.6 ${s(6)} 44.6 L${s(10.2)} 47.4 C${s(12.6)} 43 ${s(15.6)} 39 ${s(18.6)} 35.4 Z`} fill="url(#pk-st-stripes)"/>
        <path d={`M${s(6.6)} 44 C${s(9.6)} 49.4 ${s(12.8)} 55.4 ${s(16)} 60.4 L${s(19.6)} 58 C${s(16.6)} 53.6 ${s(13.4)} 49.6 ${s(10.4)} 46.6 Z`} fill="url(#pk-st-skin)"/>
        <ellipse cx={s(17.8)} cy="60" rx="2.7" ry="2.2" fill="#dcab89"/>
      </g>; })}
    </g>
    {/* Áo sọc: thân + đổ bóng hai bên + ánh sáng từ trên + nếp bả vai / sống lưng / gấu áo */}
    <path d="M14.4 28 C20 23.6 26 22 32 22 C38 22 44 23.6 49.6 28 C49 40 48.6 52 48 63.6 C42 65.4 22 65.4 16 63.6 C15.4 52 15 40 14.4 28 Z" fill="url(#pk-st-stripes)"/>
    <path d="M14.4 28 C20 23.6 26 22 32 22 C38 22 44 23.6 49.6 28 C49 40 48.6 52 48 63.6 C42 65.4 22 65.4 16 63.6 C15.4 52 15 40 14.4 28 Z" fill="url(#pk-st-fold)"/>
    <path d="M14.4 28 C20 23.6 26 22 32 22 C38 22 44 23.6 49.6 28 C49 40 48.6 52 48 63.6 C42 65.4 22 65.4 16 63.6 C15.4 52 15 40 14.4 28 Z" fill="url(#pk-st-light)"/>
    <path d="M20 33 C22.6 36.4 23.4 40 22.6 43.6 M44 33 C41.4 36.4 40.6 40 41.4 43.6" fill="none" stroke="rgba(10,25,45,.22)" strokeWidth="1.1" strokeLinecap="round"/>
    <path d="M32 27 C31.6 38 31.8 50 32.2 62" fill="none" stroke="rgba(10,25,45,.1)" strokeWidth="1.4"/>
    <path d="M18 58.6 C24 60.4 40 60.4 46 58.6 M17.6 61.8 C24 63.6 40 63.6 46.4 61.8" fill="none" stroke="rgba(10,25,45,.18)" strokeWidth=".7"/>
    <path className="pk-rim" d="M15.8 27.8 Q32 21.8 48.2 27.8" fill="none" stroke="rgba(255,250,230,.6)" strokeWidth=".9" strokeLinecap="round"/>
    {/* Tay thả (xoay quanh vai để giơ lên chỉ trời); ngón trỏ chỉ hiện khi ăn mừng. */}
    <g className="pk-arm pk-arm-l">{arm(1)}{point(1)}</g>
    <g className="pk-arm pk-arm-r">{arm(-1)}{point(-1)}</g>
    <g fill="#141a26" stroke="#f7f9fc" strokeWidth=".35" paintOrder="stroke">
      <text x="32" y="36" textAnchor="middle" fontSize="5" fontWeight="800" letterSpacing=".9">MESSI</text>
      <text x="32" y="56.5" textAnchor="middle" fontSize="18" fontWeight="800">10</text>
    </g>
    <path d="M25.6 24.4 C29 27.2 35 27.2 38.4 24.4" fill="none" stroke="#5f9dd0" strokeWidth="1.6" strokeLinecap="round"/>
    {/* Cổ, tai, tóc từng lọn, chân tóc ở gáy */}
    <g className="pk-head">
      <path d="M28 17.4 C27.8 20.4 27.6 23 27.2 25 C30.4 26.4 33.6 26.4 36.8 25 C36.4 23 36.2 20.4 36 17.4 Z" fill="url(#pk-st-neck)"/>
      <path d="M29.4 19 C29.8 21.6 29.8 23.6 29.2 25.2 M34.6 19 C34.2 21.6 34.2 23.6 34.8 25.2" fill="none" stroke="rgba(120,70,45,.4)" strokeWidth=".6"/>
      <path d="M22.4 11 C21.2 11.4 21 14.6 22.2 16 C23 16.8 24 16.4 24.2 15.4 Z" fill="#c9926e"/><path d="M41.6 11 C42.8 11.4 43 14.6 41.8 16 C41 16.8 40 16.4 39.8 15.4 Z" fill="#c9926e"/>
      <path d="M22.6 12.4 C23 13.4 23 14.6 22.8 15.4 M41.4 12.4 C41 13.4 41 14.6 41.2 15.4" fill="none" stroke="#9c6a4c" strokeWidth=".45"/>
      <path d="M23.4 12 C22.8 5.4 26.4 2.4 32 2.2 C37.6 2.4 41.2 5.4 40.6 12 C40.8 16.6 40 19.6 38.6 21.4 C36.6 23 34.6 23.4 32 23.4 C29.4 23.4 27.4 23 25.4 21.4 C24 19.6 23.2 16.6 23.4 12 Z" fill="url(#pk-st-hair)"/>
      <path d="M26 21.2 C26.6 23.4 27.8 24 28.8 22.8 M30.4 23.2 C31 25 33 25 33.6 23.2 M35.2 22.8 C36.2 24 37.4 23.4 38 21.2" fill="none" stroke="#3a2414" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M26.4 5.4 C29 4.2 34 4 37.6 5.8 M25 8.6 C29 6.8 35 6.8 39 8.8 M24.2 12 C28.6 10.4 35.4 10.4 39.8 12.2 M24.6 15.6 C28.8 14.4 35.4 14.4 39.4 15.8 M25.6 18.8 C29.4 18 34.6 18 38.4 19" fill="none" stroke="rgba(40,24,12,.45)" strokeWidth=".55" strokeLinecap="round"/>
      <path d="M27.4 6.2 C30 5.2 33.6 5.2 36 6.4 M26.6 10 C29.8 9 34 9 37.4 10.2" fill="none" stroke="rgba(255,215,170,.22)" strokeWidth=".55" strokeLinecap="round"/>
      <path className="pk-rim" d="M24.4 8.6 C26.6 3.6 37.4 3.6 39.6 8.6" fill="none" stroke="rgba(255,240,215,.5)" strokeWidth=".9" strokeLinecap="round"/>
    </g>
  </svg>;
}

// Cầu thủ sút vẽ theo nét nhận ra Ronaldo (người dùng yêu cầu 2026-11-11): áo đỏ đậm viền xanh lá, tên RONALDO số 7 vàng,
// quần xanh lá đậm, tất đỏ, giày trắng bạc; tóc đen cắt ngắn trên đỉnh, hai bên cạo sát; dáng cao vai rộng, đứng dạng chân rộng;
// sút chân phải nên đứng bên trái bóng. Cùng các nhóm diễn hoạt như Messi. Hình cách điệu tự vẽ, không logo.
function StrikerRonaldo() {
  // Chân dạng rộng: lean = độ nghiêng (âm = chân trái ngả ra ngoài).
  const leg = (x: number, lean: number) => {
    const p = (dx: number, y: number) => `${x + dx + lean * (y - 74) / 40} ${y}`;
    return <>
      <path d={`M${p(2.4, 74)} C${p(1.4, 79)} ${p(1, 83.6)} ${p(1.4, 87.6)} C${p(.2, 91)} ${p(-.6, 94.2)} ${p(.4, 97.4)} L${p(7.8, 97.4)} C${p(8.8, 93.6)} ${p(9.4, 90)} ${p(9, 86.8)} C${p(9.8, 82.6)} ${p(10.2, 78.6)} ${p(9.8, 74)} Z`} fill="url(#pk-cr-leg)"/>
      <path d={`M${p(2, 88.4)} C${p(3.6, 89.6)} ${p(6.8, 89.6)} ${p(8.4, 88.2)}`} fill="none" stroke="rgba(80,45,25,.38)" strokeWidth=".55" strokeLinecap="round"/>
      <path d={`M${p(1.2, 91.4)} C${p(.8, 93.4)} ${p(1, 95)} ${p(1.6, 96.4)}`} fill="none" stroke="rgba(255,230,205,.3)" strokeWidth=".7" strokeLinecap="round"/>
      <path d={`M${p(.2, 96.2)} C${p(0, 100.6)} ${p(.2, 104.6)} ${p(.4, 108.6)} L${p(8, 108.6)} C${p(8.2, 104.6)} ${p(8.2, 100.6)} ${p(8, 96.2)} Z`} fill="url(#pk-cr-sock)"/>
      <path d={`M${p(.1, 97.6)} L${p(8.1, 97.6)} L${p(8.1, 99.4)} L${p(.1, 99.4)} Z`} fill="#0f7a3a"/>
      <path d={`M${p(1, 104.4)} C${p(3, 105.4)} ${p(5.6, 105.2)} ${p(7.6, 104.2)} M${p(1, 106.6)} C${p(3.2, 107.4)} ${p(5.4, 107.2)} ${p(7.6, 106.4)}`} fill="none" stroke="rgba(60,0,10,.4)" strokeWidth=".45"/>
      <path d={`M${p(-1, 108.4)} C${p(1, 106.6)} ${p(5.2, 106.4)} ${p(9, 107.6)} C${p(9.8, 109)} ${p(10, 110.8)} ${p(9.6, 112.4)} L${p(-1.4, 112.6)} C${p(-1.8, 111)} ${p(-1.6, 109.6)} ${p(-1, 108.4)} Z`} fill="url(#pk-cr-boot)"/>
      <path d={`M${p(-1.6, 112)} L${p(9.8, 111.8)} L${p(9.6, 113.2)} L${p(-1.4, 113.4)} Z`} fill="#30343c"/>
      <path d={`M${p(.4, 108.6)} C${p(2.6, 107.8)} ${p(5.8, 107.8)} ${p(8, 108.6)}`} fill="none" stroke="rgba(255,255,255,.75)" strokeWidth=".6"/>
    </>;
  };
  const arm = (side: 1 | -1) => {
    const s = (x: number) => 32 + side * (x - 32);
    return <>
      <path d={`M${s(11.6)} 27.4 C${s(8.4)} 31.6 ${s(5.6)} 37 ${s(3.6)} 42.6 L${s(9.2)} 46 C${s(11)} 41.8 ${s(13.4)} 37.6 ${s(16)} 34 Z`} fill="url(#pk-cr-shirt)"/>
      <path d={`M${s(11.6)} 27.4 C${s(8.4)} 31.6 ${s(5.6)} 37 ${s(3.6)} 42.6 L${s(9.2)} 46 C${s(11)} 41.8 ${s(13.4)} 37.6 ${s(16)} 34 Z`} fill="url(#pk-cr-sleeve-shade)"/>
      <path d={`M${s(3.6)} 42.6 L${s(9.2)} 46`} stroke="#0f7a3a" strokeWidth="1.6" strokeLinecap="round"/>
      <path d={`M${s(4.2)} 43.4 C${s(3)} 47 ${s(2)} 50.8 ${s(1.6)} 54.2 C${s(1.4)} 55.6 ${s(1.6)} 56.8 ${s(1.8)} 57.6 L${s(6.6)} 58.6 C${s(7.2)} 55.6 ${s(8.2)} 51 ${s(9.6)} 45.8 Z`} fill="url(#pk-cr-skin)"/>
      <path d={`M${s(3.4)} 49.6 C${s(4.8)} 50.4 ${s(6.4)} 50.4 ${s(7.8)} 49.6`} fill="none" stroke="rgba(100,55,30,.4)" strokeWidth=".55"/>
      <path d={`M${s(3.6)} 45.4 C${s(3.2)} 47.4 ${s(2.8)} 49 ${s(2.6)} 50.6`} fill="none" stroke="rgba(255,225,195,.3)" strokeWidth=".7" strokeLinecap="round"/>
      <path d={`M${s(1.4)} 57.2 C${s(.8)} 59 ${s(1.4)} 61 ${s(3.2)} 61.4 C${s(5.2)} 61.6 ${s(6.8)} 60.4 ${s(6.8)} 58.4 C${s(6.6)} 57.6 ${s(5)} 57.2 ${s(1.4)} 57.2 Z`} fill="#c98e66"/>
      <path d={`M${s(6.4)} 58.2 C${s(7.4)} 58.6 ${s(7.8)} 59.8 ${s(7.4)} 60.6`} fill="none" stroke="#b07a55" strokeWidth=".9" strokeLinecap="round"/>
    </>;
  };
  return <svg viewBox="0 0 64 118" aria-hidden="true">
    <defs>
      <linearGradient id="pk-cr-shirt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5e0713"/><stop offset=".42" stopColor="#c81a32"/><stop offset=".6" stopColor="#b3152b"/><stop offset="1" stopColor="#5e0713"/></linearGradient>
      <linearGradient id="pk-cr-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,220,220,.2)"/><stop offset=".35" stopColor="rgba(255,255,255,0)"/><stop offset=".8" stopColor="rgba(20,0,5,.15)"/><stop offset="1" stopColor="rgba(20,0,5,.38)"/></linearGradient>
      <linearGradient id="pk-cr-sleeve-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,230,230,.14)"/><stop offset="1" stopColor="rgba(20,0,5,.32)"/></linearGradient>
      <linearGradient id="pk-cr-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a06a46"/><stop offset=".5" stopColor="#d9a079"/><stop offset="1" stopColor="#99633f"/></linearGradient>
      <linearGradient id="pk-cr-leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9a6441"/><stop offset=".45" stopColor="#d79e77"/><stop offset="1" stopColor="#925d3c"/></linearGradient>
      <linearGradient id="pk-cr-sock" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c0d1d"/><stop offset=".45" stopColor="#c81a32"/><stop offset="1" stopColor="#7c0d1d"/></linearGradient>
      <linearGradient id="pk-cr-boot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".6" stopColor="#d9dee6"/><stop offset="1" stopColor="#9aa3b2"/></linearGradient>
      <linearGradient id="pk-cr-shorts" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#063d1f"/><stop offset=".5" stopColor="#127540"/><stop offset="1" stopColor="#063d1f"/></linearGradient>
      <linearGradient id="pk-cr-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1412"/><stop offset=".45" stopColor="#3a2c24"/><stop offset="1" stopColor="rgba(140,105,85,.85)"/></linearGradient>
      <radialGradient id="pk-cr-neck" cx=".5" cy=".2" r=".9"><stop offset="0" stopColor="#d69b73"/><stop offset="1" stopColor="#99633f"/></radialGradient>
    </defs>
    <ellipse cx="32" cy="114.6" rx="24" ry="3.3" fill="rgba(0,0,0,.5)"/>
    <ellipse cx="32" cy="114.4" rx="16" ry="1.7" fill="rgba(0,0,0,.35)"/>
    <g className="pk-stand-leg">{leg(13.4, -4)}</g>
    <g className="pk-kick-leg">{leg(41.2, 4)}</g>
    {/* Quần xanh lá: nếp, cạp, viền đỏ */}
    <path d="M16.2 60.6 C15.4 66.4 14.4 71.6 13.8 77 C19.4 78.6 26.2 79.2 30.8 79 L32 73.6 L33.2 79 C37.8 79.2 44.6 78.6 50.2 77 C49.6 71.6 48.6 66.4 47.8 60.6 Z" fill="url(#pk-cr-shorts)"/>
    <path d="M16.6 61 L47.4 61 L47.6 64.8 L16.4 64.8 Z" fill="rgba(0,0,0,.45)"/>
    <path d="M20.6 66 C19.8 70.4 19.4 74 19.8 77.6 M43.4 66 C44.2 70.4 44.6 74 44.2 77.6 M30 66.4 C30.6 69.4 31.2 71.6 32 73.4" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth=".7"/>
    <path d="M48.6 62 L50.2 77" stroke="#c81a32" strokeWidth="1.4"/><path d="M15.4 62 L13.8 77" stroke="#c81a32" strokeWidth="1.4"/>
    <g className="pk-arms-akimbo">
      {[1, -1].map(side => { const s = (x: number) => 32 + side * (x - 32); return <g key={side}>
        <path d={`M${s(12.4)} 27.6 C${s(8.4)} 32.6 ${s(5)} 38.2 ${s(2.4)} 43.6 L${s(7)} 46.6 C${s(9.6)} 42 ${s(12.8)} 38 ${s(16)} 34.4 Z`} fill="url(#pk-cr-shirt)"/>
        <path d={`M${s(3)} 43 C${s(6.6)} 48.8 ${s(10.6)} 55 ${s(14.4)} 60.4 L${s(18.2)} 57.8 C${s(14.8)} 53.2 ${s(11)} 49 ${s(7.4)} 45.8 Z`} fill="url(#pk-cr-skin)"/>
        <ellipse cx={s(16.2)} cy="60" rx="2.9" ry="2.4" fill="#c98e66"/>
      </g>; })}
    </g>
    {/* Áo đỏ: thân + ánh sáng + nếp bả vai / sống lưng / gấu áo */}
    <path d="M11.6 27.4 C18 22.8 25 21.2 32 21.2 C39 21.2 46 22.8 52.4 27.4 C51.4 40 50 52 49 63.6 C42.6 65.8 21.4 65.8 15 63.6 C14 52 12.6 40 11.6 27.4 Z" fill="url(#pk-cr-shirt)"/>
    <path d="M11.6 27.4 C18 22.8 25 21.2 32 21.2 C39 21.2 46 22.8 52.4 27.4 C51.4 40 50 52 49 63.6 C42.6 65.8 21.4 65.8 15 63.6 C14 52 12.6 40 11.6 27.4 Z" fill="url(#pk-cr-light)"/>
    <path d="M18.4 32.6 C21.6 36.4 22.6 40.4 21.6 44.4 M45.6 32.6 C42.4 36.4 41.4 40.4 42.4 44.4" fill="none" stroke="rgba(40,0,8,.32)" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M32 26.6 C31.6 38 31.8 50 32.2 62.4" fill="none" stroke="rgba(40,0,8,.16)" strokeWidth="1.5"/>
    <path d="M17 58.8 C24 60.8 40 60.8 47 58.8 M16.6 62 C24 64 40 64 47.4 62" fill="none" stroke="rgba(40,0,8,.25)" strokeWidth=".7"/>
    <path className="pk-rim" d="M12.8 27.2 Q32 20 51.2 27.2" fill="none" stroke="rgba(255,235,220,.55)" strokeWidth=".9" strokeLinecap="round"/>
    <g className="pk-arm pk-arm-l">{arm(1)}</g>
    <g className="pk-arm pk-arm-r">{arm(-1)}</g>
    <g fill="#f2c94c" stroke="#5a0a14" strokeWidth=".45" paintOrder="stroke">
      <text x="32" y="35.6" textAnchor="middle" fontSize="4.4" fontWeight="800" letterSpacing=".5">RONALDO</text>
      <text x="32" y="57" textAnchor="middle" fontSize="20" fontWeight="800">7</text>
    </g>
    <path d="M25 23.8 C28.8 27 35.2 27 39 23.8" fill="none" stroke="#0f7a3a" strokeWidth="1.8" strokeLinecap="round"/>
    {/* Cổ khoẻ, tai, tóc: đỉnh đen vuốt, hai bên cạo chuyển màu xuống gáy */}
    <g className="pk-head">
      <path d="M27.4 17.2 C27 20.4 26.6 23 26 25 C29.8 26.6 34.2 26.6 38 25 C37.4 23 37 20.4 36.6 17.2 Z" fill="url(#pk-cr-neck)"/>
      <path d="M28.8 18.8 C29.4 21.6 29.2 23.8 28.4 25.4 M35.2 18.8 C34.6 21.6 34.8 23.8 35.6 25.4" fill="none" stroke="rgba(100,55,30,.45)" strokeWidth=".65"/>
      <path d="M22 11.2 C20.8 11.6 20.6 14.8 21.8 16.2 C22.6 17 23.6 16.6 23.8 15.6 Z" fill="#c08661"/><path d="M42 11.2 C43.2 11.6 43.4 14.8 42.2 16.2 C41.4 17 40.4 16.6 40.2 15.6 Z" fill="#c08661"/>
      <path d="M22.2 12.6 C22.6 13.6 22.6 14.8 22.4 15.6 M41.8 12.6 C41.4 13.6 41.4 14.8 41.6 15.6" fill="none" stroke="#8f5c3c" strokeWidth=".45"/>
      <path d="M23.2 12.4 C22.8 4.8 26.6 2.4 32 2.2 C37.4 2.4 41.2 4.8 40.8 12.4 C40.8 17.6 39.8 20.4 37.4 21.8 C35.6 22.8 34 23 32 23 C30 23 28.4 22.8 26.6 21.8 C24.2 20.4 23.2 17.6 23.2 12.4 Z" fill="url(#pk-cr-fade)"/>
      <path d="M24.6 10.4 C24.2 4 27.6 1.6 32 1.4 C36.4 1.6 39.8 4 39.4 10.4 C36.6 8.8 34.4 8.4 32 8.4 C29.6 8.4 27.4 8.8 24.6 10.4 Z" fill="#110d0c"/>
      <path d="M26.4 6.4 C29 4.4 35 4.4 37.6 6.4 M25.4 8.8 C28.6 7 35.4 7 38.6 8.8" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth=".5" strokeLinecap="round"/>
      <path d="M27.6 21.4 C30.4 22.4 33.6 22.4 36.4 21.4" fill="none" stroke="rgba(60,40,30,.5)" strokeWidth=".6"/>
      <path className="pk-rim" d="M25.4 7.6 C27.4 2.6 36.6 2.6 38.6 7.6" fill="none" stroke="rgba(255,245,230,.45)" strokeWidth=".9" strokeLinecap="round"/>
    </g>
  </svg>;
}

// Ronaldo nhìn từ phía trước, tư thế tiếp đất sau cú nhảy xoay người: hai chân dạng rộng từ hai bên hông, ưỡn ngực, hai tay duỗi chéo xuống,
// cằm ngẩng, mắt nheo, miệng mở to hét ăn mừng. Mặt vẽ cách điệu (không vẽ chân dung thật), áo không logo. Chỉ hiện khi ăn mừng.
function StrikerRonaldoFront() {
  const leg = (side: 1 | -1) => {
    const s = (x: number) => 32 + side * (x - 32);
    return <g key={side}>
      {/* Đùi bắt đầu từ hông (21,6 … 30,4), không chụm giữa; đầu gối, bắp chân phồng ra ngoài. */}
      <path d={`M${s(21.4)} 73.6 C${s(20)} 79 ${s(18.8)} 84.4 ${s(18.2)} 89.6 C${s(16.4)} 93.6 ${s(15.2)} 98 ${s(14.8)} 102.6 L${s(20.8)} 104.6 C${s(21.6)} 100.6 ${s(22.8)} 96.2 ${s(24.6)} 91.6 C${s(26.6)} 86.2 ${s(28.8)} 80 ${s(30.6)} 73.6 Z`} fill="url(#pk-cf-leg)"/>
      <path d={`M${s(19)} 89 C${s(20.6)} 90.4 ${s(23.4)} 90.8 ${s(25.2)} 90.2`} fill="none" stroke="rgba(90,50,28,.42)" strokeWidth=".6" strokeLinecap="round"/>
      <path d={`M${s(23.6)} 76.6 C${s(23)} 80.4 ${s(22.2)} 84 ${s(21.4)} 87.2`} fill="none" stroke="rgba(255,225,195,.3)" strokeWidth=".8" strokeLinecap="round"/>
      <path d={`M${s(17.2)} 93 C${s(16.6)} 95.6 ${s(16.2)} 98.2 ${s(16)} 100.6`} fill="none" stroke="rgba(255,225,195,.28)" strokeWidth=".7" strokeLinecap="round"/>
      <path d={`M${s(14.6)} 100.8 L${s(21)} 103 L${s(19.4)} 110.4 L${s(12.8)} 108.2 Z`} fill="url(#pk-cf-sock)"/>
      <path d={`M${s(14.4)} 101.6 L${s(20.8)} 103.8 L${s(20.4)} 105.4 L${s(14)} 103.2 Z`} fill="#0f7a3a"/>
      <path d={`M${s(12.2)} 107.6 C${s(14.4)} 106.8 ${s(18.6)} 108 ${s(20.4)} 110 C${s(20.2)} 111.4 ${s(19.4)} 112.6 ${s(18.2)} 113 L${s(8.8)} 112.8 C${s(8.6)} 111 ${s(10.2)} 108.8 ${s(12.2)} 107.6 Z`} fill="url(#pk-cf-boot)"/>
      <path d={`M${s(8.6)} 112.4 L${s(18.6)} 112.6 L${s(18.4)} 113.6 L${s(8.6)} 113.4 Z`} fill="#30343c"/>
    </g>;
  };
  const arm = (side: 1 | -1) => {
    const s = (x: number) => 32 + side * (x - 32);
    return <g key={side}>
      <path d={`M${s(13.4)} 27.4 C${s(10.4)} 30.4 ${s(8.2)} 33.8 ${s(6.6)} 37.6 L${s(11.8)} 41 C${s(13.4)} 37.8 ${s(15.6)} 35 ${s(18)} 32.6 Z`} fill="url(#pk-cf-shirt)"/>
      <path d={`M${s(6.6)} 37.6 L${s(11.8)} 41`} stroke="#0f7a3a" strokeWidth="1.6" strokeLinecap="round"/>
      <path d={`M${s(7.2)} 38.6 C${s(5.6)} 42.4 ${s(3.8)} 46.4 ${s(2.2)} 50.6 L${s(6.6)} 52.6 C${s(8.2)} 48.6 ${s(9.8)} 44.8 ${s(11.4)} 41.2 Z`} fill="url(#pk-cf-skin)"/>
      <path d={`M${s(1.8)} 50.2 C${s(.2)} 52.4 ${s(.4)} 55.4 ${s(2.6)} 56.2 C${s(4.8)} 56.8 ${s(6.8)} 55.2 ${s(7)} 52.8 Z`} fill="#c98e66"/>
      <path d={`M${s(1.4)} 53 L${s(-.6)} 55.6 M${s(2.4)} 55.6 L${s(1)} 58.4 M${s(4)} 56.2 L${s(3.6)} 59.2 M${s(5.6)} 55.6 L${s(5.8)} 58.4`} stroke="#c98e66" strokeWidth="1.1" strokeLinecap="round"/>
    </g>;
  };
  return <svg viewBox="0 0 64 118" aria-hidden="true">
    <defs>
      <linearGradient id="pk-cf-shirt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6a0816"/><stop offset=".5" stopColor="#d01d36"/><stop offset="1" stopColor="#6a0816"/></linearGradient>
      <linearGradient id="pk-cf-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,225,225,.24)"/><stop offset=".4" stopColor="rgba(255,255,255,0)"/><stop offset="1" stopColor="rgba(20,0,5,.35)"/></linearGradient>
      <linearGradient id="pk-cf-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a06a46"/><stop offset=".5" stopColor="#dca37b"/><stop offset="1" stopColor="#99633f"/></linearGradient>
      <linearGradient id="pk-cf-leg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#925d3c"/><stop offset=".5" stopColor="#d9a079"/><stop offset="1" stopColor="#925d3c"/></linearGradient>
      <linearGradient id="pk-cf-sock" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7c0d1d"/><stop offset=".5" stopColor="#c81a32"/><stop offset="1" stopColor="#7c0d1d"/></linearGradient>
      <linearGradient id="pk-cf-boot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#9aa3b2"/></linearGradient>
      <linearGradient id="pk-cf-shorts" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#063d1f"/><stop offset=".5" stopColor="#14804a"/><stop offset="1" stopColor="#063d1f"/></linearGradient>
      <radialGradient id="pk-cf-face" cx=".5" cy=".42" r=".7"><stop offset="0" stopColor="#e9b38c"/><stop offset=".7" stopColor="#c98e66"/><stop offset="1" stopColor="#9e6a48"/></radialGradient>
      <linearGradient id="pk-cf-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#120e0c"/><stop offset=".55" stopColor="#3a2c24"/><stop offset="1" stopColor="rgba(150,110,85,.0)"/></linearGradient>
    </defs>
    <ellipse cx="32" cy="114.4" rx="28" ry="3.4" fill="rgba(0,0,0,.5)"/>
    {leg(1)}{leg(-1)}
    {/* Quần xanh lá phủ hết đầu đùi */}
    <path d="M15.4 60.6 C14.8 65.6 14.2 70.8 13.8 76.2 C19.6 78.2 26.2 78.6 31 78.2 L32 74 L33 78.2 C37.8 78.6 44.4 78.2 50.2 76.2 C49.8 70.8 49.2 65.6 48.6 60.6 Z" fill="url(#pk-cf-shorts)"/>
    <path d="M49 62 L50.2 76.2 M15 62 L13.8 76.2" stroke="#c81a32" strokeWidth="1.4"/>
    <path d="M22 66 C21.4 70 21 73.6 21.2 77 M42 66 C42.6 70 43 73.6 42.8 77" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth=".7"/>
    <text x="43" y="73.6" textAnchor="middle" fontSize="4.4" fontWeight="800" fill="#f2c94c">7</text>
    {arm(1)}{arm(-1)}
    {/* Áo đỏ, ưỡn ngực */}
    <path d="M12.6 27.2 C18.6 23.6 25 22 32 22 C39 22 45.4 23.6 51.4 27.2 C50.6 39.6 49.6 51.6 48.8 63.2 C42.4 65.4 21.6 65.4 15.2 63.2 C14.4 51.6 13.4 39.6 12.6 27.2 Z" fill="url(#pk-cf-shirt)"/>
    <path d="M12.6 27.2 C18.6 23.6 25 22 32 22 C39 22 45.4 23.6 51.4 27.2 C50.6 39.6 49.6 51.6 48.8 63.2 C42.4 65.4 21.6 65.4 15.2 63.2 C14.4 51.6 13.4 39.6 12.6 27.2 Z" fill="url(#pk-cf-light)"/>
    <path d="M19.6 33.4 C23.8 37.4 28.6 38.6 32 38.4 C35.4 38.6 40.2 37.4 44.4 33.4" fill="none" stroke="rgba(255,210,210,.24)" strokeWidth="1.2"/>
    <path d="M22 44 C26 46 38 46 42 44 M18.6 58.6 C25 60.6 39 60.6 45.4 58.6" fill="none" stroke="rgba(40,0,8,.25)" strokeWidth=".8"/>
    <text x="23" y="34" textAnchor="middle" fontSize="5" fontWeight="800" fill="#f2c94c" stroke="#5a0a14" strokeWidth=".35" paintOrder="stroke">7</text>
    <path d="M25.2 23.4 L32 30.6 L38.8 23.4" fill="none" stroke="#0f7a3a" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M26.6 23 L32 28.6 L37.4 23 C35.6 22.4 33.8 22.2 32 22.2 C30.2 22.2 28.4 22.4 26.6 23 Z" fill="url(#pk-cf-skin)"/>
    {/* Cổ khoẻ */}
    <path d="M26.8 16.6 C26.6 19.6 26.2 22.2 25.6 24 C29.6 25.8 34.4 25.8 38.4 24 C37.8 22.2 37.4 19.6 37.2 16.6 Z" fill="url(#pk-cf-skin)"/>
    <path d="M28.4 18 C29.4 20.4 30.2 22.4 30.6 24.6 M35.6 18 C34.6 20.4 33.8 22.4 33.4 24.6" fill="none" stroke="rgba(100,55,30,.45)" strokeWidth=".6"/>
    {/* Tai, mặt quai hàm vuông, cằm ngẩng */}
    <path d="M22 9.6 C20.6 10 20.4 13.6 21.8 15 C22.6 15.8 23.6 15.4 23.8 14.2 Z" fill="#c08661"/><path d="M42 9.6 C43.4 10 43.6 13.6 42.2 15 C41.4 15.8 40.4 15.4 40.2 14.2 Z" fill="#c08661"/>
    <path d="M23.2 10.4 C23 5 26.8 2.6 32 2.4 C37.2 2.6 41 5 40.8 10.4 C40.8 14.6 40 17.4 38 19.6 C36.4 21.2 34.4 21.8 32 21.8 C29.6 21.8 27.6 21.2 26 19.6 C24 17.4 23.2 14.6 23.2 10.4 Z" fill="url(#pk-cf-face)"/>
    <path d="M24.4 15.6 C25.4 18.4 27.4 20.6 30 21.4 M39.6 15.6 C38.6 18.4 36.6 20.6 34 21.4" fill="none" stroke="rgba(120,70,45,.45)" strokeWidth=".55"/>
    {/* Tóc: hai bên cạo sát chuyển màu, đỉnh đen vuốt dựng ra trước */}
    <path d="M23.2 10.2 C22.8 5.2 26 2.4 32 2.2 C38 2.4 41.2 5.2 40.8 10.2 C40 8.4 39.2 7.4 38.4 7 C37 6.4 27 6.4 25.6 7 C24.8 7.4 24 8.4 23.2 10.2 Z" fill="url(#pk-cf-fade)"/>
    <path d="M25.2 6.8 C24.8 3.2 27.6 .2 32.6 -.4 C36.4 -.6 39.6 1 39.2 5 C38.8 6.4 37.8 6.8 36.4 6.6 C33 5.8 29.6 6 26.6 7 C26 7.2 25.4 7.2 25.2 6.8 Z" fill="#0e0b0a"/>
    <path d="M27.6 2.8 C30 .8 34.2 .4 37 1.6 M27 5 C30 3.4 34.4 3.2 37.6 4.2" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".5" strokeLinecap="round"/>
    {/* Lông mày đậm chau lại, mắt nheo mạnh */}
    <path d="M25.6 9 L30.4 10.2 M38.4 9 L33.6 10.2" stroke="#1a120e" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M26.2 11.6 C27.4 10.9 29 11 30 11.8 C29 12.4 27.4 12.4 26.2 11.6 Z M37.8 11.6 C36.6 10.9 35 11 34 11.8 C35 12.4 36.6 12.4 37.8 11.6 Z" fill="#1d1410"/>
    <path d="M30.8 10.6 C31.2 11.8 31 13.4 30.6 14.6 C31.4 15.2 32.6 15.2 33.4 14.6" fill="none" stroke="rgba(110,65,40,.6)" strokeWidth=".55" strokeLinecap="round"/>
    <path d="M27.4 13.4 C28.6 14.6 29.4 15.8 29.6 17 M36.6 13.4 C35.4 14.6 34.6 15.8 34.4 17" fill="none" stroke="rgba(120,70,45,.35)" strokeWidth=".5"/>
    {/* Miệng mở to hét: hàm răng trên, lưỡi */}
    <path d="M28.6 15.8 C29.6 15.2 34.4 15.2 35.4 15.8 C35.6 18.6 34.2 20.4 32 20.6 C29.8 20.4 28.4 18.6 28.6 15.8 Z" fill="#3b0d0e"/>
    <path d="M29 16 C30.4 15.6 33.6 15.6 35 16 L34.8 17 C33.2 16.7 30.8 16.7 29.2 17 Z" fill="#f6efe7"/>
    <ellipse cx="32" cy="19.4" rx="1.9" ry="1" fill="#b4434a"/>
    <path className="pk-rim" d="M24.2 6.4 C26.6 1.6 37.4 1.6 39.8 6.4" fill="none" stroke="rgba(255,245,230,.4)" strokeWidth=".9" strokeLinecap="round"/>
  </svg>;
}

// Bóng 3D: khối cầu đổ bóng, hoạ tiết ngũ giác lặp lại cuộn ngang bên trong (khi bay lớp .pk-ball-panels trượt → trông như bóng xoáy),
// điểm sáng phản chiếu đứng yên phía trên.
function Ball() {
  return <svg viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <radialGradient id="pk-ball-shade" cx=".36" cy=".3" r=".78"><stop offset="0" stopColor="#ffffff"/><stop offset=".55" stopColor="#eef0f4"/><stop offset=".85" stopColor="#b9c0cc"/><stop offset="1" stopColor="#7e8796"/></radialGradient>
      <radialGradient id="pk-ball-depth" cx=".5" cy=".5" r=".5"><stop offset=".55" stopColor="rgba(0,0,0,0)"/><stop offset="1" stopColor="rgba(10,14,22,.45)"/></radialGradient>
      <pattern id="pk-ball-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
        <polygon points="10,4.4 15.3,8.3 13.3,14.5 6.7,14.5 4.7,8.3" fill="#1b1e24"/>
        <path d="M10 4.4 L10 0 M15.3 8.3 L20 6.6 M13.3 14.5 L16 20 M6.7 14.5 L4 20 M4.7 8.3 L0 6.6" stroke="#3a404b" strokeWidth=".9"/>
        <polygon points="0,16 2.2,17.6 1.4,20 -1.4,20 -2.2,17.6" fill="#1b1e24"/><polygon points="20,16 22.2,17.6 21.4,20 18.6,20 17.8,17.6" fill="#1b1e24"/>
      </pattern>
      <clipPath id="pk-ball-clip"><circle cx="20" cy="20" r="17.6"/></clipPath>
    </defs>
    <circle cx="20" cy="20" r="18" fill="url(#pk-ball-shade)"/>
    <g clipPath="url(#pk-ball-clip)"><rect className="pk-ball-panels" x="-20" y="-1" width="80" height="42" fill="url(#pk-ball-pattern)" opacity=".92"/></g>
    <circle cx="20" cy="20" r="18" fill="url(#pk-ball-depth)"/>
    <circle cx="20" cy="20" r="17.6" fill="none" stroke="#2a2f38" strokeWidth=".8"/>
    <ellipse cx="13.4" cy="10.6" rx="5.4" ry="3.4" fill="rgba(255,255,255,.8)" transform="rotate(-30 13.4 10.6)"/>
    <ellipse cx="11.6" cy="9.6" rx="1.8" ry="1.1" fill="#fff" transform="rotate(-30 11.6 9.6)"/>
  </svg>;
}

// Không khí sân: đèn flash máy ảnh nháy trên khán đài, hạt bụi bay trong hai chùm đèn pha (vị trí cố định để không nhảy khi vẽ lại).
const FLASHES = Array.from({ length: 22 }, (_, i) => ({ left: (i * 37.3 + 11) % 100, top: 5 + ((i * 53.7) % 27), delay: (i * .73) % 5.2, size: 2 + (i % 3) }));
const MOTES = Array.from({ length: 16 }, (_, i) => ({ left: i % 2 ? 80 + (i * 7.1) % 12 : 8 + (i * 6.3) % 12, top: 8 + (i * 11.7) % 44, delay: (i * .9) % 7, dur: 6 + (i % 4) * 1.5, drift: (i % 2 ? -1 : 1) * (6 + (i % 3) * 4) }));
function Atmosphere() {
  return <div className="pk-atmos" aria-hidden="true">
    <div className="pk-haze"/>
    {FLASHES.map((f, i) => <i key={`f${i}`} className="pk-flashbulb" style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size, height: f.size, animationDelay: `${f.delay}s` }}/>)}
    {MOTES.map((m, i) => <i key={`m${i}`} className="pk-mote" style={{ left: `${m.left}%`, top: `${m.top}%`, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s`, ['--drift' as string]: `${m.drift}px` }}/>)}
  </div>;
}

// Sân vận động: mái, khán đài 3 tầng, đèn pha, bảng LED, cỏ có vân, khung thành có chiều sâu (viewBox 160 × 100 = sân khấu 16:10).
function Pitch() {
  const tiers = [[3.5, 10.5, 'pk-crowd-a', .55], [11, 21, 'pk-crowd-b', .78], [21.5, 33.5, 'pk-crowd-c', 1]] as const;
  return <svg className="pk-pitch" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="pk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#03060d"/><stop offset="1" stopColor="#0d1526"/></linearGradient>
      <radialGradient id="pk-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgba(255,248,226,.85)"/><stop offset=".25" stopColor="rgba(255,240,200,.35)"/><stop offset="1" stopColor="rgba(255,240,200,0)"/></radialGradient>
      <linearGradient id="pk-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,246,214,.22)"/><stop offset="1" stopColor="rgba(255,246,214,0)"/></linearGradient>
      {[['a', ['#3b4560', '#5a3f52', '#2f4a5a', '#6b6f80']], ['b', ['#44506e', '#7a4a4a', '#3d6474', '#8a8fa0', '#6a5a2c']], ['c', ['#5a6687', '#9a5550', '#4e8296', '#b9bdc8', '#a8873c', '#3e6a4a']]].map(([id, colors]) =>
        <pattern key={id as string} id={`pk-crowd-${id}`} width="5.2" height="2.6" patternUnits="userSpaceOnUse">
          {(colors as string[]).map((c, i) => <circle key={i} cx={(i * 1.13 + (i % 2) * .4) % 5.2 + .3} cy={i % 2 ? 1.75 : .7} r={.52 + (i % 3) * .08} fill={c}/>)}
          <rect x="0" y="2.25" width="5.2" height=".35" fill="rgba(0,0,0,.35)"/>
        </pattern>)}
      <linearGradient id="pk-crowd-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(3,6,13,.75)"/><stop offset="1" stopColor="rgba(3,6,13,.05)"/></linearGradient>
      <linearGradient id="pk-led" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1408"/><stop offset=".5" stopColor="#2c220c"/><stop offset="1" stopColor="#120e05"/></linearGradient>
      <linearGradient id="pk-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#164a29"/><stop offset=".45" stopColor="#226b38"/><stop offset="1" stopColor="#2d8746"/></linearGradient>
      <filter id="pk-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4 .9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .05  0 0 0 0 .2  0 0 0 0 .07  0 0 0 .9 -.25"/></filter>
      <pattern id="pk-net" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 H2 M0 0 V2" stroke="rgba(236,241,250,.62)" strokeWidth=".16"/></pattern>
      <pattern id="pk-net-far" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 H1.6 M0 0 V1.6" stroke="rgba(220,228,240,.4)" strokeWidth=".12"/></pattern>
      <linearGradient id="pk-goal-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(2,5,10,.55)"/><stop offset="1" stopColor="rgba(2,5,10,.25)"/></linearGradient>
      <linearGradient id="pk-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9aa3b2"/><stop offset=".35" stopColor="#ffffff"/><stop offset=".7" stopColor="#dfe4ec"/><stop offset="1" stopColor="#8b94a3"/></linearGradient>
      <linearGradient id="pk-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".6" stopColor="#dfe4ec"/><stop offset="1" stopColor="#8b94a3"/></linearGradient>
    </defs>
    <rect width="160" height="46" fill="url(#pk-sky)"/>
    {/* Mái che */}
    <path d="M0 0 H160 V3.2 Q80 6.4 0 3.2 Z" fill="#05080f"/><path d="M0 3.2 Q80 6.4 160 3.2" fill="none" stroke="rgba(255,240,200,.25)" strokeWidth=".35"/>
    <g className="pk-crowd">{tiers.map(([y1, y2, id, light]) => <g key={id}><rect y={y1} width="160" height={y2 - y1} fill={`url(#${id})`} opacity={light}/><rect y={y2 - .5} width="160" height=".5" fill="#05070c"/></g>)}</g>
    <rect y="3" width="160" height="31" fill="url(#pk-crowd-shade)"/>
    {/* Đèn pha + chùm sáng */}
    {[12, 148].map(x => <g key={x}>
      <polygon points={`${x - 3},3 ${x + 3},3 ${x + (x < 80 ? 26 : -6)},60 ${x + (x < 80 ? 6 : -26)},60`} fill="url(#pk-beam)"/>
      <circle cx={x} cy="3.5" r="15" fill="url(#pk-glow)"/>
      {[-2.4, -.8, .8, 2.4].map(dx => <rect key={dx} x={x + dx - .55} y="2.4" width="1.1" height="1.6" rx=".2" fill="#fffaf0"/>)}
    </g>)}
    {/* Bảng LED */}
    <rect y="34" width="160" height="8" fill="#06080c"/>
    {[0, 1, 2, 3].map(i => <g key={i}>
      <rect x={i * 40 + .6} y="34.6" width="38.8" height="6.6" rx=".5" fill="url(#pk-led)" stroke="rgba(217,186,118,.35)" strokeWidth=".2"/>
      <text x={i * 40 + 20} y="39.4" textAnchor="middle" fontSize={i % 2 ? 3 : 3.8} fontWeight="800" letterSpacing=".5" fill={i % 2 ? '#62c3ff' : '#ffd76a'} style={{ filter: `drop-shadow(0 0 .6px ${i % 2 ? '#62c3ff' : '#ffd76a'})` }}>{i % 2 ? 'SÚT PHẠT ĐỀN' : 'FCO VIP'}</text>
    </g>)}
    {/* Cỏ: dải cắt + vân */}
    <rect y="42" width="160" height="58" fill="url(#pk-grass)"/>
    {[42, 45, 49, 54, 60, 67, 75, 85].map((y, i, all) => i % 2 ? <rect key={y} y={y} width="160" height={(all[i + 1] ?? 100) - y} fill="rgba(255,255,255,.05)"/> : null)}
    <rect y="42" width="160" height="58" filter="url(#pk-grain)" opacity=".55"/>
    <g stroke="rgba(255,255,255,.88)" strokeWidth=".6" fill="none" strokeLinejoin="round">
      <line x1="0" y1="56" x2="160" y2="56"/>
      <polyline points="26,56 18,68 142,68 134,56"/>
      <polyline points="6,56 -10,97 170,97 154,56"/>
    </g>
    <ellipse cx="80" cy="89.6" rx="2" ry=".8" fill="rgba(255,255,255,.9)"/>
    {/* Khung thành: nền trong khung, lưới sau / hai bên / nóc, bóng xà trên cỏ, cột + xà phía trước. */}
    <polygon points="45,15 115,15 117,51 43,51" fill="url(#pk-goal-in)"/>
    <polygon points="43,51 117,51 121.6,56 38.4,56" fill="rgba(0,0,0,.28)"/>
    <polygon points="45,15 115,15 117,51 43,51" fill="url(#pk-net-far)"/>
    <polygon points="38.4,20 45,15 43,51 38.4,56" fill="url(#pk-net)"/>
    <polygon points="121.6,20 115,15 117,51 121.6,56" fill="url(#pk-net)"/>
    <polygon points="38.4,20 121.6,20 115,15 45,15" fill="url(#pk-net)"/>
    <g stroke="rgba(236,241,250,.5)" strokeWidth=".25" fill="none"><path d="M45 15 L43 51 M115 15 L117 51 M43 51 L117 51"/></g>
    <rect x="37.3" y="19" width="2.2" height="37.2" rx=".6" fill="url(#pk-post)"/>
    <rect x="120.5" y="19" width="2.2" height="37.2" rx=".6" fill="url(#pk-post)"/>
    <rect x="37.3" y="19" width="85.4" height="2" rx=".6" fill="url(#pk-bar)"/>
    <ellipse cx="38.4" cy="56.4" rx="2.4" ry=".55" fill="rgba(0,0,0,.35)"/><ellipse cx="121.6" cy="56.4" rx="2.4" ry=".55" fill="rgba(0,0,0,.35)"/>
  </svg>;
}

export default function PenaltyPage({ online, reduced, onStart, onShoot }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [height, setHeight] = useState(.3);
  const [kind, setKind] = useState<ShotKind>('normal');
  const [shooter, setShooter] = useState<Shooter>(savedShooter);
  // Âm thanh sân (src/penalty-audio.ts): khán đài rì rào + tiếng chạm bóng / lưới / cột / găng; nút tắt tiếng nhớ trên máy.
  const [muted, setMuted] = useState(savedPenaltyMute);
  const audio = useRef<CrowdAudio | null>(null);
  if (!audio.current) audio.current = new CrowdAudio(muted);
  const started = useRef(false);
  const toggleMute = () => { const next = !muted; setMuted(next); savePenaltyMute(next); audio.current?.setMuted(next); if (!next && started.current) audio.current?.start(); };
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') { if (started.current) audio.current?.start(); } else audio.current?.pause(); };
    document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); audio.current?.dispose(); };
  }, []);
  const pickShooter = (next: Shooter) => { setShooter(next); try { localStorage.setItem(SHOOTER_KEY, next); } catch { /* chỉ nhớ trong phiên này */ } };
  const [message, setMessage] = useState<{ kind: keyof typeof RESULT_TEXT; text: string } | null>(null);
  const [error, setError] = useState('');
  const [keeper, setKeeper] = useState({ x: 0, y: 0 });
  const [kicking, setKicking] = useState(false);
  // Bóng lăn trên nền lưới sau khi vào (hoạ tiết bóng cuộn).
  const [rolling, setRolling] = useState(false);
  // Điệu bộ sau cú sút: celebrate = ăn mừng (Messi chỉ tay lên trời, Ronaldo bật nhảy xoay người dang tay), sad = chống hông lắc đầu.
  const [pose, setPose] = useState<'celebrate' | 'sad' | null>(null);
  // Máy quay: zoom dần vào khung thành khi sút, giật zoom khi ghi bàn, lùi nhẹ khi không vào.
  const [camera, setCamera] = useState<'idle' | 'shoot' | 'goal' | 'miss'>('idle');
  const [flying, setFlying] = useState<ShotKind | null>(null);
  const [burst, setBurst] = useState<{ id: number; left: number; top: number } | null>(null);
  const [shake, setShake] = useState(0);
  const stage = useRef<HTMLDivElement>(null), marker = useRef<HTMLDivElement>(null), line = useRef<SVGLineElement>(null);
  const ball = useRef<HTMLDivElement>(null), shadow = useRef<HTMLDivElement>(null), ghosts = useRef<(HTMLDivElement | null)[]>([]);
  const aimX = useRef(0), phaseRef = useRef<Phase>('idle'), heightRef = useRef(height), streakRef = useRef(0), kindRef = useRef(kind);
  phaseRef.current = phase; heightRef.current = height; streakRef.current = streak; kindRef.current = kind;
  // Pháo giấy khi ghi bàn: vị trí / màu / độ trễ cố định theo lượt nổ.
  const confetti = useMemo(() => burst ? Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * .35, drift: (Math.random() - .5) * 30, color: CONFETTI[i % CONFETTI.length], spin: Math.random() * 720 - 360, size: 5 + Math.random() * 6,
  })) : [], [burst?.id]);

  // Vạch ngắm lắc qua lại (sin theo thời gian), nhanh dần theo chuỗi bàn; vẽ thẳng vào DOM để không vẽ lại cả trang mỗi khung hình.
  useEffect(() => {
    let frame = 0, last = performance.now(), angle = 0;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
      if (phaseRef.current === 'aiming') { angle += dt * goalSweepSpeed(streakRef.current); aimX.current = Math.sin(angle); }
      const at = aimToStage(aimX.current, heightRef.current);
      if (marker.current) { marker.current.style.left = `${at.left}%`; marker.current.style.top = `${at.top}%`; }
      if (line.current) { line.current.setAttribute('x2', String(at.left * 1.6)); line.current.setAttribute('y2', String(at.top)); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Đặt bóng / bóng đổ trực tiếp vào DOM (bóng bay theo đường cong nên không dùng transition CSS).
  const place = (at: Point, scale: number, shadowAt: Point, shadowScale: number) => {
    if (ball.current) { ball.current.style.left = `${at.left}%`; ball.current.style.top = `${at.top}%`; ball.current.style.transform = `translate(-50%, -50%) scale(${scale})`; }
    if (shadow.current) { shadow.current.style.left = `${shadowAt.left}%`; shadow.current.style.top = `${shadowAt.top}%`; shadow.current.style.transform = `translate(-50%, -50%) scale(${shadowScale})`; }
  };
  const hideGhosts = () => ghosts.current.forEach(g => { if (g) g.style.opacity = '0'; });
  useEffect(() => { place(BALL_SPOT, 1, SHADOW_SPOT, 1); }, []);
  // Bay từ a tới b qua điểm điều khiển c trong duration ms; tỷ lệ bóng / bóng đổ đổi tuyến tính; vệt bóng mờ theo sau.
  // opts.trail = false: không kéo vệt bóng mờ (bóng rơi / lăn trong lưới); opts.shadowScale: cỡ bóng đổ đầu → cuối.
  const fly = (a: Point, c: Point, b: Point, duration: number, scale: [number, number], shadowTop: [number, number], ease = (t: number) => 1 - (1 - t) ** 2, opts: { trail?: boolean; shadowScale?: [number, number] } = {}) => new Promise<void>(resolve => {
    const trailOn = opts.trail ?? true, sh = opts.shadowScale ?? [1, .5];
    // Mốc bắt đầu lấy từ khung hình đầu tiên (thời gian của requestAnimationFrame có thể sớm hơn performance.now()),
    // tiến độ luôn trong 0…1 để bóng không bị đẩy ra ngoài và lần bay chắc chắn kết thúc.
    const ms = reduced ? Math.min(220, duration) : duration, trail: Point[] = [];
    let started = -1, done = false;
    const finish = () => { if (done) return; done = true; place(b, scale[1], { left: b.left, top: shadowTop[1] }, sh[1]); hideGhosts(); resolve(); };
    // Dự phòng: trình duyệt tạm dừng khung hình (chuyển tab, máy yếu) thì vẫn đặt bóng vào đích và đi tiếp, không kẹt lượt sút.
    const fallback = setTimeout(finish, ms + 250);
    const step = (now: number) => {
      if (done) return;
      if (started < 0) started = now;
      const raw = Math.max(0, Math.min(1, (now - started) / ms)), t = ease(raw), at = bezier(a, c, b, t);
      const s = scale[0] + (scale[1] - scale[0]) * t, st = shadowTop[0] + (shadowTop[1] - shadowTop[0]) * t;
      place(at, s, { left: at.left, top: st }, sh[0] + (sh[1] - sh[0]) * t);
      trail.push(at);
      if (!reduced && trailOn) ghosts.current.forEach((g, i) => {
        const p = trail[trail.length - 1 - (i + 1) * 2];
        if (!g) return;
        if (!p) { g.style.opacity = '0'; return; }
        g.style.left = `${p.left}%`; g.style.top = `${p.top}%`; g.style.opacity = String(.55 * (1 - i / GHOSTS)); g.style.transform = `translate(-50%, -50%) scale(${s * (1 - i * .08)})`;
      });
      if (raw < 1) requestAnimationFrame(step); else { clearTimeout(fallback); finish(); }
    };
    requestAnimationFrame(step);
  });

  const resetScene = () => { place(BALL_SPOT, 1, SHADOW_SPOT, 1); hideGhosts(); setKeeper({ x: 0, y: 0 }); setKicking(false); setPose(null); setCamera('idle'); setFlying(null); setRolling(false); setBurst(null); };
  // Sau khi vào: bóng chạm lưới rồi rơi xuống nền trong khung thành (rơi nhanh dần), nảy nhẹ một lần, lăn thêm một đoạn rồi dừng.
  const settleInNet = async (at: Point, kind: ShotKind) => {
    // Bóng luôn nằm trong khung (giữa hai cột 24 % … 76 %); sát lưới hông thì lăn ngược vào giữa như bật ra khỏi lưới.
    const floor = 54.4, shadowTop = 55.2, dir = (at.left >= 50 ? 1 : -1) * (kind === 'trivela' ? -1 : 1);
    const inside = (x: number) => Math.max(27, Math.min(73, x));
    const land = { left: inside(at.left + dir * 1.2), top: floor };
    await fly(at, { left: at.left + dir * .8, top: at.top }, land, Math.max(240, (floor - at.top) * 16), [.42, .4], [shadowTop, shadowTop], t => t * t, { trail: false, shadowScale: [.3, .55] });
    const hop = { left: inside(land.left + dir * 1.6), top: floor };
    await fly(land, { left: land.left + dir * .8, top: floor - 3.2 }, hop, 260, [.4, .4], [shadowTop, shadowTop], t => t, { trail: false, shadowScale: [.55, .55] });
    setRolling(true);
    const rollDir = hop.left > 66 || hop.left < 34 ? (hop.left > 50 ? -1 : 1) : dir;
    const stop = { left: inside(hop.left + rollDir * 4.5), top: floor };
    await fly(hop, { left: (hop.left + stop.left) / 2, top: floor }, stop, 650, [.4, .4], [shadowTop, shadowTop], t => 1 - (1 - t) ** 3, { trail: false, shadowScale: [.55, .55] });
    setRolling(false);
  };
  const start = async () => {
    if (!online || phaseRef.current === 'starting') return;
    // Bật tiếng khán đài ngay trong lần bấm (trình duyệt chỉ cho phát âm thanh sau thao tác của người chơi).
    audio.current?.start(); started.current = true;
    setPhase('starting'); setError(''); setMessage(null);
    try {
      const run = await onStart();
      setStreak(run.streak); setBest(run.best); resetScene();
      setPhase('aiming'); stage.current?.focus();
    } catch (e) { setError((e as Error).message); setPhase('idle'); }
  };
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, reduced ? Math.min(ms, 250) : ms));
  const shoot = async () => {
    if (phaseRef.current !== 'aiming') return;
    const x = Math.round(aimX.current * 1000) / 1000, y = Math.round(heightRef.current * 1000) / 1000, shotKind = kindRef.current;
    setPhase('shooting'); setError('');
    // Cầu thủ lấy đà ngay khi bấm; kết quả máy chủ thường về trước khi chân chạm bóng.
    setKicking(true); setCamera('shoot');
    setTimeout(() => audio.current?.kick(), reduced ? 0 : 280);
    let shot: PenaltyShot;
    try { [shot] = await Promise.all([onShoot(x, y, shotKind), wait(300)]); }
    catch (e) { setError((e as Error).message); setKicking(false); setCamera('idle'); setPhase('aiming'); return; }
    const aim = aimToStage(x, y), miss = shot.miss ?? null;
    const target = miss ? missTargets(miss, aim).hit : aim, path = flightPath(shotKind, target);
    setFlying(shotKind);
    if (shotKind === 'power') setShake(n => n + 1);
    const flight = fly(BALL_SPOT, path.control, target, path.duration, [1, .42], [SHADOW_SPOT.top, 56.6], shotKind === 'power' ? t => t : undefined);
    await wait(Math.min(90, path.duration / 5));
    setKeeper(shot.keeper);
    await flight;
    setFlying(null);
    // Tiếng va chạm đúng lúc bóng tới: lưới / cột hoặc xà / găng thủ môn.
    if (shot.goal) audio.current?.netHit(); else if (miss) audio.current?.postHit(); else audio.current?.save();
    if (shot.goal) {
      setStreak(shot.streak); setBest(shot.best);
      setBurst({ id: Date.now(), left: target.left, top: target.top });
      setPose('celebrate'); setCamera('goal');
      setMessage({ kind: 'goal', text: RESULT_TEXT.goal }); setPhase('result');
      void settleInNet(target, shotKind);
      await wait(1700);
      setMessage(null); resetScene();
      await wait(380);
      setPhase('aiming');
      return;
    }
    setBest(shot.best);
    setPose('sad'); setCamera('miss');
    if (miss) {
      // Vọt xà: bóng bay tiếp lên khán đài; dội cột: bóng bật ra ngoài.
      const after = missTargets(miss, aim).after;
      setShake(n => n + 1);
      setMessage({ kind: miss, text: RESULT_TEXT[miss] }); setPhase('result');
      await fly(target, { left: (target.left + after.left) / 2, top: Math.min(target.top, after.top) - (miss === 'bar' ? 4 : 2) }, after, 520, [.42, miss === 'bar' ? .3 : .5], [56.6, miss === 'bar' ? 50 : after.top + 2]);
    } else {
      // Thủ môn đẩy bóng: bóng bật ra rồi rơi xuống cỏ, sân rung nhẹ.
      const keeperAt = keeperToStage(shot.keeper.x, shot.keeper.y), side = shot.keeper.x >= 0 ? 1 : -1;
      const out = { left: Math.max(6, Math.min(94, keeperAt.left + side * 16)), top: 66 };
      setShake(n => n + 1);
      setMessage({ kind: 'saved', text: RESULT_TEXT.saved }); setPhase('result');
      await fly(target, { left: (target.left + out.left) / 2, top: Math.min(target.top, out.top) - 6 }, out, 520, [.42, .62], [56.6, 68]);
    }
    await wait(900);
    setPhase('over');
  };
  const nudge = (delta: number) => { if (phaseRef.current === 'aiming' || phaseRef.current === 'idle' || phaseRef.current === 'over') setHeight(h => Math.max(0, Math.min(1, Math.round((h + delta) * 10) / 10))); };
  const choose = (next: ShotKind) => { if (phaseRef.current !== 'shooting' && phaseRef.current !== 'result') setKind(next); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      const picked = SHOT_KINDS.find(k => k.key === e.key);
      if (picked) { choose(picked.id); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudge(HEIGHT_STEP); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-HEIGHT_STEP); }
      else if (e.key === ' ' || e.key === 'Enter') {
        if (phaseRef.current === 'aiming') { e.preventDefault(); void shoot(); }
        else if ((phaseRef.current === 'idle' || phaseRef.current === 'over') && document.activeElement === stage.current) { e.preventDefault(); void start(); }
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const diving = keeper.x !== 0 || keeper.y !== 0;
  const keeperAt = keeperToStage(keeper.x, keeper.y);
  const aiming = phase === 'aiming' || phase === 'idle';
  const current = SHOT_KINDS.find(k => k.id === kind)!;

  return <section className={`workspace penalty-page${reduced ? ' is-reduced' : ''}`} aria-label="Penalty">
    <header className="pk-head">
      <h1><Target aria-hidden="true"/>Penalty</h1>
      <div className="pk-score" role="status">
        <button type="button" className="pk-sound" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? 'Bật tiếng khán giả' : 'Tắt tiếng khán giả'} title={muted ? 'Bật tiếng khán giả' : 'Tắt tiếng khán giả'}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button><span className={`pk-speed${goalSweepSpeed(streak) >= SWEEP_MAX ? ' is-max' : streak > 0 ? ' is-up' : ''}`} title="Vạch ngắm lắc nhanh dần theo chuỗi bàn">Tốc độ <b>×{sweepMultiplier(streak).toLocaleString('vi-VN')}</b></span><span>Bàn thắng <b>{streak}</b></span><span><Trophy size={14} aria-hidden="true"/>Kỷ lục <b>{best}</b></span></div>
    </header>
    <div className={`pk-stage${shake ? ` is-shake-${shake % 2}` : ''}`} ref={stage} tabIndex={0} aria-label="Sân sút phạt: ↑ ↓ chỉnh độ cao, 1–4 chọn kiểu sút, Space để sút">
      <SharedDefs/>
      <div className={`pk-camera is-${camera}`}>
      <Pitch/>
      <Atmosphere/>
      {burst && <div key={`ripple-${burst.id}`} className="pk-ripple" style={{ left: `${burst.left}%`, top: `${burst.top}%` }} aria-hidden="true"><b className="pk-bulge"/><i/><i/><i/></div>}
      <svg className="pk-aim-line" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
        {aiming && <line ref={line} x1={BALL_SPOT.left * 1.6} y1={BALL_SPOT.top - 3} x2="80" y2="40" stroke="#ffd76a" strokeWidth=".7" strokeDasharray="2 1.6" strokeLinecap="round"/>}
      </svg>
      {diving
        ? <div className="pk-keeper is-diving" style={{ left: `${keeperAt.left}%`, bottom: `${keeperAt.bottom - 2}%`, transform: `translateX(-50%) scaleX(${keeper.x < 0 ? -1 : 1}) rotate(${-keeper.y * 22}deg)` }}><KeeperDive/></div>
        : <div className="pk-keeper" style={{ left: `${keeperAt.left}%`, bottom: `${keeperAt.bottom}%` }}><KeeperReady/></div>}
      <div className={`pk-marker${aiming ? '' : ' is-hidden'}`} ref={marker} aria-hidden="true"><i/></div>
      <div className="pk-ball-shadow" ref={shadow} aria-hidden="true"/>
      {Array.from({ length: GHOSTS }, (_, i) => <div key={i} className={`pk-ghost is-${flying ?? 'normal'}`} ref={el => { ghosts.current[i] = el; }} aria-hidden="true"/>)}
      <div className={`pk-ball${flying ? ` is-flying is-${flying}` : ''}${rolling ? ' is-rolling' : ''}`} ref={ball}><span><Ball/></span></div>
      <div className={`pk-striker is-${shooter}${kicking ? ' is-kicking' : ''}${pose ? ` is-${pose}` : ''}`} aria-hidden="true"><div className="pk-striker-body">{shooter === 'ronaldo' ? <><StrikerRonaldo/><div className="pk-front"><StrikerRonaldoFront/></div></> : <Striker/>}</div></div>
      </div>
      <div className="pk-vignette" aria-hidden="true"/>
      <div className="pk-height" aria-hidden="true"><span style={{ bottom: `${height * 100}%` }}/></div>
      {burst && <div key={`confetti-${burst.id}`} className="pk-confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: c.color, width: c.size, height: c.size * .45, ['--drift' as string]: `${c.drift}px`, ['--spin' as string]: `${c.spin}deg` }}/>)}</div>}
      {message && <div className={`pk-flash is-${message.kind === 'goal' ? 'goal' : 'saved'}`} role="status">{message.text}{message.kind === 'goal' && <small>+1 điểm</small>}</div>}
      {message?.kind === 'goal' && <><div className="pk-glare" aria-hidden="true"/><div className="pk-flare" aria-hidden="true"><i/><i/><i/></div></>}
      {(phase === 'idle' || phase === 'starting' || phase === 'over') && <div className="pk-overlay">
        {phase === 'over'
          ? <><h2>Hết lượt</h2><p>Bạn ghi được <b>{streak}</b> bàn liên tiếp.{streak > 0 && streak >= best ? ' Kỷ lục mới!' : ` Kỷ lục: ${best} bàn.`}</p></>
          : <><h2>Penalty</h2><p>Canh vạch ngắm đang lắc, chỉnh độ cao bằng ↑ ↓, chọn kiểu sút rồi bấm <b>SÚT</b>. Mỗi bàn +1 điểm; bị bắt, vọt xà hay dội cột là hết lượt. Sút càng sát góc càng khó bắt.</p></>}
        <div className="pk-shooters" role="radiogroup" aria-label="Chọn cầu thủ sút">
          {SHOOTERS.map(s => <button key={s.id} type="button" role="radio" aria-checked={shooter === s.id} className={`pk-shooter is-${s.id}`} onClick={() => pickShooter(s.id)} disabled={phase === 'starting'}>
            <span className="pk-shooter-art" aria-hidden="true">{s.id === 'ronaldo' ? <StrikerRonaldo/> : <Striker/>}</span>
            <b>{s.name}</b><small>{s.foot}</small>
          </button>)}
        </div>
        {!online && <p className="pk-error">Hãy đăng nhập để chơi và lưu điểm lên BXH.</p>}
        <button type="button" className="primary-button" onClick={() => void start()} disabled={!online || phase === 'starting'}>{phase === 'over' ? <><RotateCcw size={16}/>Chơi lại</> : phase === 'starting' ? 'Đang vào sân…' : 'Bắt đầu'}</button>
      </div>}
    </div>
    {error && <p className="pk-error" role="alert">{error}</p>}
    <div className="pk-controls">
      <div className="pk-height-buttons">
        <button type="button" onClick={() => nudge(HEIGHT_STEP)} aria-label="Nâng bóng cao hơn"><ChevronUp/></button>
        <span>Độ cao <b>{Math.round(height * 100)}%</b></span>
        <button type="button" onClick={() => nudge(-HEIGHT_STEP)} aria-label="Hạ bóng thấp hơn"><ChevronDown/></button>
      </div>
      <div className="pk-kinds" role="radiogroup" aria-label="Kiểu sút">
        {SHOT_KINDS.map(k => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`pk-kind is-${k.id}`} onClick={() => choose(k.id)} disabled={phase === 'shooting' || phase === 'result'} title={k.hint}>
          <kbd>{k.key}</kbd>{k.name}
        </button>)}
        <small className="pk-kind-hint">{current.hint}</small>
      </div>
      <button type="button" className="pk-shoot" onClick={() => void shoot()} disabled={phase !== 'aiming'}>SÚT</button>
    </div>
  </section>;
}
