// ═══════════════════════════════════════════════════════════════════════════
// VERROU — BORDEREAUX DATÉS ET REPÈRE « IMPRIMÉ » (13/11/2026, étape 5 du lot « zéro problème »)
//   npm run selftest:bordereau-imprime
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico (compte faf5021a, bordereaux sur son compte relié 447d920c) : « MIGRATION imprime_le ;
// « Bordereau du JJ/MM · Imprimé le JJ/MM » ; « Tout imprimer » = les non imprimés, avec « Tout réimprimer » à côté. »
// Le défaut (audit du 12/11, bloc 5b) : la date du bordereau (bordereaux_copies.cree_le) n'était affichée nulle part (pas
// même lue) et rien ne gardait la trace d'une impression : entre l'impression et le dépôt du colis, rien ne distinguait
// un bordereau imprimé d'un autre. Cas réel : 447d920c, copie 0c962910 (créée le 10/11 à 11:16, heure de Paris, vente
// Vinted du 10/11, commande « expédiée »).
// Ce verrou prouve : A. le repère (fonction pure, heure de Paris, FR/EN, colonne absente = rien d'affirmé) ; B. « Tout
// imprimer » = les non imprimés, « Tout réimprimer » = tous ; C. l'écran lit imprime_le À PART (PostgREST est tout ou
// rien : une colonne absente avant la migration ne casse jamais la liste), appelle la RPC quand l'aperçu ou « Tout
// imprimer » RÉUSSIT (jamais sur une annulation) ; D. la migration (colonne + RPC propriétaire seul, idempotente), son
// inverse et son banc (base jetable : node scripts/essais/20261113153000_banc.mjs) sont là.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
const V = await import(pathToFileURL(path.join(RACINE, 'src/messagerie/vue.js')).href);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };
const fn = (nom) => (typeof V[nom] === 'function' ? V[nom] : null);
const texte = (copie, lang = 'fr') => (fn('repereBordereau') ? V.repereBordereau(copie, lang)?.texte ?? null : null);

console.log('\nA. LE REPÈRE D\'UNE COPIE (heure de Paris, jamais une valeur inventée)');
const reelle = { id: '0c962910-0000-4000-8000-000000000000', cree_le: '2026-11-10T10:16:46.240033+00:00' };
ok(texte({ ...reelle, imprime_le: null }) === 'Bordereau du 10/11 · Pas encore imprimé', '447d920c, copie 0c962910 : « Bordereau du 10/11 · Pas encore imprimé »', String(texte({ ...reelle, imprime_le: null })));
ok(texte({ ...reelle, imprime_le: '2026-11-12T08:05:00Z' }) === 'Bordereau du 10/11 · Imprimé le 12/11', 'imprimée le 12/11 : « Bordereau du 10/11 · Imprimé le 12/11 »', String(texte({ ...reelle, imprime_le: '2026-11-12T08:05:00Z' })));
ok(texte({ ...reelle }) === 'Bordereau du 10/11', 'colonne pas encore là (avant la migration) : la date seule, rien d\'affirmé sur l\'impression', String(texte({ ...reelle })));
ok(texte({ cree_le: '2026-11-10T23:30:00Z', imprime_le: '2026-11-11T23:10:00Z' }) === 'Bordereau du 11/11 · Imprimé le 12/11', 'jour de PARIS (23:30 UTC le 10/11 = 11/11 à Paris)', String(texte({ cree_le: '2026-11-10T23:30:00Z', imprime_le: '2026-11-11T23:10:00Z' })));
ok(texte({ ...reelle, imprime_le: null }, 'en') === 'Label from 10/11 · Not printed yet' && texte({ ...reelle, imprime_le: '2026-11-12T08:05:00Z' }, 'en') === 'Label from 10/11 · Printed on 12/11', 'anglais', `${texte({ ...reelle, imprime_le: null }, 'en')} | ${texte({ ...reelle, imprime_le: '2026-11-12T08:05:00Z' }, 'en')}`);
ok(Boolean(fn('repereBordereau')) && texte({ cree_le: null, imprime_le: null }) === null && texte(null) === null, 'date du bordereau illisible : aucun repère (jamais « du undefined »)');
ok(fn('repereBordereau') && V.repereBordereau({ ...reelle, imprime_le: '2026-11-12T08:05:00Z' }).imprime === true
  && V.repereBordereau({ ...reelle, imprime_le: null }).imprime === false && V.repereBordereau({ ...reelle }).imprime === null, 'imprime : vrai / faux / inconnu (null)');

