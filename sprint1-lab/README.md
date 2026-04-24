# Sprint 1 — Analyse : Authentification & Gestion des utilisateurs

> Dossier bac à sable — **ne touche pas à l'application**. Les fichiers ici sont des
> brouillons de production à déplacer dans `src/app/` quand Sprint 1 démarre.

---

## État actuel de Supabase (connecté le 24/04/2026)

### Tables existantes ✅
| Table | RLS | Lignes | Notes |
|---|---|---|---|
| `workspaces` | ✅ | 2 | Colonne `logo_url` (≠ `logo_path` dans le modèle Angular) |
| `user_roles` | ✅ | 1 | 1 utilisateur (owner) jamais connecté (`last_sign_in_at` null) |
| `calendars` | ✅ | 1 | Colonne `name` (≠ `label` dans le modèle Angular) |
| `events` | ✅ | 0 | OK |
| `ad_campaigns` | ✅ | 0 | Colonne `name` absente du modèle Angular |
| `campaign_assignments` | ✅ | 0 | Colonne `event_date` (≠ `assigned_date` dans le modèle Angular) |
| `content_versions` | ✅ | 0 | PK = `year` (pas de colonne `id` — modèle Angular erroné) |

### Fonctions existantes ✅
| Fonction | Rôle |
|---|---|
| `current_user_role()` | Retourne le rôle du user connecté |
| `has_role_at_least(app_role)` | Hiérarchie des rôles pour les policies RLS |
| `recalculate_content_version` | Trigger — recalcule le hash de version après chaque mutation d'événement/campagne |
| `update_timestamps` | Trigger — met à jour `updated_at` automatiquement |

### Triggers existants ✅
- `trg_events_versioning` — INSERT/UPDATE/DELETE sur `events`
- `trg_assignments_versioning` — INSERT/UPDATE/DELETE sur `campaign_assignments`
- `trg_events_timestamps` — UPDATE sur `events`
- `trg_calendars_timestamps` — UPDATE sur `calendars`
- `trg_ad_campaigns_timestamps` — UPDATE sur `ad_campaigns`

### Policies RLS existantes
| Table | Policy | Problème |
|---|---|---|
| `workspaces` | Owner full access | ⚠️ Pas de policy SELECT pour les non-owners — les éditeurs/chargés comm ne peuvent pas lire le workspace |
| `user_roles` | Owner full access + Read own role | ✅ OK |
| `calendars` | Read all (non supprimés) + Write editeur+ | ✅ OK |
| `events` | Read all (non supprimés) + Write editeur+ | ✅ OK |
| `ad_campaigns` | Read (active=true, non supprimés) + Write charge_communication+ | ⚠️ La policy SELECT filtre `active=true` — le CMS doit pouvoir lire les campagnes inactives aussi |
| `campaign_assignments` | Read all + Write charge_communication+ | ✅ OK |
| `content_versions` | Read all + No direct write | ✅ OK |

---

## Ce qui manque pour compléter Sprint 1

### 1. Corrections DB Supabase (migrations à appliquer)

#### 1a. Policy `workspaces` — lecture pour tous les authentifiés
```sql
CREATE POLICY "Workspaces - Read authenticated"
ON public.workspaces FOR SELECT
TO authenticated
USING (true);
```

#### 1b. Policy `ad_campaigns` — lecture sans filtre `active` pour le CMS
```sql
-- Remplacer "Ad Campaigns - Read all" ou ajouter une policy admin
CREATE POLICY "Ad Campaigns - Read for managers"
ON public.ad_campaigns FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND has_role_at_least('charge_communication'::app_role)
);
```
> La policy actuelle ne montre que les campagnes actives — utile pour le mobile, mais
> le CMS a besoin de voir toutes les campagnes pour les gérer.

#### 1c. Table `profiles` (optionnel mais recommandé)
L'écran workspace-step collecte `userName` et `userPhone`. Il n'y a nulle part où stocker
ces infos actuellement. Options :
- Stocker dans `auth.users.raw_user_meta_data` (plus simple)
- Créer une table `profiles` liée à `auth.users` (plus propre à long terme)

**Recommandation** : utiliser `raw_user_meta_data` pour Sprint 1, migrer vers une table
`profiles` en Sprint 2 si nécessaire.

---

### 2. Corrections des modèles Angular

Voir [MISMATCHES.md](./MISMATCHES.md) pour le détail complet.
Les modèles corrigés sont dans [models/index.ts](./models/index.ts).

---

### 3. Connecter les flux d'auth à Supabase

#### 3a. EmailStepComponent (`/demarrer`)
**Actuellement** : navigue vers `/verifier` sans appeler Supabase.  
**À faire** : appeler `supabase.auth.signInWithOtp({ email })` avant de naviguer.

```typescript
// Dans submit() :
const { error } = await this.authService.sendOtp(email);
if (error) { /* afficher erreur */ return; }
this.router.navigate(['/verifier'], { queryParams: { email } });
```

#### 3b. LoginComponent (`/login`)
**Actuellement** : navigue sans appeler Supabase.  
**À faire** : même flux OTP (pas de mot de passe côté UI).

