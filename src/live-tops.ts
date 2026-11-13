// Dòng LIVE khi không có tin chúc mừng nào (người dùng yêu cầu 2026-11-12): lần lượt Top 1, 2, 3 của từng mục BXH
// (Đập thẻ OVR cao nhất → Giá trị đội hình → Penalty → GLXH). Hàm thuần để test được.
import type { Leaderboard } from './wallet-state';
import type { RankedTop } from './ranked';
import type { TickerMessage } from './LiveTicker';
import { money } from './game';

const MEDALS = ['🥇', '🥈', '🥉'];
// Giá trị đội hình rút gọn như cả game (M = triệu, B = tỉ); điểm GLXH ghi đủ.
const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

// Mỗi dòng kèm tên + hiệu ứng tên Premium của HLV (dòng LIVE tô hiệu ứng lên tên).
// playerOf: tên cầu thủ + mùa (ký hiệu ngắn như BXH) của thẻ kỷ lục; mục Đập thẻ OVR ghi "Tên · mùa X · +cấp · OVR n".
export type LivePlayer = { name: string; season?: string };
export function liveTopMessages(board: Leaderboard | null, ranked: RankedTop[] | null, playerOf: (playerId: number) => LivePlayer | undefined = () => undefined): TickerMessage[] {
  const out: TickerMessage[] = [];
  const add = (title: string, rows: { name: string; text: string; effect?: string | null }[]) => rows.slice(0, 3).forEach((r, i) => out.push({ text: `${MEDALS[i]} Top ${i + 1} ${title}: HLV ${r.name} · ${r.text}`, name: r.name, effect: r.effect ?? null }));
  add('Đập thẻ OVR cao nhất', (board?.ovr ?? []).filter(r => r.ovr > 0).map(r => {
    const player = r.playerId ? playerOf(r.playerId) : undefined;
    const parts = [player?.name, player?.season ? `mùa ${player.season}` : undefined, r.level ? `+${r.level}` : undefined, `OVR ${r.ovr}`].filter(Boolean);
    return { name: r.name, effect: r.effect, text: parts.join(' · ') };
  }));
  add('Giá trị đội hình', (board?.squad ?? []).filter(r => r.value > 0).map(r => ({ name: r.name, effect: r.effect, text: `${money(r.value)} BP` })));
  add('Penalty', (board?.penalty ?? []).filter(r => r.goals > 0).map(r => ({ name: r.name, effect: r.effect, text: `chuỗi ${r.goals}` })));
  add('GLXH', (ranked ?? []).map(r => ({ name: r.name, effect: r.effect, text: `${fmt(r.points)} điểm` })));
  return out;
}
