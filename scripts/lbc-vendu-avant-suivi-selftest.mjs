// selftest:lbc-vendu-avant-suivi — (03/11 soir, JEAN-LUC LASSARAT) un « Vendu » Leboncoin déjà là à la PREMIÈRE
// lecture de l'annonce n'est pas une vente du jour : check-listing-status refuse la confirmation, avec la raison.
//   1. la règle (_shared/lbc-vendu-avant-suivi.js) sur les traces réelles du 03/11 et du 24/10 ;
//   2. check-listing-status : la garde passe AVANT orchestrateSale, sur le job de la personne, numéro exact, et dit
//      sa raison en 409 (lue par l'app : raisonRefus) ; une lecture des traces en échec ne bloque rien.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const R = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/lbc-vendu-avant-suivi.js')).href);
const { raisonRefus } = await import(pathToFileURL(join(ROOT, 'src/utils/raisonRefus.js')).href);

console.log('1. La règle');
// JEAN-LUC, annonce 3224866836 (scie sabre) : une seule trace, la première lecture du 03/11 10:56 dit déjà « Vendu ».
const jl = R.vendueAvantSuivi([{ created_at: '2026-11-03T09:56:05Z', transaction: 'sold', avant: null }]);
ok(jl.ancienne === true && jl.premiereLecture === '2026-11-03T09:56:05Z', '« Vendu » dès la première lecture : vente ancienne (JEAN-LUC, 03/11)');
// louis-seller, annonce 3291945630 (Polly Pocket) : lue sans transaction, puis « Achat en cours » le 24/10 — une vraie vente.
ok(R.vendueAvantSuivi([{ created_at: '2026-10-24T10:08:50Z', transaction: 'pending', avant: 'aucune' }]).ancienne === false,
  'lue sans transaction puis « Achat en cours » : FillSell a vu la vente (Polly Pocket, 24/10)');
ok(R.vendueAvantSuivi([
  { created_at: '2026-11-03T09:56:05Z', transaction: 'sold', avant: null },
  { created_at: '2026-11-04T09:00:00Z', transaction: 'aucune', avant: 'sold' },
  { created_at: '2026-11-05T09:00:00Z', transaction: 'sold', avant: 'aucune' },
]).ancienne === false, 'revue sans « Vendu » puis « Vendu » : une transition vue, la règle d\'avant joue');
ok(R.vendueAvantSuivi([
  { created_at: '2026-11-05T09:00:00Z', transaction: 'sold', avant: 'pending' },
  { created_at: '2026-11-04T09:00:00Z', transaction: 'pending', avant: 'aucune' },
]).ancienne === false, 'l\'ordre des traces ne compte pas (triées par date)');
ok(R.vendueAvantSuivi([]).ancienne === false && R.vendueAvantSuivi(null).ancienne === false, 'aucune trace : inconnu, jamais « ancienne »');
ok(R.vendueAvantSuivi([{ created_at: '2026-11-03T09:56:05Z', transaction: 'pending', avant: null }]).ancienne === false,
  '« Achat en cours » à la première lecture : un achat en cours MAINTENANT, jamais écarté');
const raison = R.raisonVenteAncienne('2026-11-03T09:56:05Z');
ok(raison.includes('le 03/11') && raison.includes('Rien n\'est enregistré, rien n\'est retiré ailleurs') && raison.length <= 500,
  'la raison dite à la personne : la date (heure de Paris), rien d\'enregistré ni de retiré, moins de 500 caractères');
ok(R.annonceImportee({ source: 'releve', rattachement: { import: true, par: 'rapprochement' } })
  && R.annonceImportee({ rattachement: { import: 'true' } }) && R.annonceImportee({ source: 'releve' }),
  'annonce importée par un relevé (JEAN-LUC : source releve, rattachement import)');
ok(!R.annonceImportee({}) && !R.annonceImportee(null) && !R.annonceImportee({ rattachement: { par: 'utilisateur', motif: 'meme_article_confirme' } }),
  'annonce déposée par FillSell : jamais concernée (elle n\'existait pas avant son dépôt)');
const lue = await raisonRefus({ context: { status: 409, json: async () => ({ error: raison }) } });
ok(lue === raison, 'l\'app la lit telle quelle (raisonRefus, 409)');

console.log('2. check-listing-status');
const F = lire('supabase/functions/check-listing-status/index.ts');
const iGarde = F.indexOf('vendueAvantSuivi(');
const iOrch = F.indexOf('await orchestrateSale(');
ok(F.includes('import { vendueAvantSuivi, raisonVenteAncienne, annonceImportee } from "../_shared/lbc-vendu-avant-suivi.js";'), 'la règle partagée, importée');
ok(iGarde > 0 && iOrch > iGarde, 'la garde passe AVANT toute écriture de vente');
ok(F.includes('.eq("id", jobId).eq("user_id", user.id)'), 'le job de la personne, jamais celui d\'un autre compte');
ok(F.includes('jobLu?.platform === "leboncoin"') && F.includes('/^\\d+$/.test(numeroLbc)') && F.includes('pfLu.sale_signal === "sold"')
  && F.includes('&& annonceImportee(pfLu)) {'), 'Leboncoin seulement, numéro exact, drapeau « Vendue », annonce importée seulement');
ok(F.includes('.eq("feature", "vente_leboncoin_transaction").eq("metadata->>listing_id", numeroLbc)') && F.includes('.limit(200)'),
  'les traces de CE numéro, lecture bornée');
ok(F.includes('if (!tracesErr) {'), 'traces illisibles : rien n\'est bloqué (la règle d\'avant)');
ok(F.includes('return json({ error: raisonVenteAncienne(lu.premiereLecture) }, 409);') && F.includes('feature: "vente_leboncoin_ancienne_refusee"'),
  'refus 409 avec la raison, et une trace');

console.log(`\n✓ lbc-vendu-avant-suivi : ${n} contrôles verts`);
