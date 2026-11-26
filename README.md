# Stockaarud

Gestion du stock de matériel de réduction des risques pour les CAARUD.
Un stock principal alimente les activités (local, maraude, festif…).
L'équipe note ses sorties en trois touches, et le responsable stock suit les alertes, les commandes et les statistiques.

L'appli fonctionne dans le navigateur, sur téléphone comme sur ordinateur, et continue de marcher hors connexion.

**Adresse de l'appli : <https://stockaarud.github.io/stockaarud/>**

Tous les CAARUD utilisent cette même adresse. Chaque CAARUD branche **sa propre base de données**, gratuite, que personne d'autre ne voit.
Les données ne passent jamais par une base commune.

---

## Installer Stockaarud pour votre CAARUD (3 minutes, ou 15 à la main)

Il faut seulement un compte gratuit **Supabase**, qui garde vos données. Pas besoin de GitHub, ni de mot de passe à retenir.

Ouvrez <https://stockaarud.github.io/stockaarud/>, sur téléphone ou sur ordinateur, à l'écran **Installer Stockaarud pour mon CAARUD**.

**Le plus simple : le bouton « Connecter Supabase ».** Vous vous connectez à Supabase (ou créez un compte gratuit), vous autorisez Stockaarud, et la base est créée et réglée toute seule en 2 à 3 minutes. L'autorisation ne sert qu'à l'installation : elle est effacée dès que la base est prête. Le code du relais qui fait ce travail est dans `relais/connecter/`.

**Ou à la main**, en dépliant « Installer à la main » : l'écran vous guide, avec un bouton pour chaque étape.

1. **Créer la base** : créez un compte sur Supabase, de préférence avec une adresse du CAARUD, puis un projet « stockaarud » dans une région en Europe.
2. **Préparer la base** : cliquez sur **Copier le script**, puis **Ouvrir l'éditeur SQL**. Collez et cliquez sur **Run**. Puis **Ouvrir le réglage**, activez **Allow anonymous sign-ins** et **Save**.
3. **Brancher l'appli** : **Ouvrir la page des clés**, copiez la **Publishable key** et l'adresse de la page, collez-les dans l'appli. Elle vérifie que la base est prête. Cliquez sur **Installer** dans l'heure qui suit le script : aucun code à recopier.

Si l'heure est passée, relancez le script. Si l'accès de responsable stock est perdu, lancez `select public.code_secours();` dans l'éditeur SQL et entrez le code obtenu sous « J'ai un code d'installation ».

L'**installation guidée** démarre ensuite, en 5 écrans : le stock, les activités, le matériel (catalogue de départ d'environ 60 produits, ou modèle d'un autre CAARUD), l'inventaire de départ et l'invitation de l'équipe (QR code, lien, e-mail tout prêt, **fiche équipe en PDF**).

L'adresse de votre base voyage dans le QR code et dans le lien d'invitation : les téléphones se branchent directement sur votre base, sans rien taper.

> ⚠️ Ne copiez **jamais** la clé `service_role` (ou *secret key*) dans l'appli : elle donne tous les droits.
> La clé *anon* peut être publique : ce sont les règles du script qui protègent les données.

**Plus personne n'a accès à la gestion ?** Dans Supabase, ouvrez **SQL Editor**, tapez `select public.code_secours();` et cliquez sur **Run** : vous obtenez un nouveau code de responsable stock.
Celui qui a le compte Supabase peut donc toujours reprendre la main.

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

Il suffit ensuite de redonner un nouveau code aux personnes qui restent. Les codes de secours restent toujours disponibles depuis Supabase.

Un CAARUD peut partager son catalogue avec un autre via **Exports › Modèle pour un autre CAARUD** : produits, dossiers et conditionnements, sans stocks, sans prix et sans fournisseurs.

---

## Bon à savoir

- **Hors connexion** : les saisies sont gardées sur le téléphone et envoyées dès le retour du réseau.
- **Pause du projet gratuit** : Supabase met en pause un projet gratuit resté **7 jours sans aucune activité**.
  Avec une utilisation normale, cela n'arrive pas. Sinon, cliquez sur **Restore project** dans Supabase : aucune donnée n'est perdue.
  Pour l'éviter complètement, envoyez l'identifiant de votre projet et votre clé anon aux mainteneurs de Stockaarud : une tâche réveille alors votre base chaque matin.
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

## Mettre à jour les règles de la base

Le script `supabase/setup.sql` peut être relancé sans risque : il ne supprime aucune donnée. Relancez-le (Supabase › SQL Editor) pour profiter des protections ajoutées depuis votre installation :

- l'équipe ne peut modifier ou supprimer que ses propres saisies (le responsable stock peut tout corriger) ;
- les codes d'équipe passent à 8 caractères, et un code faux fait attendre une seconde.

Sur une base déjà installée, le script affiche « Base à jour » et n'ouvre aucun accès.

## Licence

Stockaarud est un logiciel libre, distribué sous la licence publique de l'Union européenne, **EUPL 1.2** : voir [LICENSE](LICENSE). Le texte officiel existe dans les 23 langues de l'Union, dont le [français](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32017D0863), et chaque version a la même valeur.

En bref : chacun peut utiliser, copier et modifier Stockaarud, y compris pour un autre CAARUD. Une version modifiée qui est diffusée, ou mise à disposition en ligne, doit rester sous EUPL avec son code source accessible.

Les bibliothèques du dossier `vendor/` (supabase-js, jsPDF, fflate, qrcode-generator) gardent leur propre licence (MIT).
