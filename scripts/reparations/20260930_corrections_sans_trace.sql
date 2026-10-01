-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECTIONS DE DONNÉES DU 30/09 FAITES SANS TRACE — RELEVÉ ET CONSTAT
-- ═══════════════════════════════════════════════════════════════════════════
-- Écrit le 01/10 (nuit) par Claude, en LECTURE SEULE de la prod.
--
-- Ces corrections ont été appliquées le 30/09 entre 12:09 et 20:21 (Paris),
-- directement en base, sous la marque « GO Nico » (go = nico_3009), par la
-- session cloud 0192CTiba9E5V3PxRQ9EWtBg (celle des commits 6e8bfc6 → 6d7cff4)
-- pour les cinq premières, et par la session du soir pour la sixième.
-- ⚠️ Les requêtes d'ORIGINE sont introuvables : le journal de la session cloud
-- n'est pas sur le poste, aucun fichier ne les porte. Ce fichier les
-- RECONSTITUE à partir des traces qu'elles ont laissées en base (marques,
-- sauvegardes intégrées) ; il ne modifie RIEN. Chaque requête ci-dessous est
-- une lecture (SELECT) et peut être relancée sans risque.
--
-- Inverses : 20260930_corrections_sans_trace_INVERSE.sql (verrouillés, un par
-- correction, sauvegarde avant, à lancer seulement sur décision de Nico).
--
-- ┌───────┬──────────────────────────────────────────────┬──────┬────────┬──────────────────────────────┐
-- │ Heure │ Correction                                   │ Nb   │ Comptes│ Marque en base               │
-- ├───────┼──────────────────────────────────────────────┼──────┼────────┼──────────────────────────────┤
-- │ 12:13 │ 1. Dépôts Beebs numérotés PAR LA PHOTO       │  185 │    2   │ platform_fields.numero_par_  │
-- │ →12:28│    (dHash/pHash, numéro + lien posés)        │      │        │ photo (+ avant_numero_photo_ │
-- │       │                                              │      │        │ 3009 = état d'avant)         │
-- │ 12:29 │ 2. Annonces retenues en silence rattachées   │   94 │    2   │ rapprochements.detail.motif  │
-- │       │    à ces dépôts (par leur numéro)            │      │        │ = liberation_retenue_3009    │
-- │ 12:14 │ 3. Fiches fusionnées par la photo            │ 1090 │   31   │ inventaire_fusions.par =     │
-- │ →13:34│    · 581 via une question « même article ? » │      │        │ 'utilisateur:photo_go_nico_  │
-- │       │    · 509 sans question                       │      │        │ 3009'                        │
-- │ 12:27 │ 4. Questions fermées « caduques » (une des   │  501 │   15   │ decide_par = photo_go_nico_  │
-- │ →13:34│    deux fiches venait d'être fusionnée)      │      │        │ 3009, statut caduque         │
-- │ 13:35 │ 5. Questions fermées « périmées » (même      │   89 │    4   │ decide_par = perimee_go_     │
-- │       │    raison)                                   │      │        │ nico_3009                    │
-- │ 13:50 │ 6. Questions fermées « pas le même article » │  146 │   11   │ decide_par = pas_le_meme_    │
-- │ →14:33│    (photos différentes)                      │      │        │ article_photos_3009          │
-- │ 20:21 │ 7. Questions fermées « deux exemplaires »    │   92 │   22   │ decide_par = regle_deux_     │
-- │       │    (les deux fiches en ligne sur une même    │      │        │ exemplaires_3009             │
-- │       │    plateforme)                               │      │        │                              │
-- └───────┴──────────────────────────────────────────────┴──────┴────────┴──────────────────────────────┘
--
-- ⚠️ Le relevé du 30/09 annonçait « 581 fusions » : c'est faux, il y en a
-- 1 090. 581 avaient une question, 509 n'en avaient pas.
--
-- RÉVERSIBILITÉ (relue le 01/10 vers 00:40) :
--   · Fusions : 1 090 sur 1 090 réversibles. Chacune a sa ligne
--     inventaire_fusions avec champs_repris ET deplacements (ce qui a bougé,
--     ce qui a été repris) ; aucune n'est déjà défaite ; les 1 090 fiches
--     absorbées existent toujours et pointent vers leur fiche gardée ; aucune
--     fiche gardée n'est vendue depuis. Défaire = inventaire_defusionner_pour,
--     la fonction du bouton « Défaire » de l'app.
--     Limite : ce qui est arrivé sur la fiche gardée APRÈS la fusion y reste
--     (au 01/10 : 8 fiches gardées avec de nouveaux jobs, 4 avec de nouvelles
--     annonces, 1 fusion enchaînée).
--   · Numéros par la photo : 185 sur 185. L'état d'avant (numéro, lien, lien
--     en attente, identifiant non prouvé) est sauvegardé DANS chaque job
--     (platform_fields.avant_numero_photo_3009). Numéros tous intacts.
--   · Rattachements : 94 sur 94. L'état d'avant de l'annonce (job, source,
--     date d'écartement) est dans rapprochements.detail.avant.
--   · Questions fermées : le statut d'avant est « proposee » (seul statut
--     qu'on ferme) ; la marque decide_par suffit à les retrouver tant que
--     personne ne les a re-décidées.
--
-- RÈGLES : ces corrections ont été faites sous « GO Nico ». La 1re identifie
-- des dépôts par la photo, ce que les consignes du 28/09 excluaient (jamais
-- titre, prix, photo, ressemblance) : la décision de les garder ou de les
-- défaire revient à Nico.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Dépôts Beebs numérotés par la photo (185) ───────────────────────────
-- Effet reconstitué : pour chaque dépôt Beebs publié sans numéro, si la photo
-- de l'annonce relevée = celle du dépôt (dHash 0, pHash 0), le numéro de
-- l'annonce devient platform_listing_id, l'URL /fr/p/<numéro> listing_url, et
-- l'état d'avant est copié dans platform_fields.avant_numero_photo_3009.
SELECT j.user_id, count(*) AS depots,
       count(*) FILTER (WHERE j.platform_listing_id = j.platform_fields -> 'numero_par_photo' ->> 'numero') AS numero_intact,
       min(j.platform_fields -> 'numero_par_photo' ->> 'le') AS premier, max(j.platform_fields -> 'numero_par_photo' ->> 'le') AS dernier
  FROM public.cross_post_jobs j
 WHERE j.platform_fields ? 'numero_par_photo'
 GROUP BY j.user_id;

-- ── 2. Annonces retenues rattachées à leur dépôt (94) ──────────────────────
-- Effet reconstitué : les annonces Beebs écartées en silence au relevé
-- (motif retenue_silencieuse_beebs, 30/09 12:09) dont le numéro = celui d'un
-- dépôt de la correction 1 ont été rattachées à ce dépôt et à sa fiche
-- (source_rapprochement = 'job', ignoree_le vidé), avec une ligne
-- rapprochements (par job, décision attache, detail.avant = état d'avant).
SELECT r.user_id, count(*) AS annonces,
       count(*) FILTER (WHERE a.job_id = (r.detail ->> 'job_id')::uuid AND a.source_rapprochement = 'job') AS toujours_rattachees
  FROM public.rapprochements r
  JOIN public.annonces_plateforme a ON a.id = r.annonce_id
 WHERE r.detail ->> 'motif' = 'liberation_retenue_3009'
 GROUP BY r.user_id;

-- ── 3. Fusions par la photo (1 090) ────────────────────────────────────────
-- Effet reconstitué : public.inventaire_fusionner_pour(user, garde, absorbe,
-- 'utilisateur:photo_go_nico_3009') par paire ; pour les 581 paires qui
-- avaient une question, inventaire_doublons passé à statut 'fusionnee',
-- fusion_id posé, decide_par = 'photo_go_nico_3009'.
SELECT (d.id IS NOT NULL) AS via_question, count(*) AS fusions, count(DISTINCT f.user_id) AS comptes,
       count(*) FILTER (WHERE f.defait_le IS NOT NULL) AS deja_defaites,
       count(*) FILTER (WHERE f.champs_repris IS NOT NULL AND f.deplacements IS NOT NULL) AS sauvegarde_complete,
       count(*) FILTER (WHERE ia.id IS NULL) AS absorbe_disparu
  FROM public.inventaire_fusions f
  LEFT JOIN public.inventaire_doublons d ON d.fusion_id = f.id
  LEFT JOIN public.inventaire ia ON ia.id = f.absorbe
 WHERE f.par = 'utilisateur:photo_go_nico_3009'
 GROUP BY 1;

-- ── 4 à 7. Questions fermées (501 + 89 + 146 + 92) ─────────────────────────
-- Effet reconstitué : UPDATE inventaire_doublons SET statut = 'caduque',
-- decide_le = now(), decide_par = <marque> sur des questions 'proposee' :
--   4. photo_go_nico_3009          : une des deux fiches venait d'être fusionnée ;
--   5. perimee_go_nico_3009        : idem (passe de 13:35) ;
--   6. pas_le_meme_article_photos_3009 : photos des deux fiches différentes ;
--   7. regle_deux_exemplaires_3009 : les deux fiches EN LIGNE aujourd'hui sur
--      une même plateforme = deux exemplaires (décrit dans
--      docs/INCIDENT_2026-09-30_SOIR_FUSION_PHOTO_BEEBS_LOUIS.md).
SELECT d.decide_par, d.statut, count(*) AS questions, count(DISTINCT d.user_id) AS comptes,
       count(*) FILTER (WHERE ig.fusionne_dans IS NOT NULL OR ia.fusionne_dans IS NOT NULL) AS une_fiche_fusionnee
  FROM public.inventaire_doublons d
  LEFT JOIN public.inventaire ig ON ig.id = d.garde
  LEFT JOIN public.inventaire ia ON ia.id = d.absorbe
 WHERE d.decide_par IN ('photo_go_nico_3009', 'perimee_go_nico_3009',
                        'pas_le_meme_article_photos_3009', 'regle_deux_exemplaires_3009')
   AND d.statut = 'caduque'
 GROUP BY 1, 2
 ORDER BY 1;
