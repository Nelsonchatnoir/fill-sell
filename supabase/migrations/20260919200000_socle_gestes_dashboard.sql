-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE — CE QUE LE REJEU COMPLET A RÉVÉLÉ EN DERNIER (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : du dashboard, encore. Une fois les 203 fichiers rejoués sans
-- une seule erreur sur une base vierge, la comparaison objet par objet avec la
-- prod a fait sortir CINQ derniers manques. Aucun n'a jamais eu de ligne dans
-- supabase/migrations/, et aucun n'a de trace dans schema_migrations : date de
-- pose INCONNUE pour les cinq.
--
-- ⚠️ POURQUOI MON PREMIER BALAYAGE DES FANTÔMES LES AVAIT RATÉS. Il cherchait
-- le NOM de l'objet dans le corpus. Or « select own », « insert own »,
-- « update own », « delete own » sont des noms de policy si génériques qu'ils
-- apparaissent ailleurs (« select own profile » sur profiles) : le test les
-- déclarait présents. Seul le rejeu réel les a démasqués. Leçon : une
-- recherche par nom ne remplace pas un rejeu.
--
-- Définitions RELEVÉES sur la prod du 19/09 (pg_constraint, pg_policies,
-- pg_get_triggerdef, pg_get_functiondef, cron.job), recopiées telles quelles.
-- Toutes sous garde d'existence : rejouable sur la prod sans rien changer.

-- ── 1/5 · Les deux clés étrangères de `ventes` ──────────────────────────────
-- La table était créée au tableur avec ses FK ; le socle du 19/09 n'avait
-- rapatrié que la clé primaire.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ventes_user_id_fkey'
                   AND conrelid='public.ventes'::regclass) THEN
    ALTER TABLE public.ventes
      ADD CONSTRAINT ventes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ventes_inventaire_id_fkey'
                   AND conrelid='public.ventes'::regclass) THEN
    ALTER TABLE public.ventes
      ADD CONSTRAINT ventes_inventaire_id_fkey FOREIGN KEY (inventaire_id) REFERENCES public.inventaire(id);
  END IF;
END $$;

-- ── 2/5 · Les 7 policies de base d'`inventaire` et `ventes` ─────────────────
-- Le coeur du produit : sans elles, personne ne lit ni n'écrit son propre
-- stock. Elles n'étaient nulle part. Rôle `public` et non `authenticated` —
-- c'est ce que porte la prod, recopié sans correction (cf. rapport).
-- `update own` sur ventes EXISTE déjà au dépôt (20260814130000) : pas touchée.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('inventaire','select own','SELECT','USING (auth.uid() = user_id)'),
      ('inventaire','insert own','INSERT','WITH CHECK (auth.uid() = user_id)'),
      ('inventaire','update own','UPDATE','USING (auth.uid() = user_id)'),
      ('inventaire','delete own','DELETE','USING (auth.uid() = user_id)'),
      ('ventes','select own','SELECT','USING (auth.uid() = user_id)'),
      ('ventes','insert own','INSERT','WITH CHECK (auth.uid() = user_id)'),
      ('ventes','delete own','DELETE','USING (auth.uid() = user_id)')
    ) v(tbl, pol, cmd, clause)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename=r.tbl AND policyname=r.pol) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s %s', r.pol, r.tbl, r.cmd, r.clause);
    END IF;
  END LOOP;
END $$;

-- ── 3/5 · Le trigger du plafond de stock ────────────────────────────────────
-- `check_inventory_limit()` est au dépôt depuis toujours ; le trigger qui
-- l'appelle, jamais. Trois migrations le CITENT en commentaire (« Le trigger
-- enforce_inventory_limit (BEFORE INSERT)… »), aucune ne le crée. Sans lui, le
-- plafond du palier gratuit ne s'applique plus du tout après un reset.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_inventory_limit'
                   AND tgrelid='public.inventaire'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER enforce_inventory_limit
      BEFORE INSERT ON public.inventaire
      FOR EACH ROW EXECUTE FUNCTION public.check_inventory_limit();
  END IF;
END $$;

-- ── 4/5 · set_profile_username(text) ────────────────────────────────────────
-- Relevée par pg_get_functiondef. Le dépôt ne la mentionne que dans un
-- commentaire d'une autre migration (« comme set_profile_username »).
CREATE OR REPLACE FUNCTION public.set_profile_username(p_username text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF length(trim(p_username)) > 30 THEN
    RAISE EXCEPTION 'username exceeds 30 characters';
  END IF;
  UPDATE profiles SET username = trim(p_username) WHERE id = auth.uid();
END;
$function$;

-- ── 5/5 · Le cron publish-sans-lien-echec-daily ─────────────────────────────
-- La migration 20260810200000 crée bien fail_publish_without_listing_url(),
-- mais le cron qui l'appelle a été planifié à la main.
-- 🚨 Garde d'existence obligatoire : un cron.schedule rejoué PLANIFIE EN
-- DOUBLE (cf. CLAUDE.md, l'accident handler-watch-3min).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-sans-lien-echec-daily') THEN
    PERFORM cron.schedule(
      'publish-sans-lien-echec-daily',
      '30 3 * * *',
      $cmd$SELECT public.fail_publish_without_listing_url('2026-08-10T17:40:00Z'::timestamptz)$cmd$
    );
  END IF;
END $$;
