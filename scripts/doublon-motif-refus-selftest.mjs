// selftest:doublon-motif-refus — (05/11 soir, Nico) l'écran Doublons montre le MOTIF d'un « Oui » refusé par la base,
// jamais « Réponse non enregistrée ». Une fiche unitaire ne porte jamais deux annonces de la même plateforme (sauf
// republication prouvée), « Annonce en double ? » comprise (décision c) : la RPC inventaire_doublon_decider rend
// { ok: false, reason: 'deux_annonces_meme_plateforme', plateformes, message } (message d'inventaire_fusionner_pour) et
// la question garde preuves.fusion_refusee (migration 20261105190000_rattachement_regles).
//   node --import ./scripts/loader-ext.mjs scripts/doublon-motif-refus-selftest.mjs
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const D = await import(pathToFileURL(join(ROOT, 'src/utils/doublons.js')).href);
let n = 0, ko = 0;
const ok = (cond, msg, detail = '') => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `   ← ${String(detail).slice(0, 300)}` : ''}`); } };

console.log('1. Le motif, depuis le retour de la RPC ou la question');
const MSG = "Cette fiche a déjà une annonce Leboncoin en ligne, et l'autre fiche en a une autre : deux annonces d'une même plateforme, ce sont deux exemplaires. Rien n'a été regroupé.";
const refus = { ok: false, reason: 'deux_annonces_meme_plateforme', plateformes: ['leboncoin'], message: MSG, decision: 'oui' };
const paire = { id: 'q1', motif: 'annonce_en_double', preuves: { platform: 'leboncoin' } };
ok(D.motifRefusDoublon(refus, paire, true) === MSG, 'le message rendu par la base, tel quel');
const paireRefusee = { ...paire, preuves: { platform: 'leboncoin', fusion_refusee: { motif: 'deux_annonces_meme_plateforme', plateformes: ['leboncoin'], message: MSG } } };
ok(D.motifRefusDoublon({ ok: false, reason: 'deux_annonces_meme_plateforme' }, paireRefusee, true) === MSG, 'sans message dans le retour : celui gardé dans la question (preuves.fusion_refusee)');
const recompose = D.motifRefusDoublon({ ok: false, reason: 'deux_annonces_meme_plateforme', plateformes: ['beebs'] }, paire, true);
ok(/^Cette fiche a déjà une annonce Beebs en ligne/.test(recompose ?? '') && /deux exemplaires/.test(recompose) && /Rien n'a été regroupé/.test(recompose),
  `sans message nulle part : recomposé depuis les plateformes — « ${recompose} »`);
const deux = D.motifRefusDoublon({ ok: false, reason: 'deux_annonces_meme_plateforme', plateformes: ['leboncoin', 'beebs'] }, paire, true);
ok(/une annonce Leboncoin et une annonce Beebs en ligne/.test(deux ?? '') && /en a d'autres/.test(deux), `deux plateformes — « ${deux} »`);
const en = D.motifRefusDoublon(refus, paire, false);
ok(/^This item already has a Leboncoin listing online/.test(en ?? '') && /two copies/.test(en) && /Nothing was merged/.test(en), `en anglais : recomposé — « ${en} »`);
ok(D.motifRefusDoublon({ ok: false, reason: 'erreur', message: 'JWT expired' }, paire, true) === null, 'une erreur technique n\'est jamais montrée (null : « Réponse non enregistrée »)');
ok(D.motifRefusDoublon({ ok: false, reason: 'confirmation_utilisateur_requise', message: 'x' }, paire, true) === null, 'un refus non listé : null');
ok(D.motifRefusDoublon({ ok: true, decision: 'oui' }, paire, true) === null && D.motifRefusDoublon(null, paire, true) === null, 'un « oui » enregistré, ou rien : null');
ok(JSON.stringify(D.REFUS_LISIBLES) === JSON.stringify(['deux_annonces_meme_plateforme']), 'refus lisibles : deux_annonces_meme_plateforme');

console.log('\n2. L\'écran Doublons');
const E = lire('src/annonces/EcranDoublons.jsx');
ok(/import \{[^}]*\bmotifRefusDoublon\b[^}]*\} from '\.\.\/utils\/doublons';/.test(E), 'EcranDoublons importe motifRefusDoublon');
const iMotif = E.indexOf('const motifRefus = motifRefusDoublon(r, paire, fr);');
const iGenerique = E.indexOf("setErreur(fr ? \"Réponse non enregistrée — réessaie dans un instant.\"");
ok(iMotif > 0 && iGenerique > iMotif, 'le motif est cherché AVANT le message générique « Réponse non enregistrée »');
const bloc = E.slice(iMotif, E.indexOf('return;', iMotif) + 'return;'.length);
ok(/if \(motifRefus\) \{/.test(bloc) && /setInfo\(motifRefus\);/.test(bloc), 'un refus lisible s\'affiche (setInfo), sans le cadre d\'erreur');
ok(!/setTraitees/.test(bloc) && !/onDecision/.test(bloc), 'la question reste à l\'écran (rien n\'est regroupé) : « Non » reste possible');
const repondre = E.slice(E.indexOf('const repondre = async (decision) => {'), E.indexOf('const raisons = paire'));
ok((repondre.match(/setErreur\(fr \? "Réponse non enregistrée/g) ?? []).length === 1 && /if \(!r\?\.ok && r\?\.reason !== 'deja_tranchee'\) \{\n\s+setErreur\(fr \? "Réponse non enregistrée/.test(repondre),
  '« Réponse non enregistrée » ne reste que pour un refus inconnu ou une panne');

console.log('\n3. La base rend bien ce texte (migration 20261105190000)');
const MIG = lire('supabase/migrations/20261105190000_rattachement_regles.sql');
ok(MIG.includes("'message', 'Cette fiche a déjà une annonce '") && MIG.includes("' en ligne, et l''autre fiche en '")
  && MIG.includes("' : deux annonces d''une même plateforme, ce sont deux exemplaires. Rien n''a été regroupé.'"),
  'inventaire_fusionner_pour compose le même texte que l\'app recompose');
ok((MIG.match(/'fusion_refusee', jsonb_build_object\(\s*'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message'/g) ?? []).length === 2,
  'inventaire_doublon_decider garde motif, plateformes et message dans preuves.fusion_refusee (les deux chemins du « Oui »)');
ok(/RETURN r \|\| jsonb_build_object\('decision', 'oui'\);/.test(MIG), 'la RPC rend le retour d\'inventaire_fusionner_pour (reason, plateformes, message)');

console.log(ko ? `\n✗ doublon-motif-refus : ${ko} échec(s) sur ${n}` : `\n✓ doublon-motif-refus : ${n}/${n}`);
process.exit(ko ? 1 : 0);
