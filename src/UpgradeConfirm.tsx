import FlameJet from "./FlameJet";
import { UPGRADE_STAND } from "./UpgradeStand";
import { useEffect, useRef, useState } from "react";
import UpgradeMusic from "./UpgradeMusic";
import { fitScale } from "./device";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUp,
  CirclePlus,
  RefreshCcw,
  ShieldPlus,
  SkipForward,
  Smile,
} from "lucide-react";
import { getPlayer, money, ovr } from "./game";
import { marketQuote } from "./market";
import type { Card, Tier } from "./game";
import { asset } from "./asset";
import "./upgrade-confirm.css";

type UpgradeOutcome = {
  success: boolean;
  card: Card;
  before: number;
  restored?: boolean;
};
type Props = {
  target: Card;
  materials: Card[];
  energy: number;
  protection: { pct: number; cost: number | null } | null;
  // Khôi phục khi thất bại: chance% cơ hội, giữ tối thiểu +floor; null nếu thẻ dưới +5.
  restore: { chance: number; floor: number } | null;
  reduced: boolean;
  renderCard: (card: Card, compact?: boolean) => ReactNode;
  seasonShort: (tier: Tier) => string;
  levelBadge: (level: number) => string;
  onBack: () => void;
  // Đập thật; trả về kết quả để màn này tự hiện thẻ lên / rớt, hoặc null nếu lỗi.
  // Có thể trả Promise khi máy chủ đập thẻ (src/inventory-server.ts): chờ kết quả rồi mới dồn năng lượng.
  onConfirm: () => UpgradeOutcome | null | Promise<UpgradeOutcome | null>;
  onReveal?: (success: boolean) => void;
  onMusicActiveChange: (active: boolean) => void;
};

// Bục LED: lưới tam giác 3 dải. Mỗi chu kỳ: tối → dải giữa sáng từ hai đầu vào tâm (hai dải bên ửng hồng theo)
// → từ tâm lan ra phủ kín cả 3 dải → sáng toàn bục → tắt. Cập nhật thẳng thuộc tính DOM mỗi khung hình, không render lại React.
const LED_COLS = 32,
  LED_W = 20,
  LED_H = 17.32,
  LED_CYCLE = 5430;
// Đổi thời gian thực của chu kỳ sang pha LED: dải giữa chạy đều; pha lan ra hai đầu chậm dần (ease-out);
// sau đó giữ sáng toàn bục rồi tắt mờ dần (pha ≥ .9 tắt, CSS kéo dài chuyển màu lúc tắt).
const easeOut = (x: number) => 1 - (1 - x) ** 3;
// Mốc theo mili giây trong chu kỳ: dải giữa 2320 · lan ra 2204 · giữ sáng 500 · tắt mờ 406.
const LED_MARKS = [2320, 4524, 5024].map((ms) => ms / LED_CYCLE);
// Ánh kim loại trên tấm LED lớn: sáng từ lúc LED đầy (4524 ms) tới 1500 ms của chu kỳ sau ≈ 2,4 s.
const SHEEN_HOLD = 1500 / LED_CYCLE;
const ledPhase = (raw: number) => {
  const [line, spread, hold] = LED_MARKS;
  return raw < line
    ? (raw / line) * 0.5
    : raw < spread
      ? 0.5 + 0.3 * easeOut((raw - line) / (spread - line))
      : raw < hold
        ? 0.85
        : 0.95;
};
const LED_VB_W = LED_COLS * LED_W + LED_W / 2,
  LED_VB_H = LED_H * 3;
const LED_TRIS = Array.from({ length: 3 }, (_, row) =>
  Array.from({ length: LED_COLS * 2 }, (_, k) => {
    const x = (k * LED_W) / 2,
      top = row * LED_H,
      bottom = top + LED_H,
      up = (k + row) % 2 === 0;
    const pts = up
      ? [x, bottom, x + LED_W, bottom, x + LED_W / 2, top]
      : [x, top, x + LED_W, top, x + LED_W / 2, bottom];
    const u = (x + LED_W / 2) / LED_VB_W,
      fromEnd = Math.min(u, 1 - u) * 2;
    return { row, pts, fromEnd, fromCenter: 1 - fromEnd };
  }),
).flat();
const ledLevel = (tri: (typeof LED_TRIS)[number], t: number) => {
  if (t >= 0.9) return 0;
  const line = 0.1 + 0.38 * tri.fromEnd;
  if (tri.row === 1) return t >= line ? 2 : 0;
  if (t >= 0.5 + 0.3 * tri.fromCenter) return 2;
  return t >= line + 0.04 ? 1 : 0;
};

// Lúc dồn năng lượng (người dùng 2026-11-17): cả 3 bục sáng toàn bộ ngay khi nhấn, các dải tối hình mũi tên (dải giữa nhô trước)
// chạy liền một mạch từ đầu ngoài 2 bục nhỏ, qua bục lớn, vào tâm — hai hướng gặp nhau ở giữa. data-l: 2 sáng, 3 dải tối.
// Vị trí tính chung một trục d = khoảng cách tới tâm bục lớn theo nửa bề rộng bục lớn: bục lớn 0–1, bục nhỏ 1 → 1 + SIDE_SPAN
// (bục nhỏ rộng ≈ 0,45 bục lớn, src/upgrade-confirm.css .uc-side-led) nên khoảng cách mũi tên trên màn hình đều nhau.
// Nhấn đập: cả 3 bục sáng đứng yên CHARGE_HOLD ms rồi mũi tên mới bắt đầu, đầu đoàn mũi tên đi vào từ mép ngoài bục nhỏ.
const CHARGE_BANDS = 3,
  CHARGE_SPEED = 1,
  SIDE_SPAN = 0.9,
  CHARGE_HOLD = 500,
  CHARGE_DMAX = 1 + SIDE_SPAN;
type LedSide = "left" | "right";
const ledDist = (tri: (typeof LED_TRIS)[number], side?: LedSide) => {
  if (!side) return tri.fromCenter;
  const u = (tri.pts[0] + LED_W / 2) / LED_VB_W;
  return 1 + (side === "left" ? 1 - u : u) * SIDE_SPAN;
};
const chargeLevel = (d: number, row: number, ms: number) => {
  const run = ((ms - CHARGE_HOLD) / 1000) * CHARGE_SPEED,
    lead = row === 1 ? 0.045 : 0;
  if (run <= 0 || d + lead < CHARGE_DMAX - run) return 2; // chưa tới giờ / đầu đoàn mũi tên chưa tới ô này
  const band =
    ((CHARGE_DMAX - d - lead) * CHARGE_BANDS - run * CHARGE_BANDS) % 1;
  return (band + 1) % 1 < 0.26 ? 3 : 2;
};

