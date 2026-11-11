import { useState } from 'react';
import { AlertTriangle, CalendarCheck, CalendarDays, Crown, IdCard, Lock, Settings2, Sparkles, UserRound, X } from 'lucide-react';
import { NAME_EFFECTS, avatarEffectClass, nameEffectClass } from './name-effects';
import type { NameEffect } from './name-effects';
import type { Profile, Save } from './game';
import { ACCOUNT_TIERS, GENDERS, MONTH_DAYS, accountTierOf, pad, playedDays } from './profile';
import type { AccountTier } from './profile';

// Thông tin HLV (bấm avatar trên thanh trên cùng): ID = tên đăng nhập, giới tính và sinh nhật (ngày/tháng, không năm) do người chơi
// tự chọn và lưu trong bản lưu (Save.profile), ngày bắt đầu chơi = ngày tạo tài khoản, loại tài khoản (Classic / Premium) do admin đặt trên máy chủ, không phải gói thành viên trong Shop.
// Giới tính / sinh nhật chỉ lưu được một lần (người dùng yêu cầu 2026-11-11): mục đã lưu không sửa được, máy chủ cũng giữ giá trị cũ
// (fco_inv_merge, migration 202611110002). Chỉ mục còn trống mới chọn được, phải chọn đủ rồi xác nhận mới lưu.
const dateText = (ms: number) => new Date(ms).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
const genderLabel = (id: string | undefined) => GENDERS.find(g => g.id === id)?.label;

// effect: hiệu ứng avatar + tên đang dùng (chỉ Premium); onEffect gửi lựa chọn lên máy chủ (null = tắt).
type Props = { save: Save; accountId?: string; joined?: number | null; tier?: AccountTier | null; effect?: NameEffect | null; onEffect?: (effect: NameEffect | null) => Promise<boolean> | boolean; onSave: (profile: Profile) => void; onSettings: () => void; onClose: () => void };

