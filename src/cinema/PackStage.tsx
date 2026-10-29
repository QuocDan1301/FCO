import { useEffect, useRef, useState } from 'react';
import type { Card, Pack, Tier } from '../game';
import { defaultPacks, getPlayer, seasons, TIERS } from '../game';
import { byMarketValue, marketQuote } from '../market';
import StadiumScene from './StadiumScene';
import LightTunnel from './LightTunnel';
import PackFlames from './PackFlames';
import { flameTone } from './flames';
import { getTeamLogo } from '../teamLogos';

type Props = { preparationId: number; pack: Pack; cards?: Card[]; phase: number; playing: boolean; quick: boolean; reduced: boolean; light: boolean; onPrepared: () => void; onReady: () => void };
export default function PackStage(props: Props) {
  const latest = useRef(props); latest.current = props;
  const playbackStart = useRef<number | null>(null);
  const flamesRef = useRef<HTMLDivElement>(null);
  const [prepared, setPrepared] = useState(false), [fallback, setFallback] = useState(false);
  const { pack, cards, playing, quick, reduced, light } = props;
  if (!playing) playbackStart.current = null;
  // Thông tin trong hầm là của cầu thủ giá trị nhất; mở hỗn hợp nhiều gói thì nền hầm / màu LED theo mùa của cầu thủ đó.
  const best = cards?.length ? byMarketValue(cards)[0] : undefined;
  const player = best ? getPlayer(best) : undefined;
  const theme = (player && defaultPacks.find(p => p.weights[TIERS.indexOf(player.tier)] === 100)) || pack;
  // Máy phun lửa trong hầm theo giá cầu thủ đó (thường từ 1M, bạc từ 100M, tím từ 1B); bật từ lúc qua cửa hầm (mốc 1) tới khi ra sân khấu (mốc 6),
  // gỡ hẳn từ mốc 7 (màn trắng chuyển cảnh đang che) để hoạt cảnh ẩn không chạy tiếp sau khi hiện thẻ.
  const tone = best ? flameTone(marketQuote(best).price) : null;
  const phone = matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const weak = navigator.hardwareConcurrency <= 2 || (memory ?? 8) <= 2 || (phone && (navigator.hardwareConcurrency <= 4 || (memory ?? 8) <= 4));
  useEffect(() => {
    if (prepared || reduced) latest.current.onPrepared();
    if (reduced && playing) latest.current.onReady();
  }, [prepared, reduced, playing, props.preparationId]);
  const scene = {
    phase: playing ? props.phase : 0, playing, quick,
    season: player ? seasons[player.tier] : seasons[pack.id as Tier] || pack.name,
    nation: player?.nation || '', position: player?.pos || '', flag: player?.flag || '', back: theme.back, intro: theme.tunnel, accent: theme.accent, stage: theme.stage,
    teamLogo: player ? getTeamLogo(player) : undefined,
    flames: tone ? flamesRef : undefined,
    team: player ? player.tier === 'eternal' ? 'ICON The Moment' : player.tier === 'prime' ? 'Infinite Prime' : player.tier === 'vietnam' ? player.nation : player.club : '',
    getElapsed: () => playbackStart.current === null ? 0 : performance.now() - playbackStart.current,
    onPrepared: () => setPrepared(true), onReady: () => { if (playbackStart.current === null) { playbackStart.current = performance.now(); latest.current.onReady(); } },
  };
  return <div className="opening-scene persistent-pack-scene" data-prepared={prepared || reduced} data-playing={playing} aria-hidden="true">
    {!reduced && (light || weak || fallback ? <LightTunnel {...scene}/> : <StadiumScene {...scene} onFallback={() => setFallback(true)}/>)}
    {!reduced && tone && playing && props.phase < 7 && <PackFlames tone={tone} active={props.phase >= 1 && props.phase < 6} rootRef={flamesRef}/>}
  </div>;
}
