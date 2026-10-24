import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Layers3, PackageOpen, Shield, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import type { Card, Pack } from '../game';
import { getPlayer, money, ovr, seasons } from '../game';
import { marketQuote } from '../market';
import { OpeningAudio } from './audio';
import { INFO_GAP, OPENING_CUES } from './timeline';
import { AUDIO_ENABLED } from '../config';
import { asset } from '../asset';
import { getTeamLogo } from '../teamLogos';
import './cinema.css';

type Props = {
  cards: Card[]; pack: Pack; phase: number; quick: boolean; reduced: boolean; light: boolean; sound: boolean;
  canSkip: boolean; sceneReady: boolean; onSound: () => void; onLight: () => void; onClose: () => void; onAgain: () => void; onAgainMany: () => void; onSave: () => void; onTrade: () => void; stock: number;
  renderCard: (card: Card, compact?: boolean) => ReactNode; renderFlag: (code: string, large?: boolean) => ReactNode;
};
export default function PackOpening(props: Props) {
  const { cards, pack, phase, quick, reduced, light, sound } = props;
  const sortedCards = useMemo(() => [...cards].sort((a, b) => ovr(b) - ovr(a)), [cards]);
  const [best, ...secondaryCards] = sortedCards;
  const player = getPlayer(best);
  const season = seasons[player.tier], icon = player.tier === 'eternal';
  const price = marketQuote(best).price;
  const displayPrice = price === null ? 'Chưa có giá' : price >= 1e9 ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(price / 1e9)}B` : money(price);
  const seasonLogo = icon ? asset('/assets/itm-team.webp') : player.tier === 'prime' ? asset('/assets/prime-team.webp') : player.tier === 'vietnam' ? asset('/assets/vietnam-team.webp') : player.tier === 'prm' ? asset('/assets/prm-team.webp') : player.tier === 'mdl' ? asset('/assets/mdl-team.webp') : player.tier === 'amb' ? asset('/assets/amb-team.webp') : player.tier === 'origin' ? asset('/assets/no7-team.webp') : null;
  // Les cartes ICON représentent la sélection nationale, cohérente avec le portrait de Messi.
  const team = icon || player.tier === 'vietnam' ? player.nation : player.club;
  const teamLogo = getTeamLogo(player);
  // Giải mã ảnh trong lúc chạy đường hầm để không khựng ở khung hình hiện thẻ đầu tiên.
  useEffect(() => {
    const sources = [player.cardFace || player.image || asset('/assets/silhouette.svg'), teamLogo];
    void Promise.allSettled(sources.filter((src): src is string => !!src).map(async src => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      await image.decode();
    }));
  }, [player.cardFace, player.image, teamLogo]);
  const [listExpanded, setListExpanded] = useState(true);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; scrollLeft: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scrollEdges, setScrollEdges] = useState({ start: true, end: true });
  const updateScrollEdges = () => {
    const rail = secondaryRef.current;
    if (rail) setScrollEdges({ start: rail.scrollLeft <= 1, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1 });
  };
  const scrollSecondary = (direction: number) => {
    const rail = secondaryRef.current;
    rail?.scrollBy({ left: direction * rail.clientWidth * .75, behavior: reduced ? 'instant' : 'smooth' });
  };
  const primed = props.sceneReady || reduced;
  const audio = useRef<OpeningAudio | null>(null);
  const finished = phase >= 9;
  useEffect(() => {
    const session = new OpeningAudio(); audio.current = session;
    return () => { session.dispose(); audio.current = null; };
  }, []);
  useEffect(() => { audio.current?.setEnabled(sound); }, [sound]);
  useEffect(() => { audio.current?.cue(phase); }, [phase]);
  useEffect(() => { const sync = () => audio.current?.setEnabled(sound); document.addEventListener('visibilitychange', sync); return () => document.removeEventListener('visibilitychange', sync); }, [sound]);
  useEffect(() => {
    const rail = secondaryRef.current;
    if (!rail) return;
    updateScrollEdges();
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [finished, listExpanded, cards]);
  const info = phase >= 3 && phase <= 5;
  const cues = OPENING_CUES[quick ? 'quick' : 'standard'];
  // Thời gian hiện rõ của mỗi mục = cả nhịp trừ khoảng nghỉ trước mục kế.
  const informationDuration = info ? Math.max(.1, (cues[phase] - cues[phase - 1] - INFO_GAP[quick ? 'quick' : 'standard']) / 1000) : 0;
  const weakDevice = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency <= 2 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 2);
  const lightweight = light || weakDevice;
  // Chỉ số giả lập theo nhóm vị trí; lệch nhẹ theo từng cầu thủ để các thẻ không giống hệt nhau.
  const group = player.pos === 'GK' ? 'gk' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(player.pos) ? 'def' : ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(player.pos) ? 'att' : 'mid';
  const statShape = { att: [0, 0, -3, 1, -36, -10], mid: [-3, -4, 1, 0, -18, -6], def: [-6, -30, -9, -11, 0, -3], gk: [0, 1, -6, 2, -40, -4] }[group];
  const statLabels = group === 'gk' ? ['Đổ người', 'Bắt bóng', 'Phát bóng', 'Phản xạ', 'Tốc độ', 'Chọn vị trí'] : ['Tốc độ', 'Sút', 'Chuyền', 'Rê bóng', 'Thủ', 'Thể lực'];
  const statsList = statLabels.map((label, i) => ({ label, value: Math.max(40, ovr(best) + statShape[i] + ((player.id * 37 + i * 11) % 7) - 3) }));
  const teamCrest = teamLogo ? <img src={teamLogo} alt=""/> : <span className="reveal-club">{team.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}</span>;
  return <div className={`icon-opening ${primed || finished ? 'opening-primed' : ''} opening-phase-${phase} ${finished ? 'opening-finished' : ''} ${secondaryCards.length ? 'has-secondary-cards' : ''} ${reduced ? 'opening-reduced' : ''}`} data-opening-mode={quick ? 'quick' : 'standard'} data-scene-ready={primed}>
    {!primed && !finished && <div className="opening-entry-veil" aria-hidden="true"/>}
    <div className="opening-vignette"/><div className="opening-letterbox top"/><div className="opening-letterbox bottom"/>
    <div className="opening-header"><div className="opening-brand"><img src={asset('/assets/mark.svg')} alt=""/><span>FCO VIP</span></div><div className="opening-controls">{finished && <><button onClick={props.onSound} className="opening-icon-button" disabled={!AUDIO_ENABLED} aria-label={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh mở thẻ' : 'Bật âm thanh mở thẻ') : 'Âm thanh đã tắt'} title={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh' : 'Bật âm thanh') : 'Âm thanh đã tắt'}>{AUDIO_ENABLED && sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className={`opening-quality ${light ? 'selected' : ''}`} onClick={props.onLight} aria-pressed={light}><SlidersHorizontal size={14}/><span>{lightweight ? 'Hiệu ứng nhẹ' : 'Tự động'}</span></button></>}{(finished || props.canSkip) && <button className="opening-skip" onClick={props.onClose} aria-keyshortcuts={!finished ? "Space" : undefined} title={!finished ? "Bỏ qua (phím cách)" : undefined}>{finished ? 'Đóng' : 'Bỏ qua'}{finished ? <X size={15}/> : <ChevronRight size={15}/>}</button>}</div></div>
    {!finished && <>
      <AnimatePresence mode="wait"><motion.div key={phase} className={`opening-reveal ${phase === 6 ? 'suspense' : ''}`} initial={reduced || info ? false : { opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: info ? 0 : -8, scale: info ? 1 : 1.025, transition: { duration: info ? 0 : quick ? .1 : .2 } }} transition={{ duration: quick ? .1 : .2 }}>
        {phase <= 1 ? <div className="opening-intro"><div className="intro-light"/></div> : phase === 2 ? null : info ? <div className={`opening-information information-${phase}`} style={{ '--information-duration': `${informationDuration}s` } as CSSProperties}>{phase === 3 ? props.renderFlag(player.flag, true) : phase === 4 ? <strong className="opening-position">{player.pos}</strong> : (teamLogo ? <img className="team-logo" src={teamLogo} alt={icon ? 'Logo đội ICON The Moment' : `Logo ${team}`}/> : <div className="team-shield"><Shield size={100} strokeWidth={.8}/><b>{team.slice(0, 2).toUpperCase()}</b></div>)}</div> : phase === 6 ? <div className="opening-silence"><i/></div> : null}
      </motion.div></AnimatePresence>
    </>}
    {finished && <motion.div className={`opening-result reveal-stage ${icon ? 'reveal-icon' : `reveal-${player.tier}`}`} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : quick ? .25 : .45, ease: 'easeOut' }}>
      {!reduced && <div className="opening-pyro" aria-hidden="true"><div className="pyro-left"/><div className="pyro-right"/></div>}
      <h2 className="reveal-title">{pack.name} · OVR {pack.range} đang mở</h2>
      <div className="reveal-count"><span>Số gói sở hữu</span><b>SL:{props.stock}</b></div>
      <div className="reveal-scene">
        <div className="reveal-panel reveal-panel-left" aria-label={`Chỉ số ${player.name}`}>
          <div className="reveal-crest">{teamCrest}</div>
          <strong className="reveal-ovr">{ovr(best)}</strong>
          <dl className="reveal-stats">{statsList.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
        </div>
        <div className="reveal-panel reveal-panel-right" role="group" aria-label={`Thông tin ${player.name}`}>
          <div className="reveal-player-info">
            <div className="reveal-rating-row">
              <strong className="reveal-info-ovr" aria-label={`OVR ${ovr(best)}`}>{ovr(best)}</strong>
              {seasonLogo ? <img className="reveal-season-logo" src={seasonLogo} alt={season}/> : <span className="reveal-season-badge">{season}</span>}
            </div>
            <div className="reveal-price"><span className="reveal-price-label">BP</span><strong className={price === null ? 'is-unpriced' : undefined}>{displayPrice}</strong></div>
          </div>
        </div>
        <motion.div className="opening-best-card reveal-card" initial={reduced ? false : { opacity: 0, y: 24, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : quick ? .5 : .95, ease: [.22, 1, .36, 1], opacity: { duration: reduced ? 0 : quick ? .2 : .35 } }}>{props.renderCard(best)}{!player.cardFace && <div className="card-edge-sweep"/>}</motion.div>
        <div className="reveal-podium" aria-hidden="true">{[0, 1, 2].map(i => <span key={i}>{season}</span>)}</div>
        <p className="reveal-name">{player.name}<span>·</span>{team}</p>
      </div>
      {secondaryCards.length > 0 && <section className="secondary-players" aria-label="Cầu thủ phụ">
        <div className="secondary-toolbar">
          <button className="secondary-toggle" aria-expanded={listExpanded} aria-controls="secondary-player-list" onClick={() => setListExpanded(value => !value)}><Layers3 size={15}/>{listExpanded ? 'Thu gọn danh sách' : `Xem ${secondaryCards.length} cầu thủ còn lại`}<ChevronDown size={16} className={listExpanded ? '' : 'is-collapsed'}/></button>
          {listExpanded && <div className="secondary-navigation"><span>OVR cao đến thấp · {secondaryCards.length} cầu thủ</span><button aria-label="Xem cầu thủ trước" disabled={scrollEdges.start} onClick={() => scrollSecondary(-1)}><ChevronLeft size={18}/></button><button aria-label="Xem cầu thủ tiếp theo" disabled={scrollEdges.end} onClick={() => scrollSecondary(1)}><ChevronRight size={18}/></button></div>}
        </div>
        {listExpanded && <div id="secondary-player-list" className={`secondary-player-list ${dragging ? 'is-dragging' : ''}`} ref={secondaryRef} role="list" aria-label="Cầu thủ phụ, sắp xếp OVR từ cao đến thấp" tabIndex={0} onScroll={updateScrollEdges}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); scrollSecondary(event.key === 'ArrowLeft' ? -1 : 1); }
            if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); event.currentTarget.scrollTo({ left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth, behavior: reduced ? 'instant' : 'smooth' }); }
          }}
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            drag.current = { pointerId: event.pointerId, x: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
            event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
          }}
          onPointerMove={event => {
            if (drag.current?.pointerId === event.pointerId) event.currentTarget.scrollLeft = drag.current.scrollLeft - (event.clientX - drag.current.x);
          }}
          onPointerUp={event => {
            if (drag.current?.pointerId !== event.pointerId) return;
            drag.current = null; setDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
          onPointerCancel={() => { drag.current = null; setDragging(false); }}>
          {secondaryCards.map(card => <div key={card.uid} className="secondary-player" role="listitem" data-ovr={ovr(card)} aria-label={`${getPlayer(card).name}, OVR ${ovr(card)}`}>{props.renderCard(card, true)}<span>{getPlayer(card).name}</span><b>{ovr(card)} · {getPlayer(card).pos} · +{card.level}</b></div>)}
        </div>}
      </section>}
      <div className="reveal-actions">
        <button className="reveal-btn reveal-trade" onClick={props.onTrade}>Trao đổi<ArrowRight size={18}/></button>
        <button className="reveal-btn reveal-again" onClick={props.onAgain} disabled={props.stock < 1}>{props.stock < 1 ? 'Hết vật phẩm' : 'Mở 1 vật phẩm'}</button>
        <button className="reveal-btn reveal-again reveal-many" onClick={props.onAgainMany} disabled={props.stock < 2}>{props.stock < 1 ? 'Hết vật phẩm' : `Mở ${Math.min(10, props.stock)} vật phẩm`}</button>
        <span className="reveal-right"><button className="reveal-btn reveal-manage" onClick={props.onSave}>Quản lí C.Thủ<ArrowRight size={18}/></button><button className="reveal-btn reveal-done" onClick={props.onClose}>Hoàn thành<Check size={18} strokeWidth={2.6}/></button></span>
      </div>
    </motion.div>}
  </div>;
}
