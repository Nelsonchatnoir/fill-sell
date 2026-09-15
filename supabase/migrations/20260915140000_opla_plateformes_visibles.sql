-- ═══════════════════════════════════════════════════════════════════════════
-- OPLA — LOT 7 : le drapeau d'AFFICHAGE, porté par le profil
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ÉCRITE, NON APPLIQUÉE. Validation et déclenchement par Nico, comme le lot
--    4 (a). À appliquer SEULE, jamais par `supabase db push` (interdit :
--    historiques divergents).
--
-- POURQUOI UNE COLONNE, ET PAS UNE CONSTANTE DE BUILD.
-- Nico veut voir Opla dans l'app avant l'ouverture, et pouvoir ouvrir le jour J
-- « sans rien redéployer ». Un `const OPLA_VISIBLE = true` dans le bundle exige
-- un build, un déploiement web ET une OTA — et il serait vrai pour tout le
-- monde à la seconde où il passe. Un drapeau porté par la LIGNE DE PROFIL se
-- bascule par un UPDATE, compte par compte ou d'un coup.
--
-- POURQUOI UN TABLEAU, ET PAS UN BOOLÉEN `opla_visible`.
-- Parce que la question reviendra. `plateformes_visibles` répond à « quelles
-- plateformes ce compte voit-il AVANT leur ouverture ? » — Opla aujourd'hui,
-- la suivante sans nouvelle migration. Un booléen par plateforme, c'est une
-- colonne par plateforme.
--
-- POURQUOI PAS UNE TABLE DE DRAPEAUX (feature_flags + jointure).
-- Elle imposerait : une table neuve (donc les GRANT de CLAUDE.md), deux
-- politiques RLS à écrire et à tester, et UNE REQUÊTE DE PLUS au démarrage de
-- l'app. Le profil est DÉJÀ lu au chargement (App.jsx, `fetchAll`) : ajouter
-- une colonne à ce SELECT coûte zéro aller-retour. Le jour où il y aura dix
-- drapeaux de natures différentes, la table se justifiera ; aujourd'hui elle
-- ajoute trois pièces mobiles pour deux comptes.
--
-- ── CE QUE CETTE COLONNE NE FAIT PAS ───────────────────────────────────────
-- ⛔ Elle ne contrôle QUE L'AFFICHAGE. Elle n'autorise aucune publication, elle
--    n'active aucun handler, elle ne lève pas `OPLA_ACTIF` (handlers/opla.js),
--    qui reste `false` et reste un cran SÉPARÉ. Un compte qui la porte VOIT
--    Opla, grisée, et ne peut pas la cocher : la case est `disabled` (cf.
--    ListingPreviewScreen, motif `pasEncoreOuverte`).
--
-- ── UNE PROPRIÉTÉ QU'IL FAUT CONNAÎTRE : ELLE EST EN LECTURE SEULE ─────────
-- `public.profiles` n'a PAS d'UPDATE au niveau table pour `authenticated` :
-- l'UPDATE y est accordé COLONNE PAR COLONNE (relevé en prod le 15/09 :
-- 44 colonnes en SELECT, 44 en INSERT, mais seulement 13 en UPDATE). Une
-- colonne NEUVE n'est donc pas modifiable par le client, sauf GRANT explicite —
-- et on n'en pose AUCUN ici. Conséquence voulue : personne ne peut s'ouvrir
-- Opla depuis l'app, même en appelant PostgREST à la main. La lecture, elle,
-- passe par le SELECT de table déjà accordé : rien à ajouter non plus.
-- ⚠️ Corollaire : le jour de l'ouverture, la bascule se fait en SQL (ici), pas
--    depuis l'app.
--
-- ── PAS DE CONTRAINTE CHECK SUR LES VALEURS, ET C'EST DÉLIBÉRÉ ─────────────
-- Poser `CHECK (plateformes_visibles <@ ARRAY['vinted',…,'opla'])` créerait un
-- 32ᵉ endroit où la liste des plateformes est écrite en dur
-- (docs/OPLA_INVENTAIRE_PLATEFORMES.md en dénombre déjà ~31, sans source
-- unique). Et l'erreur qu'elle attraperait — une faute de frappe — est déjà
-- sans danger : un slug inconnu ne correspond à aucune plateforme, donc rien
-- ne s'affiche. Le défaut est fail-safe, la contrainte serait du poids en plus.
--
-- IDEMPOTENTE : rejouable sans effet de bord (ADD COLUMN IF NOT EXISTS, et les
-- deux UPDATE n'ajoutent 'opla' que s'il n'y est pas déjà).

BEGIN;

-- ── 1. La colonne ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plateformes_visibles text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.profiles.plateformes_visibles IS
  'Plateformes visibles PAR AVANCE pour ce compte (avant ouverture générale). '
  'AFFICHAGE UNIQUEMENT : n''autorise aucune publication — OPLA_ACTIF '
  '(chrome-extension/handlers/opla.js) reste le seul interrupteur de dépôt, et '
  'il est séparé. Pas d''UPDATE accordé à authenticated : bascule en SQL.';

-- ── 2. Les deux bénéficiaires ──────────────────────────────────────────────
-- Par EMAIL et non par UUID : un email se relit, un UUID se recopie mal.
--   · nicolas.svobodny@gmail.com — Nico
--   · ornellaracano@icloud.com   — Ornella (compte confirmé le 15/09 : c'est
--     lui qui porte l'article 1788791696397, les taies du dossier du 12/09 ;
--     deux autres comptes portent le prénom « Ornella » — fstesteur@proton.me
--     et ornellamonticelli27@gmail.com — ET NE SONT PAS VISÉS).
-- array_append conditionnel : rejouable, et n'écrase pas une plateforme déjà
-- posée sur la ligne.
DO $$
DECLARE
  destinataires text[] := ARRAY['nicolas.svobodny@gmail.com', 'ornellaracano@icloud.com'];
  touchees      int;
BEGIN
  UPDATE public.profiles p
     SET plateformes_visibles = array_append(p.plateformes_visibles, 'opla')
    FROM auth.users u
   WHERE u.id = p.id
     AND lower(u.email) = ANY (SELECT lower(unnest(destinataires)))
     AND NOT ('opla' = ANY (p.plateformes_visibles));
  GET DIAGNOSTICS touchees = ROW_COUNT;
  RAISE NOTICE 'plateformes_visibles += opla : % ligne(s) modifiee(s)', touchees;

  -- Un email qui ne correspond à AUCUN compte est une erreur de saisie, pas un
  -- non-événement : on le dit, sans faire échouer la migration (la colonne,
  -- elle, doit exister quoi qu'il arrive).
  PERFORM 1 FROM unnest(destinataires) d
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(d));
  IF FOUND THEN
    RAISE WARNING 'Au moins un email de la liste ne correspond a aucun compte — verifier avant de conclure que le drapeau est pose.';
  END IF;
END $$;

COMMIT;

-- ── CONTRÔLE APRÈS APPLICATION (à LIRE, pas à déduire) ─────────────────────
-- SELECT u.email, p.plateformes_visibles
--   FROM public.profiles p JOIN auth.users u ON u.id = p.id
--  WHERE 'opla' = ANY (p.plateformes_visibles);
-- Attendu : EXACTEMENT 2 lignes, celles de Nico et d'Ornella.
--
-- Contrôle que personne d'autre ne l'a :
-- SELECT count(*) FROM public.profiles WHERE plateformes_visibles <> '{}'::text[];
-- Attendu : 2.
--
-- Contrôle que le client ne peut pas se l'accorder :
-- SELECT privilege_type FROM information_schema.column_privileges
--  WHERE table_schema='public' AND table_name='profiles'
--    AND column_name='plateformes_visibles' AND grantee='authenticated';
-- Attendu : SELECT et INSERT hérités du défaut, JAMAIS UPDATE.
--
-- ── OUVERTURE GÉNÉRALE (le jour J, Nico seul) ──────────────────────────────
-- UPDATE public.profiles
--    SET plateformes_visibles = array_append(plateformes_visibles, 'opla')
--  WHERE NOT ('opla' = ANY (plateformes_visibles));
-- ⚠️ Cela ouvre L'AFFICHAGE à tout le monde. La PUBLICATION reste fermée tant
--    que `OPLA_ACTIF` est false et que la case reste `disabled` côté app :
--    ouvrir l'affichage n'ouvre pas le dépôt, c'est tout l'intérêt des deux
--    crans séparés.
--
-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Retirer le drapeau sans toucher à la colonne (réversible, sans perte) :
-- UPDATE public.profiles
--    SET plateformes_visibles = array_remove(plateformes_visibles, 'opla');
-- Retirer la colonne entièrement (elle ne porte rien d'autre aujourd'hui) :
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS plateformes_visibles;
