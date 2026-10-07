// ═══════════════════════════════════════════════════════════════════════════
// LE MOTEUR DE RAPPROCHEMENT v3 NE FUSIONNE JAMAIS À TORT (08/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Réécrit pour le moteur partagé (supabase/functions/_shared/rapprochement) :
// le même fichier tourne dans la fonction edge `rapprochement` et ici. Les
// invariants fixés par Nico (07-08/10) sont rejoués sur des articles fabriqués
// (empreintes contrôlées, titres réels de Corinne) :
//   · la photo seule ne fusionne JAMAIS (même photo, titres étrangers → doute) ;
//   · le titre seul ne fusionne JAMAIS (titre identique, photos différentes → à vérifier) ;
//   · deux annonces d'une MÊME plateforme ne sont jamais réunies (deux
//     exemplaires) : même photo + même titre → « Annonce en double ? » ;
//   · un « Non » de la personne n'est jamais rejugé ; un « Oui » tient ;
//   · une annonce ignorée par la personne n'est jamais un nœud ;
//   · un recadrage (lecture du centre) retrouve la même photo ;
//   · le plan « normal » ne touche qu'une annonce sans article ; la réparation
//     rejuge les décisions automatiques, jamais un article modifié (le SQL
//     garde l'intact, ici on vérifie le plan) ;
//   · la migration et la fonction edge portent bien la chaîne lire → passe → appliquer.
//
//   npm run selftest:moteur-rattachement
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construireNoeuds, forcesDe, rapprocher, planifier, evaluer } from '../supabase/functions/_shared/rapprochement/moteur.js';
import { passe, urlsDe, manquantesDe } from '../supabase/functions/_shared/rapprochement/passe.js';
import { photoDepuisEmpreinte, comparerPhotos, bits, ham } from '../supabase/functions/_shared/rapprochement/photos.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── Des empreintes fabriquées : une « photo » = une graine, ses variantes dérivées ─
const bitsDe = (graine, flips = 0) => {
  let x = 0x9e3779b9 ^ graine; const out = [];
  for (let i = 0; i < 64; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 16) & 1); }
  for (let i = 0; i < flips; i++) out[(i * 7) % 64] ^= 1;
  return out.join('');
};
const empreinte = (url, graine, { flips = 0, centreGraine = null } = {}) => ({
  url, dhash: bitsDe(graine, flips), phash: bitsDe(graine + 1000, flips),
  variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k, i) => [k, [bitsDe((centreGraine ?? graine) + 10 * (i + 1), flips), bitsDe((centreGraine ?? graine) + 10 * (i + 1) + 1000, flips)]])),
});
const E = new Map();
const photo = (nom, graine, o) => { const u = `https://cdn.test/${nom}.jpg`; E.set(u, empreinte(u, graine, o)); return u; };
// la même photo rehébergée ailleurs : 2 bits d'écart
const memePhoto = (nom, graine) => photo(nom, graine, { flips: 2 });

const fiche = (id, titre, photos, o = {}) => ({ id: String(id), titre, prix: o.prix ?? 5, statut: o.statut ?? 'stock', origine: o.origine ?? 'vinted_sync', marque: o.marque ?? null, taille: o.taille ?? null,
  photos, a_verifier: !!o.a_verifier, a_verifier_auto: !!o.a_verifier_auto, created_at: '2026-10-07T10:00:00Z', quantite: 1, vinted_item_id: o.origine === 'vinted_sync' || !o.origine ? String(900000 + Number(id)) : null, intact: o.intact ?? true });
const annonce = (id, platform, titre, photos, o = {}) => ({ id: String(id), platform, listing_id: String(id), url: `https://${platform}.test/${id}`, titre, prix: o.prix ?? 5, photo_url: photos[0] ?? null, photos,
  taille: o.taille ?? null, marque: o.marque ?? null, inventaire_id: o.inventaire_id ?? null, ignoree: !!o.ignoree, ignoree_par_utilisateur: !!o.ignoree_par_utilisateur, proposition_motif: null,
  source: o.source ?? null, run_id: 'r1', en_ligne: true, hors_liste: !!o.hors_liste, ebay_bloque: false, geste: true, derniere_par: o.derniere_par ?? null, derniere_decision: o.derniere_decision ?? null });
