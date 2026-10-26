import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Layers3, PackageOpen, Shield, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import type { Card, Pack } from '../game';
import { getPlayer, money, ovr, packs, seasons, TIERS } from '../game';
import { byMarketValue, marketQuote } from '../market';
import { OpeningAudio } from './audio';
import { INFO_GAP, OPENING_CUES } from './timeline';
import { AUDIO_ENABLED } from '../config';
import { asset } from '../asset';
import { getTeamLogo } from '../teamLogos';
import './cinema.css';
import './info-rays.css';
import RevealStadium, { RevealGround, RevealJets } from './RevealStadium';
import { flameTone } from './flames';

type Props = {
  cards: Card[]; pack: Pack; phase: number; quick: boolean; reduced: boolean; light: boolean; sound: boolean;
  canSkip: boolean; sceneReady: boolean; onSound: () => void; onLight: () => void; onClose: () => void; onAgain: () => void; onAgainMany: () => void; onSave: () => void; onTrade: () => void; stock: number;
  renderCard: (card: Card, compact?: boolean) => ReactNode; renderFlag: (code: string, large?: boolean) => ReactNode;
};
// Bục rộng = 1,42 × thẻ; cao 0,15 × bục, mặt trên (elip dẹt) 0,03 × bục; mũi thẻ ở 99% chiều cao ảnh thẻ (ảnh thẻ đã chuẩn hoá, thân thẻ cao gần trọn ảnh); chừa 28px cho tên cầu thủ.
// Thẻ nổi cao hơn mép trước của bục 6% chiều cao thẻ (bục / màn LED vẫn giữ chỗ cũ).
const PODIUM_RATIO = 1.42, PODIUM_HEIGHT = .15, PODIUM_TOP = .03, CARD_TIP = .99, NAME_SPACE = 28, CARD_LIFT = .06;
// Khoảng từ đỉnh khung thẻ tới mũi thẻ: ảnh thẻ hiển thị kiểu contain (căn giữa) nên tính theo tỉ lệ ảnh; chưa tải ảnh thì ước 93% khung.
function cardTipOffset(card: HTMLElement) {
  const img = card.querySelector<HTMLImageElement>('.player-card img'), w = card.offsetWidth, h = card.offsetHeight;
  if (!img?.naturalWidth) return h * .93;
  const shown = Math.min(h, w * img.naturalHeight / img.naturalWidth);
  return (h - shown) / 2 + shown * CARD_TIP;
}

