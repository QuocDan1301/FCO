begin;

-- Cờ tỷ phú (2026-11-22, người dùng: "không trúng thì ko đứng lên ô jp hay mini jp").
-- Quân cờ chỉ DỪNG ở ô Ultimate Prize (21) / Mini Prize (7) khi trúng Jackpot. Tỷ lệ trúng giữ nguyên (Ultimate 0,8 %, Mini 6 %,
-- quỹ ≥ 10.000, mỗi loại 2 lần / 24 giờ); lần tới ô mà trượt thì xúc xắc ra số khác (không vào 7 / 21), đi như lượt thường.
-- Chỉ thay fco_ctp_sim (bản 202611220007_fco_ctp_roll_points.sql). Chạy SAU 202611220010_fco_el_serial.sql. Chạy lại được.

create or replace function public.fco_ctp_sim(p_count integer, p_pos integer, p_lucky integer, p_pot bigint,
  p_jp_at timestamptz, p_jp_prev timestamptz, p_mini_at timestamptz, p_mini_prev timestamptz, p_exclude text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); pos integer := p_pos; lucky integer := p_lucky; pot bigint := p_pot;
  jp_at timestamptz := p_jp_at; jp_prev timestamptz := p_jp_prev; mini_at timestamptz := p_mini_at; mini_prev timestamptz := p_mini_prev;
  moves integer; dbl boolean; next_dbl boolean; is_bonus boolean; roll integer; steps integer; dest integer; pts integer; kind text;
  shot jsonb; reward jsonb; extra jsonb; amount bigint; gain integer; old_lucky integer; win text; bonus integer := (rules->>'maxRollBonus')::integer;
  plays jsonb := '[]'; pts_won integer := 0; free_won integer := 0; jmin bigint := (rules->>'jackpotMin')::bigint;
begin
  for i in 1 .. p_count loop
    pot := pot + (rules->>'potPerPlay')::bigint;
    moves := 1; dbl := false; is_bonus := false;
    while moves > 0 loop
      moves := moves - 1; next_dbl := false;
      roll := 1 + floor(random() * 6)::integer;
      steps := roll + case when roll = 6 then bonus else 0 end;
      dest := (pos + steps - 1) % 28 + 1;
      kind := case dest when 7 then 'mini' when 14 then 'special' when 21 then 'ultimate' when 28 then 'lucky' else 'ball' end;
      -- Tới ô Ultimate (21) / Mini (7): quay trúng / trượt như cũ (tỷ lệ không đổi).
      win := null;
      if kind = 'ultimate' and pot >= jmin and (jp_prev is null or jp_prev <= now() - interval '24 hours')
         and random() < (rules->>'ultimateChance')::double precision then win := 'special';
      elsif kind = 'mini' and pot >= jmin and (mini_prev is null or mini_prev <= now() - interval '24 hours')
         and random() < (rules->>'miniChance')::double precision then win := 'mini';
      end if;
      -- Trượt thì KHÔNG dừng ở ô Jackpot: lắc lại trong các số không vào ô 7 / 21 (luôn còn ≥ 4 số vì 2 ô cách nhau 14).
      if kind in ('ultimate', 'mini') and win is null then
        select r into roll from generate_series(1, 6) r
          where (pos + r + case when r = 6 then bonus else 0 end - 1) % 28 + 1 not in (7, 21)
          order by random() limit 1;
        steps := roll + case when roll = 6 then bonus else 0 end;
        dest := (pos + steps - 1) % 28 + 1;
        kind := case dest when 14 then 'special' when 28 then 'lucky' else 'ball' end;
      end if;
      pts := (rules->'rollPoints'->>(roll - 1))::integer * case when dbl then 2 else 1 end;
      reward := null; extra := '{}'; shot := null;
      if kind = 'special' then
        moves := moves + 1; next_dbl := true;
      elsif win = 'special' then
        reward := jsonb_build_object('fc', pot, 'jackpot', 'special'); pot := 2000; jp_prev := jp_at; jp_at := now();
      elsif win = 'mini' then
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
