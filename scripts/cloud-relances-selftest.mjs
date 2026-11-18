// Autotest des DEUX RELANCES CLOUD (18/11/2026) : renouvellement coupé (J-3) et essai commencé sans aller au bout.
//     npm run selftest:cloud-relances
// Sans réseau : qui reçoit, quand, jamais deux, jamais un compte de test, au plus 2 mails / 24 h, de jour, les textes
// (tutoiement, « on », pas de prix, pas de promesse), le câblage dans email-tunnel, la migration (index one-shot).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TYPE_RELANCE_ARRET, TYPE_RELANCE_ESSAI, CATEGORIE_RELANCE, DEDUP_RELANCE, PARAMETRES_RELANCES,
  ENVOI_REEL_RELANCES_CLOUD, ESSAI_RATE_DEPUIS, creneauPrevu,
  finDePeriode, fenetreArret, decisionRelanceArret, decisionRelanceEssai, essaiRate, texteRelanceArret, texteRelanceEssai,
} from '../supabase/functions/_shared/cloud-relances.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(`\n${t}`);
const H = 3_600_000;
const FIN = Date.parse('2026-11-21T00:39:22Z');
const iso = (t) => new Date(t).toISOString();
const lire = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

titre('0. Le contrat');
ok(TYPE_RELANCE_ARRET === 'cloud_relance_arret' && TYPE_RELANCE_ESSAI === 'cloud_relance_essai', 'deux types nommés');
ok(CATEGORIE_RELANCE === 'marketing' && DEDUP_RELANCE === 'reservation', 'catégorie marketing (désinscription respectée), envoi en réservation (un seul)');
ok(PARAMETRES_RELANCES.arretAvantFinH === 72 && PARAMETRES_RELANCES.maxMails24h === 2, 'J-3 ; au plus 2 mails par 24 h');

titre('1. (a) Renouvellement coupé : qui, quand');
const pa = (o = {}) => ({ email: 'marie@exemple.fr', cloud_arret_fin_periode: true, cloud_essai_fin: iso(FIN), cloud_periode_fin: iso(FIN), ...o });
const da = (o = {}) => decisionRelanceArret({ profil: pa(), heureParis: 10, mails24h: 0, maintenant: FIN - 48 * H, ...o });
ok(da().action === 'envoyer', '48 h avant la fin, renouvellement coupé → il part');
ok(da({ maintenant: FIN - 73 * H }).raison === 'pas_encore', '73 h avant → pas encore (J-3)');
ok(da({ maintenant: FIN - 71 * H }).action === 'envoyer', '71 h avant → il part');
ok(da({ maintenant: FIN - 5 * H }).action === 'envoyer', 'ouvert tard (fin dans 5 h) → il part quand même, une fois');
ok(da({ maintenant: FIN }).raison === 'periode_finie' && da({ maintenant: FIN + H }).raison === 'periode_finie', 'période finie → rien');
ok(da({ profil: pa({ cloud_arret_fin_periode: false }) }).raison === 'renouvellement_actif', 'renouvellement actif → rien');
ok(da({ profil: pa({ cloud_arret_fin_periode: null }) }).action === 'rien', 'drapeau absent → rien');
ok(da({ profil: pa({ cloud_essai_arrete: true }) }).raison === 'deja_arrete', 'essai déjà arrêté → rien');
ok(da({ dejaEnvoye: true }).raison === 'deja_envoye', 'déjà envoyé → jamais deux');
ok(da({ profil: pa({ email: '' }) }).raison === 'sans_adresse' && da({ profil: null }).action === 'rien', 'sans adresse → rien');
ok(da({ profil: pa({ cloud_essai_fin: null, cloud_periode_fin: null }) }).raison === 'sans_fin', 'sans date de fin → rien (jamais un mail sans date)');
ok(da({ heureParis: 7 }).raison === 'nuit' && da({ heureParis: 22 }).raison === 'nuit' && da({ heureParis: Number.NaN }).raison === 'nuit', 'la nuit, ou heure illisible → il attend');
ok(da({ mails24h: 1 }).action === 'envoyer' && da({ mails24h: 2 }).raison === 'plafond_2_par_jour', '1 mail dans les 24 h → il part ; 2 → il attend (au plus 2 par jour)');
ok(da({ mails24h: Number.POSITIVE_INFINITY }).action === 'attendre', 'compte des mails illisible → il attend (échec fermé)');
for (const e of ['hoosslocal@gmail.com', 'nicolas.svobodny@gmail.com', 'nicolas.svobodny+a@gmail.com', 'googlereview@fillsell.app', 'test2@exemple.fr', 'nicotest3@exemple.fr', 'illisible']) {
  ok(da({ profil: pa({ email: e }) }).raison === 'compte_de_test', `compte de test ou adresse illisible → rien (${e})`);
}
ok(finDePeriode({ cloud_essai_fin: iso(FIN - 30 * 24 * H), cloud_periode_fin: iso(FIN) }) === FIN, 'fin de période = la plus tardive');
const fen = fenetreArret(FIN - 100 * H);
ok(Date.parse(fen.finAvant) - Date.parse(fen.finApres) === 72 * H, 'la fenêtre de lecture couvre 72 h');

