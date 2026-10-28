# Right Blocker

Extension navigateur (Manifest V3) qui bloque une liste de profils sur X et
Instagram, dans les onglets où vous êtes déjà connecté. Pas d'API, pas de login, pas de
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
{ "version": 1, "updated": "2026-10-28",
  "profiles": [ { "network": "x", "handle": "exemple" },
                { "network": "instagram", "handle": "exemple" } ] }
```

Une liste chargée depuis une URL est rafraîchie toutes les six heures. Les
profils déjà traités ne sont jamais retentés, sauf par le popup.

## Structure

- `src/background.js` : liste, file, rythme, onglet de travail.
- `src/content/x.js` et `src/content/instagram.js` : un driver par réseau,
  réutilisable tel quel dans une webview si une app arrive un jour. Chaque
  driver répond au message `{type: 'block', network, handle}` par un statut.
- `src/popup/` : état, chargement, démarrer, pause, journal.

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
- Le rythme est volontairement lent. Des rafales font suspendre le compte.
- Firefox : le manifeste fonctionne, mais `background.type: module` demande
  Firefox 121 ou plus récent.
