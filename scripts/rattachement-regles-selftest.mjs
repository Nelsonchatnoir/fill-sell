// selftest:rattachement-regles — (05/11, règles de Nico sur le rattachement, toutes plateformes) contrôle STATIQUE de la
// migration 20261105190000_rattachement_regles et de son INVERSE (aucune base) :
//   (a) une fiche unitaire ne porte jamais deux annonces de la même plateforme (inventaire_fusionner_pour, motif nommé,
//       question laissée ouverte avec sa raison par inventaire_doublon_decider) ;
//   (b) le chemin automatique du moteur v3 ne signe plus « utilisateur:… » et « manuel » n'est posé que sur un geste ;
//   (c) un retrait de copie n'est jamais armé sur un rattachement automatique non confirmé (rattachement_confirme) : la
//       copie devient la question « Déjà vendu ? » ;
//   (d) plus de question « photo proche » sur un titre en série (titre_en_serie, releve_poser_question).
// Décisions de Nico du 05/11 soir : (a) une PHOTO IDENTIQUE reste une preuve (rattachement_confirme l'accepte, comme
// retrait_job_prouve) ; (b) P16 gardée ; (c) « Annonce en double ? » → « Oui » refusé sur une fiche unitaire, motif
// lisible ; (d) le moteur (moteur.js) ne rattache plus automatiquement un titre en série ni deux titres sans mot commun.
// La preuve de bout en bout (Postgres jetable, AVANT / APRÈS / INVERSE) : scripts/preuve-rattachement-regles.mjs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (cond, msg, detail = '') => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };

const MIG = lire('supabase/migrations/20261105190000_rattachement_regles.sql');
const INV = lire('supabase/rollbacks/20261105190000_rattachement_regles_INVERSE.sql');
const PROD = {
  inventaire_fusionner_pour: '9bcfcd661b1561731fe2ab33e7a5a136',
  inventaire_doublon_decider: '3a9d7674e6c14d8df66e65063a1fff51',
  rapprochement_v3_appliquer: 'f417a5e0eead76135922c03d6c05b494',
  armer_retrait_job_pour: '0985562bc7f9d611dbf5cf520816d3d9',
  armer_retraits_copies: '15e05ec507246ffe51dbccc69b79b9c8',
  poser_questions_copies_non_prouvees: '3f69b70226669e19fb219574056bceb3',
  releve_poser_question: 'f954fea62a0dccac94d011e41ded1290',
};
// Le texte d'une fonction (CREATE … jusqu'au $function$ qui ferme le corps).
const fonction = (sql, nom) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return null;
  const j = sql.indexOf('AS $function$', i);
  const k = sql.indexOf('$function$', j + 'AS $function$'.length);
  return j < 0 || k < 0 ? null : sql.slice(i, k + '$function$'.length);
};
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const sansCommentaires = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

console.log('1. L\'INVERSE porte les définitions de PROD mot pour mot (md5 de pg_get_functiondef, lus le 05/11)');
for (const [nom, m] of Object.entries(PROD)) {
  const f = fonction(INV, nom);
  ok(!!f && md5(f + '\n') === m, `${nom} : md5 ${m}`, f ? md5(f + '\n') : 'absente');
  ok(MIG.includes(m) && INV.includes(m), `${nom} : md5 de départ écrit en tête de la migration et de l'inverse`);
}
ok(/DROP FUNCTION IF EXISTS public\.rattachement_confirme\(uuid\);/.test(INV) && /DROP FUNCTION IF EXISTS public\.titre_en_serie\(uuid, text\);/.test(INV),
  'l\'inverse retire les deux fonctions neuves');
ok(/^BEGIN;$/m.test(MIG) && /^COMMIT;$/m.test(MIG) && /^BEGIN;$/m.test(INV) && /^COMMIT;$/m.test(INV), 'migration et inverse : une seule transaction');

