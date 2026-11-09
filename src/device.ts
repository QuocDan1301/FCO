// Điện thoại và máy bảng vẽ bố cục PC rồi thu nhỏ cho vừa màn (script screen-fit trong index.html), nên bề ngang CSS không còn cho biết đang ở máy nào.

// Điện thoại cảm ứng, xác định theo cạnh ngắn của màn thật.
export const isTouchPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;

// Tỉ lệ thu nhỏ đang áp dụng (1 = không thu). Canvas nhân thêm số này để không vẽ nhiều điểm ảnh hơn màn hình hiển thị được.
export const fitScale = () => (window as Window & { __FCO_FIT_SCALE?: number }).__FCO_FIT_SCALE ?? 1;
