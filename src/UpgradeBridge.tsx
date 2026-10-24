import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { previewUpgrade, type BridgeState, type ManualOutcome, type TurnLog, type UpgradeRole } from './upgrade/engine';
import { BRIDGE_CONFIG } from './upgrade/config';
import { dropRange, formatChain } from './upgrade/dropTracking';
import { HIDDEN_LABELS } from './upgrade/hiddenPattern';
import './upgrade-bridge.css';

const percent = (value: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`;
const outcomeText = (turn: TurnLog) => turn.success ? 'Thành công' : `Rớt về +${turn.drop}`;

function LastTurn({ turn }: { turn: TurnLog }) {
  if (turn.rate === null) return <p className="bridge-last">Nhập tay +{turn.targetLevel - 1} → +{turn.targetLevel}: <b>{outcomeText(turn)}</b></p>;
  return <p className="bridge-last">
    Lượt trước +{turn.targetLevel - 1} → +{turn.targetLevel} ({turn.role === 'material' ? 'phôi' : 'thẻ chính'}): áp dụng <b>{percent(turn.rate)}</b>
    {' '}= gốc {percent(turn.baseRate!)}{turn.bonus > 0 ? ` + thưởng ${percent(turn.bonus)}` : ''} · <b className={turn.success ? 'is-win' : 'is-loss'}>{outcomeText(turn)}</b>
  </p>;
}

// Hiển thị trong lò nâng cấp: vai trò thẻ, tỷ lệ gốc, tín hiệu cầu công khai và kết quả lượt trước.
// Không hiện dây hiện tại, lịch sử dây hay cầu ngầm.
export function BridgeStatus({ bridge, currentLevel, baseRate, role, onRole }: { bridge: BridgeState; currentLevel: number | null; baseRate: number; role: UpgradeRole; onRole: (role: UpgradeRole) => void }) {
  const preview = currentLevel !== null && currentLevel < BRIDGE_CONFIG.maxLevel ? previewUpgrade(bridge, currentLevel, baseRate) : null;
  const last = bridge.log[0];
  return <div className="bridge-status">
    <div className="fco-row"><span>Thẻ đem đập</span><div className="bridge-roles" role="radiogroup" aria-label="Vai trò thẻ đem đập">
      {([['material', 'Phôi dò cầu'], ['main', 'Thẻ chính']] as const).map(([value, label]) => <button key={value} role="radio" aria-checked={role === value} className={role === value ? 'on' : ''} onClick={() => onRole(value)}>{label}</button>)}
    </div></div>
    {preview && <p className="bridge-rate" aria-live="polite">
      Gốc <b>{percent(preview.baseRate)}</b>
      {preview.publicLength > 0
        ? <> · <span className="bridge-signal">Khớp cầu công khai {preview.publicLength} số +{percent(preview.publicBonus)}</span> → <b>{percent(preview.rate)}</b></>
        : <> · <span className="bridge-muted">Chưa khớp cầu công khai</span></>}
    </p>}
    {last && <LastTurn turn={last}/>}
  </div>;
}

// Công cụ kiểm thử: nhập tay kết quả, reset mô phỏng, xem cầu ngầm đã chọn sau lượt đập (developer).
export function BridgeLab({ bridge, role, onRole, onManual, onReset, onClose }: { bridge: BridgeState; role: UpgradeRole; onRole: (role: UpgradeRole) => void; onManual: (currentLevel: number, outcome: ManualOutcome) => void; onReset: () => void; onClose: () => void }) {
  const [currentLevel, setCurrentLevel] = useState(7);
  const [drop, setDrop] = useState(1);
  const [reveal, setReveal] = useState(false);
  const max = dropRange(currentLevel).max;
  const last = bridge.log[0];
  return <>
    <div className="modal-heading"><h2>Kiểm thử bắt cầu</h2><button className="icon-button" aria-label="Đóng kiểm thử" onClick={onClose}><X/></button></div>
    <div className="bridge-lab">
      <div className="fco-row"><span>Thẻ đem đập</span><div className="bridge-roles" role="radiogroup" aria-label="Vai trò thẻ đem đập">
        {([['material', 'Phôi dò cầu'], ['main', 'Thẻ chính']] as const).map(([value, label]) => <button key={value} role="radio" aria-checked={role === value} className={role === value ? 'on' : ''} onClick={() => onRole(value)}>{label}</button>)}
      </div></div>
      <p className="bridge-muted">Ghi kết quả vào dây như một lượt thật nhưng không roll và không thay đổi thẻ. Dùng để dựng tình huống kiểm thử.</p>
      <label className="bridge-field">Cấp nâng<select value={currentLevel} onChange={e => { const level = Number(e.target.value); setCurrentLevel(level); setDrop(d => Math.min(d, dropRange(level).max)); }}>
        {Array.from({ length: BRIDGE_CONFIG.maxLevel - 1 }, (_, i) => <option key={i} value={i + 1}>+{i + 1} → +{i + 2}</option>)}
      </select></label>
      <div className="bridge-manual">
        <button className="fco-ghost" onClick={() => onManual(currentLevel, { success: true })}>Ghi thành công</button>
        <label className="bridge-field">Rớt về<select value={drop} onChange={e => setDrop(Number(e.target.value))}>{Array.from({ length: max }, (_, i) => <option key={i} value={i + 1}>+{i + 1}</option>)}</select></label>
        <button className="fco-ghost" onClick={() => onManual(currentLevel, { success: false, drop })}>Ghi thất bại</button>
      </div>
      {last && <LastTurn turn={last}/>}
      <label className="bridge-check"><input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)}/>Hiện cầu ngầm đã chọn ở lượt vừa đập (developer)</label>
      {reveal && last && last.rate !== null && <dl className="bridge-dev">
        <div><dt>Cầu ngầm được chọn</dt><dd>{last.hiddenKind ? HIDDEN_LABELS[last.hiddenKind] : 'Không có loại đủ điều kiện'}</dd></div>
        {last.hiddenPattern && <div><dt>Mẫu</dt><dd>{formatChain(last.hiddenPattern)}</dd></div>}
        <div><dt>Khớp cầu ngầm</dt><dd>{last.hiddenKind ? (last.hiddenBonus > 0 ? `Có · +${percent(last.hiddenBonus)}` : 'Không') : '—'}</dd></div>
        <div><dt>Cầu công khai</dt><dd>{last.publicLength ? `${last.publicLength} số · +${percent(last.publicBonus)}` : 'Không khớp'}</dd></div>
      </dl>}
      <button className="fco-ghost bridge-reset" onClick={onReset}><RotateCcw size={15}/>Reset mô phỏng</button>
    </div>
  </>;
}
