import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './terms.css';

// Điều khoản dịch vụ (người dùng 2026-11-15): hiện ở màn đăng nhập / đăng ký (bắt buộc đồng ý khi tạo tài khoản)
// và trong game ở Cài đặt → Điều khoản dịch vụ. Đổi nội dung quan trọng thì nâng TERMS_VERSION + ngày cập nhật.
export const TERMS_VERSION = '2026-11-15';
export const TERMS_UPDATED = '15/11/2026';

type Section = { title: string; items: string[] };

export const TERMS: Section[] = [
  { title: '1. Chấp nhận điều khoản', items: [
    'FCO VIP (sau đây gọi là "Game") là dự án giả lập do người hâm mộ bóng đá thực hiện. Khi tạo tài khoản, đăng nhập hoặc tiếp tục chơi, bạn xác nhận đã đọc, hiểu và đồng ý với toàn bộ Điều khoản dịch vụ này.',
    'Nếu không đồng ý, vui lòng không sử dụng Game. Người dưới 16 tuổi nên có sự đồng ý của cha mẹ hoặc người giám hộ trước khi chơi.',
  ] },
  { title: '2. Tài khoản', items: [
    'Tài khoản đăng ký bằng địa chỉ Gmail; mỗi Gmail chỉ được một tài khoản. Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động diễn ra trên tài khoản của mình.',
    'Tên huấn luyện viên không được mạo danh quản trị viên hay người khác, không chứa nội dung xúc phạm, phản cảm, chính trị, quảng cáo hoặc vi phạm pháp luật. Quản trị viên có quyền đổi hoặc khoá tên vi phạm.',
    'Không mua bán, cho thuê, chia sẻ hay chuyển nhượng tài khoản. Tài khoản bị mất do tự chia sẻ mật khẩu sẽ không được hỗ trợ khôi phục.',
    'Mỗi thiết bị chỉ được dùng cho một tài khoản nhận quà (gift code, quà sự kiện, quà từ quản trị viên). Lập nhiều tài khoản phụ để nhận quà là vi phạm.',
    'Bạn có thể tự xoá tài khoản trong Cài đặt. Việc xoá là vĩnh viễn: toàn bộ kho thẻ, FC, BP và tiến trình sẽ mất và không thể khôi phục.',
  ] },
  { title: '3. Vật phẩm ảo', items: [
    'FC, BP, thẻ cầu thủ, gói, vé sự kiện, lượt chơi, phiếu giảm thuế và các vật phẩm khác trong Game là vật phẩm ảo, chỉ có giá trị sử dụng trong Game. Chúng không phải tiền, không có giá trị quy đổi thành tiền hay tài sản bên ngoài Game, và thuộc quyền quản lý của Game; bạn được cấp quyền sử dụng chúng khi chơi.',
    'FC chỉ được cấp qua các kênh chính thức do quản trị viên công bố (trong Game hoặc nhóm Zalo chính thức). Giao dịch qua người trung gian hay kênh không chính thức sẽ không được hỗ trợ.',
    'FC và vật phẩm đã dùng (mua gói, chơi sự kiện, đóng thuế, nâng cấp…) không được hoàn lại, trừ khi quản trị viên xác nhận lỗi đến từ hệ thống.',
    'Nghiêm cấm mua bán, trao đổi FC, vật phẩm hay tài khoản lấy tiền thật hoặc tài sản bên ngoài Game.',
  ] },
  { title: '4. Tỷ lệ, giá và kết quả', items: [
    'Kết quả mở gói, nâng cấp thẻ, sự kiện, trận đấu giả lập, Penalty… do máy chủ quyết định theo tỷ lệ công bố trong Game. Kết quả đã được máy chủ ghi nhận là kết quả cuối cùng.',
    'Giá cầu thủ, thuế bán, tỷ lệ, quà và thể lệ có thể được điều chỉnh để cân bằng Game. Thay đổi được thông báo trong Game hoặc nhóm Zalo và áp dụng từ thời điểm công bố, không áp dụng ngược cho kết quả đã ghi nhận (trừ trường hợp ở Mục 6).',
  ] },
  { title: '5. Hành vi bị cấm', items: [
    'Dùng phần mềm hack, tool, bot, auto-click, chỉnh sửa dữ liệu, can thiệp vào mã nguồn, gói tin hoặc máy chủ của Game.',
    'Cố ý khai thác lỗi (bug) để trục lợi thay vì báo cho quản trị viên.',
    'Lập nhiều tài khoản phụ (clone) để nhận quà, dồn vật phẩm hoặc thao túng bảng xếp hạng; dò đoán gift code.',
    'Gian lận, lừa đảo, mạo danh quản trị viên; quấy rối, xúc phạm người chơi khác.',
    'Tấn công, gây quá tải hoặc làm gián đoạn dịch vụ.',
  ] },
  { title: '6. Lỗi hệ thống và thu hồi', items: [
    'Khi lỗi hệ thống làm phát sinh FC, BP, vé, gói, thẻ hay thứ hạng bất thường, quản trị viên có quyền điều chỉnh hoặc thu hồi phần phát sinh đó (kể cả những gì đã được đổi, mở hoặc bán từ phần đó), dù bạn có cố ý hay không.',
    'Nếu phát hiện lỗi, hãy báo ngay cho quản trị viên qua nhóm Zalo. Người chơi báo lỗi trung thực có thể được ghi nhận và tặng quà.',
  ] },
  { title: '7. Xử lý vi phạm', items: [
    'Tuỳ mức độ, vi phạm có thể bị: cảnh cáo; thu hồi FC, vật phẩm, quà và thứ hạng có được do vi phạm; loại khỏi bảng xếp hạng và sự kiện; khoá tài khoản tạm thời hoặc vĩnh viễn. Các tài khoản liên quan (cùng thiết bị, cùng người) có thể bị xử lý cùng lúc.',
    'Tài khoản bị khoá vì vi phạm không được hoàn lại FC hay vật phẩm. Bạn có thể khiếu nại qua nhóm Zalo; quyết định sau khi xem xét của quản trị viên là quyết định cuối cùng.',
  ] },
  { title: '8. Sự kiện, bảng xếp hạng và quà', items: [
    'Mỗi sự kiện và bảng xếp hạng có thể lệ riêng hiển thị trong Game. Quà được gửi theo kết quả máy chủ ghi nhận khi kết thúc, thường vào mục Quà từ Admin.',
    'Quản trị viên có quyền thay đổi, kéo dài, tạm dừng hoặc kết thúc sớm sự kiện; loại người vi phạm khỏi bảng xếp hạng và trao quà cho người kế tiếp.',
  ] },
  { title: '9. Dữ liệu cá nhân', items: [
    'Game lưu: Gmail, tên huấn luyện viên, thông tin bạn tự điền (giới tính, ngày sinh), tiến trình chơi, lịch sử FC / vật phẩm, cùng mã thiết bị và địa chỉ IP dùng để chống gian lận và tài khoản phụ.',
    'Dữ liệu chỉ dùng để vận hành Game, hỗ trợ người chơi và chống gian lận; được lưu trên máy chủ cơ sở dữ liệu của Game (Supabase) và không bán cho bên thứ ba.',
    'Tên huấn luyện viên, đội hình, thành tích và thứ hạng có thể hiển thị công khai cho người chơi khác (bảng xếp hạng, dòng LIVE, xem đội hình).',
    'Gmail chỉ dùng để gửi mã xác nhận và đặt lại mật khẩu. Khi bạn xoá tài khoản, dữ liệu gắn với tài khoản sẽ bị xoá, trừ nhật ký cần giữ để chống gian lận.',
  ] },
  { title: '10. Dịch vụ', items: [
    'Game được cung cấp "nguyên trạng". Game có thể bảo trì, cập nhật, thay đổi tính năng, tạm dừng hoặc ngừng hoạt động bất cứ lúc nào; quản trị viên sẽ cố gắng thông báo trước.',
    'Game không chịu trách nhiệm cho gián đoạn do mạng, thiết bị, trình duyệt của người chơi hoặc sự cố từ nhà cung cấp dịch vụ bên ngoài.',
  ] },
  { title: '11. Bản quyền', items: [
    'Game là dự án phi chính thức của người hâm mộ, không liên kết, không được tài trợ hay xác nhận bởi EA, Nexon, Garena, các giải đấu, câu lạc bộ hay cầu thủ. Tên, hình ảnh, logo cầu thủ và câu lạc bộ thuộc về chủ sở hữu tương ứng.',
    'Nguồn ảnh và thông tin tham khảo được ghi ở Cài đặt → Thông tin & nguồn ảnh.',
  ] },
  { title: '12. Thay đổi điều khoản và liên hệ', items: [
    'Điều khoản có thể được cập nhật; phiên bản mới có hiệu lực từ khi công bố trong Game. Tiếp tục chơi sau khi cập nhật nghĩa là bạn đồng ý với phiên bản mới.',
    'Mọi thắc mắc, khiếu nại, báo lỗi: liên hệ quản trị viên qua nhóm Zalo chính thức của Game.',
  ] },
];

/** Nội dung điều khoản (dùng trong Modal của game và hộp thoại ở màn đăng nhập). */
export function TermsContent() {
  return <div className="terms-content">
    <p className="terms-updated">Cập nhật lần cuối: {TERMS_UPDATED}</p>
    {TERMS.map(s => <section key={s.title}><h3>{s.title}</h3><ul>{s.items.map((t, i) => <li key={i}>{t}</li>)}</ul></section>)}
  </div>;
}

/** Hộp thoại điều khoản cho màn tài khoản (chưa vào game nên không có Modal của App). */
export function TermsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(<div className="terms-backdrop" onClick={onClose}>
    <div className="terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" onClick={e => e.stopPropagation()}>
      <div className="terms-head"><h2 id="terms-title">Điều khoản dịch vụ</h2><button ref={closeRef} type="button" className="terms-close" aria-label="Đóng điều khoản" onClick={onClose}><X size={20}/></button></div>
      <TermsContent/>
      <div className="terms-foot"><button type="button" onClick={onClose}>Đã hiểu</button></div>
    </div>
  </div>, document.body);
}
