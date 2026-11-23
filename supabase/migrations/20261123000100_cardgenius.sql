begin;

create table public.profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 48),
  avatar_icon text not null default 'Person' check (avatar_icon in ('Person','Book','Leaf','Cat','Coffee','Moon','Mountain','Music','Heart','Headphones','Rocket','Compass','Camera','Flower','Feather','Palette')),
  avatar_color text not null default 'stone' check (avatar_color in ('stone','lavender','sage','rose','peach','sky')),
  avatar_image text check (avatar_image is null or (char_length(avatar_image) <= 500000 and avatar_image ~ '^data:image/(webp|png);base64,[A-Za-z0-9+/=]+$')),
  hide_provider_avatar boolean not null default false,
  theme text check (theme in ('light','dark','oled')),
  accent text check (accent in ('monochrome','blue','purple','emerald','rose','orange')),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard','expert')),
  card_count smallint not null default 10 check (card_count between 1 and 100),
  auto_advance boolean not null default false,
  animate_cards boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  primary key (owner_id, id)
);
create unique index folders_owner_name on public.folders (owner_id, lower(btrim(name)));

create table public.decks (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  folder_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  subject text not null default '' check (char_length(subject) <= 160),
  import_key text check (import_key is null or char_length(import_key) <= 70),
  study_session jsonb check (study_session is null or (jsonb_typeof(study_session) = 'object' and octet_length(study_session::text) <= 16000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_studied_at timestamptz,
  primary key (owner_id, id),
  foreign key (owner_id, folder_id) references public.folders(owner_id, id) on delete set null (folder_id),
  unique (owner_id, import_key)
);
create index decks_owner_updated on public.decks(owner_id, updated_at desc);
create index decks_owner_folder on public.decks(owner_id, folder_id);

create table public.flashcards (
  owner_id uuid not null default auth.uid(),
  deck_id uuid not null,
  position smallint not null check (position between 0 and 99),
  front text not null check (char_length(btrim(front)) between 1 and 220),
  back text not null check (char_length(btrim(back)) between 1 and 480),
  difficulty text not null check (difficulty in ('easy','medium','hard','expert')),
  primary key (owner_id, deck_id, position),
  foreign key (owner_id, deck_id) references public.decks(owner_id, id) on delete cascade
);

do $$
declare relation text;
begin
  foreach relation in array array['profiles','folders','decks','flashcards'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select,insert,update,delete on public.%I to authenticated', relation);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', relation);
  end loop;
end $$;

create function public.cg_touch_profile() returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.cg_touch_profile();
revoke execute on function public.cg_touch_profile() from public, anon, authenticated;

create function public.cg_store_deck(
  p_owner uuid, p_title text, p_subject text, p_folder uuid, p_cards jsonb,
  p_session jsonb default null, p_import_key text default null,
  p_created_at timestamptz default null, p_updated_at timestamptz default null,
  p_last_studied_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare who uuid := auth.uid(); deck uuid;
begin
  if who is null or who is distinct from p_owner then raise exception 'Sign in first' using errcode = '42501'; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' then raise exception 'Invalid cards' using errcode = '22023'; end if;
  if jsonb_array_length(p_cards) not between 1 and 100 then raise exception 'Invalid card count' using errcode = '22023'; end if;
  insert into public.decks(owner_id, title, subject, folder_id, study_session, import_key, created_at, updated_at, last_studied_at)
    values(who, btrim(p_title), coalesce(p_subject, ''), p_folder, p_session, p_import_key, coalesce(p_created_at, now()), coalesce(p_updated_at, now()), p_last_studied_at)
    on conflict (owner_id, import_key) do nothing returning id into deck;
  if deck is null then return null; end if;
  insert into public.flashcards(owner_id, deck_id, position, front, back, difficulty)
    select who, deck, ordinality - 1, card->>'front', card->>'back', card->>'difficulty'
    from jsonb_array_elements(p_cards) with ordinality as items(card, ordinality);
  return deck;
end $$;
revoke all on function public.cg_store_deck(uuid,text,text,uuid,jsonb,jsonb,text,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.cg_store_deck(uuid,text,text,uuid,jsonb,jsonb,text,timestamptz,timestamptz,timestamptz) to authenticated;

create function public.cg_edit_card(p_deck uuid, p_position smallint, p_card jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare who uuid := auth.uid();
begin
  -- Lock the parent first to serialize with progress changes and deck deletion.
  perform 1 from public.decks where owner_id = who and id = p_deck for update;
  if not found then raise exception 'Deck unavailable' using errcode = '42501'; end if;
  update public.flashcards set front = p_card->>'front', back = p_card->>'back', difficulty = p_card->>'difficulty'
    where owner_id = who and deck_id = p_deck and position = p_position;
  if not found then raise exception 'Card unavailable' using errcode = '22023'; end if;
  update public.decks set updated_at = now(), study_session =
    case when study_session is null or jsonb_typeof(study_session->'order') is distinct from 'array' then null
      else jsonb_set(jsonb_set(study_session #- array['ratings', p_position::text], '{complete}', 'false'::jsonb),
        '{order}', case when (study_session->'order') @> jsonb_build_array(p_position) then study_session->'order'
                      else (study_session->'order') || jsonb_build_array(p_position) end)
    end where owner_id = who and id = p_deck;
end $$;
revoke all on function public.cg_edit_card(uuid,smallint,jsonb) from public, anon;
grant execute on function public.cg_edit_card(uuid,smallint,jsonb) to authenticated;

create table public.generation_limits (
  day date not null, subject uuid not null, used integer not null check (used > 0),
  primary key (day, subject)
);
alter table public.generation_limits enable row level security;
revoke all on public.generation_limits from public, anon, authenticated;

create function public.cg_claim_generation(p_cost smallint)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare who uuid := auth.uid(); shared uuid := '00000000-0000-0000-0000-000000000000'; day_utc date := (now() at time zone 'UTC')::date;
begin
  if who is null or p_cost is null or p_cost < 1 or p_cost > 10 then return false; end if;
  -- Serialize reservation of both budgets. No caller can choose the owner or replenish a counter.
  perform pg_catalog.pg_advisory_xact_lock(602918);
  if coalesce((select used from public.generation_limits where day = day_utc and subject = who),0) + p_cost > 14
     or coalesce((select used from public.generation_limits where day = day_utc and subject = shared),0) + p_cost > 60 then
    return false;
  end if;
  delete from public.generation_limits where day < day_utc - 2;
  insert into public.generation_limits values (day_utc, who, p_cost), (day_utc, shared, p_cost)
    on conflict (day, subject) do update set used = public.generation_limits.used + excluded.used;
  return true;
end $$;
revoke all on function public.cg_claim_generation(smallint) from public, anon;
grant execute on function public.cg_claim_generation(smallint) to authenticated;

create function public.cg_delete_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare who uuid := auth.uid();
begin
  if who is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.generation_limits where subject = who;
  delete from auth.users where id = who;
end $$;
-- Only the user identified by the signed Auth token is eligible. There is no target parameter.
revoke all on function public.cg_delete_account() from public, anon;
grant execute on function public.cg_delete_account() to authenticated;
commit;
