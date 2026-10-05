// La voie d'une annonce eBay = la façon dont elle a été CRÉÉE (05/10).
// Corps réel des fonctions lus dans les migrations, rejoués sur des tables
// temporaires (pg_temp) dans une transaction annulée : rien n'est écrit.
//   node scripts/ebay-voie-creation-sql-selftest.mjs            → la règle du 05/10
//   node scripts/ebay-voie-creation-sql-selftest.mjs --avant    → la règle d'avant (doit échouer)
// puis : npx supabase db query --linked -f build/ebay-voie-creation-test-annule.sql
import fs from 'node:fs';

const avant = process.argv.includes('--avant');
const lire = (f) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
const fonction = (sql, nom) => {
  const debut = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (debut < 0) throw new Error(`fonction ${nom} absente`);
  const fin = sql.indexOf('$function$', sql.indexOf('$function$', debut) + 10);
  if (fin < 0) throw new Error(`fin de ${nom} introuvable`);
  return sql.slice(debut, fin + '$function$'.length) + ';';
};
const versTemp = (corps) => corps
  .replaceAll('FUNCTION public.', 'FUNCTION pg_temp.')
  .replaceAll("SET search_path TO 'public', 'pg_temp'", "SET search_path TO 'pg_temp', 'public'")
  .replace(/\bebay_annonce_creee_par_api\(NEW/g, 'pg_temp.ebay_annonce_creee_par_api(NEW');

let corps;
if (avant) {
  corps = fonction(lire('20261001064500_ebay_retrait_annonce_importee_voie_extension.sql'), 'cross_post_jobs_voie_ebay') + '\n'
    + fonction(lire('20260927091642_ebay_compte_relie_api_publie_par_api.sql'), 'cross_post_jobs_voie_stable');
} else {
  const m = lire('20261005140000_ebay_voie_de_creation.sql');
  corps = ['ebay_annonce_creee_par_api', 'cross_post_jobs_voie_ebay', 'cross_post_jobs_voie_stable'].map((n) => fonction(m, n)).join('\n');
}
corps = versTemp(corps);

const tests = `
CREATE TRIGGER t_voie_ebay BEFORE INSERT ON pg_temp.cross_post_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.cross_post_jobs_voie_ebay();
CREATE TRIGGER t_voie_stable BEFORE UPDATE OF voie ON pg_temp.cross_post_jobs FOR EACH ROW EXECUTE FUNCTION pg_temp.cross_post_jobs_voie_stable();
DO $tests$
DECLARE
  relie uuid := '00000000-0000-4000-8000-0000000000a1';
  libre uuid := '00000000-0000-4000-8000-0000000000a2';
  v text; jid uuid;
  echecs text[] := '{}';
BEGIN
  INSERT INTO pg_temp.profiles VALUES (relie, true), (libre, false);
  INSERT INTO pg_temp.ebay_accounts VALUES (relie, NULL);

  -- 1. Publication À FAIRE d'un compte relié : l'API (inchangé).
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title)
  VALUES (relie, 10, 'ebay', 'publish', 'pending', 'pub') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('1 publication à faire, compte relié → api ; vu ' || v); END IF;

  -- 2. Notre API a publié l'annonce 111111111111 (fiche 10).
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, voie, handler_build, platform_listing_id, platform_fields)
  VALUES (relie, 10, 'ebay', 'publish', 'published', 'api', 'api', 'ebay-api-worker 3-lens', '111111111111',
          '{"ebay_api":{"listing_id":"111111111111","offer_id":"o1","sku":"fs-10"}}');

  -- 3. IMPORT par le relevé d'une annonce créée par la personne (Batman) : extension.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, handler_build, platform_listing_id, listing_url, platform_fields)
  VALUES (relie, 20, 'ebay', 'publish', 'published', 'Batman', 'releve-annonces', '377494897809', 'https://www.ebay.fr/itm/377494897809',
          '{"source":"releve","rattachement":{"import":true}}') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('3 import d''une annonce créée par la personne → extension ; vu ' || v); END IF;

  -- 4. IMPORT d'une annonce que notre API a créée (relue par un relevé) : api.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, handler_build, platform_listing_id, platform_fields)
  VALUES (relie, 10, 'ebay', 'publish', 'published', 'relu', 'releve-annonces', '111111111111', '{"source":"releve"}') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('4 import d''une annonce créée par notre API → api ; vu ' || v); END IF;

  -- 5. Retrait par suppression de la fiche (pas de vente, fiche encore là à l'insertion) : extension.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, platform_listing_id, listing_url)
  VALUES (relie, 20, 'ebay', 'delete', 'pending', 'Batman', '377494897809', 'https://www.ebay.fr/itm/377494897809') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('5 retrait (suppression de fiche) d''une annonce importée → extension ; vu ' || v); END IF;

  -- 6. Retrait d'une annonce importée, 'api' écrit par l'appelant : extension quand même.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, voie, platform_listing_id)
  VALUES (relie, 20, 'ebay', 'delete', 'pending', 'Batman', 'api', '377494897809') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('6 retrait d''un import, api imposé par l''appelant → extension ; vu ' || v); END IF;

  -- 7. Retrait d'une annonce publiée par notre API : api, fiche présente…
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, platform_listing_id)
  VALUES (relie, 10, 'ebay', 'delete', 'pending', 'api', '111111111111') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('7 retrait d''une annonce de notre API → api ; vu ' || v); END IF;

  -- 8. … ou fiche déjà disparue (inventaire_id NULL) : api, jamais l'extension.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url)
  VALUES (relie, NULL, 'ebay', 'delete', 'pending', 'api', 'https://www.ebay.fr/itm/titre-quelconque/111111111111?hash=x') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('8 retrait d''une annonce de notre API, fiche disparue → api ; vu ' || v); END IF;

  -- 9. Republication : selon l'annonce visée.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, platform_listing_id)
  VALUES (relie, 20, 'ebay', 'republish', 'pending', 'Batman', '377494897809') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('9a republication d''un import → extension ; vu ' || v); END IF;
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, platform_listing_id)
  VALUES (relie, 10, 'ebay', 'republish', 'pending', 'api', '111111111111') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('9b republication d''une annonce de notre API → api ; vu ' || v); END IF;

  -- 10. Retrait sans identifiant : la dernière mise en ligne de la fiche, API seulement si notre API l'a faite.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title)
  VALUES (relie, 20, 'ebay', 'delete', 'pending', 'sans id') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('10a retrait sans identifiant, dernière mise en ligne = import → extension ; vu ' || v); END IF;
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, voie, handler_build, platform_listing_id, published_at)
  VALUES (relie, 30, 'ebay', 'publish', 'published', 'api30', 'api', 'ebay-api-worker 3-lens', '222222222222', now());
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title)
  VALUES (relie, 30, 'ebay', 'delete', 'pending', 'sans id') RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('10b retrait sans identifiant, dernière mise en ligne = notre API → api ; vu ' || v); END IF;

  -- 11. Compte non relié : tout en extension ; autre plateforme : intouchée.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title)
  VALUES (libre, 40, 'ebay', 'publish', 'pending', 'libre') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('11a compte non relié → extension ; vu ' || v); END IF;
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, voie)
  VALUES (relie, 50, 'vinted', 'delete', 'pending', 'vinted', 'extension') RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('11b autre plateforme intouchée ; vu ' || v); END IF;

  -- 12. voie_stable : api → extension refusé en temps normal, admis pour un script de réparation.
  INSERT INTO pg_temp.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, voie, handler_build)
  VALUES (relie, 60, 'ebay', 'publish', 'pending', 'pending api', 'api', NULL) RETURNING id INTO jid;
  UPDATE pg_temp.cross_post_jobs SET status = 'published' WHERE id = jid;
  UPDATE pg_temp.cross_post_jobs SET voie = 'extension' WHERE id = jid RETURNING voie INTO v;
  IF v <> 'api' THEN echecs := echecs || ('12a bascule api → extension refusée sans le drapeau ; vu ' || v); END IF;
  SET LOCAL fillsell.voie_reetiquetage = 'on';
  UPDATE pg_temp.cross_post_jobs SET voie = 'extension' WHERE id = jid RETURNING voie INTO v;
  IF v <> 'extension' THEN echecs := echecs || ('12b réétiquetage admis avec le drapeau ; vu ' || v); END IF;
  SET LOCAL fillsell.voie_reetiquetage = 'off';

  IF cardinality(echecs) > 0 THEN
    RAISE EXCEPTION 'ÉCHEC ebay-voie-creation (%) : %', cardinality(echecs), array_to_string(echecs, ' | ');
  END IF;
END;
$tests$;
SELECT 'voie eBay = voie de création : 15 cas réussis' AS controle;
`;

const sql = "BEGIN; SET LOCAL statement_timeout='5s'; SET LOCAL client_min_messages = error;\n"
  + 'CREATE TEMP TABLE cross_post_jobs (LIKE public.cross_post_jobs INCLUDING DEFAULTS);\n'
  + 'CREATE TEMP TABLE profiles (id uuid PRIMARY KEY, ebay_voie_api boolean);\n'
  + 'CREATE TEMP TABLE ebay_accounts (user_id uuid PRIMARY KEY, revoked_at timestamptz);\n'
  + corps + '\n' + tests + '\nROLLBACK;\n';
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/ebay-voie-creation-test-annule.sql', sql);
console.log(`build/ebay-voie-creation-test-annule.sql (${avant ? 'règle d\'AVANT' : 'règle du 05/10'})`);
