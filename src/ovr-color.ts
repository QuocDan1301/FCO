import type { CSSProperties } from 'react';

// Màu số OVR theo ngưỡng, dùng chung cho mọi nơi hiển thị OVR trong game (người dùng 2026-11-24).
// 0–49 xám · 50–79 đen (có viền sáng mờ để đọc được trên nền tối) · từ 190 trở lên dùng màu mức 180–189.
const OVR_TONES: [number, string][] = [[180, '#01EEFF'], [170, '#04F669'], [160, '#12CAAA'], [150, '#FFA801'], [140, '#C99B00'], [130, '#DC0101'], [110, '#B33BFF'], [100, '#6E3BFF'], [90, '#185EDE'], [80, '#2295D6'], [50, '#000000']];
export const ovrColor = (v: number) => OVR_TONES.find(([min]) => v >= min)?.[1] ?? '#8b929c';
export const ovrStyle = (v: number): CSSProperties => { const color = ovrColor(v); return color === '#000000' ? { color, textShadow: '0 0 2px #ffffffcc, 0 0 1px #ffffff' } : { color }; };
