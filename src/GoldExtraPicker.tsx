import { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { GOLD_EXTRA_TIERS, goldChoicesFor, goldSlotOpen, goldSlotsFor, goldTraitDesc, goldTraitIcon, goldTraitId, goldTraitName } from './gold-traits';
import type { GoldSlot } from './gold-traits';
import type { Card, Player } from './game';

// CSA vàng thêm trong chi tiết thẻ (người dùng 2026-11-16): ô +11 cho mọi thẻ, thêm ô +7 cho ICON TM / INFINITE PRIME / PRIME / EL.
// GK chỉ chọn CSA của GK. Đổi miễn phí bất cứ lúc nào; thẻ tụt dưới mốc thì mất CSA của ô đó.
export default function GoldExtraPicker({ card, player, onChoose }: { card: Card; player: Player; onChoose: (slot: GoldSlot, trait: string | null) => Promise<void> | void }) {
  const [open, setOpen] = useState<GoldSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const slots = goldSlotsFor(player.tier), native = goldTraitId(player.id), choices = goldChoicesFor(player.pos);
  const pick = async (slot: GoldSlot, trait: string | null) => {
    if (busy) return;
    setBusy(true);
    try { await onChoose(slot, trait); setOpen(null); } finally { setBusy(false); }
  };
  return <section className="pd-goldx" aria-label="CSA vàng thêm">
    <span className="pd-goldx-title">CSA vàng thêm<small>{(GOLD_EXTRA_TIERS as readonly string[]).includes(player.tier) ? 'mở ở +7 và +11' : 'mở ở +11'} · đổi miễn phí · tụt dưới mốc thì mất</small></span>
    {slots.map(slot => {
      const unlocked = goldSlotOpen(player.tier, card.level, slot), id = unlocked ? card.gold?.[slot] : undefined;
      const other = slots.filter(s => s !== slot).map(s => card.gold?.[s]).filter(Boolean);
      return <div key={slot} className={`pd-goldx-slot${unlocked ? '' : ' is-locked'}`}>
        <b className="pd-goldx-level">+{slot}</b>
        {!unlocked ? <span className="pd-goldx-empty"><Lock size={13}/>Mở khi thẻ đạt +{slot}</span>
          : id ? <span className="pd-goldx-chosen" title={goldTraitDesc(id)}><img src={goldTraitIcon(id)} alt="" width={24} height={24}/>{goldTraitName(id)}</span>
          : <span className="pd-goldx-empty">Chưa chọn</span>}
        {unlocked && <span className="pd-goldx-actions">
          <button type="button" className="secondary-button" disabled={busy} aria-expanded={open === slot} onClick={() => setOpen(open === slot ? null : slot)}>{id ? 'Đổi' : 'Chọn'}</button>
          {id && <button type="button" className="icon-button" disabled={busy} aria-label={`Bỏ CSA ô +${slot}`} onClick={() => void pick(slot, null)}><X size={14}/></button>}
        </span>}
        {open === slot && <div className="pd-goldx-grid" role="listbox" aria-label={`Chọn CSA vàng ô +${slot}`}>
          {choices.map(t => {
            const taken = t === native || other.includes(t);
            return <button key={t} type="button" role="option" aria-selected={t === id} disabled={busy || taken} className={t === id ? 'is-on' : undefined}
              title={taken ? (t === native ? 'Thẻ đã có sẵn CSA này' : 'Đã chọn ở ô khác') : goldTraitDesc(t)} onClick={() => void pick(slot, t)}>
              <img src={goldTraitIcon(t)} alt="" width={30} height={30}/><span>{goldTraitName(t)}</span></button>;
          })}
        </div>}
      </div>;
    })}
  </section>;
}
