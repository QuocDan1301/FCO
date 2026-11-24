import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Lock, Users } from 'lucide-react';
import { getPlayer } from './game';
import type { Outfit, Player, Save, TeamKit, Tier } from './game';
import { BOOTS, GEAR, GK_KITS, OUTFIT_ROWS, TEAM_KITS, jerseyNumbers, lockerMembers, outfitOf, saveOutfits, teamKitOf } from './locker';
import type { Member, OutfitRow } from './locker';
import { positionGroup } from './squad';
import { faceOf, minifaceOptions } from './portraits';
import { asset } from './asset';
import './locker.css';

// Phòng thay đồ (2026-11-24): chọn trang phục, số áo, ảnh từng cầu thủ của bộ đội hình đang dùng và thiết lập chung của đội.
// Chỉ để hiển thị: không đổi chỉ số, lương hay kết quả trận. Thay đổi trang phục chờ bấm Lưu; ảnh (miniface) đổi ngay như ở Thông tin cầu thủ.
type Props = {
  // Tên hiệu ứng avatar (Premium / Luxury): nền tím của bảng loang theo màu hiệu ứng đó như thanh trên (người dùng 2026-11-24); không truyền = màu tím mặc định.
  effect?: string;
  save: Save;
  onUpdate: (update: (state: Save) => Save) => void;
  onExit: () => void;
  onManage: () => void;
  seasonShort: (tier: Tier) => string;
  minifaceOf: (player: Player) => string | null;
  onMiniface: (player: Player, value: string | null) => void;
};
type Filter = 'all' | 'start' | 'sub' | 'reserve';
type Sub = 'shirt' | 'shorts' | 'boots' | 'number' | 'photo';
const FILTERS: [Filter, string][] = [['all', 'Tất cả'], ['start', 'Đá chính'], ['sub', 'Thay thế'], ['reserve', 'Dự bị']];
// Tab chưa mở (người dùng 2026-11-24): Quần và Giày bị khóa, bấm không được.
const LOCKED_SUBS: Sub[] = ['shorts', 'boots'];
const SUBS: [Sub, string][] = [['shirt', 'Áo'], ['shorts', 'Quần'], ['boots', 'Giày'], ['number', 'Số áo'], ['photo', 'Ảnh']];
const KIT_TONES = [{ main: '#6d28d9', text: '#ffffff' }, { main: '#f2f4f7', text: '#1b2230' }, { main: '#0f766e', text: '#ffffff' }];
const GK_TONES = [null, { main: '#16191e', text: '#ffffff' }, { main: '#16a34a', text: '#ffffff' }, { main: '#eab308', text: '#1b2230' }, { main: '#ec4899', text: '#ffffff' }];
const cycle = (i: number, n: number, d: number) => (i + d + n) % n;

// Hình minh hoạ tự vẽ cho thiết bị bảo vệ: cẳng tay + nắm tay, phần băng màu trắng.
// Ảnh thật của người dùng gửi (2026-11-24) thay hình vẽ: đủ 7 ô theo thứ tự GEAR: Không sử dụng, Băng, Băng mồ hôi, Găng tay, Băng ngón tay, Băng quấn dài, Dây cao su (public/assets/locker/gear-<số>.webp).
const GEAR_PHOTOS: Record<number, string> = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, asset(`/assets/locker/gear-${i}.webp`)]));
function GearArt({ kind }: { kind: number }) {
  if (GEAR_PHOTOS[kind]) return <img className="lk-photo" src={GEAR_PHOTOS[kind]} alt="" loading="lazy"/>;
  return <svg viewBox="0 0 100 100" aria-hidden="true">
    <rect x="36" y="-4" width="28" height="64" rx="10" fill="#d3a07a"/>
    <rect x="27" y="54" width="46" height="38" rx="14" fill={kind === 3 ? '#f4f6f8' : '#c99470'}/>
    {kind === 1 && <rect x="27" y="56" width="46" height="22" rx="6" fill="#f4f6f8"/>}
    {kind === 2 && <rect x="33" y="40" width="34" height="16" rx="4" fill="#f4f6f8"/>}
    {kind === 3 && <path d="M30 62h40M30 70h40" stroke="#cfd5dd" strokeWidth="2"/>}
    {kind === 4 && <><rect x="31" y="78" width="9" height="12" rx="3" fill="#f4f6f8"/><rect x="45" y="78" width="9" height="12" rx="3" fill="#f4f6f8"/></>}
    {kind === 5 && <rect x="34" y="14" width="32" height="44" rx="6" fill="#f4f6f8"/>}
    {kind === 6 && <rect x="35" y="49" width="30" height="4" rx="2" fill="#2a2f36"/>}
  </svg>;
}
function BootArt({ color, accent }: { color: string; accent: string }) {
  return <svg viewBox="0 0 100 60" aria-hidden="true">
    <path d="M8 18c10 0 18-4 24-12h12c2 10 10 16 24 18 14 2 24 8 26 18v6H8z" fill={color} stroke="#0006" strokeWidth="1.5"/>
    <path d="M40 26l34 6" stroke={accent} strokeWidth="4" strokeLinecap="round"/>
    <rect x="8" y="48" width="86" height="6" rx="2" fill={accent} opacity=".85"/>
  </svg>;
}

