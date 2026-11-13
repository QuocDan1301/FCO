import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Shield, X } from 'lucide-react';
import { getPlayer, money, ovr } from './game';
import { seasonShort } from './badges';
import { playerPenalty, positionGroup, slotOvr } from './squad';
import { teamColorName } from './teamColor';
import { PITCH_ART, Face, Wage, depth, project } from './LineupBoard';
import { publicLineupState } from './public-lineup';
import type { LineupBoardId, PublicLineupView } from './public-lineup';
import { isNameEffect, nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import './lineup-viewer.css';

type Props = {
  board: LineupBoardId; rank: number; name: string;
  load: (board: LineupBoardId, rank: number) => Promise<PublicLineupView | null>;
  levelBadge: (level: number) => string;
  onClose: () => void;
};

// Xem đội hình đang dùng của một HLV trên BXH: sân + danh sách 11 cầu thủ, chỉ xem (không sửa được).
export default function LineupViewer({ board, rank, name, load, levelBadge, onClose }: Props) {
  const [view, setView] = useState<PublicLineupView | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    load(board, rank).then(v => { if (alive) setView(v); }).catch(e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [board, rank, load]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [onClose]);
  const team = useMemo(() => view?.lineup ? publicLineupState(view.lineup) : null, [view]);
  const buffs = useMemo(() => new Map((team?.summary.colors.players ?? []).map(r => [r.playerId, r] as const)), [team]);
  const title = view?.name ?? name, logo = clubLogoUrl(view?.club ?? null);
  const fx = view && isNameEffect(view.effect) ? nameEffectClass(view.effect).trim() : '';
  const filled = team ? team.cards.filter(Boolean).length : 0;
  const shown = (i: number) => { const card = team!.cards[i]!, role = team!.slots[i].role; return buffs.get(card.uid)?.finalOvr ?? slotOvr(card, role); };

  let body;
  if (error) body = <p className="lv-note is-error" role="alert">{error}</p>;
  else if (view === undefined) body = <p className="lv-note">Đang tải đội hình…</p>;
  else if (view === null) body = <p className="lv-note">Bảng xếp hạng vừa thay đổi, không còn HLV ở hạng này. Làm mới BXH rồi thử lại.</p>;
  else if (!team || !filled) body = <p className="lv-note">HLV này chưa xếp đội hình.</p>;
  else body = <>
    <div className="lv-colors" aria-label="Team color đang kích hoạt"><small>Team color</small>
      {team.summary.colors.active.length ? team.summary.colors.active.map(c => <span key={`${c.kind}-${c.key}`} className={`lu-color kind-${c.kind}`}>{teamColorName(c)}<i>{c.beneficiaries.length}</i><b>+{c.ovr}</b></span>)
        : <span className="lu-colors-none">Chưa kích hoạt</span>}
    </div>
    <div className="lv-main">
      <div className="lv-pitch-wrap">
        <div className="lu-pitch lv-pitch">
          {PITCH_ART}
          {team.slots.map((slot, i) => {
            const card = team.cards[i], p = card && getPlayer(card), [left, top] = project(slot.x, slot.y);
            return <div key={i} className={`lu-token lv-token pos-${positionGroup(slot.role)} ${card ? '' : 'is-empty'}`} style={{ left: `${left}%`, top: `${top}%`, '--k': depth(slot.y) } as CSSProperties}
              aria-label={card ? `${slot.label}: ${p!.name}, OVR ${shown(i)}` : `${slot.label}: trống`}>
              {card ? <>
                <span className="lu-token-top"><Wage card={card}/><Face card={card} className="lu-face"/><strong className={playerPenalty(p!, slot.role) ? 'is-off' : ''}>{shown(i)}</strong></span>
                <span className="lu-token-name"><b className={`squad-season season-tag-${p!.tier}`}>{seasonShort(p!.tier)}</b>{p!.name}</span>
              </> : <>
                <span className="lu-token-top"><span className="lu-face lu-face-empty"/></span>
                <span className="lu-token-name">{slot.label}</span>
              </>}
            </div>;
          })}
        </div>
      </div>
      <ol className="lv-list" aria-label="11 cầu thủ đá chính">
        {team.slots.map((slot, i) => {
          const card = team.cards[i], p = card && getPlayer(card);
          return <li key={i} className={card ? undefined : 'is-empty'}>
            <span className={`lu-pos pos-${positionGroup(slot.role)}`}>{slot.label}</span>
            <span className="lv-name">{p ? <><b className={`squad-season season-tag-${p.tier}`}>{seasonShort(p.tier)}</b><strong>{p.name}</strong></> : <em>Trống</em>}</span>
            {card ? <img className="squad-level-img" src={levelBadge(card.level)} alt={`+${card.level}`}/> : <span/>}
            <b className="lv-ovr" title={card ? `OVR thẻ ${ovr(card)}` : undefined}>{card ? shown(i) : ''}</b>
          </li>;
        })}
      </ol>
    </div>
  </>;

  return <div className="lv-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="lv-panel" role="dialog" aria-modal="true" aria-label={`Đội hình của ${title}`}>
      <header className="lv-head">
        {logo ? <img className="lv-club" src={logo} alt=""/> : <Shield className="lv-club" aria-hidden="true"/>}
        <div className="lv-title"><h2><span className={fx || undefined}>{title}</span>{view?.mine && <em>Bạn</em>}</h2><p>Đội hình đang dùng{team ? ` · ${team.set.formation}` : ''}</p></div>
        {team && filled > 0 && <dl className="lv-stats">
          <div><dt>OVR đội</dt><dd>{team.summary.ovr || '—'}</dd></div>
          <div><dt>Giá trị ĐH</dt><dd>{money(team.summary.value)}</dd></div>
          <div><dt>Lương</dt><dd>{team.summary.wage}</dd></div>
        </dl>}
        <button type="button" className="icon-button lv-close" onClick={onClose} aria-label="Đóng"><X/></button>
      </header>
      {body}
    </section>
  </div>;
}
