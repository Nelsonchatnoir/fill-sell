// Les données du moteur de rapprochement v3, compte par compte, en LECTURE SEULE.
// Le rôle en lecture (supabase_read_only_user) ne peut PAS appeler public.rapprochement_v3_lire :
// cette requête en est le miroir en SELECT pur — le corps lu en prod le 02/11 (pg_get_functiondef,
// defs/rapprochement_v3_lire.sql), chaque fonction appelée remplacée par SON corps lu en prod
// (rapprochement_v3_vinted_depuis, rapprochement_v3_fiches_main_depuis, releve_run_hors_liste
// → releve_hors_liste, releve_est_geste, releve_ebay_run_bloque → compte_ebay_api,
// rapprochement_description_cle / _lot → rapprochement_texte_norm, opla_sortie_passee,
// annonce_lien_notification). Non reproduits (inutiles à passe()) : dette_beebs, import_ouvert,
// geste_recent, lu_le.
// Sortie : donnees/moteur/<user>.json (un fichier par compte).
// Usage : node lire-donnees-moteur.mjs  (tous les comptes qui ont une fiche vivante ou une annonce)
import fs from 'node:fs';
import path from 'node:path';
import { requete, W } from './sql-lecture.mjs';

const dir = path.join(W, 'donnees', 'moteur');
fs.mkdirSync(dir, { recursive: true });

const NORM = (x) => `btrim(regexp_replace(lower(translate(coalesce(${x}, ''), 'ÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑŸàâäáãåéèêëíìîïóòôöõúùûüçñÿœŒæÆ', 'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucnyoOaA')), '[^a-z0-9]+', ' ', 'g'))`;

