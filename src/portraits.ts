import data from './portraits.json';
import customData from './minifaces-custom.json';
import frameData from './portrait-frames.json';
import maskData from './portrait-masks.json';
import blankData from './portrait-blank.json';
import zoneData from './portrait-zones.json';
import { asset } from './asset';
import { seasons } from './game';
import type { Player, Tier } from './game';

// Chân dung không nền (ảnh playersAction của FC Online, 112×112 WebP trong suốt) theo mã cầu thủ — dựng bởi scripts/portraits/
// (khớp ảnh thẻ với chân dung cùng mùa, thiếu thì lấy ảnh của chính cầu thủ ở mùa khác). Thẻ không có trong bảng: dùng ảnh thẻ như cũ.
// persons: mọi miniface của một cầu thủ ('tên|quốc tịch' → spid, mùa mới trước) để người chơi tự chọn; seasons: mã mùa → mùa trong game.
type Data = { cards: Record<string, string>; persons?: Record<string, string[]>; seasons?: Record<string, string> };
const { cards, persons = {}, seasons: codes = {} } = data as Data;
// Miniface tùy chọn người dùng gửi (minifaces-custom.json, ảnh ở portraits/custom/<mã>.webp): thêm vào đầu danh sách chọn của cầu thủ đó.
const custom = (customData as { items: Record<string, { person: string; label: string }> }).items;
const customOf: Record<string, string[]> = {};
for (const [id, c] of Object.entries(custom)) (customOf[c.person] ??= []).push(id);
export const isCustomMiniface = (v: string) => Object.hasOwn(custom, v);
const url = (spid: string) => asset(isCustomMiniface(spid) ? `/assets/portraits/custom/${spid}.webp` : `/assets/portraits/${spid}.webp`);
export const portraitOf = (playerId: number): string | undefined => { const spid = cards[String(playerId)]; return spid ? url(spid) : undefined; };

// Miniface người chơi chọn (bản lưu `minifaces`): App gọi setMinifaces mỗi lần vẽ để mọi chỗ hiện ảnh mặt dùng cùng lựa chọn.
let chosen: Record<string, string> = {};
export const setMinifaces = (m: Record<string, string> | undefined) => { chosen = m ?? {}; };
export const personKey = (p: Pick<Player, 'name' | 'nation'>) => `${p.name}|${p.nation ?? ''}`;
export type MinifaceOption = { value: string; src: string; label: string };
// Lựa chọn miniface của cầu thủ: các chân dung (cùng người, mọi mùa trong kho) + ảnh thẻ. 'default' = ảnh tự gán cho thẻ.
export function minifaceOptions(p: Pick<Player, 'id' | 'name' | 'nation' | 'cardFace' | 'image'>): MinifaceOption[] {
  const own = cards[String(p.id)], list = [...(customOf[personKey(p)] ?? []), ...(persons[personKey(p)] ?? (own ? [own] : []))];
  const label = (spid: string) => { if (isCustomMiniface(spid)) return custom[spid].label; const tier = codes[spid.slice(0, 3)] as Tier | undefined; return tier ? seasons[tier] ?? tier : `Mùa ${spid.slice(0, 3)}`; };
  return [...list.map(spid => ({ value: spid, src: url(spid), label: label(spid) })), { value: 'card', src: p.cardFace || p.image || asset('/assets/silhouette.svg'), label: 'Ảnh thẻ' }];
}

// Ảnh mặt cầu thủ trên sân / trên dòng danh sách: miniface người chơi chọn → chân dung tự gán → ảnh thẻ (cắt vào đầu – vai như cũ).
// portrait = true → CSS hiện nguyên ảnh không nền, bỏ hộp nền.
// Bảng miniface của người khác (chủ đội hình khi xem BXH / đối thủ GLXH, máy chủ gửi kèm): chỉ giữ mục hợp lệ.
export type Faces = Record<string, string>;
export function cleanFaces(raw: unknown): Faces | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Faces = {};
  for (const [k, v] of Object.entries(raw).slice(0, 200)) if (k.length <= 80 && typeof v === 'string' && (v === 'card' || /^\d{9}$/.test(v) || (v.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(v)))) out[k] = v;
  return out;
}

