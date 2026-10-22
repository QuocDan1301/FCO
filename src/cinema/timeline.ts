// glitch: thời gian nhiễu sóng sau chớp trắng; đường hầm 3D bắt đầu chạy ngay dưới lớp nhiễu.
// glitch gồm thêm 0,5 s thẻ đứng yên trong trạng thái nhiễu trước khi tan.
export const OPENING_ENTRY = { standard: { wait: 2000, flip: 1900, glitch: 1200, cameraLead: 0 }, quick: { wait: 2000, flip: 900, glitch: 900, cameraLead: 0 } } as const;

// Cờ, vị trí, logo đội mỗi mục một nhịp bằng nhau (mốc 3–5): hiện rõ rồi nghỉ INFO_GAP trước mục kế.
// Hết logo là vào thẻ ngay, các mốc 6–8 chỉ còn là nhịp chuyển rất ngắn.
export const OPENING_CUES = {
  // Mốc 1 (khung LED bắt đầu sáng) = lúc camera xuyên qua vùng sáng ở cửa hầm (GATE_CROSS).
  standard: [2770, 3170, 3570, 6070, 8570, 11070, 11100, 11130, 11170],
  quick: [1590, 1740, 1890, 2890, 3890, 4890, 4910, 4930, 4960],
} as const;
// Vùng sáng đứng yên ở cửa hầm (z ≈ 2,5, ngay trước cặp màn LED có ảnh nền ở z = -3), đã thấy từ lúc thẻ còn nhiễu.
// Camera xuyên qua nó ngay sau khi hết nhiễu rồi khung LED mới sáng; mốc chọn sao cho camera tới z ≈ 2,5 đúng lúc này.
// Camera 3D đứng yên suốt lúc thẻ nhiễu và thêm phần chờ để cảnh đi vào cổng phòng chờ chậm hơn (dài GATE_CROSS - glitch);
// GATE_CROSS = CAMERA_HOLD + thời gian camera 3D đi tới cửa hầm, nên đổi phần thêm thì GATE_CROSS và OPENING_CUES cộng theo.
export const CAMERA_HOLD = { standard: OPENING_ENTRY.standard.glitch + 400, quick: OPENING_ENTRY.quick.glitch + 200 } as const;
// Hết chờ, camera tăng tốc êm từ 0 trong CAMERA_RAMP (đến chậm hơn ramp/2 so với xuất phát đột ngột).
export const CAMERA_RAMP = { standard: 400, quick: 200 } as const;
export const GATE_CROSS = { standard: 2770, quick: 1590 } as const;
export const INFO_GAP = { standard: 500, quick: 200 } as const;
export const OPENING_RESULT = 9;
export function openingPhase(elapsed: number, quick: boolean) {
  return OPENING_CUES[quick ? 'quick' : 'standard'].filter(at => elapsed >= at).length;
}
export function sceneProgress(phase: number) {
  return [0, .055, .16, .26, .37, .46, .51, .64, .86, 1][Math.min(9, Math.max(0, phase))];
}

// Hầm dài thêm TUNNEL_EXTRA so với bản đầu; sân khấu dời ra xa tương ứng.
export const TUNNEL_EXTRA = 48;
export const STAGE_Z = -59 - TUNNEL_EXTRA;
const CAMERA_START_Z = 13, TUNNEL_END_Z = -38 - TUNNEL_EXTRA, CAMERA_END_Z = STAGE_Z + 9.5;
// Phần quãng đường nằm trong hầm; camera chạm cửa hầm đúng lúc hết logo đội.
const TUNNEL_SHARE = (CAMERA_START_Z - TUNNEL_END_Z) / (CAMERA_START_Z - CAMERA_END_Z);
// Sau khi thẻ hiện, camera còn lướt ra sân khấu thêm một đoạn.
export const CAMERA_EXIT = { standard: 1500, quick: 700 } as const;
export const cameraEnd = (quick: boolean) => OPENING_CUES[quick ? 'quick' : 'standard'][8] + CAMERA_EXIT[quick ? 'quick' : 'standard'];

// Hermite hai đoạn: [0 → hết logo] trong hầm, [hết logo → cuối] ra sân khấu; vận tốc liền mạch, bắt đầu và dừng êm.
export function cameraProgress(elapsed: number, quick: boolean) {
  const hold = CAMERA_HOLD[quick ? 'quick' : 'standard'], ramp = CAMERA_RAMP[quick ? 'quick' : 'standard'];
  const exitAt = OPENING_CUES[quick ? 'quick' : 'standard'][5] - hold - ramp / 2, end = cameraEnd(quick) - hold - ramp / 2;
  elapsed -= hold;
  if (elapsed <= 0) return 0;
  // Nắn thời gian: vận tốc tăng tuyến tính từ 0 trong ramp đầu rồi chạy đúng đường cong cũ.
  elapsed = elapsed < ramp ? elapsed * elapsed / (2 * ramp) : elapsed - ramp / 2;
  if (elapsed >= end) return 1;
  const s1 = TUNNEL_SHARE / exitAt, s2 = (1 - TUNNEL_SHARE) / (end - exitAt), knot = 2 * s1 * s2 / (s1 + s2);
  // Vào hầm là tiến tới ngay (vận tốc đầu = trung bình) về phía vùng sáng ở cửa hầm.
  const [t0, t1, p0, p1, m0, m1] = elapsed < exitAt ? [0, exitAt, 0, TUNNEL_SHARE, s1, knot] : [exitAt, end, TUNNEL_SHARE, 1, knot, 0];
  const span = t1 - t0, t = (elapsed - t0) / span, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * span * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * span * m1;
}


export function cameraPose(progress: number) {
  const t = Math.min(1, Math.max(0, (progress - TUNNEL_SHARE) / (1 - TUNNEL_SHARE)));
  const approach = t * t * (3 - 2 * t);
  const z = CAMERA_START_Z - progress * (CAMERA_START_Z - CAMERA_END_Z);
  return {
    x: Math.sin(progress * Math.PI) * .18,
    y: 3.1 + approach * .25,
    z,
    // Nhìn xa phía trước trong hầm; khi ra khỏi hầm điểm nhìn dừng ở tâm sân khấu.
    lookZ: z - 19.5 + approach * 10,
  };
}

// Vị trí z của vùng sáng: chỗ camera đang đứng tại GATE_CROSS.
export function gateZ(quick: boolean) {
  return cameraPose(cameraProgress(GATE_CROSS[quick ? 'quick' : 'standard'], quick)).z;
}
