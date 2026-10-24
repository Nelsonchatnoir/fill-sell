-- Essai à blanc de 20261024235000_bordereau_automatique_des_la_vente (24/10 soir) : ROLLBACK, rien n'est gardé.
--   npx supabase db query --linked -f scripts/essais/20261024235000_essai.sql
-- Commandes FICTIVES du compte de Nico, créées et effacées dans la transaction.
begin;
set local statement_timeout = '60s';
create temp table _r (essai text, ok boolean, detail text);

INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_auto', 1)
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.coin_config (key, value) VALUES ('bordereaux_auto_depuis', floor(extract(epoch FROM now()))::integer)
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bordereau_auto_pour_commande(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_depuis timestamptz;
  v_action text;
  v_format text;
  v_choix jsonb;
  v_jour int;
BEGIN
  SELECT * INTO c FROM plateforme_commandes WHERE id = p_id;
  IF c.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  IF coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_ouverts'), 0) <> 1 THEN RETURN 'ferme'; END IF;
  v_depuis := to_timestamp(coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_auto_depuis'), 0));
  -- Seulement les ventes vues APRÈS l'ouverture, et récentes : jamais l'arriéré d'un compte.
  IF c.cree_le < v_depuis OR c.cree_le < now() - interval '7 days' THEN RETURN 'avant_ouverture'; END IF;
  -- Étiquette payée par l'acheteur seulement : jamais eBay (payante), ni Depop (pas de bordereau en France).
  IF c.platform NOT IN ('vinted', 'leboncoin', 'beebs') THEN RETURN 'plateforme'; END IF;
  IF NOT public.messagerie_beta(c.user_id) THEN RETURN 'hors_beta'; END IF;

  IF (c.platform = 'vinted' AND c.etat = 'a_expedier' AND c.bordereau = 'a_obtenir')
     OR (c.platform IN ('leboncoin', 'beebs') AND c.etat = 'a_confirmer' AND c.bordereau = 'a_generer') THEN
    v_action := 'generer';
  ELSIF c.etat = 'a_expedier' AND c.bordereau = 'pret' THEN
    v_action := 'recuperer';
  ELSE
    RETURN 'rien_a_faire';
  END IF;
  IF v_action = 'generer'
     AND coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_generation_ouverte'), 0) <> 1 THEN
    RETURN 'generation_fermee';
  END IF;
  -- Vinted ne laisse pas FillSell le faire (enlèvement à domicile daté, téléphone exigé) : le bouton manuel le dit.
  IF v_action = 'generer' AND c.platform = 'vinted' AND (c.options_bordereau ->> 'generable') = 'false' THEN
    RETURN 'non_generable';
  END IF;

  -- Une seule fois par commande : jamais après une demande (du vendeur ou automatique), ni avec une copie vivante.
  IF EXISTS (SELECT 1 FROM bordereaux_demandes d WHERE d.commande_id = c.id) THEN RETURN 'deja_demandee'; END IF;
  IF EXISTS (SELECT 1 FROM bordereaux_copies b WHERE b.commande_id = c.id AND b.efface_le IS NULL AND b.expire_le > now()) THEN
    RETURN 'copie_presente';
  END IF;
  SELECT count(*) INTO v_jour FROM bordereaux_demandes d
   WHERE d.user_id = c.user_id
     AND (d.cree_le AT TIME ZONE 'Europe/Paris')::date = (now() AT TIME ZONE 'Europe/Paris')::date;
  IF v_jour >= 20 THEN RETURN 'plafond_jour'; END IF;

  v_format := CASE WHEN (SELECT p.platform_settings #>> '{bordereaux,format}' FROM profiles p WHERE p.id = c.user_id) = 'code'
                   THEN 'code' ELSE 'pdf' END;
  v_choix := jsonb_build_object('auto', true, 'format', v_format)
    || CASE WHEN v_action = 'generer' AND c.platform = 'vinted'
            THEN jsonb_build_object('type_etiquette', CASE WHEN v_format = 'code' THEN 3 ELSE 1 END) ELSE '{}'::jsonb END;

  -- Garde de double vente : deux commandes en cours pour la même fiche → rien d'automatique, le vendeur choisit.
  IF v_action = 'generer' AND c.inventaire_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM plateforme_commandes o
        WHERE o.user_id = c.user_id AND o.inventaire_id = c.inventaire_id AND o.id <> c.id
          AND o.etat IN ('a_confirmer', 'a_expedier')) THEN
    INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, statut, motif, choix, fini_le)
    VALUES (c.user_id, c.id, c.platform, 'generer', 'echec', 'deux_commandes_meme_fiche', v_choix, now());
    RETURN 'deux_commandes_meme_fiche';
  END IF;

  BEGIN
    IF v_action = 'generer' THEN
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, action, choix, engagement, confirme_le)
      VALUES (c.user_id, c.id, c.platform, 'generer', v_choix,
              'Bordereau automatique dès la vente (décision de Nico du 24/10/2026 ; format du compte : ' || v_format || ')',
              now());
    ELSE
      INSERT INTO bordereaux_demandes (user_id, commande_id, platform, choix)
      VALUES (c.user_id, c.id, c.platform, v_choix);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'deja_demandee';
  END;
  RETURN 'demandee';
