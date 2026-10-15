# Refonte — Étape 1 : une seule vérité sur les attentes (nuit du 15 au 16/10/2026)

> Mission de Nico : plus aucun temps estimé nulle part, un seul vocabulaire d'état, un seul endroit
> qui le calcule, des loaders qui disent ce qui se passe. Livré cette nuit (app, extension, serveur).
> Périmètre strict : états de job, attentes, loaders. Les écrans pleins ne sont touchés que pour le vocabulaire.

## 1. Les six mots (les mêmes partout)

| Mot | Ce que ça veut dire | Statuts techniques qui y vont |
|---|---|---|
| **En file** | ça partira tout seul, à son tour | `pending` servable (extension vivante, aucune retenue) |
| **En cours** | l'ordinateur ou nos serveurs y travaillent maintenant | `processing` ; republication à l'étape `deleted` (hors ligne entre retrait et remise en ligne) |
| **Fait** | publiée, republiée, retirée | `published`, `sold`, `dry_run_completed`, `deleted` (retrait), republication `recreated` |
| **À toi de jouer** | une question, une connexion, une autorisation, ou une publication pas partie à relancer | `needs_user` (sauf attentes automatiques), `pending` + `attente_session` (connexion), Opla/Depop à autoriser, `failed` |
| **En pause** (raison en une ligne) | retenu, ça repart seul | `pending` retenu : retenue serveur, boutique à ouvrir, limite du jour, rythme, créneau, module auto en pause, plateforme en pause chez nous, nouvel essai automatique, ordinateur éteint / extension à reconnecter, mise à jour de l'extension ; `needs_user` automatiques (`introuvable_a_confirmer`, `ebay_site_etranger`, `plateforme_ecartee`, `build_min_requis`, boutique étrangère prouvée, pause technique avant retrait) |
| **Arrêtée** | annulée (à ta demande, vendue, doublon) : rien à faire | `cancelled`, `arret_utilisateur` |

Ton (couleur) : `fait` = ok (teal) · `a_toi` = ambre, rouge seulement pour « pas partie » · le reste = neutre.

## 2. Une seule source

- **`supabase/functions/_shared/etat-job.js`** — `etatJob(job, ctx)` → `{ etat, motif, detail }`, `libelleEtat`, `tonEtat`,
  `jobFini`, `attenteAutomatique`, `sansEstimation`. Pur, importable par l'app (Vite), le serveur (Deno) et l'extension.
- **L'app** ne décide plus : `src/utils/fileDesJobs.js` (`situationJob`) prend l'état du module et ne choisit que la phrase ;
  `barresJobs`, `BarreProgression` (badges), `BarreJobCarte`, `stock/regles.js` (`pastilleCourte`), la modale « Où en est la
  publication » (StockTab), la pastille de republication (StockTab `etapeRepublication`), `publication/EcranSuivi.jsx`,
  `publication/lot/SuiviLot.jsx`, `LotPublication.jsx` affichent `LIBELLES`.
- **L'extension** embarque une copie BUNDLÉE et générée (`chrome-extension/etat-job.js`, `npm run gen:etat-job-extension`) ;
  le popup lit `FILLSELL_ETAT_JOB.libelleEtat`. `selftest:etat-job` refuse toute divergence source ↔ copie.
- **Le serveur** n'écrit plus d'heure ni de durée dans `cross_post_jobs.error` ; côté app, `humanizeJobError` passe TOUT texte
  de job par `sansEstimation` (filet unique : un ancien texte en base ne promet plus rien).

Restes connus (pas « single source » encore, hors périmètre de la nuit) : `shared.natureNeedsUser` (en_cours / a_completer /
action) et `stockFiltres.etatPlateformes` calculent encore la NATURE d'un needs_user pour les filtres du Stock ; les étapes
internes de republication (« Relevé… / Retrait… / Recréation… ») vivent dans `titre`/`detail` de la pastille.

## 3. Plus aucun temps estimé — ce qui a été retiré

