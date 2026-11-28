-- =====================================================================
-- Stockaarud : installation de la base Supabase
-- À coller en entier dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- Les bases déjà installées le relancent une fois pour recevoir les correctifs de sécurité de novembre 2026.
-- Sur une base neuve, il ouvre l'installation pendant une heure : retourne dans l'appli et clique sur « Installer ».
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

-- Qui a créé chaque document : l'équipe ne peut modifier ou supprimer que ses propres saisies.
-- (Les documents créés avant l'ajout de cette colonne n'ont pas d'auteur : seul le responsable stock peut les modifier.)
alter table public.documents add column if not exists auteur uuid default auth.uid();

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

-- Un code de responsable stock expire au bout de 7 jours et ne sert qu'une fois : il donne tous les droits.
-- Le code d'équipe, lui, n'expire pas (il est imprimé sur l'affiche du local) : il reste valable
-- jusqu'à ce que le responsable stock le désactive, et ne donne que les droits de l'équipe.
alter table public.codes_acces add column if not exists expire_at timestamptz;
update public.codes_acces set expire_at = created_at + interval '7 days' where role = 'coordo' and expire_at is null;
update public.codes_acces set expire_at = null where role = 'equipe' and expire_at is not null;

-- Générateur de hasard fait pour les secrets.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.nouveau_code(p_len int) returns text
language sql volatile set search_path = public as $$
  select upper(substr(encode(extensions.gen_random_bytes(16), 'hex'), 1, p_len));
$$;
revoke execute on function public.nouveau_code from public, anon, authenticated;

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

-- Ancienne entrée « premier compte e-mail = responsable stock » : retirée (l'installation passe par un code).
drop function if exists public.premier_coordo();

-- Essais ratés de code : au bout de 10 en une heure, l'appareil attend ; au bout de 300 pour toute la base,
-- plus personne ne peut essayer pendant une heure (les membres déjà entrés ne sont pas gênés).
create table if not exists public.essais_code (
  user_id  uuid        primary key,
  n        int         not null default 0,
  depuis   timestamptz not null default now()
);
alter table public.essais_code enable row level security;
revoke all on public.essais_code from public, anon, authenticated;

-- Rejoindre avec un code d'invitation.
create or replace function public.rejoindre(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare r text; c text := upper(trim(coalesce(p_code, ''))); moi int; tous int;
begin
  if auth.uid() is null then return null; end if;
  delete from public.essais_code where depuis < now() - interval '1 hour';
  select n into moi from public.essais_code where user_id = auth.uid();
  select coalesce(sum(n), 0) into tous from public.essais_code;
  if coalesce(moi, 0) >= 10 or tous >= 300 then
    raise exception 'trop d''essais, réessaie dans une heure' using errcode = '42501';
  end if;
  -- un code de responsable stock ne sert qu'une fois : il est consommé dans le même geste que sa vérification
  update public.codes_acces set actif = false
    where code = c and role = 'coordo' and actif and (expire_at is null or expire_at > now())
    returning role into r;
  if r is null then
    select role into r from public.codes_acces
      where code = c and role = 'equipe' and actif and (expire_at is null or expire_at > now());
  end if;
  if r is null then
    insert into public.essais_code (user_id, n) values (auth.uid(), 1)
      on conflict (user_id) do update set n = public.essais_code.n + 1;
    return null;
  end if;
  delete from public.essais_code where user_id = auth.uid();
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
  -- code d'équipe : 8 caractères ; code de responsable stock : 10, car il donne accès à la gestion
  c := public.nouveau_code(case when p_role = 'coordo' then 10 else 8 end);
  insert into public.codes_acces (code, role, expire_at)
    values (c, p_role, case when p_role = 'coordo' then now() + interval '7 days' end);
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
  c := public.nouveau_code(10);
  insert into public.codes_acces (code, role, expire_at) values (c, 'coordo', now() + interval '7 days');
  return c;
end $$;
revoke execute on function public.code_secours from public, anon, authenticated;

-- Ce qu'un membre de l'équipe a le droit d'enregistrer : les gestes que l'appli lui propose
-- (sortie, prêt ou don, transfert, perte, livraison d'une commande existante, rupture, passages, matériel récupéré),
-- avec une quantité qui est un vrai nombre, positif et raisonnable. Les entrées hors commande et les inventaires
-- restent réservés au responsable stock.
create or replace function public.mvt_equipe_ok(d jsonb) returns boolean
language sql stable set search_path = public as $$
  select coalesce(d->>'type', '') in ('sortie', 'depannage', 'transfert', 'perte', 'reception', 'rupture', 'passage', 'recup')
    and (d->'qte' is null or (jsonb_typeof(d->'qte') = 'number' and (d->>'qte')::numeric >= 0
         and (d->>'qte')::numeric <= case when d->>'type' in ('reception', 'transfert') then 100000 else 10000 end))
    and (d->>'mois' is null or d->>'mois' ~ '^\d{4}-\d{2}$')
    and (d->>'jour' is null or d->>'jour' ~ '^\d{4}-\d{2}-\d{2}$')
    and (d->>'type' <> 'reception' or exists (select 1 from public.documents c where c.coll = 'commandes' and c.id = d->>'commande'));
$$;
revoke execute on function public.mvt_equipe_ok from public, anon;
grant execute on function public.mvt_equipe_ok to authenticated;

-- Garde-fous de volume : un document est toujours un objet, une saisie reste petite,
-- et un membre de l'équipe ne peut pas créer plus de 2 000 saisies par jour (une équipe en fait quelques dizaines).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'doc_objet') then
    alter table public.documents add constraint doc_objet check (jsonb_typeof(data) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'doc_taille') then
    alter table public.documents add constraint doc_taille
      check (coll not in ('mouvements', 'signalements') or octet_length(data::text) <= 6000) not valid;
  end if;
end $$;
create index if not exists documents_auteur_maj on public.documents (auteur, updated_at);
create or replace function public.frein_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.est_coordo() then return new; end if;
  new.updated_at := now();
  if (select count(*) from public.documents
        where auteur = auth.uid() and updated_at > now() - interval '1 day') >= 2000 then
    raise exception 'trop de saisies aujourd''hui' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.frein_equipe from public, anon, authenticated;
drop trigger if exists frein_equipe on public.documents;
create trigger frein_equipe before insert on public.documents
  for each row execute function public.frein_equipe();

-- Première installation, sans code à recopier : pendant l'heure qui suit ce script, et seulement si la base
-- n'a encore aucun responsable stock, la personne qui branche l'appli le devient. Ensuite la porte se referme.
create table if not exists public.installation (
  id          int primary key default 1 check (id = 1),
  ouverte_at  timestamptz
);
alter table public.installation enable row level security;
revoke all on public.installation from anon, authenticated;

create or replace function public.premiere_installation() returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform 1 from public.installation where id = 1 for update;
  if exists (select 1 from public.membres where role = 'coordo') then return null; end if;
  if not exists (select 1 from public.installation where id = 1 and ouverte_at > now() - interval '1 hour') then
    perform pg_sleep(1); return null;
  end if;
  insert into public.membres (user_id, role) values (auth.uid(), 'coordo')
    on conflict (user_id) do update set role = 'coordo';
  update public.installation set ouverte_at = null where id = 1;
  return 'coordo';
end $$;
revoke execute on function public.premiere_installation from public, anon;
grant execute on function public.premiere_installation to authenticated;

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

-- Écrire : le responsable stock partout.
-- L'équipe : seulement les mouvements et les signalements, et seulement les siens pour modifier ou supprimer,
-- avec des identifiants faits de lettres, chiffres et . _ : - (rien qui puisse cacher du code),
-- et des mouvements conformes à mvt_equipe_ok ci-dessus.
create policy "ecriture equipe" on public.documents for insert
  with check (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements') and auteur = auth.uid()
    and id ~ '^[A-Za-z0-9_.:-]{1,80}$' and (coll <> 'mouvements' or public.mvt_equipe_ok(data))));
create policy "modif equipe" on public.documents for update
  using (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements') and auteur = auth.uid()))
   with check (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements') and auteur = auth.uid()
    and id ~ '^[A-Za-z0-9_.:-]{1,80}$' and (coll <> 'mouvements' or public.mvt_equipe_ok(data))));
create policy "suppression equipe" on public.documents for delete
  using (public.est_coordo() or (public.est_membre() and coll in ('mouvements', 'signalements') and auteur = auth.uid()));

drop policy if exists "voir son role" on public.membres;
create policy "voir son role" on public.membres for select
  using (user_id = auth.uid() or public.est_coordo());

drop policy if exists "codes coordo" on public.codes_acces;
create policy "codes coordo" on public.codes_acces for select using (public.est_coordo());

grant select, insert, update, delete on public.documents to authenticated;
grant select on public.membres, public.codes_acces to authenticated;
revoke all on public.documents, public.membres, public.codes_acces from anon;

revoke execute on function public.est_membre, public.est_coordo, public.mon_role,
  public.rejoindre, public.creer_code, public.desactiver_codes, public.retirer_equipe, public.retirer_gestion_par_code, public.doc_fusion
  from public, anon;
grant execute on function public.est_membre, public.est_coordo, public.mon_role,
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

-- ---------- Ouverture de l'installation -----------------------------
-- Base sans responsable stock : l'installation est ouverte pendant une heure. Sinon, rien ne s'ouvre.
insert into public.installation (id, ouverte_at)
  values (1, case when exists (select 1 from public.membres where role = 'coordo') then null else now() end)
on conflict (id) do update set ouverte_at = excluded.ouverte_at;

select case when exists (select 1 from public.membres where role = 'coordo')
  then 'Base à jour. Rien d''autre à faire.'
  else 'Base prête. Retourne dans l''appli et clique sur « Installer » dans l''heure. Passé ce délai, relance ce script.'
end as "Résultat";
