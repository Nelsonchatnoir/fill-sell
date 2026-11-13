// ═══════════════════════════════════════════════════════════════════════════
// VERROU — « MARQUER NON IMPRIMÉ » SUR UN BORDEREAU (13/11/2026, lot NU, I3)
//   npm run selftest:bordereau-non-imprime
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11, question I3 de l'étape 5) : « oui, ajoute « Marquer non imprimé » ». Le repère « Imprimé le
// JJ/MM » est posé quand le geste d'impression, de partage ou de téléchargement RÉUSSIT (l'app ne voit pas l'imprimante) :
// un PDF partagé sans être imprimé disait « Imprimé le 12/11 » et sortait de « Tout imprimer », sans retour possible.
// Cas réel : 447d920c (relié de faf5021a), copie 0c962910 du 10/11.
// La règle : un geste remet « Imprimé le » à vide — la copie redit « Pas encore imprimé » et revient dans « Tout
// imprimer » ; RÉVERSIBLE (« Annuler » rend la date retirée, à l'identique, gardée par le serveur, jamais par l'écran) ;
// JOURNALISÉ comme le marquage (une RPC propriétaire seul, la trace sur la ligne : non_imprime_le = quand, imprime_avant =
// la date retirée). L'écran marche AVANT et APRÈS les deux migrations (20261113153000 imprime_le, 20261113193000 ce geste) :
// le geste ne se montre que si la base sait le faire (colonne non_imprime_le lisible), jamais un bouton qui échoue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
const V = await import(pathToFileURL(path.join(RACINE, 'src/messagerie/vue.js')).href);
const fn = (nom) => (typeof V[nom] === 'function' ? V[nom] : null);

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d ? `\n      ← ${d}` : ''}`); } };
const geste = (copie, o, lang) => (fn('gesteImpression') ? V.gesteImpression(copie, o, lang) : undefined);

console.log('\nA. LE GESTE (fonction pure : quand il se montre, ce qu\'il dit)');
const reelle = { id: '0c962910-0000-4000-8000-000000000000', cree_le: '2026-11-10T10:16:46.240033+00:00' };
const imprimee = { ...reelle, imprime_le: '2026-11-12T08:05:00Z' };
const g1 = geste(imprimee, { disponible: true, annulable: false });
ok(g1 && g1.action === 'non_imprime' && g1.libelle === 'Marquer non imprimé', '447d920c, copie 0c962910 « Imprimé le 12/11 » : « Marquer non imprimé »', JSON.stringify(g1));
ok(geste(imprimee, { disponible: false, annulable: false }) === null, 'base sans le geste (migration 20261113193000 pas encore appliquée) : rien à l\'écran, jamais un bouton qui échoue');
ok(geste(reelle, { disponible: true, annulable: false }) === null, 'repère inconnu (colonne imprime_le absente) : rien');
const retiree = { ...reelle, imprime_le: null };
const g2 = geste(retiree, { disponible: true, annulable: true });
ok(g2 && g2.action === 'retablir' && g2.libelle === 'Annuler', 'juste après le geste : « Annuler » (réversible)', JSON.stringify(g2));
ok(geste(retiree, { disponible: true, annulable: false }) === null, 'jamais imprimée (ou plus annulable) : rien');
const en1 = geste(imprimee, { disponible: true, annulable: false }, 'en'), en2 = geste(retiree, { disponible: true, annulable: true }, 'en');
ok(en1?.libelle === 'Mark as not printed' && en2?.libelle === 'Undo', 'anglais', `${en1?.libelle} | ${en2?.libelle}`);
ok(fn('repereBordereau') && V.repereBordereau(retiree).texte === 'Bordereau du 10/11 · Pas encore imprimé', 'après le geste, le repère redit « Bordereau du 10/11 · Pas encore imprimé »');
const lot = fn('copiesAImprimer') ? V.copiesAImprimer([retiree, { ...imprimee, id: 'b' }]) : null;
ok(lot && lot.aImprimer.map((x) => x.id).join() === reelle.id && lot.reimprimer === true, 'et la copie revient dans « Tout imprimer »');

console.log('\nB. L\'ÉCRAN « À EXPÉDIER »');
const sec = lire('src/messagerie/SectionAExpedier.jsx');
ok(sec.includes(".select('id,imprime_le,non_imprime_le')") && sec.includes(".select('id,imprime_le')"), 'lecture à part, par paliers : non_imprime_le (le geste existe) → sinon imprime_le seul (comme avant) → sinon rien');
ok(/rpc\('bordereau_marquer_non_imprime',\s*\{\s*p_copies[^}]*p_retablir/.test(sec), 'le geste appelle la RPC bordereau_marquer_non_imprime (p_copies, p_retablir pour « Annuler »)');
ok(/gesteImpression\(/.test(sec) && sec.includes('data-geste-impression'), 'la carte montre le geste sous le repère (gesteImpression, data-geste-impression)');
ok(/onNonImprime=\{/.test(sec), 'l\'aperçu reçoit le geste (onNonImprime)');
ok(/setCopies\(/.test(sec.slice(sec.indexOf('const marquerNonImprime'), sec.indexOf('const marquerNonImprime') + 2500)), 'la réponse du serveur (imprime_le rendu) met la carte à jour, sans relecture');
const ap = lire('src/messagerie/impression/ApercuBordereau.jsx');
ok(/gesteImpression\(/.test(ap) && /onNonImprime\?\.\(/.test(ap) && ap.includes('data-geste-impression'), 'aperçu : le même geste sous le repère');

console.log('\nC. LA MIGRATION (préparée, NON appliquée), SON INVERSE, SON BANC');
const mig = lire('supabase/migrations/20261113193000_bordereau_marquer_non_imprime.sql');
ok(/RAISE EXCEPTION[^;]*20261113153000/.test(mig), 'refuse de passer AVANT 20261113153000 (colonne imprime_le absente) : ordre explicite');
ok(/ADD COLUMN IF NOT EXISTS non_imprime_le timestamptz/.test(mig) && /ADD COLUMN IF NOT EXISTS imprime_avant timestamptz/.test(mig), 'la trace sur la ligne : non_imprime_le (quand), imprime_avant (la date retirée)');
ok(/FUNCTION public\.bordereau_marquer_non_imprime\(p_copies uuid\[\], p_retablir boolean DEFAULT false\)/.test(mig) && /SECURITY DEFINER/.test(mig) && /auth\.uid\(\)/.test(mig), 'RPC bordereau_marquer_non_imprime(uuid[], boolean) SECURITY DEFINER, lue sur auth.uid()');
ok(/b\.user_id = v_user AND b\.efface_le IS NULL AND b\.imprime_le IS NOT NULL/.test(mig), 'retirer : propriétaire seul, copie non effacée, seulement une copie marquée (aucune ligne inchangée réécrite)');
ok(/SET imprime_avant = b\.imprime_le, non_imprime_le = now\(\), imprime_le = NULL/.test(mig), 'retirer : la date part dans imprime_avant, l\'heure du geste dans non_imprime_le');
ok(/b\.imprime_le IS NULL AND b\.imprime_avant IS NOT NULL/.test(mig) && /SET imprime_le = b\.imprime_avant, imprime_avant = NULL, non_imprime_le = NULL/.test(mig), '« Annuler » : la date retirée revient à l\'identique, seulement si rien ne l\'a remplacée');
ok(/REVOKE ALL ON FUNCTION public\.bordereau_marquer_non_imprime\(uuid\[\], boolean\) FROM PUBLIC, anon/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.bordereau_marquer_non_imprime\(uuid\[\], boolean\) TO authenticated/.test(mig), 'droits : authenticated seulement (jamais anon ni PUBLIC)');
ok(!/bordereau_marquer_imprime\(/.test(mig.replace(/^--.*$/gm, '')), 'la RPC du marquage (20261113153000) n\'est pas touchée');
const inv = lire('supabase/rollbacks/20261113193000_bordereau_marquer_non_imprime_INVERSE.sql');
ok(/DROP FUNCTION IF EXISTS public\.bordereau_marquer_non_imprime\(uuid\[\], boolean\)/.test(inv) && /DROP COLUMN IF EXISTS non_imprime_le/.test(inv) && /DROP COLUMN IF EXISTS imprime_avant/.test(inv), 'inverse : la RPC et les deux colonnes retirées (imprime_le et le marquage intacts)');
ok(lire('scripts/essais/20261113193000_banc.mjs').includes('bordereau_marquer_non_imprime'), 'banc sur base jetable présent');

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n})`);
process.exit(ko ? 1 : 0);
