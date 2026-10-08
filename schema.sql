-- SCOPE Application Arena v2
-- Supabase/PostgreSQL schema with staff auth, isolated game rooms,
-- answer-key separation, RPCs, RLS and realtime broadcast.
-- IMPORTANT: never place a service_role/secret key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'host' check (role in ('admin','host')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'SCOPE',
  question_type text not null default 'verdict_tag',
  excerpt text not null,
  options jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  correct_verdict text not null,
  correct_tag text,
  explanation text not null,
  lesson text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  room_code text not null unique,
  owner_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby','live','finished','archived')),
  current_round integer not null default 0,
  total_rounds integer not null default 0,
  round_seconds integer not null default 20 check (round_seconds between 10 and 60),
  max_players integer not null default 50 check (max_players between 2 and 200),
  player_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  title text not null,
  category text not null,
  question_type text not null,
  excerpt text not null,
  options jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'waiting' check (status in ('waiting','active','locked','revealed')),
  revealed boolean not null default false,
  started_at timestamptz,
  locked_at timestamptz,
  revealed_at timestamptz,
  unique(game_id, round_number)
);

-- Answer key is physically separated from the player-visible round table.
create table if not exists public.round_keys (
  round_id uuid primary key references public.game_rounds(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  correct_verdict text not null,
  correct_tag text,
  explanation text not null,
  lesson text not null
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  has_voted boolean not null default false,
  unique(game_id,user_id),
  unique(game_id,nickname)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  verdict text not null,
  tag text,
  response_ms integer not null check (response_ms >= 0 and response_ms <= 120000),
  submitted_at timestamptz not null default now(),
  unique(round_id,player_id)
);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  nickname text not null,
  rank integer not null,
  score integer not null,
  correct_verdicts integer not null,
  correct_tags integer not null,
  total_rounds integer not null,
  total_time_ms bigint not null,
  created_at timestamptz not null default now(),
  unique(game_id,player_id)
);

create index if not exists games_owner_idx on public.games(owner_id,created_at desc);
create index if not exists game_rounds_game_idx on public.game_rounds(game_id,round_number);
create index if not exists game_players_game_idx on public.game_players(game_id,joined_at);
create index if not exists votes_game_round_idx on public.votes(game_id,round_id);
create index if not exists results_game_rank_idx on public.game_results(game_id,rank);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff_profiles where user_id=auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff_profiles where user_id=auth.uid() and active and role='admin');
$$;

create or replace function public.get_my_staff_profile()
returns public.staff_profiles
language sql stable security definer set search_path=public as $$
  select * from public.staff_profiles where user_id=auth.uid() and active limit 1;
$$;

grant execute on function public.get_my_staff_profile() to authenticated;

-- Staff bootstrap helper. Run this in the SQL editor AFTER creating the user in Auth.
create or replace function public.promote_staff(p_email text, p_role text default 'host')
returns public.staff_profiles
language plpgsql security definer set search_path=public as $$
declare u uuid; result public.staff_profiles;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_role not in ('admin','host') then raise exception 'Role must be admin or host'; end if;
  select id into u from auth.users where lower(email)=lower(p_email) limit 1;
  if u is null then raise exception 'Auth user not found'; end if;
  insert into public.staff_profiles(user_id,email,display_name,role,active)
  values(u,p_email,split_part(p_email,'@',1),p_role,true)
  on conflict(user_id) do update set email=excluded.email, role=excluded.role, active=true
  returning * into result;
  return result;
end;
$$;

-- First admin bootstrap: manually insert your first user, because no admin exists yet.
-- Example (run once, replacing UUID and email):
-- insert into public.staff_profiles(user_id,email,display_name,role) values('AUTH-USER-UUID','you@example.com','Your Name','admin');

grant execute on function public.promote_staff(text,text) to authenticated;

-- Generate a short human-friendly room code.
create or replace function public.make_room_code() returns text
language plpgsql as $$
declare c text;
begin
  loop
    c := upper(substr(translate(encode(gen_random_bytes(6),'base64'),'/+=','XYZ'),1,4));
    if not exists(select 1 from public.games where room_code=c) then return c; end if;
  end loop;
end;
$$;