const donneesDe = (fiches, annonces, extra = {}) => ({ fiches, annonces, fusions: [], doublons: [], dette_beebs: false, import_ouvert: true, geste_recent: true, ...extra });
const photosDe = (urls) => urls.map((u) => photoDepuisEmpreinte(E.get(u))).filter(Boolean);
const decisionDe = (donnees, id) => { const N = construireNoeuds(donnees, photosDe); const R = rapprocher(N, { forces: forcesDe(donnees) }); return { N, R, d: R.dec.get(id) }; };

console.log('1. Les empreintes et leurs lectures');
{
  const a = photoDepuisEmpreinte(E.get(photo('p1', 1))), b = photoDepuisEmpreinte(E.get(memePhoto('p1b', 1)));
  ok(a.lectures.length === 6 && b.lectures.length === 6, 'six lectures par photo (entière + centre 70 % + quatre carrés)');
  ok(comparerPhotos([a], [b]).best <= 4, 'la même photo rehébergée est reconnue (distance ≤ 4)');
  const c = photoDepuisEmpreinte(E.get(photo('p2', 777)));
  ok(comparerPhotos([a], [c]).best > 12, 'deux photos différentes sont loin (distance > 12)');
  // un recadrage : image entière différente, UN carré central identique
  const d = photoDepuisEmpreinte(E.get(photo('p1c', 5555, { centreGraine: 1 })));
  ok(ham(a.lectures[0].d, d.lectures[0].d) > 12 && comparerPhotos([a], [d]).best <= 4, 'un recadrage est retrouvé par la lecture du centre');
  ok(bits('0'.repeat(63)) === null && bits('0'.repeat(64)) !== null, 'une empreinte illisible est ignorée, jamais une distance fausse');
}

console.log('2. Jamais la photo seule, jamais le titre seul');
{
  const F = [fiche(1, 'Jupe bleu marine taille M🔥🔥', [photo('j1', 11), photo('j2', 12), photo('j3', 13)], { taille: 'M / 38 / 10' })];
  const bon = annonce('a1', 'leboncoin', 'Jupe bleu marine taille M', [memePhoto('j1b', 11), memePhoto('j2b', 12), memePhoto('j3b', 13)], { taille: '38 - M' });
  const { d: d1 } = decisionDe(donneesDe(F, [bon]), 'Aa1');
  ok(d1?.decision === 'fusion_base', 'même photo (3 paires) + même titre + même taille → fusion');
  const etranger = annonce('a2', 'leboncoin', 'Matelas en mousse bleu 140×200', [memePhoto('j1c', 11), memePhoto('j2c', 12), memePhoto('j3c', 13)]);
  const { d: d2 } = decisionDe(donneesDe(F, [etranger]), 'Aa2');
  ok(d2?.decision === 'a_verifier', 'même photo mais titre étranger (jupe / matelas) → à vérifier, jamais une fusion');
  const titreSeul = annonce('a3', 'leboncoin', 'Jupe bleu marine taille M', [photo('x1', 901), photo('x2', 902)], { taille: '38 - M' });
  const { d: d3 } = decisionDe(donneesDe(F, [titreSeul]), 'Aa3');
  ok(d3?.decision === 'a_verifier', 'titre identique sans photo commune → à vérifier, jamais une fusion');
  const taille = annonce('a4', 'leboncoin', 'Jupe bleu marine taille XS', [memePhoto('j1d', 11), memePhoto('j2d', 12)], { taille: '34 - XS' });
  const { d: d4 } = decisionDe(donneesDe(F, [taille]), 'Aa4');
  ok(d4?.decision === 'a_verifier', 'même photo, taille contradictoire (M / XS) → à vérifier (Nico, point 2)');
  const e = evaluer(decisionDe(donneesDe(F, [bon]), 'Aa1').N[0], decisionDe(donneesDe(F, [bon]), 'Aa1').N[1]);
  ok(e.niveau === 'fort' && e.motif === 'photo_multi', 'l’arête forte porte son motif (photo_multi)');
}