function OptionRow({ label, value, onPrev, onNext }: { label: string; value: string; onPrev: () => void; onNext: () => void }) {
  return <div className="lk-row">
    <span>{label}</span>
    <button type="button" onClick={onPrev} aria-label={`${label}: lựa chọn trước`}><ChevronLeft size={20} strokeWidth={3}/></button>
    <b>{value}</b>
    <button type="button" onClick={onNext} aria-label={`${label}: lựa chọn sau`}><ChevronRight size={20} strokeWidth={3}/></button>
  </div>;
}

export default function LockerRoom({ effect, save, onUpdate, onExit, onManage, seasonShort, minifaceOf, onMiniface }: Props) {
  const members = useMemo(() => lockerMembers(save), [save]);
  const [tab, setTab] = useState<'player' | 'team'>('player');
  const [sub, setSub] = useState<Sub>('shirt');
  const [filter, setFilter] = useState<Filter>('all');
  const [uid, setUid] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Outfit>>({});
  const [teamDraft, setTeamDraft] = useState<TeamKit>({});
  const [error, setError] = useState('');

  const list = members.filter(m => filter === 'all' || m.group === filter);
  const current: Member | undefined = list.find(m => m.card.uid === uid) ?? list[0];
  const merged = useMemo(() => Object.fromEntries(Object.entries(drafts).map(([k, v]) => [k, { ...outfitOf(save, k), ...v }])), [drafts, save]);
  const numbers = useMemo(() => jerseyNumbers(save, members, merged), [save, members, merged]);
  const team = { ...teamKitOf(save), ...teamDraft };
  const dirty = Object.keys(drafts).length > 0 || Object.keys(teamDraft).length > 0;

  if (!members.length) return <section className="workspace locker-workspace is-empty">
    <div className="lk-empty"><p>Bộ đội hình đang dùng chưa có cầu thủ. Đăng kí cầu thủ và xếp đội hình trước khi vào phòng thay đồ.</p><button type="button" onClick={onManage}><Users size={16}/>Đăng kí cầu thủ</button></div>
  </section>;

  const card = current!.card, p = getPlayer(card), outfit: Outfit = { ...outfitOf(save, card.uid), ...drafts[card.uid] };
  const setField = (key: keyof Outfit, value: number) => { setError(''); setDrafts(d => ({ ...d, [card.uid]: { ...d[card.uid], [key]: value } })); };
  const setTeam = (key: keyof TeamKit, value: number | string) => { setError(''); setTeamDraft(t => ({ ...t, [key]: value })); };
  const row = (key: OutfitRow) => { const { label, options } = OUTFIT_ROWS[key], v = outfit[key] ?? 0; return <OptionRow key={key} label={label} value={options[v] ?? options[0]} onPrev={() => setField(key, cycle(v, options.length, -1))} onNext={() => setField(key, cycle(v, options.length, 1))}/>; };
  const step = (d: number) => { const i = list.findIndex(m => m.card.uid === card.uid); setUid(list[cycle(i, list.length, d)].card.uid); };
  const number = numbers.get(card.uid);
  const takenBy = new Map([...numbers].filter(([u]) => u !== card.uid).map(([u, n]) => [n, u]));
  const starters = members.filter(m => m.group === 'start');
  const captainIdx = Math.max(0, starters.findIndex(m => m.card.uid === team.captain));
  const kitTone = p.pos === 'GK' && team.gk ? GK_TONES[team.gk]! : KIT_TONES[team.kit ?? 0];
  const face = faceOf(p);
  const commit = () => {
    try { saveOutfits(save, drafts, teamDraft); } catch (e) { setError((e as Error).message); return; }
    onUpdate(s => saveOutfits(s, drafts, teamDraft)); setDrafts({}); setTeamDraft({}); setError('');
  };
  const cancel = () => { setDrafts({}); setTeamDraft({}); setError(''); };
  const tiles = (items: { key: string; label: string; art: ReactNode; on: boolean; pick: () => void; plain?: boolean }[]) =>
    <div className="lk-tiles">{items.map(t => <button key={t.key} type="button" className={t.on ? 'is-on' : ''} aria-pressed={t.on} onClick={t.pick}><span className={`lk-tile-art${t.plain ? ' is-plain' : ''}`}>{t.art}</span><span>{t.label}</span></button>)}</div>;

  let body: ReactNode;
  if (tab === 'team') body = <>
    <OptionRow label="Bộ áo thi đấu" value={TEAM_KITS[team.kit ?? 0]} onPrev={() => setTeam('kit', cycle(team.kit ?? 0, TEAM_KITS.length, -1))} onNext={() => setTeam('kit', cycle(team.kit ?? 0, TEAM_KITS.length, 1))}/>
    <OptionRow label="Áo thủ môn" value={GK_KITS[team.gk ?? 0]} onPrev={() => setTeam('gk', cycle(team.gk ?? 0, GK_KITS.length, -1))} onNext={() => setTeam('gk', cycle(team.gk ?? 0, GK_KITS.length, 1))}/>
    {starters.length > 0 && <OptionRow label="Đội trưởng" value={getPlayer(starters[captainIdx].card).name} onPrev={() => setTeam('captain', starters[cycle(captainIdx, starters.length, -1)].card.uid)} onNext={() => setTeam('captain', starters[cycle(captainIdx, starters.length, 1)].card.uid)}/>}
    <h3 className="lk-title">Danh sách số áo</h3>
    <ol className="lk-roster">{members.map(m => { const mp = getPlayer(m.card); return <li key={m.card.uid}><b>{numbers.get(m.card.uid) ?? '—'}</b><i className={`pos-${positionGroup(m.role || mp.pos)}`}>{m.role ? m.label : mp.pos}</i><span>{mp.name}</span>{m.card.uid === team.captain && <em>C</em>}</li>; })}</ol>
  </>;
  else if (sub === 'shirt') body = <>
    {row('style')}{row('fit')}{row('sleeve')}
    <h3 className="lk-title">Thiết bị bảo vệ</h3>
    {tiles(GEAR.map((label, i) => ({ key: label, label, art: <GearArt kind={i}/>, on: (outfit.gear ?? 0) === i, pick: () => setField('gear', i) })))}
  </>;
  else if (sub === 'shorts') body = <>{row('shorts')}{row('under')}{row('underColor')}</>;
  else if (sub === 'boots') body = <>
    {row('socks')}{row('tape')}
    <h3 className="lk-title">Giày</h3>
    {tiles(BOOTS.map((b, i) => ({ key: b.name, label: b.name, art: <BootArt color={b.color} accent={b.accent}/>, on: (outfit.boot ?? 0) === i, pick: () => setField('boot', i) })))}
  </>;
  else if (sub === 'number') body = <>
    {/* Lưới 4 cột kiểu FC Online (người dùng 2026-11-24): mỗi ô là một chiếc áo có số; áo trắng = còn trống, áo xám = cầu thủ khác đang dùng (hiện mùa + tên bên dưới), áo xanh = số đang chọn của cầu thủ này (ô sáng + dấu tích). */}
    <div className="lk-shirts">{Array.from({ length: 99 }, (_, i) => i + 1).map(n => {
      const ownerUid = takenBy.get(n), owner = ownerUid ? members.find(m => m.card.uid === ownerUid) : undefined, mine = n === number, taken = !!owner;
      const op = owner ?? (mine ? current : undefined), pl = op ? getPlayer(op.card) : null;
      return <button key={n} type="button" className={`lk-shirt${mine ? ' is-on' : taken ? ' is-taken' : ''}`} disabled={taken} aria-pressed={mine} aria-label={taken ? `Số ${n}, ${pl!.name} đang dùng` : `Số ${n}`} onClick={() => setField('number', n)}>
        {mine && <b className="lk-shirt-check" aria-hidden="true"><Check size={13} strokeWidth={4}/></b>}
        <svg viewBox="0 0 100 92" aria-hidden="true"><path d="M30 6 18 10 2 30l16 12 8-8v52h48V34l8 8 16-12L82 10 70 6c-2 8-9 12-20 12S32 14 30 6z"/><text x="50" y="62" textAnchor="middle">{n}</text></svg>
        {pl && <span className="lk-shirt-name"><b className={`squad-season season-tag-${pl.tier}`}>{seasonShort(pl.tier)}</b>{pl.name}</span>}
      </button>;
    })}</div>
  </>;
  else body = <>
    <p className="lk-note">Ảnh đổi ngay, dùng cho mini face ở đội hình và danh sách cầu thủ.</p>
    {tiles([{ value: null as string | null, src: faceOf(p, {}).src, label: 'Mặc định' }, ...minifaceOptions(p)].map(o => ({ key: o.value ?? 'default', label: o.label, art: <img src={o.src} alt="" loading="lazy"/>, plain: true, on: (minifaceOf(p) ?? null) === o.value, pick: () => onMiniface(p, o.value) })))}
  </>;

  return <section className="workspace locker-workspace" aria-labelledby="locker-title">
    <h1 id="locker-title" className="sr-only">Phòng thay đồ</h1>
    <div className={`lk-panel${effect ? ` fx-bar fx-${effect}` : ''}`}>
      <div className="lk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'player'} className={tab === 'player' ? 'is-on' : ''} onClick={() => setTab('player')}>Cầu thủ</button>
        {/* Tab Đội bị khóa (người dùng 2026-11-24): chưa mở. */}
        <button type="button" role="tab" aria-selected={false} className="is-locked" disabled title="Sắp ra mắt">Đội<Lock size={14} strokeWidth={2.6}/></button>
      </div>
      {tab === 'player' && <>
        <div className="lk-picker">
          <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setUid(null); }} aria-label="Nhóm cầu thủ">{FILTERS.map(([v, l]) => <option key={v} value={v} disabled={v !== 'all' && !members.some(m => m.group === v)}>{l}</option>)}</select>
          <button type="button" className="lk-step" onClick={() => step(-1)} aria-label="Cầu thủ trước"><ChevronLeft size={22} strokeWidth={3}/></button>
          <span className={`lk-pos pos-${positionGroup(current!.role || p.pos)}`}>{current!.role ? current!.label : p.pos}</span>
          <span className={`lk-face${face.portrait ? ' is-portrait' : ''}`}><img src={face.src} alt=""/></span>
          <span className="lk-name"><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></span>
          <span className="lk-num">{number ?? '—'}</span>
          <button type="button" className="lk-step" onClick={() => step(1)} aria-label="Cầu thủ sau"><ChevronRight size={22} strokeWidth={3}/></button>
        </div>
        <div className="lk-subtabs" role="tablist">{SUBS.map(([v, l]) => LOCKED_SUBS.includes(v)
          ? <button key={v} type="button" role="tab" aria-selected={false} className="is-locked" disabled title="Sắp ra mắt">{l}<Lock size={13} strokeWidth={2.6}/></button>
          : <button key={v} type="button" role="tab" aria-selected={sub === v} className={sub === v ? 'is-on' : ''} onClick={() => setSub(v)}>{l}</button>)}</div>
      </>}
      <div className="lk-body">{body}</div>
    </div>

    <div className="lk-stage" style={{ '--kit': kitTone.main, '--kit-text': kitTone.text } as CSSProperties}>
      <span className="lk-stage-num" aria-hidden="true">{number ?? ''}</span>
      <img className={`lk-stage-img${face.portrait ? ' is-portrait' : ''}`} src={face.src} alt={p.name}/>
      {error && <p className="lk-error" role="alert">{error}</p>}
      <div className="lk-actions">
        <button type="button" onClick={cancel} disabled={!dirty}>Hủy</button>
        <button type="button" className="is-save" onClick={commit} disabled={!dirty}>Lưu<Check size={18} strokeWidth={3}/></button>
      </div>
    </div>
  </section>;
}
