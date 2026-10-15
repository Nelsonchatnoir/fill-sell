// selftest:rapprochement-republication — (15/10, P16) Moteur de rapprochement v23.
// R1 : deux annonces d'une MÊME plateforme sont le même objet quand TOUT est
// identique (chaque photo ≥ 2 appariée à ≤ 2, titre, description, prix ; ni lot
// ni quantité > 1 ; jamais chez une personne qui a répondu « Non, deux
// exemplaires ») — elles rejoignent la même fiche, plus d'« Annonce en double ? ».
// R4 : « fille » contre « garçon » (« femme »/« homme ») est un conflit, sauf
// photos multi-identiques. À la vente, une plateforme à deux annonces n'est plus
// jamais muette : « Déjà vendu ? » pour chacune, et seul le « oui » arme un retrait.
// Preuve par équivalence (banc hors ligne, données réelles exportées en lecture
// seule, 15/10) : plans IDENTIQUES à la v22 (modes vierge et normal) chez louis,
// SPGL 44, corinne, angel, de63, 7373c96c, claire, jocabroc ; ferreirasab 682 →
// 387 questions ; aucun « non » de la personne rendu fort, aucun « oui » perdu ;
// en tranches = d'un seul tenant (ferreira, louis, SPGL, corinne, angel), calcul
// max 557 ms. Rejeux annulés sur la prod : 130/147 « Annonce en double ? » de
// ferreirasab prouvées par la base, 0/9 chez Louis ; fiche vendue à deux annonces
// Beebs → 2 questions, 0 retrait d'office ; retrait refusé sans geste, armé avec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const M = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/rapprochement/moteur.js')).href);
const T = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/rapprochement/texte.js')).href);

console.log('1. R1 — la republication');
const noeud = (o = {}) => ({ pf: 'leboncoin', rp: true, ref: { quantite: 1 }, lot: false, prix: 12, titre: 'Maillot de bain homme RMS M', tn: 'maillot de bain homme rms m', dn: 'cle-desc', emps: [{}, {}, {}], nRef: 3, ...o });
const ph = { liste: [0, 1.2, 2] };
ok(M.republication(noeud(), noeud(), ph) === true, 'tout identique (3 photos à ≤ 2, titre, description, prix) : le même objet');
ok(M.republication(noeud(), noeud({ pf: 'vinted' }), ph) === false && M.republication(noeud({ pf: 'vinted' }), noeud({ pf: 'vinted' }), ph) === false, 'jamais entre deux plateformes, jamais sur Vinted (seulement les plateformes de relevé)');
ok(M.republication(noeud(), noeud({ dn: 'autre' }), ph) === false && M.republication(noeud({ dn: '' }), noeud({ dn: '' }), ph) === false, 'description différente ou absente (moins de 20 caractères) : non');
ok(M.republication(noeud(), noeud({ prix: 13 }), ph) === false && M.republication(noeud({ prix: 0 }), noeud({ prix: 0 }), ph) === false, 'prix différent ou nul : non (jamais « titre + prix » seuls, R12)');
ok(M.republication(noeud(), noeud({ titre: 'Maillot de bain garçon RMS M', tn: 'maillot de bain garcon rms m' }), ph) === false, 'titre différent : non');
ok(M.republication(noeud({ lot: true }), noeud(), ph) === false && M.republication(noeud({ ref: { quantite: 2 } }), noeud(), ph) === false, '« lot / plusieurs / au choix » ou quantité > 1 : non');
ok(M.republication(noeud(), noeud(), { liste: [0, 1, 5] }) === false, 'une photo à plus de 2 : non (TOUTES les photos)');
ok(M.republication(noeud({ emps: [{}], nRef: 1 }), noeud({ emps: [{}], nRef: 1 }), { liste: [0] }) === false, 'une seule photo : non (au moins deux)');
ok(M.republication(noeud({ nRef: 4 }), noeud(), ph) === false, 'une photo sans empreinte d\'un côté : non (toutes lues)');
ok(M.republication(noeud({ rp: false }), noeud({ rp: false }), ph) === false, 'chez une personne qui a répondu « Non, deux exemplaires » : jamais (Louis)');
ok(M.republication(noeud({ ref: { quantite: 1, ignoree: true } }), noeud(), ph) === false, 'une annonce écartée : non');
ok(M.normCommeLaBase('T-shirt Été  Garçon!') === 't shirt ete garcon', 'titre normalisé EXACTEMENT comme la base (rapprochement_texte_norm)');
const mo = lire('supabase/functions/_shared/rapprochement/moteur.js');
ok(/const repPermis = !\(donnees\.doublons \?\? \[\]\)\.some\(\(d\) => d\.motif === 'annonce_en_double' && d\.statut === 'refusee' && d\.decide_par === 'utilisateur'\);/.test(mo), 'le « Non, deux exemplaires » se lit dans les décisions de la personne');
ok(/plaus\.get\(k\)\.add\(rfind\(b\.id\)\)/.test(mo) && /if \(\(Number\(b\.ref\?\.quantite \?\? 1\) \|\| 1\) > 1 \|\| \(partagee\.get\(b\.id\) \?\? \[\]\)\.length\) annules\.add\(r\);/.test(mo), 'concurrents comptés par OBJET ; un second exemplaire vu ailleurs annule la republication');
ok(/motif: rep \? 'republication' : 'photo_identique'/.test(mo) && /republications: republicationsDu\(annonces\)/.test(mo) && /\{ republication: true \}/.test(mo), 'le plan dit la republication (attacher, groupe, à vérifier, fusionner en réparation)');
const tr = lire('supabase/functions/_shared/rapprochement/tranches.js');
ok(/m\.rep \? 1 : 0\]/.test(tr) && /rep: c\[6\] === 1/.test(tr), 'le drapeau traverse les tranches (en tranches = d\'un seul tenant)');
ok(/const VERSION_TRANCHES = "v23-1";/.test(lire('supabase/functions/rapprochement/index.ts')), 'les chantiers d\'avant sont invalidés (VERSION_TRANCHES v23-1)');

