import { useEffect, useRef, useState } from 'react';
import { rollTo, rollValue, type JackpotRoll } from './vqtg';

// Số quỹ chạy đều từ số đang hiện tới số mới (luật rollTo / rollValue của quỹ Jackpot). format: cách ghi số (mặc định 1.234.567).
export default function RollingNumber({ value, format = n => n.toLocaleString('vi-VN') }: { value: number; format?: (n: number) => string }) {
  const roll = useRef<JackpotRoll>({ from: value, to: value, start: 0 });
  const [shown, setShown] = useState(value);
  useEffect(() => { roll.current = rollTo(roll.current, value, Date.now()); setShown(rollValue(roll.current, Date.now())); }, [value]);
  useEffect(() => {
    const id = setInterval(() => { const r = roll.current; if (r.from !== r.to) setShown(rollValue(r, Date.now())); }, 250);
    return () => clearInterval(id);
  }, []);
  return <>{format(shown)}</>;
}
