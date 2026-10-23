import { useEffect, useRef } from 'react';
import { cameraProgress, OPENING_CUES } from './timeline';
import { drawBadge, infoVisibility } from './sceneBadge';

export default function LightTunnel({ phase, season, nation, position, team, flag, teamLogo, back, intro, accent, stage, quick, onReady, onPrepared, playing = true, getElapsed }: { phase: number; season: string; nation: string; position: string; team: string; flag: string; teamLogo?: string; back?: string; intro?: string; accent?: string; stage?: { top: string; ring: string; led?: string }; quick: boolean; onReady: () => void; onPrepared?: () => void; playing?: boolean; getElapsed?: () => number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ phase, season, nation, position, team, flag, teamLogo, back, intro, accent, stage, quick, onReady, onPrepared, playing, getElapsed }); latest.current = { phase, season, nation, position, team, flag, teamLogo, back, intro, accent, stage, quick, onReady, onPrepared, playing, getElapsed };
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const board = document.createElement('canvas'); board.width = 384; board.height = 192; const boardCtx = board.getContext('2d'); let boardKey = '';
    let frame = 0, last = 0, progress = 0, startedAt: number | null = null, prepared = false, wasPlaying = false, skipped = false;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return;
      const dt = last ? Math.min((now - last) / 1000, .1) : 0;
      last = now;
      const { phase, season, nation, position, team, flag, teamLogo, back, intro, accent, stage, quick, onReady, onPrepared, playing, getElapsed } = latest.current;
      if (playing !== wasPlaying) { if (!playing) { prepared = false; startedAt = null; progress = 0; skipped = false; } wasPlaying = playing; }
      if (!playing && prepared) return;
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const elapsed = getElapsed?.() ?? (startedAt === null ? 0 : now - startedAt);
      const duration = OPENING_CUES[quick ? 'quick' : 'standard'][8];
      // Bỏ qua: lướt tới cuối rồi giữ đó, không quay về đường cong gốc (tránh chạy lại lần hai).
      if (phase >= 9 && elapsed < duration - 150) skipped = true;
      progress = skipped ? progress + (1 - progress) * (1 - Math.exp(-9 * dt)) : cameraProgress(elapsed, quick);
      const cx = w * .5, cy = h * .47, gold = accent ?? '#e5c991';
      ctx.fillStyle = phase === 0 ? '#020408' : '#060c13'; ctx.fillRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .65); glow.addColorStop(0, phase >= 7 ? '#8d9f9a44' : '#d8bf8420'); glow.addColorStop(1, '#03070c00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      if (phase < 8) {
        const count = w < 700 ? 7 : 11;
        for (let i = count; i >= 0; i--) {
          const depth = (i + 1) * 2.5 - (progress * 27 % 2.5); const scale = 1 / (1 + Math.max(.1, depth) * .2);
          const rw = w * 1.3 * scale, rh = h * 1.12 * scale, x = cx - rw / 2, y = cy - rh / 2, c = Math.min(45, rw * .07);
          ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + rw - c, y); ctx.lineTo(x + rw, y + c); ctx.lineTo(x + rw, y + rh - c); ctx.lineTo(x + rw - c, y + rh); ctx.lineTo(x + c, y + rh); ctx.lineTo(x, y + rh - c); ctx.lineTo(x, y + c); ctx.closePath(); ctx.strokeStyle = '#2a3441'; ctx.lineWidth = 11 * scale + 1; ctx.stroke();
          if (phase > 0) { ctx.strokeStyle = gold; ctx.globalAlpha = .25 + .4 * scale; ctx.lineWidth = Math.max(1, 2 * scale); ctx.beginPath(); ctx.moveTo(x + c, y + 7 * scale); ctx.lineTo(x + rw - c, y + 7 * scale); ctx.moveTo(x + 7 * scale, y + c); ctx.lineTo(x + 7 * scale, y + rh - c); ctx.moveTo(x + rw - 7 * scale, y + c); ctx.lineTo(x + rw - 7 * scale, y + rh - c); ctx.stroke(); ctx.globalAlpha = 1; }
        }
        const key = `${phase}|${flag}|${position}|${team}|${back}|${intro}`;
        if (boardCtx && key !== boardKey) { boardKey = key; drawBadge(boardCtx, { phase, season, nation, position, team, flag, teamLogo, back: intro || back }, 384, 192, () => { boardKey = ''; }); }
        const bw = w * .2, bh = bw / 2, shown = .07 + .93 * infoVisibility(phase, back);
        for (const side of [-1, 1]) { ctx.save(); ctx.globalAlpha = shown; ctx.translate(cx + side * w * .36, cy); ctx.transform(1, side * -.12, 0, 1, 0, 0); ctx.drawImage(board, -bw / 2, -bh / 2, bw, bh); ctx.restore(); }
      } else {
        // Thẻ đã hiện: bục và viền đổi sang màu riêng của mùa thẻ.
        const look = phase >= 9 ? stage : undefined;
        ctx.fillStyle = look?.top ?? '#1b2630'; ctx.beginPath(); ctx.ellipse(cx, h * .79, w * .4, h * .09, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = look?.ring ?? gold; ctx.lineWidth = 2; ctx.stroke();
        for (const side of [-1, 1]) { ctx.fillStyle = '#f4d99511'; ctx.beginPath(); ctx.moveTo(cx + side * w * .32, h * .78); ctx.lineTo(cx + side * w * .48, h * .13); ctx.lineTo(cx + side * w * .1, h * .13); ctx.closePath(); ctx.fill(); }
      }
      const reflection = ctx.createLinearGradient(0, h * .57, 0, h); reflection.addColorStop(0, '#e8d49e00'); reflection.addColorStop(.7, '#e8d49e0b'); reflection.addColorStop(1, '#050b1300'); ctx.fillStyle = reflection; ctx.fillRect(w * .15, h * .57, w * .7, h * .43);
      canvas.dataset.progress = progress.toFixed(4);
      if (!prepared) { prepared = true; onPrepared?.(); }
      if (playing && startedAt === null) { startedAt = now; onReady(); }
      ctx.fillStyle = '#010409'; ctx.fillRect(0, 0, w, h * .08); ctx.fillRect(0, h * .92, w, h * .08);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas className="light-cinema-canvas" ref={canvasRef} data-renderer="light" aria-hidden="true"/>;
}
