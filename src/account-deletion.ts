export type AccountDeletionApi = {
  authenticate(password: string): Promise<string>;
  remove(): Promise<boolean>;
};

export async function deleteAccount(api: AccountDeletionApi, expectedUserId: string, password: string) {
  if (!password) throw new Error('Hãy nhập mật khẩu hiện tại.');
  const verifiedUser = await api.authenticate(password);
  if (verifiedUser !== expectedUserId) throw new Error('Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại đúng tài khoản.');
  if (!await api.remove()) throw new Error('Máy chủ chưa xác nhận xóa tài khoản. Hãy kiểm tra kết nối rồi thử lại.');
}
