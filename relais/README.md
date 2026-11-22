# Relais d'alertes par e-mail

L'appli est une page web : elle ne peut pas envoyer de mail. Quand un CAARUD active les alertes
(Réglages, Alertes par e-mail), son appli confie les chiffres à ce relais, qui compose le mail et le
remet au service d'envoi Brevo.

- `alertes/index.ts` : la fonction Supabase (Edge Function) du relais.
- `setup.sql` : les deux tables du projet Supabase du relais (adresses inscrites, journal des envois).

Ce que le relais reçoit : le nom du CAARUD, des noms de produits, des jours de stock restants et les
adresses destinataires. Jamais rien sur les personnes accueillies.

Garde-fous : une adresse ne reçoit rien tant qu'elle n'a pas cliqué sur le lien de confirmation ;
les textes venus de l'appli sont raccourcis et débarrassés de toute adresse web ; une même alerte
n'est envoyée qu'une fois ; les envois sont plafonnés par adresse et par jour.

Deux secrets sont à régler dans le projet Supabase du relais (Edge Functions, Secrets) :
`BREVO_KEY` (la clé API Brevo) et `BREVO_FROM` (l'adresse d'expéditeur validée dans Brevo).
