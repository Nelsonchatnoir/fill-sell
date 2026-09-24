-- ═══════════════════════════════════════════════════════════════════════════
-- LE RETRAIT NÉ D'UNE SUPPRESSION D'ARTICLE PORTE SA BOUTIQUE VINTED (24/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Dossier remialbertholl : deux retraits Vinted (15a1edd7, fbe668ca, créés le
-- 23/09 par ce trigger quand l'article a été supprimé du stock) refusés en
-- boucle « CHALLENGE… anti-robot » (403 access_denied). Les deux annonces
-- appartiennent à @nadegemarcelin78 (16040413, vérifié sur leurs pages le
-- 24/09 : toujours EN LIGNE) pendant que Chrome est sur @jcassou (32977976).
-- La garde boutique de get-pending-jobs lisait inventaire.vinted_account_id…
-- d'un article que la clé étrangère venait de détacher (inventaire_id NULL) :
-- elle ne voyait jamais ces retraits-là.
-- Le trigger a old.vinted_account_id sous la main en BEFORE DELETE : il le
-- recopie désormais dans le job (platform_fields.vinted_account_id), que la
-- garde lit quand l'article n'existe plus.
--
-- PATCH PAR ANCRE sur le corps LIVE (md5 relevé le 24/09 :
-- a95a5fde281b3eb2629f4f8656ab2ae9). Idempotent : si l'ancre neuve est déjà
-- là, rien ne change. Si l'ancre d'origine manque, la migration ÉCHOUE.

do $mig$
declare
  v_def   text := pg_get_functiondef('public.inventaire_arme_retraits_avant_suppression()'::regprocedure);
  v_avant text := $a$           'motif', 'annonce en ligne non couverte par le plan de suppression de l''app')));$a$;
  v_apres text := $a$           'motif', 'annonce en ligne non couverte par le plan de suppression de l''app'))
         -- 24/09 : la boutique Vinted de l'article, que la garde boutique lit
         -- quand l'article n'existe plus (retrait orphelin).
         || case when v_pub.platform = 'vinted' and nullif(btrim(old.vinted_account_id::text), '') is not null
                 then jsonb_build_object('vinted_account_id', btrim(old.vinted_account_id::text))
                 else '{}'::jsonb end);$a$;
begin
  if position('vinted_account_id' in v_def) > 0 then
    raise notice 'déjà appliquée : rien à faire';
    return;
  end if;
  if position(v_avant in v_def) = 0 then
    raise exception 'ancre introuvable dans le corps live de inventaire_arme_retraits_avant_suppression';
  end if;
  execute replace(v_def, v_avant, v_apres);
end
$mig$;
