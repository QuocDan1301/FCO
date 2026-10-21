import { asset } from './asset';
import type { Player } from './game';
import clubLogos from './clubLogos.json';

const logos: Readonly<Record<string, string>> = clubLogos;

export function getTeamLogo(player: Pick<Player, 'tier' | 'club'>): string | undefined {
  if (player.tier === 'eternal') return asset('/assets/itm-team.png');
  const logo = logos[player.club];
  return logo ? asset(logo) : undefined;
}
