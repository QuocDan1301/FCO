import { ShieldPlus, X } from 'lucide-react';
import { getPlayer, money } from './game';
import type { Card } from './game';
import { marketQuote } from './market';
import { PROTECT_STEP, protectionCost } from './insurance';

type Props = { card: Card; pct: number; fixed: boolean; balance: number; free: boolean; onChange: (pct: number, fixed: boolean) => void; onClose: () => void };

// Chọn mức bảo vệ nâng cấp (0–100%) và có lưu cố định cho các lần đập sau hay không.
export default function UpgradeProtection({ card, pct, fixed, balance, free, onChange, onClose }: Props) {
  const quote = marketQuote(card);
  const full = protectionCost(card, 100), cost = protectionCost(card, pct);
  const steps = Array.from({ length: 100 / PROTECT_STEP + 1 }, (_, i) => i * PROTECT_STEP);
  return <>
    <div className="modal-heading"><h2><ShieldPlus size={20}/>Bảo vệ nâng cấp</h2><button className="icon-button" aria-label="Đóng bảo vệ nâng cấp" onClick={onClose}><X/></button></div>
    <div className="protect-body">
      <p className="protect-card"><b>{getPlayer(card).name} +{card.level}</b> · Giá {quote.price === null ? 'chưa có' : money(quote.price)} BP</p>
      {full === null ? <p className="protect-note">Thẻ chưa có giá nên chưa dùng được bảo vệ nâng cấp.</p> : <>
        <div className="protect-steps" role="radiogroup" aria-label="Mức bảo vệ">{steps.map(step => <button key={step} role="radio" aria-checked={pct === step} className={pct === step ? 'on' : ''} onClick={() => onChange(step, fixed)}>{step}%</button>)}</div>
        <input className="protect-range" type="range" min={0} max={100} step={PROTECT_STEP} value={pct} aria-label="Mức bảo vệ" onChange={e => onChange(Number(e.target.value), fixed)}/>
        <dl className="protect-summary">
          <div><dt>Phí bảo vệ</dt><dd>{cost ? `${money(cost)} BP` : 'Không dùng'}</dd></div>
          <div><dt>Mức 100%</dt><dd>{money(full)} BP · {Math.round(quote.insuranceRate * 100)}% giá thẻ</dd></div>
          <div><dt>Nếu thất bại</dt><dd>{pct === 100 ? `Giữ nguyên +${card.level}` : pct ? `${pct}% giữ nguyên +${card.level}, ${100 - pct}% rớt ngẫu nhiên` : `Rớt ngẫu nhiên +1 … +${card.level - 1}`}</dd></div>
        </dl>
        {!free && cost !== null && cost > balance && <p className="protect-note is-warn">Số dư không đủ trả phí bảo vệ.</p>}
        <p className="protect-note">Phí bảo vệ bị trừ khi đập, dù thành công hay thất bại.</p>
      </>}
      <label className="protect-fixed"><input type="checkbox" checked={fixed} onChange={e => onChange(pct, e.target.checked)}/>Cố định chi phí: giữ mức này cho các lần đập sau</label>
      <button className="primary-button protect-done" onClick={onClose}>Xong</button>
    </div>
  </>;
}