titre('2. (b) Essai commencé sans aller au bout');
const MAINT = Date.parse('2026-11-30T10:00:00Z');
const pb = (o = {}) => ({ email: 'marie@exemple.fr', is_cloud: false, cloud_essai_debut: null, ...o });
const db = (o = {}) => decisionRelanceEssai({ profil: pb(), derniereIssue: MAINT - 30 * H, heureParis: 10, mails24h: 0, maintenant: MAINT, ...o });
ok(db().action === 'envoyer', 'essai raté il y a 30 h, aucun essai depuis → il part');
ok(db({ derniereIssue: MAINT - 23 * H }).raison === 'pas_encore', 'moins de 24 h → pas encore (le temps de réessayer seul)');
ok(db({ derniereIssue: MAINT - 169 * H }).raison === 'trop_tard', 'plus de 7 jours → trop tard');
ok(db({ profil: pb({ cloud_essai_debut: iso(MAINT - H) }) }).raison === 'essai_demarre', 'l\'essai a démarré depuis → rien');
ok(db({ profil: pb({ is_cloud: true }) }).raison === 'deja_payant', 'déjà payant → rien');
ok(db({ dejaEnvoye: true }).raison === 'deja_envoye', 'déjà relancé → jamais deux');
ok(db({ derniereIssue: null }).raison === 'pas_d_issue', 'aucune trace → rien');
ok(db({ heureParis: 23 }).raison === 'nuit' && db({ mails24h: 2 }).raison === 'plafond_2_par_jour', 'nuit / plafond 2 par jour → il attend');
ok(db({ profil: pb({ email: 'hoosslocal+x@gmail.com' }) }).raison === 'compte_de_test', 'compte de test → rien');
ok(db({ profil: pb({ email: '' }) }).raison === 'sans_adresse', 'sans adresse → rien');

titre('3. (b) Quelles traces comptent');
ok(essaiRate('formule_cloud_issue', { etat: 'annule', raison: 'boutique_annulee' }) === true, 'fenêtre de la boutique fermée → compte');
ok(essaiRate('formule_cloud_issue', { etat: 'annule', raison: null }) === true, 'annulé sans raison (traces d\'avant le 16/11) → compte');
ok(essaiRate('formule_cloud_issue', { etat: 'erreur', raison: 'boutique_erreur' }) === true, 'erreur de la boutique → compte');
ok(essaiRate('cloud_achat_issue', { etat: 'erreur', raison: 'boutique_erreur' }) === true, 'achat du Cloud seul en erreur → compte');
ok(essaiRate('formule_cloud_issue', { etat: 'annule', raison: 'conditions_refusees' }) === false, 'conditions refusées = un CHOIX → ne compte pas');
ok(essaiRate('formule_cloud_issue', { etat: 'actif', raison: null }) === false && essaiRate('formule_cloud_issue', { etat: 'redirige' }) === false, 'essai abouti ou redirigé vers Stripe → ne compte pas');
ok(essaiRate('checkout_abandon', { tier: 'pro_cloud', canal: 'stripe', cause: 'annule' }) === true, 'page carte Stripe abandonnée (formule avec Cloud) → compte');
ok(essaiRate('checkout_abandon', { tier: 'premium', canal: 'stripe' }) === false, 'abandon d\'un achat SANS Cloud → ne compte pas');
ok(essaiRate('checkout_abandon', { tier: 'pro_cloud', canal: 'apple' }) === false, 'abandon Apple (déjà une issue de formule) → pas de doublon de comptage');
ok(essaiRate('autre', { etat: 'annule' }) === false && essaiRate('formule_cloud_issue', null) === false, 'autre trace ou métadonnée absente → ne compte pas');

