import { useEffect, useRef, useState } from 'react';
import type { Card, Pack, Tier } from '../game';
import { getPlayer, ovr, seasons } from '../game';
import StadiumScene from './StadiumScene';
import LightTunnel from './LightTunnel';
import { getTeamLogo } from '../teamLogos';

type Props = { preparationId: number; pack: Pack; cards?: Card[]; phase: number; playing: boolean; quick: boolean; reduced: boolean; light: boolean; onPrepared: () => void; onReady: () => void };
export default function PackStage(props: Props) {
  const latest = useRef(props); latest.current = props;
  const playbackStart = useRef<number | null>(null);
  const [prepared, setPrepared] = useState(false), [fallback, setFallback] = useState(false);
  const { pack, cards, playing, quick, reduced, light } = props;
  if (!playing) playbackStart.current = null;
  const best = cards?.length ? [...cards].sort((a, b) => ovr(b) - ovr(a))[0] : undefined;
  const player = best ? getPlayer(best) : undefined;
  const weak = navigator.hardwareConcurrency <= 2 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 2;
  useEffect(() => {
    if (prepared || reduced) latest.current.onPrepared();
    if (reduced && playing) latest.current.onReady();
  }, [prepared, reduced, playing, props.preparationId]);
  const scene = {
    phase: playing ? props.phase : 0, playing, quick,
    season: player ? seasons[player.tier] : seasons[pack.id as Tier] || pack.name,
    nation: player?.nation || '', position: player?.pos || '', flag: player?.flag || '', back: pack.back, intro: pack.tunnel, accent: pack.accent, stage: pack.stage,
    teamLogo: player ? getTeamLogo(player) : undefined,
    team: player ? player.tier === 'eternal' ? 'ICON The Moment' : player.tier === 'prime' ? 'Infinite Prime' : player.club : '',
    getElapsed: () => playbackStart.current === null ? 0 : performance.now() - playbackStart.current,
    onPrepared: () => setPrepared(true), onReady: () => { if (playbackStart.current === null) { playbackStart.current = performance.now(); latest.current.onReady(); } },
  };
  return <div className="opening-scene persistent-pack-scene" data-prepared={prepared || reduced} data-playing={playing} aria-hidden="true">
    {!reduced && (light || weak || fallback ? <LightTunnel {...scene}/> : <StadiumScene {...scene} onFallback={() => setFallback(true)}/>)}
  </div>;
}
