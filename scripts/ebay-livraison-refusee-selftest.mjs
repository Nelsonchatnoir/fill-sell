// Verrou du 14/11/2026 soir (point 2 de Nico, compte 13e274de) : eBay refuse la règle de livraison (25007).
// Faits lus en base : la règle du COMPTE 327113190011 a été refusée sur 6 mises en ligne sur 6 après sa réécriture de 10:14
// (5 catégories, 1,90 € à 14,90 €) ; les 82 réussites portaient une règle choisie pour l'article (325352930011…).
//   1. 25007 = refus de la règle de livraison ; les autres refus ne passent pas par là ;
//   2. remplacement : une règle du vendeur PROUVÉE (mise en ligne réussie, 30 j) et TOUJOURS sur son compte, d'abord
//      la plus servie dans la même catégorie ; jamais la règle refusée ; liste illisible = aucun choix ;
//   3. le message : sans code ni jargon, le geste (Livraison eBay › Changer, relance) ;
//   4. le worker : branche AVANT le refus générique, une fois par article, aucune écriture de règle chez eBay, et la
//      règle servie notée à chaque mise en ligne (la preuve des prochains remplacements).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

let M = null;
try { M = await import(pathToFileURL(path.join(racine, 'supabase/functions/_shared/ebay-livraison-refusee.js')).href); } catch (e) { console.log(`  (import : ${e.message})`); }
ok(Boolean(M), 'le module _shared/ebay-livraison-refusee.js existe');
if (M) {
  const { refusLivraisonInvalide, choisirLivraisonDeRemplacement, preuvesDepuisTaches, messageLivraisonRefusee } = M;
  console.log('1. Le refus');
  ok(refusLivraisonInvalide({ errorId: 25007 }) && refusLivraisonInvalide({ errorId: '25007' }), '25007 = la règle de livraison refusée');
  ok(!refusLivraisonInvalide({ errorId: 25002 }) && !refusLivraisonInvalide({ errorId: 25129 }) && !refusLivraisonInvalide(null), 'retours (25002), aspects (25129), rien : jamais');

  console.log('\n2. Le remplacement (cas réel 13e274de, 14/11 19:12)');
  const maintenant = Date.parse('2026-11-14T18:12:10Z');
  const existantes = [{ id: '327113190011', nom: 'Livraison FillSell' }, { id: '325352930011', nom: 'Lettre suivie' }, { id: '325351779011', nom: 'Colissimo' },
    { id: '325354388011', nom: 'Mondial Relay' }, { id: '325353828011', nom: 'Gros colis' }];
  const taches = [
    ...Array.from({ length: 15 }, (_, i) => ({ published_at: `2026-11-14T${String(3 + (i % 10)).padStart(2, '0')}:16:00Z`, platform_fields: { ebayFulfillmentPolicyId: '325352930011', ebayCategoryId: '50637' } })),
    ...Array.from({ length: 11 }, () => ({ published_at: '2026-11-14T13:18:00Z', platform_fields: { ebayFulfillmentPolicyId: '325352930011', ebayCategoryId: '53159' } })),
    ...Array.from({ length: 8 }, () => ({ published_at: '2026-11-14T13:16:00Z', platform_fields: { ebayFulfillmentPolicyId: '325351779011', ebayCategoryId: '50647' } })),
    { published_at: '2026-11-14T07:18:00Z', platform_fields: { ebayCategoryId: '50637', ebay_api: { fulfillment_policy_id: '327113190011' } } },
    { published_at: '2026-11-14T07:18:00Z', platform_fields: {} },
  ];
  const preuves = preuvesDepuisTaches(taches);
  ok(preuves.length === 35, `les preuves : la règle de l'article, sinon celle notée à la mise en ligne (${preuves.length})`);
  const c = choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves, categorie: '50637', maintenant });
  ok(c?.id === '325352930011' && c.nom === 'Lettre suivie' && c.meme_categorie === 15 && c.preuves === 26, `bracelet (50637) → 325352930011, 15 dans la catégorie (${JSON.stringify(c)})`);
  const c2 = choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves, categorie: '50647', maintenant });
  ok(c2?.id === '325351779011', 'une autre catégorie : la règle la plus servie DANS cette catégorie d’abord');
  const c3 = choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves, categorie: '99999', maintenant });
  ok(c3?.id === '325352930011', 'catégorie jamais servie : la plus servie du compte');
  const autre = choisirLivraisonDeRemplacement({ refusee: '325352930011', existantes, preuves, categorie: '50637', maintenant });
  ok(autre && autre.id !== '325352930011' && autre.id === '327113190011', 'jamais la règle refusée (la suivante prouvée dans la catégorie)');
  ok(choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes: existantes.filter((p) => p.id !== '325352930011'), preuves, categorie: '50637', maintenant })?.id === '325351779011',
    'une règle supprimée chez eBay n’est jamais retenue');
  ok(choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes: null, preuves, categorie: '50637', maintenant }) === null, 'liste illisible : aucun choix');
  ok(choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves: [], categorie: '50637', maintenant }) === null, 'aucune règle prouvée : aucun choix');
  ok(choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves, categorie: '50637', maintenant: maintenant + 31 * 24 * 3600 * 1000 }) === null, 'preuves de plus de 30 jours : aucun choix');
  ok(choisirLivraisonDeRemplacement({ refusee: '327113190011', existantes, preuves: [{ politique: '325351779011', publie_le: '2026-11-14T13:16:00Z' }], maintenant: Date.parse('2026-11-14T12:00:00Z') }) === null,
    'une « preuve » datée après maintenant : refusée');

  console.log('\n3. Le message');
  const m1 = messageLivraisonRefusee({ nom: 'Livraison FillSell' });
  const m2 = messageLivraisonRefusee({ nom: 'Colissimo', choisieParArticle: true });
  const m3 = messageLivraisonRefusee({ remplacementEssaye: true });
  for (const [m, quoi] of [[m1, 'compte'], [m2, 'article'], [m3, 'remplacement']]) {
    ok(!/\d{5}|25007|policy|fulfillment|API|400/i.test(m) && /Livraison eBay › Changer/.test(m) && /relance/.test(m), `${quoi} : sans code ni jargon, le geste dit — « ${m.slice(0, 70)}… »`);
  }
  ok(/« Livraison FillSell »/.test(m1) && /« Colissimo »/.test(m2), 'la règle nommée quand eBay l’a rendue');
}

