# Day After Day - Branching Strategy

## Stratégie adoptée : GitHub Flow adapté

**Pourquoi cette stratégie ?**

- Équipe de 2 développeurs → besoin de simplicité et de vélocité.
- Projets web/mobile avec releases fréquentes (sprints hebdomadaires).
- Main toujours déployable (ou presque).

### Branches principales

| Branche   | Description                                    | Protection                 | Quand l'utiliser ?                         |
| --------- | ---------------------------------------------- | -------------------------- | ------------------------------------------ |
| `main`    | Code de production (toujours stable)           | Protégée + Require PR + CI | Merges finaux après review                 |
| `develop` | Branche d'intégration (développement en cours) | Protégée                   | Point d'intégration de toutes les features |

### Branches de travail (à créer depuis `develop`)

- `feature/<nom-courte>` → Nouvelle fonctionnalité (ex: `feature/auth-supabase`)
- `bugfix/<nom-courte>` → Correction de bug
- `hotfix/<nom-courte>` → Correction urgente en production
- `chore/<nom-courte>` → Tâches techniques (setup, config, refactoring)
- `docs/<nom-courte>` → Documentation uniquement

**Exemple :**

```bash
git checkout develop
git pull origin develop
git checkout -b feature/sprint-0-angular-setup
```

### Règles obligatoires

- Toutes les modifications passent par Pull Request vers develop (sauf hotfix critique).
- Au moins 1 review obligatoire avant merge (même pour 2 personnes → auto-review + validation croisée).
- Commit conventionnel (recommandé) :
  feat: nouvelle fonctionnalité
  fix: correction de bug
  chore: maintenance
  docs: documentation
  refactor:, test:, style:

- Supprimer la branche après merge réussi.
- Main ne reçoit des merges que depuis develop (ou hotfix) en fin de sprint ou avant release.
- Sync régulière : git fetch origin && git merge origin/develop avant de commencer une nouvelle branche.