Inventaire complet (3 agents, 15/10 soir) : `docs/refonte/inventaire/` (app 443 lignes, extension 237, serveur 180).
Retirés cette nuit, devant la personne :
- **App** : « Environ N min » du bloc Synchroniser, « d'ici quelques minutes », « Prochain passage dans 2 min au plus »,
  « toutes les 2 min », « Tu pourras synchroniser dans N min », « ~N min (tentative a/b) », « Remonter · dans ~N h »,
  « patiente ~N min », « Relancer dans N min », « deux minutes environ », « 2 minutes au plus », « ~1-2 minutes », « en
  quelques minutes/secondes » (stepper, pitch extension, page extension, stats), « Renvoyer dans N s » (3 écrans + confirmation
  d'inscription : « Renvoyer (envoyé à l'instant) »), « laisse Chrome ouvert 2 minutes », « nouvelle vérification dans 24 h ».
- **Extension** (0.6.115) : « Reprise automatique dans ~X min (tentative a/5) » (une quarantaine de messages), « ~20 min »,
  « un quart d'heure », « une demi-heure », « trois quarts d'heure », « 6 h », « toutes les heures », « dans quelques
  minutes » (content scripts photo, Vinted), popup : « prochain dans N min », « Prochaine recréation vers HH:MM », « Échec » sur un
  simple ré-armement (→ En pause).
- **Serveur** : « On réessaie tout seuls vers HH:MM », « (prochain essai vers 14 h 05) », date du prochain créneau,
  « prochain essai dans 2/10/30 min », « reprend toute seule dans 30 minutes / 1 h / 2 h / 6 h », « retenté toutes les heures »,
  « toutes les 20 minutes », « dans 45 minutes », « dans 2 minutes », « dans quelques minutes », « trois quarts d'heure / trois
  heures / six heures », « ~1 h / 3 h / 6 h » (LBC), « (encore N j) », mails welcome/how_it_works (« une minute », « quelques
  minutes par plateforme »).
- Gardés, et dits : les FAITS passés (« depuis le 14/10 », « il y a 12 min »), les dates imposées par un tiers ou un contrat
  (restriction Vinted « jusqu'au 20/10 », relance Stripe, fin d'essai, résiliation), les réglages eBay (retours sous 30 jours).
  Chaque ligne gardée porte `estimation-ok:` avec sa raison.
- **Garde** : `npm run selftest:aucune-estimation` lit les sources (app, extension, serveur, mails) et refuse toute promesse de
  délai. 0 ligne au 16/10.

## 4. Loaders : ce qui se passe, sans durée
- Barre de progression : les phrases d'étape restent (« Dépôt en cours sur Vinted, dans ton Chrome… »), le pourcentage animé aussi
  (décision à prendre, voir rapport : il glisse sur des durées médianes, jamais affichées). Badges : Fait · À toi de jouer · Arrêtée
  · En pause · En file.
- Synchroniser : plus de « temps restant » ; la barre = plateformes terminées sur visées + lignes par plateforme.

## 5. Preuves
- `selftest:etat-job` (mapping, file, pastilles, copie extension, nettoyage), `selftest:file-des-jobs`, `selftest:aucune-estimation`,
  `selftest:stock-refonte`, `selftest:progression`, `selftest:questions-tranchees`, `selftest:boutique-connectee`,
  `selftest:extension-a-mettre-a-jour`, `selftest:gpj-file-longue-et-pause` ; suite complète relancée avant le commit :
  **321/321** (16/10 00:22, après la mise à jour de six tests qui figeaient les anciens textes « vers HH:MM », « ~1 h »,
  « samedi 03/10 à 19:00 », « nouvelle vérification dans 24 h », « temps restant », ordre des scripts du popup).
- **Servi le 16/10 (00:25)** : update-job-status **v138** (false), get-pending-jobs **v254** (true), handler-watch **v112**
  (false), ebay-api-worker **v87** (false), email-tunnel **v73** (false) — `verify_jwt` lus avant et après, inchangés.
- `npm run build:essai` vert ; extension : `node --check` sur popup, background et content scripts ; captures du popup vide
  (`docs/refonte/captures/extension/`).

## 6. Migration préparée, NON appliquée
`supabase/migrations/20261016010000_relancer_connexion_depop_libelle.sql` — `relancer_jobs_connexion_echus` nommait « Opla » pour un
job Depop et accordait mal « le retrait … repartira toute seule ». Corps repris de `pg_get_functiondef` en prod le 16/10 ; essai à blanc
fait dans une transaction annulée (la prod relue après : inchangée) ; inverse : `supabase/rollbacks/20261016010000_relancer_connexion_depop_libelle.sql`.
Feu vert de Nico requis avant `db query --linked -f` + `migration repair`.
