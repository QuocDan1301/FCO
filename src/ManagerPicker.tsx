import { X } from 'lucide-react';
import { MANAGER_IDS, managerImage } from './managers';
import './manager-picker.css';

// Chọn Nhà quản lý (người dùng 2026-11-24): bấm "Nhà quản lý" ở menu thanh tím mở bảng ảnh các HLV; ảnh chọn hiện ở khung HLV của màn Đội hình.
// Chỉ để hiển thị; lưu ở Save.manager (mã nhân sự, bỏ trống = ảnh mặc định).
export default function ManagerPicker({ value, onChoose, onClose }: { value?: string; onChoose: (id: string | null) => void; onClose: () => void }) {
  return <div className="mp" role="dialog" aria-modal="true" aria-label="Chọn nhà quản lý">
    <header className="mp-bar"><h2>Chọn nhà quản lý</h2><button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}><X/></button></header>
    <p className="mp-note">Ảnh được chọn hiện ở khung HLV của màn Đội hình.</p>
    <div className="mp-grid" role="listbox" aria-label="Danh sách nhà quản lý">
      <button type="button" role="option" aria-selected={!value} className={`mp-item${!value ? ' is-on' : ''}`} onClick={() => onChoose(null)} title="Mặc định"><img src={managerImage()} alt="Mặc định" width={72} height={72}/><span>Mặc định</span></button>
      {MANAGER_IDS.map(id => <button key={id} type="button" role="option" aria-selected={value === id} className={`mp-item${value === id ? ' is-on' : ''}`} onClick={() => onChoose(id)}>
        <img src={managerImage(id)} alt="" width={72} height={72} loading="lazy" decoding="async"/></button>)}
    </div>
  </div>;
}
