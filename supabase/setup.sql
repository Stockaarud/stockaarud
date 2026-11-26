-- =====================================================================
-- Stockaarud : installation de la base Supabase
-- À coller en entier dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- Les bases déjà installées le relancent une fois pour recevoir les correctifs de sécurité de novembre 2026.
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

-- Chaque code a une date d'expiration : 30 jours pour l'équipe, 7 jours pour un responsable stock
-- (qui, en plus, ne sert qu'une fois). Les anciens codes reçoivent la même règle à partir de leur création.
alter table public.codes_acces add column if not exists expire_at timestamptz;
update public.codes_acces set expire_at = created_at + case when role = 'coordo' then interval '7 days' else interval '30 days' end
  where expire_at is null;

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

-- Rejoindre avec un code d'invitation.
create or replace function public.rejoindre(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  select role into r from public.codes_acces
    where code = upper(trim(p_code)) and actif and (expire_at is null or expire_at > now());
  -- un code faux ou expiré fait attendre une seconde : deviner un code au hasard devient très long
  if r is null then perform pg_sleep(1); return null; end if;
  -- un code de responsable stock ne sert qu'une fois
  if r = 'coordo' then update public.codes_acces set actif = false where code = upper(trim(p_code)); end if;
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
    values (c, p_role, now() + case when p_role = 'coordo' then interval '7 days' else interval '30 days' end);
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
    and (d->>'type' <> 'reception' or exists (select 1 from public.documents c where c.coll = 'commandes' and c.id = d->>'commande'));
$$;
revoke execute on function public.mvt_equipe_ok from public, anon;
grant execute on function public.mvt_equipe_ok to authenticated;

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

-- ---------- Code d'installation ---------------------------------------
-- À taper dans l'appli, étape « Brancher l'appli ».
select public.code_secours() as "Code d'installation (à taper dans l'appli)";
