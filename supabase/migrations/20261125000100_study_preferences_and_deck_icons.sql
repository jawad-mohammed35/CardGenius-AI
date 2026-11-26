begin;

set local lock_timeout = '5s';

alter table public.profiles
  alter column auto_advance set default true,
  add column confirm_restart boolean not null default true,
  add column shuffle_on_start boolean not null default false,
  add column starting_side text not null default 'question' check (starting_side in ('question', 'answer')),
  add column show_keyboard_hints boolean not null default true,
  add column study_sounds boolean not null default false,
  add column study_volume smallint not null default 35 check (study_volume between 0 and 100),
  add column study_shortcuts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(study_shortcuts) = 'object' and octet_length(study_shortcuts::text) <= 512
    and study_shortcuts - array['previous','next','flip','known','review','copy','fullscreen','shuffle','restart'] = '{}'::jsonb
    and not jsonb_path_exists(study_shortcuts,
      '$.* ? (@.type() != "string" || !(@ like_regex "^((Shift[+])?[A-Z0-9]|Arrow(Up|Down|Left|Right)|Space)$"))')
  );

alter table public.decks
  add column icon text not null default 'layers'
    check (icon in ('layers','science','technology','math','languages','history','medicine','business','nature','arts','geography','books')),
  add column icon_color text not null default 'accent'
    check (icon_color in ('accent','blue','violet','green','rose','amber'));

-- Keep the original save entry point available while older clients are open.
create function public.cg_store_deck_with_icon(
  p_owner uuid, p_title text, p_subject text, p_folder uuid, p_cards jsonb, p_icon text, p_icon_color text,
  p_session jsonb default null, p_import_key text default null, p_created_at timestamptz default null,
  p_updated_at timestamptz default null, p_last_studied_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare deck uuid;
begin
  deck := public.cg_store_deck(p_owner, p_title, p_subject, p_folder, p_cards, p_session, p_import_key,
    p_created_at, p_updated_at, p_last_studied_at);
  if deck is not null then
    update public.decks set icon = p_icon, icon_color = p_icon_color where owner_id = auth.uid() and id = deck;
  end if;
  return deck;
end $$;
revoke all on function public.cg_store_deck_with_icon(uuid,text,text,uuid,jsonb,text,text,jsonb,text,timestamptz,timestamptz,timestamptz) from public, anon;
grant execute on function public.cg_store_deck_with_icon(uuid,text,text,uuid,jsonb,text,text,jsonb,text,timestamptz,timestamptz,timestamptz) to authenticated;

commit;
