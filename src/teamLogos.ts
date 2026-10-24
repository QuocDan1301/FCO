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
  // Thẻ NO.7 có huy hiệu số 7 và thẻ PRIME / MEDALIST in logo riêng ở góc dưới phải dùng logo riêng ghi trên thẻ.
  if ((player.tier === 'origin' || player.tier === 'prm' || player.tier === 'mdl' || player.tier === 'amb') && player.teamLogo) return player.teamLogo;
  // Mùa PRIME và các mùa còn lại dùng logo CLB riêng; thẻ đội tuyển Việt Nam dùng logo đội tuyển của mùa VIETNAM.
  const logo = logos[player.club];
  if (logo) return asset(logo);
  return player.club === 'Việt Nam' ? asset('/assets/vietnam-team.webp') : undefined;
}
