export type ClassificationFacts = {
  weakFoot?: number; outsideFootShot?: boolean;
  heightCm?: number; bodyType?: 'average' | 'stocky' | 'lean';
  fast?: boolean; slow?: boolean; agile?: boolean; highBalance?: boolean; contestedPosition?: boolean;
  physical?: 'good' | 'neutral' | 'bad';
  teamColorTier?: 1 | 2 | 3;
  ai?: 'good' | 'neutral' | 'bad';
  source?: string;
};
type Candidate = { name: string; pos: string; club: string; flag: string };
type Verdict = 'good' | 'neutral' | 'bad' | 'unknown';
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const tier1Clubs = new Set(['madrid', 'real madrid', 'manchester đỏ', 'manchester united', 'mu', 'chelsea', 'ac milan', 'bayern', 'bayern munich'].map(normalize));
const tier2Clubs = new Set(['liverpool', 'arsenal', 'barcelona', 'barca', 'inter', 'inter milan', 'manchester xanh', 'manchester city', 'man city', 'juventus'].map(normalize));
const tier1Nations = new Set(['FR', 'GB-ENG', 'ENG', 'PT', 'BR', 'NL']);
const tier2Nations = new Set(['DE', 'IT', 'ES', 'AR']);
// Danh sách AI do người dùng cung cấp; không tự suy rộng từ danh tiếng cầu thủ khác.
const metaNames = ['gullit', 'ronaldo', 'mbappe', 'bellingham', 'vieira', 'maldini', 'zidane', 'son', 'henry', 'courtois', 'ballack', 'shevchenko'];
export function classifyPlayer(player: Candidate, facts: ClassificationFacts = {}) {
  if (facts.weakFoot !== undefined && (!Number.isInteger(facts.weakFoot) || facts.weakFoot < 1 || facts.weakFoot > 5)) throw new Error('Chân không thuận không hợp lệ.');
  if (facts.heightCm !== undefined && (!Number.isFinite(facts.heightCm) || facts.heightCm < 100 || facts.heightCm > 250)) throw new Error('Chiều cao không hợp lệ.');
  let foot: Verdict = 'unknown';
  if (facts.weakFoot !== undefined) {
    foot = facts.weakFoot >= 4 ? 'good' : ['CB', 'GK'].includes(player.pos) || facts.outsideFootShot === true ? 'neutral' : facts.outsideFootShot === false ? 'bad' : 'unknown';
  }
  let physical: Verdict = facts.physical ?? 'unknown';
  if (player.pos === 'GK' && facts.heightCm !== undefined) physical = facts.heightCm >= 192 ? 'good' : facts.heightCm < 188 ? 'bad' : 'neutral';
  else if (!facts.physical) {
    if (facts.slow === true || facts.bodyType === 'lean' && facts.contestedPosition === true) physical = 'bad';
    else if (facts.heightCm !== undefined && facts.heightCm >= 185 && ['average', 'stocky'].includes(facts.bodyType ?? '') && facts.fast === true || facts.agile === true && facts.highBalance === true) physical = 'good';
  }
  const club = normalize(player.club);
  const inferredTier = tier1Clubs.has(club) || tier1Nations.has(player.flag) ? 1 : tier2Clubs.has(club) || tier2Nations.has(player.flag) ? 2 : undefined;
  const tier = facts.teamColorTier ?? inferredTier;
  const team: Verdict = tier === 1 ? 'good' : tier === 2 ? 'neutral' : tier === 3 ? 'bad' : 'unknown';
  const words = normalize(player.name).replace(/[^a-z0-9 ]/g, '').split(/\s+/);
  const ai: Verdict = facts.ai ?? (metaNames.some(name => words.includes(name)) ? 'good' : 'unknown');
  const criteria = { foot, physical, team, ai };
  const positives = Object.values(criteria).filter(value => value === 'good').length;
  const negatives = Object.values(criteria).filter(value => value === 'bad').length;
  const guaranteedMeta = facts.weakFoot === 5 && tier === 1;
  const group: 1 | 2 | 3 = guaranteedMeta || positives >= 3 ? 1 : negatives >= 2 ? 3 : 2;
  const missing = Object.entries(criteria).filter(([, value]) => value === 'unknown').map(([key]) => key);
  return { group, positives, negatives, criteria, missing, provisional: group === 2 && missing.length > 0 };
}
