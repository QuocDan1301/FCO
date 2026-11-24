import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { money } from './game';
import { STP_ICON } from './stp';
import { STP_MISSIONS, claimableMissions } from './stp-missions';
import type { StpMissionId, StpMissionState } from './stp-missions';
import { claimableGrind, grindReady } from './grind-missions';
import type { GrindPeriod, GrindState } from './grind-missions';
import { findPack } from './event';
import PackImage from './PackImage';
import { asset } from './asset';

// Bảng nhiệm vụ (nút Nhiệm vụ ở thanh dưới, ô STP trên thanh trên cùng, nút trong Shop): 3 tab
// - Hằng ngày / Hằng tuần: nhiệm vụ cày chay thưởng gói cầu thủ (grind-missions.ts, migration 202611150006);
// - Star Point: nhiệm vụ STP hằng ngày (đập Messi / Ronaldo, chuỗi Penalty).
type Tab = GrindPeriod | 'stp';
type Props = {
  state: StpMissionState | null; grind: GrindState | null; error: string; stp: number;
  onClaim: (id: StpMissionId) => Promise<boolean>; onClaimGrind: (id: string) => Promise<boolean>; onClose: () => void; initialTab?: Tab;
  // Kho thẻ đang chạy trên trình duyệt (bản game khác danh mục máy chủ): đập thẻ không được máy chủ ghi nhận vào nhiệm vụ.
  localUpgrade?: boolean;
};

const TAB_LABEL: Record<Tab, string> = { day: 'Hằng ngày', week: 'Hằng tuần', stp: 'Star Point' };
const TAB_KICKER: Record<Tab, string> = { day: 'Làm mới mỗi ngày lúc 00:00', week: 'Làm mới 00:00 thứ Hai', stp: 'Làm mới mỗi ngày lúc 00:00' };

export default function StpMissions({ state, grind, error, stp, onClaim, onClaimGrind, onClose, initialTab = 'day', localUpgrade = false }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const status = (id: string) => state?.missions.find(m => m.id === id);
  const ready: Record<Tab, number> = { day: claimableGrind(grind, 'day'), week: claimableGrind(grind, 'week'), stp: claimableMissions(state) };
  const run = (id: string, task: () => Promise<boolean>) => { setBusy(id); void task().finally(() => setBusy(null)); };
  const loading = tab === 'stp' ? !state : !grind;
  return <div className="stp-missions">
    <div className="modal-heading"><div><span className="stp-missions-kicker">{TAB_KICKER[tab]}</span><h2>Trung tâm nhiệm vụ</h2></div><button className="icon-button" aria-label="Đóng nhiệm vụ" onClick={onClose}><X/></button></div>
    <div className="missions-tabs" role="tablist" aria-label="Loại nhiệm vụ">
      {(['day', 'week', 'stp'] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'is-active' : ''} onClick={() => setTab(t)}>
        {TAB_LABEL[t]}{ready[t] > 0 && <b aria-label={`${ready[t]} phần thưởng chờ nhận`}>{ready[t]}</b>}</button>)}
    </div>
    {tab === 'stp' && <p className="stp-missions-have"><img src={asset(STP_ICON)} alt="" width={18} height={18}/>Bạn có <b>{money(stp)} STP</b></p>}
    {localUpgrade && <p className="stp-missions-error" role="alert">Bản game trên máy bạn đã cũ nên lần đập thẻ không được tính vào nhiệm vụ. Hãy tải lại trang (hoặc đóng hẳn app rồi mở lại) trước khi đập thẻ.</p>}
    {error ? <p className="stp-missions-error">{error}</p> : loading ? <p className="stp-missions-loading">Đang tải nhiệm vụ…</p> : null}
    {tab !== 'stp' ? <ul className="stp-missions-list grind-list">
      {(grind?.missions ?? []).filter(m => m.period === tab).map(m => {
        const done = grindReady(m) || m.claimed;
        return <li key={m.id} className={m.claimed ? 'is-claimed' : done ? 'is-ready' : ''}>
          <div className="stp-mission-text"><b>{m.title}</b><small>{m.hint}</small>
            <span className="grind-progress" role="progressbar" aria-valuemin={0} aria-valuemax={m.goal} aria-valuenow={m.progress} aria-label={`${m.progress} / ${m.goal}`}>
              <i style={{ width: `${Math.min(100, (m.progress / m.goal) * 100)}%` }}/><em>{money(m.progress)} / {money(m.goal)}</em></span></div>
          <span className="grind-reward">{m.rewards.map((r, i) => {
            const pack = 'pack' in r && typeof r.pack === 'string' ? findPack(r.pack) : undefined;
            return pack ? <span key={i} className="grind-pack" title={pack.name}><PackImage pack={pack}/><small>{pack.name}</small></span> : null;
          })}</span>
          {m.claimed ? <span className="stp-mission-state is-claimed"><Check size={15}/>Đã nhận</span>
            : done ? <button className="stp-mission-claim" disabled={!!busy} onClick={() => run(m.id, () => onClaimGrind(m.id))}>{busy === m.id ? 'Đang nhận…' : 'Nhận'}</button>
            : <span className="stp-mission-state">Chưa đạt</span>}
        </li>;
      })}
    </ul> : <ul className="stp-missions-list">
      {STP_MISSIONS.map(mission => {
        const s = status(mission.id);
        const done = !!s?.done, claimed = !!s?.claimed;
        return <li key={mission.id} className={claimed ? 'is-claimed' : done ? 'is-ready' : ''}>
          <div className="stp-mission-text"><b>{mission.title}</b><small>{mission.hint}</small></div>
          <span className="stp-mission-reward"><img src={asset(STP_ICON)} alt="" width={16} height={16}/>+{mission.reward}</span>
          {claimed ? <span className="stp-mission-state is-claimed"><Check size={15}/>Đã nhận</span>
            : done ? <button className="stp-mission-claim" disabled={!!busy} onClick={() => run(mission.id, () => onClaim(mission.id))}>{busy === mission.id ? 'Đang nhận…' : 'Nhận'}</button>
            : <span className="stp-mission-state">Chưa đạt</span>}
        </li>;
      })}
    </ul>}
    <p className="stp-missions-note">{tab === 'stp'
      ? 'Nhiệm vụ nâng cấp được tính khi đập thẻ thành công và thẻ đạt từ mức yêu cầu trở lên. Mỗi nhiệm vụ nhận thưởng một lần mỗi ngày, phải hoàn thành trong ngày.'
      : 'Máy chủ tự đếm: trận GLXH đã đá xong (bỏ trận tính là thua), mỗi quả sút vào / bắt được trong Penalty, mỗi lần đập thẻ thành công. Mỗi nhiệm vụ nhận thưởng một lần mỗi kỳ; gói cầu thủ vào Kho vật phẩm.'}</p>
  </div>;
}
