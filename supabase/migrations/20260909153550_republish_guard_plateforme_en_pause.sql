-- ═══════════════════════════════════════════════════════════════════════════
-- republish_maintenance_guard : une plateforme EN PAUSE (platform_health)
-- retient aussi la republication — 2026-09-09, GO Nico (maintenance générique).
-- ═══════════════════════════════════════════════════════════════════════════
-- Le trigger BEFORE INSERT sur cross_post_jobs (action = 'republish') connaissait
-- deux verrous : l'interrupteur coin_config.republish_maintenance (= 1 →
-- coupure totale) et la version minimale de l'extension (version_cle, 0.6.2).
-- Il en gagne un troisième, testé EN PREMIER : platform_health.paused = true
-- sur la plateforme du job (à défaut 'vinted', seule plateforme republiée).
-- Même famille d'exception REPUBLISH_MAINTENANCE : l'app la reconnaît déjà
-- (bandeau + boutons grisés, aucune Pépite débitée), rien à ajouter côté client.
--
-- FAIL-SAFE (non négociable) : si platform_health est illisible (table ou
-- colonne absente, droit manquant), le bloc se tait et la garde continue
-- exactement comme avant — seule NOTRE exception est relancée. Jamais une
-- pause par accident.
--
-- Les deux textes RAISE existants sont repris À L'IDENTIQUE (vérifié en base
-- le 09/09 après application : texte1_exact = texte2_exact = true).
--
-- ⚠️ Appliquée en prod le 09/09/2026 (apply_migration, puis CREATE OR REPLACE
-- de contrôle pour remettre les deux textes historiques au caractère près).
-- Idempotente : seul le corps de la fonction change, le trigger qui l'appelle
-- n'est pas retouché. Pas de SECURITY DEFINER (comme avant) : appelée depuis
-- spend_coins_and_republish, qui l'est.
CREATE OR REPLACE FUNCTION public.republish_maintenance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare v text; cle int;
begin
  if coalesce(new.action,'') <> 'republish' then return new; end if;

  -- ── PLATEFORME EN PAUSE (2026-09-09, maintenance générique) ──────────────
  -- platform_health.paused = true retient aussi les republications, dans la
  -- même famille REPUBLISH_MAINTENANCE (le filet de l'app s'arme tout seul).
  -- FAIL-SAFE : table illisible → on laisse passer ; seule NOTRE exception
  -- est relancée. Jamais une pause par accident.
  begin
    if exists (select 1 from public.platform_health h where h.platform = coalesce(new.platform, 'vinted') and h.paused = true) then
      raise exception 'REPUBLISH_MAINTENANCE: La republication sur cette plateforme est momentanement en pause, nous travaillons dessus. Tes annonces sont protegees et aucune Pepite n''est debitee.';
    end if;
  exception when others then
    if sqlerrm like 'REPUBLISH_MAINTENANCE:%' then raise; end if;
  end;

  select coalesce(value,0) into cle from coin_config where key = 'republish_maintenance';
  cle := coalesce(cle, 0);

  -- 1 = coupure TOTALE (interrupteur d'urgence, tout le monde)
  if cle = 1 then
    raise exception 'REPUBLISH_MAINTENANCE: La republication est temporairement en maintenance. Tes annonces sont protegees et aucune Pepite n''est debitee. On te previent des que c''est retabli.';
  end if;

  -- 0 = ouvert, MAIS toujours interdit sous 0.6.2 (garde permanente de version).
  -- ⚠️ COMPARAISON PAR version_cle() ET JAMAIS EN TEXTE : '0.6.11' < '0.6.2'
  -- est vrai en texte, ce qui refusait tout le parc à jour (incident 30/08).
  -- version_cle() rend NULL sur une version illisible → refus, comme avant.
  select extension_version into v from profiles where id = new.user_id;
  if public.version_cle(v) is null or public.version_cle(v) < public.version_cle('0.6.2') then
    raise exception 'REPUBLISH_MAINTENANCE: Ta version de l''extension doit etre mise a jour avant de republier. Chrome installe la nouvelle version automatiquement, elle arrivera d''ici quelques heures. Tes annonces sont protegees et aucune Pepite n''est debitee.';
  end if;

  return new;
end;
$function$;
