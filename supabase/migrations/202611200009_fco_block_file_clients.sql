begin;

-- Chặn bản game mở từ file tải về (người dùng 2026-11-20: "tắt bản offline của người chơi kia"; chốt: chặn bản mở từ file).
--   Mở mothe.html / file HTML trực tiếp trên máy (file://) thì trình duyệt gửi header "Origin: null". Hàm fco_pre_request chạy TRƯỚC MỌI yêu cầu
--   PostgREST (bảng + RPC, cấu hình pgrst.db_pre_request của role authenticator) và từ chối các yêu cầu đó → bản tải về không đọc / ghi được
--   ví, kho, chợ, sự kiện… trên máy chủ thật. Web chính thức, trang nạp Cloudflare, app cài về máy (PWA), máy dev đều gửi Origin là tên miền
--   thật nên không ảnh hưởng. Yêu cầu không có Origin (máy chủ gọi máy chủ: GitHub Actions đồng bộ, Edge Function) vẫn qua.
--   Lưu ý: chỉ chặn được bản chạy trong trình duyệt; bản bị sửa mã để chơi hoàn toàn offline thì chỉ có đồ giả trên máy họ.
-- Gỡ (nếu cần): alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
-- Chạy lại được.

create or replace function public.fco_pre_request() returns void
language plpgsql stable set search_path = '' as $$
declare h json := nullif(current_setting('request.headers', true), '')::json;
begin
  if h is not null and lower(coalesce(h->>'origin', '')) = 'null' then
    raise exception 'FCO_CLIENT_BLOCKED' using errcode = '42501',
      hint = 'Bản game tải về không được kết nối máy chủ. Hãy chơi trên trang web chính thức.';
  end if;
end;
$$;
grant execute on function public.fco_pre_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.fco_pre_request''';
  end if;
end $$;
notify pgrst, 'reload config';

commit;
