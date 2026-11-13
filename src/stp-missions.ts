// Nhiệm vụ Star Point hằng ngày (supabase/migrations/202611110012_fco_stp_missions.sql). Máy chủ ghi nhận khi đạt
// (đập thẻ thành công trên kho máy chủ, chuỗi sút phạt), người chơi bấm Nhận để cộng STP; mỗi nhiệm vụ 1 lần mỗi ngày.
// Danh sách phải khớp bảng fco_stp_mission_defs của migration (tests/stp-missions.test.ts).
export type StpMissionId = 'messi8' | 'ronaldo8' | 'penalty20' | 'messi7' | 'ronaldo7';
export type StpMission = { id: StpMissionId; title: string; reward: number; hint: string };
export const STP_MISSIONS: readonly StpMission[] = [
  { id: 'messi8', title: 'Nâng cấp L. Messi mùa bất kì lên +8', reward: 25, hint: 'Đập thẻ L. Messi thành công lên +8 trở lên' },
  { id: 'ronaldo8', title: 'Nâng cấp C. Ronaldo mùa bất kì lên +8', reward: 25, hint: 'Đập thẻ Cristiano Ronaldo thành công lên +8 trở lên' },
  { id: 'penalty20', title: 'Đạt chuỗi 20 trong Penalty', reward: 20, hint: 'Chuỗi 20 lượt thành công (sút vào hoặc bắt được) trong một lượt Penalty' },
  { id: 'messi7', title: 'Nâng cấp L. Messi mùa bất kì lên +7', reward: 15, hint: 'Đập thẻ L. Messi thành công lên +7 trở lên' },
  { id: 'ronaldo7', title: 'Nâng cấp C. Ronaldo mùa bất kì lên +7', reward: 15, hint: 'Đập thẻ Cristiano Ronaldo thành công lên +7 trở lên' },
];
export type StpMissionStatus = { id: string; reward: number; done: boolean; claimed: boolean };
export type StpMissionState = { day: string; missions: StpMissionStatus[] };
export const claimableMissions = (state: StpMissionState | null) => state?.missions.filter(m => m.done && !m.claimed).length ?? 0;
