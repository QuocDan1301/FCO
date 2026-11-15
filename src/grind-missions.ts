import type { BilacReward } from './wallet-state';

// Nhiệm vụ cày chay (supabase/migrations/202611150006_fco_grind_missions.sql): nhiệm vụ ngày (làm mới 0h giờ VN) và tuần
// (làm mới 0h thứ Hai), thưởng gói cầu thủ. Máy chủ giữ danh sách, đếm tiến độ (GLXH, Penalty, đập thẻ) và trao quà.
export type GrindPeriod = 'day' | 'week';
export type GrindMission = {
  id: string; period: GrindPeriod; kind: string; goal: number; progress: number; claimed: boolean;
  rewards: BilacReward[]; title: string; hint: string;
};
export type GrindState = { day: string; week: string; missions: GrindMission[] };

export const grindReady = (mission: GrindMission) => !mission.claimed && mission.progress >= mission.goal;
/** Số phần thưởng đang chờ nhận (lọc theo kỳ nếu có). */
export const claimableGrind = (state: GrindState | null, period?: GrindPeriod) =>
  state?.missions.filter(m => (!period || m.period === period) && grindReady(m)).length ?? 0;
