import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronRight, Layers3, PackageOpen, Shield, SlidersHorizontal, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import type { Card, Pack } from '../game';
import ViewportPages from '../ViewportPages';
import { getPlayer, ovr, seasons } from '../game';
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
  const best = [...cards].sort((a, b) => ovr(b) - ovr(a))[0], player = getPlayer(best);
  const season = seasons[player.tier], icon = player.tier === 'eternal';
  // Les cartes ICON représentent la sélection nationale, cohérente avec le portrait de Messi.
  const team = icon ? player.nation : player.club;
  const [summary, setSummary] = useState(false), [stats, setStats] = useState(false);
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
    if (!finished || cards.length <= 1 || stats) return;
    const timer = setTimeout(() => setSummary(true), reduced ? 150 : quick ? 1400 : 2200);
    return () => clearTimeout(timer);
  }, [finished, cards.length, reduced, quick, stats]);
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
  const teamLogo = getTeamLogo(player);
  const teamCrest = teamLogo ? <img src={teamLogo} alt=""/> : <span className="reveal-club">{team.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}</span>;
  return <div className={`icon-opening ${primed || finished ? 'opening-primed' : ''} opening-phase-${phase} ${finished ? 'opening-finished' : ''} ${summary ? 'opening-summary' : ''} ${reduced ? 'opening-reduced' : ''}`} data-opening-mode={quick ? 'quick' : 'standard'} data-scene-ready={primed}>
    {!primed && !finished && <div className="opening-entry-veil" aria-hidden="true"/>}
    <div className="opening-vignette"/><div className="opening-letterbox top"/><div className="opening-letterbox bottom"/>
    <div className="opening-header"><div className="opening-brand"><img src={asset('/assets/mark.svg')} alt=""/><span>FCO VIP</span></div><div className="opening-controls">{finished && <><button onClick={props.onSound} className="opening-icon-button" disabled={!AUDIO_ENABLED} aria-label={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh mở thẻ' : 'Bật âm thanh mở thẻ') : 'Âm thanh đã tắt'} title={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh' : 'Bật âm thanh') : 'Âm thanh đã tắt'}>{AUDIO_ENABLED && sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className={`opening-quality ${light ? 'selected' : ''}`} onClick={props.onLight} aria-pressed={light}><SlidersHorizontal size={14}/><span>{lightweight ? 'Hiệu ứng nhẹ' : 'Tự động'}</span></button></>}{(finished || props.canSkip) && <button className="opening-skip" onClick={props.onClose} aria-keyshortcuts={!finished ? "Space" : undefined} title={!finished ? "Bỏ qua (phím cách)" : undefined}>{finished ? 'Đóng' : 'Bỏ qua'}{finished ? <X size={15}/> : <ChevronRight size={15}/>}</button>}</div></div>
    {!finished && <>
      <AnimatePresence mode="wait"><motion.div key={phase} className={`opening-reveal ${phase === 6 ? 'suspense' : ''}`} initial={reduced || info ? false : { opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: info ? 0 : -8, scale: info ? 1 : 1.025, transition: { duration: info ? 0 : quick ? .1 : .2 } }} transition={{ duration: quick ? .1 : .2 }}>
        {phase <= 1 ? <div className="opening-intro"><div className="intro-light"/></div> : phase === 2 ? null : info ? <div className={`opening-information information-${phase}`} style={{ '--information-duration': `${informationDuration}s` } as CSSProperties}>{phase === 3 ? props.renderFlag(player.flag, true) : phase === 4 ? <strong className="opening-position">{player.pos}</strong> : (teamLogo ? <img className="team-logo" src={teamLogo} alt={icon ? 'Logo đội ICON The Moment' : `Logo ${team}`}/> : <div className="team-shield"><Shield size={100} strokeWidth={.8}/><b>{team.slice(0, 2).toUpperCase()}</b></div>)}</div> : phase === 6 ? <div className="opening-silence"><i/></div> : null}
      </motion.div></AnimatePresence>
    </>}
    {finished && <div className={`opening-result reveal-stage ${icon ? 'reveal-icon' : `reveal-${player.tier}`}`}>
      {!reduced && <div className="opening-pyro" aria-hidden="true"><div className="pyro-left"/><div className="pyro-right"/></div>}
      <h2 className="reveal-title">{pack.name} · OVR {pack.range} đang mở</h2>
      <div className="reveal-count"><span>Số gói sở hữu</span><b>SL:{props.stock}</b></div>
      {!summary && <div className="reveal-scene">
        <div className="reveal-panel reveal-panel-left" aria-label={`Chỉ số ${player.name}`}>
          <div className="reveal-crest">{teamCrest}</div>
          <strong className="reveal-ovr">{ovr(best)}</strong>
          <dl className="reveal-stats">{statsList.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
        </div>
        <div className="reveal-panel reveal-panel-right" aria-hidden="true"><div className="reveal-crest">{teamCrest}</div><span className="reveal-pos">{player.pos}</span></div>
        <motion.div className="opening-best-card reveal-card" initial={reduced ? false : { opacity: 0, y: 35, rotateY: -75, scale: .7 }} animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }} transition={{ duration: reduced ? 0 : quick ? .32 : .85, ease: [.16, 1, .3, 1] }}>{props.renderCard(best)}{!player.cardFace && <div className="card-edge-sweep"/>}</motion.div>
        <div className="reveal-podium" aria-hidden="true">{[0, 1, 2].map(i => <span key={i}>{season}</span>)}</div>
        <p className="reveal-name">{player.name}<span>·</span>{team}</p>
        {cards.length > 1 && <button className="opening-show-summary reveal-summary-btn" onClick={() => setSummary(true)}><Layers3 size={15}/>Xem đủ {cards.length} thẻ<ChevronRight size={14}/></button>}
      </div>}
      {cards.length > 1 && summary && <motion.div className="opening-batch" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><div className="batch-caption"><span>{cards.length} thẻ · Đã nhận đủ vào kho</span><b><Sparkles size={12}/>Thẻ nổi bật: {player.name} · {ovr(best)}</b></div><ViewportPages className="opening-batch-grid" itemWidth={130} itemHeight={200} gap={12}>{cards.map(card => <div key={card.uid} className={card.uid === best.uid ? 'batch-highlight' : ''}>{props.renderCard(card, true)}<span>{getPlayer(card).name}</span><b>{ovr(card)} · {getPlayer(card).pos} · +{card.level}</b>{card.uid === best.uid && <small>Xuất sắc nhất</small>}</div>)}</ViewportPages><button className="reveal-back" onClick={() => { setStats(true); setSummary(false); }}>Xem lại thẻ nổi bật</button></motion.div>}
      <div className="reveal-actions">
        <button className="reveal-btn reveal-trade" onClick={props.onTrade}>Trao đổi<ArrowRight size={18}/></button>
        <button className="reveal-btn reveal-again" onClick={props.onAgain} disabled={props.stock < 1}>{props.stock < 1 ? 'Hết vật phẩm' : 'Mở 1 vật phẩm'}</button>
        <button className="reveal-btn reveal-again reveal-many" onClick={props.onAgainMany} disabled={props.stock < 2}>{props.stock < 1 ? 'Hết vật phẩm' : `Mở ${Math.min(10, props.stock)} vật phẩm`}</button>
        <span className="reveal-right"><button className="reveal-btn reveal-manage" onClick={props.onSave}>Quản lí C.Thủ<ArrowRight size={18}/></button><button className="reveal-btn reveal-done" onClick={props.onClose}>Hoàn thành<Check size={18} strokeWidth={2.6}/></button></span>
      </div>
    </div>}
  </div>;
}