create or replace function public.create_game(p_title text, p_seconds integer default 20, p_question_ids uuid[] default '{}')
returns public.games
language plpgsql security definer set search_path=public as $$
declare g public.games; qid uuid; i integer:=0;
begin
  if not public.is_staff() then raise exception 'Staff access required'; end if;
  if coalesce(array_length(p_question_ids,1),0)=0 then raise exception 'Select at least one question'; end if;
  insert into public.games(title,room_code,owner_id,status,total_rounds,round_seconds,max_players)
  values(trim(p_title),public.make_room_code(),auth.uid(),'lobby',array_length(p_question_ids,1),greatest(10,least(60,p_seconds)),50)
  returning * into g;
  foreach qid in array p_question_ids loop
    i:=i+1;
    insert into public.game_rounds(game_id,round_number,title,category,question_type,excerpt,options,tags)
    select g.id,i,title,category,question_type,excerpt,options,tags from public.question_bank where id=qid and active;
    insert into public.round_keys(round_id,game_id,correct_verdict,correct_tag,explanation,lesson)
    select gr.id,g.id,qb.correct_verdict,qb.correct_tag,qb.explanation,qb.lesson
    from public.game_rounds gr join public.question_bank qb on qb.id=qid
    where gr.game_id=g.id and gr.round_number=i;
  end loop;
  update public.games set total_rounds=(select count(*) from public.game_rounds where game_id=g.id) where id=g.id returning * into g;
  return g;
end;
$$;

grant execute on function public.create_game(text,integer,uuid[]) to authenticated;

