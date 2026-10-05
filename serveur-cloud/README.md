# FillSell Cloud — l'orchestrateur des navigateurs hébergés

Un serveur Hetzner (Allemagne), un **navigateur steel-browser par compte**
(conteneur Docker), une **IP française dédiée** par compte (IPRoyal), notre
**extension** dedans (copie Cloud, construite depuis `chrome-extension/` sans
le toucher). Ni Opla (sorti le 10/10) ni eBay (par l'API existante).

## Ce que fait l'orchestrateur (`src/`)

| Module | Rôle |
|---|---|
| `postes.js` + `planificateur.js` | Chaque minute : quels navigateurs allumer / éteindre (`planifierPostes`, pur et testé). Délai entre deux sessions **non tranché** : `coin_config.cloud_delai_sessions_min` (absent = en continu). Jamais coupé au milieu d'un job. Garde CPU : au-dessus de 50 % (`veille_cpu`), aucun démarrage sauf une connexion demandée. |
| `navigateur.js` | Le conteneur d'un compte. **Trois verrous contre la fuite de l'IP du serveur** : le navigateur « au repos » de steel n'a jamais le profil du compte ; le profil n'est monté qu'au chemin d'une session `persist`, toujours créée avec le proxy ; le pare-feu (`deploiement/pare-feu-navigateurs.sh`) ne laisse sortir que vers les ports des proxys. |
| `coffre.js` | Les connexions aux plateformes, **chiffrées ici** (AES-256-GCM, clé `COFFRE_CLE` sur le serveur seulement). La base (`cloud_coffre`) ne voit que du chiffré. Une sauvegarde « déconnectée » n'écrase jamais une connexion. |
| `sessionFillsell.js` | La session FillSell du navigateur, **posée par le serveur** (generate_link → verify, comme `extension-session`), jamais un mot de passe. Un seul détenteur du refresh token à la fois. |
| `connexion.js` | L'écran « Me connecter » : la page de connexion de la plateforme, au format mobile, en flux d'images ; gestes et clavier rejoués. Navigation limitée à la connexion (+ Apple / Google / Facebook). Connectée → coffre sauvegardé, compte de plateforme noté (essai unique). |
| `entretien.js` | Chaque heure : `cloud_pool_entretien()`, **purges prouvées** des IP parties au repos, contrôles d'entrée / de sortie, échéances relues chez IPRoyal, alertes à support@. Aucun achat sans GO. |
| `cdp.js` | Un client DevTools minimal (une connexion, une session par cible). |

## Déployer

Prérequis (Nico) : compte Hetzner + `HCLOUD_TOKEN` dans
`C:\Users\nicol\fillsell-cloud-proto\secrets.env` ; la migration du socle
appliquée (`20261004233000` puis `20261005120000`, et le sel du vault).

```bash
node serveur-cloud/outils/creer-serveur.mjs --infos     # prix lus dans l'API, rien n'est créé
node serveur-cloud/outils/creer-serveur.mjs --go        # serveur cx43 à Falkenstein + cloud-init
node scripts/cloud/build-extension-cloud.mjs            # build/extension-cloud/
bash serveur-cloud/outils/deployer.sh <ip> [cloud.fillsell.app]
```

Sur le serveur (`/srv/fillsell-cloud`) :

```bash
cd /srv/fillsell-cloud/deploiement
docker compose exec orchestrateur node outils/ip.mjs ajouter <commande_iproyal>   # une IP achetée par Nico
docker compose exec orchestrateur node outils/ip.mjs pool
docker compose exec orchestrateur node outils/ticket.mjs <user_id>                # lien de test (30 min)
docker compose logs -f orchestrateur
```

## Tests

```bash
npm run selftest:cloud-orchestrateur   # parties pures (15 tests)
npm run selftest:cloud-extension       # copie Cloud de l'extension + poste_cloud de get-pending-jobs
npm run selftest:cloud-pool            # règles du pool (miroir de la migration)
node scripts/cloud/banc-sql-socle.mjs  # la migration jouée dans PGlite
```
