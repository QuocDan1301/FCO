begin;

-- Cờ tỷ phú (2026-11-22, người dùng: "nên lên 1 vòng (1800 điểm) khoảng 12-13k fc"; chọn cách giảm điểm theo số lắc, giữ giá lượt và mốc 1.800).
-- Điểm mỗi bước: số lắc 1 → 1, 2 → 1, 3 → 2, 4 → 3, 5 → 3, 6 → 4 điểm (ô Special vẫn ×2). Xúc xắc vẫn đi đúng số ô như cũ.
-- Mô phỏng (D:\FCOvv-tmp\tmp\ctp_round_opts.py): ~12.260 FC / vòng khi mua gói 50 / 100 lượt (trước ~8.170 FC).
-- Chạy SAU 202611220006_fco_ctp_milestones_plus1.sql. Chạy lại được.

create or replace function public.fco_ctp_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":20},{"count":10,"price":190},{"count":50,"price":900},{"count":100,"price":1800}]'::jsonb,
    'firstPrice', 10,          -- lượt đầu tiên của mỗi tài khoản
    'potPerPlay', 1,           -- mỗi lượt góp 1 FC vào quỹ Ultimate
    'jackpotMin', 10000,       -- quỹ tối thiểu để Ultimate / Mini có thể nổ
    'ultimateChance', 0.008,   -- dừng ô 21
    'miniChance', 0.06,        -- dừng ô 7
    'winsPerDay', 2,           -- mỗi loại tối đa 2 lần / 24 giờ
    'maxRollBonus', 1,         -- lắc ra 6 đi thêm 1 bước
    'luckyMore', 2, 'luckyLess', 1,
    'rollPoints', '[1,1,2,3,3,4]'::jsonb)   -- điểm theo số lắc 1..6 (202611220007): 1 vòng 1.800 điểm ≈ 12–13k FC
$$;

create or replace function public.fco_ctp_sim(p_count integer, p_pos integer, p_lucky integer, p_pot bigint,
  p_jp_at timestamptz, p_jp_prev timestamptz, p_mini_at timestamptz, p_mini_prev timestamptz, p_exclude text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); pos integer := p_pos; lucky integer := p_lucky; pot bigint := p_pot;
  jp_at timestamptz := p_jp_at; jp_prev timestamptz := p_jp_prev; mini_at timestamptz := p_mini_at; mini_prev timestamptz := p_mini_prev;
  moves integer; dbl boolean; next_dbl boolean; is_bonus boolean; roll integer; steps integer; dest integer; pts integer; kind text;
  shot jsonb; reward jsonb; extra jsonb; amount bigint; gain integer; old_lucky integer;
  plays jsonb := '[]'; pts_won integer := 0; free_won integer := 0; jmin bigint := (rules->>'jackpotMin')::bigint;
begin
  for i in 1 .. p_count loop
    pot := pot + (rules->>'potPerPlay')::bigint;
    moves := 1; dbl := false; is_bonus := false;
    while moves > 0 loop
      moves := moves - 1; next_dbl := false;
      roll := 1 + floor(random() * 6)::integer;
      steps := roll + case when roll = 6 then (rules->>'maxRollBonus')::integer else 0 end;
      dest := (pos + steps - 1) % 28 + 1;
      pts := (rules->'rollPoints'->>(roll - 1))::integer * case when dbl then 2 else 1 end;
      reward := null; extra := '{}'; shot := null;
      kind := case dest when 7 then 'mini' when 14 then 'special' when 21 then 'ultimate' when 28 then 'lucky' else 'ball' end;
      if kind = 'special' then
        moves := moves + 1; next_dbl := true;
      elsif kind = 'ultimate' and pot >= jmin and (jp_prev is null or jp_prev <= now() - interval '24 hours')
            and random() < (rules->>'ultimateChance')::double precision then
        reward := jsonb_build_object('fc', pot, 'jackpot', 'special'); pot := 2000; jp_prev := jp_at; jp_at := now();
      elsif kind = 'mini' and pot >= jmin and (mini_prev is null or mini_prev <= now() - interval '24 hours')
            and random() < (rules->>'miniChance')::double precision then
        amount := floor(pot / 10); pot := pot - amount; mini_prev := mini_at; mini_at := now();
        reward := jsonb_build_object('fc', amount, 'jackpot', 'mini');
      else
        shot := public.fco_ctp_shot(dbl, p_exclude); reward := shot->'reward';
        extra := jsonb_build_object('rail', shot->>'rail', 'slot', (shot->>'slot')::integer);
        if kind = 'lucky' then
          old_lucky := lucky;
          gain := case when roll > lucky then (rules->>'luckyMore')::integer else (rules->>'luckyLess')::integer end;
          free_won := free_won + gain;
          lucky := 1 + floor(random() * 6)::integer;
          extra := extra || jsonb_build_object('free', gain, 'lucky', old_lucky);
        end if;
      end if;
      pts_won := pts_won + pts;
      plays := plays || (jsonb_build_object('roll', roll, 'steps', steps, 'from', pos, 'to', dest, 'kind', kind, 'reward', reward,
        'points', pts, 'double', dbl, 'bonus', is_bonus) || extra);
      pos := dest; dbl := next_dbl; is_bonus := next_dbl;
    end loop;
  end loop;
  return jsonb_build_object('plays', plays, 'pos', pos, 'lucky', lucky, 'ptsWon', pts_won, 'freeWon', free_won,
    'jpAt', jp_at, 'jpPrev', jp_prev, 'miniAt', mini_at, 'miniPrev', mini_prev);
end;
$$;

commit;
