-- Relais d'alertes Stockaarud : tables du projet Supabase qui envoie les e-mails.
-- À lancer une seule fois dans le projet du relais (pas dans la base d'un CAARUD).

-- Adresses inscrites : une adresse ne reçoit rien tant qu'elle n'a pas cliqué sur le lien de confirmation.
create table if not exists public.abonnes (
  email        text primary key,
  token        text not null unique,
  confirme_at  timestamptz,
  demande_at   timestamptz not null default now(),
  cree_at      timestamptz not null default now()
);

-- Journal des envois : sert à ne jamais envoyer deux fois la même alerte et à plafonner les envois.
create table if not exists public.envois (
  cle    text primary key,
  email  text not null,
  type   text not null,
  at     timestamptz not null default now()
);
create index if not exists envois_email_at on public.envois (email, at);
create index if not exists envois_at on public.envois (at);

-- Personne n'y accède depuis l'extérieur : seule la fonction du relais (clé de service) lit et écrit.
alter table public.abonnes enable row level security;
alter table public.envois  enable row level security;
revoke all on public.abonnes, public.envois from anon, authenticated;

-- Rattachement des adresses aux CAARUD (novembre 2026) : un CAARUD n'écrit qu'aux adresses qu'il a inscrites.
create table if not exists public.abonnes_bases (
  email  text not null,
  ref    text not null,
  cree_at timestamptz not null default now(),
  primary key (email, ref)
);
create index if not exists abonnes_bases_ref on public.abonnes_bases (ref);
alter table public.abonnes_bases enable row level security;
revoke all on public.abonnes_bases from anon, authenticated;
-- Les adresses déjà inscrites sont rattachées aux CAARUD qui leur ont déjà écrit.
insert into public.abonnes_bases (email, ref)
  select distinct email, split_part(cle, '|', 1) from public.envois
  where cle not like 'conf|%' and split_part(cle, '|', 1) ~ '^[a-z0-9]{20}$'
on conflict do nothing;

-- Bouton « Connecter Supabase » (novembre 2026) : suivi d'une installation en cours.
-- Une ligne vit 30 minutes au plus. L'autorisation y est chiffrée avec un jeton que seul
-- le navigateur du CAARUD détient, et effacée dès que la base est prête.
create table if not exists public.connexions (
  id       text primary key,
  etat     text not null,
  verifier text,
  retour   text,
  jeton    text,
  ref      text,
  cle      text,
  essais   int not null default 0,
  reprise  boolean not null default false,
  cree_at  timestamptz not null default now(),
  maj_at   timestamptz not null default now()
);
create index if not exists connexions_cree_at on public.connexions (cree_at);
-- Empreinte du secret gardé par l'appareil qui a lancé la connexion (novembre 2026).
alter table public.connexions add column if not exists lien text;
alter table public.connexions enable row level security;
revoke all on public.connexions from anon, authenticated;