console.log('\n2. La migration réécrit ces 7 fonctions depuis la prod, en crée 2, et rien d\'autre');
const creees = [...MIG.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/g)].map((x) => x[1]).sort();
ok(JSON.stringify(creees) === JSON.stringify([...Object.keys(PROD), 'rattachement_confirme', 'titre_en_serie'].sort()), `fonctions : ${creees.join(', ')}`);
for (const nom of Object.keys(PROD)) {
  const a = fonction(INV, nom), b = fonction(MIG, nom);
  ok(!!b && b !== a, `${nom} : réécrite`);
  // Tout le texte de prod reste, hors des lignes remplacées : la réécriture part bien de la prod.
  const lignesProd = a.split('\n'), lignesMig = new Set(b.split('\n'));
  const gardees = lignesProd.filter((l) => lignesMig.has(l)).length;
  ok(gardees / lignesProd.length > 0.9, `${nom} : ${gardees}/${lignesProd.length} lignes de prod gardées telles quelles`);
}
ok(!/CREATE (OR REPLACE )?(TABLE|TRIGGER|INDEX|VIEW)|ALTER TABLE|\bUPDATE\s+public\.|\bDELETE\s+FROM|cron\.schedule/i.test(sansCommentaires(MIG).replace(/\$function\$[\s\S]*?\$function\$/g, '')),
  'hors des corps de fonction : aucune table, déclencheur, index, donnée ni cron touchés');
