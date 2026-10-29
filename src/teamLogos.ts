import { asset } from './asset';
import type { Player } from './game';
import clubLogos from './clubLogos.json';

const logos: Readonly<Record<string, string>> = clubLogos;

export function getTeamLogo(player: Pick<Player, 'tier' | 'club' | 'teamLogo'>): string | undefined {
  if (player.tier === 'eternal') return asset('/assets/itm-team.webp');
  // Mọi thẻ INFINITE PRIME dùng chung một logo đội.
  if (player.tier === 'prime') return asset('/assets/prime-team.webp');
  // Mùa VIETNAM: logo ngôi sao lục giác vừa là logo mùa vừa là logo đội tuyển Việt Nam.
  if (player.tier === 'vietnam') return asset('/assets/vietnam-team.webp');
  // Mùa WG: mọi thẻ in logo mùa (khiên ngôi sao) ở góc dưới phải.
  if (player.tier === 'wg') return asset('/assets/wg-team.webp');
  // Thẻ NO.7 có huy hiệu số 7 và thẻ PRIME / MEDALIST in logo riêng ở góc dưới phải dùng logo riêng ghi trên thẻ.
  if ((player.tier === 'origin' || player.tier === 'prm' || player.tier === 'mdl' || player.tier === 'amb' || player.tier === 'uc' || player.tier === 'ut' || player.tier === 'cu' || player.tier === 'gru' || player.tier === 'rtn' || player.tier === 'dc' || player.tier === 'cc' || player.tier === 'bld' || player.tier === 'wb' || player.tier === 'spt' || player.tier === 'bdo' || player.tier === 'hw23' || player.tier === 'ep24' || player.tier === 'ptg' || player.tier === 'le' || player.tier === 'hg' || player.tier === 'spl' || player.tier === 'ln' || player.tier === 'fa' || player.tier === 'lol' || player.tier === 'cap' || player.tier === 'boe21' || player.tier === 'btb' || player.tier === 'ebs' || player.tier === 'juventus' || player.tier === 'jnm') && player.teamLogo) return player.teamLogo;
  // Mùa PRIME và các mùa còn lại dùng logo CLB riêng; thẻ đội tuyển Việt Nam dùng logo đội tuyển của mùa VIETNAM.
  const logo = logos[player.club];
  if (logo) return asset(logo);
  return player.club === 'Việt Nam' ? asset('/assets/vietnam-team.webp') : undefined;
}
