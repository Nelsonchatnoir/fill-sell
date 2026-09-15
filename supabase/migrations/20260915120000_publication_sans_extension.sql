-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLIER SANS EXTENSION : le job attend, il n'est plus refusé
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ÉCRITE, PAS APPLIQUÉE. Nico valide et déclenche, comme toute migration de
--    ce projet. `supabase db push` reste INTERDIT : celle-ci s'applique SEULE.
--
-- POURQUOI. Le 04/08 (commit df7a5d6), une garde a été posée pour ne plus
-- DÉBITER des Pépites au profit d'une publication que personne ne pouvait
-- exécuter : 23 jobs de 13 comptes dormaient en pending, 12 des 13 sur mobile,
-- où l'on ne peut pas installer une extension Chrome. Le principe écrit alors
-- était juste : « on ne débite jamais pour quelque chose qui n'est pas livré ».
--
-- CE MOTIF N'EXISTE PLUS. Depuis la bascule du 02/09, price_generate vaut 0 et
-- il n'existe AUCUNE clé price_publish : publier ne coûte plus une Pépite. Ce
-- qui est consommé, c'est le QUOTA D'ANNONCES — et il l'est à la GÉNÉRATION,
-- donc bien avant ce refus. La garde ne protégeait donc plus un débit : elle
-- détruisait le travail que le quota venait de facturer. Le commentaire de la
-- fonction le dit lui-même (« CONSERVÉE à prix nul, garde d'exécuteur ») : elle
-- a été maintenue en changeant sa justification, pas en la vérifiant.
--
-- CE QUE ÇA A COÛTÉ, mesuré le 15/09 :
--   · 286 comptes, 419 générations depuis le 04/08 — zéro job, zéro article ;
--   · sur les 30 derniers jours : 194 comptes sans extension, 300 générations,
--     ZÉRO publication. Pas une seule.
--   · rien n'était tracé : en base, un mur et un abandon volontaire étaient
--     indistinguables. C'est ce qui a permis à la régression de durer six
--     semaines. (La trace arrive par ailleurs : usage_logs 'extension_absente'.)
--
-- CE QUE LE RESTE DU SYSTÈME FAIT DÉJÀ D'UN JOB PENDING SANS EXTENSION — vérifié :
--   · email-tunnel porte un CAS 1 dédié à `extension_last_seen_at IS NULL`,
--     écrit le 01/08, soit trois jours AVANT la garde. Il a tourné 19 fois sur
--     12 comptes entre le 02/08 et le 04/08 08:00, puis plus JAMAIS : la garde
--     l'a rendu inatteignable. Le rétablir le remet en service.
--   · get-pending-jobs ne filtre les jobs ni sur l'âge ni sur l'extension : un
--     job de cinq jours repart au premier poll qui suit l'installation.
--   · handler-watch et le bandeau ne présument rien d'une extension présente.
--   Rien à construire : la machinerie existait, elle était juste hors d'atteinte.
--
-- ⚠️ DEUX GARDES TOMBENT, PAS UNE. En relevant le bloc j'ai trouvé une SECONDE
-- garde, 'extension_stale' : refus si l'extension n'a pas été vue depuis 7
-- jours. Elle produit EXACTEMENT le défaut que Nico interdit — l'article créé
-- côté app, le job refusé côté serveur, « le pire des deux mondes » — pour
-- quelqu'un qui a simplement laissé son ordinateur éteint huit jours.
-- Portée mesurée sur 42 jours : 1 seul compte, 4 générations. Marginale, mais
-- de même nature. Elle est donc retirée ici aussi.
-- ⛔ Si Nico veut la CONSERVER, il suffit de supprimer le second bloc de cette
--    migration avant de l'appliquer : les deux sont indépendants.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS :
--   · elle ne touche à aucune donnée, ne répare aucun compte, ne recrée rien ;
--   · elle ne crée aucune table, donc aucun GRANT n'est requis ;
--   · elle ne touche pas au quota (chantier à part, Nico tranche) ;
--   · elle laisse en place le SELECT qui alimente v_ext_seen et v_lang : ces
--     variables servent ailleurs dans la fonction, on ne retire que les refus.
--
-- MÉTHODE. On ne réécrit PAS les 12 710 caractères de la fonction à la main :
-- une transcription des messages localisés (avec leurs quotes échappées) serait
-- l'endroit rêvé pour une faute silencieuse. On découpe la définition RÉELLE
-- par ancres courtes, avec assertion d'unicité sur chacune, et on refuse de
-- s'appliquer si quoi que ce soit ne correspond pas.

BEGIN;

DO $mig$
DECLARE
  v_def    text;
  v_debut  int;
  v_fin    int;
  v_retire int := 0;
  k_req    constant text := 'IF v_ext_seen IS NULL AND NOT v_ebay_api_seul THEN';
  k_stale  constant text := 'IF v_ext_seen < now() - interval ''7 days'' AND NOT v_ebay_api_seul THEN';
  k_end    constant text := 'END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'spend_coins_and_publish';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'spend_coins_and_publish introuvable — migration refusée';
  END IF;

  -- ── 1. Refus 'extension_required' ─────────────────────────────────────────
  IF position(k_req in v_def) > 0 THEN
    IF (length(v_def) - length(replace(v_def, k_req, ''))) / length(k_req) <> 1 THEN
      RAISE EXCEPTION 'ancre extension_required non unique — migration refusée';
    END IF;
    v_debut := position(k_req in v_def);
    v_fin   := position(k_end in substring(v_def from v_debut)) + v_debut - 1 + length(k_end);
    v_def   := substring(v_def for v_debut - 1) || substring(v_def from v_fin);
    v_retire := v_retire + 1;
    RAISE NOTICE 'refus extension_required retire';
  ELSE
    RAISE NOTICE 'refus extension_required deja absent';
  END IF;

  -- ── 2. Refus 'extension_stale' (7 jours) ──────────────────────────────────
  --    ⛔ Supprimer CE bloc avant d'appliquer si l'on veut garder cette garde.
  IF position(k_stale in v_def) > 0 THEN
    IF (length(v_def) - length(replace(v_def, k_stale, ''))) / length(k_stale) <> 1 THEN
      RAISE EXCEPTION 'ancre extension_stale non unique — migration refusée';
    END IF;
    v_debut := position(k_stale in v_def);
    v_fin   := position(k_end in substring(v_def from v_debut)) + v_debut - 1 + length(k_end);
    v_def   := substring(v_def for v_debut - 1) || substring(v_def from v_fin);
    v_retire := v_retire + 1;
    RAISE NOTICE 'refus extension_stale retire';
  ELSE
    RAISE NOTICE 'refus extension_stale deja absent';
  END IF;

  -- Idempotente : rien à retirer = rien à exécuter.
  IF v_retire = 0 THEN
    RAISE NOTICE 'spend_coins_and_publish deja a jour, rien fait';
    RETURN;
  END IF;

  -- Filet : aucune mention ne doit subsister dans le corps reconstruit.
  IF position('extension_required' in v_def) > 0 OR position('extension_stale' in v_def) > 0 THEN
    RAISE EXCEPTION 'une mention de refus subsiste apres decoupe — migration refusée';
  END IF;

  EXECUTE v_def;
END $mig$;

COMMIT;

-- ── CONTRÔLE APRÈS APPLICATION (à lire, pas à déduire) ──────────────────────
-- SELECT position('extension_required' in pg_get_functiondef(p.oid)) AS reste_required,
--        position('extension_stale'    in pg_get_functiondef(p.oid)) AS reste_stale,
--        length(pg_get_functiondef(p.oid))                           AS taille
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='spend_coins_and_publish';
-- Attendu : 0, 0, et une taille inférieure à 12 710.
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
-- La définition d'origine est celle de la migration qui l'a posée en dernier.
-- ⚠️ AVANT d'appliquer, garder une copie : SELECT pg_get_functiondef(...) et la
--    coller dans un fichier. Ce découpage n'est pas réversible tout seul.
