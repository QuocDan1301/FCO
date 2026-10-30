import { createClient } from '@supabase/supabase-js';
import { validateSave } from './game';
import { SaveConflict } from './cloud-save';
import type { CloudRecord, SaveRemote } from './cloud-save';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const accountClient = url && key ? createClient(url, key) : null;

function record(value: unknown): CloudRecord {
  const row = value as CloudRecord | null;
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || !validateSave(row.data)) {
    throw new Error('Bản lưu trên máy chủ không hợp lệ. Dữ liệu trên máy vẫn được giữ nguyên.');
  }
  return row;
}

export function saveRemote(userId: string): SaveRemote {
  const client = accountClient;
  if (!client) throw new Error('Chưa kết nối máy chủ tài khoản.');
  return {
    async load() {
      const { data, error } = await client.from('fco_game_saves').select('revision,data').eq('user_id', userId).abortSignal(AbortSignal.timeout(20000)).maybeSingle();
      if (error) throw new Error('Không tải được kho thẻ từ máy chủ. Hãy kiểm tra kết nối rồi thử lại.');
      if (!data) {
        const identity = await client.auth.getUser();
        if (identity.error || identity.data.user?.id !== userId) throw new Error('Tài khoản đã bị xóa hoặc phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
      }
      return data ? record(data) : null;
    },
    async write(data, revision) {
      const result = await client.rpc('fco_commit_save', { p_data: data, p_revision: revision }).abortSignal(AbortSignal.timeout(20000));
      if (result.error?.message.includes('FCO_SAVE_CONFLICT')) throw new SaveConflict();
      if (result.error) throw new Error('Chưa gửi được tiến trình lên máy chủ. Bản lưu vẫn còn trên máy này.');
      return record(result.data);
    },
  };
}

export function accountError(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    invalid_credentials: 'Tên đăng nhập hoặc mật khẩu chưa đúng.',
    email_not_confirmed: 'Hãy xác nhận email trước khi đăng nhập.',
    email_address_not_authorized: 'Chưa gửi được email xác nhận đến địa chỉ này. Vui lòng liên hệ quản trị game.',
    user_already_exists: 'Tên đăng nhập này đã được sử dụng. Hãy chọn tên khác.',
    weak_password: 'Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự.',
    over_email_send_rate_limit: 'Bạn gửi yêu cầu quá nhanh. Hãy đợi một lúc rồi thử lại.',
    over_request_rate_limit: 'Có quá nhiều yêu cầu. Hãy đợi một lúc rồi thử lại.',
    signup_disabled: 'Máy chủ đang tạm dừng đăng ký tài khoản mới.',
  };
  return (code && messages[code]) || 'Không thực hiện được yêu cầu. Kiểm tra kết nối rồi thử lại.';
}