// faces: bảng miniface của chủ đội hình (xem đội người khác); không có thì dùng lựa chọn của người chơi đang xem.
export function faceOf(p: Pick<Player, 'id' | 'name' | 'nation' | 'cardFace' | 'image'>, faces?: Faces): { src: string; portrait: boolean } {
  const pick = (faces ?? chosen)[personKey(p)];
  const card = { src: p.cardFace || p.image || asset('/assets/silhouette.svg'), portrait: false };
  if (pick === 'card') return card;
  if (pick && (persons[personKey(p)]?.includes(pick) || customOf[personKey(p)]?.includes(pick) || cards[String(p.id)] === pick)) return { src: url(pick), portrait: true };
  const portrait = portraitOf(p.id);
  return portrait ? { src: portrait, portrait: true } : card;
}
// Thay người trên ảnh thẻ theo miniface đã chọn (card-swap.ts). Hình người cũ trên thẻ lấy từ:
//  - chân dung tự gán cùng mùa (đúng ảnh in trên thẻ), đặt theo vị trí của mùa (portrait-frames.json) → old;
//  - không có: mặt nạ người tách sẵn của thẻ (portrait-masks.json, ảnh portraits/masks/<id>.webp) → mask, kèm ô đặt miniface riêng.
// tf: ô đặt miniface mới [cạnh / cao, x / rộng, y / cao].
const frameTf = (frameData as { tiers: Record<string, number[]> }).tiers;
const maskTf = (maskData as { cards: Record<string, number[]> }).cards;
// blank: khung trống của mùa (portrait-blank.json, ảnh portraits/blank/<mùa>.webp) — thay cả vùng người bằng nền thật, miniface đặt theo
// box [cạnh / cao, tâm x / rộng, đáy y / cao] và chỉ hiện trong vùng alpha của khung (không đè thông tin, không tràn viền).
const blankOf = (blankData as { tiers: Record<string, { box: number[] }> }).tiers;
// zone: vùng an toàn của mùa (portrait-zones.json) — không xoá / đặt miniface lên thông tin in trên thẻ, không tràn viền.
const zoneOf = (zoneData as { tiers: Record<string, { level: number[]; info: number[]; cut: number; inset: number }> }).tiers;
const NO_CARD_SWAP = new Set<string>(['tsubasa']);
export type CardSwap = { key: string; old?: string; mask?: string; blank?: string; box?: [number, number, number]; zone?: { level: number[]; info: number[]; cut: number; inset: number }; next: string; tf: [number, number, number]; soft: boolean };
export function cardSwapOf(p: Pick<Player, 'id' | 'name' | 'nation' | 'tier' | 'cardFace'>): CardSwap | null {
  const key = personKey(p), pick = chosen[key], own = cards[String(p.id)];
  // Mùa không đổi người trên thẻ (người dùng muốn giữ nguyên ảnh thẻ, 2026-11-16): miniface vẫn đổi ở sân / danh sách.
  if (NO_CARD_SWAP.has(p.tier)) return null;
  if (!pick || pick === 'card' || !p.cardFace) return null;
  if (!(persons[key]?.includes(pick) || customOf[key]?.includes(pick) || own === pick)) return null;
  const tf = frameTf[p.tier], sameSeason = !!own && !!tf && codes[own.slice(0, 3)] === p.tier;
  const base = { key: `${p.id}|${pick}`, next: url(pick), soft: isCustomMiniface(pick), zone: zoneOf[p.tier] };
  if (sameSeason && pick === own) return null;
  const b = blankOf[p.tier];
  if (b) return { ...base, blank: asset(`/assets/portraits/blank/${p.tier}.webp`), box: [b.box[0], b.box[1], b.box[2]], tf: [0, 0, 0] };
  if (sameSeason) return { ...base, old: url(own), tf: [tf[0], tf[1], tf[2]] };
  const m = maskTf[String(p.id)];
  return m ? { ...base, mask: asset(`/assets/portraits/masks/${p.id}.webp`), tf: [m[0], m[1], m[2]] } : null;
}