create or replace function public.join_game(p_room_code text, p_nickname text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare g public.games; n text; p public.game_players; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  n:=left(regexp_replace(trim(p_nickname),'[^[:alnum:] _-]','','g'),16);
  if n='' then raise exception 'Nickname required'; end if;
  select * into g from public.games where room_code=upper(trim(p_room_code)) and status in ('lobby','live') for update;
  if g.id is null then raise exception 'Room not found or closed'; end if;
  if (select count(*) from public.game_players where game_id=g.id)>=g.max_players then raise exception 'Room is full'; end if;
  -- If this browser already joined the room, return its existing player.
  select * into p from public.game_players where game_id=g.id and user_id=uid limit 1;
  if p.id is null then
    if exists(select 1 from public.game_players where game_id=g.id and lower(nickname)=lower(n)) then
      n:=left(n||' '||(select count(*)+1 from public.game_players where game_id=g.id and nickname ilike n||'%'),16);
    end if;
    insert into public.game_players(game_id,user_id,nickname) values(g.id,uid,n) returning * into p;
    update public.games set player_count=(select count(*) from public.game_players where game_id=g.id) where id=g.id;
  end if;
  return jsonb_build_object('game',to_jsonb(g),'player',to_jsonb(p),'player_id',p.id);
end;
$$;

grant execute on function public.join_game(text,text) to authenticated;

create or replace function public.submit_vote(p_game_id uuid,p_round_id uuid,p_verdict text,p_tag text,p_response_ms integer)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.game_players; r public.game_rounds; k public.round_keys; g public.games; score integer:=0; correct boolean;
begin
  select * into p from public.game_players where game_id=p_game_id and user_id=auth.uid();
  if p.id is null then raise exception 'You are not in this game'; end if;
  select * into g from public.games where id=p_game_id;
  select * into r from public.game_rounds where id=p_round_id and game_id=p_game_id;
  select * into k from public.round_keys where round_id=p_round_id;
  if r.status<>'active' then raise exception 'This round is not accepting answers'; end if;
  if exists(select 1 from public.votes where round_id=p_round_id and player_id=p.id) then raise exception 'Answer already submitted'; end if;
  correct := p_verdict=k.correct_verdict;
  if correct then score:=score+3; end if;
  if k.correct_tag is not null and p_tag=k.correct_tag then score:=score+2; end if;
  insert into public.votes(game_id,round_id,player_id,verdict,tag,response_ms) values(p_game_id,p_round_id,p.id,p_verdict,p_tag,greatest(0,p_response_ms));
  update public.game_players set has_voted=true,last_seen=now() where id=p.id;
  return jsonb_build_object('accepted',true,'score',score,'correct_verdict',correct);
end;
$$;

grant execute on function public.submit_vote(uuid,uuid,text,text,integer) to authenticated;

create or replace function public.host_action(p_game_id uuid,p_action text)
returns public.games
language plpgsql security definer set search_path=public as $$
declare g public.games; r public.game_rounds; next_r public.game_rounds;
begin
  select * into g from public.games where id=p_game_id for update;
  if g.id is null then raise exception 'Game not found'; end if;
  if not (public.is_admin() or g.owner_id=auth.uid()) then raise exception 'Not allowed'; end if;
  select * into r from public.game_rounds where game_id=g.id and round_number=g.current_round;
  if p_action='start_round' then
    if g.current_round=0 then g.current_round:=1; select * into r from public.game_rounds where game_id=g.id and round_number=1; end if;
    update public.game_rounds set status='active',started_at=now(),revealed=false where id=r.id;
    update public.games set status='live',current_round=g.current_round,started_at=coalesce(started_at,now()) where id=g.id returning * into g;
  elsif p_action='lock_round' then
    if r.id is null then raise exception 'No current round'; end if;
    update public.game_rounds set status='locked',locked_at=now() where id=r.id;
    select * into g from public.games where id=g.id;
  elsif p_action='reveal_round' then
    if r.id is null then raise exception 'No current round'; end if;
    update public.game_rounds set status='revealed',revealed=true,revealed_at=now() where id=r.id;
    update public.game_players set has_voted=false where game_id=g.id;
    select * into g from public.games where id=g.id;
  elsif p_action='next_round' then
    if g.current_round>=g.total_rounds then raise exception 'This is the final round'; end if;
    update public.game_rounds set status='waiting' where game_id=g.id and status='active';
    g.current_round:=g.current_round+1;
    update public.game_rounds set status='active',started_at=now(),revealed=false where game_id=g.id and round_number=g.current_round returning * into next_r;
    update public.games set current_round=g.current_round,status='live' where id=g.id returning * into g;
  elsif p_action='finish_game' then
    update public.games set status='finished',finished_at=now() where id=g.id returning * into g;
    -- Score all players: 3 verdict + 2 tag per round, response time only on correct verdicts.
    insert into public.game_results(game_id,player_id,nickname,rank,score,correct_verdicts,correct_tags,total_rounds,total_time_ms)
    select g.id,p.id,p.nickname,0,
      coalesce(sum((case when v.verdict=k.correct_verdict then 3 else 0 end)+(case when k.correct_tag is not null and v.tag=k.correct_tag then 2 else 0 end)),0)::int,
      count(*) filter(where v.verdict=k.correct_verdict)::int,
      count(*) filter(where k.correct_tag is not null and v.tag=k.correct_tag)::int,
      g.total_rounds,
      coalesce(sum(v.response_ms),0)::bigint
    from public.game_players p
    left join public.votes v on v.player_id=p.id and v.game_id=g.id
    left join public.round_keys k on k.round_id=v.round_id
    where p.game_id=g.id
    group by p.id,p.nickname,g.id,g.total_rounds
    on conflict(game_id,player_id) do update set score=excluded.score,correct_verdicts=excluded.correct_verdicts,correct_tags=excluded.correct_tags,total_time_ms=excluded.total_time_ms;
    with ranked as (select id,row_number() over(order by score desc,correct_verdicts desc,total_time_ms asc,id) rn from public.game_results where game_id=g.id)
    update public.game_results x set rank=r.rn from ranked r where x.id=r.id;
  else raise exception 'Unknown host action'; end if;
  -- broadcast game state. The channel is public for simplicity; no answer key is in the games payload.
  perform realtime.send(jsonb_build_object('game_id',g.id,'action',p_action,'at',extract(epoch from clock_timestamp())), 'game_state', 'game:'||g.id::text, false);
  return g;
end;
$$;

grant execute on function public.host_action(uuid,text) to authenticated;

-- RLS
alter table public.staff_profiles enable row level security;
alter table public.question_bank enable row level security;
alter table public.games enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_keys enable row level security;
alter table public.game_players enable row level security;
alter table public.votes enable row level security;
alter table public.game_results enable row level security;

create policy "staff read own profile" on public.staff_profiles for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "admins manage question bank" on public.question_bank for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff read question bank" on public.question_bank for select to authenticated using (public.is_staff());
create policy "authenticated read non archived games" on public.games for select to authenticated using (status<>'archived');
create policy "staff insert games" on public.games for insert to authenticated with check (public.is_admin() or owner_id=auth.uid());
create policy "staff update owned games" on public.games for update to authenticated using (public.is_admin() or owner_id=auth.uid()) with check (public.is_admin() or owner_id=auth.uid());
create policy "players read game rounds" on public.game_rounds for select to authenticated using (exists(select 1 from public.game_players p where p.game_id=game_rounds.game_id and p.user_id=auth.uid()) or public.is_staff());
create policy "staff read keys" on public.round_keys for select to authenticated using (public.is_staff());
create policy "players read own membership" on public.game_players for select to authenticated using (user_id=auth.uid() or public.is_staff());
create policy "staff read votes" on public.votes for select to authenticated using (public.is_staff());
create policy "staff read results" on public.game_results for select to authenticated using (public.is_staff());

-- Realtime authorization: allow authenticated users to subscribe to game topics.
-- The payload itself contains only safe game-state metadata; answer keys are never broadcast.
alter table realtime.messages enable row level security;
drop policy if exists "scope game broadcast receive" on realtime.messages;
create policy "scope game broadcast receive" on realtime.messages for select to authenticated using (topic like 'game:%');

-- Grants for the browser Data API.
grant select on public.games,public.game_rounds,public.game_players,public.round_keys,public.question_bank,public.votes,public.game_results,public.staff_profiles to authenticated;
grant select on public.games to anon;

-- Seed the eight SCOPE masterclass questions if the bank is empty.
insert into public.question_bank(title,category,question_type,excerpt,options,tags,correct_verdict,correct_tag,explanation,lesson)
select * from (values
('CV: Specific or vague?','CV','verdict_tag','Helped with several KazMSA events and gained valuable leadership experience.','["Strong","Needs work"]'::jsonb,'["Too generic","Strong evidence","Clear result","Specific role"]'::jsonb,'Needs work','Too generic','The statement does not tell the reviewer what the applicant actually did, when, or what changed because of their work.','Replace vague claims with the event, role, dates and—when appropriate—a measurable result.'),
('CV: What is missing?','CV','missing','Local Officer, LC AMU.','["Nothing","The season / dates","A second position","A longer description"]'::jsonb,'[]'::jsonb,'The season / dates',null,'A position should be anchored in time so the reviewer can understand the applicant’s experience clearly.','Keep one consistent date format throughout the CV.'),
('CV: Which achievement is stronger?','CV','choose_best','A) Participated in many events and improved my leadership skills.\n\nB) Organized three local first-aid sessions reaching more than 120 students.','["A","B"]'::jsonb,'["Evidence","Result","Generic","Unclear role"]'::jsonb,'B','Result','Option B gives the activity, the role and a concrete result that a reviewer can understand.','Strong applications turn activities into evidence of what you actually contributed.'),
('CV: Can the reviewer verify it?','CV','verdict_tag','I have excellent language skills and several international certificates.','["Strong","Needs work"]'::jsonb,'["Unverified claim","Strong evidence","Specific result","Relevant goal"]'::jsonb,'Needs work','Unverified claim','The claim is broad and gives no certificate, level or supporting evidence.','List accurate language levels and upload certificates or awards when the application requires proof.'),
('Motivation: General or specific?','Motivation','verdict_tag','I would love to visit your country, experience a new culture and meet new people.','["Strong","Needs work"]'::jsonb,'["Too travel-focused","Specific department","Clear goal","Strong evidence"]'::jsonb,'Needs work','Too travel-focused','A Stage 2 motivation letter should explain why this Local Committee and this department—not mainly why the country is interesting.','Research the LC, department and clinical environment, then connect them to your professional goals.'),
('Motivation: Pick the strongest sentence','Motivation','choose_best','A) Exchanges are a great experience.\n\nB) I want to visit Poland and explore Europe.\n\nC) I want to observe your department’s approach to cardiovascular prevention and bring practical ideas back to my LC.','["A","B","C"]'::jsonb,'["Specific goal","Travel-focused","Generic","Connection to home"]'::jsonb,'C','Specific goal','C names a concrete learning objective and shows how the experience could create value after the exchange.','A strong letter answers: why exchange, why you, why this LC/department, and what you will do with the experience.'),
('Motivation: Does the story connect?','Motivation','verdict_tag','I completed an ECG course last year. During the exchange, I want to observe how your department approaches early cardiovascular screening. After returning, I will share these practices through a session at my LC.','["Strong","Needs work"]'::jsonb,'["Experience → goal","Disconnected","Too generic","Travel-focused"]'::jsonb,'Strong','Experience → goal','The paragraph connects prior preparation to the exchange objective and then to a concrete return-home action.','The strongest applications connect experience → motivation → goals instead of repeating the CV.'),
('Final boss: Review the mini-application','Motivation','choose_best','I am a third-year medical student interested in international exchange. I have participated in several events and gained many skills. I want to visit your country because Europe has excellent healthcare. I believe the experience would be interesting and useful for my future. I would be happy to participate.','["Excellent","Good","Needs major improvement","Unacceptable"]'::jsonb,'["Specificity","Evidence","LC/department fit","Goals"]'::jsonb,'Needs major improvement','LC/department fit','The paragraph is polite but generic: it lacks evidence, a specific LC/department reason, concrete learning goals and a clear experience-to-goal connection.','A strong application is relevant experience + clear motivation + specific goals + attention to detail.')
) v(title,category,question_type,excerpt,options,tags,correct_verdict,correct_tag,explanation,lesson)
where not exists(select 1 from public.question_bank limit 1);