ok(!/FUNCTION public\.retrait_job_prouve\(/.test(MIG), 'retrait_job_prouve n\'est PAS réécrite (ventes, relevés, messagerie inchangés)');
ok(/REVOKE EXECUTE ON FUNCTION public\.rattachement_confirme\(uuid\) FROM PUBLIC, anon, authenticated;/.test(MIG)
  && /REVOKE EXECUTE ON FUNCTION public\.titre_en_serie\(uuid, text\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  'les deux neuves : jamais exécutables par anon ni authenticated (régime du 24/10)');

console.log('\n3. (a) Une fiche unitaire ne porte jamais deux annonces de la même plateforme');
const ifp = fonction(MIG, 'inventaire_fusionner_pour');
const blocA = ifp.slice(ifp.indexOf('IF COALESCE(g.quantite, 1) <= 1 THEN'), ifp.indexOf('SELECT jsonb_agg(id) INTO v_ids FROM ventes'));
ok(blocA.length > 200 && ifp.indexOf('IF COALESCE(g.quantite, 1) <= 1 THEN') < ifp.indexOf('UPDATE ventes SET inventaire_id'),
  'la garde passe AVANT tout déplacement (ventes, dépôts, annonces) : refusée = rien d\'écrit');
ok(/'reason', 'deux_annonces_meme_plateforme', 'plateformes', v_conflits/.test(blocA) && /deux exemplaires/.test(blocA), 'motif nommé, plateformes et message lisible');
ok(/ap\.disparu_le IS NULL AND ap\.retiree_le IS NULL AND ap\.ignoree_le IS NULL/.test(blocA), 'annonce vivante : ni disparue, ni retirée, ni ignorée');
ok(/j\.status = 'published'/.test(blocA) && /NOT EXISTS \(SELECT 1 FROM annonces_plateforme x WHERE x\.job_id = j\.id\)/.test(blocA) && /j\.platform <> 'vinted'/.test(blocA),
  'dépôt publié sans annonce relevée (hors Vinted) compté une fois');
ok(/g\.disparu_le IS NULL/.test(blocA) && /vinted_remise_en_ligne\(g\.id, a\.id\)/.test(blocA) && /vinted_retraits_successifs\(g\.id, a\.id\)/.test(blocA),
  'Vinted : l\'identité en ligne ; l\'échange d\'une remise en ligne n\'est pas un doublon');
ok(/rapprochement_republication_prouvee\(x\.annonce, y\.annonce\)/.test(blocA), 'seule exception : la republication PROUVÉE (P16, 15/10 ; gardée le 05/11 soir, b)');
ok(/'message', 'Cette fiche a déjà une annonce '/.test(blocA) && /Rien n''a été regroupé\.'\);/.test(blocA),
  'décision c : le motif lisible commence par « Cette fiche a déjà une annonce <plateforme> en ligne… » (lu tel quel par l\'écran Doublons)');
const idd = fonction(MIG, 'inventaire_doublon_decider');
ok((idd.match(/'fusion_refusee', jsonb_build_object\(/g) ?? []).length === 2 && (idd.match(/WHERE id = d\.id AND statut = 'proposee';/g) ?? []).length === 2,
  'inventaire_doublon_decider : sur ce refus, la question reste « proposee » et porte sa raison (les deux chemins du « Oui »)');

console.log('\n4. (b) « utilisateur » et « manuel » seulement sur un vrai geste');
const v3 = fonction(MIG, 'rapprochement_v3_appliquer');
ok(!/'utilisateur:/.test(v3), 'rapprochement_v3_appliquer : plus aucune étiquette « utilisateur:… »');
const marques = [...new Set([...v3.matchAll(/'(auto:photo_rapprochement_v3[a-z_]* \(photo_identique\))'/g)].map((x) => x[1]))].sort();
ok(JSON.stringify(marques) === JSON.stringify(['auto:photo_rapprochement_v3 (photo_identique)', 'auto:photo_rapprochement_v3_main (photo_identique)', 'auto:photo_rapprochement_v3_remise (photo_identique)']),
  `ses trois fusions automatiques : ${marques.join(', ')}`);
for (const m of marques) ok(ifp.includes(`'${m}'`), `inventaire_fusionner_pour accepte « ${m} » (et seulement ces marques automatiques en plus)`);
ok(/v_geste boolean := COALESCE\(p_par, ''\) = 'utilisateur' OR COALESCE\(p_par, ''\) LIKE 'utilisateur \(%';/.test(ifp),
  'geste = « utilisateur » (fusion à la main) ou « utilisateur (…) » (son « Oui ») — jamais « utilisateur:… »');
ok(/source_rapprochement = CASE WHEN v_geste THEN 'manuel' ELSE source_rapprochement END/.test(ifp) && !/source_rapprochement = 'manuel'/.test(sansCommentaires(ifp)),
  '« manuel » seulement sur le geste ; une fusion automatique laisse la source d\'avant');
// retrait_job_prouve (non réécrite, dernière définition du dépôt) reconnaît la marque neuve comme l'ancienne.
const fichiers = fs.readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let rjp = null;
for (const f of fichiers) { const m = lire(`supabase/migrations/${f}`).match(/CREATE OR REPLACE FUNCTION public\.retrait_job_prouve\(p_job uuid\)[\s\S]*?\$function\$;/g); if (m) rjp = m[m.length - 1]; }
const likeVersRegex = (motif) => new RegExp('^' + motif.replace(/\\(.)|([%_])|([.*+?^${}()|[\]\\])/g,
  (x, echappe, joker, special) => echappe ? echappe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : joker === '%' ? '.*' : joker === '_' ? '.' : '\\' + special) + '$', 's');
const exclus = [...(rjp?.match(/FROM inventaire_fusions f([\s\S]*?)\? j\.id::text\)/)?.[1] ?? '').matchAll(/COALESCE\(f\.par, ''\) NOT LIKE '([^']*)'/g)].map((x) => likeVersRegex(x[1]));
const preuveRjp = (par) => exclus.some((re) => re.test(par));
ok(exclus.length === 2, 'retrait_job_prouve (dernière définition du dépôt) : ses deux exclusions de fusion relues');
for (const m of marques) ok(preuveRjp(m) && preuveRjp(m.replace(/^auto:(\S+) \(photo_identique\)$/, 'utilisateur:$1')),
  `retrait_job_prouve : « ${m} » vaut preuve comme l'ancienne marque → ventes / relevés inchangés`);

console.log('\n5. (c) Jamais un retrait sur un rattachement automatique non confirmé');
const rc = fonction(MIG, 'rattachement_confirme');
const listeGestes = rc.match(/COALESCE\(f\.par, ''\) NOT IN \((.*)\)\s*$/m)?.[1] ?? '';
const gestes = [...listeGestes.matchAll(/'([^']*)'/g)].map((x) => x[1]);
// Les clauses NOT LIKE de la fusion (identifiant, photo) → expressions régulières (LIKE, échappement \).
const likesRc = [...sansCommentaires(rc).matchAll(/COALESCE\(f\.par, ''\) NOT LIKE '([^']*)'/g)].map((x) => x[1]);
const reRc = likesRc.map(likeVersRegex);
const fusionAuto = (par) => !gestes.includes(par) && !reRc.some((re) => re.test(par));
ok(JSON.stringify(gestes) === JSON.stringify(['utilisateur', 'utilisateur (doublon proposé)']) && likesRc.includes('regle:identifiant%'),
  'fusion de la personne = « utilisateur » ou « utilisateur (doublon proposé) » ; « regle:identifiant… » = un identifiant');
ok(JSON.stringify(likesRc) === JSON.stringify(['regle:identifiant%', 'utilisateur:photo\\_%', '%photo\\_identique)']),
  `décision a : la photo identique est une preuve — clauses ${likesRc.join(' · ')}`);
// Les `par` RÉELS relevés en prod le 05/11 soir (inventaire_fusions, 20 valeurs) et les trois marques neuves du moteur.
const PHOTO = ['utilisateur:photo_rapprochement_v3', 'utilisateur:photo_rapprochement_v3_remise', 'utilisateur:photo_go_nico_3009',
  'utilisateur:photo_rattrapage_0710', 'utilisateur:photo_auto', 'utilisateur:photo_rapprochement_v3_main', 'utilisateur:photo_go_nico_2410',
  'utilisateur:photo_go_nico_0910', 'auto (doublon certain : photo_identique)', 'recensement 25/09 : remise en ligne Vinted (photo_identique)',
  'recensement 25/09 : doublon certain (photo_identique)', 'recensement 25/09 : remise en ligne Vinted, titre voisin (photo_identique)', ...marques];
const AUTO = ['ia (doublon proposé)', 'auto (doublon certain : titre_exact_prix_egal)',
  'recensement 25/09 : remise en ligne Vinted (remise_en_ligne_titre_identique)',
  'support (check du 25/09 : doublons créés par le relevé sur de fausses ventes)',
  // chemins automatiques à venir, jamais une preuve
  'auto:titre_rapprochement_v3', 'auto (doublon certain : photo_identique_proche)', 'utilisateur:titre_auto', ''];
const GESTES = ['utilisateur', 'utilisateur (doublon proposé)', 'regle:identifiant_avant_fiche', 'regle:identifiant_avant_fiche (vente en double, décision de Nico 27/10)'];
for (const p of PHOTO) ok(!fusionAuto(p) && preuveRjp(p), `photo identique = confirmée (comme retrait_job_prouve) : ${p}`);
for (const p of AUTO) ok(fusionAuto(p), `automatique sans photo identique : ${p || '(vide)'}`);
for (const p of GESTES) ok(!fusionAuto(p), `confirmée  : ${p}`);
// Mesure du 05/11 soir : toute fusion réelle refusée par rattachement_confirme l'est déjà par retrait_job_prouve.
for (const p of AUTO.slice(0, 4)) ok(!preuveRjp(p), `déjà refusée par retrait_job_prouve (aucun retrait ne change de chemin) : ${p}`);
ok(/\{rattachement,par\}', ''\) <> 'auto'/.test(rc) && /\{rattachement,import\}', ''\) = 'true'/.test(rc)
  && /\{rattachement,motif\}', ''\) IN \('identifiant_depot_clos', 'photo_identique'\)/.test(rc),
  'lien d\'origine : « auto » non confirmé, sauf import (fiche née de l\'annonce), identifiant ou PHOTO IDENTIQUE (décision a)');
ok(/IN \('identifiant_depot_clos', 'photo_identique'\)/.test(rjp ?? ''), 'retrait_job_prouve accepte les mêmes motifs de rattachement (photo_identique, identifiant)');
ok(/SELECT \(COALESCE\(j\.platform_fields ->> 'source', ''\) <> 'releve' AND \(j\.platform_fields -> 'rattachement'\) IS NULL\)\n\s+OR \(/.test(rc),
  'limite voulue : le dépôt de FillSell (ni relevé, ni rattachement) reste confirmé — sans annonce relevée, il ne pourrait pas devenir la question');
ok(/meme_article_confirme/.test(rc) && /\{rattachement,confirme,le\}/.test(rc) && /'-infinity'::timestamptz/.test(rc),
  '« Oui, la retirer » confirme ; une fusion automatique POSTÉRIEURE la rend de nouveau non confirmée ; date illisible = jamais d\'erreur');
const arj = fonction(MIG, 'armer_retrait_job_pour');
ok(/if not coalesce\(p_preuve_geste, false\) and not public\.rattachement_confirme\(j\.id\) then/.test(arj)
  && arj.indexOf('rattachement_confirme') > arj.indexOf('if not public.retrait_job_prouve(j.id)')
  && arj.indexOf('rattachement_confirme') < arj.indexOf('insert into public.cross_post_jobs'),
  'armer_retrait_job_pour : refus avant toute écriture, sauf le geste de la personne (p_preuve_geste)');
ok(/'retrait_refuse_rattachement_automatique'/.test(arj), 'le refus est tracé (usage_logs)');
const arc = fonction(MIG, 'armer_retraits_copies');
ok((arc.match(/and public\.rattachement_confirme\(j\.id\)/g) ?? []).length === 2, 'armer_retraits_copies : les deux boucles (dépôts publiés, Beebs « jamais en ligne ») ne prennent que les confirmés');
const pq = fonction(MIG, 'poser_questions_copies_non_prouvees');
ok(/OR NOT public\.rattachement_confirme\(j\.id\)\)/.test(pq) && /'rattachement_automatique', NOT public\.rattachement_confirme\(j\.id\)/.test(pq),
  'poser_questions_copies_non_prouvees : la copie non confirmée devient « Déjà vendu ? » (marquée rattachement_automatique)');
ok(/armer_retrait_job_pour\(v_job, 'copie_confirmee_vendue', interval '0', true\)/.test(idd),
  'le « Oui, la retirer » de la question arme le retrait par le geste (inchangé)');

console.log('\n6. (d) Plus de « photo proche » sur un titre en série');
const tes = fonction(MIG, 'titre_en_serie');
ok(/GROUP BY ap\.platform HAVING count\(\*\) >= 3/.test(tes), 'série = ≥ 3 annonces vivantes d\'UNE plateforme (un objet publié partout n\'est pas une série)');
ok(/vinted_item_id/.test(tes) && /\) >= 3\);/.test(tes), 'ou ≥ 3 fiches Vinted vivantes au même titre');
ok((tes.match(/rapprochement_texte_norm/g) ?? []).length >= 3 && /t\.n <> ''/.test(tes), 'titre normalisé comme le moteur (rapprochement_texte_norm) ; jamais un titre vide');
const rpq = fonction(MIG, 'releve_poser_question');
ok(/IF p_motif = 'photo_proche' THEN/.test(rpq) && /titre_en_serie\(p_user, v_t1\) OR titre_en_serie\(p_user, v_t2\)/.test(rpq) && /RETURN false;\n    END IF;\n  END IF;/.test(rpq),
  'releve_poser_question : « photo proche » + un titre en série → aucune question');
