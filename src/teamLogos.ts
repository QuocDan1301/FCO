import { asset } from './asset';
import type { Player } from './game';
import clubLogos from './clubLogos.json';

const logos: Readonly<Record<string, string>> = clubLogos;

// Logo của một CLB theo tên trong game (không phụ thuộc mùa thẻ); undefined nếu CLB chưa có logo.
export const clubLogo = (club: string) => logos[club] ? asset(logos[club]) : undefined;

export function getTeamLogo(player: Pick<Player, 'tier' | 'club' | 'teamLogo'>): string | undefined {
  if (player.tier === 'eternal') return asset('/assets/itm-team.webp');
  // Mọi thẻ INFINITE PRIME dùng chung một logo đội.
  if (player.tier === 'prime') return asset('/assets/prime-team.webp');
  // Mùa VIETNAM: logo ngôi sao lục giác vừa là logo mùa vừa là logo đội tuyển Việt Nam.
  if (player.tier === 'vietnam') return asset('/assets/vietnam-team.webp');
  // Mùa WG: mọi thẻ in logo mùa (khiên ngôi sao) ở góc dưới phải.
  if (player.tier === 'wg') return asset('/assets/wg-team.webp');
  // Thẻ NO.7 có huy hiệu số 7 và thẻ PRIME / MEDALIST in logo riêng ở góc dưới phải dùng logo riêng ghi trên thẻ.
  if ((player.tier === 'origin' || player.tier === 'prm' || player.tier === 'mdl' || player.tier === 'amb' || player.tier === 'uc' || player.tier === 'ut' || player.tier === 'cu' || player.tier === 'gru' || player.tier === 'rtn' || player.tier === 'dc' || player.tier === 'cc' || player.tier === 'bld' || player.tier === 'wb' || player.tier === 'spt' || player.tier === 'bdo' || player.tier === 'hw23' || player.tier === 'ep24' || player.tier === 'ptg' || player.tier === 'le' || player.tier === 'hg' || player.tier === 'spl' || player.tier === 'ln' || player.tier === 'fa' || player.tier === 'lol' || player.tier === 'cap' || player.tier === 'boe21' || player.tier === 'btb' || player.tier === 'ebs' || player.tier === 'juventus' || player.tier === 'jnm' || player.tier === 'hr25' || player.tier === 'hr24' || player.tier === 'chelsea' || player.tier === 'hr26' || player.tier === 'ld' || player.tier === 'ws' || player.tier === 'el' || player.tier === 'tsubasa' || player.tier === 'ch' || player.tier === 'naruto' || player.tier === 'dcb' || player.tier === 'live') && player.teamLogo) return player.teamLogo;
  // Mùa PRIME và các mùa còn lại dùng logo CLB riêng; thẻ đội tuyển Việt Nam dùng logo đội tuyển của mùa VIETNAM.
  const logo = logos[player.club];
  if (logo) return asset(logo);
  return player.club === 'Việt Nam' ? asset('/assets/vietnam-team.webp') : undefined;
}

// Logo góc trên khung Thông tin cầu thủ (2026-11-25): như logo góc thẻ (getTeamLogo), nhưng nhiều mùa dùng ảnh nhỏ cắt từ ảnh thẻ (<mùa>-<mã>-team, dính nền / mảnh cờ)
// nên ở khung lớn dùng logo CLB chính thức khi có; một số CLB trong game đặt tên khác với clubLogos.json.
const EMBLEM_ALIAS: Readonly<Record<string, string>> = {
  'Frankfurt': 'Eintracht Frankfurt', 'Athletic Bilbao': 'Athletic Club', 'Sporting CP': 'Sporting', 'Hellas Verona': 'Verona', 'Ipswich': 'Ipswich Town',
  'Mönchengladbach': 'Gladbach', 'Crvena Zvezda': 'Crvena zvezda', 'Newell’s Old Boys': "Newell's Old Boys", 'Charlotte': 'Charlotte FC',
};
const CARD_CROP = /\/[a-z0-9]+-\d+-team\.(?:webp|png)/;
export function emblemLogo(player: Pick<Player, 'tier' | 'club' | 'teamLogo'>): string | undefined {
  const logo = getTeamLogo(player);
  if (logo && CARD_CROP.test(logo)) return clubLogo(EMBLEM_ALIAS[player.club] ?? player.club) ?? logo;
  return logo;
}

