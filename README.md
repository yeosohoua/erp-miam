# ERP Miam : gestion de cantine multi-établissements

ERP web de gestion de restauration collective (écoles, entreprises) avec une API mobile pour l'application **Miam** (Flutter, dépôt `miam-mobile`).

Démo en ligne : https://miam.jambo.ci

## Fonctionnalités

- **Multi-établissements** : chaque établissement a son logo, sa devise, ses tarifs et ses utilisateurs.
- **Inscrits et familles** : élèves, parents, employés, badges QR, codes d'accès, import en masse, photos.
- **Menus et plats** : planification, publication, images, ingrédients, nutrition, HACCP.
- **Réservations et caisse** : réservation de repas, caisse avec sessions, mode hors ligne, tickets, cartes (articles et catégories).
- **Portefeuille prépayé** : solde par inscrit, recharge Paystack, cartes cadeaux, historique des transactions.
- **Gestion** : stock, achats, réapprovisionnement, production, transferts, facturation, comptabilité (export), RH et paie, satisfaction, tableaux de bord et analyses.
- **Sécurité** : sessions signées, limitation des tentatives, journal d'audit, sauvegardes de la base automatiques.

## API mobile (`/api/mobile/v1`)

Authentification par code d'accès (jeton Bearer), puis :

| Route | Rôle |
| --- | --- |
| `POST /auth/code` | Connexion par code (parent, élève, employé) |
| `GET /me` | Profil et photo |
| `GET /categories`, `GET /articles` | Catalogue de la carte, filtre par catégorie |
| `GET /menus`, `GET /menus/semaine` | Menus publiés |
| `GET/POST /reservations`, `POST /reservations/annuler` | Réservation des repas |
| `GET/POST /commandes` | Commandes (sur place ou à emporter, paiement portefeuille ou espèces) |
| `GET /wallet`, `GET /wallet/transactions` | Solde, QR, historique |
| `POST /wallet/recharge`, `POST /wallet/verifier` | Recharge Paystack et vérification |
| `POST /wallet/carte-cadeau` | Utilisation d'une carte cadeau |
| `GET /images/[id]` | Images protégées |

Les prix sont toujours recalculés côté serveur.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 7 avec PostgreSQL 17, Redis 7, Docker Compose, Paystack.

## Lancer le projet

Prérequis : Node.js 22+, Docker.

```bash
git clone <url-du-depot> erp-miam
cd erp-miam
cp .env.example .env        # puis éditez les valeurs
```

### Avec Docker (tout-en-un)

```bash
docker compose up -d --build
```

L'application écoute sur http://localhost:3001 (la base et Redis ne sont exposés qu'en local). Les migrations sont appliquées au démarrage du conteneur.

### En développement

```bash
docker compose up -d db redis
npm ci
npx prisma generate
npx prisma migrate dev
npx prisma db seed          # crée le compte administrateur défini dans .env
npm run dev                 # http://localhost:3001 (arrêtez le conteneur app s'il tourne)
```

Contrôles avant de livrer : `npx tsc --noEmit` puis `npm run build`.

### Données de démonstration (facultatif)

Les scripts `scripts/seed-demo*.mjs` créent des établissements, inscrits, menus et transactions fictifs ; `scripts/creer-cartes-cadeaux.mjs` génère des cartes cadeaux de test ; `scripts/supprimer-demo.mjs` retire les données de démonstration. Exemple : `npx tsx scripts/seed-demo.mjs`.

### Paystack

Renseignez `PAYSTACK_SECRET_KEY` et `PAYSTACK_PUBLIC_KEY` (clés de test au départ) et `APP_URL`. Le webhook est `/api/paystack/webhook`, la page de retour `/api/paystack/retour`.

## Tests

Des scénarios de test se trouvent dans `scripts/test-*.mjs` (caisse, menus, paiements, API mobile, sécurité…). Ils créent leurs propres données ; lancez-les sur une base de développement : `npx tsx scripts/test-mobile-api.mjs`.

## Structure

- `src/app` : pages et routes API.
- `src/lib` : logique métier (paiements, menus, accès mobile, cartes cadeaux…).
- `prisma` : schéma et migrations.
- `scripts` : seeds, outils et tests.
- `docker-compose.yml`, `Dockerfile` : déploiement.

## Sécurité

Ne publiez jamais `.env`, les sauvegardes (`backups/`) ni de clés Paystack. Utilisez des clés de test en développement.
