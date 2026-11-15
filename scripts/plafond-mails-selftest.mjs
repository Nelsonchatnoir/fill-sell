// Selftest — le plafond de 2 mails / 24 h d'envoi-ponctuel ne compte pas les mails de vente (29/10/2026).
//     node scripts/plafond-mails-selftest.mjs      (npm run selftest:plafond-mails)
// Cas réel : thecloset72000, 28/10 ~20:30 (Paris), refus « plafond_24h, deja: 5 » — lignes email_logs relues :
// vente:5444 (27/10 21:58), vente:5552 (28/10 10:14), vente:5583 (12:30), maintenance_vinted (18:44),
// vente:5676 (20:24).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLAFOND_24H, compteDansPlafond, mailsQuiComptent, PREFIXES_HORS_PLAFOND, TYPES_HORS_PLAFOND, TYPES_A_LA_DEMANDE } from '../supabase/functions/_shared/plafond-mails.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const lire = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

console.log('1. Ce qui compte');
ok(PLAFOND_24H === 2, 'le plafond reste à 2 mails par 24 h');
ok(!compteDansPlafond('vente:5444') && !compteDansPlafond('vente:1'), 'un mail de vente (vente:<id>) ne compte pas');
ok(!compteDansPlafond('ventes_du_jour'), 'le récapitulatif des ventes ne compte pas');
ok(compteDansPlafond('maintenance_vinted') && compteDansPlafond('info_vinted_tailles_depop') && compteDansPlafond('welcome'), 'une campagne, une info, un mail de bienvenue comptent');
ok(compteDansPlafond('venteX') && compteDansPlafond('relance_vente') && compteDansPlafond('vente'), 'liste FERMÉE : « vente » sans « : », un autre préfixe → compte');
ok(compteDansPlafond(null) && compteDansPlafond('') && compteDansPlafond(undefined), 'type absent → compte (prudence)');
ok(PREFIXES_HORS_PLAFOND.length === 1 && TYPES_HORS_PLAFOND.length === 1, 'deux exceptions de vente seulement, nommées');
// (15/11/2026, lot (2) de Nico) « de notre initiative » : un mail DEMANDÉ par la personne ne compte pas — liste fermée.
ok(!compteDansPlafond('extension_link') && !compteDansPlafond('support_reponse') && TYPES_A_LA_DEMANDE.length === 2, 'le lien d\'installation demandé et la réponse du support ne comptent pas (2, nommés)');
ok(compteDansPlafond('how_it_works') && compteDansPlafond('job_pending_relaunch') && compteDansPlafond('extension_link_relance'), 'nos relances et « comment ça marche » comptent ; liste fermée (un autre type → compte)');

console.log('2. client-8ac5bbda, 28/10 ~20:30');
const lignes = ['vente:5676', 'maintenance_vinted', 'vente:5583', 'vente:5552', 'vente:5444'].map((email_type) => ({ email_type }));
ok(lignes.length === 5, 'avant : 5 lignes comptées (« deja: 5 ») → refus');
ok(mailsQuiComptent(lignes) === 1 && mailsQuiComptent(lignes) < PLAFOND_24H, 'maintenant : 1 seule compte (maintenance_vinted) → le mail part');
ok(mailsQuiComptent([...lignes, { email_type: 'info_vinted_tailles_depop' }]) === 2, 'deux mails de notre initiative → le troisième est retenu');
ok(mailsQuiComptent(null) === 0 && mailsQuiComptent([]) === 0, 'rien lu → 0');

console.log('3. La porte');
const ep = lire('../supabase/functions/envoi-ponctuel/index.ts');
const bloc = ep.slice(ep.indexOf('if (categorie === "marketing") {'), ep.indexOf('const sujetFinal'));
ok(/import \{ PLAFOND_24H, mailsQuiComptent \} from "\.\.\/_shared\/plafond-mails\.js";/.test(ep) && !/const PLAFOND_24H = /.test(ep), 'envoi-ponctuel lit la règle partagée (plus de constante locale)');
ok(/select\("email_type"\)/.test(bloc) && /mailsQuiComptent\(lignes \?\? \[\]\)/.test(bloc) && /\.limit\(200\)/.test(bloc), 'le plafond lit les types (200 au plus) et ne compte que ce qui compte');
ok(/motif: "plafond_24h", deja/.test(bloc), 'le refus garde son motif « plafond_24h » et dit « deja »');
ok(/if \(categorie === "marketing"\) \{/.test(ep) && !/categorie === "support"[^\n]*plafond/.test(ep), 'un « support » n\'est toujours jamais plafonné');
ok(/catch \(_e\) \{ \/\* plafond illisible : on laisse passer/.test(bloc), 'une lecture impossible ne bloque toujours pas');

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
