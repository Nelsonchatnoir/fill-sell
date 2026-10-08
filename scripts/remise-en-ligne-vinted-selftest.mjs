// ═══════════════════════════════════════════════════════════════════════════
// LA REMISE EN LIGNE VINTED (08/10/2026 soir, cas Bebertdeals)
// ═══════════════════════════════════════════════════════════════════════════
// Une annonce Vinted supprimée puis republiée par la personne sous un nouvel
// identifiant : la nouvelle fiche se fond dans la plus ancienne (l'identité
// Vinted vivante la suit) quand les photos sont les mêmes, le titre s'accorde,
// rien ne se contredit et aucun rival n'existe ; un doute → la question.
// Ce test ÉCHOUE si :
//   · le moteur fond deux annonces en ligne ensemble (deux exemplaires), sur la
//     photo seule, sur le titre seul, malgré un conflit de taille, malgré un
//     autre exemplaire en ligne ou vendu, entre deux boutiques, une ancienne
//     vendue, ou une quantité > 1 ;
//   · il garde la nouvelle fiche au lieu de la plus ancienne, ou oublie un maillon ;
//   · la règle change une seule autre décision du moteur v3 ;
//   · elle s'allume sans que la lecture de la base le dise ;
//   · la migration perd sa vérification md5, ses drapeaux à 0, la garde de vente
//     « armée si absente », le passage libre d'une vente prouvée « sold », ses
//     gardes de base, ou la fonction edge ne transmet pas la portée ;
//   · avec --prod : la preuve en transaction annulée (scripts/reparations/
//     20261008_preuve_remise_en_ligne.mjs) n'est pas verte.
//
//   npm run selftest:remise-en-ligne-vinted
//   node scripts/remise-en-ligne-vinted-selftest.mjs --prod
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passe } from '../supabase/functions/_shared/rapprochement/passe.js';
import { remisesEnLigne, etatVinted, memeAnnonce } from '../supabase/functions/_shared/rapprochement/remises-en-ligne.js';
import { construireNoeuds } from '../supabase/functions/_shared/rapprochement/moteur.js';
import { photoDepuisEmpreinte } from '../supabase/functions/_shared/rapprochement/photos.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── des empreintes fabriquées : même graine = même photo ; flips = photo voisine
const bitsDe = (graine, flips = 0) => {
  let x = 0x9e3779b9 ^ graine; const out = [];
  for (let i = 0; i < 64; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 16) & 1); }
  for (let i = 0; i < flips; i++) out[(i * 7) % 64] ^= 1;
  return out.join('');
};
const E = new Map();
let n = 0;
const photo = (graine, flips = 0) => {
  const url = `https://cdn.test/p${n++}.jpg`;
  E.set(url, { url, dhash: bitsDe(graine, flips), phash: bitsDe(graine + 1000, flips),
    variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k, i) => [k, [bitsDe(graine + 10 * (i + 1), flips), bitsDe(graine + 10 * (i + 1) + 1000, flips)]])) });
  return url;
};
// une annonce RE-téléversée : les mêmes images, de nouvelles adresses
const P = (g) => [photo(g), photo(g + 1), photo(g + 2)];
const J = (j) => new Date(Date.parse('2026-10-08T17:00:00Z') - j * 86400e3).toISOString();
const RELEVE = J(0.05); // le dernier relevé complet de la boutique
// une fiche du dressing : vu1 / vuN en jours avant le 08/10 17:00
const vin = (id, titre, photos, o = {}) => ({ id: String(id), titre, prix: 20, statut: o.statut ?? 'stock', origine: 'vinted_sync', marque: null, taille: o.taille ?? null,
  photos, a_verifier: false, a_verifier_auto: false, created_at: J(o.vu1 ?? 0.04), quantite: o.quantite ?? 1, vinted_item_id: String(900000 + Number(id)),
  vinted_status: o.vs ?? 'active', disparu_le: o.disparu ?? null, first_seen_at: J(o.vu1 ?? 0.04), last_synced_at: J(o.vuN ?? 0.04), vinted_account_id: o.acc ?? 'b1' });
const ancienne = (id, titre, photos, o = {}) => vin(id, titre, photos, { vu1: 20, vuN: 15, disparu: J(14), ...o });
const d = (fiches, o = {}) => ({ fiches, annonces: o.annonces ?? [], fusions: [], doublons: [], dette_beebs: false, import_ouvert: true, geste_recent: true,
  fiches_main_actif: true, fiches_main_a_juger: [], vinted_a_juger: [], remise_en_ligne_actif: o.actif ?? true,
  vinted_nouvelles: o.nouvelles ?? fiches.filter((f) => f.statut === 'stock' && f.vinted_status === 'active' && !f.disparu_le && Date.parse(f.first_seen_at) > Date.parse(J(1))).map((f) => f.id),
  vinted_releves_complets: { b1: RELEVE, b2: RELEVE } });
