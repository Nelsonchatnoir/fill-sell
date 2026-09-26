// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉ eBAY ALIGNÉ SUR L'API — SELFTEST (2026-09-26, preuve France 0.6.69)
// ═══════════════════════════════════════════════════════════════════════════
// Nico : API eBay reliée à « nelsonthecat », Chrome connecté à « nicsvob_0 ».
// Le relevé a lu le Hub de nicsvob_0 et la capture a réécrit 5 titres du stock
// en anglais. La règle : un compte relié par l'API ne voit son relevé eBay
// traité QUE si le Hub lu est celui du compte relié ; sinon rien n'entre, rien
// n'est rattaché, aucun article n'est modifié, rien n'est daté disparu.
//
// La garde est SERVEUR (migration 20260926110000_releve_ebay_compte_api +
// ebay-api-worker) et repose sur TROIS gestes que l'extension fait déjà, dans
// toutes les versions en circulation. Ce test fige ce qui les relie : si l'un
// de ces gestes change côté extension, la porte se rouvre sans bruit.
//   1. le relevé écrit ses lignes par UPSERT sur annonces_plateforme, avec
//      run_id — c'est là que le trigger tranche l'identité ;
//   2. la capture patche annonces_plateforme en demandant `inventaire_id` en
//      retour, et ne touche l'article QUE si une ligne revient — le trigger
//      rend 0 ligne pour une annonce non prouvée au compte relié ;
//   3. le moteur passe par rapprocher_releve(p_run_id).
//
//   npm run selftest:releve-ebay-compte-api
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const bg = lire('chrome-extension/background.js');
const migration = lire('supabase/migrations/20260926110000_releve_ebay_compte_api.sql');
const worker = lire('supabase/functions/ebay-api-worker/index.ts');

console.log("1. Les gestes de l'extension sur lesquels la garde repose");
ok(/restRequest\("annonces_plateforme\?on_conflict=user_id,platform,listing_id"/.test(bg),
  'le relevé écrit par upsert sur annonces_plateforme (on_conflict user_id,platform,listing_id)');
ok(/run_id: run\.id, vu_le: maintenant\(\)/.test(bg), 'chaque ligne de relevé porte run_id et vu_le');
{
  const i = bg.indexOf('async function capturerAnnonces(');
  const corps = i >= 0 ? bg.slice(i, i + 9000) : '';
  ok(/select=inventaire_id`[\s\S]{0,200}method: "PATCH"[\s\S]{0,300}capture:/.test(corps),
    'la capture patche annonces_plateforme en demandant inventaire_id en retour');
  ok(/const invId = Array\.isArray\(maj\) \? maj\[0\]\?\.inventaire_id : null;\s*if \(invId\)/.test(corps),
    "l'article n'est touché QUE si le patch de capture a rendu une ligne");
}
ok(/rest\/v1\/rpc\/rapprocher_releve/.test(bg), 'le moteur passe par rapprocher_releve');

console.log('2. La migration');
ok(/create trigger releve_ebay_garde_annonce\s+before insert or update on public\.annonces_plateforme/.test(migration),
  'trigger BEFORE INSERT OR UPDATE sur annonces_plateforme');
ok(/when \(new\.platform = 'ebay'\)/.test(migration), "le trigger ne regarde QUE les lignes eBay (Vinted, LBC, Beebs, Opla intouchés)");
ok(/if v_role <> 'authenticated' then return new; end if;/.test(migration), 'le serveur (service_role) passe');
ok(/if v_api is null then return new; end if;/.test(migration), "compte sans API eBay : rien ne change");
ok(/IF v_pf = 'ebay' AND releve_ebay_run_bloque\(p_run_id\) THEN/.test(migration), 'rapprocher_releve : relevé bloqué = rien de traité');
ok(/IF v_pf = 'ebay' AND releve_ebay_run_incomplet\(p_run_id\) THEN\s+v_complet := false;/.test(migration),
  'annonces inconnues laissées de côté = aucune disparition datée');
ok(/or exists \(select 1 from public\.releve_ebay_compte c\s+where c\.run_id = p_run_id and c\.verdict <> 'meme_compte'\)/.test(migration),
  'releve_run_hors_liste couvre le relevé eBay « autre compte » (import, rattachement, décision)');
ok(/v_ancre text := \$a\$  IF v_complet AND COALESCE\(array_length\(v_vus, 1\), 0\) = 0\$a\$;/.test(migration),
  "l'ancre de rapprocher_releve est celle de la prod (vérifiée le 26/09)");
ok((migration.match(/\[hors-compte-ebay\]/g) ?? []).length >= 4, 'le motif « [hors-compte-ebay] » est écrit et gardé');

console.log('3. Le worker');
ok(/async function verifierVendeursAnnonces\(/.test(worker), 'vérifie le vendeur des annonces en file (Browse)');
ok(/vendeurs = await verifierVendeursAnnonces\(admin, env\)/.test(worker), '… à chaque tick, avant la sortie anticipée');
ok(/seller as Record<string, unknown>/.test(worker) && /username/.test(worker), '… en lisant seller.username');
ok(/if \(res\.issue === "published"\) await noterVendeurPublication\(admin, job\.user_id, res\.listing_id\)/.test(worker),
  'une publication API inscrit son vendeur (le compte relié) sans rien demander');

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ RELEVÉ eBAY ALIGNÉ SUR L\'API : tout est vert.');
process.exit(ko ? 1 : 0);
