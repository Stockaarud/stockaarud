# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **L'équipe** : intervenants de CAARUD qui distribuent le matériel de réduction des risques, au local, en maraude, en festival, au fond d'un stock. Ils notent chaque sortie sur leur téléphone, souvent debout, d'une main, parfois sans réseau, entre deux personnes accueillies. Leurs téléphones sont **souvent anciens** : téléphones de service ou personnels, Android d'entrée de gamme, petits écrans.
- **Le responsable stock** : il installe l'appli une fois, puis suit le stock, reçoit les alertes, passe les commandes, fait l'inventaire et sort les chiffres de l'année pour le rapport d'activité. Il travaille sur téléphone et, plus confortablement, sur l'ordinateur du bureau.

## Product Purpose

Stockaarud gère le stock de matériel de réduction des risques d'un CAARUD : un stock principal alimente les activités (local, maraude, festif…). L'équipe note une sortie en trois touches (où, quoi, combien), même hors connexion ; le responsable stock voit venir les ruptures, sait quoi commander et combien, et obtient les statistiques, le budget et les ruptures de l'année.

L'appli réussit quand l'équipe note toutes ses sorties sans y penser, et que le responsable stock commande à temps sans tableur à côté.

## Positioning

Conçue dans un CAARUD marseillais, par un médecin qui y travaille, avec les équipes qui s'en servent : pensée pour le matériel RdR, les activités et le rapport d'activité d'un CAARUD, et non pour un entrepôt. Gratuite, au code public, et chaque structure garde ses données dans sa propre base.

## Operating Context

- Une seule adresse pour tous les CAARUD : https://stockaarud.github.io/stockaarud/ . Application web installable sur l'écran d'accueil, qui marche hors connexion (service worker).
- Installation une fois, en environ quinze minutes, sur un ordinateur : projet Supabase gratuit, script SQL, connexions anonymes, clé `anon public`, puis installation guidée en cinq écrans (structure, activités, matériel, inventaire de départ, invitation de l'équipe). Essai possible sans compte, sur un seul appareil.
- L'équipe rejoint par QR code, lien ou affiche, sans compte ni mot de passe ; le responsable stock par e-mail ou par code.
- Sur ordinateur : tous les onglets visibles, touches 1 à 7, saisie en lot, matériel en tableau, écran du stock pour un local.
- Une démo avec deux CAARUD fictifs et un an de données est publiée sur le site (stockaarud.github.io/demo) : c'est une copie de `index.html` où `backend.js` est remplacé par `demo.js` et `seed.json`.

## Capabilities and Constraints

- **Aucune donnée sur les personnes accueillies.** L'appli ne compte que du matériel ; les sorties ne portent aucun nom. Les passages se comptent sans nom.
- **Une base par CAARUD.** Chaque structure a son projet Supabase ; pas de base commune, pas de compte Stockaarud. Les règles d'accès (équipe ou responsable stock) sont appliquées par la base elle-même.
- Jamais la clé `service_role` dans l'appli.
- Code de secours depuis Supabase pour reprendre la main sur la gestion.
- Alertes e-mail facultatives, par un service d'envoi tenu par Stockaarud (dossier `relais/`).
- L'appli tient dans un seul `index.html` (HTML, CSS et JavaScript), avec `backend.js` pour Supabase et `sw.js` pour le hors-ligne. Toute modification de `index.html` doit aussi être reportée dans la démo du site.
- Vocabulaire du terrain à garder : matos, sortie, entrée, retour, perte, rupture, maraude, activité, stock principal, stock intermédiaire, responsable stock, inventaire, commande, rapport d'activité, passages.

## Brand Commitments

- Nom : Stockaarud. Icônes dans `icons/`.
- **L'appli tutoie** (« Touche celles qui existent chez toi ») : c'est voulu, entre collègues de terrain. Le site de présentation, lui, vouvoie.
- Ton direct, concret, sans jargon de logiciel.
- Indépendant et bénévole, sans affiliation à une institution ni support commercial.

## Evidence on Hand

- Démo jouable avec deux CAARUD fictifs et un an de mouvements (`seed.json` du site).
- Captures et vidéos de l'appli sur le site de présentation.
- Aucun chiffre d'usage, témoignage ni nombre de CAARUD utilisateurs : n'en inventer aucun.

## Product Principles

1. Trois touches pour une sortie : rien ne doit ralentir l'équipe au moment de noter.
2. L'appli marche partout : sans réseau, sur un vieux téléphone, à une main.
3. Le responsable stock voit d'abord ce qui demande une action (rupture, commande), les chiffres ensuite.
4. Les données restent chez la structure, et l'appli le respecte dans chaque écran.
5. Ne rien promettre qu'un projet bénévole ne puisse tenir.

## Accessibility & Inclusion

- Petits écrans anciens, lumière de terrain (dehors, en maraude, la nuit) : contrastes forts, cibles tactiles larges, textes lisibles sans zoomer.
- Utilisable à une main, debout, avec des gants si besoin : actions principales en bas de l'écran.
- Pages légères : un vieux téléphone doit ouvrir l'appli vite, même avec un an de données.