const plan = (x, remises = 'nouvelles') => passe(x, E, { mode: 'normal', remises }).decisions.filter((y) => y.type.startsWith('remise_en_ligne'));
const fusion = (ds) => ds.find((x) => x.type === 'remise_en_ligne');
const questions = (ds) => ds.filter((x) => x.type === 'remise_en_ligne_a_verifier');
const T = 'Jean Levi\'s 501 Vintage W34 L32 Bleu Stonewash (A177)';

console.log('1. La chaîne : l\'origine gardée, la nouvelle et l\'intermédiaire s\'y fondent');
{
  const A = ancienne(1, T, P(100), { taille: 'W34 | FR 44' });
  const M = vin(2, T, P(100), { vu1: 13, vuN: 8, taille: 'W34 | FR 44' }); // jamais datée disparue, absente du dernier relevé complet
  const H = vin(3, 'Jean Levi\'s 501 Vintage W34 L32 Bleu • Style Workwear • T44 FR • (A177)', P(100), { taille: 'W34 | FR 44' });
  const f = fusion(plan(d([A, M, H])));
  ok(f && f.garde === '1' && f.absorbe === '3' && JSON.stringify(f.chaine) === '["2"]', 'remise en ligne : garde = la plus ancienne, absorbe = la nouvelle, chaîne = l\'intermédiaire');
  ok(f?.preuve?.regle === 'rapprochement_v3' && f?.preuve?.portee === 'remise_en_ligne', 'la décision porte sa règle');
  ok(etatVinted(M, { b1: RELEVE }) === 'partie' && etatVinted(H, { b1: RELEVE }) === 'en_ligne' && etatVinted(A, { b1: RELEVE }) === 'partie', 'états : partie (datée ou absente du relevé complet), en ligne');
  ok(plan(d([A, M, H], { actif: false })).length === 0, 'inerte tant que la lecture ne rend pas remise_en_ligne_actif');
  ok(plan(d([A, M, H], { nouvelles: [] })).length === 0, 'passe normale : seules les fiches nées depuis la dernière passe sont jugées');
  ok(fusion(plan(d([A, M, H], { actif: false, nouvelles: [] }), 'toutes'))?.garde === '1', 'portée « toutes » (rattrapage) : le stock existant est jugé');
}

console.log('2. Deux exemplaires ne se fondent jamais');
{
  const A = ancienne(11, T, P(200));
  const H = vin(12, T, P(200));
  // Y : même article, revue APRÈS l'apparition de H (en ligne en même temps)
  const Y = vin(13, T, P(200), { vu1: 10, vuN: 0.03, disparu: J(0.02) });
  ok(!fusion(plan(d([Y, H]))), 'en ligne ensemble (revue après l\'apparition de la nouvelle) : jamais une remise en ligne');
  const qs = questions(plan(d([A, Y, H])));
  ok(!fusion(plan(d([A, Y, H]))) && qs.length === 1 && /ensemble_en_ligne/.test(qs[0].motif), 'une chaîne ET un exemplaire en ligne en même temps : la question');
  const V = vin(14, T, P(200), { vu1: 3, vuN: 0.04 }); // un autre exemplaire EN LIGNE, mêmes photos
  const q2 = questions(plan(d([A, H, V], { nouvelles: ['12'] })));
  ok(!fusion(plan(d([A, H, V], { nouvelles: ['12'] }))) && q2.length === 1 && /exemplaire_en_ligne/.test(q2[0].motif), 'un autre exemplaire en ligne aux mêmes photos : la question');
  const S = vin(15, T, P(200), { vu1: 9, vuN: 2, vs: 'sold', statut: 'vendu' });
  const q3 = questions(plan(d([A, H, S])));
  ok(!fusion(plan(d([A, H, S]))) && q3.length === 1 && /exemplaire_vendue/.test(q3[0].motif), 'un exemplaire déjà vendu aux mêmes photos : la question');
  const A2 = ancienne(16, T, P(200), { vu1: 18, vuN: 16, disparu: J(15) });
  const A3 = ancienne(17, T, P(200), { vu1: 17, vuN: 14, disparu: J(13) }); // A2 et A3 en ligne ensemble
  ok(!fusion(plan(d([A2, A3, H]))) && /anciennes_ensemble/.test(questions(plan(d([A2, A3, H])))[0]?.motif ?? ''), 'deux anciennes en ligne ensemble : la question');
  const Q = vin(18, T, P(200), { quantite: 3 });
  ok(!fusion(plan(d([A, Q]))) && questions(plan(d([A, Q]))).length === 1, 'une quantité > 1 : la question');
}

