import { useEffect, useState } from 'react';
import { ovrStyle } from './ovr-color';
import type { CSSProperties } from 'react';
import { Shield } from 'lucide-react';
import { getPlayer, players } from './game';
import type { Card, Tier } from './game';
import { seasonShort } from './badges';
import { asset } from './asset';
import { FORMATIONS, DEFAULT_FORMATION, positionGroup } from './squad';
import { PITCH_ART, Face as LineupFace, Wage, depth, project } from './LineupBoard';
import './lineup.css';
import { clubLogoUrl } from './club-logo';
import { nameEffectClass, isNameEffect } from './name-effects';
import { RANKED_INTRO_PREVIEW } from './ranked';
import { cleanFaces, faceOf } from './portraits';
import type { Faces } from './portraits';
import type { RankedMatch } from './ranked';

// Sơ đồ hai đội trước trận GLXH (người dùng 2026-11-16): trái đội mình, phải đối thủ, mỗi cầu thủ có ảnh, vị trí, tên, OVR · cấp;
// thanh tải RANKED_INTRO_PREVIEW giây rồi vào trận. "Đang tìm đối thủ" / "Đã tìm thấy" hiện ngay trên nút Tìm trận (RankedPage).
// portrait: ảnh chân dung không nền (hiện nguyên người như màn Đội hình); false = ảnh thẻ, cắt tròn.
type SheetPlayer = { role: string; x: number; y: number; name: string; ovr: number; tier?: Tier; level?: number; face?: string; portrait?: boolean; pid?: number };
// faces: miniface của chủ đội hình (đối thủ) để vẽ ảnh mặt trên sân giống màn Đội hình.
export type Sheet = { name: string; formation: string; ovr: number; club?: string | null; effect?: string | null; side: 'me' | 'opp'; players: SheetPlayer[]; faces?: Faces };

const knownPlayers = new Set(players.map(p => p.id));
const SILHOUETTE = '/assets/silhouette.svg';
const roleLine = (role: string) => role === 'GK' ? 'gk' : /B$/.test(role) ? 'df' : /M/.test(role) ? 'mf' : 'fw';
const playerOf = (pid: number | null | undefined) => pid && knownPlayers.has(pid) ? getPlayer({ playerId: pid }) : null;

const faceFields = (p: ReturnType<typeof playerOf>, faces?: Faces) => { if (!p) return {}; const f = faceOf(p, faces); return { face: f.src, portrait: f.portrait, pid: p.id }; };

export function sheetsOf(match: RankedMatch, names: Map<string, string>, info: Map<string, { tier: Tier; level: number; pid?: number } | null>): [Sheet, Sheet] {
  const myBase = FORMATIONS[match.me.formation] ?? FORMATIONS[DEFAULT_FORMATION];
  const oppBase = FORMATIONS[match.opp.formation ?? ''] ?? FORMATIONS['4-3-3'] ?? FORMATIONS[DEFAULT_FORMATION];
  const me: Sheet = { name: 'Đội bạn', formation: match.me.formation, ovr: match.me.ovr, club: match.me.club, effect: match.me.effect, side: 'me',
    players: match.me.slots.map((s, i) => { const m = s.uid ? info.get(s.uid) : null, p = playerOf(m?.pid);
      return { role: s.role, x: s.x ?? myBase[i]?.x ?? 50, y: s.y ?? myBase[i]?.y ?? 50, name: (s.uid && names.get(s.uid)) || p?.name || s.role, ovr: s.ovr,
        tier: m?.tier, level: m?.level, ...faceFields(p) }; }) };
  const oppFaces = match.opp.bot ? undefined : cleanFaces(match.opp.faces) ?? {};
  const opp: Sheet = { faces: oppFaces, name: match.opp.name + (match.opp.bot ? ' (máy)' : ''), formation: match.opp.formation ?? '4-3-3', ovr: match.opp.ovr, club: match.opp.club, effect: match.opp.effect, side: 'opp',
    players: match.opp.slots.map((s, i) => { const p = playerOf(s.pid);
      return { role: s.role, x: s.x ?? oppBase[i]?.x ?? 50, y: s.y ?? oppBase[i]?.y ?? 50, name: p?.name ?? (match.opp.bot ? 'Cầu thủ máy' : s.role), ovr: s.ovr,
        tier: p?.tier, level: s.lv, ...faceFields(p, oppFaces) }; }) };
  return [me, opp];
}

