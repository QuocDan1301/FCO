export const OPENING_ENTRY = { standard: { wait: 2000, flip: 1900, cameraLead: 0 }, quick: { wait: 2000, flip: 900, cameraLead: 0 } } as const;

export const OPENING_CUES = {
  standard: [650, 1750, 2650, 4050, 5450, 6850, 7450, 8550, 9850],
  quick: [160, 420, 760, 1170, 1580, 1990, 2240, 2780, 3550],
} as const;
export const OPENING_RESULT = 9;
export function openingPhase(elapsed: number, quick: boolean) {
  return OPENING_CUES[quick ? 'quick' : 'standard'].filter(at => elapsed >= at).length;
}
export function sceneProgress(phase: number) {
  return [0, .055, .16, .26, .37, .46, .51, .64, .86, 1][Math.min(9, Math.max(0, phase))];
}

const CAMERA_POINTS = [0, .055, .16, .26, .37, .46, .51, .58, .82, 1];
const CAMERA_TRACKS = Object.fromEntries(([false, true] as const).map(quick => {
  const times = [0, ...OPENING_CUES[quick ? 'quick' : 'standard']];
  const speeds = times.slice(1).map((time, i) => (CAMERA_POINTS[i + 1] - CAMERA_POINTS[i]) / (time - times[i]));
  const slopes = CAMERA_POINTS.map((_, i) => i === 0 || i === 9 ? 0 : 2 * speeds[i - 1] * speeds[i] / (speeds[i - 1] + speeds[i]));
  return [quick ? 'quick' : 'standard', { times, slopes }];
})) as Record<'quick' | 'standard', { times: number[]; slopes: number[] }>;

// Nội suy Hermite đơn điệu: cùng vận tốc ở hai phía của mỗi mốc hé lộ.
export function cameraProgress(elapsed: number, quick: boolean) {
  const { times, slopes } = CAMERA_TRACKS[quick ? 'quick' : 'standard'];
  if (elapsed <= 0) return 0;
  if (elapsed >= times[9]) return 1;
  let i = 0;
  while (elapsed > times[i + 1]) i++;
  const span = times[i + 1] - times[i], t = (elapsed - times[i]) / span;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * CAMERA_POINTS[i] + (t3 - 2 * t2 + t) * span * slopes[i]
    + (-2 * t3 + 3 * t2) * CAMERA_POINTS[i + 1] + (t3 - t2) * span * slopes[i + 1];
}


export function cameraPose(progress: number) {
  const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
  };
  const corridor = smooth(progress / .55), approach = smooth((progress - .51) / .42);
  return {
    x: Math.sin(progress * Math.PI) * .18,
    y: 3.1 + approach * .25,
    z: 13 - corridor * 43 - approach * 19.5,
    // Đưa điểm nhìn ra sân khấu cùng camera, trước khi camera vượt vị trí z = -43.
    lookZ: -43 - approach * 16,
  };
}