console.log('3. Jamais la photo seule, jamais le titre seul, jamais malgré un conflit');
{
  const A = ancienne(21, 'Pantalon Chino Tommy Hilfiger Denton W34 L34 (44 FR) Bleu Marine', P(300), { taille: 'W34 | FR 44' });
  const H = vin(22, 'Pantalon Chino Tommy Hilfiger Denton W30 L34 (40 FR) Bleu Marine', P(300), { taille: 'W30 | FR 40' });
  ok(plan(d([A, H])).length === 0, 'mêmes photos, même modèle dans une autre taille (conflit) : rien');
  const A2 = ancienne(23, 'Robe Sézane Lou fleurie 38', P(400));
  const H2 = vin(24, 'Veste en jean Levi\'s Trucker bleu M', P(400));
  ok(plan(d([A2, H2])).length === 0, 'mêmes photos, titres sans rapport : rien (jamais la photo seule)');
  const A3 = ancienne(25, T, []);
  const H3 = vin(26, T, P(500));
  const q = plan(d([A3, H3]));
  ok(!fusion(q) && questions(q).length === 1, 'titre identique, ancienne sans photo lisible : la question (jamais le titre seul)');
  const A4 = ancienne(27, 'Jean Levi\'s 501 Vintage W34 L32 Bleu', P(600));
  const H4 = vin(28, 'Jean Levi\'s 501 Vintage W34 L32 Bleu', P(700)); // même titre, photos différentes
  ok(!fusion(plan(d([A4, H4]))), 'titre identique, photos différentes : jamais une fusion');
  const A5 = ancienne(29, T, [photo(800)]);
  const H5 = vin(30, T, [photo(800), photo(801), photo(802)]);
  ok(fusion(plan(d([A5, H5])))?.garde === '29', 'une seule photo d\'un côté, quasi identique, titre identique : la même annonce');
  const e = { conflits: [], ph: { liste: [0] }, exact: true };
  ok(memeAnnonce(e, { emps: [1, 2] }, { emps: [1, 2] }) === false, 'deux photos de chaque côté : une seule paire identique ne suffit pas');
}

console.log('4. Les bornes : boutique, vente, successivité');
{
  const A = ancienne(41, T, P(900), { acc: 'b2' });
  const H = vin(42, T, P(900), { acc: 'b1' });
  ok(plan(d([A, H])).length === 0, 'deux boutiques Vinted différentes : rien');
  const A2 = ancienne(43, T, P(910), { vs: 'sold', statut: 'vendu' });
  const H2 = vin(44, T, P(910));
  ok(!fusion(plan(d([A2, H2]))), 'une ancienne VENDUE n\'est jamais l\'origine d\'une remise en ligne');
  const A3 = vin(45, T, P(920), { vu1: 5, vuN: 0.04 }); // toujours en ligne
  const H3 = vin(46, T, P(920));
  ok(plan(d([A3, H3])).length === 0, 'l\'ancienne toujours en ligne : deux exemplaires, rien');
  const H4 = vin(47, T, P(930), { vs: 'sold', statut: 'vendu' });
  const A4 = ancienne(48, T, P(930));
  ok(plan(d([A4, H4], { nouvelles: ['47'] })).length === 0, 'une nouvelle annonce déjà VENDUE n\'est pas jugée (réparation à part)');
}

console.log('5. Les autres règles du moteur ne bougent pas');
{
  const A = ancienne(51, T, P(1000));
  const H = vin(52, T, P(1000));
  const lbc = { id: 'a1', platform: 'leboncoin', listing_id: '1', url: 'https://leboncoin.test/1', titre: T, prix: 20, photo_url: null, photos: P(1000),
    taille: null, marque: null, inventaire_id: null, ignoree: false, ignoree_par_utilisateur: false, proposition_motif: null, source: 'automatique',
    run_id: 'r1', en_ligne: true, hors_liste: false, ebay_bloque: false, geste: true, derniere_par: null, derniere_decision: null };
  const x = d([A, H], { annonces: [lbc] });
  const sans = passe({ ...x, remise_en_ligne_actif: false }, E, { mode: 'normal' }).decisions;
  const avec = passe(x, E, { mode: 'normal' }).decisions.filter((y) => !y.type.startsWith('remise_en_ligne'));
  ok(JSON.stringify(sans) === JSON.stringify(avec), 'décisions des annonces identiques avec et sans la règle');
  const N = construireNoeuds(x, (urls) => urls.map((u) => photoDepuisEmpreinte(E.get(u))).filter(Boolean));
  ok(remisesEnLigne(x, N, { exclus: new Set(['52']) }).decisions.length === 0, 'une fiche prise par une autre règle de la passe n\'est pas rejugée');
}

