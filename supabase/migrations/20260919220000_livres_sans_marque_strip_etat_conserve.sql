-- ═══════════════════════════════════════════════════════════════════════════
-- LIVRES « Sans marque » — ÉTAT CONSERVÉ PAR DÉCISION, PAS PAR VALIDATION
-- (2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ LIS CE BANDEAU AVANT DE T'APPUYER SUR CE TRIGGER. Ce fichier ne dit PAS
-- que ce trigger est justifié aujourd'hui. Il dit qu'on a décidé de ne pas y
-- toucher tant que la question n'est pas tranchée sur pièces, et que le dépôt
-- doit refléter la prod en attendant. C'est une photographie, pas un aval.
--
-- ── CE QUE LE TRIGGER FAIT ─────────────────────────────────────────────────
-- À chaque écriture d'une capture d'annonce Vinted : si la catégorie commence
-- par « Livres et médias » ET que la marque vaut exactement « Sans marque »,
-- il EFFACE la clé `marque` de la capture. Égalités strictes des deux côtés,
-- aucune autre clé touchée, aucune autre table touchée.
--
-- ── POURQUOI IL EXISTE (14/08/2026) ────────────────────────────────────────
-- Le formulaire Vinted des livres n'a AUCUN champ Marque. L'extension 0.6.2
-- tentait quand même d'y poser « Sans marque » → « Élément introuvable » →
-- job en needs_user, Pépite consommée pour rien. Cas vécu : Lau Brzl, cinq
-- captures corrigées à la main. Le correctif extension existait (paquet
-- 0.6.5) mais était bloqué en review CWS : ce trigger était le pont pour
-- tenir jusque-là.
--
-- ── POURQUOI ON NE L'ENLÈVE PAS, ET POURQUOI CE N'EST PAS UN AVAL ──────────
-- Trois faits relevés le 19/09, à garder sous les yeux :
--   1. LA CAUSE D'ORIGINE EST ÉTEINTE. Plus aucun compte en 0.6.2 : sur
--      14 jours, le build le plus ancien encore vu date du 03/09. Le pont
--      n'a plus de pont à faire.
--   2. IL CONTREDIT FRONTALEMENT L'EXTENSION. Depuis le 12/08 — deux jours
--      AVANT ce trigger — vinted.js écrit délibérément `libelles.marque =
--      "Sans marque"` quand la marque est absente, et son commentaire dit
--      pourquoi : sans cette clé, fillListingForm SAUTE le champ, le
--      formulaire part avec #brand vide, et Vinted rend un 400 APRÈS que
--      l'annonce d'origine a été supprimée — l'article est perdu. Une partie
--      du code écrit cette clé exprès, ce trigger l'efface.
--   3. ON NE PEUT PAS MESURER SON EFFET. Il efface sa propre trace :
--      impossible de distinguer « la clé a été retirée par le trigger » de
--      « l'extension ne l'a jamais écrite ». Sur 4 715 captures, 333 sont des
--      livres et il ne reste une clé `marque` que sur 3 d'entre elles — toutes
--      « Disney », donc de vraies marques, jamais touchées. Ce chiffre ne
--      prouve rien dans un sens ni dans l'autre.
--   4. NI SA CRÉATION NI SON RETRAIT N'ONT JAMAIS ÉTÉ APPLIQUÉS.
--      20260814160000 (création) et 20260814160001 (retrait) sont absentes de
--      supabase_migrations.schema_migrations. La fonction et le trigger ont
--      été posés À LA MAIN en prod. Le dépôt racontait donc une histoire
--      (créé puis retiré) que la base n'a jamais vécue.
--
-- ── LE GESTE QUI TRANCHERAIT, ET QUI RESTE À FAIRE ─────────────────────────
-- Republier UN livre en 0.6.46, sur le compte de Nico et pas sur celui d'un
-- utilisateur, trigger désactivé le temps du test :
--     alter table public.vinted_republish_captures
--       disable trigger trg_republish_livres_sans_marque_strip;
--     -- … republication d'un livre, on regarde si le dépôt aboutit …
--     alter table public.vinted_republish_captures
--       enable  trigger trg_republish_livres_sans_marque_strip;
-- Si la 0.6.46 saute proprement le champ Marque absent, le trigger est une
-- dette morte et peut partir. Sinon il protège encore, et c'est vinted.js
-- qu'il faut reprendre. Tant que ce test n'a pas eu lieu, on ne touche à rien.
--
-- ── CE QUE FAIT CE FICHIER, ET RIEN D'AUTRE ────────────────────────────────
-- Il RECRÉE à l'identique ce que la prod porte aujourd'hui, pour qu'une base
-- reconstruite depuis le dépôt reproduise la prod. Corps copié depuis
-- pg_get_functiondef() et pg_get_triggerdef() du 19/09, non réécrit.
-- ⛔ 20260814160000 et 20260814160001 ne sont PAS modifiées : on ajoute après,
-- on ne réécrit pas l'histoire. Ce fichier passe après elles et remet donc
-- l'objet que le retrait avait enlevé sur une base vierge.
-- No-op sur la prod : CREATE OR REPLACE sur une fonction identique, et le
-- trigger n'est recréé que s'il manque.

CREATE OR REPLACE FUNCTION public.republish_livres_sans_marque_strip()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Garde-fou : libelles doit être un objet et categoryPath un TABLEAU jsonb ;
  -- sinon on ne touche à rien (pas de défaut, pas de repli).
  if new.libelles is null
     or jsonb_typeof(new.libelles) is distinct from 'object'
     or jsonb_typeof(new.libelles->'categoryPath') is distinct from 'array' then
    return new;
  end if;

  -- Égalités STRICTES des deux côtés. Clé 'marque' absente (captures déjà
  -- corrigées à la main) → ->> rend NULL → condition fausse → no-op.
  if (new.libelles->>'marque') = 'Sans marque'
     and (new.libelles->'categoryPath'->>0) = 'Livres et médias' then
    new.libelles := new.libelles - 'marque';
  end if;

  return new;
end;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_republish_livres_sans_marque_strip'
       AND tgrelid = 'public.vinted_republish_captures'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_republish_livres_sans_marque_strip
      BEFORE INSERT OR UPDATE ON public.vinted_republish_captures
      FOR EACH ROW EXECUTE FUNCTION public.republish_livres_sans_marque_strip();
  END IF;
END $$;
