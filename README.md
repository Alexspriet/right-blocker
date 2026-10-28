# On bloque. (Right Blocker)

Extension navigateur (Manifest V3) qui bloque une liste de profils sur X et
Instagram, dans les onglets où vous êtes déjà connecté. L'interface reprend la
langue de onbloquelextremedroite.fun : crème, un rouge, Space Grotesk, DM Sans. Pas d'API, pas de login, pas de
mot de passe stocké : l'extension pilote l'interface du site comme un humain.

## Installer en développement

1. Chrome : `chrome://extensions`, activer le mode développeur, « Charger
   l'extension non empaquetée », choisir ce dossier.
2. Être connecté à X et à Instagram dans le navigateur.
3. Cliquer l'icône : charger `blocklist.example.json` (ou une URL), puis
   Démarrer. L'extension ouvre un onglet de travail par réseau et bloque un
   profil toutes les 4 à 9 secondes.

## Format de la liste

```json
{ "version": 2, "updated": "2026-10-28",
  "profiles": [ { "network": "x", "handle": "exemple", "name": "Exemple", "category": "Politiques", "followers": 120000 },
                { "network": "instagram", "handle": "exemple", "name": "Exemple", "category": "Médias" } ] }
```

`name`, `category` et `followers` sont facultatifs : le popup affiche le nom,
filtre par catégorie, et montre les abonnés quand ils sont là.

Une liste chargée depuis une URL est rafraîchie toutes les six heures. Les
profils déjà traités ne sont jamais retentés, sauf par le popup.

## Popup

Trois vues : l'accueil (compteur en direct, progression du jour, pastilles par
réseau, fiche du compte en cours et les deux suivants, un bouton), la liste
(recherche, filtres par réseau et catégorie, statut par compte) et les réglages
(source, plafond quotidien, comptes connectés, historique). Un squelette de la
mise en page finale s'affiche tant que l'état n'est pas là.

Pour travailler sur le popup sans charger l'extension : `src/popup/dev.html`
branche un faux `chrome.*` (`mock.js`) et un scénario par paramètre
`?s=loading|idle|empty|running|blocked|cap|loggedout`. Servir le dossier
`src/popup` (`python3 -m http.server`) et ouvrir `dev.html`.

Maquette d'origine : `design/mockup-popup.html` (option A retenue, logo B en
icône, C en en-tête).

## Structure

- `src/background.js` : liste, file, rythme, plafond du jour, compteurs,
  onglet de travail par réseau.
- `src/content/x.js` et `src/content/instagram.js` : un driver par réseau,
  réutilisable tel quel dans une webview si une app arrive un jour. Chaque
  driver répond au message `{type: 'block', network, handle}` par un statut.
- `src/popup/` : le popup (`popup.html`, `popup.css`, `popup.js`), les deux
  polices embarquées dans `fonts/`, la page de dev.
- `icons/` : le logo (`logo.svg`) et ses PNG, rendus par un petit script Python
  (voir l'historique git) ; `qlmanage` cadre mal les SVG.

## État des tests

- Instagram : chemin complet exécuté le 28/10/2026 dans un Chrome connecté
  (interface anglaise), par injection du driver : statut `blocked` en 4,5 s,
  bouton Unblock affiché, second passage renvoie `already`. Le popup et le
  service worker n'ont pas encore tourné en extension chargée.
- X : non testé.

## Limites connues

- Les sélecteurs `data-testid` de X changent parfois : le driver les tient
  en tête de fichier. Instagram n'en a pas : son driver lit les libellés
  (anglais et français, table `WORDS` en tête de fichier).
- Le rythme est volontairement lent : 4 à 9 secondes entre deux blocages et
  20 par jour et par réseau (réglable). Des rafales font suspendre le compte.
- Firefox : le manifeste fonctionne, mais `background.type: module` demande
  Firefox 121 ou plus récent.