// Bục vẽ bằng canvas: mỗi khung hình chỉ vẽ lại 192 tam giác trên canvas (không vẽ lại DOM/SVG → không raster lại cả sân khấu).
// Màu lấy từ biến CSS theo mức thẻ; data-full/fading/charging và --glow vẫn đặt trên host cho thanh ray và quầng sáng.
// side: dải LED phụ bên trái / phải (chỉ chạy đèn, không điều khiển lưới / bảng LED lớn; mũi tên nối tiếp bục lớn).
function LedPodium({
  reduced,
  charging,
  off = false,
  full = false,
  side,
}: {
  reduced: boolean;
  charging: boolean;
  off?: boolean;
  full?: boolean;
  side?: LedSide;
}) {
  const mini = !!side;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = wrap.current,
      cv = canvas.current,
      ctx = cv?.getContext("2d");
    if (!host || !cv || !ctx) return;
    const css = getComputedStyle(host),
      v = (name: string) => css.getPropertyValue(name).trim();
    const palette = [
      ["#8b8592", "#16131a"],
      [v("--mid"), v("--mid-stroke")],
      [v("--lit"), v("--lit-stroke")],
      ["#3d3942", "#1a1720"],
    ];
    const chargeLit = [v("--charge"), v("--charge-stroke")];
    const prev = new Int8Array(LED_TRIS.length).fill(-1);
    let prevMeta = "";
    // Kích thước canvas lấy từ ResizeObserver (đọc clientWidth mỗi khung hình sẽ ép tính lại layout).
    const size = { w: cv.clientWidth, h: cv.clientHeight };
    // levels: mức từng ô; litAlpha < 1 khi đang tắt mờ: vẽ nền tắt rồi phủ màu sáng với độ trong suốt giảm dần.
    // Chỉ vẽ lại khi có ô đổi mức hoặc đổi màu/độ mờ/kích thước.
    const draw = (
      levels: ArrayLike<number>,
      chargeColors: boolean,
      litAlpha = 1,
      force = false,
    ) => {
      const scale = (window.devicePixelRatio || 1) * 1.5 * fitScale(),
        w = Math.round(size.w * scale),
        h = Math.round(size.h * scale);
      const meta = `${chargeColors}|${litAlpha.toFixed(2)}|${w}x${h}`;
      let changed = force || meta !== prevMeta;
      for (let i = 0; i < levels.length; i++)
        if (prev[i] !== levels[i]) {
          prev[i] = levels[i];
          changed = true;
        }
      if (!changed) return;
      prevMeta = meta;
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      ctx.setTransform(w / LED_VB_W, 0, 0, h / LED_VB_H, 0, 0);
      ctx.clearRect(0, 0, LED_VB_W, LED_VB_H);
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "round";
      const pass = (
        colors: string[],
        alpha: number,
        pick: (l: number) => boolean,
      ) => {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < levels.length; i++) {
          if (!pick(levels[i])) continue;
          any = true;
          const p = LED_TRIS[i].pts;
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(p[2], p[3]);
          ctx.lineTo(p[4], p[5]);
          ctx.closePath();
        }
        if (!any) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colors[0];
        ctx.fill();
        ctx.strokeStyle = colors[1];
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      if (litAlpha < 1) {
        pass(palette[0], 1, () => true);
        pass(chargeColors ? chargeLit : palette[2], litAlpha, (l) => l === 2);
        return;
      }
      for (const level of [0, 1, 2, 3])
        pass(
          level === 2 && chargeColors ? chargeLit : palette[level],
          1,
          (l) => l === level,
        );
    };
    let redraw = () => {};
    const observer = new ResizeObserver(([entry]) => {
      size.w = entry.contentRect.width;
      size.h = entry.contentRect.height;
      redraw();
    });
    observer.observe(cv);
    const n = LED_TRIS.length;
    // Tấm lưới sau thẻ (.uc-cage): các thanh dọc sáng theo LED lan từ tâm ra ngoài. --cage-spread 0–1 = bán kính đã sáng
    // (theo khoảng cách thanh tới giữa), --cage-alpha = độ sáng chung (tắt mờ cùng LED). Đặt trên .uc-zoom, CSS tự tính từng thanh.
    const zoom = mini ? null : host.closest<HTMLElement>(".uc-zoom");
    // Đặt biến thẳng lên lưới + mũi tên (không đặt trên .uc-zoom: đổi biến ở phần tử cha bắt trình duyệt tính lại style cả cây con mỗi khung hình)
    // và chỉ ghi khi giá trị đổi (người dùng 2026-11-17: màn đập thẻ chưa mượt).
    const cageTargets = zoom ? Array.from(zoom.querySelectorAll<HTMLElement>(".uc-cage, .uc-chevrons")) : [];
    let lastCage = "";
    const setCage = (spread: number, alpha: number) => {
      const s = spread.toFixed(2), a = alpha.toFixed(2), key = s + "|" + a;
      if (key === lastCage) return;
      lastCage = key;
      for (const el of cageTargets) {
        el.style.setProperty("--cage-spread", s);
        el.style.setProperty("--cage-alpha", a);
      }
    };
    // Tấm LED lớn phía sau ánh kim loại (CSS .uc-zoom[data-led-full] .uc-wall-sheen): bật khi LED nhỏ sáng đầy, lúc chờ giữ sáng
    // qua pha tắt sang đầu chu kỳ sau (SHEEN_HOLD) để kịp sáng hẳn và quét vệt sáng (người dùng 2026-11-17: kéo dài ánh kim loại).
    const setSheen = (on: boolean) => {
      if (zoom && zoom.dataset.ledFull !== String(on))
        zoom.dataset.ledFull = String(on);
    };
    const setHost = (
      glow: number,
      isFull: boolean,
      isCharging: boolean,
      fading: boolean,
    ) => {
      const g = glow.toFixed(2);
      if (host.style.getPropertyValue("--glow") !== g) host.style.setProperty("--glow", g);
      if (host.dataset.full !== String(isFull)) host.dataset.full = String(isFull);
      if (host.dataset.charging !== String(isCharging)) host.dataset.charging = String(isCharging);
      if (host.dataset.fading !== String(fading)) host.dataset.fading = String(fading);
    };
    let frame = 0;
    // Thẻ rớt: bục tắt hẳn.
    if (off) {
      const levels = new Array(n).fill(0);
      redraw = () => draw(levels, false, 1, true);
      redraw();
      setHost(0, false, false, false);
      setCage(0, 0);
      setSheen(false);
    }
    // Thẻ lên: bục sáng kín màu đào, đứng yên.
    else if (full) {
      const levels = new Array(n).fill(2);
      redraw = () => draw(levels, true, 1, true);
      redraw();
      setHost(1, true, true, false);
      setCage(1, 1);
      setSheen(true);
    } else if (charging) {
      setHost(1, true, true, false);
      setCage(1, 1);
      setSheen(true);
      const levels = new Int8Array(n),
        dist = LED_TRIS.map((tri) => ledDist(tri, side));
      const fill = (ms: number) => {
        for (let i = 0; i < n; i++)
          levels[i] = reduced ? 2 : chargeLevel(dist[i], LED_TRIS[i].row, ms);
      };
      redraw = () => draw(levels, true, 1, true);
      if (reduced) {
        fill(0);
        redraw();
      } else {
        const start = performance.now();
        const tick = (now: number) => {
          fill(now - start);
          draw(levels, true);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }
    } else {
      const levels = new Int8Array(n);
      let alpha = 1;
      // Đặt mức các ô theo pha t, trả về tổng mức (để tính độ sáng quầng).
      const fill = (t: number) => {
        let lit = 0;
        for (let i = 0; i < n; i++) {
          const l = ledLevel(LED_TRIS[i], t);
          levels[i] = l;
          lit += l;
        }
        return lit;
      };
      const paint = (raw: number) => {
        const t = ledPhase(raw);
        setSheen(raw >= LED_MARKS[1] || raw < SHEEN_HOLD);
        if (t >= 0.9) {
          // Pha tắt: mờ dần từ toàn bục sáng về tắt trong phần còn lại của chu kỳ.
          const k = Math.min(1, (raw - LED_MARKS[2]) / (1 - LED_MARKS[2]));
          alpha = 1 - easeOut(k);
          levels.fill(2);
          draw(levels, false, alpha);
          setHost(alpha, false, false, true);
          setCage(1, alpha);
          return;
        }
        alpha = 1;
        const lit = fill(t);
        draw(levels, false);
        setHost(lit / (n * 2), t >= 0.8, false, false);
        // Cùng nhịp lan ra của hai dải ngoài: tâm sáng ở pha .5, mép ở pha .8.
        setCage(t < 0.5 ? 0 : Math.min(1, (t - 0.5) / 0.3), 1);
      };
      redraw = () => draw(levels, false, alpha, true);
      if (reduced) {
        const lit = fill(0.6);
        draw(levels, false);
        setHost(lit / (n * 2), false, false, false);
        setCage(1, 0.6);
      } else {
        const start = performance.now();
        const tick = (now: number) => {
          paint(((now - start) % LED_CYCLE) / LED_CYCLE);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced, charging, off, full, side]);
  return (
    <div className="uc-led" ref={wrap}>
      <i className="uc-rail" />
      <canvas ref={canvas} aria-hidden="true" />
      <i className="uc-rail" />
    </div>
  );
}
// Tấm lưới thẻ được gắn lên (người dùng 2026-11-17): rộng bằng bục LED, dựng sau dải LED, trong suốt (nhìn xuyên qua);
// khung kim loại vát góc trên, lưới chéo mờ và 11 thanh dọc; --k = khoảng cách
// thanh tới giữa (0 giữa → 1 mép) để sáng dần từ trong ra ngoài theo LED (--cage-spread do LedPodium đặt).
// Bục tam giác bậc thang trước dải LED (người dùng 2026-11-17: 3D, tách khỏi LED): 3 khối lăng trụ tam giác chồng nhau, mép sau
// thẳng hàng, mũi hướng ra người xem. Chiếu phối cảnh (camera cao, nhìn chếch xuống): mỗi khối vẽ 2 mặt bên dày + mặt trên.
type P3 = [number, number, number];
// Bậc mỏng, thụt vào ít (người dùng: 'mỏng như này thôi'): 3 tấm dày 0,09, mỗi tấm nhỏ hơn tấm dưới một chút.
const PLINTH_TIERS = [
  { w: 10, d: 4.4, y0: 0, y1: 0.09 },
  { w: 9.45, d: 4.12, y0: 0.09, y1: 0.18 },
  { w: 8.9, d: 3.84, y0: 0.18, y1: 0.27 },
];
const plinthShapes = (() => {
  const camH = 4,
    camZ = 13; // camera cao 4, cách mép sau 13: thấy rõ mặt trên rộng, cạnh bậc mỏng (mũi bục ở z = d, gần camera hơn)
  const proj = ([x, y, z]: P3): [number, number] => {
    const dist = camZ - z;
    return [x / dist, (camH - y) / dist];
  };
  const faces: {
    pts: [number, number][];
    kind: "left" | "right" | "top" | "edge";
  }[] = [];
  for (const t of PLINTH_TIERS) {
    const bl = (y: number): P3 => [-t.w / 2, y, 0],
      br = (y: number): P3 => [t.w / 2, y, 0],
      ap = (y: number): P3 => [0, y, t.d];
    faces.push({
      kind: "left",
      pts: [bl(t.y0), ap(t.y0), ap(t.y1), bl(t.y1)].map(proj),
    });
    faces.push({
      kind: "right",
      pts: [ap(t.y0), br(t.y0), br(t.y1), ap(t.y1)].map(proj),
    });
    faces.push({ kind: "top", pts: [bl(t.y1), br(t.y1), ap(t.y1)].map(proj) });
    faces.push({ kind: "edge", pts: [bl(t.y1), br(t.y1)].map(proj) });
  }
  const all = faces.flatMap((f) => f.pts),
    minX = Math.min(...all.map((q) => q[0])),
    maxX = Math.max(...all.map((q) => q[0]));
  const minY = Math.min(...all.map((q) => q[1])),
    maxY = Math.max(...all.map((q) => q[1])),
    k = 1000 / (maxX - minX);
  return {
    h: Math.round((maxY - minY) * k),
    faces: faces.map((f) => ({
      kind: f.kind,
      d: f.pts
        .map(
          ([x, y]) =>
            `${((x - minX) * k).toFixed(1)},${((y - minY) * k).toFixed(1)}`,
        )
        .join(" "),
    })),
  };
})();
const PLINTH_TOP_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 ${plinthShapes.h}' preserveAspectRatio='none'>${plinthShapes.faces
    .filter((f) => f.kind === "top")
    .map((f) => `<polygon points='${f.d}' fill='#fff'/>`)
    .join("")}</svg>`,
)}")`;
const PLINTH_SHINE = (
  <div
    className="uc-plinth-shines"
    aria-hidden="true"
    style={{ aspectRatio: `1000 / ${plinthShapes.h}`, WebkitMaskImage: PLINTH_TOP_MASK, maskImage: PLINTH_TOP_MASK } as CSSProperties}
  >
    <i />
  </div>
);
const PLINTH = (
  <svg
    className="uc-plinth"
    viewBox={`0 0 1000 ${plinthShapes.h}`}
    style={{ aspectRatio: `1000 / ${plinthShapes.h}` }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="ucp-top" x1="0" y1="0" x2=".3" y2="1">
        <stop offset="0" stopColor="#2a3440" />
        <stop offset=".5" stopColor="#161c23" />
        <stop offset="1" stopColor="#0c1014" />
      </linearGradient>
      <linearGradient id="ucp-left" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3a4654" />
        <stop offset="1" stopColor="#1a2129" />
      </linearGradient>
      <linearGradient id="ucp-right" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#252d36" />
        <stop offset="1" stopColor="#0b0e12" />
      </linearGradient>
      <linearGradient id="ucp-edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8fb07a" stopOpacity="0" />
        <stop offset=".3" stopColor="#9cc086" />
        <stop offset=".7" stopColor="#9cc086" />
        <stop offset="1" stopColor="#8fb07a" stopOpacity="0" />
      </linearGradient>
    </defs>
    {plinthShapes.faces.map((f, i) =>
      f.kind === "edge" ? (
        <polyline
          key={i}
          className="uc-plinth-edge"
          points={f.d}
          fill="none"
          stroke="url(#ucp-edge)"
          strokeWidth="2.5"
        />
      ) : (
        <g key={i}>
          <polygon
            points={f.d}
            fill={`url(#ucp-${f.kind})`}
            stroke={f.kind === "top" ? "#5f7286" : "#202830"}
            strokeWidth={f.kind === "top" ? 1.5 : 1}
            strokeLinejoin="round"
          />
          {/* Ánh màu sơ sơ theo bảng LED (màu mức thẻ, --sheen-*): phủ mỏng lên mặt trên và mặt bên. */}
          <polygon className={`uc-plinth-tint is-${f.kind}`} points={f.d} />
        </g>
      ),
    )}
  </svg>
);
const CAGE_BARS = 11;
const CAGE = (
  <div className="uc-cage" aria-hidden="true">
    <i className="uc-cage-mesh" />
    <svg
      className="uc-cage-frame"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <polygon points="0,16 44,0 56,0 100,16 100,100 0,100" />
    </svg>
    {Array.from({ length: CAGE_BARS }, (_, i) => {
      const u = (i + 0.5) / CAGE_BARS;
      return (
        <b
          key={i}
          style={
            {
              left: `${(u * 100).toFixed(2)}%`,
              "--k": (Math.abs(u - 0.5) * 2).toFixed(3),
            } as CSSProperties
          }
        />
      );
    })}
  </div>
);
// Màn xác nhận trước khi đập: thẻ chính đứng trên bục LED chạy nhịp, các phôi lắc qua lại; bấm "Nâng cấp" mới bắt đầu.
const winPrice = (card: Card) => {
  const price = marketQuote(card).price;
  return price === null
    ? "Chưa có giá"
    : `${new Intl.NumberFormat("en-US").format(price)} BP`;
};
// Thanh thông báo kết quả ở đáy màn hình (theo FC Online): cấp thẻ, chỉ số và mức thay đổi, giá, nút Tiếp.
// Đặc điểm / Huấn luyện / Kỹ thuật chưa có trong game nên hiện giá trị cố định, không đổi khi nâng cấp.
function ResultBar({
  before,
  after,
  success,
  restored,
  pending,
  levelBadge,
  onNext,
}: {
  before: Card;
  after: Card;
  success: boolean;
  restored?: boolean;
  pending: boolean;
  levelBadge: (level: number) => string;
  onNext: () => void;
}) {
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending) next.current?.focus();
  }, [pending]);
  const delta = (n: number) => (
    <em className={n > 0 ? "up" : n < 0 ? "down" : ""}>
      {n > 0 ? `+${n}` : n}
    </em>
  );
  const price = marketQuote(after).price;
  return (
    <div
      className={`uc-result ${success ? "is-up" : "is-down"}${pending ? " is-pre" : ""}`}
      role={pending ? undefined : "status"}
      aria-hidden={pending || undefined}
    >
      <h3>
        {success
          ? "Nâng cấp thành công"
          : restored
            ? "Nâng cấp thất bại · Đã khôi phục cấp thẻ"
            : "Nâng cấp thất bại"}
      </h3>
      <div className="uc-result-row">
        <dl>
          <div>
            <dt>Cấp thẻ</dt>
            <dd>
              <img src={levelBadge(after.level)} alt={`+${after.level}`} />
              {delta(after.level - before.level)}
            </dd>
          </div>
          <div>
            <dt>C.Số</dt>
            <dd>
              <b>{ovr(after)}</b>
              {delta(ovr(after) - ovr(before))}
            </dd>
          </div>
          <div>
            <dt>Đặc điểm</dt>
            <dd>
              <b>0</b>
              <em>+0</em>
            </dd>
          </div>
          <div>
            <dt>Huấn luyện</dt>
            <dd>
              <b>5</b>
              <em>+0</em>
            </dd>
          </div>
          <div>
            <dt>Kỹ thuật</dt>
            <dd className="uc-stars" aria-label="4 trên 6 sao">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} className={i >= 2 ? "on" : ""}>
                  ★
                </i>
              ))}
            </dd>
          </div>
          {success ? (
            <div>
              <dt>Độ hài lòng</dt>
              <dd className="uc-mood" aria-label="Hài lòng tăng">
                <Smile size={22} />
                <ArrowUp size={12} />
              </dd>
            </div>
          ) : (
            <div>
              <dt>
                <RefreshCcw size={13} />
                Thẻ nâng cấp lại
              </dt>
              <dd>
                <button className="uc-retry" disabled>
                  Dùng
                </button>
              </dd>
            </div>
          )}
        </dl>
        <div className="uc-result-price">
          <span>Giá</span>
          <b>{price === null ? "Chưa có giá" : money(price)}</b>
        </div>
        <button
          ref={next}
          className="uc-next"
          onClick={onNext}
          tabIndex={pending ? -1 : undefined}
        >
          Tiếp
        </button>
      </div>
    </div>
  );
}

