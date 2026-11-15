import { Shield } from 'lucide-react';
import { money, players } from './game';
import { playerClubs } from './squad';
import { clubLogo } from './teamLogos';
import { flagImageUrl } from './flags';
import SearchPicker, { normalizeSearch } from './SearchPicker';
import type { PickerOption } from './SearchPicker';

// Bộ lọc team color ở TTCN: gõ tên CLB / quốc gia (không cần dấu), chọn trong danh sách gợi ý có logo CLB / cờ.
// CLB tính cả CLB cũ (playerClubs, như cách tính team color ở squad.ts). Giá trị: '' | 'club:<tên>' | 'nation:<tên>'.
const collator = new Intl.Collator('vi');

let cache: { options: PickerOption[]; clubsOf: Map<number, readonly string[]> } | null = null;
function teamColorData() {
  if (cache) return cache;
  const clubs = new Map<string, number>(), nations = new Map<string, number>(), flagOf = new Map<string, string>(), clubsOf = new Map<number, readonly string[]>();
  for (const p of players) {
    const list = playerClubs(p); clubsOf.set(p.id, list);
    for (const c of list) clubs.set(c, (clubs.get(c) ?? 0) + 1);
    if (p.nation) { nations.set(p.nation, (nations.get(p.nation) ?? 0) + 1); if (p.flag && !flagOf.has(p.nation)) flagOf.set(p.nation, p.flag); }
  }
  const flag = (name: string) => { const code = flagOf.get(name); return code ? flagImageUrl(code) : undefined; };
  const groups = { club: <>Câu lạc bộ <small>(tính cả CLB cũ)</small></>, nation: <>Quốc gia</> };
  const build = (kind: 'club' | 'nation', m: Map<string, number>): PickerOption[] => [...m].sort((a, b) => collator.compare(a[0], b[0])).map(([name, count]) => {
    // CLB chưa có logo nhưng trùng tên đội tuyển (vd. thẻ ghi CLB "Việt Nam") thì dùng cờ.
    const src = kind === 'nation' ? flag(name) : clubLogo(name) ?? flag(name), isFlag = kind === 'nation' || !clubLogo(name);
    return {
      value: `${kind}:${name}`, label: name, key: normalizeSearch(name), hint: money(count), group: groups[kind], groupId: kind,
      icon: src ? <img className={`sp-icon${isFlag ? ' is-flag' : ''}`} src={src} alt="" loading="lazy"/> : <span className="sp-icon is-none" aria-hidden="true"><Shield size={14}/></span>,
    };
  });
  return cache = { options: [...build('club', clubs), ...build('nation', nations)], clubsOf };
}

export function matchesTeamColor(p: { id: number; nation?: string }, filter: string) {
  if (!filter) return true;
  const cut = filter.indexOf(':'), kind = filter.slice(0, cut), name = filter.slice(cut + 1);
  return kind === 'nation' ? p.nation === name : (teamColorData().clubsOf.get(p.id) ?? []).includes(name);
}

export default function TeamColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SearchPicker value={value} onChange={onChange} options={teamColorData().options} ariaLabel="Team color trên thị trường"
    placeholder="Gõ tên CLB / quốc gia…" listLabel="CLB / quốc gia" empty="Không tìm thấy CLB / quốc gia"/>;
}
