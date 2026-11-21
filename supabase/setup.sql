-- =====================================================================
-- Stockaarud : installation de la base Supabase
-- À coller en entier dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- À la fin, il affiche un code d'installation à taper dans l'appli.
-- Plus tard, pour obtenir un nouveau code de responsable stock (accès perdu) :
--   select public.code_secours();
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

-- Toutes les données de l'appli (réglages, produits, mouvements, commandes…)
-- sont des « documents » rangés par collection.
create table if not exists public.documents (
  coll        text        not null,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (coll, id)
);

-- Qui a accès : chaque compte est soit « coordo », soit « equipe ».
create table if not exists public.membres (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  role        text        not null check (role in ('coordo', 'equipe')),
  created_at  timestamptz not null default now()
);

-- Codes d'invitation créés par le coordo (équipe ou second coordo).
create table if not exists public.codes_acces (
  code        text        primary key,
  role        text        not null check (role in ('coordo', 'equipe')),
  actif       boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Fonctions utilitaires ------------------------------------

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where user_id = auth.uid());
$$;

create or replace function public.est_coordo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres where user_id = auth.uid() and role = 'coordo');
$$;

create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.membres where user_id = auth.uid();
$$;

-- Le tout premier compte coordo (connecté par e-mail) devient coordo.
create or replace function public.premier_coordo() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then return false; end if;
  if exists (select 1 from public.membres where role = 'coordo') then return false; end if;
  insert into public.membres (user_id, role) values (auth.uid(), 'coordo')
    on conflict (user_id) do update set role = 'coordo';
  return true;
end $$;

-- Rejoindre avec un code d'invitation.
create or replace function public.rejoindre(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  select role into r from public.codes_acces where code = upper(trim(p_code)) and actif;
  if r is null then return null; end if;
  -- un code « responsable stock » (rôle coordo) marche aussi sur un appareil sans compte
  insert into public.membres (user_id, role) values (auth.uid(), r)
    on conflict (user_id) do update set role =
      case when public.membres.role = 'coordo' then 'coordo' else excluded.role end;
  return r;
end $$;

-- Le coordo crée ou désactive des codes.
create or replace function public.creer_code(p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.est_coordo() then raise exception 'reserve au coordo'; end if;
  if p_role not in ('coordo', 'equipe') then raise exception 'role inconnu'; end if;
  -- code d'équipe : 6 caractères ; code de responsable stock : 10, car il donne accès à la gestion
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, case when p_role = 'coordo' then 10 else 6 end));
  insert into public.codes_acces (code, role) values (c, p_role);
  return c;
end $$;

create or replace function public.desactiver_codes(p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_coordo() then raise exception 'reserve au coordo'; end if;
  update public.codes_acces set actif = false where role = p_role;
end $$;

-- Retirer l'accès de tous les appareils de l'équipe (en cas de perte d'un téléphone).
create or replace function public.retirer_equipe() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_coordo() then raise exception 'reserve au coordo'; end if;
  delete from public.membres where role = 'equipe';
  update public.codes_acces set actif = false where role = 'equipe';
end $$;

-- Retirer les responsables stock connectés par code (appareils sans compte), sauf l'appelant.
create or replace function public.retirer_gestion_par_code() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_coordo() then raise exception 'reserve au responsable stock'; end if;
  delete from public.membres m using auth.users u
    where m.user_id = u.id and m.role = 'coordo' and u.is_anonymous and m.user_id <> auth.uid();
  update public.codes_acces set actif = false where role = 'coordo';
end $$;

-- Code de secours : un nouveau code de responsable stock, à lancer depuis l'éditeur SQL de Supabase.
-- Réservé au propriétaire du projet (personne ne peut l'appeler depuis l'appli).
create or replace function public.code_secours() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  insert into public.codes_acces (code, role) values (c, 'coordo');
  return c;
end $$;
revoke execute on function public.code_secours from public, anon, authenticated;

-- Mise à jour partielle d'un document (fusion des champs), avec les droits de l'appelant.
create or replace function public.doc_fusion(p_coll text, p_id text, p_patch jsonb) returns void
language sql security invoker set search_path = public as $$
  update public.documents set data = data || p_patch, updated_at = now()
  where coll = p_coll and id = p_id;
$$;

-- Réveil quotidien : une requête minuscule, sans accès aux données, pour éviter la mise en pause du projet gratuit.
create or replace function public.ping() returns text
language sql stable security invoker set search_path = public as $$ select 'ok'::text $$;
revoke execute on function public.ping from public;
grant execute on function public.ping to anon, authenticated;

-- ---------- Règles d'accès (RLS) --------------------------------------

alter table public.documents   enable row level security;
alter table public.membres     enable row level security;
alter table public.codes_acces enable row level security;

drop policy if exists "lecture membres"            on public.documents;
drop policy if exists "ecriture equipe"            on public.documents;
drop policy if exists "modif equipe"               on public.documents;
drop policy if exists "suppression equipe"         on public.documents;

-- Lire : tous les membres, sauf la collection « secret » réservée au coordo.
create policy "lecture membres" on public.documents for select
  using (public.est_membre() and (coll <> 'secret' or public.est_coordo()));

-- Écrire : le coordo partout ; l'équipe seulement les mouvements et signalements.
create policy "ecriture equipe" on public.documents for insert
  with check (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements')));
create policy "modif equipe" on public.documents for update
  using (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements')))
  with check (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements')));
create policy "suppression equipe" on public.documents for delete
  using (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements')));

drop policy if exists "voir son role" on public.membres;
create policy "voir son role" on public.membres for select
  using (user_id = auth.uid() or public.est_coordo());

drop policy if exists "codes coordo" on public.codes_acces;
create policy "codes coordo" on public.codes_acces for select using (public.est_coordo());

grant select, insert, update, delete on public.documents to authenticated;
grant select on public.membres, public.codes_acces to authenticated;
revoke all on public.documents, public.membres, public.codes_acces from anon;

revoke execute on function public.est_membre, public.est_coordo, public.mon_role, public.premier_coordo,
  public.rejoindre, public.creer_code, public.desactiver_codes, public.retirer_equipe, public.retirer_gestion_par_code, public.doc_fusion
  from public, anon;
grant execute on function public.est_membre, public.est_coordo, public.mon_role, public.premier_coordo,
  public.rejoindre, public.creer_code, public.desactiver_codes, public.retirer_equipe, public.retirer_gestion_par_code, public.doc_fusion
  to authenticated;

-- ---------- Temps réel ------------------------------------------------

alter table public.documents replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents') then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;

-- ---------- Photos du matériel ---------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos coordo ajout"       on storage.objects;
drop policy if exists "photos coordo modif"       on storage.objects;
drop policy if exists "photos coordo suppression" on storage.objects;
create policy "photos coordo ajout" on storage.objects for insert
  with check (bucket_id = 'photos' and public.est_coordo());
create policy "photos coordo modif" on storage.objects for update
  using (bucket_id = 'photos' and public.est_coordo());
create policy "photos coordo suppression" on storage.objects for delete
  using (bucket_id = 'photos' and public.est_coordo());

-- ---------- Code d'installation ---------------------------------------
-- À taper dans l'appli, étape « Brancher l'appli ».
select public.code_secours() as "Code d'installation (à taper dans l'appli)";
