[README.md](https://github.com/user-attachments/files/32053924/README.md)
# Frais Kilométriques — AID'Aux (Vercel)

Site statique + fonctions serverless Node.js, base de données Postgres.
Aucune étape de build : tu peux tout gérer depuis l'éditeur web GitHub, comme tes autres apps.

## Fichiers

- `index.html` — l'application (design identique à la version d'origine)
- `admin.html` — vue direction autonome (mêmes comptes que ci-dessous)
- `reset.html` — page « mot de passe oublié / définir le mot de passe »
- `api/trajets.js` — liste / ajoute / réinitialise les trajets d'un mois
- `api/trajets/[id].js` — supprime un trajet précis
- `api/settings.js` — lit / enregistre le domicile d'un salarié
- `api/auth/login.js` — connexion (email + mot de passe) → jeton de session signé
- `api/auth/request-reset.js` — envoie un lien de définition de mot de passe par email
- `api/auth/set-password.js` — valide le lien et enregistre le mot de passe
- `lib/db.js` — connexion Postgres pour les données de trajets
- `lib/authdb.js` — connexion à la base de comptes partagée (`comptes` / `comptes_tokens`)
- `lib/passwordHash.js` — hachage/vérification compatible avec Werkzeug (scrypt), pour que
  la même table de comptes serve aussi bien les applis Flask que celle-ci
- `lib/sessionToken.js` — jetons de session signés (HMAC), sans état côté serveur
- `lib/mail.js` — envoi d'email via l'API Brevo
- `sql/schema.sql` — le schéma des trajets, pour référence ou exécution manuelle
- `package.json` — dépendance `pg`

## Déploiement

1. **GitHub** : crée un nouveau repo et uploade tous ces fichiers en conservant l'arborescence
   (`api/trajets/[id].js` doit bien être dans un sous-dossier `trajets`, `api/auth/*.js` dans
   un sous-dossier `auth`).
2. **Vercel** : sur vercel.com, "Add New Project" → importe ce repo. Aucune configuration
   de build n'est nécessaire (Vercel détecte les fichiers `/api` automatiquement).
3. **Base de données** : dans les réglages du projet Vercel → *Environment Variables*,
   ajoute une variable `DATABASE_URL` avec une chaîne de connexion Postgres (les trajets).
   - Tu peux réutiliser ta base Neon existante (créer une nouvelle base ou juste un nouveau
     schéma dans le même projet Neon, pour ne pas mélanger avec les autres apps), ou
   - créer une base Neon dédiée à cette app.
4. **Comptes (login direction)** : ajoute aussi ces variables :
   - `AUTH_DATABASE_URL` : l'URL de la base Neon partagée par toutes les applis AID'Aux
     (celle qui contient déjà la table `comptes`). Si absente, l'app retombe sur `DATABASE_URL`.
   - `SECRET_KEY` : une longue chaîne aléatoire, sert à signer les jetons de session.
   - `BREVO_API_KEY` : clé API Brevo, pour l'envoi du lien « définir mon mot de passe ».
   - `AUTH_ALLOWED_EMAILS` (optionnelle) : liste d'emails autorisés séparés par des virgules,
     sinon une liste par défaut est utilisée dans `lib/authdb.js`.
5. Redéploie (ou déploie simplement — Vercel le fait automatiquement après le premier push).

Les tables sont créées automatiquement au premier appel à l'API — pas besoin d'exécuter
`sql/schema.sql` toi-même, sauf si tu veux vérifier la structure à l'avance.

## Notes

- Le domicile est maintenant enregistré par salarié dans la base (au lieu d'un réglage
  global), donc plusieurs salariés peuvent utiliser la même app sans se marcher dessus.
- Le nom du dernier salarié saisi est mémorisé dans le navigateur (localStorage) pour
  éviter de le retaper à chaque visite — c'est propre à cet appareil, pas partagé.
- Export CSV et impression fonctionnent toujours entièrement côté navigateur, sans appel serveur.
- La vue « direction » (dans `index.html` et `admin.html`) demande désormais un compte
  individuel (email + mot de passe), avec un lien « mot de passe oublié / première
  connexion » qui envoie un email via Brevo — comme les autres applis AID'Aux. La saisie des
  trajets par les salariés (accueil) n'a pas de login, elle reste ouverte à tous.