// Nhóm màu khung cấp thẻ (khớp màu huy hiệu lv-N): LED lấy theo cấp mục tiêu.
// Thẻ rớt (người dùng 2026-11-17: thêm hiệu ứng cho đẹp): vết nứt toả từ điểm va (vẽ nét dần), tia lửa điện văng từ bục LED rơi theo
// trọng lực, tàn tro trôi xuống. Toạ độ vết nứt theo viewBox 0 0 100 140 của thẻ.
const FAIL_CRACKS = [
  "M58 52 L50 40 L46 26 L40 14 L37 4", "M58 52 L70 44 L80 46 L92 38 L99 36", "M58 52 L62 66 L56 80 L60 96 L54 112 L57 128",
  "M58 52 L44 58 L32 56 L20 64 L6 62", "M50 40 L42 42 L34 36", "M62 66 L72 74 L78 90 L88 98", "M56 80 L46 86 L40 100", "M70 44 L74 32 L84 24",
];
const FAIL_SPARKS = Array.from({ length: 64 }, (_, i) => {
  const src = [30, 40, 50, 60, 70][i % 5], dir = src < 50 ? -1 : src > 50 ? 1 : i % 2 ? 1 : -1;
  return {
    "--x": `${src + ((i * 7) % 5) - 2}%`, "--dx": `${dir * (30 + ((i * 37) % 120))}px`, "--up": `${-(30 + ((i * 53) % 110))}px`,
    "--fall": `${90 + ((i * 29) % 140)}px`, "--d": `${((i * 0.071) % 1.2).toFixed(2)}s`, "--t": `${(0.7 + ((i * 13) % 6) / 10).toFixed(1)}s`,
    "--c": i % 3 ? "#ffb347" : "#ff5a36",
  } as CSSProperties;
});
const FAIL_ASH = Array.from({ length: 22 }, (_, i) => ({
  "--x": `${(i * 41) % 100}%`, "--s": `${3 + ((i * 7) % 5)}px`, "--sway": `${((i % 2 ? 1 : -1) * (12 + ((i * 17) % 30)))}px`,
  "--d": `${(0.4 + ((i * 0.37) % 3)).toFixed(2)}s`, "--t": `${(4.5 + ((i * 11) % 30) / 10).toFixed(1)}s`,
}) as CSSProperties);
const levelTier = (level: number) =>
  level >= 11
    ? "platinum"
    : level >= 8
      ? "gold"
      : level >= 5
        ? "silver"
        : "bronze";