console.log('3. Une seule annonce par plateforme et par article');
{
  const F = [fiche(1, 'Pantalon gris taille S', [photo('g1', 21), photo('g2', 22)], { taille: 'S / 36' })];
  const l1 = annonce('l1', 'leboncoin', 'Pantalon gris', [memePhoto('g1a', 21), memePhoto('g2a', 22)], { taille: '36 - S' });
  const l2 = annonce('l2', 'leboncoin', 'Pantalon gris taille S', [memePhoto('g1b', 21), memePhoto('g2b', 22)], { taille: '36 - S' });
  const { R, d: d1 } = decisionDe(donneesDe(F, [l1, l2]), 'Al1');
  ok(d1?.decision !== 'fusion_base' && R.dec.get('Al2')?.decision !== 'fusion_base', 'deux annonces Leboncoin de même photo : aucune n’est fusionnée (deux exemplaires possibles)');
  ok(R.doubles.length === 1, 'la paire part en « Annonce en double ? » (une question, pas une fusion)');
  const plan = planifier(donneesDe(F, [l1, l2]), ...Object.values({ N: R && decisionDe(donneesDe(F, [l1, l2]), 'Al1').N, R }), { mode: 'normal' });
  ok(plan.some((p) => p.type === 'annonce_en_double') && !plan.some((p) => p.type === 'attacher'), 'le plan pose la question, n’attache rien');
  // un vendeur de lots : trois annonces sur la même photo → rien (option sûre)
  const l3 = annonce('l3', 'leboncoin', 'Pantalon gris taille S', [memePhoto('g1c', 21), memePhoto('g2c', 22)], { taille: '36 - S' });
  const { R: R3 } = decisionDe(donneesDe(F, [l1, l2, l3]), 'Al1');
  ok(R3.doubles.length === 0, 'trois annonces sur la même photo (lots) : aucune question « en double »');
}

console.log('4. Les décisions de la personne sont définitives');
{
  const F = [fiche(1, 'Veste noire a boutons taille 38', [photo('v1', 31), photo('v2', 32)], { taille: 'M / 38' })];
  const a = annonce('b1', 'leboncoin', 'Veste noire a boutons taille 38', [memePhoto('v1a', 31), memePhoto('v2a', 32)], { taille: '38 - M', inventaire_id: '500', source: 'automatique', derniere_par: 'auto', derniere_decision: 'import' });
  const F2 = [...F, fiche(500, 'Veste noire a boutons taille 38', [memePhoto('v1b', 31)], { origine: 'releve_leboncoin', intact: true })];
  const refus = donneesDe(F2, [a], { doublons: [{ id: 'q1', garde: '1', absorbe: '500', statut: 'refusee', motif: 'faisceau', decide_par: 'utilisateur', source: 'releve', auto: false }] });
  const { R } = decisionDe(refus, 'Ab1');
  ok(R.find('Ab1') !== R.find('F1'), 'un « Non » de la personne : la même photo ne réunit plus jamais les deux');
  const plan = planifier(refus, decisionDe(refus, 'Ab1').N, R, { mode: 'reparation' });
  ok(!plan.some((p) => p.type === 'fusionner' || p.type === 'attacher'), 'la réparation ne rejuge pas un « Non »');
  const oui = donneesDe(F, [annonce('b2', 'beebs', 'Veste', [photo('zz', 4242)], { inventaire_id: '1', source: 'manuel', derniere_par: 'utilisateur', derniere_decision: 'attache' })]);
  const { R: R2 } = decisionDe(oui, 'Ab2');
  ok(R2.find('Ab2') === R2.find('F1'), 'un rattachement fait par la personne tient, même sans photo ni titre communs');
  const ign = donneesDe(F, [annonce('b3', 'beebs', 'Veste noire a boutons taille 38', [memePhoto('v1c', 31), memePhoto('v2c', 32)], { ignoree: true, ignoree_par_utilisateur: true })]);
  ok(construireNoeuds(ign, photosDe).length === 1, 'une annonce ignorée par la personne n’est jamais un nœud (point 5)');
}

