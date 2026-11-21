# Stockaarud

Gestion du stock de matériel de réduction des risques pour les CAARUD.
Un stock principal alimente les activités (local, maraude, festif…).
L'équipe note ses sorties en trois touches, et le responsable stock suit les alertes, les commandes et les statistiques.

L'appli fonctionne dans le navigateur, sur téléphone comme sur ordinateur, et continue de marcher hors connexion.

**Adresse de l'appli : <https://stockaarud.github.io/stockaarud/>**

Tous les CAARUD utilisent cette même adresse. Chaque CAARUD branche **sa propre base de données**, gratuite, que personne d'autre ne voit.
Les données ne passent jamais par une base commune.

---

## Installer Stockaarud pour votre CAARUD (environ 10 minutes)

Il faut seulement un compte gratuit **Supabase**, qui garde vos données. Vous n'avez pas besoin de GitHub.

### 1. Créer votre base de données

1. Allez sur <https://supabase.com>, cliquez sur **Start your project** et créez un compte.
   Utilisez de préférence une adresse e-mail du CAARUD, pas une adresse personnelle.
2. Cliquez sur **New project** :
   - **Name** : `stockaarud`
   - **Database password** : générez-en un et gardez-le de côté. L'appli n'en a pas besoin.
   - **Region** : **Europe (Paris)** ou une autre région en Europe.
3. Attendez une à deux minutes que le projet soit prêt.
4. Dans le menu de gauche, ouvrez **SQL Editor**, puis **New query**.
5. Ouvrez le fichier [`supabase/setup.sql`](supabase/setup.sql), copiez **tout** son contenu, collez-le, puis cliquez sur **Run**.
   Le message « Success. No rows returned » doit s'afficher. Le script peut être relancé sans risque.
6. Ouvrez **Authentication › Sign In / Providers** :
   - activez **Allow anonymous sign-ins** : les téléphones entrent avec un code, sans compte ;
   - dans **Email**, désactivez **Confirm email**.
7. Ouvrez **Project Settings › API** et gardez cette page ouverte : il vous faut le **Project URL** et la clé **anon / public**.

> ⚠️ Ne copiez **jamais** la clé `service_role` (ou *secret key*) dans l'appli : elle donne tous les droits.
> La clé *anon* peut être publique : ce sont les règles du script qui protègent les données.

### 2. Brancher l'appli sur votre base

1. Ouvrez <https://stockaarud.github.io/stockaarud/> sur votre ordinateur.
2. Dans **Installer Stockaarud pour mon CAARUD**, collez l'adresse du projet et la clé anon, puis cliquez sur **Enregistrer**.
3. Cliquez sur **Première installation : créer le compte responsable stock** et entrez un e-mail et un mot de passe.
   Ce premier compte gère le stock et sert de **compte de secours** : gardez bien le mot de passe.
4. L'**installation guidée** démarre ensuite, en 5 écrans :
   1. **Votre structure** : le nom du stock (« Garage », « Réserve »…) et, si besoin, les stocks intermédiaires.
   2. **Vos activités** : local, maraude, festif… à cocher, et d'autres à ajouter.
   3. **Votre matériel** : un catalogue de départ d'environ 60 produits RdR. Décochez ce que vous ne distribuez pas.
      Vous pouvez aussi importer le **modèle** d'un autre CAARUD.
   4. **L'inventaire de départ**, sur une seule page. Il peut être fait plus tard.
   5. **Inviter l'équipe** : le QR code, le lien, un e-mail tout prêt et la **fiche équipe en PDF**.

L'adresse de votre base voyage dans le QR code et dans le lien d'invitation : les téléphones de l'équipe se branchent directement sur votre base, sans rien taper.

---

## Qui peut faire quoi

| | Équipe | Responsable stock |
|---|---|---|
| Noter une sortie, un retour, une perte | ✅ | ✅ |
| Voir le stock | ✅ | ✅ |
| Tableaux de bord, alertes, commandes, statistiques | — | ✅ |
| Modifier le matériel et les réglages | — | ✅ |
| Corriger, sauvegarder, tout effacer | — | ✅ |

Ces règles sont appliquées par la base elle-même, pas seulement par l'écran.

**Ajouter un responsable stock** : **Réglages › Accès et appareils › Ajouter un responsable stock**.
L'appli affiche un QR code et un code de 10 caractères. La personne le scanne ou le tape dans « Je fais partie de l'équipe » : pas de compte, pas de mot de passe.

**Quelqu'un s'en va ou perd son téléphone ?** Dans le même écran :
- **Retirer l'accès de toute l'équipe** déconnecte tous les téléphones de l'équipe ;
- **Retirer les responsables stock connectés par code** fait de même pour les responsables stock sans compte.

Il suffit ensuite de redonner un nouveau code aux personnes qui restent. Le compte de secours, avec e-mail et mot de passe, garde toujours l'accès.

Un CAARUD peut partager son catalogue avec un autre via **Exports › Modèle pour un autre CAARUD** : produits, dossiers et conditionnements, sans stocks, sans prix et sans fournisseurs.

---

## Bon à savoir

- **Hors connexion** : les saisies sont gardées sur le téléphone et envoyées dès le retour du réseau.
- **Pause du projet gratuit** : Supabase met en pause un projet gratuit resté **7 jours sans aucune activité**.
  Avec une utilisation normale, cela n'arrive pas. Sinon, cliquez sur **Restore project** dans Supabase : aucune donnée n'est perdue.
- **Sauvegardes** : dans **Réglages › Sauvegarde et remise à zéro**, exportez régulièrement le fichier de sauvegarde, par exemple une fois par mois.
- **Limites gratuites** : 500 Mo de données et 1 Go de photos, très au-delà des besoins d'un CAARUD.
- **Mises à jour** : elles arrivent toutes seules. Les téléphones prennent la nouvelle version à la prochaine ouverture.

---

## Héberger votre propre copie (facultatif)

Si vous préférez ne pas dépendre de cette adresse, vous pouvez copier l'appli sur votre propre GitHub :
**Fork** du dépôt, puis **Settings › Pages**, branche `main`, dossier `/ (root)`.
Vous pouvez alors remplir `config.js` avec l'adresse et la clé de votre base, pour ne pas avoir à les coller au premier lancement.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'application |
| `config.js` | Base par défaut (vide sur l'adresse commune) |
| `backend.js` | Connexion à Supabase, codes d'accès et synchronisation |
| `supabase/setup.sql` | Création des tables et des règles d'accès |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur l'écran d'accueil et mode hors ligne |