export default function ProfileCard({ save, accountId, joined, tier: tierId, effect = null, onEffect, onSave, onSettings, onClose }: Props) {
  const profile = save.profile ?? {};
  const needGender = !profile.gender, needBirthday = !profile.birthday;
  const [gender, setGender] = useState('');
  const [day, setDay] = useState(0);
  const [month, setMonth] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const tier = { id: accountTierOf(tierId), name: ACCOUNT_TIERS[accountTierOf(tierId)] };
  const premium = tier.id === 'premium';
  const shown = premium ? effect : null;
  const [effectBusy, setEffectBusy] = useState(false);
  const pickEffect = async (next: NameEffect | null) => {
    if (!onEffect || effectBusy || next === shown) return;
    setEffectBusy(true);
    try { await onEffect(next); } finally { setEffectBusy(false); }
  };
  const initials = (accountId ?? 'HLV').slice(0, 3).toUpperCase();
  const maxDay = month ? MONTH_DAYS[month - 1] : 31;
  const birthday = day && month && day <= maxDay ? `${pad(day)}-${pad(month)}` : null;
  const ready = (!needGender || !!gender) && (!needBirthday || !!birthday);
  const pending: Profile = { ...(needGender && gender ? { gender: gender as NonNullable<Profile['gender']> } : {}), ...(needBirthday && birthday ? { birthday } : {}) };
  const locked = <small className="profile-locked"><Lock size={11}/>Đã lưu</small>;
  return <div className="profile-card">
    <div className="modal-heading"><h2>Thông tin HLV</h2><button className="icon-button" aria-label="Đóng thông tin" onClick={onClose}><X/></button></div>
    <div className="profile-hero">
      <span className={`profile-avatar is-${tier.id}${avatarEffectClass(shown)}`} aria-hidden="true">{initials}</span>
      <div><b className={nameEffectClass(shown).trim() || undefined}>{accountId ?? 'Huấn luyện viên'}</b><span className={`profile-tier is-${tier.id}`}><Crown size={13}/>{tier.name}</span></div>
    </div>
    <dl className="profile-rows">
      <div><dt><IdCard size={15}/>ID</dt><dd>{accountId ?? '—'}</dd></div>
      <div><dt><UserRound size={15}/>Giới tính</dt><dd>{needGender
        ? <select aria-label="Giới tính" value={gender} disabled={confirming} onChange={e => setGender(e.target.value)}><option value="">Chọn</option>{GENDERS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        : <>{genderLabel(profile.gender)}{locked}</>}</dd></div>
      <div><dt><CalendarDays size={15}/>Sinh nhật</dt><dd>{needBirthday
        ? <span className="profile-birthday">
            <select aria-label="Ngày sinh" value={day} disabled={confirming} onChange={e => setDay(Number(e.target.value))}><option value={0}>Ngày</option>{Array.from({ length: maxDay }, (_, i) => <option key={i + 1} value={i + 1}>{pad(i + 1)}</option>)}</select>
            <select aria-label="Tháng sinh" value={month} disabled={confirming} onChange={e => { const m = Number(e.target.value); setMonth(m); if (m && day > MONTH_DAYS[m - 1]) setDay(0); }}><option value={0}>Tháng</option>{MONTH_DAYS.map((_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</select>
          </span>
        : <>{profile.birthday!.replace('-', '/')}{locked}</>}</dd></div>
      <div><dt><CalendarDays size={15}/>Bắt đầu chơi</dt><dd>{joined ? dateText(joined) : '—'}</dd></div>
      <div><dt><CalendarCheck size={15}/>Đã chơi</dt><dd>{joined ? `${playedDays(joined).toLocaleString('vi-VN')} ngày` : '—'}</dd></div>
      <div><dt><Crown size={15}/>Loại tài khoản</dt><dd>{tier.name}</dd></div>
    </dl>
    {(needGender || needBirthday)
      ? <p className="profile-hint">Giới tính và sinh nhật chỉ lưu được một lần, hãy chọn đúng trước khi lưu.</p>
      : <p className="profile-note">Thông tin đã lưu và không thể thay đổi.</p>}
    <section className="profile-effects" aria-label="Hiệu ứng avatar và tên">
      <h3><Sparkles size={15}/>Hiệu ứng avatar và tên</h3>
      <p>{premium ? 'Chọn hiệu ứng hiện ở avatar, bảng thông tin và tên của bạn trên BXH.' : 'Dành cho tài khoản Premium. Liên hệ admin để được nâng cấp.'}</p>
      <div className="profile-effect-grid">
        <button type="button" className="profile-effect" aria-pressed={premium && !shown} disabled={!premium || effectBusy} onClick={() => void pickEffect(null)}>
          <span className="fx-preview">{initials}</span><b>Không hiệu ứng</b><small>Avatar và tên thường</small>
        </button>
        {NAME_EFFECTS.map(fx => <button type="button" key={fx.id} className="profile-effect" aria-pressed={shown === fx.id} disabled={!premium || effectBusy} onClick={() => void pickEffect(fx.id)}>
          <span className={`fx-preview${avatarEffectClass(fx.id)}`}>{premium ? initials : <Lock size={13}/>}</span>
          <b className={nameEffectClass(fx.id).trim()}>{fx.name}</b><small>{fx.description}</small>
        </button>)}
      </div>
    </section>
    <div className="profile-actions">
      <button className="secondary-button" onClick={onSettings}><Settings2 size={15}/>Cài đặt trò chơi</button>
      {(needGender || needBirthday) && <button className="primary-button" onClick={() => setConfirming(true)} disabled={!ready}>Lưu thông tin</button>}
    </div>
    {/* Cảnh báo trước khi lưu: thông tin chỉ lưu được một lần. */}
    {confirming && <div className="profile-warning-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="profile-warning-title" aria-describedby="profile-warning-text"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setConfirming(false); } }}>
      <div className="profile-warning">
        <span className="profile-warning-icon" aria-hidden="true"><AlertTriangle size={26}/></span>
        <h3 id="profile-warning-title">Không thể thay đổi sau khi lưu</h3>
        <p id="profile-warning-text">Giới tính và sinh nhật chỉ lưu được <b>một lần</b>. Sau khi bấm lưu, bạn sẽ <b>không sửa được nữa</b>. Hãy kiểm tra kỹ:</p>
        <ul>
          {pending.gender && <li><span>Giới tính</span><b>{genderLabel(pending.gender)}</b></li>}
          {pending.birthday && <li><span>Sinh nhật</span><b>{pending.birthday.replace('-', '/')}</b></li>}
        </ul>
        <div className="profile-warning-actions">
          <button type="button" className="secondary-button" autoFocus onClick={() => setConfirming(false)}>Quay lại kiểm tra</button>
          <button type="button" className="primary-button profile-warning-save" onClick={() => { onSave(pending); setConfirming(false); }}>Tôi hiểu, lưu</button>
        </div>
      </div>
    </div>}  </div>;
}
