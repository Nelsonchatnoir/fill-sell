-- ── GARDE DE CORROBORATION : un relevé n'est pas une règle (2026-09-19) ──────
--
-- TROISIÈME OCCURRENCE. 16/09 : un relevé sur la page PRO de MeMiniandMove
-- rend Couleur et Taille obligatoires pour tout le parc Leboncoin. 18/09 : un
-- relevé sur un formulaire d'article NEUF ajoute `new_item_type` sur 5
-- feuilles et bloque 5 comptes, dont 2 qui n'avaient encore rien publié.
-- Même mécanique les deux fois, et elle est structurelle :
-- `platform_category_aspects` est indexé par (plateforme, catégorie, champ) et
-- par RIEN D'AUTRE. Il n'a aucune notion de QUI a observé, ni DANS QUEL
-- CONTEXTE. `persistDiscoveredAspects` envoie `required` à chaque upsert et
-- PostgREST écrase en merge-duplicates : une observation faite sur un
-- formulaire, un compte, un état d'article devient la règle pour tout le monde.
-- La colonne `seen_count` existe depuis le premier jour et n'a jamais été
-- incrémentée : 1 648 lignes sur 1 656 sont à 1. Le compteur était là, la
-- corroboration n'a jamais été branchée dessus.
--
-- CE QUI DISCRIMINE, ET QUI NE DEMANDE AUCUN HISTORIQUE PAR COMPTE.
-- Les deux incidents ont la même signature : un champ obligatoire qui APPARAÎT
-- sur une catégorie DÉJÀ CONNUE DEPUIS DES SEMAINES. Mode > Vêtements est au
-- catalogue depuis le 17/07 ; `new_item_type` y surgit le 18/09 à 08h22, 63
-- jours plus tard. Si le champ était obligatoire pour tout le monde, les
-- dizaines de relevés précédents de cette même feuille l'auraient vu.
-- À l'inverse, une catégorie découverte aujourd'hui livre tous ses champs d'un
-- coup : il n'y a rien à corroborer, et il ne faut surtout pas la freiner.
-- Mesure à l'appui, sur 60 jours : 67 catégories Beebs sur 110 et 72 Vinted
-- sur 104 ne sont traversées que par UN SEUL compte. Une règle qui exigerait
-- deux témoins partout éteindrait l'apprentissage sur plus de la moitié du
-- catalogue. C'est pour ça que la garde ne se déclenche QUE sur les catégories
-- mûres.
--
-- LA RÈGLE, EN UNE PHRASE. Sur une catégorie connue depuis plus de 24 h, un
-- `required = true` venu d'un relevé DOM qui n'y avait jamais été vu — ou qui
-- rallume une ligne éteinte — est mis EN QUARANTAINE : l'observation est
-- enregistrée, la ligne est écrite `required = false`, et elle n'est promue
-- que lorsque DEUX comptes distincts au moins l'ont vue requise ET qu'ils
-- représentent au moins la moitié des comptes ayant relevé cette catégorie
-- depuis que le champ y est apparu.
--
-- POURQUOI CETTE FORME TIENT LES TROIS CAS DEMANDÉS :
--  · conditionnel à l'ÉTAT de l'article (new_item_type, notre cas) — seuls les
--    vendeurs de neuf le voient, ils sont minoritaires sur la feuille : la
--    part reste sous la moitié, la ligne reste éteinte ;
--  · conditionnel au TYPE DE COMPTE (pro vs particulier, le motif du 16/09) —
--    même raisonnement : Leboncoin compte 5,67 comptes distincts par feuille
--    en moyenne, une poignée de pros n'atteint pas la moitié ;
--  · vu UNE SEULE FOIS sur UN SEUL compte — bloqué par le seuil de deux
--    témoins, qui est la condition la plus simple des deux.
--
-- ET POURQUOI ELLE NE CASSE PAS L'APPRENTISSAGE :
--  · catégorie neuve (< 24 h) : aucune quarantaine, tout s'apprend comme avant ;
--  · champ déjà connu comme requis : inchangé, jamais rétrogradé par la garde
--    (on ne « nettoie » pas le catalogue existant) ;
--  · vrai changement de formulaire côté plateforme : après le changement tous
--    les relevés le voient, la part monte vers 1, la ligne est promue toute
--    seule au passage suivant ;
--  · refus serveur (`server_400`) et relevé humain (`manual`) : JAMAIS mis en
--    quarantaine. Un 400 n'est pas un astérisque lu sur une page, c'est la
--    plateforme qui refuse — même précédence que ASPECT_SOURCE_POIDS côté
--    extension. C'est aussi la porte de sortie si la garde se trompe : le
--    premier vrai refus promeut le champ.
--  · pendant la quarantaine RIEN N'EST PERDU : le libellé, le type et les
--    options relevées sont écrits normalement. Seul le pouvoir de BLOQUER au
--    step Publier est suspendu — le stepper ne charge que `required = true`.
--
-- ⛔ CE QUE CETTE MIGRATION NE FAIT PAS. Elle ne modifie aucune ligne
-- existante, ne touche pas chrome-extension/, et ne rétrograde jamais un
-- `required = true` déjà en place. Elle n'agit que sur les écritures À VENIR.
--
-- ── LES TROIS GARDES QUI ÉTAIENT DÉJÀ LÀ, ET CE QU'ELLES NE COUVRAIENT PAS ──
-- Relevé sur pièces avant d'écrire celle-ci. Les triggers s'exécutent par
-- ordre alphabétique : `aspects_garde_corroboration_trg` passe donc EN
-- PREMIER, les trois autres ensuite.
--   · garde_aspects_lbc_requis (posée le 16/09 20h36, en réaction à
--     l'incident PRO) — Leboncoin seulement : (a) liste en dur de 3 champs
--     jamais requis, (b) AUCUNE montée false → true sur une ligne existante.
--   · garde_aspects_question_posable (16/09 21h06) — toutes plateformes :
--     éteint tout field_key qui est du CONTENU d'annonce (photo·s, image·s,
--     picture·s, media, title, titre, description, price, prix), et tout
--     champ dont le libellé est resté la clé technique brute.
--   · platform_category_aspects_garde_source (20260811130000) — précédence
--     des sources, sur UPDATE.
-- ⚠️ Ces deux gardes du 16/09 n'ont AUCUN fichier dans supabase/migrations/ :
-- elles n'existent qu'en prod. Le dépôt ne les décrit nulle part.
--
-- LE TROU QUE CELLE-CI FERME, ET LUI SEUL. La garde du 16/09 (b) bloque la
-- montée false → true d'une ligne QUI EXISTE. Le 18/09, `new_item_type` est
-- arrivé en INSERT — champ jamais vu, aucune ligne précédente, donc aucun
-- OLD à comparer — et il n'est dans aucune liste en dur. Il est passé par le
-- seul chemin qui restait ouvert. C'est celui-là qu'on referme, et en
-- l'élargissant aux 4 plateformes : la garde du 16/09 ne vaut que pour
-- Leboncoin, or rien ne dit que le prochain incident y sera.
--
-- ⚠️ CONSÉQUENCE OPÉRATIONNELLE À CONNAÎTRE. Sur Leboncoin, la garde du 16/09
-- refuse TOUT passage false → true, y compris une réparation administrative
-- en service_role (constaté en réparant `toy_type` : l'UPDATE est passé sans
-- erreur et n'a rien changé). Pour rallumer une ligne LBC à la main, il faut
-- l'endormir le temps de l'écriture :
--     alter table public.platform_category_aspects disable trigger garde_aspects_lbc_requis;
--     update ... set required = true where ...;
--     alter table public.platform_category_aspects enable  trigger garde_aspects_lbc_requis;

-- ── 1. Le registre des observations ─────────────────────────────────────────
-- Ce que la table principale n'a jamais su : QUI a vu le champ, et requis ou
-- non. Une ligne par (plateforme, catégorie, champ, compte).
CREATE TABLE IF NOT EXISTS public.platform_category_aspect_observations (
  platform      text        NOT NULL,
  category_key  text        NOT NULL,
  field_key     text        NOT NULL,
  -- auth.uid() du compte dont l'extension a fait le relevé, 'service' pour une
  -- écriture administrative (service_role / éditeur SQL).
  observer      text        NOT NULL,
  required      boolean     NOT NULL,
  source        text        NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  seen_count    integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (platform, category_key, field_key, observer)
);

COMMENT ON TABLE public.platform_category_aspect_observations IS
  'Qui a observé quel champ requis, où. Alimentée par le trigger de garde sur platform_category_aspects — jamais écrite directement par un client. Sert à corroborer un required=true avant de le rendre opposable à tout le parc.';

CREATE INDEX IF NOT EXISTS pcao_categorie_idx
  ON public.platform_category_aspect_observations (platform, category_key);

-- Lecture ouverte (c'est de la structure de formulaire public, aucune donnée
-- d'article) ; AUCUNE policy d'écriture : la table n'est alimentée que par le
-- trigger, qui est SECURITY DEFINER.
ALTER TABLE public.platform_category_aspect_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcao readable by authenticated"
  ON public.platform_category_aspect_observations;
CREATE POLICY "pcao readable by authenticated"
  ON public.platform_category_aspect_observations
  FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.platform_category_aspect_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.platform_category_aspect_observations TO service_role;

-- ── 2. La garde ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aspects_garde_corroboration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_observer      text;
  v_categorie_nee timestamptz;
  v_deja          boolean;
  v_temoins       integer;
  v_releveurs     integer;
  v_champ_vu      timestamptz;
BEGIN
  v_observer := coalesce(auth.uid()::text, 'service');

  -- Le registre enregistre TOUT, y compris ce qui n'est pas mis en quarantaine
  -- et y compris les required=false : c'est la trace qui permettra de promouvoir
  -- plus tard, et de savoir après coup qui avait vu quoi.
  --
  -- ⚠️ UNIQUEMENT SUR LA PASSE D'INSERT, et ce n'est pas un détail. Un upsert
  -- PostgREST (`on_conflict=...`, `resolution=merge-duplicates`, ce que fait
  -- persistDiscoveredAspects) déclenche DEUX fois ce trigger sur une ligne
  -- déjà présente : BEFORE INSERT d'abord, puis BEFORE UPDATE avec la valeur
  -- que la première passe a produite. En enregistrant aux deux passes, une
  -- ligne mise en quarantaine à la première (required forcé à false) venait
  -- réécrire sa PROPRE observation en `required = false` à la seconde — le
  -- témoin s'effaçait lui-même et aucun champ n'aurait jamais pu être promu.
  -- La passe d'INSERT porte la valeur RÉCLAMÉE par le client : c'est la seule
  -- qui dit ce que le relevé a vraiment vu.
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_category_aspect_observations
           (platform, category_key, field_key, observer, required, source)
    VALUES (NEW.platform, NEW.category_key, NEW.field_key, v_observer,
            NEW.required, NEW.source)
    ON CONFLICT (platform, category_key, field_key, observer) DO UPDATE
       SET required     = EXCLUDED.required,
           source       = EXCLUDED.source,
           last_seen_at = now(),
           seen_count   = platform_category_aspect_observations.seen_count + 1;
  END IF;

  -- ÉTAT ACTUEL DE LA LIGNE — et il faut aller le CHERCHER, on ne peut pas se
  -- fier à TG_OP. Erreur commise et payée en prod le 19/09 à 14h56 : un upsert
  -- PostgREST sur une ligne EXISTANTE passe d'abord par BEFORE INSERT, où
  -- TG_OP vaut 'INSERT' et où OLD n'existe pas. Une première version testait
  -- `TG_OP = 'UPDATE' AND OLD.required IS TRUE` pour ne jamais rétrograder :
  -- cette condition n'était donc JAMAIS vraie sur la passe d'INSERT, et le
  -- premier relevé réel venu — `toy_type` (« Produit », Loisirs > Jeux &
  -- Jouets, requis depuis le 17/07) — a été mis en quarantaine alors qu'il
  -- était déjà légitimement requis. La ligne a été remise à true et la garde
  -- interroge désormais la table.
  IF TG_OP = 'UPDATE' THEN
    v_deja := OLD.required;
  ELSE
    SELECT a.required INTO v_deja
      FROM public.platform_category_aspects a
     WHERE a.platform = NEW.platform
       AND a.category_key = NEW.category_key
       AND a.field_key = NEW.field_key;
  END IF;

  -- Hors périmètre de la garde, dans l'ordre où ça se décide :
  --   · on ne freine que ce qui prétend devenir obligatoire ;
  --   · un refus serveur ou un relevé humain n'est pas un astérisque lu sur
  --     une page — il passe ;
  --   · une écriture administrative est délibérée, elle passe ;
  --   · un champ DÉJÀ requis n'est jamais rétrogradé par la garde.
  IF NEW.required IS NOT TRUE
     OR NEW.source <> 'dom'
     OR v_observer = 'service'
     OR v_deja IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Âge de la catégorie. Une catégorie découverte à l'instant livre tous ses
  -- champs d'un coup : rien à corroborer, on n'entrave pas la découverte.
  SELECT min(first_seen_at) INTO v_categorie_nee
    FROM public.platform_category_aspects
   WHERE platform = NEW.platform AND category_key = NEW.category_key;

  IF v_categorie_nee IS NULL OR v_categorie_nee > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;

  -- Arrivé ici : catégorie mûre, relevé DOM, `required = true` réclamé sur une
  -- ligne qui n'était PAS requise (champ jamais vu, ou ligne éteinte qu'on
  -- rallume) — c'est exactement la signature des 16 et 18/09.
  --
  -- Corroboration. Deux témoins distincts au minimum, ET au moins la moitié
  -- des comptes ayant relevé cette catégorie depuis que le champ y est apparu
  -- (borner dans le temps évite de compter contre le champ tous les relevés
  -- antérieurs à son existence).
  SELECT min(first_seen_at) INTO v_champ_vu
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key;

  SELECT count(DISTINCT observer) INTO v_temoins
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND field_key = NEW.field_key AND required IS TRUE;

  SELECT count(DISTINCT observer) INTO v_releveurs
    FROM public.platform_category_aspect_observations
   WHERE platform = NEW.platform AND category_key = NEW.category_key
     AND last_seen_at >= coalesce(v_champ_vu, now());

  IF v_temoins >= 2 AND v_temoins * 2 >= greatest(v_releveurs, 1) THEN
    RETURN NEW;                       -- corroboré : la ligne devient opposable
  END IF;

  -- Quarantaine. La ligne est écrite — libellé, type, options relevées, tout
  -- est conservé — mais elle ne bloque personne au step Publier tant qu'un
  -- second compte ne l'a pas vue requise.
  RAISE LOG 'aspects: quarantaine % / % / % — % témoin(s) requis sur % releveur(s), observé par %',
    NEW.platform, NEW.category_key, NEW.field_key, v_temoins, v_releveurs, v_observer;
  NEW.required := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aspects_garde_corroboration_trg
  ON public.platform_category_aspects;
CREATE TRIGGER aspects_garde_corroboration_trg
  BEFORE INSERT OR UPDATE ON public.platform_category_aspects
  FOR EACH ROW EXECUTE FUNCTION public.aspects_garde_corroboration();