console.log('\nB. « TOUT IMPRIMER » = LES NON IMPRIMÉS, « TOUT RÉIMPRIMER » = TOUS');
const a = { id: 'a', imprime_le: null }, b = { id: 'b', imprime_le: '2026-11-12T08:05:00Z' }, c = { id: 'c' };
const r1 = fn('copiesAImprimer') ? V.copiesAImprimer([a, b, c]) : null;
ok(r1 && r1.aImprimer.map((x) => x.id).join(',') === 'a,c' && r1.toutes.length === 3 && r1.reimprimer === true, 'une imprimée sur trois : « Tout imprimer » = 2 (a, c), « Tout réimprimer » proposé (3)', JSON.stringify(r1 && { a: r1.aImprimer.map((x) => x.id), t: r1.toutes.length, r: r1.reimprimer }));
const r2 = fn('copiesAImprimer') ? V.copiesAImprimer([a, c]) : null;
ok(r2 && r2.aImprimer.length === 2 && r2.reimprimer === false, 'aucune imprimée (ou colonne absente) : « Tout imprimer » comme avant, pas de « Tout réimprimer »');
const r3 = fn('copiesAImprimer') ? V.copiesAImprimer([b, { ...b, id: 'b2' }]) : null;
ok(r3 && r3.aImprimer.length === 0 && r3.reimprimer === true, 'toutes imprimées : seulement « Tout réimprimer »');

console.log('\nC. L\'ÉCRAN');
const sec = lire('src/messagerie/SectionAExpedier.jsx');
const principale = sec.match(/from\('bordereaux_copies'\)\.select\('([^']*)'\)\.is\('efface_le'/)?.[1] ?? '';
ok(principale.includes('cree_le') && !principale.includes('imprime_le'), 'lecture principale des copies : cree_le lu, imprime_le JAMAIS dedans (tout ou rien de PostgREST)', principale);
ok(sec.includes(".select('id,imprime_le')"), 'imprime_le lu À PART : son échec (colonne absente) laisse l\'écran comme avant');
ok(/rpc\('bordereau_marquer_imprime',\s*\{\s*p_copies/.test(sec), 'la RPC bordereau_marquer_imprime est appelée avec les copies');
ok(sec.includes('repereBordereau(') && sec.includes('data-repere-impression'), 'la carte dit « Bordereau du JJ/MM · Imprimé le JJ/MM »');
ok(sec.includes('copiesAImprimer(') && sec.includes('reimprimer'), '« Tout imprimer » (non imprimés) et « Tout réimprimer » à côté');
const ap = lire('src/messagerie/impression/ApercuBordereau.jsx');
ok(/if \(r\?\.ok\) onImprime\?\.\(/.test(ap), 'aperçu : marqué seulement quand le geste RÉUSSIT (r.ok — jamais sur annulation ni échec)');
const ti = lire('src/messagerie/impression/ToutImprimer.jsx');
ok(/if \(r\?\.ok\) onImprime\?\.\(/.test(ti) && ti.includes('Tout réimprimer'), '« Tout imprimer » : chaque copie réunie marquée quand le geste réussit ; libellé « Tout réimprimer »');
ok(ti.includes('repereBordereau('), 'la liste de « Tout imprimer » dit le repère de chaque bordereau');

console.log('\nD. LA MIGRATION (préparée, NON appliquée), SON INVERSE, SON BANC');
const mig = lire('supabase/migrations/20261113153000_bordereau_imprime_le.sql');
ok(/ADD COLUMN IF NOT EXISTS imprime_le timestamptz/i.test(mig), 'colonne bordereaux_copies.imprime_le (nulle = pas imprimé)');
ok(/FUNCTION public\.bordereau_marquer_imprime\(p_copies uuid\[\]\)/.test(mig) && /SECURITY DEFINER/.test(mig) && /auth\.uid\(\)/.test(mig), 'RPC bordereau_marquer_imprime(uuid[]) SECURITY DEFINER, lue sur auth.uid()');
ok(/user_id = v_user/.test(mig) && /imprime_le = coalesce\(b\.imprime_le, now\(\)\)/.test(mig), 'propriétaire seul ; idempotente (le premier horodatage est gardé)');
ok(/REVOKE ALL ON FUNCTION public\.bordereau_marquer_imprime\(uuid\[\]\) FROM PUBLIC, anon/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.bordereau_marquer_imprime\(uuid\[\]\) TO authenticated/.test(mig), 'droits : authenticated seulement (jamais anon)');
const inv = lire('supabase/rollbacks/20261113153000_bordereau_imprime_le_INVERSE.sql');
ok(/DROP FUNCTION IF EXISTS public\.bordereau_marquer_imprime\(uuid\[\]\)/.test(inv) && /DROP COLUMN IF EXISTS imprime_le/.test(inv), 'inverse : la RPC et la colonne retirées');
ok(lire('scripts/essais/20261113153000_banc.mjs').includes('bordereau_marquer_imprime'), 'banc sur base jetable présent');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
