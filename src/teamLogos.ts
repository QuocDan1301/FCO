import { asset } from './asset';
import type { Player } from './game';
import clubLogos from './clubLogos.json';

const logos: Readonly<Record<string, string>> = clubLogos;

export function getTeamLogo(player: Pick<Player, 'tier' | 'club' | 'teamLogo'>): string | undefined {
  if (player.tier === 'eternal') return asset('/assets/itm-team.png');
  // Chỉ những thẻ NO.7 có huy hiệu số 7 trên khung mới dùng logo riêng.
  if (player.tier === 'origin' && player.teamLogo) return player.teamLogo;
  const logo = logos[player.club];
  return logo ? asset(logo) : undefined;
}