function sqlComptes(users) {
  const liste = users.map((u) => `'${u}'::uuid`).join(',');
  return `
with u(p_user) as (select unnest(array[${liste}])),
p as (
  select u.p_user,
    COALESCE((SELECT c.vinted_juge_le FROM rapprochement_comptes c WHERE c.user_id = u.p_user), timestamptz '2026-10-07 23:30:00+00') v_depuis,
    COALESCE((SELECT c.fiches_main_juge_le FROM rapprochement_comptes c WHERE c.user_id = u.p_user), timestamptz '2026-10-08 00:00:00+00') v_main_depuis
  from u),
p2 as (
  select p.*,
    (SELECT max(x.created_at) FROM (SELECT i.created_at FROM inventaire i WHERE i.user_id = p.p_user AND i.origine = 'vinted_sync' AND i.created_at > p.v_depuis ORDER BY i.created_at LIMIT 200) x) v_vinted_max,
    EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = p.p_user AND v.fusionne_dans IS NULL AND v.statut = 'stock' AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync')) a_vinted
  from p),
p3 as (
  select p2.*,
    CASE WHEN p2.a_vinted THEN (SELECT max(x.created_at) FROM (
      SELECT i.created_at FROM inventaire i
       WHERE i.user_id = p2.p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\\_%' AND i.created_at > p2.v_main_depuis
       ORDER BY i.created_at LIMIT 200) x) END v_main_max
  from p2)
select p3.p_user::text u, jsonb_build_object(
  'remise_en_ligne_actif', COALESCE((SELECT value FROM coin_config WHERE key = 'rapprochement_remise_en_ligne'), 0) = 1,
  'vinted_nouvelles', CASE WHEN p3.v_vinted_max IS NOT NULL THEN (SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) FROM inventaire i
     WHERE i.user_id = p3.p_user AND i.origine = 'vinted_sync' AND i.created_at > p3.v_depuis AND i.created_at <= p3.v_vinted_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock') ELSE '[]'::jsonb END,
  'vinted_releves_complets', (SELECT COALESCE(jsonb_object_agg(x.acc, x.le), '{}'::jsonb) FROM (
    SELECT COALESCE(r.vinted_user_id, '') acc, max(r.started_at) le FROM vinted_sync_runs r
     WHERE r.user_id = p3.p_user AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
       AND r.items_vus >= COALESCE(r.total_entries, r.items_vus)
     GROUP BY 1) x),
  'fiches_main_actif', true,
  'fiches_main_a_juger', CASE WHEN p3.a_vinted THEN (SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) FROM inventaire i
     WHERE i.user_id = p3.p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\\_%' AND i.created_at > p3.v_main_depuis AND i.created_at <= p3.v_main_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock') ELSE '[]'::jsonb END,
  'vinted_a_juger', (SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) FROM inventaire i
   WHERE i.user_id = p3.p_user AND i.origine = 'vinted_sync' AND i.created_at > p3.v_depuis AND i.created_at <= p3.v_vinted_max
     AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
     AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = p3.p_user AND r.origine LIKE 'releve\\_%' AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
          OR EXISTS (SELECT 1 FROM inventaire i2 WHERE i2.user_id = p3.p_user AND i2.fusionne_dans IS NULL AND i2.statut = 'stock'
                       AND i2.vinted_item_id IS NULL AND COALESCE(i2.origine, '') <> 'vinted_sync' AND COALESCE(i2.origine, '') NOT LIKE 'releve\\_%'))),
  'user_id', p3.p_user,
  'fiches', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id,
      'vinted_status', i.vinted_status, 'disparu_le', i.disparu_le, 'last_synced_at', i.last_synced_at,
      'first_seen_at', i.first_seen_at, 'vinted_account_id', i.vinted_account_id
    )), '[]'::jsonb) FROM inventaire i WHERE i.user_id = p3.p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')),
  'annonces', (WITH runs AS (
    SELECT r.id,
           (r.id IS NOT NULL AND (
              (r.kind = 'annonces' AND (coalesce(r.erreur, '') like '%n''a pas rendu sa liste%' or coalesce(r.erreur, '') like '%Hub vendeur n''a pas rendu son compteur%'))
              OR EXISTS (SELECT 1 FROM releve_ebay_compte c WHERE c.run_id = r.id AND c.verdict <> 'meme_compte'))) hors_liste,
           COALESCE(r.declencheur, '') ~ '^(bouton|bouton_distant|app)(:redemande)?$' geste,
           (r.platform = 'ebay' AND r.kind = 'annonces' AND coalesce(r.extension_build, '') not like 'serveur:ebay-api%'
              AND (SELECT nullif(trim(ea.ebay_user_id), '') FROM ebay_accounts ea WHERE ea.user_id = r.user_id AND ea.revoked_at IS NULL LIMIT 1) IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM releve_ebay_compte c WHERE c.run_id = r.id AND c.verdict = 'meme_compte')) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p3.p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL))
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      'desc_h', CASE WHEN length(${NORM("a.capture ->> 'description'")}) >= 20 THEN md5(${NORM("a.capture ->> 'description'")}) END,
      'desc_lot', (' ' || ${NORM("a.capture ->> 'description'")} || ' ' || ${NORM('a.titre')} || ' ')
         ~ ' (lot|lots|plusieurs|modeles|au choix|faites votre choix|faite votre choix|disponibles|existe en|autres tailles|x ?[2-9]|[2-9] ?x|[2-9] (pieces|exemplaires|paires)) ',
      'quantite', a.quantite,
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p3.p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
     AND NOT (a.platform = 'opla' AND a.inventaire_id IS NULL AND COALESCE((SELECT CASE WHEN c.value = 0 THEN false ELSE now() >= to_timestamp(c.value) END
                     FROM public.coin_config c WHERE c.key = 'opla_sortie_le'), now() >= to_timestamp(1791583200)))
     AND NOT (a.url IS NOT NULL AND COALESCE(a.url, '') ~ 'ni_nt(%3A|%3a|:|=)')),
  'fusions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    FROM inventaire_fusions f WHERE f.user_id = p3.p_user),
  'doublons', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    FROM inventaire_doublons d WHERE d.user_id = p3.p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee'))
) d
from p3;`;
}

// Les comptes : une fiche vivante (stock / vendu, non fusionnée) ou une annonce non disparue.
const comptes = requete(`select json_agg(u order by n desc) j from (
  select user_id::text u, count(*) n from (
    select user_id from inventaire where fusionne_dans is null and statut in ('stock','vendu')
    union all select user_id from annonces_plateforme where disparu_le is null) x group by 1) y;`, '_comptes.sql')[0].j;
console.log('comptes', comptes.length);
const faits = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
const restants = comptes.filter((u) => !faits.has(u));
// lots : les gros comptes seuls, les petits par 40
let i = 0;
const t0 = Date.now();
while (i < restants.length) {
  const lot = i < 30 ? restants.slice(i, i + 1) : restants.slice(i, i + 40);
  const rows = requete(sqlComptes(lot), '_moteur.sql');
  for (const r of rows) fs.writeFileSync(path.join(dir, r.u + '.json'), JSON.stringify(r.d));
  i += lot.length;
  console.log(`${i}/${restants.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
console.log('FIN');