// Thời gian pha dồn năng lượng sau khi bấm "Nâng cấp", trước khi thực sự đập (khớp với CSS uc-charge-*).
const CHARGE_MS = 5600;
// Tia năng lượng: số tia mỗi giây mỗi bên và thời gian bay một tia (ms), từ lúc bắt đầu dồn → lúc sắp đập.
// Người dùng 2026-11-17: tia dồn nhanh và nhiều hơn, dồn dày hẳn ở cuối (t ** 1.8); từ 50 % thời gian dồn có thêm tia nhiều màu (RAY_COLORS, tỉ lệ tăng dần tới cuối).
const RAY_RATE = [16, 420],
  RAY_MS = [640, 190];
const RAY_COLORS = ["#ff3df2", "#3df5ff", "#ffe03d", "#5dff7a", "#ff6b3d", "#8f6bff", "#ff3d6e"];
// Tính kết quả + dựng sẵn hiệu ứng kết quả (ẩn, hoạt cảnh tạm dừng) trước lúc lộ một khoảng, khi thẻ đã gần trắng hẳn:
// khung hình lộ kết quả chỉ còn bật hiện, không phải chạy logic/lưu dữ liệu/dựng DOM/vẽ lớp mới cùng lúc (gây khựng).
const PREPARE_LEAD = 600;
// Lộ kết quả gây giật mình (người dùng 2026-11-17): cú chớp sáng + giật khung hình (.uc-flash, uc-punch-*); tia năng lượng dồn tới tận lúc lộ.
// Hoạt cảnh CSS có keyframe dùng biến (var(--a), var(--h)…) không chạy được trên GPU: Chrome tính lại style của từng phần tử mỗi
// khung hình (đo 2026-11-17: tia pháo sáng 144 phần tử ≈ 4/5 thời gian tính style lúc hiện kết quả). Chuyển sang Web Animations với
// keyframe đã thay giá trị (getKeyframes trả giá trị cụ thể) → chạy trên GPU, hình ảnh như cũ.
const VAR_ANIMATIONS = new Set(["uc-spark", "uc-ray", "uc-machine-smoke", "uc-fail-ash", "uc-smoke", "uc-smoke-rise"]);
// Phần tử còn trong .is-pre (kết quả dựng sẵn, chưa lộ) → bản Web Animations tạo sẵn ở trạng thái dừng, trả về để lộ ra thì play().
function compositeVarAnimations(root: HTMLElement): Animation[] {
  const held: Animation[] = [];
  const byEl = new Map<HTMLElement, CSSAnimation[]>();
  for (const anim of root.getAnimations({ subtree: true })) {
    if (!(anim instanceof CSSAnimation)) continue;
    const effect = anim.effect as KeyframeEffect | null, el = effect?.target;
    if (!effect || effect.pseudoElement || !(el instanceof HTMLElement)) continue;
    const list = byEl.get(el) ?? [];
    list.push(anim);
    byEl.set(el, list);
  }
  for (const [el, anims] of byEl) {
    if (!anims.some((a) => VAR_ANIMATIONS.has(a.animationName))) continue;
    const copies = anims.map((a) => {
      const effect = a.effect as KeyframeEffect, timing = effect.getTiming();
      return {
        frames: effect.getKeyframes().map(({ computedOffset: _c, ...k }) => k as Keyframe),
        timing: { ...timing, iterations: timing.iterations ?? Infinity } as KeyframeEffectOptions,
        at: a.currentTime,
      };
    });
    const pre = !!el.closest(".is-pre");
    el.style.animation = "none";
    for (const c of copies) {
      const wa = el.animate(c.frames, c.timing);
      if (typeof c.at === "number") wa.currentTime = c.at;
      if (pre) {
        wa.pause();
        held.push(wa);
      }
    }
  }
  return held;
}