console.log('2. R4 — le genre');
ok(T.genres('Sweat fille Canada House 16 ans') === 'F' && T.genres('T-shirt garçon Kiabi') === 'M' && T.genres('Basket mixte') === 'X' && T.genres('Robe rouge') === '', 'fille, garçon, mixte, rien');
ok(T.genresOpposes('F', 'M') && !T.genresOpposes('F', 'X') && !T.genresOpposes('F', ''), 'seuls fille/garçon (femme/homme) s\'opposent');
ok(/if \(photo !== 'multi' && T\.genresOpposes\(x\.ge, y\.ge\)\) \{ c\.push\('genre'\); t\.conflits = c; \}/.test(mo), 'un conflit, sauf photos multi-identiques');

console.log('3. La base');
const m1 = lire('supabase/migrations/20261015130000_rapprochement_republication.sql');
const m2 = lire('supabase/migrations/20261015140000_rapprochement_republication_reparation.sql');
ok(/'desc_h', rapprochement_description_cle\(a\.capture ->> 'description'\)/.test(m1) && /'quantite', a\.quantite/.test(m1), 'la lecture rend la clé de description (jamais le texte), « lot », la quantité');
ok(/AND NOT EXISTS \(SELECT 1 FROM inventaire_doublons d\s+WHERE d\.user_id = a\.user_id AND d\.motif = 'annonce_en_double' AND d\.statut = 'refusee' AND d\.decide_par = 'utilisateur'\)/.test(m1), 'la base revérifie : texte, prix, description, lot, quantité, aucun « Non, deux exemplaires »');
ok(/AND NOT \(COALESCE\(d ->> 'motif', ''\) = 'republication' AND rapprochement_v3_soeur_republication\(a\.id, v_fiche\) IS NOT NULL\) THEN/.test(m2), 'rattacher : seule la republication prouvée passe la garde « deux exemplaires » (motif absent = garde levée jamais)');
ok(/AND NOT \(COALESCE\(d ->> 'republication', ''\) = 'true' AND COALESCE\(rapprochement_republication_prouvee\(x\.id, y\.id\), false\)\)\) THEN/.test(m2), 'réparation : l\'article importé d\'une republication prouvée rejoint sa sœur');
ok(/AND \(public\.fiche_annonces_vivantes\(v_inv\.id, j\.platform\) >= 2\s+OR \(NOT public\.retrait_job_prouve\(j\.id\) AND public\.fiche_annonces_vivantes\(v_inv\.id, j\.platform\) < 2\)\)/.test(m1), 'à la vente : une plateforme à deux annonces pose « Déjà vendu ? » pour chacune (plus jamais muette)');
ok(/if public\.fiche_annonces_vivantes\(j\.inventaire_id, j\.platform\) >= 2 and not coalesce\(p_preuve_geste, false\) then/.test(m1), 'rien d\'office sur une plateforme à deux annonces : seul le « oui » de la personne sur CETTE annonce l\'arme');
ok(fs.existsSync(join(ROOT, 'supabase/rollbacks/20261015130000_rapprochement_republication_INVERSE.sql')) && fs.existsSync(join(ROOT, 'supabase/rollbacks/20261015140000_rapprochement_republication_reparation_INVERSE.sql')), 'inverses prêts');

console.log(`\n✓ rapprochement-republication : ${n} contrôles verts`);
