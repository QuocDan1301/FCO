// Mô phỏng toàn engine bắt cầu (nhóm B): đập liên tục cùng một cấp, trạng thái cầu tự biến đổi.
// Chạy: npx tsx scripts/simulate-bridge.ts [số lượt] [seed]
import { UPGRADE_LEVELS } from '../src/game';
import { emptyBridge, resolveUpgrade } from '../src/upgrade/engine';
import { HIDDEN_KINDS, HIDDEN_LABELS } from '../src/upgrade/hiddenPattern';
import { seededRng } from '../src/upgrade/rng';

const turns = Number(process.argv[2]) || 100_000, seed = Number(process.argv[3]) || 1;
const pct = (a: number, b: number) => b ? `${(a / b * 100).toFixed(2)}%` : '—';

for (const currentLevel of [5, 6, 7, 8, 9]) {
  const base = UPGRADE_LEVELS[currentLevel].chance, outcome = seededRng(seed * 7919 + currentLevel), pattern = seededRng(seed * 104729 + currentLevel);
  let bridge = emptyBridge(), wins = 0, sinceBonus = 0;
  const group = { none: { n: 0, w: 0 }, public: { n: 0, w: 0 }, hidden: { n: 0, w: 0 } };
  const kinds = Object.fromEntries(HIDDEN_KINDS.map(k => [k, { picked: 0, matched: 0 }]));
  const probes: number[] = [];
  for (let i = 0; i < turns; i++) {
    const r = resolveUpgrade(bridge, { currentLevel, baseRate: base, role: i % 2 ? 'main' : 'material' }, { outcome, pattern });
    bridge = r.bridge; if (r.success) wins++;
    const t = r.turn;
    if (t.hiddenKind) { kinds[t.hiddenKind].picked++; if (t.hiddenBonus) kinds[t.hiddenKind].matched++; }
    // Ngầm và công khai không cộng dồn: lượt có thưởng ngầm xếp vào nhóm ngầm.
    const key = t.hiddenBonus ? 'hidden' : t.publicBonus ? 'public' : 'none';
    group[key].n++; if (r.success) group[key].w++;
    if (t.bonus > 0) { probes.push(sinceBonus); sinceBonus = 0; } else sinceBonus++;
  }
  const bonusTurns = group.public.n + group.hidden.n, bonusWins = group.public.w + group.hidden.w;
  console.log(`\n+${currentLevel} → +${currentLevel + 1} · gốc ${base}% · ${turns.toLocaleString('vi-VN')} lượt`);
  console.log(`  Thành công toàn engine: ${pct(wins, turns)}`);
  console.log(`  Không có thưởng: ${group.none.n} lượt · thành công ${pct(group.none.w, group.none.n)} (kỳ vọng ${base}%)`);
  console.log(`  Khớp cầu công khai (không ngầm): ${group.public.n} lượt · thành công ${pct(group.public.w, group.public.n)}`);
  console.log(`  Khớp cầu ngầm: ${group.hidden.n} lượt · thành công ${pct(group.hidden.w, group.hidden.n)} (kỳ vọng ${Math.min(100, base + 30)}%)`);
  console.log(`  Cầu ngầm được chọn / khớp: ${HIDDEN_KINDS.map(k => `${HIDDEN_LABELS[k]} ${kinds[k].picked}/${kinds[k].matched}`).join(' · ')}`);
  console.log(`  Lượt mồi trung bình trước khi bắt được cầu: ${(probes.reduce((a, b) => a + b, 0) / Math.max(1, probes.length)).toFixed(2)}`);
  console.log(`  Khớp cầu nhưng thất bại: ${bonusTurns - bonusWins} · thưởng bị tiêu thụ không thành công: ${pct(bonusTurns - bonusWins, bonusTurns)}`);
}
