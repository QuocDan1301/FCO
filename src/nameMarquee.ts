// Tên cầu thủ trên thẻ ảnh: tên dài hơn hộp thì gắn lớp is-long để chạy qua lại trong hộp (card-names.css).
// Một ResizeObserver chung theo dõi cả hộp tên lẫn chữ bên trong: đo lại khi thẻ đổi cỡ, khi thẻ đang ẩn hiện ra
// (cỡ 0 → cỡ thật) và khi font tải xong làm chữ đổi bề rộng. Callback chạy sau bố cục, đo theo lô nên không gây tính lại bố cục.
let observer: ResizeObserver | null = null;

function check(box: HTMLElement) {
  const text = box.firstElementChild as HTMLElement | null;
  if (text) box.classList.toggle('is-long', box.clientWidth > 0 && text.offsetWidth > box.clientWidth + 1);
}

export function watchName(box: HTMLElement | null) {
  if (!box) return;
  if (typeof ResizeObserver === 'undefined') { requestAnimationFrame(() => check(box)); return; }
  observer ??= new ResizeObserver(entries => {
    const boxes = new Set(entries.map(entry => entry.target.classList.contains('face-art-name') ? entry.target : entry.target.parentElement));
    boxes.forEach(box => box instanceof HTMLElement && check(box));
  });
  const text = box.firstElementChild;
  observer.observe(box);
  if (text) observer.observe(text);
  return () => { observer?.unobserve(box); if (text) observer?.unobserve(text); };
}