ok(rpq.indexOf("IF p_motif = 'photo_proche'") > rpq.indexOf('p_nouvelle AND user_id = p_user'), 'après les gardes d\'existence (aucun calcul inutile)');
ok(/'question_photo_proche_ecartee'/.test(rpq) && /interval '1 day'/.test(rpq), 'trace usage_logs, une par paire et par jour');
// La normalisation SQL est celle du moteur (normCommeLaBase) : quelques titres d'assopmfrance.
const { normCommeLaBase } = await import('../supabase/functions/_shared/rapprochement/moteur.js');
const sqlNorm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'o').replace(/Œ/g, 'O').replace(/æ/g, 'a').replace(/Æ/g, 'A')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const t of ['Ecusson pm', 'Écusson  PM', 'ECUSSON-pm !']) ok(normCommeLaBase(t) === 'ecusson pm' && sqlNorm(t) === 'ecusson pm', `« ${t} » → « ecusson pm » (moteur et base)`);

console.log('\n7. Décision d (05/11 soir) : le moteur ne rattache jamais automatiquement un titre en série ni deux titres sans mot commun');
{
  const M = await import('../supabase/functions/_shared/rapprochement/moteur.js');
  const { photoDepuisEmpreinte } = await import('../supabase/functions/_shared/rapprochement/photos.js');
  // Des empreintes fabriquées (comme moteur-rattachement) : une « photo » = une graine ; `flips` bits d'écart.
  const bitsDe = (graine, flips = 0) => {
    let x = 0x9e3779b9 ^ graine; const out = [];
    for (let i = 0; i < 64; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 16) & 1); }
    for (let i = 0; i < flips; i++) out[(i * 7) % 64] ^= 1;
    return out.join('');
  };
  const E = new Map();
  const photo = (nom, graine, flips = 0) => {
    const u = `https://cdn.test/${nom}.jpg`;
    E.set(u, { url: u, dhash: bitsDe(graine, flips), phash: bitsDe(graine + 1000, flips),
      variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k, i) => [k, [bitsDe(graine + 10 * (i + 1), flips), bitsDe(graine + 10 * (i + 1) + 1000, flips)]])) });
    return u;
  };
  const photosDe = (urls) => urls.map((u) => photoDepuisEmpreinte(E.get(u))).filter(Boolean);
  const fiche = (id, titre, photos) => ({ id: String(id), titre, prix: 5, statut: 'stock', origine: 'vinted_sync', photos, created_at: '2026-10-07T10:00:00Z',
    quantite: 1, vinted_item_id: String(900000 + id), intact: true });
  const annonce = (id, platform, titre, photos) => ({ id: String(id), platform, listing_id: String(id), url: `https://${platform}.test/${id}`, titre, prix: 5,
    photo_url: photos[0], photos, inventaire_id: null, run_id: 'r1', en_ligne: true, geste: true });
  const jouer = (fiches, annonces, x, y) => {
    const d = { fiches, annonces, fusions: [], doublons: [], dette_beebs: false, import_ouvert: true, geste_recent: true };
    const N = M.construireNoeuds(d, photosDe); M.pesee(N);
    const e = M.evaluer(N.find((n) => n.id === x), N.find((n) => n.id === y));
    const R = M.rapprocher(N, { forces: M.forcesDe(d) });
    return { e, decision: R.dec.get(y)?.decision, N };
  };
  const serie = ['Ecusson pm', 'Ecusson pm', 'Ecusson pm'];
  // A — photo identique (3 photos) ET mots communs : rattachée automatiquement, comme avant.
  const A = jouer([fiche(1, 'Jupe bleu marine taille M', [photo('j1', 11), photo('j2', 12), photo('j3', 13)])],
    [annonce('a1', 'leboncoin', 'Jupe bleu marine taille M', [photo('j1b', 11, 2), photo('j2b', 12, 2), photo('j3b', 13, 2)])], 'F1', 'Aa1');
  ok(A.e.niveau === 'fort' && A.e.motif === 'photo_multi' && A.decision === 'fusion_base', `photo identique + mot commun → automatique comme avant (${A.e.motif} → ${A.decision})`);
  // B — même photo, mot commun, mais un titre EN SÉRIE (3 annonces Leboncoin « Ecusson pm ») : la question.
  const B = jouer([fiche(2, 'Ecusson police municipale Aubagne', [photo('e1', 21), photo('e2', 22)])],
    serie.map((t, i) => annonce(`b${i + 1}`, 'leboncoin', t, i === 0 ? [photo('e1b', 21, 2), photo('e2b', 22, 2)] : [photo(`x${i}a`, 300 + i), photo(`x${i}b`, 310 + i)])), 'F2', 'Ab1');
  ok(B.N.find((n) => n.id === 'Ab1').serie === true && B.N.find((n) => n.id === 'F2').serie === false, 'titre en série : ≥ 3 nœuds d\'UNE plateforme au même titre normalisé');
  ok(B.e.niveau === 'doute' && B.e.motif === 'photo_multi_titre_en_serie' && B.decision !== 'fusion_base', `titre en série + photo identique → jamais automatique (${B.e.motif} → ${B.decision})`);
  // C — même photo, AUCUN mot commun (pull / sweat : même famille, accord faible) : la question.
  const C = jouer([fiche(3, 'Pull Zara', [photo('p1', 31), photo('p2', 32)])], [annonce('c1', 'leboncoin', 'Sweat Kiabi', [photo('p1b', 31, 2), photo('p2b', 32, 2)])], 'F3', 'Ac1');
  ok(C.e.sim.communs === 0 && C.e.niveau === 'doute' && C.e.motif === 'photo_multi_titres_sans_mot_commun' && C.decision !== 'fusion_base',
    `aucun mot commun + photo identique → jamais automatique (${C.e.motif} → ${C.decision})`);
  // D — photo seulement PROCHE + titre en série : pas même une question (comme titre_en_serie en base).
  const D = jouer([fiche(4, 'Ecusson brodé Albator', [photo('d1', 41)])],
    serie.map((t, i) => annonce(`d${i + 1}`, 'leboncoin', t, [i === 0 ? photo('d1b', 41, 10) : photo(`y${i}`, 400 + i)])), 'F4', 'Ad1');
  ok(D.e.photo === 'proche' && D.e.niveau === 'rien', `photo proche + titre en série → rien (ni rattachement ni question) — niveau « ${D.e.niveau} »`);
  // D' — photo PROCHE, titres uniques : la question reste.
  const D2 = jouer([fiche(5, 'Ecusson brodé Albator', [photo('f1', 51)])], [annonce('f1', 'leboncoin', 'Ecusson pompier', [photo('f1b', 51, 10)])], 'F5', 'Af1');
  ok(D2.e.photo === 'proche' && D2.e.niveau === 'doute' && D2.e.motif === 'photo_proche', 'témoin : photo proche, titres uniques → le doute (la question) comme avant');
  // Par plateforme : un objet publié sur 3 plateformes (3 fois son titre) n'est pas une série.
  const P = jouer([fiche(6, 'Robe Sézane Gaby', [photo('r1', 61), photo('r2', 62)])],
    ['leboncoin', 'beebs', 'ebay'].map((pf, i) => annonce(`r${i + 1}`, pf, 'Robe Sézane Gaby', [photo(`r1${pf}`, 61, 2), photo(`r2${pf}`, 62, 2)])), 'F6', 'Ar1');
  ok(P.N.every((n) => n.serie === false) && P.e.niveau === 'fort', 'un même titre sur trois plateformes n\'est pas une série : le rattachement automatique reste');
}

console.log(ko ? `\n✗ rattachement-regles : ${ko} échec(s) sur ${n}` : `\n✓ rattachement-regles : ${n}/${n}`);
process.exit(ko ? 1 : 0);
