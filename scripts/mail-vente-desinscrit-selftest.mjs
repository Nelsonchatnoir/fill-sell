// VERROU « UNE PERSONNE DÉSINSCRITE NE REÇOIT PLUS DE MAIL DE VENTE » (18/11/2026, ordre de Nico, point 3B)
// `npm run selftest:mail-vente-desinscrit` — sans base, sans réseau : il lit le dépôt et joue le module pur.
// Cas : 4e0a80fe (4e0a80fe), désinscrite le 17/11 07:37:19 (email_destinataires.desinscrit) : push-ventes envoyait le mail
// de vente en catégorie « support », et la porte envoyerEmail() ne consulte estDesinscrit() que pour « marketing » — son
// prochain mail de vente serait parti. L'adresse n'était pas en cause (même adresse, même casse, même compte).
// La règle : catégorie « notification » (mail que la personne n'a pas demandé, né de son activité) — filtrée par la
// désinscription comme le marketing, avec l'en-tête List-Unsubscribe ; « support » (réponse à SA demande, sécurité,
// facturation) jamais filtré. Un refus « désinscrit » est DÉFINITIF (jamais trois réessais).
// Ce test CASSE si :
//   A. le module pur _shared/mail-categorie.js perd une catégorie, filtre « support », laisse passer « notification »,
//      ou fait réessayer un refus « désinscrit » ;
//   B. la porte (desinscription.ts) ne passe plus par ce module pour le filtre ET pour l'en-tête, ou change le défaut ;
//   C. un mail de vente de push-ventes repart en « support », ou son verdict ne passe plus par verdictMailVente ;
//   D. la page /desinscription ne dit plus que les mails de vente s'arrêtent aussi (fr et en) ;
//   E. un autre expéditeur se met à utiliser une catégorie hors liste (marketing / notification / support) — les
//      expéditeurs d'aujourd'hui (email-tunnel compris) gardent marketing / support, au comportement identique.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
let n = 0, echecs = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };

