// Menu chế độ chơi ở trang chủ (thay phần giới thiệu "Chạm tới huyền thoại", người dùng yêu cầu 2026-11-12):
// biểu tượng nét trắng + chữ lớn xếp dọc. Biểu tượng tự vẽ.
import { Flame } from 'lucide-react';
import './plus8.css';

// onPlus8: nút sự kiện HOT "Đập 8 liền tay" (BXH đập +8, src/Plus8Page.tsx) đứng đầu menu.
type Props = { onRanked: () => void; onPenalty: () => void; onUpgrade: () => void; onRanks: () => void; onPlus8?: () => void };

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// GLXH: bảng chiến thuật (kẹp giấy, cầu thủ O / X, đường chạy nét đứt).
const RankedIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
  <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9.5 4V2.8h5V4"/>
  <circle cx="9" cy="9.5" r="1.4"/><path d="M13.6 8.2l2.4 2.4m0-2.4l-2.4 2.4"/>
  <path d="M8.6 17.2c1.6-2.4 3.8-3.2 6.2-3" strokeDasharray="1.5 1.6"/><path d="M13.6 12.6l1.5 1.5-1.8 1"/>
</svg>;
// Penalty: khung thành có lưới + quả bóng trên chấm phạt đền.
const PenaltyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
  <path d="M3 14V5h18v9"/><path d="M6.5 5v9M10 5v9M14 5v9M17.5 5v9M3 8.5h18M3 11.5h18" strokeWidth=".7" opacity=".55"/>
  <circle cx="12" cy="18.6" r="3"/><path d="M12 16.9l1.4 1-.5 1.6h-1.8l-.5-1.6z" strokeWidth="1"/>
</svg>;
// BXH: bục trao giải 3 bậc + ngôi sao.
const RanksIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
  <path d="M3 21v-6h6v6M9 21V11h6v10M15 21v-8h6v8M2 21h20"/><path d="M12 3.2l1.1 2.2 2.4.3-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.3z" strokeWidth="1.3"/>
</svg>;
// Nâng cấp thẻ: thẻ cầu thủ + mũi tên lên + tia sáng.
const UpgradeIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
  <path d="M7 3.5h10l1.5 2.5v13.5l-6.5 2-6.5-2V6z"/><path d="M12 16.5V8.5m-3.2 3.2L12 8.5l3.2 3.2"/>
  <path d="M20.5 2.5v2.4M19.3 3.7h2.4" strokeWidth="1.3"/>
</svg>;

// Sự kiện Đập 8: lá bài +8 với tia sét.
const Plus8Icon = () => <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
  <path d="M6 3.5h12v17H6z"/><path d="M13 6.5l-3.6 6h3.2l-1.6 5.2 4.4-6.6h-3.2z" fill="currentColor" strokeWidth="1"/>
</svg>;

export default function HomeModes({ onRanked, onPenalty, onUpgrade, onRanks, onPlus8 }: Props) {
  const modes = [
    { id: 'ranked', label: 'GLXH', hint: 'Đấu xếp hạng giả lập', icon: <RankedIcon/>, onClick: onRanked },
    { id: 'penalty', label: 'Penalty', hint: 'Sút phạt đền', icon: <PenaltyIcon/>, onClick: onPenalty },
    { id: 'upgrade', label: 'Nâng cấp thẻ', hint: 'Đập thẻ thử vận may', icon: <UpgradeIcon/>, onClick: onUpgrade },
    { id: 'ranks', label: 'BXH', hint: 'Bảng xếp hạng HLV', icon: <RanksIcon/>, onClick: onRanks },
  ];
  return <nav className="hero-modes" aria-label="Chế độ chơi">
    {onPlus8 && <button type="button" className="hero-hot" onClick={onPlus8} aria-label="Sự kiện hot · Đập 8 liền tay · Nhận ngay quà chất">
      <span className="hero-hot-icon"><Plus8Icon/></span>
      <span className="hero-hot-text"><b>Đập 8 liền tay</b><small>Nhận ngay quà chất</small></span>
      <span className="hero-hot-badge"><Flame aria-hidden="true"/>Hot</span>
    </button>}
    {modes.map(m => <button key={m.id} type="button" className={`hero-mode is-${m.id}`} onClick={m.onClick} aria-label={`${m.label} · ${m.hint}`}>
      <span className="hero-mode-icon">{m.icon}</span>
      <span className="hero-mode-text"><b>{m.label}</b><small>{m.hint}</small></span>
    </button>)}
  </nav>;
}
