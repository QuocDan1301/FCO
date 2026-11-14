// Vòng đua BXH GLXH + Penalty (migration 202611140017): thời gian còn lại tới mốc kết thúc (đồng hồ máy chủ), vd. '1 ngày 03:12:45'.
const pad = (n: number) => String(n).padStart(2, '0');
export function roundLeft(endsAt: number, now: number) {
  const s = Math.max(0, Math.floor((endsAt - now) / 1000)), d = Math.floor(s / 86400);
  return { done: s === 0, text: `${d ? `${d} ngày ` : ''}${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` };
}
