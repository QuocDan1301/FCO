import { useEffect, useState } from 'react';
import { isNameEffect, nameEffectClass } from './name-effects';

// Một tin: chữ + (tuỳ chọn) tên HLV trong câu và hiệu ứng tên Premium để tô lên đúng phần tên.
export type TickerMessage = { text: string; name?: string | null; effect?: string | null };
const keyOf = (m: TickerMessage | string) => typeof m === 'string' ? m : m.text;
function Message({ m }: { m: TickerMessage | string }) {
  if (typeof m === 'string' || !m.name || !isNameEffect(m.effect)) return <>{keyOf(m)}</>;
  const at = m.text.indexOf(m.name);
  if (at < 0) return <>{m.text}</>;
  return <>{m.text.slice(0, at)}<span className={nameEffectClass(m.effect).trim()}>{m.name}</span>{m.text.slice(at + m.name.length)}</>;
}

// Thanh tin "Live" ở đầu khung sân trang chủ: lần lượt hiện từng tin (trượt lên, rõ dần), mỗi tin 5,2 giây.
// Không có tin thì vẫn giữ thanh (nhãn LIVE) nhưng để trống.
// Đổi tin chỉ render lại component này, không render lại cả trang.
// Tên HLV có hiệu ứng Premium thì tô hiệu ứng như ở BXH.
export default function LiveTicker({ messages, reduced }: { messages: (TickerMessage | string)[]; reduced: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setIndex(i => i + 1), 5200);
    return () => clearInterval(timer);
  }, [messages.length]);
  return <div className="live-ticker" aria-live="off">
    <span className="live-ticker-tag"><i aria-hidden="true"/>LIVE</span>
    {messages.length > 0 && <p key={`${index}-${keyOf(messages[index % messages.length])}`} className={`live-ticker-msg${reduced ? '' : ' is-animated'}`}><Message m={messages[index % messages.length]}/></p>}
  </div>;
}
