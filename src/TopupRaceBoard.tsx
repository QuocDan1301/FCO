import { useEffect, useState } from 'react';
import { Clock3, Crown, Dumbbell, Gift, Trophy, X } from 'lucide-react';
import { asset } from './asset';
import PackImage from './PackImage';
import { money } from './game';
import { nameEffectClass } from './name-effects';
import { clubLogoUrl } from './club-logo';
import { findPack } from './event';
import type { TopupRace } from './topup-race';
import { formatDayMonth, formatPoints, isAllTime, raceSpan, topupCountdown } from './topup-race';
import './topup-race.css';

// Top Đặc Huấn (migration 202611180005_fco_topup_race.sql + 202611180006_fco_topup_race_points.sql): xếp hạng điểm đặc huấn
// (1 FC nạp = 1,5 điểm) tính toàn bộ FC đã nạp (202611180009) tới khi sự kiện VQTG kết thúc, top 50 nhận quà (máy chủ tự gửi vào Quà từ Admin).
// Trang chủ chỉ hiện banner sự kiện ngay dưới avatar (TopupRaceBanner); bấm vào mới mở bảng đầy đủ (TopupRaceBoard trong Modal của App).

/** Tải bảng từ máy chủ, làm mới mỗi phút khi tab đang hiện (đồng hồ đếm ngược chạy riêng trong từng khối để App không vẽ lại mỗi giây). */
export function useTopupRace(load: () => Promise<TopupRace>, online: boolean) {
  const [race, setRace] = useState<TopupRace | null>(null);
  useEffect(() => {
    if (!online) { setRace(null); return; }
    let alive = true;
    const get = () => { void load().then(r => { if (alive) setRace(r); }).catch(() => { /* lượt sau thử lại */ }); };
    get();
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') get(); }, 60_000);
    return () => { alive = false; window.clearInterval(poll); };
  }, [online]);
  return race;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  return now;
}

const countdownText = (race: TopupRace, now: number) => {
  const cd = topupCountdown(race.endsAt, now);
  return `${cd.days > 0 ? `${cd.days} ngày ` : ''}${cd.clock}`;
};

/** Banner sự kiện dưới avatar: nhìn như ảnh quảng bá sự kiện, bấm để mở bảng xếp hạng + quà. */
export function TopupRaceBanner({ race, onOpen }: { race: TopupRace; onOpen: () => void }) {
  const now = useNow();
  const rank = race.me.rank;
  return <button type="button" className="tr-banner" onClick={onOpen} aria-haspopup="dialog"
    aria-label={`Sự kiện Top Đặc Huấn${rank ? ` · bạn đang hạng ${rank}` : ''} · bấm để xem bảng xếp hạng và quà`}>
    <span className="tr-bn-rays" aria-hidden="true"/>
    <span className="tr-bn-card is-left" aria-hidden="true"><Crown size={20}/></span>
    <span className="tr-bn-card is-right" aria-hidden="true"><Trophy size={20}/></span>
    <span className="tr-bn-emblem" aria-hidden="true"><span><Dumbbell size={18}/></span></span>
    <span className="tr-bn-text">
      <small>Sự kiện nạp FC</small>
      <strong>TOP ĐẶC HUẤN</strong>
      <em>Đua top · Quà đặc huấn cực chất</em>
    </span>
    <span className="tr-bn-foot">
      <span className="tr-bn-cta">XEM NGAY</span>
      <span className="tr-bn-date">{isAllTime(race.startsAt) ? `Đến ${formatDayMonth(race.endsAt - 1)}` : raceSpan(race.startsAt, race.endsAt)}</span>
    </span>
    <span className={`tr-bn-chip${race.ended ? ' is-ended' : ''}`}>{race.ended ? 'Đã kết thúc' : <><Clock3 size={10}/>{countdownText(race, now)}</>}</span>
    {rank != null && <span className="tr-bn-rank">Hạng <b>{rank}</b></span>}
    <span className="tr-bn-shine" aria-hidden="true"/>
  </button>;
}

// Một ô quà: ảnh gói (kèm huy hiệu cấp như Shop) hoặc biểu tượng BP / FC, tên bên dưới.
function RewardTile({ reward }: { reward: TopupRace['rewards'][number]['rewards'][number] }) {
  if (typeof reward.pack === 'string') {
    const pack = findPack(reward.pack), name = `${pack?.name ?? reward.pack}${reward.count && reward.count > 1 ? ` ×${reward.count}` : ''}`;
    return <span className="tr-rw-item" title={name}>{pack ? <PackImage pack={pack}/> : <span className="tr-rw-icon"><Gift size={22}/></span>}<small>{name}</small></span>;
  }
  if (typeof reward.bp === 'number') return <span className="tr-rw-item is-money"><span className="tr-rw-icon"><img src={asset('/assets/currency-bp.png')} alt=""/></span><small><b>{money(reward.bp)}</b> BP</small></span>;
  if (typeof reward.fc === 'number') return <span className="tr-rw-item is-money"><span className="tr-rw-icon"><img src={asset('/assets/currency-fc.png')} alt=""/></span><small><b>{money(reward.fc)}</b> FC</small></span>;
  return null;
}

