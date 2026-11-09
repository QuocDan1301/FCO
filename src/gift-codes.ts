import { money, uid } from './game';
import type { EventReward, Save } from './game';
import { findPack, grantRewards } from './event';
import { GIFT_CODE_PATTERN, hashGiftCode, normalizeGiftCode } from './gift-code-rules';
import type { AdminGift } from './wallet-state';

// Gift code: người chơi (đã đăng nhập) nhập ở cửa sổ Quà mỗi ngày. Danh sách code nằm trên máy chủ (bảng fco_gift_codes,
// chỉ lưu mã băm), admin tạo / xoá trong game; mỗi tài khoản dùng mỗi code một lần (fco_redeem_gift). FC do máy chủ cộng.
export type { GiftCode } from './gift-code-rules';
export { GIFT_CODE_PATTERN, giftCodeError, giftCodeHint, hashGiftCode, normalizeGiftCode } from './gift-code-rules';

export const giftRewardText = (r: EventReward) => 'bp' in r ? `${money(r.bp)} BP` : 'fc' in r ? `${money(r.fc)} FC` : `Gói ${findPack(r.pack)?.name ?? r.pack} x ${r.count}`;

// Chuẩn hoá và băm code người chơi nhập; máy chủ chỉ nhận mã băm.
export async function prepareGiftCode(input: string) {
  const code = normalizeGiftCode(input);
  if (!code) throw new Error('Hãy nhập gift code.');
  if (!GIFT_CODE_PATTERN.test(code)) throw new Error('Gift code gồm 4–32 chữ cái không dấu, số, "-" hoặc "_".');
  return { code, hash: await hashGiftCode(code) };
}

// Cộng phần BP / gói của gift code vào bản lưu (FC máy chủ đã cộng vào ví) và ghi lịch sử.
export function applyGiftRewards(state: Save, code: string, rewards: EventReward[]) {
  const text = rewards.map(giftRewardText).join(', ');
  const granted = grantRewards(state, rewards.filter(reward => !('fc' in reward)));
  return { text, state: { ...granted, history: [{ id: uid(), time: Date.now(), type: 'gift' as const, title: `Gift code ${code}`, detail: `Nhận ${text}` }, ...state.history].slice(0, 200) } };
}

// Thêm quà admin tặng vào bản lưu (FC máy chủ đã cộng vào ví). id lịch sử cố định theo mã quà: quà đã có trong lịch sử thì không cộng lần hai,
// chỉ đưa vào ids để báo lại máy chủ. Gói không còn trong game thì bỏ qua và để quà tiếp tục chờ, không chặn các quà khác.
export function applyAdminGifts(state: Save, gifts: AdminGift[]) {
  let next = state;
  const ids: number[] = [], texts: string[] = [];
  let fc = false;
  for (const gift of gifts) {
    const id = `admin-gift-${gift.id}`;
    if (next.history.some(entry => entry.id === id)) { ids.push(gift.id); continue; }
    let granted: Save;
    try { granted = grantRewards(next, gift.rewards.filter(reward => !('fc' in reward))); } catch { continue; }
    const text = gift.rewards.map(giftRewardText).join(', ');
    next = { ...granted, history: [{ id, time: Date.now(), type: 'gift' as const, title: 'Quà từ Admin', detail: `Nhận ${text}${gift.note ? ` · ${gift.note}` : ''}` }, ...next.history].slice(0, 200) };
    ids.push(gift.id); texts.push(text);
    fc ||= gift.rewards.some(reward => 'fc' in reward);
  }
  return { state: next, ids, texts, fc };
}