END;
$function$;

REVOKE ALL ON FUNCTION public.bordereau_auto_pour_commande(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_commandes_bordereau_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Vente annulée : la copie gardée est close tout de suite (l'app ne la montre plus ; la purge efface le fichier).
  IF NEW.etat = 'annulee' AND (TG_OP = 'INSERT' OR OLD.etat IS DISTINCT FROM 'annulee') THEN
    UPDATE bordereaux_copies SET expire_le = now()
     WHERE commande_id = NEW.id AND efface_le IS NULL AND expire_le > now();
    RETURN NULL;
  END IF;
  -- Jamais une écriture de commande refusée pour un bordereau : une erreur ici est tracée, jamais levée.
  BEGIN
    PERFORM public.bordereau_auto_pour_commande(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (NEW.user_id, 'bordereau_auto_erreur', jsonb_build_object('commande', NEW.id, 'erreur', left(SQLERRM, 200)));
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.plateforme_commandes_bordereau_auto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plateforme_commandes_bordereau_auto ON public.plateforme_commandes;
CREATE TRIGGER plateforme_commandes_bordereau_auto
  AFTER INSERT OR UPDATE OF etat, bordereau, inventaire_id ON public.plateforme_commandes
  FOR EACH ROW EXECUTE FUNCTION public.plateforme_commandes_bordereau_auto();

update coin_config set value = floor(extract(epoch from now() - interval '1 minute'))::integer where key = 'bordereaux_auto_depuis';
-- a) Vinted, étiquette à commander, neuve → « générer », PDF (type 1), automatique.
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, inventaire_id, titre, options_bordereau)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-A', 'a_expedier', 'a_obtenir', 1790864707143000, 'essai a', '{"generable":true}');
insert into _r select 'a) Vinted neuve → générer, PDF, auto', count(*) = 1 and bool_and(d.action = 'generer' and d.statut = 'demandee'
  and d.choix ->> 'auto' = 'true' and (d.choix ->> 'type_etiquette')::int = 1 and d.engagement like 'Bordereau automatique%'),
  string_agg(d.action || ' ' || d.statut || ' ' || d.choix::text, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-A';
-- b) Deuxième commande en cours pour la MÊME fiche → rien d'automatique, close « deux_commandes_meme_fiche ».
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, inventaire_id, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin', 'ESSAI-B', 'a_confirmer', 'a_generer', 1790864707143000, 'essai b');
insert into _r select 'b) double vente : aucune demande vivante, motif dit', count(*) = 1 and bool_and(d.statut = 'echec' and d.motif = 'deux_commandes_meme_fiche'),
  string_agg(d.statut || ' ' || coalesce(d.motif, '-'), ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-B';
-- c) Leboncoin seule → « générer » (confirmer la disponibilité), sans type.
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, inventaire_id, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'leboncoin', 'ESSAI-C', 'a_confirmer', 'a_generer', 1790624552110000, 'essai c');
insert into _r select 'c) Leboncoin → générer, sans type', count(*) = 1 and bool_and(d.action = 'generer' and not (d.choix ? 'type_etiquette')),
  string_agg(d.choix::text, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-C';
-- d) eBay : jamais (étiquette payante).
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'ebay', 'ESSAI-D', 'a_expedier', 'a_obtenir', 'essai d');
insert into _r select 'd) eBay : aucune demande', count(*) = 0, count(*)::text
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-D';
-- e) Vinted, étiquette déjà prête → « récupérer » ; puis vente annulée → la copie est close.
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-E', 'a_expedier', 'pret', 'essai e');
insert into _r select 'e) étiquette prête → récupérer', count(*) = 1 and bool_and(d.action = 'recuperer' and d.choix ->> 'auto' = 'true'),
  string_agg(d.action, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-E';
insert into bordereaux_copies (user_id, commande_id, chemin, taille_octets, expire_le)
select c.user_id, c.id, 'essai/ESSAI-E.pdf', 10, now() + interval '4 days' from plateforme_commandes c where c.commande_ref = 'ESSAI-E';
update plateforme_commandes set etat = 'annulee', bordereau = 'sans_objet' where commande_ref = 'ESSAI-E';
insert into _r select 'e2) vente annulée → copie close tout de suite', bool_and(b.expire_le <= now()), string_agg(b.expire_le::text, ' ; ')
  from bordereaux_copies b join plateforme_commandes c on c.id = b.commande_id where c.commande_ref = 'ESSAI-E';
-- f) L'arriéré : une commande d'avant l'ouverture ne déclenche jamais rien, même si son état change.
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre, cree_le)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-F', 'a_expedier', 'a_obtenir', 'essai f', now() - interval '2 hours');
update plateforme_commandes set bordereau = 'pret' where commande_ref = 'ESSAI-F';
insert into _r select 'f) arriéré : aucune demande', count(*) = 0, count(*)::text
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-F';
-- g) Une seule fois : ESSAI-A change d'état (étiquette prête) → pas de seconde demande.
update plateforme_commandes set bordereau = 'pret' where commande_ref = 'ESSAI-A';
insert into _r select 'g) une seule demande par commande', count(*) = 1, count(*)::text
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-A';
-- h) Le format « code » du compte → QR (type 3).
select platform_settings_fusionner(array['bordereaux'], '{"format":"code"}'::jsonb, '{}'::text[], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid);
insert into plateforme_commandes (user_id, platform, commande_ref, etat, bordereau, titre)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'vinted', 'ESSAI-H', 'a_expedier', 'a_obtenir', 'essai h');
insert into _r select 'h) format « code » → type 3', count(*) = 1 and bool_and((d.choix ->> 'type_etiquette')::int = 3 and d.choix ->> 'format' = 'code'),
  string_agg(d.choix::text, ' ; ')
  from bordereaux_demandes d join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = 'ESSAI-H';
-- i) La vraie commande du short (déjà demandée à la main) : rien de plus.
update plateforme_commandes set bordereau = bordereau where commande_ref = '23532974658';
insert into _r select 'i) commande du short : aucune demande de plus', count(*) = 1, count(*)::text from bordereaux_demandes d
  join plateforme_commandes c on c.id = d.commande_id where c.commande_ref = '23532974658';
insert into _r select 'j) aucune erreur tracée', count(*) = 0, count(*)::text from usage_logs where feature = 'bordereau_auto_erreur' and created_at = now();
select essai, ok, left(detail, 300) detail from _r order by essai;
rollback;
