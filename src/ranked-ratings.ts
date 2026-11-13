import { rawStats } from './player-stats';

// Sức công / thủ của đội GLXH từ chỉ số cầu thủ (người dùng chốt 2026-11-13: chỉ số ảnh hưởng kết quả + diễn biến, mức vừa phải).
// Máy chủ có bản SQL giống hệt (migration 202611130001: fco_slot_rating, fco_team_rating) và dùng để tính kết quả; game chỉ hiển thị.
//   · Mỗi ô: att (dứt điểm, lực sút, chọn vị trí, sút xa, vô-lê), cre (chuyền ngắn / dài, tầm nhìn, tạt, rê, giữ bóng),
//     def (kèm người, cắt bóng, xoạc, sức mạnh, quyết đoán, đánh đầu), pace (tốc độ, tăng tốc), gk (đổ người, bắt bóng, phản xạ, chọn vị trí TM).
//     Chỉ số theo OVR của ô (đã gồm trái vị trí + team color). Thiếu nhóm chỉ số (thủ môn đá trên sân / ngược lại): OVR − 15 (gk: OVR − 25).
//   · Đội: tấn công = hàng công (.6 att + .2 cre + .2 pace) ×3, hàng giữa (.3 att + .5 cre + .2 pace) ×2, hàng thủ (.5 cre + .5 pace) ×.5;
//     phòng ngự = hàng công def ×.3, hàng giữa (.6 def + .2 pace + .2 cre) ×1,5, hàng thủ (.7 def + .3 pace) ×3, thủ môn gk ×3.
export const ATT = ['Dứt điểm', 'Lực sút', 'Chọn vị trí', 'Sút xa', 'Vô-lê'] as const;
export const CRE = ['Chuyền ngắn', 'Tầm nhìn', 'Chuyền dài', 'Tạt bóng', 'Rê bóng', 'Giữ bóng'] as const;
export const DEF = ['Kèm người', 'Cắt bóng', 'Xoạc bóng', 'Sức mạnh', 'Quyết đoán', 'Đánh đầu'] as const;
export const PACE = ['Tốc độ', 'Tăng tốc'] as const;
export const GK = ['Đổ người', 'Bắt bóng', 'Phản xạ', 'Chọn vị trí TM'] as const;
// Hệ số ảnh hưởng tới số bàn kỳ vọng: λ × e^(K × chênh), chênh (tổng dư công + thủ hai đội) chặn ±EDGE_CAP.
export const EDGE_K = .03, EDGE_CAP = 8;

export type SlotRating = { att: number; cre: number; def: number; pace: number; gk: number };
export type RatedSlot = { role: string; ovr: number; pid?: number | null; pos?: string | null };
export type Line = 'gk' | 'df' | 'mf' | 'fw';

export function roleLine(role: string): Line {
  if (role === 'GK') return 'gk';
  if (/(CB|LB|RB|WB|SW)$/.test(role)) return 'df';
  if (/(ST|CF|LW|RW|LF|RF|LS|RS)$/.test(role)) return 'fw';
  return 'mf';
}

const mean = (names: readonly string[], values: number[], want: readonly string[], fallback: number) => {
  const picked = want.map(n => names.indexOf(n)).filter(i => i >= 0).map(i => values[i]);
  return picked.length ? picked.reduce((s, v) => s + v, 0) / picked.length : fallback;
};

// Chỉ số một ô: cầu thủ (mã, vị trí sở trường) đá ở ô role với OVR ovr. Đội máy / thẻ không rõ: vị trí = ô, mã 0.
export function slotRating(slot: RatedSlot): SlotRating {
  const { names, values } = rawStats({ id: slot.pid ?? 0, pos: slot.pos || slot.role }, slot.ovr);
  return {
    att: mean(names, values, ATT, slot.ovr - 15), cre: mean(names, values, CRE, slot.ovr - 15), def: mean(names, values, DEF, slot.ovr - 15),
    pace: mean(names, values, PACE, slot.ovr - 15), gk: mean(names, values, GK, slot.ovr - 25),
  };
}

export function teamRating(slots: RatedSlot[]) {
  let aw = 0, a = 0, dw = 0, d = 0;
  for (const slot of slots) {
    const r = slotRating(slot), line = roleLine(slot.role);
    if (line === 'fw') { a += 3 * (.6 * r.att + .2 * r.cre + .2 * r.pace); aw += 3; d += .3 * r.def; dw += .3; }
    else if (line === 'mf') { a += 2 * (.3 * r.att + .5 * r.cre + .2 * r.pace); aw += 2; d += 1.5 * (.6 * r.def + .2 * r.pace + .2 * r.cre); dw += 1.5; }
    else if (line === 'df') { a += .5 * (.5 * r.cre + .5 * r.pace); aw += .5; d += 3 * (.7 * r.def + .3 * r.pace); dw += 3; }
    else { d += 3 * r.gk; dw += 3; }
  }
  return { attack: aw ? a / aw : 0, defense: dw ? d / dw : 0 };
}

// Chênh lệch chỉ số giữa hai đội (dư công + dư thủ so với OVR đội), chặn ±EDGE_CAP. Dương: đội mình lợi thế.
export function statEdge(me: { attack: number; defense: number }, meOvr: number, opp: { attack: number; defense: number }, oppOvr: number) {
  const edge = (me.attack - meOvr + me.defense - meOvr) - (opp.attack - oppOvr + opp.defense - oppOvr);
  return Math.max(-EDGE_CAP, Math.min(EDGE_CAP, edge));
}
