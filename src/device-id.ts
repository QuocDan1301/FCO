// Mã thiết bị ngẫu nhiên lưu trong trình duyệt (không phải thông tin cá nhân), gửi kèm fco_heartbeat để máy chủ biết các tài khoản
// đăng nhập trên cùng một trình duyệt (hạn chế clone, migration 202611110014). Không lưu được (chế độ ẩn danh) thì tạo mã mới mỗi lần mở.
const KEY = 'fco-device';
let memo: string | null = null;
export function deviceId(): string {
  if (memo) return memo;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return (memo = saved);
    memo = crypto.randomUUID();
    localStorage.setItem(KEY, memo);
  } catch { memo ??= crypto.randomUUID(); }
  return memo;
}