titre('4. Les textes');
for (const [nom, t] of [['a fr', texteRelanceArret({ lang: 'fr', finIso: iso(FIN) })], ['a en', texteRelanceArret({ lang: 'en', finIso: iso(FIN) })], ['b fr', texteRelanceEssai({ lang: 'fr' })], ['b en', texteRelanceEssai({ lang: 'en' })]]) {
  const tout = [t.sujet, t.titre, t.preheader, ...t.paragraphes].join(' ');
  ok(!/[€$]|\d+[.,]\d{2}/.test(tout), `${nom} : aucun prix écrit`);
  ok(!/(rembours|dernière chance|urgent|vite)/i.test(tout), `${nom} : aucune promesse ni pression`);
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tout), `${nom} : sans émoji`);
  ok(/FillSell/.test(tout), `${nom} : nomme FillSell`);
}
const fa = texteRelanceArret({ lang: 'fr', finIso: iso(FIN) }).paragraphes.join(' ');
ok(/\bOn\b/.test(fa) && /\btu\b|\bton\b|\bt'/i.test(fa) && !/\bvous\b|\bvotre\b/i.test(fa), '(a) fr : tutoiement et « on »');
ok(/vendredi 21 novembre|samedi 21 novembre|vendredi 20 novembre/.test(fa) || /21 novembre/.test(fa), '(a) fr : la date de fin dite en toutes lettres');
const fb = texteRelanceEssai({ lang: 'fr' }).paragraphes.join(' ');
ok(/\bOn\b/.test(fb) && !/\bvous\b|\bvotre\b/i.test(fb), '(b) fr : tutoiement et « on »');
ok(!/rien payer|aucun prélèvement|rien n'est facturé/i.test(fb), '(b) fr : ne promet rien sur la facturation (la boutique seule le confirme)');
ok(texteRelanceEssai({ lang: 'fr' }).bouton?.url === 'https://fillsell.app' && texteRelanceArret({ lang: 'fr', finIso: iso(FIN) }).bouton === null, '(b) un bouton vers l\'app ; (a) aucun bouton : on demande de répondre');

titre('5. Le câblage');
const tunnel = lire('../supabase/functions/email-tunnel/index.ts');
ok(/from "\.\.\/_shared\/cloud-relances\.js"/.test(tunnel), 'email-tunnel utilise ce module (aucune règle recopiée)');
ok(/dedup:\s*DEDUP_RELANCE/.test(tunnel) && /categorie:\s*CATEGORIE_RELANCE/.test(tunnel), 'envoi par la porte unique : réservation, marketing');
ok(/rpc\("index_one_shot_types"\)/.test(tunnel) && /garde:\s*"index_one_shot_sans_les_types_de_relance"/.test(tunnel), 'GARDE : sans l\'index, aucune relance ne part');
ok(/relances_cloud:\s*relancesCloudBilan/.test(tunnel), 'le bilan est rendu dans la réponse');
ok(/lienDesinscription\(email, uid\)/.test(tunnel) && /mailRelanceCloud/.test(tunnel), 'le lien de désinscription est dans le mail');
// (18/11, ordre de Nico) Le plafond de 2 mails / 24 h compte TOUS les mails de email_logs (bienvenue, ventes, support,
// marketing, relances…) : la lecture ne filtre sur AUCUN type ni catégorie, et un compte illisible attend.
const n24 = /const n24 = async[\s\S]*?\n      \};/.exec(tunnel)?.[0] ?? '';
ok(/from\("email_logs"\)/.test(n24) && /\.eq\("user_id", uid\)/.test(n24) && /\.gte\("sent_at"/.test(n24), 'le compte des 24 h lit email_logs par personne et par date');
ok(!/email_type|categorie|\.in\(|\.neq\(|\.not\(|\.like\(|\.ilike\(/.test(n24), 'le compte des 24 h ne filtre sur AUCUN type ni catégorie : tous les mails comptent');
ok(/Number\.POSITIVE_INFINITY/.test(n24), 'lecture du compte impossible → il attend (échec fermé)');
// Une personne qui a déjà reçu bienvenue + vente + support (3 lignes, cas du compte 82ed3d4c) : aucune relance, quel que soit leur type.
ok(decisionRelanceArret({ profil: pa(), heureParis: 10, mails24h: 3, maintenant: FIN - 48 * H }).raison === 'plafond_2_par_jour', '3 mails reçus (bienvenue, vente, support) → relance « arrêt » retenue');
ok(decisionRelanceEssai({ profil: pb(), derniereIssue: MAINT - 30 * H, heureParis: 10, mails24h: 3, maintenant: MAINT }).raison === 'plafond_2_par_jour', '3 mails reçus → relance « essai » retenue');
// (18/11, ordre de Nico) L'envoi réel est COUPÉ tant que Nico n'a pas validé ; les essais ratés d'avant le correctif sont
// pour le mail ponctuel de Nico ; le créneau prévu est un passage horaire de jour.
ok(ENVOI_REEL_RELANCES_CLOUD === true, 'INTERRUPTEUR : l envoi réel est branché (feu vert de Nico du 18/11) ; false = coupé, sur ordre de Nico');
ok(/relancesCloud\(dryRun \|\| !ENVOI_REEL_RELANCES_CLOUD\)/.test(tunnel), 'email-tunnel : tant que l\'interrupteur est coupé, le passage tourne en simulation (aucun envoi)');
ok(db({ derniereIssue: Date.parse(ESSAI_RATE_DEPUIS) - 1, maintenant: Date.parse(ESSAI_RATE_DEPUIS) + 40 * H }).raison === 'avant_le_correctif', 'un essai raté AVANT le correctif du 16/11 → rien (c\'est le mail de Nico)');
ok(db({ derniereIssue: Date.parse(ESSAI_RATE_DEPUIS) + 1, maintenant: Date.parse(ESSAI_RATE_DEPUIS) + 30 * H }).action === 'envoyer', 'un essai raté APRÈS le correctif → relance');
const c1 = creneauPrevu({ des: Date.parse('2026-11-19T02:10:00Z'), maintenant: Date.parse('2026-11-19T02:10:00Z') });
ok(c1.iso === '2026-11-19T07:00:00.000Z', 'créneau prévu : la nuit → le premier passage de 8 h à Paris (07:00Z en hiver)');
const c2 = creneauPrevu({ des: Date.parse('2026-11-19T10:20:00Z'), maintenant: Date.parse('2026-11-19T10:20:00Z') });
ok(c2.iso === '2026-11-19T11:00:00.000Z', 'créneau prévu : en journée → la prochaine heure pleine');
const c3 = creneauPrevu({ des: Date.parse('2026-11-19T21:30:00Z'), maintenant: Date.parse('2026-11-19T10:00:00Z') });
ok(c3.iso === '2026-11-20T07:00:00.000Z', 'créneau prévu : après 22 h → le lendemain 8 h');
const mig = lire('../supabase/migrations/20261118220000_email_logs_index_relances_cloud.sql');
ok(mig.includes("'cloud_relance_arret'") && mig.includes("'cloud_relance_essai'") && mig.includes('email_logs_one_shot_unique'), 'la migration nomme les deux types dans l\'index one-shot');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert');
process.exit(ko ? 1 : 0);
