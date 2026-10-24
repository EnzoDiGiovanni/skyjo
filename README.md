# ☀️ Skyjo — compteur de points

Feuille de score minimaliste pour une partie de **Skyjo** jouée autour d'une table.
Aucun compte, aucun serveur : tout est stocké dans le `localStorage` du navigateur.

- 2 à 8 joueurs, fin de partie réglable (50 / 100 / 150 / 200, 100 par défaut)
- Saisie une manche à la fois : un gros champ par joueur, bouton ± pour les scores négatifs
- Bouton « A fini » pour le joueur qui a retourné toutes ses cartes en premier :
  s'il n'a pas **strictement** le plus petit score (égalité comprise), ses points positifs sont doublés
- Indique qui commence la manche suivante (celui qui a fini la précédente)
- Jauge par joueur vers la limite, meneur mis en évidence (score le plus bas)
- Feuille de score complète en dessous ; toucher une ligne pour corriger une manche
- La partie s'arrête dès qu'un joueur atteint la limite ; classement final avec ex æquo
- Sauvegarde automatique, mobile d'abord, mode sombre automatique
- Polices Fredoka et Nunito intégrées au build (aucune requête externe)

## Développement

```sh
npm install
npm run dev      # serveur de dev Vite
npm test         # tests unitaires (Vitest) sur src/game.ts
npm run build    # vérification TypeScript + build dans dist/
npm run preview  # sert le build localement
```

## Structure

```
index.html
src/
  main.ts            routage par hash (#/, #/new, #/game/:id)
  game.ts            logique pure : manches, doublement, totaux, classement, fin de partie
  storage.ts         lecture/écriture localStorage + migration de schéma
  ui.ts              petits utilitaires DOM
  views/home.ts      accueil : liste des parties
  views/setup.ts     création de partie (joueurs + limite)
  views/scoresheet.ts feuille de score + classement final
  style.css
tests/game.test.ts
```

Stockage : clé `skyjo:games` (tableau de `Game`) et `skyjo:version` (schéma, actuellement `1`).
Pour faire évoluer le format, ajouter une étape dans `migrate()` de `src/storage.ts`.

## Déploiement

Le build utilise `base: './'` : le contenu de `dist/` fonctionne tel quel à la racine d'un domaine
comme dans un sous-dossier.

### GitHub Pages

1. Pousser le dépôt sur GitHub (branche `main`).
2. *Settings → Pages → Build and deployment → Source* : choisir **GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` lance les tests, build et publie à chaque push sur `main`.

### Netlify / Cloudflare Pages

Commande de build : `npm run build` — dossier publié : `dist`.
# skyjo