console.log('5. Le plan : normal ne touche qu’une annonce sans article, la réparation rejuge l’automatique');
{
  const F = [fiche(1, 'Bonnet marron', [photo('bm1', 41), photo('bm2', 42)]), fiche(600, 'Bonnet marron', [memePhoto('bm1x', 41)], { origine: 'releve_leboncoin', intact: true })];
  const auto = annonce('c1', 'leboncoin', 'Bonnet marron', [memePhoto('bm1a', 41), memePhoto('bm2a', 42)], { inventaire_id: '600', source: 'automatique', derniere_par: 'auto', derniere_decision: 'import' });
  const neuve = annonce('c2', 'beebs', 'Bonnet marron', [memePhoto('bm1b', 41), memePhoto('bm2b', 42)]);
  const d = donneesDe(F, [auto, neuve]);
  const { N, R } = decisionDe(d, 'Ac2');
  const normal = planifier(d, N, R, { mode: 'normal' });
  ok(normal.some((p) => p.type === 'attacher' && p.annonce === 'c2' && p.fiche === '1'), 'normal : la Beebs sans article rejoint la fiche Vinted');
  ok(!normal.some((p) => p.type === 'fusionner'), 'normal : l’import automatique Leboncoin n’est pas rejugé (idempotence)');
  const rep = planifier(d, N, R, { mode: 'reparation' });
  ok(rep.some((p) => p.type === 'fusionner' && p.absorbe === '600' && p.garde === '1'), 'réparation : l’import automatique intact est fusionné dans la base (pointeur réversible)');
  ok(rep.findIndex((p) => p.type === 'fusionner') < rep.findIndex((p) => p.type === 'attacher'), 'les preuves d’abord, puis les rattachements, puis les créations');
  const seule = annonce('c3', 'opla', 'Vase en verre 30cm', [photo('vase', 4343)]);
  const d2 = donneesDe(F, [seule]); const { N: N2, R: R2 } = decisionDe(d2, 'Ac3');
  ok(planifier(d2, N2, R2, { mode: 'normal' }).some((p) => p.type === 'creer' && p.annonce === 'c3'), 'aucun candidat → créée (une carte)');
  const { decisions, bilan } = passe(d2, E, { mode: 'normal' });
  ok(decisions.length === 1 && bilan.plan.creer === 1 && urlsDe(d2).includes('https://cdn.test/vase.jpg'), 'passe() : données → plan, et les photos à empreinter');
  ok(manquantesDe(['https://cdn.test/vase.jpg', 'https://cdn.test/inconnue.jpg'], E).length === 1, 'manquantesDe : seule la photo sans empreinte complète est demandée');
}

console.log('6. La chaîne serveur : migration, fonction edge, empreintes');
{
  const mig = lire('supabase/migrations/20261008020000_multi_synchro_rapprochement_v3.sql');
  const fn = lire('supabase/functions/rapprochement/index.ts');
  const emp = lire('supabase/functions/empreintes-urls/index.ts');
  const img = lire('supabase/functions/_shared/empreinte-image.ts');
  ok(/FUNCTION public\.rapprochement_v3_lire\(p_user uuid\)/.test(mig) && /FUNCTION public\.rapprochement_v3_appliquer\(p_user uuid, p_decisions jsonb/.test(mig), 'la migration définit lire et appliquer');
  ok(/pg_try_advisory_xact_lock\(hashtext\('rapprochement:'/.test(mig), 'appliquer : un seul passage à la fois par compte (verrou)');
  ok(/rapprochement_v3_fiche_intacte/.test(mig) && /fusionner_article_modifie/.test(mig), 'une fusion ne touche qu’un article intact ; un article modifié reçoit une question');
  ok(/attacher_deux_exemplaires/.test(mig) && /fusionner_deux_exemplaires/.test(mig), 'la base refuse deux annonces vivantes d’une plateforme sur un article');
  ok(/'annonce_en_double'/.test(mig) && /rapprochement_v3_marquer/.test(mig), '« Annonce en double ? » : question dédiée + marqueur à vérifier (jamais une fusion)');
  ok(/REVOKE ALL ON FUNCTION public\.rapprochement_v3_appliquer[^;]*FROM PUBLIC, anon, authenticated/.test(mig), 'appliquer n’est pas appelable par un client');
  ok(/'reason', 'recent'/.test(mig) && /rapprochement_relancer\(v_user\)/.test(mig), '« Synchroniser » pendant la cadence : « recent », pas un refus, et le rangement repart');
  ok(/ebay-releve-api/.test(mig) && /v_api THEN/.test(mig), 'eBay relié par l’API : relevé réveillé tout de suite par l’API');
  ok(/rpc\("rapprochement_v3_lire"/.test(fn) && /rpc\("rapprochement_v3_appliquer"/.test(fn) && /empreintes-urls/.test(fn), 'la fonction edge lit, fait empreinter, applique');
  ok(/manquantes\.length && reste\(\) <= 25_000/.test(fn), 'plus le temps pour les photos → relance, jamais un classement sans elles');
  ok(/variantesDepuisRgba/.test(img) && /variantes: e\.variantes/.test(emp) && /not\("variantes", "is", null\)/.test(emp), 'empreintes-urls calcule et garde les lectures du centre ; une ligne sans variantes est recalculée');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/compte_ebay_api/.test(gpj) && /c\.platform !== "ebay"/.test(gpj), 'get-pending-jobs : jamais un relevé eBay à l’extension quand l’API est reliée');
}

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
