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