console.log('A. module pur _shared/mail-categorie.js');
let M = {};
try { M = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/mail-categorie.js')).href); }
catch (e) { ok(false, `module _shared/mail-categorie.js présent (${e.code ?? e.message})`); }
if (typeof M.bloqueeParDesinscription === 'function' && typeof M.verdictMailVente === 'function') {
  ok(JSON.stringify(M.CATEGORIES) === JSON.stringify(['marketing', 'notification', 'support']), 'trois catégories, liste fermée', M.CATEGORIES);
  ok(M.bloqueeParDesinscription('notification') === true, '« notification » (mail de vente) : filtrée par la désinscription');
  ok(M.bloqueeParDesinscription('marketing') === true, '« marketing » : filtrée, comme avant');
  ok(M.bloqueeParDesinscription('support') === false, '« support » : jamais filtrée, comme avant');
  ok(M.bloqueeParDesinscription(undefined) === true && M.bloqueeParDesinscription('autre') === true,
    'catégorie absente ou inconnue : filtrée (défaut prudent, comme le défaut « marketing » de la porte)');
  const v = M.verdictMailVente({ envoye: false, motif: 'desinscrit' });
  ok(v.statut === 'echec' && v.motif === 'desinscrit', 'refus « desinscrit » → echec définitif (jamais a_reessayer)', v);
  ok(JSON.stringify(M.verdictMailVente({ envoye: true })) === JSON.stringify({ statut: 'envoye' }), 'envoyé → « envoye »');
  ok(JSON.stringify(M.verdictMailVente({ envoye: false, motif: 'deja_envoye' })) === JSON.stringify({ statut: 'deja_envoye' }), 'déjà servi → « deja_envoye »');
  const r = M.verdictMailVente({ envoye: false, motif: 'resend_echec' });
  ok(r.statut === 'a_reessayer' && r.motif === 'resend_echec', 'Resend refusé → « a_reessayer » (3 essais, comme avant)', r);
  const w = M.verdictMailVente({ envoye: false, motif: 'verification_impossible' });
  ok(w.statut === 'a_reessayer', 'vérification impossible (base injoignable) → réessayé plus tard, jamais envoyé à l\'aveugle', w);
  const z = M.verdictMailVente(undefined);
  ok(z.statut === 'a_reessayer' && z.motif === 'inconnu', 'résultat absent → « a_reessayer » (inconnu)', z);
}

console.log('B. la porte (desinscription.ts) passe par le module, pour le filtre ET pour l\'en-tête');
const porte = lire('supabase/functions/_shared/desinscription.ts');
const porteCode = sansCommentaires(porte);
ok(/import \{ bloqueeParDesinscription \} from "\.\/mail-categorie\.js";/.test(porte), 'importe bloqueeParDesinscription');
ok(/export type CategorieEmail = "marketing" \| "notification" \| "support";/.test(porte), 'type CategorieEmail : marketing | notification | support');
ok(/const categorie: CategorieEmail = envoi\.categorie \?\? "marketing";/.test(porte), 'défaut inchangé : « marketing »');
const iFiltre = porteCode.indexOf('if (bloqueeParDesinscription(categorie)) {');
const iEst = porteCode.indexOf('bloque = await estDesinscrit(adresse, userId);');
ok(iFiltre >= 0 && iEst > iFiltre && iEst - iFiltre < 200, 'le filtre estDesinscrit() est gardé par bloqueeParDesinscription(categorie)');
ok(/if \(bloqueeParDesinscription\(categorie\) && userId\) \{\s+const supabaseUrl/.test(porteCode), 'l\'en-tête List-Unsubscribe suit la même règle');
ok(!/categorie === "marketing"/.test(porteCode), 'plus aucun test « categorie === \"marketing\" » dans le code de la porte');

console.log('C. push-ventes : tout mail de vente en « notification », verdict par verdictMailVente');
const pv = sansCommentaires(lire('supabase/functions/push-ventes/index.ts'));
ok(/import \{ verdictMailVente \} from "\.\.\/_shared\/mail-categorie\.js";/.test(pv), 'importe verdictMailVente');
const appels = [...pv.matchAll(/envoyerEmail\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]);
ok(appels.length === 2, 'deux envois (vente seule ou groupe, rafale)', appels.length);
ok(appels.every((a) => /type: `vente:\$\{n\.id\}`/.test(a) && /categorie: "notification"/.test(a)), 'chacun : type vente:<note>, catégorie « notification »', appels);
ok(!/categorie: "support"/.test(pv), 'aucun envoi en « support » dans push-ventes');
ok((pv.match(/return verdictMailVente\(r\);/g) ?? []).length === 2, 'les deux verdicts passent par verdictMailVente (désinscrit = définitif)');
ok(!/if \(r\.envoye\) return \{ statut: "envoye" \};/.test(pv), 'plus de verdict écrit à la main (désinscrit ne repart plus en a_reessayer)');

console.log('D. la page /desinscription dit vrai');
const page = lire('src/pages/Desinscription.jsx');
ok(/ni d'emails de tes ventes/.test(page) || /ni les mails de tes ventes/.test(page), 'fr : les mails de vente s\'arrêtent aussi');
ok(/sales? (notification )?emails/i.test(page), 'en : sales emails stop too');
ok(!/Messages about your account — answers to a question, security, billing — keep coming/.test(page) || /sales/.test(page), 'en : la promesse « keep coming » ne couvre pas les ventes');

console.log('E. les autres expéditeurs : catégories de la liste, marketing / support inchangés');
const fichiers = [];
const parcourir = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) parcourir(p); else if (/\.(ts|js)$/.test(f)) fichiers.push(p); } };
parcourir(path.join(RACINE, 'supabase/functions'));
const horsListe = [], notifications = [];
for (const f of fichiers) {
  const t = sansCommentaires(readFileSync(f, 'utf8'));
  for (const m of t.matchAll(/categorie:\s*"([a-z_]+)"/g)) {
    const rel = path.relative(RACINE, f).replace(/\\/g, '/');
    if (!['marketing', 'notification', 'support'].includes(m[1])) horsListe.push(`${rel}: ${m[1]}`);
    if (m[1] === 'notification') notifications.push(rel);
  }
}
ok(horsListe.length === 0, 'aucune catégorie hors liste dans supabase/functions', horsListe.join(', '));
// (19/11, point 3 de Nico : « une personne désinscrite ne reçoit plus nos relances, point ») « notification » : le mail de
// vente (push-ventes) ET les relances d'email-tunnel (job_pending_relaunch, relance_manuelle) — nulle part ailleurs.
ok(notifications.length > 0 && notifications.every((f) => ['supabase/functions/push-ventes/index.ts', 'supabase/functions/email-tunnel/index.ts'].includes(f)),
  '« notification » : mails de vente et relances seulement', [...new Set(notifications)].join(', '));
const tunnel = sansCommentaires(lire('supabase/functions/email-tunnel/index.ts'));
ok(/type: RELANCE_TYPE, userId, categorie: "notification"/.test(tunnel) && !/type: RELANCE_TYPE, userId, categorie: "support"/.test(tunnel),
  'job_pending_relaunch : « notification » (filtrée par la désinscription) — plus jamais « support » (décision de Nico du 19/11)');
ok(/type: "relance_manuelle", categorie: "notification"/.test(tunnel), 'relance_manuelle : « notification » aussi');
ok(/\} else if \(r\.motif === "desinscrit"\) \{/.test(tunnel), 'relance refusée « desinscrit » : la réservation reste (jamais retentée toutes les heures)');
ok(/lienDesinscription: await lienDesinscription\(prof\.email, userId\)\.catch\(\(\) => ""\)/.test(tunnel) && /lienDesinscription: await lienDesinscription\(item\.to\)\.catch\(\(\) => ""\)/.test(tunnel),
  'les deux relances portent le lien « Se désinscrire » visible');

console.log(`\n${n - echecs}/${n} — ${echecs ? 'ROUGE' : 'VERT'}`);
process.exit(echecs ? 1 : 0);
