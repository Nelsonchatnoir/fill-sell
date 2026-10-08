# Reprise — terminal « multi-synchro » (07/10 soir → 08/10 nuit)

Règle de Nico (07/10) : « Un seul appui sur Synchroniser relève TOUTES les
plateformes connectées. L'utilisateur reçoit son stock DÉJÀ FUSIONNÉ ET
RATTACHÉ. » Conception et mesures : `docs/multi-synchro.md`.

## Ce qui est en ligne (08/10 nuit)

- **Base** : migrations 20261008020000 (moteur v3 : `rapprochement_v3_lire /
  empreintes / appliquer / marquer / fiche_de / fiche_intacte`,
  `demander_sync_plateforme` « recent » + eBay API réveillé, `synchro_avancement`,
  `synchro_relancer_rangement`), 20261008030000 (lecture sans « intact »),
  20261008040000 (`rapprochement_v3_empreinter` : les empreintes par pg_net) —
  toutes appliquées + `repair`.
- **Fonctions** : `rapprochement` **v8** (`false`) ; `empreintes-urls` v4
  (variantes du centre) ; `get-pending-jobs` v222 (jamais un relevé eBay à
  l'extension quand l'API est reliée) ; `handler-watch` **v92** (relance après
  MAJ « page de dépôt n'a pas fini de charger » → 0.6.103, quatre plateformes).
- **App** : OTA **2.9.66** servie sur `production` (lue avant : 2.9.65) :
  « Annonce en double ? », plateforme non connectée + « Me connecter » dans le
  résumé, Vinted en cadence = rangement relancé, « à vérifier » hors du stock.
- **Extension** : **0.6.103** empaquetée, envoyée en examen au CWS le 08/10 :
  `build/CWS-0.6.103-A-TELEVERSER/fillsell-extension-0.6.103-008995b-cws.zip`
  (BUILD_ID `2026-10-07T22:58:10Z+008995b`). ⚠️ Correction du 08/10 matin : la
  0.6.102 (b230ebe) a été TÉLÉVERSÉE le 06/10 au soir et elle est SERVIE (51
  postes) — ce rapport la disait « jamais téléversée » ; son zip est rangé dans
  `build/anciens-zips/CWS-0.6.102-PUBLIEE-06-10/`.
  Ce qui n'arrive QU'avec ce zip : un content script chargé mais muet se
  relance (rechargement de l'onglet puis onglet neuf, bornés) avant tout envoi
  à la page — synchro, publication, republication, retrait, toutes plateformes
  (`FILLSELL_PING`) ; page du dressing muette relue ; onglets de travail
  jamais déchargés par l'économiseur de mémoire. Tout le reste (serveur, app)
  marche avec l'extension servie (0.6.102 ; 0.6.100 sur les postes pas encore mis à jour).

## Ce qu'on a appris en prod cette nuit (à ne pas réapprendre)

1. **Un fetch edge → edge est limité à 60 appels par minute** (« Rate limit
   exceeded for function. Retry after 17873ms ») : 360 photos, puis plus rien.
   La trace par passage (`passages_photos` dans la réponse) l'a montré.
2. **pg_net n'est pas limité** (100 appels d'un coup : 100 × HTTP 200) — mais
   son worker (0.20.0) traite une itération complète avant la suivante : tout
   ce qu'une fonction appelée PAR pg_net met en file ne part qu'à sa réponse
   (39 appels mis en file à 23:07:41 UTC, exécutés à 23:09:12, à la seconde où
   la réponse est partie). Donc une fonction appelée par cron/trigger/script ne
   doit JAMAIS attendre une requête pg_net qu'elle vient de mettre en file, et
   doit rester courte : une invocation longue retarde tous les autres appels
   (mails, relevés eBay, crons) d'autant.
3. Le protocole de `rapprochement` v8 : lire → photos manquantes ? mettre 600
   en file (`rapprochement_v3_empreinter`) → répondre `empreintes` → se
   relancer 12 s après (`relance: n`, 12 rangs au plus, un seul appel edge →
   edge par invocation) ; progrès persisté (`photos_manquantes`,
   `passages_photos`) : six relectures sans progrès → on classe avec ce qu'on
   a (jamais une fusion sans photo : la fusion exige la photo). Le filet
   `rapprochement-1min` reprend un compte en `empreintes` dont `maj_le` a plus
   de 45 s. En simulation, le script passe `precedent`/`passages`.
4. Le plan rendu par la fonction en prod = le plan local avec les mêmes
   empreintes (558 décisions, 0 écart) ; les écarts avec la simulation locale
   du soir (547) venaient des empreintes calculées en local.

## Réparation du parc (voir `docs/agents/etat-2026-10-01.md`, « 08/10 nuit »)

`node scripts/reparations/20261008_reparation_rapprochement_v3.mjs --lister |
--simuler [--payants|--gratuits] | --appliquer --tous --simulation <fichier>`.
Sauvegardes `_backup_0810_v3_<user8>_*` (RLS, fermées) ; inverse
`20261008_reparation_rapprochement_v3_INVERSE.sql`. Journaux :
`build/rattachement/simuler-0810-nuit*.log`, `application-v3-*.json`.

## Résultats (03:10)

106 comptes simulés puis appliqués, 0 erreur, 0 fiche supprimée, 0 job créé :
421 fusions, 521 rattachements, 472 créations, 456 « à vérifier » (hors du
stock), 530 « Annonce en double ? », annonces sans article 1 051 → 29. Chiffres
par compte : `docs/agents/etat-2026-10-01.md` (« 08/10 nuit »). Deux comptes
trop gros pour la fonction en mode réparation (dbca7f39, 7373c96c) : passés par
`20261008_reparation_v3_locale.mjs` ; leur synchro quotidienne (mode normal)
tient en < 1 s depuis la v11.

## Reste à faire

- Téléverser le zip 0.6.103 au CWS (Nico) ; `EXTENSION_MIN_BUILD` inchangé.
- fmallet25 : relier eBay à nouveau (Réglages → eBay → Relier) — la règle est
  corrigée (gpj v222), mais le compte a été délié par la personne le 07/10.
- Les fiches « à vérifier » : chaque compte garde ses questions, hors du stock.
