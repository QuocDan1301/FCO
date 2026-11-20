import type { NameEffect } from './name-effects';
// Top Đặc Huấn (migration 202611180005_fco_topup_race.sql): bảng tổng FC nạp từ 0h 18/11 tới khi sự kiện VQTG kết thúc, top 50 nhận quà.
// Hiển thị điểm đặc huấn = FC nạp × pointsPerFc (1,5; migration 202611180006).
export type TopupRaceRow = { rank: number; name: string; points: number; mine: boolean; effect?: NameEffect | null; club?: string | null };
export type TopupRaceReward = { pack?: string; count?: number; bp?: number; fc?: number };
export type TopupRace = {
  startsAt: number; endsAt: number; ended: boolean; topN: number; pointsPerFc: number;
  // Điểm tối thiểu để vào bảng / nhận quà (migration 202611200001_fco_topup_race_min_points.sql); 0 = không giới hạn.
  minPoints: number;
  top: TopupRaceRow[];
  me: { rank: number | null; points: number };
  rewards: { from: number; to: number; rewards: TopupRaceReward[]; note: string }[];
  awarded: boolean;
};
export function topupCountdown(endsAt: number, now: number) {
  const left = Math.max(0, endsAt - now), s = Math.floor(left / 1000), pad = (n: number) => String(n).padStart(2, '0');
  return { left, days: Math.floor(s / 86400), clock: `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` };
}
// Điểm có thể lẻ ,5 (FC × 1,5): hiện tối đa 1 chữ số thập phân.
const pointFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
export const formatPoints = (n: number) => pointFormat.format(n);
// Ngày theo giờ Việt Nam dạng 18.11 (banner + bảng).
const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });
export const formatDayMonth = (ms: number) => dayMonth.format(ms).replace(/\D+/g, '.').replace(/^\.|\.$/g, '');
// Máy chủ còn bản 202611180005 (chưa chạy 202611180006) trả amount (FC) thay cho points: tự quy ra điểm để bảng không hiện NaN.
type RawRow = Omit<TopupRaceRow, 'points'> & { points?: number; amount?: number };
type RawRace = Omit<TopupRace, 'top' | 'me' | 'pointsPerFc' | 'minPoints'> & { pointsPerFc?: number; minPoints?: number; top: RawRow[]; me: { rank: number | null; points?: number; amount?: number } };
export const DEFAULT_POINTS_PER_FC = 1.5;
export function normalizeTopupRace(raw: RawRace): TopupRace {
  const rate = Number.isFinite(raw.pointsPerFc) ? raw.pointsPerFc! : DEFAULT_POINTS_PER_FC;
  const pts = (r: { points?: number; amount?: number }) => Number.isFinite(r.points) ? r.points! : Number.isFinite(r.amount) ? r.amount! * rate : 0;
  return { ...raw, pointsPerFc: rate, minPoints: Number.isFinite(raw.minPoints) ? raw.minPoints! : 0, top: (raw.top ?? []).map(({ amount: _a, ...r }) => ({ ...r, points: pts({ ...r, amount: _a }) })),
    me: { rank: raw.me?.rank ?? null, points: pts(raw.me ?? {}) }, rewards: raw.rewards ?? [] };
}
// Mốc bắt đầu trước 2020 = tính toàn bộ FC đã nạp từ trước tới giờ (migration 202611180009_fco_topup_race_all_time.sql).
export const isAllTime = (startsAt: number) => startsAt < Date.UTC(2020, 0, 1);
/** Khoảng tính điểm để hiện: "18.11 – 20.11", hoặc "đến 20.11" khi tính toàn bộ. */
export const raceSpan = (startsAt: number, endsAt: number) => isAllTime(startsAt) ? `đến ${formatDayMonth(endsAt - 1)}` : `${formatDayMonth(startsAt)} – ${formatDayMonth(endsAt - 1)}`;
