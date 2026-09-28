// Produit un test SQL annulé, exclusivement sur des tables temporaires.
// Le corps testé est celui de la migration, pas une réécriture de la logique.
import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20260928133204_point_b_stock_restant.sql','utf8');
const debut=migration.indexOf('CREATE OR REPLACE FUNCTION public.enregistrer_vente_atomique');
const fin=migration.lastIndexOf('$function$')+10;
if(debut<0||fin<12)throw Error('RPC à tester introuvable');
let fonction=migration.slice(debut,fin)
 .replace('public.enregistrer_vente_atomique','pg_temp.enregistrer_vente_atomique')
 .replace('search_path=public,pg_temp','search_path=pg_temp,public')
 .replace("SET search_path TO 'public', 'pg_temp'", "SET search_path TO 'pg_temp', 'public'")+';';
for(const nom of ['retrait_job_prouve','fiche_annonces_vivantes','armer_retrait_job'])
 fonction=fonction.replaceAll(`${nom}(`,`pg_temp.${nom}(`);
const fixtures=fs.readFileSync('scripts/vente-atomique-fixtures.sql','utf8');
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/vente-atomique-test-annule.sql',
 "BEGIN; SET LOCAL statement_timeout='5s';\n"+fixtures.replace('-- CORPS_RPC_TEMPORAIRE',fonction)+'\nROLLBACK;\n');
console.log('build/vente-atomique-test-annule.sql');
