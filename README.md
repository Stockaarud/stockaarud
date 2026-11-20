# Stockaarud

Gestion du stock de matériel de réduction des risques pour les CAARUD.
Un stock principal alimente les activités (camion, permanence, festif…).
L'équipe note ses sorties en trois touches, et le coordo suit les alertes, les commandes et les prévisions.

L'appli fonctionne dans le navigateur, sur téléphone comme sur ordinateur, et continue de marcher hors connexion.
Chaque CAARUD a sa propre base de données, gratuite, et personne d'autre n'y a accès.

---

## Installer Stockaarud pour votre CAARUD (environ 20 minutes)

Il faut deux comptes gratuits : **Supabase**, qui garde les données, et **GitHub**, qui met l'appli en ligne.
Vous pouvez créer les deux avec la même adresse Gmail dédiée au CAARUD.

### 1. Créer la base de données (Supabase)

1. Allez sur <https://supabase.com>, puis cliquez sur **Start your project** et créez un compte.
2. Cliquez sur **New project** :
   - **Name** : `stockaarud`
   - **Database password** : générez-en un et gardez-le de côté. L'appli n'en a pas besoin, mais il pourra servir plus tard.
   - **Region** : **Europe (Paris)** ou **Europe (Frankfurt)**, pour que les données restent en Europe.
3. Attendez une à deux minutes que le projet soit prêt.
4. Dans le menu de gauche, ouvrez **SQL Editor**, puis **New query**.
5. Ouvrez le fichier `supabase/setup.sql` de ce dossier, copiez **tout** son contenu, collez-le, puis cliquez sur **Run**.
   Le message « Success. No rows returned » doit s'afficher. Le script peut être relancé sans risque.
6. Ouvrez **Authentication › Sign In / Providers** :
   - activez **Allow anonymous sign-ins**, qui permet aux téléphones de l'équipe d'entrer avec un simple code ;
   - dans **Email**, désactivez **Confirm email**. Ce n'est pas obligatoire, mais sinon il faudra cliquer sur le lien reçu par mail avant la première connexion du coordo.
7. Ouvrez **Project Settings › API**, puis notez :
   - le **Project URL**, de la forme `https://abcdefgh.supabase.co` ;
   - la clé **anon / public**, aussi appelée **publishable key**.

> ⚠️ Ne copiez **jamais** la clé `service_role` (ou *secret key*) dans l'appli : elle donne tous les droits.
> La clé *anon* peut être publique : ce sont les règles du script SQL qui protègent les données.

### 2. Mettre l'appli en ligne (GitHub Pages)

1. Créez un compte sur <https://github.com>.
2. Cliquez sur **New repository** :
   - **Repository name** : `stockaarud`
   - **Public**, qui est nécessaire pour l'hébergement gratuit. Le code est public, mais les données restent dans votre Supabase.
3. Sur la page du dépôt vide, cliquez sur **uploading an existing file**.
   Glissez-y **tout le contenu** de ce dossier, avec les sous-dossiers `icons` et `supabase`, puis cliquez sur **Commit changes**.
4. Dans le dépôt, ouvrez le fichier `config.js`, cliquez sur le crayon ✏️ et remplissez les deux valeurs :
   ```js
   window.STOCKAARUD_CONFIG = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseKey: "eyJhbGciOi…  (la clé anon)"
   };
   ```
   Cliquez ensuite sur **Commit changes**.
5. Ouvrez **Settings › Pages**. Sous **Branch**, choisissez `main` et `/ (root)`, puis cliquez sur **Save**.
6. Après environ une minute, l'adresse de l'appli s'affiche : `https://<votre-compte>.github.io/stockaarud/`.
7. Revenez dans Supabase, ouvrez **Authentication › URL Configuration** et mettez cette adresse dans **Site URL**.

> Vous pouvez aussi laisser `config.js` vide : au premier lancement, l'appli demandera l'adresse et la clé, et les gardera sur l'appareil.
> Remplir `config.js` évite de les retaper sur chaque téléphone.