console.log('6. La migration, la fonction edge, le moteur');
{
  const mig = lire('supabase/migrations/20261008160000_remise_en_ligne_vinted.sql');
  const inv = lire('supabase/rollbacks/20261008160000_remise_en_ligne_vinted_INVERSE.sql');
  ok(/md5\(pg_get_functiondef\(r\.f::regprocedure\)\) <> r\.m/.test(mig) && /ON S''ARRÊTE/.test(mig), 'la migration s\'arrête si une fonction a changé en prod depuis la lecture');
  ok(/VALUES \('rapprochement_remise_en_ligne', 0, now\(\)\), \('vente_garde_remise_en_ligne', 0, now\(\)\)/.test(mig) && /ON CONFLICT \(key\) DO NOTHING/.test(mig), 'les deux drapeaux posés à 0 (rien ne change avant qu\'on les arme), journalisés');
  ok(/key='vente_garde_remise_en_ligne'\),1\)<>0/.test(mig), 'garde de vente : ligne absente = armée (elle protège)');
  ok(/key = 'rapprochement_remise_en_ligne'\), 0\) = 1/.test(mig), 'règle de la passe : ligne absente = coupée (rien ne fusionne sans décision)');
  ok(/IF NOT coalesce\(v_proof,false\) AND j\.platform='vinted'/.test(mig), 'une vente prouvée « sold » ne passe jamais par la garde (retraits inchangés)');
  for (const g of ['paire_tranchee', 'boutiques_differentes', 'ancienne_vendue', 'nouvelle_pas_en_ligne', 'pas_une_remise_en_ligne', 'quantite', 'job_en_vol', 'nouvelle_touchee', 'deux_exemplaires'])
    ok(mig.includes(`'${g}'`), `garde de la base : ${g}`);
  ok(/reservation_id IS NULL OR reservation_settled_at IS NOT NULL/.test(mig) && /'remplacee_par'/.test(mig), 'jobs des annonces mortes : clos avec leur marqueur, jamais une réservation ouverte');
  ok(/m\.last_synced_at < n\.first_seen_at/.test(mig) && /vinted_absente_dun_releve_complet\(m\.id\)/.test(mig), 'l\'échange d\'identités : jamais en ligne ensemble, absente d\'un relevé complet');
  ok(/'utilisateur:photo_rapprochement_v3_remise'/.test(mig), 'fusions journalisées sous leur propre marque (défaisables une à une)');
  ok(/DROP FUNCTION IF EXISTS public\.rapprochement_v3_remise_possible/.test(inv) && /DELETE FROM public\.coin_config WHERE key IN \('rapprochement_remise_en_ligne', 'vente_garde_remise_en_ligne'\)/.test(inv), 'l\'inverse existe et retire tout');
  const edge = lire('supabase/functions/rapprochement/index.ts');
  ok(/passe\(donnees, map, \{ mode, fichesMain: porteeMain, remises: porteeRemises \}\)/.test(edge) && /remises: "toutes"/.test(edge), 'la fonction edge transmet la portée (et la relance la garde)');
  const p = lire('supabase/functions/_shared/rapprochement/passe.js');
  ok(/remisesEnLigne\(donnees, N, \{ portee: porteeRemises, exclus: prisesMain \}\)/.test(p), 'la passe appelle la règle après les fiches à la main');
}

if (process.argv.includes('--prod')) {
  console.log('7. La preuve en base (transaction annulée, compte fictif)');
  const appliquee = (() => { try { return execSync('npx supabase migration list --linked', { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).includes('20261008160000 | 20261008160000'); } catch { return false; } })();
  try {
    const out = execSync(`node scripts/reparations/20261008_preuve_remise_en_ligne.mjs${appliquee ? ' --appliquee' : ''}`, { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    ok(/PREUVE VERTE/.test(out), `preuve verte (${appliquee ? 'migration en prod' : 'migration jouée dans la transaction'})`);
  } catch (e) { ok(false, 'preuve : ' + String(e.stdout || e.message).split('\n').filter((l) => l.includes('✗')).join(' ; ')); }
}

console.log(ko ? `\n${ko} échec(s)` : '\nselftest:remise-en-ligne-vinted — vert');
process.exit(ko ? 1 : 0);
