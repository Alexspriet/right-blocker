# Right Blocker

Extension navigateur (Manifest V3) qui bloque une liste de profils sur X,
dans l'onglet où vous êtes déjà connecté. Pas d'API, pas de login, pas de
mot de passe stocké : l'extension pilote l'interface du site comme un humain.

## Installer en développement

1. Chrome : `chrome://extensions`, activer le mode développeur, « Charger
   l'extension non empaquetée », choisir ce dossier.
2. Être connecté à X dans le navigateur.
3. Cliquer l'icône : charger `blocklist.example.json` (ou une URL), puis
   Démarrer. L'extension ouvre un onglet de travail et bloque un profil
   toutes les 4 à 9 secondes.

## Format de la liste

```json
{ "version": 1, "updated": "2026-10-28",
  "profiles": [ { "network": "x", "handle": "exemple" } ] }
```

Une liste chargée depuis une URL est rafraîchie toutes les six heures. Les
profils déjà traités ne sont jamais retentés, sauf par le popup.

## Structure

- `src/background.js` : liste, file, rythme, onglet de travail.
- `src/content/x.js` : driver X. Un driver par réseau, réutilisable tel quel
  dans une webview si une app arrive un jour.
- `src/popup/` : état, chargement, démarrer, pause, journal.

## Limites connues

- Les sélecteurs `data-testid` de X changent parfois : le driver les tient
  en tête de fichier.
- Le rythme est volontairement lent. Des rafales font suspendre le compte.
- Firefox : le manifeste fonctionne, mais `background.type: module` demande
  Firefox 121 ou plus récent.