export default function PackOpening(props: Props) {
  const { cards, pack, phase, quick, reduced, light, sound } = props;
  // Thẻ chính hiện ra là cầu thủ giá trị nhất (khớp thông tin trong hầm); các thẻ còn lại xếp OVR cao đến thấp.
  const sortedCards = useMemo(() => { const [top, ...rest] = byMarketValue(cards); return [top, ...rest.sort((a, b) => ovr(b) - ovr(a))]; }, [cards]);
  const [best, ...secondaryCards] = sortedCards;
  const player = getPlayer(best);
  const season = seasons[player.tier], icon = player.tier === 'eternal';
  const price = marketQuote(best).price;
  // Máy phun hai bên màn LED: thẻ chính từ 1M lửa / tia đỏ, từ 1B tím.
  const jetTone = flameTone(price, 1e6);
  const displayPrice = price === null ? 'Chưa có giá' : price >= 1e9 ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(price / 1e9)}B` : money(price);
  // Les cartes ICON représentent la sélection nationale, cohérente avec le portrait de Messi.
  const team = icon || player.tier === 'vietnam' ? player.nation : player.club;
  const teamLogo = getTeamLogo(player);
  // Màn LED cong sau thẻ dùng nền của mùa thẻ cầu thủ (mở hỗn hợp nhiều gói thì theo mùa của cầu thủ đang hiện).
  const theme = packs.find(p => p.weights[TIERS.indexOf(player.tier)] === 100) ?? pack, screenBg = theme.tunnel ?? theme.back;
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
    // ResizeObserver tự báo lần đầu sau khi bố cục xong; không đọc kích thước ngay (ép tính bố cục giữa lúc dựng màn kết quả).
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [finished, listExpanded, cards]);
  const info = phase >= 3 && phase <= 5;
  const cues = OPENING_CUES[quick ? 'quick' : 'standard'];
  // Dựng sẵn màn kết quả (gần như trong suốt, hoạt cảnh dừng) ngay trước mốc 6 — lúc màn trắng chuyển cảnh đã gần trắng hẳn —
  // để việc dựng DOM / tính bố cục / vẽ ảnh diễn ra khuất sau màn trắng; tới lúc hiện thẻ chỉ còn hiện dần lên.
  const [prepared, setPrepared] = useState(false);
  useEffect(() => {
    if (phase < 5) { setPrepared(false); return; }
    if (phase !== 5 || reduced) return;
    const timer = window.setTimeout(() => setPrepared(true), Math.max(0, cues[5] - cues[4] - (quick ? 50 : 100)));
    return () => clearTimeout(timer);
  }, [phase]);
  const showResult = finished || (prepared && phase >= 5), pre = showResult && !finished;
  // Sân khấu màn rộng: đo thẻ thật (cỡ thẻ đổi theo nhiều luật CSS / cỡ màn hình) rồi đặt thẻ sao cho chân bục chạm mặt cỏ ngay trên
  // tên cầu thủ, mũi thẻ nằm sát trên mép trước của bục; bục / đáy màn LED / đường chân trời tính theo --cardw, --cardb (reveal-stadium.css).
  const sceneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scene = sceneRef.current, card = scene?.querySelector<HTMLElement>('.reveal-card');
    if (!scene || !card) return;
    const wide = matchMedia('(min-width: 901px)');
    const place = () => {
      card.style.top = '';
      if (!wide.matches) { scene.style.removeProperty('--cardw'); scene.style.removeProperty('--cardb'); return; }
      const width = card.offsetWidth, podium = width * PODIUM_RATIO, offset = cardTipOffset(card), lift = card.offsetHeight * CARD_LIFT;
      const tip = scene.clientHeight - NAME_SPACE - podium * (PODIUM_HEIGHT - PODIUM_TOP) - 2;
      const top = Math.max(0, tip - offset - lift);
      card.style.top = `${Math.round(top)}px`;
      scene.style.setProperty('--cardw', `${width}px`); scene.style.setProperty('--cardb', `${Math.round(top + offset + lift)}px`);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(scene); observer.observe(card);
    const img = card.querySelector('.player-card img'); img?.addEventListener('load', place);
    wide.addEventListener('change', place);
    return () => { observer.disconnect(); img?.removeEventListener('load', place); wide.removeEventListener('change', place); };
  }, [showResult]);
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
    <div className="opening-header"><div className="opening-brand"><img src={asset('/assets/fco-vip-opening-logo.png')} alt=""/><span>FCO VIP</span></div><div className="opening-controls">{finished && <><button onClick={props.onSound} className="opening-icon-button" disabled={!AUDIO_ENABLED} aria-label={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh mở thẻ' : 'Bật âm thanh mở thẻ') : 'Âm thanh đã tắt'} title={AUDIO_ENABLED ? (sound ? 'Tắt âm thanh' : 'Bật âm thanh') : 'Âm thanh đã tắt'}>{AUDIO_ENABLED && sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><button className={`opening-quality ${light ? 'selected' : ''}`} onClick={props.onLight} aria-pressed={light}><SlidersHorizontal size={14}/><span>{lightweight ? 'Hiệu ứng nhẹ' : 'Tự động'}</span></button></>}{(finished || props.canSkip) && <button className="opening-skip" onClick={props.onClose} aria-keyshortcuts={!finished ? "Space" : undefined} title={!finished ? "Bỏ qua (phím cách)" : undefined}>{finished ? 'Đóng' : 'Bỏ qua'}{finished ? <X size={15}/> : <ChevronRight size={15}/>}</button>}</div></div>
    {!finished && <>
      {/* Tia sáng chiếu vào mỗi thông tin (quốc tịch / vị trí / đội bóng), hiện lại theo từng mốc, cùng nhịp với chữ. */}
      {info && !reduced && <div key={`rays-${phase}`} className="info-rays" style={{ '--information-duration': `${informationDuration}s` } as CSSProperties} aria-hidden="true"><i className="ir-burst"/><i className="ir-beams"/></div>}
      <AnimatePresence mode="wait"><motion.div key={phase} className={`opening-reveal ${phase === 6 ? 'suspense' : ''}`} initial={reduced || info ? false : { opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: info ? 0 : -8, scale: info ? 1 : 1.025, transition: { duration: info ? 0 : quick ? .1 : .2 } }} transition={{ duration: quick ? .1 : .2 }}>
        {phase <= 1 ? <div className="opening-intro"><div className="intro-light"/></div> : phase === 2 ? null : info ? <div className={`opening-information information-${phase}`} style={{ '--information-duration': `${informationDuration}s` } as CSSProperties}>{phase === 3 ? props.renderFlag(player.flag, true) : phase === 4 ? <strong className="opening-position">{player.pos}</strong> : (teamLogo ? <img className="team-logo" src={teamLogo} alt={icon ? 'Logo đội ICON The Moment' : `Logo ${team}`}/> : <div className="team-shield"><Shield size={100} strokeWidth={.8}/><b>{team.slice(0, 2).toUpperCase()}</b></div>)}</div> : phase === 6 ? <div className="opening-silence"><i/></div> : null}
      </motion.div></AnimatePresence>
    </>}
    {showResult && <motion.div className={`opening-result reveal-stage ${icon ? 'reveal-icon' : `reveal-${player.tier}`}${pre ? ' is-pre' : ''}`} inert={pre} aria-hidden={pre || undefined} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: pre ? .002 : 1 }} transition={{ duration: reduced ? 0 : quick ? .25 : .45, ease: 'easeOut' }}>
      <RevealStadium/>
      <h2 className="reveal-title">{pack.name} · OVR {pack.range} đang mở</h2>
      <div className="reveal-count"><span>Số gói sở hữu</span><b>SL:{props.stock}</b></div>
      <div className="reveal-scene" ref={sceneRef}>
        <RevealGround/>
        <div className="reveal-screen" style={screenBg ? { '--screen-bg': `url("${screenBg}")` } as CSSProperties : undefined}>
          <div className="reveal-screen-face"/>
          <svg className="reveal-screen-bezel" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rsSilver" x2="1" y2="1"><stop stopColor="#8e969f"/><stop offset=".25" stopColor="#f6f8fa"/><stop offset=".5" stopColor="#aab2bb"/><stop offset=".75" stopColor="#ffffff"/><stop offset="1" stopColor="#848c95"/></linearGradient></defs><path d="M0 0Q500 50 1000 0L985 400H15Z"/></svg>
          <div className="reveal-panel reveal-panel-left" aria-label={`Chỉ số ${player.name}`}>
            <div className="reveal-crest">{teamCrest}</div>
            <strong className="reveal-ovr">{ovr(best)}</strong>
            <dl className="reveal-stats">{statsList.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
          </div>
          <div className="reveal-panel reveal-panel-right" role="group" aria-label={`Thông tin ${player.name}`}>
            <strong className="reveal-info-ovr" aria-label={`OVR ${ovr(best)}`}>{ovr(best)}</strong>
            <div className="reveal-price"><span className="reveal-price-label">Giá</span><strong className={price === null ? 'is-unpriced' : undefined}>{displayPrice}</strong></div>
            <div className="reveal-crest">{teamCrest}</div>
          </div>
          {jetTone && <RevealJets tone={jetTone}/>}
        </div>
        <motion.div className="opening-best-card reveal-card" initial={reduced ? false : { opacity: 0, y: 24, scale: .94 }} animate={pre ? { opacity: .002, y: 24, scale: 1 } : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : quick ? .5 : .95, ease: [.22, 1, .36, 1], opacity: { duration: reduced ? 0 : quick ? .2 : .35 } }}>{props.renderCard(best)}{!player.cardFace && <div className="card-edge-sweep"/>}</motion.div>
        <div className="reveal-podium" aria-hidden="true"><i className="rp-top"/><div className="rp-body"><div className="rp-ring">{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{season}</span>)}</div></div></div>
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