### 3. Premier lancement : l'installation guidée

1. Ouvrez l'adresse de l'appli sur votre ordinateur.
2. Dans **Je suis coordo**, cliquez sur **Première installation : créer le compte coordo**, puis entrez un e-mail et un mot de passe.
   Le **premier** compte créé devient coordo. Les suivants ne le deviennent pas automatiquement.
3. L'**installation guidée** démarre ensuite toute seule, en 5 écrans (15 à 20 minutes) :
   1. **Votre structure** : le nom du stock (« Garage », « Réserve »…) et, si besoin, les stocks intermédiaires.
   2. **Vos activités** : bus, local, maraude, festif… à cocher, et d'autres à ajouter.
   3. **Votre matériel** : un catalogue de départ d'environ 60 produits RdR, rangés par catégorie et par dossier. Décochez ce que vous ne distribuez pas.
      Les conditionnements courants sont pré-remplis et marqués « à vérifier ». Prix et fournisseurs sont facultatifs.
      Vous pouvez aussi importer le **modèle** d'un autre CAARUD.
   4. **L'inventaire de départ**, sur une seule page. Il peut être fait plus tard.
   5. **Inviter l'équipe** : le QR code, le lien, un e-mail tout prêt et la **fiche équipe en PDF**. La fiche tient en deux pages : à quoi sert l'appli, comment l'installer et comment l'utiliser.
4. Chaque membre de l'équipe scanne le QR code ou ouvre le lien, puis l'ajoute à son écran d'accueil.
5. Pour un deuxième coordo, utilisez **Réglages › Accès et appareils › Ajouter un coordo**. La personne crée son compte avec son e-mail, puis entre le code.

L'installation guidée peut être relancée à tout moment depuis **Réglages**.
Une fois installé, un CAARUD peut partager son catalogue avec un autre via **Exports › Modèle pour un autre CAARUD**. Le fichier contient les produits, les dossiers et les conditionnements, sans stocks, sans prix et sans fournisseurs.

**Téléphone perdu ?** Utilisez **Réglages › Accès et appareils › Retirer l'accès de toute l'équipe**.
Tous les téléphones de l'équipe sont alors déconnectés et les anciens codes ne marchent plus. Il suffit ensuite de réinviter l'équipe avec un nouveau code.

---

## Qui peut faire quoi

| | Équipe | Coordo |
|---|---|---|
| Noter une sortie, un retour, une perte | ✅ | ✅ |
| Voir le stock | ✅ | ✅ |
| Tableaux de bord, prévisions, commandes | — | ✅ |
| Modifier le matériel et les réglages | — | ✅ |
| Corriger, sauvegarder, tout effacer | — | ✅ |

Ces règles sont appliquées par la base elle-même, pas seulement par l'écran.

---

## Bon à savoir

- **Hors connexion** : les saisies sont gardées sur le téléphone et envoyées dès le retour du réseau.
- **Pause du projet gratuit** : Supabase met en pause un projet gratuit resté **7 jours sans aucune activité**.
  Avec une utilisation normale, cela n'arrive pas. Si c'est le cas, il suffit de cliquer sur **Restore project** dans Supabase, sans aucune perte de données.
- **Sauvegardes** : dans **Réglages › Sauvegarde et remise à zéro**, exportez régulièrement le fichier de sauvegarde, par exemple une fois par mois.
- **Limites gratuites** : 500 Mo de données et 1 Go de photos, ce qui est très au-delà des besoins d'un CAARUD.
- **Mettre à jour l'appli** : remplacez `index.html` (et les autres fichiers s'ils ont changé) dans GitHub.
  **Ne remplacez pas `config.js`**, qui contient vos réglages. Les téléphones prennent la nouvelle version à la prochaine ouverture.

---

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'application |
| `config.js` | Adresse et clé de **votre** Supabase |
| `backend.js` | Connexion à Supabase, codes d'accès et synchronisation |
| `supabase/setup.sql` | Création des tables et des règles d'accès |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur l'écran d'accueil et mode hors ligne |