#### 3c. OtpStepComponent (`/verifier`)
**Actuellement** : navigue vers `/espaces` ou `/dashboard` sans vérifier.  
**À faire** : appeler `supabase.auth.verifyOtp({ email, token, type: 'email' })`.

```typescript
// Dans advance() :
const token = this.digits.join('');
const { error } = await this.authService.verifyOtp(this.email, token);
if (error) { /* afficher erreur */ return; }
this.router.navigate([this.from === 'login' ? '/dashboard' : '/espaces']);
```

#### 3d. WorkspaceStepComponent (`/espaces`)
**Actuellement** : liste vide, `finish()` navigue sans rien créer en DB.  
**À faire** :
- `ngOnInit` → charger les workspaces depuis Supabase
- `finish()` → créer le workspace + insérer le rôle `owner` dans `user_roles`
- `selectWorkspace()` → stocker l'ID en session/localStorage, naviguer vers `/dashboard`

---

### 4. Appliquer l'AuthGuard aux routes protégées

Dans `app.routes.ts`, le shell n'a pas `canActivate: [authGuard]` :

```typescript
{
  path: '',
  loadComponent: () => import('./core/layout/shell/shell.component')...,
  canActivate: [authGuard],   // ← MANQUANT
  children: [...]
}
```

---

### 5. Créer et appliquer le RoleGuard

Les routes du shell doivent restreindre l'accès par rôle :

| Route | Rôles autorisés |
|---|---|
| `/dashboard` | Tous |
| `/calendrier` | Tous |
| `/evenements` | `owner`, `chef_equipe`, `editeur` |
| `/campagnes` | `owner`, `chef_equipe`, `charge_communication` |
| `/utilisateurs` | `owner` uniquement |
| `/metriques` | Tous |

Le fichier [guards/role.guard.ts](./guards/role.guard.ts) est prêt à l'emploi.

---

### 6. Feature Utilisateurs — architecture nécessaire

La gestion des utilisateurs nécessite des opérations `auth.admin` (lister les users,
inviter, bloquer) qui **requièrent la clé `service_role`** côté serveur.  
Il faut donc des **Edge Functions Supabase** — ne jamais exposer `service_role` côté client.

#### Edge Functions à créer
| Fonction | Endpoint | Action |
|---|---|---|
| `list-users` | `POST /functions/v1/list-users` | `auth.admin.listUsers()` |
| `invite-user` | `POST /functions/v1/invite-user` | `auth.admin.inviteUserByEmail()` |
| `manage-user` | `POST /functions/v1/manage-user` | ban/unban/delete via `auth.admin` |

Le service [services/users.service.ts](./services/users.service.ts) appelle ces fonctions.

---

## Checklist Sprint 1 — par priorité

### Priorité 1 — Bloquants (rien ne marche sans ça)
- [ ] Corriger les modèles Angular (MISMATCHES)
- [ ] Connecter `EmailStepComponent` à `supabase.auth.signInWithOtp`
- [ ] Connecter `OtpStepComponent` à `supabase.auth.verifyOtp`
- [ ] Appliquer `canActivate: [authGuard]` au shell dans `app.routes.ts`

### Priorité 2 — Flux complet d'onboarding
- [ ] Connecter `WorkspaceStepComponent` : charger + créer workspace en DB
- [ ] Connecter `LoginComponent` au flux OTP
- [ ] Ajouter policy `workspaces - Read authenticated` en DB
- [ ] Mettre à jour `supabase.service.ts` : `logo_url` au lieu de `logo_path`

### Priorité 3 — RBAC et sécurité Angular
- [ ] Créer et intégrer `RoleGuard` dans les routes du shell
- [ ] Ajouter `canActivate: [roleGuard]` avec `data: { requiredRoles: [...] }` par route

### Priorité 4 — Feature Utilisateurs
- [ ] Créer Edge Function `list-users`
- [ ] Créer Edge Function `invite-user`
- [ ] Créer Edge Function `manage-user`
- [ ] Implémenter `UsersComponent` avec le `UsersService`
- [ ] Corriger la policy `ad_campaigns` SELECT pour le CMS

### Priorité 5 — Tests (TDD selon les règles)
- [ ] Tests unitaires pour `AuthService`
- [ ] Tests unitaires pour `UsersService`
- [ ] Tests pour `RoleGuard`

---

## Ce qui est déjà bon côté Supabase ✅

- Toutes les tables du schéma sont créées avec RLS activé
- Les 4 rôles (`owner`, `chef_equipe`, `editeur`, `charge_communication`) sont définis
  comme enum `app_role`
- La hiérarchie des rôles (`has_role_at_least`) est correctement implémentée
- Les triggers de versioning (`content_versions`) sont en place et fonctionnels
- Les triggers `update_timestamps` sont en place
- L'enum `event_position` (1|2) et `ad_position` (header|footer) sont définis
- 1 utilisateur owner existe (`elvisolembe1@gmail.com`) — mais son rôle doit être
  vérifié dans `user_roles` (1 ligne existe)
