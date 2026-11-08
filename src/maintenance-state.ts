// Trạng thái bảo trì (supabase/migrations/202611080011_fco_maintenance.sql). bypass = người đang xem là admin.
export type MaintenanceState = { enabled: boolean; message: string; bypass: boolean; paused?: boolean };
export const MAINTENANCE_DEFAULT_MESSAGE = 'Game đang bảo trì để nâng cấp. Vui lòng quay lại sau.';
// Popup cho tài khoản bị admin tạm dừng (202611080012).
export const ACCOUNT_PAUSED_MESSAGE = 'Máy chủ bảo trì, game sẽ quay lại sau';
export const MAINTENANCE_CHANGED = 'fco-maintenance-changed';
export const maintenanceText = (state: Pick<MaintenanceState, 'message'> | null) => state?.message.trim() || MAINTENANCE_DEFAULT_MESSAGE;
// Chưa biết trạng thái (lỗi mạng, máy chủ chưa cài) thì không chặn: máy chủ vẫn tự từ chối nếu đang bảo trì thật.
export const maintenanceBlocks = (state: MaintenanceState | null) => !!state?.enabled && !state.bypass;