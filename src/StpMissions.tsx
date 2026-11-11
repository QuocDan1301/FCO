import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { money } from './game';
import { STP_ICON } from './stp';
import { STP_MISSIONS, claimableMissions } from './stp-missions';
import type { StpMissionId, StpMissionState } from './stp-missions';
import { asset } from './asset';

// Bảng nhiệm vụ Star Point hằng ngày (mở từ ô STP trên thanh trên cùng hoặc nút trong Shop).
type Props = { state: StpMissionState | null; error: string; stp: number; onClaim: (id: StpMissionId) => Promise<boolean>; onClose: () => void };

export default function StpMissions({ state, error, stp, onClaim, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const status = (id: string) => state?.missions.find(m => m.id === id);
  const ready = claimableMissions(state);
  return <div className="stp-missions">
    <div className="modal-heading"><div><span className="stp-missions-kicker">Làm mới mỗi ngày lúc 00:00</span><h2>Nhiệm vụ Star Point</h2></div><button className="icon-button" aria-label="Đóng nhiệm vụ" onClick={onClose}><X/></button></div>
    <p className="stp-missions-have"><img src={asset(STP_ICON)} alt="" width={18} height={18}/>Bạn có <b>{money(stp)} STP</b>{ready > 0 && <span> · {ready} phần thưởng chờ nhận</span>}</p>
    {error ? <p className="stp-missions-error">{error}</p> : !state ? <p className="stp-missions-loading">Đang tải nhiệm vụ…</p> : null}
    <ul className="stp-missions-list">
      {STP_MISSIONS.map(mission => {
        const s = status(mission.id);
        const done = !!s?.done, claimed = !!s?.claimed;
        return <li key={mission.id} className={claimed ? 'is-claimed' : done ? 'is-ready' : ''}>
          <div className="stp-mission-text"><b>{mission.title}</b><small>{mission.hint}</small></div>
          <span className="stp-mission-reward"><img src={asset(STP_ICON)} alt="" width={16} height={16}/>+{mission.reward}</span>
          {claimed ? <span className="stp-mission-state is-claimed"><Check size={15}/>Đã nhận</span>
            : done ? <button className="stp-mission-claim" disabled={!!busy} onClick={() => { setBusy(mission.id); void onClaim(mission.id).finally(() => setBusy(null)); }}>{busy === mission.id ? 'Đang nhận…' : 'Nhận'}</button>
            : <span className="stp-mission-state">Chưa đạt</span>}
        </li>;
      })}
    </ul>
    <p className="stp-missions-note">Nhiệm vụ nâng cấp được tính khi đập thẻ thành công và thẻ đạt từ mức yêu cầu trở lên. Mỗi nhiệm vụ nhận thưởng một lần mỗi ngày, phải hoàn thành trong ngày.</p>
  </div>;
}
