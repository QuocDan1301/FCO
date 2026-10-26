import { useEffect, useState } from 'react';

// Thanh tin "Live" ở đầu khung sân trang chủ: lần lượt hiện từng tin (trượt lên, rõ dần), mỗi tin 5,2 giây.
// Đổi tin chỉ render lại component này, không render lại cả trang.
export default function LiveTicker({ messages, reduced }: { messages: string[]; reduced: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const timer = window.setInterval(() => setIndex(i => i + 1), 5200);
    return () => clearInterval(timer);
  }, [messages.length]);
  if (!messages.length) return null;
  return <div className="live-ticker" aria-live="off">
    <span className="live-ticker-tag"><i aria-hidden="true"/>LIVE</span>
    <p key={index} className={`live-ticker-msg${reduced ? '' : ' is-animated'}`}>{messages[index % messages.length]}</p>
  </div>;
}
