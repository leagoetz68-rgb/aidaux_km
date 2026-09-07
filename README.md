# Frais Kilométriques — AID'Aux (Vercel)

Site statique + fonctions serverless Node.js, base de données Postgres.
Aucune étape de build : tu peux tout gérer depuis l'éditeur web GitHub, comme tes autres apps.

## Fichiers

- `index.html` — l'application (design identique à la version d'origine)
- `api/trajets.js` — liste / ajoute / réinitialise les trajets d'un mois
- `api/trajets/[id].js` — supprime un trajet précis
- `api/settings.js` — lit / enregistre le domicile d'un salarié
- `lib/db.js` — connexion Postgres (créée automatiquement au premier appel)
- `sql/schema.sql` — le schéma, pour référence ou exécution manuelle
- `package.json` — dépendance `pg`

## Déploiement

1. **GitHub** : crée un nouveau repo et uploade tous ces fichiers en conservant l'arborescence
   (`api/trajets/[id].js` doit bien être dans un sous-dossier `trajets`).
2. **Vercel** : sur vercel.com, "Add New Project" → importe ce repo. Aucune configuration
   de build n'est nécessaire (Vercel détecte les fichiers `/api` automatiquement).
3. **Base de données** : dans les réglages du projet Vercel → *Environment Variables*,
   ajoute une variable `DATABASE_URL` avec une chaîne de connexion Postgres.
   - Tu peux réutiliser ta base Neon existante (créer une nouvelle base ou juste un nouveau
     schéma dans le même projet Neon, pour ne pas mélanger avec les autres apps), ou
   - créer une base Neon dédiée à cette app.
4. Redéploie (ou déploie simplement — Vercel le fait automatiquement après le premier push).

Les tables sont créées automatiquement au premier appel à l'API — pas besoin d'exécuter
`sql/schema.sql` toi-même, sauf si tu veux vérifier la structure à l'avance.

## Notes

- Le domicile est maintenant enregistré par salarié dans la base (au lieu d'un réglage
  global), donc plusieurs salariés peuvent utiliser la même app sans se marcher dessus.
- Le nom du dernier salarié saisi est mémorisé dans le navigateur (localStorage) pour
  éviter de le retaper à chaque visite — c'est propre à cet appareil, pas partagé.
- Export CSV et impression fonctionnent toujours entièrement côté navigateur, sans appel serveur.
