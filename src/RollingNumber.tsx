import { useEffect, useRef, useState } from 'react';
import { rollTo, rollValue, type JackpotRoll } from './vqtg';

// Số quỹ chạy đều từ số đang hiện tới số mới (luật rollTo / rollValue của quỹ Jackpot). format: cách ghi số (mặc định 1.234.567).
// memo: tên nhớ số quỹ lần trước trong bộ nhớ trang; vào lại sự kiện thì số bắt đầu từ số cũ rồi chạy lên số hiện tại (không đứng im, không nhảy từ 0) — người dùng 2026-11-24.
const memos = new Map<string, number>();
export default function RollingNumber({ value, format = n => n.toLocaleString('vi-VN'), memo }: { value: number; format?: (n: number) => string; memo?: string }) {
  const old = memo ? memos.get(memo) : undefined;
  const roll = useRef<JackpotRoll>(old !== undefined && old > 0 && value >= old ? { from: old, to: value, start: Date.now() } : { from: value, to: value, start: 0 });
  const [shown, setShown] = useState(() => rollValue(roll.current, Date.now()));
  useEffect(() => {
    // Chưa tải xong (0) mà đã có số cũ: giữ số cũ, chờ số thật.
    if (value === 0 && memo && memos.has(memo)) return;
    roll.current = rollTo(roll.current, value, Date.now());
    if (memo && value > 0) memos.set(memo, value);
    setShown(rollValue(roll.current, Date.now()));
  }, [value, memo]);
  useEffect(() => {
    const id = setInterval(() => { const r = roll.current; if (r.from !== r.to) setShown(rollValue(r, Date.now())); }, 250);
    return () => clearInterval(id);
  }, []);
  return <>{format(shown)}</>;
}
