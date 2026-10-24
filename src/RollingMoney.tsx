import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { money } from './game';

export default function RollingMoney({ value, reduced = false }: { value: number | null; reduced?: boolean }) {
  const prefersReduced = useReducedMotion();
  const text = value === null ? 'Chưa có giá' : money(value);
  const [change, setChange] = useState({ text, from: text });
  if (change.text !== text) setChange({ text, from: change.text });
  if (reduced || prefersReduced || value === null) return <span>{text}</span>;

  const changed = change.from !== text;
  return <span className="rolling-money" aria-label={text}>
    <span className="rolling-money-digits" aria-hidden="true">
      {Array.from(text).map((character, index) => {
        if (!/\d/.test(character)) return <span className="rolling-money-cell" key={text.length - index}>{character}</span>;
        const oldCharacter = change.from[change.from.length - text.length + index];
        const start = /\d/.test(oldCharacter ?? '') ? Number(oldCharacter) : 0;
        const end = Number(character);
        const steps = changed ? 10 + (end - start + 10) % 10 : 0;
        const digits = Array.from({ length: steps + 1 }, (_, step) => (start + step) % 10);
        return <span className="rolling-money-cell is-digit" key={text.length - index}>
          <motion.span className="rolling-money-reel" key={text}
            initial={{ y: '0em' }} animate={{ y: `-${steps * 1.15}em` }}
            transition={{ duration: changed ? .6 + index * .02 : 0, ease: [.12, .65, .16, 1] }}>
            {(changed ? digits : [end]).map((digit, step) => <span className="rolling-money-digit" key={step}>{digit}</span>)}
          </motion.span>
        </span>;
      })}
    </span>
  </span>;
}

export function UpgradePriceChange({ before, after, reduced }: { before: number | null; after: number | null; reduced: boolean }) {
  const prefersReduced = useReducedMotion();
  const [current, setCurrent] = useState(before);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(after), reduced || prefersReduced ? 0 : 80);
    return () => window.clearTimeout(timer);
  }, [after, reduced, prefersReduced]);

  return <section className="upgrade-price-change" aria-label="Giá cầu thủ trước và sau nâng cấp">
    <span>Giá cầu thủ</span>
    <div><s>{before === null ? 'Chưa có giá' : `${money(before)} BP`}</s><span aria-hidden="true">→</span>
      <strong><RollingMoney value={reduced || prefersReduced ? after : current} reduced={reduced}/>{after !== null && ' BP'}</strong>
    </div>
  </section>;
}