export default function UpgradeConfirm({
  target,
  materials,
  energy,
  protection,
  restore,
  reduced,
  renderCard,
  seasonShort,
  levelBadge,
  onBack,
  onConfirm,
  onReveal,
  onMusicActiveChange,
}: Props) {
  const p = getPlayer(target);
  const goButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    goButton.current?.focus({ preventScroll: true });
  }, []);
  const [charging, setCharging] = useState(false);
  const [prepared, setPrepared] = useState<UpgradeOutcome | null>(null);
  // Kết quả tính + lưu ngay lúc bấm (JSON.stringify + localStorage nặng, làm giữa pha rung sẽ khựng); mốc PREPARE_LEAD chỉ còn dựng hiệu ứng.
  const computed = useRef<UpgradeOutcome | null>(null);
  // waiting: đang chờ máy chủ trả kết quả, khoá nút để không gửi hai lần.
  const [waiting, setWaiting] = useState(false);
  const go = async () => {
    if (charging || waiting) return;
    setWaiting(true);
    try {
      const result = await onConfirm();
      if (!result) return;
      computed.current = result;
      setCharging(true);
    } finally {
      setWaiting(false);
    }
  };
  const [revealed, setRevealed] = useState(false);
  const outcome = revealed ? prepared : null;
  const failed = outcome && !outcome.success ? outcome : null,
    won = outcome?.success ? outcome : null;
  // Màu theo mức (data-tier): trước khi đập là mức sắp lên; có kết quả thì theo mức thật (thẻ trong App có thể đã cập nhật lên mức mới,
  // target.level + 1 lúc đó lệch thêm một mức — đập +3 → +4 từng ra màu bạc của +5).
  // Hiệu ứng kết quả dựng sẵn từ lúc có prepared; trước khi lộ thì gắn is-pre (gần như trong suốt, hoạt cảnh dừng).
  const pFailed = prepared && !prepared.success ? prepared : null,
    pWon = prepared?.success ? prepared : null;
  const pre = prepared && !revealed ? " is-pre" : "";
  const screenRef = useRef<HTMLDivElement>(null);
  const heldAnims = useRef<Animation[]>([]);
  // Hiệu ứng dùng biến trong keyframe → Web Animations (chạy trên GPU) ngay khi chúng xuất hiện. Kết quả dựng sẵn (is-pre) đổi từ lúc
  // còn ẩn, để ở trạng thái dừng; lúc lộ ra chỉ cần play() (không làm nặng đúng khung hình hiện kết quả).
  useEffect(() => {
    if (reduced || !screenRef.current) return;
    const el = screenRef.current;
    const frame = requestAnimationFrame(() => { heldAnims.current.push(...compositeVarAnimations(el)); });
    return () => cancelAnimationFrame(frame);
  }, [charging, prepared, reduced]);
  useEffect(() => {
    if (!revealed) return;
    for (const a of heldAnims.current) a.play();
    heldAnims.current = [];
  }, [revealed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (!charging || outcome)) onBack();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack, charging, outcome]);
  // Tải + giải mã sẵn ảnh cấp thẻ có thể ra (rớt về +1 … lên +1) và ảnh khói để lúc hiện kết quả không khựng vì decode ảnh.
  useEffect(() => {
    const urls = [
      ...Array.from({ length: target.level + 1 }, (_, i) => levelBadge(i + 1)),
      ...[1, 2, 3].map((n) => asset(`/assets/uc-smoke-${n}.webp`)),
      asset("/assets/uc-beam.webp"),
    ];
    for (const url of urls) {
      const img = new Image();
      img.src = url;
      void img.decode?.().catch(() => {});
    }
  }, []);
  // Rung thẻ khi dồn năng lượng: lắc ngẫu nhiên mỗi khung hình, biên độ tăng dần từ giây 1,4 (≈1 px) tới cuối pha (≈9 px); có kết quả thì dừng.
  const shake = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  // Tia năng lượng hai bên lúc dồn: tạo liên tục, càng về cuối càng nhiều (RAY_RATE tia/giây mỗi bên) và càng nhanh (RAY_MS).
  const flows = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!charging || outcome || reduced) return;
    const start = performance.now();
    let last = start,
      due = 0,
      frame = 0;
    // Mỗi bên một canvas: tia là ảnh dải màu vẽ sẵn (sprite), mỗi khung hình chỉ xoá + drawImage — không tạo phần tử DOM,
    // không tính lại style / bố cục (trước đây tới ~900 <span> animate cùng lúc, main thread bận ~77% lúc dồn).
    type Ray = { y: number; w: number; h: number; born: number; dur: number; dist: number; sprite: HTMLCanvasElement };
    const sides = flows.current.map((flow) => {
      const cv = flow?.querySelector("canvas") ?? null;
      return { flow, cv, ctx: cv?.getContext("2d") ?? null, rays: [] as Ray[], w: 0, h: 0, scale: 1 };
    });
    const css = flows.current[0] ? getComputedStyle(flows.current[0]) : null;
    const hot = css?.getPropertyValue("--chev-hot").trim() || "#ff8a4c", tip = css?.getPropertyValue("--chev-tip").trim() || "#ffd2b0";
    const makeSprite = (mid: string, end: string, glow: string | null) => {
      const c = document.createElement("canvas"), pad = glow ? 8 : 0;
      c.width = 256; c.height = 8 + pad * 2;
      const g = c.getContext("2d")!, grad = g.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.55, mid); grad.addColorStop(1, end);
      if (glow) { g.shadowColor = glow; g.shadowBlur = 6; }
      g.fillStyle = grad;
      g.fillRect(0, pad, 256, 8);
      return c;
    };
    const baseSprite = makeSprite(hot, tip, null);
    const colorSprites = RAY_COLORS.map((c) => makeSprite(c, "#fff", c));
    // cubic-bezier(.55,0,.9,.6) như hiệu ứng cũ: tìm tham số theo trục x rồi lấy y.
    const ease = (x: number) => {
      const ax = 1 - 3 * 0.9 + 3 * 0.55, bx = 3 * 0.9 - 6 * 0.55, cx = 3 * 0.55;
      const ay = 1 - 3 * 0.6, by = 3 * 0.6;
      let u = x;
      for (let k = 0; k < 6; k++) {
        const fx = ((ax * u + bx) * u + cx) * u - x, dx = (3 * ax * u + 2 * bx) * u + cx;
        if (Math.abs(fx) < 1e-4 || !dx) break;
        u = Math.min(1, Math.max(0, u - fx / dx));
      }
      return ((ay * u + by) * u) * u;
    };
    const measure = () => {
      for (const side of sides) {
        if (!side.flow || !side.cv) continue;
        side.w = side.flow.clientWidth; side.h = side.flow.clientHeight;
        side.scale = Math.min(2, window.devicePixelRatio || 1);
        side.cv.width = Math.max(1, Math.round(side.w * side.scale));
        side.cv.height = Math.max(1, Math.round(side.h * side.scale));
      }
    };
    measure();
    const resize = new ResizeObserver(measure);
    for (const side of sides) if (side.flow) resize.observe(side.flow);
    const spawn = (side: (typeof sides)[number], t: number, now: number) => {
      const width = 70 + Math.random() * (90 + 140 * t);
      const colored = t >= 0.5 && Math.random() < 0.3 + (t - 0.5) * 0.7;
      side.rays.push({
        y: (4 + Math.random() * 92) / 100,
        w: width,
        h: t > 0.65 ? 4 : 3,
        born: now,
        dur: (RAY_MS[0] - (RAY_MS[0] - RAY_MS[1]) * t) * (0.85 + Math.random() * 0.3),
        dist: side.w * 1.05 + width,
        sprite: colored ? colorSprites[Math.floor(Math.random() * colorSprites.length)] : baseSprite,
      });
    };
    const paint = (now: number) => {
      for (const side of sides) {
        const { ctx, rays } = side;
        if (!ctx) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.setTransform(side.scale, 0, 0, side.scale, 0, 0);
        let keep = 0;
        for (let i = 0; i < rays.length; i++) {
          const r = rays[i], k = (now - r.born) / r.dur;
          if (k >= 1) continue;
          rays[keep++] = r;
          if (k < 0) continue;
          const e = ease(k), sx = 0.6 + 0.7 * e, w = r.w * sx;
          // Mờ: 0 → 1 ở 15 % thời gian rồi tắt dần về 0 (như keyframe cũ).
          ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          const x = -0.3 * side.w + r.dist * e + (r.w - w) / 2, y = r.y * side.h;
          const pad = r.sprite.height > 8 ? r.h : 0;
          ctx.drawImage(r.sprite, x, y - pad, w, r.h + pad * 2);
        }
        rays.length = keep;
      }
      ctx0Reset();
    };
    const ctx0Reset = () => { for (const side of sides) if (side.ctx) side.ctx.globalAlpha = 1; };
    const tick = (now: number) => {
      // Mốc khung hình có thể sớm hơn start vài ms: chặn âm (số âm ** 1.8 = NaN).
      const t = Math.min(1, Math.max(0, (now - start) / (CHARGE_MS - 300)));
      // Khung hình bị trễ thì không bù dồn quá 10 tia/bên (tránh khung sau càng nặng).
      due = Math.min(
        10,
        due +
          (Math.max(0, now - last) / 1000) *
            (RAY_RATE[0] + (RAY_RATE[1] - RAY_RATE[0]) * t ** 1.8),
      );
      last = Math.max(last, now);
      for (; due >= 1; due--)
        for (const side of sides) if (side.ctx && side.rays.length < 280) spawn(side, t, now);
      paint(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      for (const side of sides) side.ctx?.clearRect(0, 0, side.ctx.canvas.width, side.ctx.canvas.height);
    };
  }, [charging, outcome, reduced]);
  useEffect(() => {
    const el = shake.current;
    if (!charging || outcome || reduced || !el) {
      if (el) el.style.transform = "";
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(
        1,
        Math.max(0, (now - start - 1400) / (CHARGE_MS - 1400)),
      );
      const amp = t ? 1 + 8 * t ** 1.6 : 0;
      el.style.transform = `translate(${((Math.random() - 0.5) * 2 * amp).toFixed(2)}px, ${((Math.random() - 0.5) * 1.4 * amp).toFixed(2)}px) rotate(${((Math.random() - 0.5) * 0.25 * amp).toFixed(2)}deg)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [charging, outcome, reduced]);
  useEffect(() => {
    if (!charging) return;
    const prepare = window.setTimeout(
      () => setPrepared(computed.current),
      reduced ? 0 : CHARGE_MS - PREPARE_LEAD,
    );
    const reveal = window.setTimeout(
      () => setRevealed(true),
      reduced ? 0 : CHARGE_MS,
    );
    timers.current = [prepare, reveal];
    return () => {
      clearTimeout(prepare);
      clearTimeout(reveal);
    };
  }, [charging]);
  // Bỏ qua pha dồn năng lượng: huỷ hẹn giờ, dựng kết quả (đã tính lúc bấm) rồi lộ luôn.
  const skip = () => {
    if (!charging || revealed) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!prepared) setPrepared(computed.current);
    setRevealed(true);
  };
  useEffect(() => {
    if (outcome) onReveal?.(outcome.success);
  }, [outcome]);
  return (
    <div
      ref={screenRef}
      className={`uc-screen ${reduced ? "uc-reduced" : ""} ${charging ? "is-charging" : ""} ${charging || waiting ? "is-launch" : ""} ${failed ? "is-failed" : ""} ${won ? "is-success" : ""}`}
      data-tier={levelTier(
        won ? won.card.level : failed ? failed.before + 1 : target.level + 1,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={`Xác nhận nâng cấp ${p.name}`}
      aria-busy={charging}
    >
      <div className="uc-stage" aria-hidden="true">
        <div className="uc-zoom">
          <div className="uc-crowd">{UPGRADE_STAND}</div>
          <div className="uc-lights">
            {Array.from({ length: 13 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    "--d": `${(Math.abs(i - 6) * 0.09).toFixed(2)}s`,
                    // Chùm sáng chiếu chéo hội tụ về thẻ ở giữa (người dùng 2026-11-17: đèn chiếu xuống đẹp hơn).
                    "--a": `${((i - 6) * 4.2).toFixed(1)}deg`,
                    "--sw": `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg`,
                    "--sd": `${((i * 0.37) % 2.4).toFixed(2)}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="uc-floor">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline points="2,8 50,36 98,8" />
              <polyline points="14,4 50,26 86,4" />
            </svg>
          </div>
          <div className="uc-backdrop">
            <div className="uc-wall" />
            <div className="uc-wall-sheen" />
            {/* Mũi tên là rãnh khắc chìm vào tấm LED: nằm trong khung trùng tấm tường, cắt theo cùng mép cong (.uc-chev-clip). */}
            <div className="uc-chev-clip">
              <div className="uc-chevrons left">
                <i />
                <i />
                <i />
              </div>
              <div className="uc-chevrons right">
                <i />
                <i />
                <i />
              </div>
            </div>
            {charging && !outcome && (
              <div className="uc-flow-clip">
                {(["left", "right"] as const).map((side, i) => (
                  <div
                    key={side}
                    className={`uc-flow ${side}`}
                    ref={(el) => {
                      flows.current[i] = el;
                    }}
                  >
                    <canvas className="uc-flow-cv" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="uc-fog left" />
          <div className="uc-fog right" />
          {pFailed && (
            <div className={`uc-fail-fx${pre}`}>
              <b className="uc-fail-vignette" />
              {FAIL_SPARKS.map((style, i) => <i key={i} className="uc-fail-spark" style={style} />)}
              {FAIL_ASH.map((style, i) => <i key={`a${i}`} className="uc-fail-ash" style={style} />)}
            </div>
          )}
          {pFailed &&
            (["left", "right"] as const).map((side) => (
              <div key={side} className={`uc-sparkler broken ${side}${pre}`}>
                <b className="uc-sparkler-core" />
                {Array.from({ length: 14 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        "--a": `${(-14 + ((i * 23) % 28)).toFixed(1)}deg`,
                        "--h": `${5 + ((i * 7) % 11)}vh`,
                        "--d": `${((i * 0.29) % 1.6).toFixed(2)}s`,
                        "--t": `${(0.4 + ((i * 13) % 4) / 10).toFixed(1)}s`,
                        "--s": `${6 + ((i * 5) % 8)}px`,
                      } as CSSProperties
                    }
                  />
                ))}
                {Array.from({ length: 6 }, (_, i) => (
                  <s
                    key={i}
                    className="uc-machine-smoke"
                    style={
                      {
                        "--x": `${-18 + ((i * 13) % 36)}px`,
                        "--d": `${(0.5 + i * 0.42).toFixed(2)}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            ))}
          {pWon && (
            <>
              <div className={`uc-warm${pre}`} />
              {(["left", "right"] as const).map((side) => (
                <div key={side} className={`uc-sparkler ${side}${pre}`}>
                  <b className="uc-sparkler-core" />
                  {Array.from({ length: 72 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--a": `${(-5 + ((i * 29) % 11)).toFixed(1)}deg`,
                          "--h": `${34 + ((i * 41) % 40)}vh`,
                          "--d": `${((i * 0.037) % 1.3).toFixed(2)}s`,
                          "--t": `${(0.8 + ((i * 17) % 7) / 10).toFixed(1)}s`,
                          "--s": `${14 + ((i * 23) % 22)}px`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ))}
              {(["left", "right"] as const).map((side) => (
                <FlameJet
                  key={`flame-${side}`}
                  className={`uc-flame ${side}${pre}`}
                  preset={levelTier(pWon.card.level)}
                  reduced={reduced}
                />
              ))}
              {Array.from({ length: 14 }, (_, i) => (
                <b
                  key={i}
                  className={`uc-confetti${pre}`}
                  style={
                    {
                      "--x": `${6 + ((i * 37) % 88)}%`,
                      "--y": `${20 + ((i * 23) % 60)}%`,
                      "--d": `${(i * 0.4) % 4}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </>
          )}
          <div className="uc-rig">
            <div className="uc-card">
              {pWon && (
                <div className={`uc-rays${pre}`} aria-hidden="true">
                  {Array.from({ length: 84 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--r": `${((i * 360) / 84 + ((i * 7) % 4)).toFixed(1)}deg`,
                          "--d": `${(((i * 0.037) % 0.3) + (i % 3 === 2 ? 0.45 : 0)).toFixed(2)}s`,
                          "--l": `${170 + ((i * 53) % 260)}px`,
                          "--w": `${2 + (i % 4)}px`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
              <div className="uc-shake" ref={shake}>
                {renderCard(outcome?.card ?? target)}
                {charging && (!outcome || failed) && (
                  <div
                    className={`uc-whiteout${failed ? " is-ash" : ""}`}
                    style={
                      getPlayer(target).cardFace
                        ? ({
                            "--mask": `url("${getPlayer(target).cardFace}")`,
                          } as CSSProperties)
                        : undefined
                    }
                  />
                )}
                {failed && (
                  <svg
                    className="uc-crack"
                    viewBox="0 0 100 140"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={
                      getPlayer(target).cardFace
                        ? ({ "--mask": `url("${getPlayer(target).cardFace}")` } as CSSProperties)
                        : undefined
                    }
                  >
                    {FAIL_CRACKS.map((d, n) => (
                      <path key={n} d={d} pathLength={100} style={{ "--d": `${(n * 0.035).toFixed(3)}s` } as CSSProperties} />
                    ))}
                  </svg>
                )}
              </div>
              {pFailed && (
                <div className={`uc-burn${pre}`}>
                  {/* Khói (người dùng 2026-11-17: đẹp, mượt hơn, ít lại): 8 cụm, bốc một đợt: bùng dày rồi các cụm sau nối tiếp trong ~1,5 s, mỗi cụm thời lượng riêng. */}
                  {Array.from({ length: 8 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--x": `${10 + ((i * 37) % 80)}%`,
                          "--s": `${0.65 + ((i * 13) % 7) / 10}`,
                          "--d": `${(i < 4 ? i * 0.08 : 0.3 + ((i * 0.23) % 0.9)).toFixed(2)}s`,
                          "--t": `${(3.6 + ((i * 7) % 15) / 10).toFixed(1)}s`,
                          "--sw": `${i % 2 ? 9 : -9}%`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="uc-podium">
              {CAGE}
              <LedPodium
                reduced={reduced}
                charging={charging && !outcome}
                off={!!failed}
                full={!!won}
              />
              {(["left", "right"] as const).map((side) => (
                <div
                  key={side}
                  className={`uc-side-led ${side}`}
                  aria-hidden="true"
                >
                  <LedPodium
                    reduced={reduced}
                    charging={charging && !outcome}
                    off={!!failed || (!charging && !won)}
                    full={!!won}
                    side={side}
                  />
                </div>
              ))}
              <div className="uc-base" />
              {PLINTH}
              {PLINTH_SHINE}
            </div>
          </div>
        </div>
      </div>
      <header className="uc-title">
        <h1>Nâng cấp cầu thủ</h1>
        <p>Tiếp tục nâng cấp cầu thủ</p>
      </header>
      {pWon && (
        <header
          className={`uc-win${pre}`}
          role={pre ? undefined : "status"}
          aria-hidden={pre ? true : undefined}
        >
          <h2>
            <img
              src={levelBadge(pWon.card.level)}
              alt={`+${pWon.card.level}`}
            />
            Nâng cấp thành công
          </h2>
          <p>{winPrice(pWon.card)}</p>
        </header>
      )}
      {prepared && (
        <ResultBar
          before={target}
          after={prepared.card}
          success={prepared.success}
          restored={prepared.restored}
          pending={!revealed}
          levelBadge={levelBadge}
          onNext={onBack}
        />
      )}
      {charging && !revealed && !reduced && (
        <button className="uc-skip" onClick={skip} autoFocus>
          Bỏ qua
          <SkipForward size={18} />
        </button>
      )}
      {outcome && !reduced && (
        <div className={`uc-flash ${outcome.success ? "up" : "down"}`} aria-hidden="true" />
      )}
      <aside className="uc-panel">
        <UpgradeMusic onActiveChange={onMusicActiveChange} />
        <h2>
          <b className={`squad-season season-tag-${p.tier}`}>
            {seasonShort(p.tier)}
          </b>
          {p.name}
        </h2>
        <div
          className="uc-materials"
          aria-label={`${materials.length} cầu thủ sử dụng`}
        >
          {materials.map((m, i) => (
            <div
              key={m.uid}
              className="uc-material"
              style={{ "--i": i, zIndex: i + 1 } as CSSProperties}
            >
              {renderCard(m, true)}
            </div>
          ))}
        </div>
        <div className="uc-row">
          <span>Tăng % nâng cấp</span>
          <div className="uc-energy" aria-label={`Năng lượng ${energy}%`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <i
                key={n}
                style={
                  {
                    "--fill": `${Math.min(100, Math.max(0, energy - (n - 1) * 20) * 5)}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        <div className="uc-row">
          <span>
            <ShieldPlus size={20} />
            Bảo vệ cấp độ nâng cấp
          </span>
          <b className={protection?.pct ? "on" : ""}>
            {protection?.pct
              ? `${protection.pct}%${protection.cost ? ` · ${money(protection.cost)} BP` : ""}`
              : "Không sử dụng"}
          </b>
        </div>
        {restore !== null && (
          <div className="uc-row">
            <span>
              <CirclePlus size={20} />
              Khôi phục cấp thẻ
            </span>
            <b className={restore.chance ? "on" : ""}>
              {restore.chance
                ? `${restore.chance}% · giữ +${restore.floor}`
                : "Không có"}
            </b>
          </div>
        )}
        <div className="uc-row">
          <span>
            <RefreshCcw size={20} />
            Thẻ nâng cấp lại
          </span>
          <b>0 cái trong kho</b>
        </div>
        <div className="uc-actions">
          <button className="uc-back" onClick={onBack} disabled={charging}>
            Trở lại
          </button>
          <button
            className="uc-go"
            onClick={() => void go()}
            disabled={charging || waiting}
            aria-busy={waiting || undefined}
            ref={goButton}
          >
            {waiting ? "Đang gửi…" : "Nâng cấp"}
          </button>
        </div>
      </aside>
    </div>
  );
}