/** Bảng đầy đủ (nội dung Modal): top 50, hạng của mình, quà theo hạng. */
export default function TopupRaceBoard({ race, onClose }: { race: TopupRace; onClose: () => void }) {
  const now = useNow();
  const mineIn = race.top.some(r => r.mine);
  return <div className="tr-board">
    <header className="tr-head">
      <span className="tr-icon" aria-hidden="true"><Dumbbell size={20}/></span>
      <div><h2>TOP ĐẶC HUẤN</h2><small>1 FC nạp = {formatPoints(race.pointsPerFc ?? 1.5)} điểm ·{race.minPoints > 0 ? ` Từ ${formatPoints(race.minPoints)} điểm ·` : ''} Top {race.topN} có quà · {isAllTime(race.startsAt) ? 'Tính toàn bộ FC đã nạp' : raceSpan(race.startsAt, race.endsAt)}</small></div>
      <button type="button" className="icon-button" aria-label="Đóng Top Đặc Huấn" onClick={onClose}><X/></button>
    </header>
    <div className="tr-body">
    <section className="tr-col" aria-label="Bảng xếp hạng">
    <p className="tr-clock">{race.ended ? 'Đã kết thúc · quà gửi vào Quà từ Admin' : <>Kết thúc sau <b>{countdownText(race, now)}</b></>}</p>
    <ol className="tr-list">
      {race.top.length ? race.top.map(r => <li key={r.rank} className={`${r.rank <= 3 ? `is-top${r.rank}` : ''}${r.mine ? ' is-mine' : ''}`}>
        <span className="tr-rank">{r.rank <= 3 ? <Crown size={14}/> : null}{r.rank}</span>
        <span className="tr-name">{clubLogoUrl(r.club) && <img src={clubLogoUrl(r.club)!} alt=""/>}<span className={nameEffectClass(r.effect).trim() || undefined}>{r.name}</span>{r.mine && <em>Bạn</em>}</span>
        <span className="tr-amount">{formatPoints(r.points)}<small> điểm</small></span>
      </li>) : <li className="tr-empty">Chưa có ai nạp. Nạp FC để có tên trên bảng!</li>}
    </ol>
    {!mineIn && <p className="tr-me">{race.me.rank ? <>Hạng của bạn: <b>{race.me.rank}</b> · {formatPoints(race.me.points)} điểm</>
      : race.me.points > 0 ? <>Bạn có <b>{formatPoints(race.me.points)}</b> điểm · cần thêm <b>{formatPoints(Math.max(0, race.minPoints - race.me.points))}</b> điểm để vào bảng xếp hạng</>
      : 'Bạn chưa nạp trong đợt này.'}</p>}
    </section>
    <aside className="tr-rewards" aria-label="Quà đặc huấn">
      <b>Quà đặc huấn</b>
      {race.rewards.length ? <ul>{race.rewards.map(w => <li key={w.from} className={w.from <= 3 ? `is-top${w.from}` : undefined}>
        <span className="tr-rw-rank">{w.from <= 3 && <Crown size={13}/>}{w.from === w.to ? `Hạng ${w.from}` : `Hạng ${w.from}–${w.to}`}</span>
        <span className="tr-rw-items">{w.rewards.length ? w.rewards.map((r, i) => <RewardTile key={i} reward={r}/>) : <span className="tr-rw-note">{w.note}</span>}</span>
      </li>)}</ul>
        : <p>Quà theo hạng sẽ được công bố sớm.</p>}
      <small>Mỗi 1 FC nạp (admin cộng sau khi kiểm bill) {isAllTime(race.startsAt) ? 'từ trước tới nay' : `từ 0h ${formatDayMonth(race.startsAt).replace('.', '/')}`} tới khi sự kiện Vòng Quanh Thế Giới kết thúc = {formatPoints(race.pointsPerFc ?? 1.5)} điểm đặc huấn.{race.minPoints > 0 && <> Cần từ <b>{formatPoints(race.minPoints)}</b> điểm trở lên mới vào bảng xếp hạng và nhận quà.</>} Bằng điểm thì ai đạt trước xếp trên. Quà gửi vào Quà từ Admin sau khi kết thúc.</small>
    </aside>
    </div>
  </div>;
}