console.log('\n4. Le worker');
const w = lire('supabase/functions/ebay-api-worker/index.ts');
const iBranche = w.indexOf('if (refusLivraisonInvalide(e)) {');
const iGenerique = w.indexOf('const refus = messageRefus("la publication", pub.http, e);');
ok(iBranche > 0 && iGenerique > iBranche, 'la branche 25007 passe AVANT le refus générique de la publication');
const branche = w.slice(iBranche, iGenerique);
ok(/!choisieParArticle && !remplacementEssaye && existantes/.test(branche), 'remplacement seulement : règle du compte, une fois, liste lue');
ok(/ebayFulfillmentPolicyId: choix\.id,\s*ebay_livraison_remplacee:/.test(branche) && /status: "pending", error: null/.test(branche), 'règle retenue pour l’article (tracée), la publication repart');
ok(/status: "needs_user", error: messageLivraisonRefusee\(/.test(branche) && /needs_user_source: "relancer"/.test(branche), 'sinon : le message clair, bouton « Relancer »');
ok(!/method: "(POST|PUT|DELETE)"/.test(branche) && /fulfillment_policy\?marketplace_id=/.test(branche), 'rien n’est écrit chez eBay : la liste est LUE (GET), jamais créée ni modifiée');
ok(/\.eq\("voie", "api"\)\.eq\("status", "published"\)/.test(branche) && /\.limit\(500\)/.test(branche), 'les preuves : tâches publiées par l’API, lecture bornée');
ok(/tentatives, fulfillment_policy_id: String\(offre\.listingPolicies\.fulfillmentPolicyId/.test(w), 'la règle servie est notée à chaque mise en ligne réussie');

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`ÉCHEC : ${ko}`); process.exit(1); }