function Face({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return <img src={!src || failed ? asset(SILHOUETTE) : src} alt="" onError={() => setFailed(true)} className={!src || failed ? 'is-empty' : undefined}/>;
}

function TeamSheet({ sheet }: { sheet: Sheet }) {
  const logo = clubLogoUrl(sheet.club ?? null), fx = isNameEffect(sheet.effect) ? sheet.effect : null;
  return <section className={`rki-team is-${sheet.side}`} aria-label={`Đội hình ${sheet.name}`}>
    <header>
      {logo ? <img src={logo} alt=""/> : <Shield className="rki-shield"/>}
      <b className={nameEffectClass(fx).trim() || undefined}>{sheet.name}</b>
      <span>{sheet.formation}</span><em>OVR {sheet.ovr}</em>
    </header>
    {/* Sân + cầu thủ giống hệt màn Đội hình (LineupBoard / LineupViewer): chân dung không nền, lương, OVR, tên kèm nhãn mùa. */}
    <div className="lu-pitch rki-lu-pitch">
      {PITCH_ART}
      {sheet.players.map((p, k) => {
        const card: Card | null = p.pid ? { uid: `${sheet.side}${k}`, playerId: p.pid, level: p.level ?? 1, received: 0 } : null;
        const [left, top] = project(Math.min(96, Math.max(4, p.x)), Math.min(96, Math.max(4, p.y)));
        return <div key={k} className={`lu-token lv-token rki-token pos-${positionGroup(p.role)}`} style={{ left: `${left}%`, top: `${top}%`, '--k': depth(p.y), '--d': `${k * 45}ms` } as CSSProperties}
          aria-label={`${p.role}: ${p.name}, OVR ${p.ovr}${p.level ? `, cộng ${p.level}` : ''}`}>
          <span className="lu-token-top">{card && <Wage card={card}/>}{card ? <LineupFace card={card} className="lu-face" faces={sheet.faces}/> : <span className="lu-face lu-face-empty"/>}<strong>{p.ovr}</strong></span>
          <span className="lu-token-name">{p.tier && <b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b>}{p.name}</span>
        </div>;
      })}
    </div>
  </section>;
}

export default function RankedIntro({ match, sheets, onDone }: { match: RankedMatch; sheets: [Sheet, Sheet]; onDone: () => void }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(t); }, []);
  const done = Math.min(1, (now - start) / 1000 / RANKED_INTRO_PREVIEW), left = Math.max(0, RANKED_INTRO_PREVIEW - (now - start) / 1000);
  useEffect(() => { if (done >= 1) onDone(); }, [done, onDone]);
  return <div className="rki" role="dialog" aria-label="Sơ đồ hai đội trước trận GLXH">
    <div className="rki-preview">
      <TeamSheet sheet={sheets[0]}/>
      <div className="rki-mid">
        <span className="rki-vs-big">VS</span>
        <div className="rki-score"><b style={ovrStyle(match.me.ovr)}>{match.me.ovr}</b><small>OVR</small><b style={ovrStyle(match.opp.ovr)}>{match.opp.ovr}</b></div>
        {match.me.attack !== undefined && match.opp.attack !== undefined && <div className="rki-score is-sub"><b>{Math.round(match.me.attack)}</b><small>Tấn công</small><b>{Math.round(match.opp.attack)}</b></div>}
        {match.me.defense !== undefined && match.opp.defense !== undefined && <div className="rki-score is-sub"><b>{Math.round(match.me.defense)}</b><small>Phòng ngự</small><b>{Math.round(match.opp.defense)}</b></div>}
        <div className="rki-load" role="progressbar" aria-label="Đang vào trận" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}><i style={{ width: `${done * 100}%` }}/></div>
        <p className="rki-hint">Vào trận sau <b>{Math.ceil(left)}</b> giây</p>
      </div>
      <TeamSheet sheet={sheets[1]}/>
    </div>
  </div>;
}
