-- The Nightly board: one row per player per day, holding their best score.
--
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It is safe to run again: everything is created "if not exists" or replaced.
--
-- What the public key (sb_publishable_...) can do, and nothing else:
--   * read the day's names, scores and run details (not player ids, not run codes)
--   * call submit_nightly(), which checks the post and keeps each player's best
-- Run codes are kept only for the day's top 25 and only for a week; you read
-- them in the Table Editor when a score looks wrong, and delete the row there.

create table if not exists public.nightly_scores (
  day        date        not null,
  player     uuid        not null,
  name       text        not null,
  score      bigint      not null,
  time_held  integer     not null,
  kills      integer     not null,
  level      integer     not null,
  map        text        not null,
  character  text        not null,
  outcome    text        not null,
  tries      integer     not null default 1,
  run_code   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, player)
);
create index if not exists nightly_scores_board on public.nightly_scores (day, score desc);

alter table public.nightly_scores enable row level security;

drop policy if exists "boards are public" on public.nightly_scores;
create policy "boards are public" on public.nightly_scores for select to anon, authenticated using (true);

-- Only these columns can be read with the public key; the player id (which
-- is what lets a browser post as that player) and the run codes stay private.
revoke all on public.nightly_scores from anon, authenticated;
grant select (day, name, score, time_held, kills, level, map, character, outcome, tries, updated_at)
  on public.nightly_scores to anon, authenticated;

create or replace function public.submit_nightly(
  p_day date, p_player uuid, p_name text, p_score bigint, p_time integer, p_kills integer,
  p_level integer, p_map text, p_character text, p_outcome text, p_code text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'utc')::date;
  clean text := regexp_replace(btrim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g');
  prev public.nightly_scores%rowtype;
  best bigint;
  keep_code boolean;
  had boolean;
  my_rank integer;
begin
  -- Today's night, or yesterday's for a run that ended just after midnight UTC.
  if p_day is null or p_day not in (today, today - 1) then raise exception 'not tonight'; end if;
  if p_player is null then raise exception 'no player'; end if;
  if char_length(clean) < 1 or char_length(clean) > 20 then raise exception 'name must be 1 to 20 characters'; end if;
  if p_outcome not in ('defeated', 'victory', 'abandoned', 'arena_victory') then raise exception 'bad outcome'; end if;
  if char_length(coalesce(p_map, '')) not between 1 and 40 or char_length(coalesce(p_character, '')) not between 1 and 40 then
    raise exception 'bad run';
  end if;
  -- Scores no night could be worth: time held is most of a score, and every
  -- multiplier a Nightly can carry together is well under 20 (Runs.score).
  if p_time is null or p_time < 0 or p_time > 14400 then raise exception 'bad time'; end if;
  if p_kills is null or p_kills < 0 or p_kills > p_time * 150 + 2000 then raise exception 'bad kills'; end if;
  if p_level is null or p_level < 1 or p_level > 600 then raise exception 'bad level'; end if;
  if p_score is null or p_score < 0 or p_score > (p_time::bigint * 10 + p_kills + p_time::bigint * 60 + 60000) * 20 then
    raise exception 'bad score';
  end if;

  select * into prev from public.nightly_scores where day = p_day and player = p_player for update;
  had := found;
  if had and prev.updated_at > now() - interval '15 seconds' then raise exception 'too fast'; end if;

  -- A run code only for a score that would sit in the day's top 25.
  select score into best from public.nightly_scores where day = p_day order by score desc offset 24 limit 1;
  keep_code := p_code is not null and char_length(p_code) <= 400000 and (best is null or p_score > best);

  if not had then
    insert into public.nightly_scores (day, player, name, score, time_held, kills, level, map, character, outcome, tries, run_code)
    values (p_day, p_player, clean, p_score, p_time, p_kills, p_level, p_map, p_character, p_outcome, 1,
            case when keep_code then p_code end)
    on conflict (day, player) do nothing;
  elsif p_score > prev.score then
    update public.nightly_scores set name = clean, score = p_score, time_held = p_time, kills = p_kills, level = p_level,
      map = p_map, character = p_character, outcome = p_outcome, tries = prev.tries + 1,
      run_code = case when keep_code then p_code end, updated_at = now()
    where day = p_day and player = p_player;
  else
    update public.nightly_scores set name = clean, tries = prev.tries + 1, updated_at = now()
    where day = p_day and player = p_player;
  end if;

  -- Old run codes go after a week; the scores stay.
  update public.nightly_scores set run_code = null where run_code is not null and day < today - 7;

  select count(*) + 1 into my_rank from public.nightly_scores s
  where s.day = p_day and s.score > (select score from public.nightly_scores where day = p_day and player = p_player);
  return json_build_object('rank', my_rank,
    'best', (select score from public.nightly_scores where day = p_day and player = p_player),
    'players', (select count(*) from public.nightly_scores where day = p_day));
end $$;

revoke all on function public.submit_nightly(date, uuid, text, bigint, integer, integer, integer, text, text, text, text) from public;
grant execute on function public.submit_nightly(date, uuid, text, bigint, integer, integer, integer, text, text, text, text) to anon, authenticated;
