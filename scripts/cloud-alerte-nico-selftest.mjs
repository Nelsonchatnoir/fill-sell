// selftest:cloud-alerte-nico — (08/11/2026, jour J, ajout de Nico) L'ALERTE À NICO À CHAQUE ÉVÉNEMENT D'ARGENT DU CLOUD.
//   1. Le texte : compte, canal, palier FillSell, montant lu à la source (sans montant si elle se tait), date de Paris ;
//      seulement essai, paiement, arrêt (arrêt d'essai seulement confirmé) ; HTML échappé.
//   2. L'envoi : une alerte par événement (registre public.cloud_mails, clé « alerte: » à part du mail client), rejouée
//      = rien, envoi raté = clé libérée, registre illisible = rien, ne lève jamais ; adresse = support@fillsell.app.
//   3. Le câblage : mailsCloud (le point unique des 4 fonctions) envoie l'alerte APRÈS les mails clients, chacun dans
//      son filet ; les mails clients ne changent pas ; même adresse que l'alerte des IP ; envoi de test d'email-tunnel
//      derrière le secret.
//   npm run selftest:cloud-alerte-nico
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALERTE_CLOUD_DESTINATAIRE, EVENEMENTS_ALERTE, cleAlerte, typeAlerte, dateParis, texteAlerteCloud, envoyerAlertesCloud,
} from '../supabase/functions/_shared/cloud-alerte-nico.js';
import { formatPrix } from '../supabase/functions/_shared/cloud-prix.js';
import { evenementsBoutique, evenementPaiementStripe, evenementDebutStripe, evenementArretStripe } from '../supabase/functions/_shared/cloud-mails.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const val = (t, k) => t.lignes.find(([x]) => x === k)?.[1] ?? null;

// ── 1. Le texte ─────────────────────────────────────────────────────────────
ok(ALERTE_CLOUD_DESTINATAIRE === 'support@fillsell.app', 'adresse des alertes : support@fillsell.app');
// (13/11, décision de Nico — couper le renouvellement ne coupe plus rien) + 'essai_renouvellement_coupe' : la coupure du
// renouvellement pendant l'essai n'est plus un « arrêt pendant l'essai » ; l'alerte interne la dit (aucun mail au client).
ok(JSON.stringify(EVENEMENTS_ALERTE) === '["essai_debut","paiement","arret_essai","arret_programme","essai_renouvellement_coupe"]', 'événements alertés : essai, paiement, arrêt pendant l’essai, arrêt programmé, renouvellement coupé pendant l’essai');
ok(cleAlerte('sub_123') === 'alerte:sub_123' && cleAlerte('x'.repeat(500)).length === 400, 'clé du registre à part du mail client, bornée à 400');
ok(typeAlerte('paiement') === 'cloud_alerte_paiement', 'type email_logs dédié');
ok(dateParis('2026-11-08T12:05:00Z') === 'dimanche 8 novembre 2026 à 13:05', 'date en heure de Paris (hiver : UTC+1)');
ok(dateParis('2026-07-01T12:05:00Z') === 'mercredi 1 juillet 2026 à 14:05', 'date en heure de Paris (été : UTC+2)');
ok(dateParis(null) === null && dateParis('pas une date') === null, 'date illisible : null');

const M = Date.parse('2026-11-08T12:05:00Z');
const profilPro = { email: 'client@exemple.fr', is_premium: true, is_pro: true };
const essai = texteAlerteCloud({ evenement: 'essai_debut', canal: 'apple', faits: { finIso: '2026-11-15T12:05:00Z' }, prix: { montant: 24.99, devise: 'EUR' }, userId: 'u1', profil: profilPro, cle: '2000001', maintenant: M });
ok(essai && /Nouvel essai/.test(essai.sujet) && /client@exemple\.fr/.test(essai.sujet) && /Apple/.test(essai.sujet), 'essai : sujet = nouvel essai, compte, canal');
ok(val(essai, 'Compte') === 'client@exemple.fr — u1', 'essai : compte (adresse + identifiant)');
ok(val(essai, 'Canal') === 'Apple (App Store)', 'essai : canal');
ok(val(essai, 'Palier FillSell') === 'Pro', 'essai : palier FillSell lu par palier.js (Pro, jamais un drapeau seul)');
ok(val(essai, 'Montant') === `${formatPrix({ montant: 24.99, devise: 'EUR' }, 'fr')} (prochaine échéance, après l’essai) — lu chez Apple`, 'essai : montant de la prochaine échéance, lu à la source');
ok(val(essai, 'Date') === 'dimanche 8 novembre 2026 à 13:05 (heure de Paris)' && val(essai, 'Fin de l’essai') === 'dimanche 15 novembre 2026 à 13:05 (heure de Paris)', 'essai : date de l’événement et fin d’essai, heure de Paris');
const essaiMuet = texteAlerteCloud({ evenement: 'essai_debut', canal: 'google', faits: {}, prix: null, userId: 'u1', profil: { email: 'a@b.fr' }, maintenant: M });
ok(val(essaiMuet, 'Montant') === 'non communiqué par Google Play' && val(essaiMuet, 'Palier FillSell') === 'Gratuit', 'essai : la source se tait → aucun montant inventé ; compte Free = Gratuit');

const pay = texteAlerteCloud({ evenement: 'paiement', canal: 'stripe', faits: { contexte: 'fin_essai', montant: { montant: 24.99, devise: 'EUR' }, prochaineIso: '2026-12-15T12:05:00Z' }, userId: 'u2', profil: { email: 'p@q.fr', is_business: true }, cle: 'in_1', maintenant: M });
ok(/Paiement .*24,99.* — premier mois \(fin d’essai\)/.test(pay.sujet) && /Stripe/.test(pay.sujet), 'paiement : sujet avec montant et contexte (premier mois)');
ok(val(pay, 'Montant') === `${formatPrix({ montant: 24.99, devise: 'EUR' }, 'fr')} — lu chez Stripe` && val(pay, 'Palier FillSell') === 'Business', 'paiement : montant payé lu à la source ; palier Business');
ok(val(pay, 'Prochaine échéance') === 'mardi 15 décembre 2026 à 13:05 (heure de Paris)', 'paiement : prochaine échéance en heure de Paris');
const renouv = texteAlerteCloud({ evenement: 'paiement', canal: 'google', faits: { contexte: 'renouvellement', montant: null }, userId: 'u2', profil: null, maintenant: M });
ok(/renouvellement/.test(renouv.sujet) && /montant non communiqué/.test(renouv.sujet) && val(renouv, 'Montant') === 'non communiqué par Google Play', 'renouvellement sans montant de la source : dit, jamais inventé');
ok(val(renouv, 'Compte') === '(adresse inconnue) — u2', 'profil illisible : l’alerte part quand même, avec l’identifiant');

const arretE = texteAlerteCloud({ evenement: 'arret_essai', canal: 'google', faits: { aucunPrelevement: true, arreteIso: '2026-11-09T08:00:00Z' }, userId: 'u3', profil: { email: 'r@s.fr' }, maintenant: M });
ok(/Arrêt pendant l’essai/.test(arretE.sujet) && /aucun prélèvement/.test(val(arretE, 'Événement')) && val(arretE, 'Montant') === null, 'arrêt pendant l’essai : dit, sans montant');
ok(texteAlerteCloud({ evenement: 'arret_essai', canal: 'apple', faits: {}, userId: 'u3', maintenant: M }) === null, 'arrêt d’essai NON confirmé par la boutique : aucune alerte (comme le mail client)');
// (13/11, décision de Nico) Le renouvellement coupé pendant l'essai : l'alerte dit que le Cloud CONTINUE jusqu'à la fin.
const coupe = texteAlerteCloud({ evenement: 'essai_renouvellement_coupe', canal: 'apple', faits: { aucunPrelevement: true, finIso: '2026-11-20T12:13:39Z' }, userId: 'u5', profil: { email: 'v@w.fr' }, maintenant: M });
ok(/Renouvellement coupé pendant l’essai/.test(coupe?.sujet ?? '') && /continue jusqu’au vendredi 20 novembre 2026 à 13:13/.test(val(coupe, 'Événement') ?? '') && /aucun mail au client/.test(val(coupe, 'Événement') ?? '')
  && val(coupe, 'Fin de l’essai') === 'vendredi 20 novembre 2026 à 13:13 (heure de Paris)' && !/Arrêt pendant/.test(coupe?.sujet ?? ''),
  'renouvellement coupé pendant l’essai : « continue jusqu’au … », aucun mail au client, jamais « arrêt »');
ok(texteAlerteCloud({ evenement: 'essai_renouvellement_coupe', canal: 'google', faits: {}, userId: 'u5', maintenant: M }) === null, 'coupure NON confirmée : aucune alerte');
const arretP = texteAlerteCloud({ evenement: 'arret_programme', canal: 'apple', faits: { finIso: '2026-12-08T12:05:00Z' }, userId: 'u4', profil: { email: 't@u.fr' }, maintenant: M });
ok(/Arrêt programmé/.test(arretP.sujet) && /jusqu’au mardi 8 décembre 2026 à 13:05/.test(val(arretP, 'Événement')), 'arrêt programmé : date de fin en heure de Paris');
ok(texteAlerteCloud({ evenement: 'impaye', canal: 'apple', faits: {}, userId: 'u', maintenant: M }) === null && texteAlerteCloud({ evenement: 'veille', canal: 'stripe', userId: 'u', maintenant: M }) === null, 'impayé, veille : hors alerte (ce ne sont pas des événements demandés)');
const piege = texteAlerteCloud({ evenement: 'paiement', canal: 'stripe', faits: { contexte: 'debut' }, userId: 'u', profil: { email: '<script>@x.fr' }, maintenant: M });
ok(!piege.html.includes('<script>') && piege.html.includes('&lt;script&gt;'), 'HTML échappé (une adresse piégée ne s’exécute pas)');
const test = texteAlerteCloud({ evenement: 'paiement', canal: 'stripe', faits: {}, userId: null, profil: null, maintenant: M, test: true });
ok(test.sujet.startsWith('[TEST] [FillSell Cloud]') && test.html.includes('Envoi de test'), 'envoi de test : marqué [TEST]');

// ── 2. L'envoi ──────────────────────────────────────────────────────────────
function banc({ envoi = () => ({ envoye: true }), registre = 'ok', profil = { email: 'c@d.fr', is_premium: true } } = {}) {
  const lignes = new Map();
  const envoyes = [];
  const deps = {
    lireProfil: async () => { if (profil instanceof Error) throw profil; return profil; },
    reserver: async ({ userId, evenement, cle }) => {
      if (registre === 'erreur') return 'erreur';
      const k = `${userId}|${evenement}|${cle}`;
      if (lignes.has(k)) return 'deja';
      lignes.set(k, { envoye: false });
      return 'pris';
    },
    liberer: async ({ userId, evenement, cle }) => { lignes.delete(`${userId}|${evenement}|${cle}`); },
    noter: async ({ userId, evenement, cle }) => { lignes.get(`${userId}|${evenement}|${cle}`).envoye = true; },
    lirePrix: async () => ({ montant: 24.99, devise: 'EUR' }),
    envoyer: async (m) => { envoyes.push(m); return envoi(m); },
  };
  return { lignes, envoyes, deps };
}
{
  // (14/11/2026, complément 3 point 2 de Nico) Seul le PAIEMENT reçu part encore (_shared/alertes-nico.js) : un essai
  // est réservé au registre (le journal), jamais envoyé.
  const b = banc();
  const ev = [{ evenement: 'essai_debut', cle: 'sub_1', canal: 'stripe', faits: {} }];
  const r1 = await envoyerAlertesCloud({ evenements: ev, userId: 'u1', deps: b.deps, maintenant: M });
  ok(r1[0].resultat === 'coupee' && b.envoyes.length === 0, '(14/11) un nouvel essai : AUCUN mail à Nico');
  ok(b.lignes.has('u1|essai_debut|alerte:sub_1') && b.lignes.get('u1|essai_debut|alerte:sub_1').envoye === false, '(14/11) registre : clé « alerte: » réservée = le journal (jamais notée envoyée)');
  const r2 = await envoyerAlertesCloud({ evenements: ev, userId: 'u1', deps: b.deps, maintenant: M });
  ok(r2[0].resultat === 'deja_envoye' && b.envoyes.length === 0, 'notification rejouée : rien de plus');
  const p = [{ evenement: 'paiement', cle: 'in_1', canal: 'stripe', faits: { contexte: 'fin_essai', montant: { montant: 24.99, devise: 'EUR' } } }];
  const r3 = await envoyerAlertesCloud({ evenements: p, userId: 'u1', deps: b.deps, maintenant: M });
  ok(r3[0].resultat === 'envoye' && b.envoyes.length === 1 && b.envoyes[0].to === 'support@fillsell.app' && b.envoyes[0].type === 'cloud_alerte_paiement', 'un paiement → une alerte « Paiement reçu », à support@fillsell.app');
  ok(b.lignes.get('u1|paiement|alerte:in_1').envoye === true && /24,99/.test(b.envoyes[0].html), 'registre : clé « alerte: » réservée puis notée ; le montant lu à la source');
  const r4 = await envoyerAlertesCloud({ evenements: p, userId: 'u1', deps: b.deps, maintenant: M });
  ok(r4[0].resultat === 'deja_envoye' && b.envoyes.length === 1, 'paiement rejoué : aucune seconde alerte');
}
{
  const b = banc();
  b.lignes.set('u1|paiement|in_9', { envoye: true });   // le mail CLIENT de ce paiement est déjà parti
  const r = await envoyerAlertesCloud({ evenements: [{ evenement: 'paiement', cle: 'in_9', canal: 'stripe', faits: { contexte: 'renouvellement', montant: { montant: 24.99, devise: 'EUR' } } }], userId: 'u1', deps: b.deps, maintenant: M });
  ok(r[0].resultat === 'envoye' && b.envoyes.length === 1, 'le mail client et l’alerte ne se gênent pas (clés distinctes, même registre)');
}
{
  let essais = 0;
  const b = banc({ envoi: () => (++essais === 1 ? { envoye: false, motif: 'resend_echec' } : { envoye: true }) });
  const ev = [{ evenement: 'paiement', cle: 'in_2:renouvellement', canal: 'apple', faits: { contexte: 'renouvellement' } }];
  const r1 = await envoyerAlertesCloud({ evenements: ev, userId: 'u2', deps: b.deps, maintenant: M });
  ok(r1[0].resultat === 'envoi_resend_echec' && !b.lignes.has('u2|paiement|alerte:in_2:renouvellement'), 'envoi raté : clé libérée');
  const r2 = await envoyerAlertesCloud({ evenements: ev, userId: 'u2', deps: b.deps, maintenant: M });
  ok(r2[0].resultat === 'envoye' && b.envoyes.length === 2, 'au rejeu suivant : l’alerte part (une seule fois au total)');
}
{
  const b = banc({ registre: 'erreur' });
  const r = await envoyerAlertesCloud({ evenements: [{ evenement: 'paiement', cle: 'in_1', canal: 'stripe', faits: {} }], userId: 'u', deps: b.deps, maintenant: M });
  ok(r[0].resultat === 'registre_illisible' && b.envoyes.length === 0, 'registre illisible (migration absente) : aucune alerte, échec fermé');
}
{
  const b = banc({ envoi: () => { throw new Error('réseau'); }, profil: new Error('base') });
  let leve = false, r = null;
  try { r = await envoyerAlertesCloud({ evenements: [{ evenement: 'paiement', cle: 'in_2', canal: 'google', faits: {} }], userId: 'u', deps: b.deps, maintenant: M }); } catch { leve = true; }
  ok(!leve && /^erreur:/.test(r[0].resultat), 'envoi qui lève, profil illisible : jamais d’exception (le paiement continue)');
}
{
  const b = banc();
  const r = await envoyerAlertesCloud({ evenements: [{ evenement: 'impaye', cle: 'x', canal: 'apple' }, { evenement: 'arret_essai', cle: 'y', canal: 'apple', faits: {} }], userId: 'u', deps: b.deps, maintenant: M });
  ok(b.envoyes.length === 0 && r.length === 1 && r[0].resultat === 'sans_alerte' && b.lignes.size === 0, 'impayé ignoré ; arrêt d’essai non confirmé : rien réservé, rien envoyé');
  ok((await envoyerAlertesCloud({ evenements: [{ evenement: 'paiement', cle: 'z' }], userId: null, deps: b.deps })).length === 0, 'sans compte : rien');
}
{
  // Les événements réels des quatre fonctions passent tels quels (mêmes constructeurs que les mails clients).
  const b = banc();
  const evts = [
    ...evenementDebutStripe({ id: 'sub_A', status: 'trialing', trial_end: 1763200000 }),
    ...evenementPaiementStripe({ id: 'in_A', amount_paid: 2499, currency: 'eur', billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: 1763200000, end: 1765800000 } }] } }, { trial_end: 1763200000 }),
    ...evenementArretStripe({ id: 'sub_A', status: 'active', cancel_at_period_end: true, current_period_end: 1765800000 }),
    ...evenementsBoutique({ canal: 'google', nature: 'debut', update: { cloud_essai_debut: '2026-11-08T12:00:00Z', cloud_essai_fin: '2026-11-15T12:00:00Z' }, lecture: { essai: true }, ref: 'jeton-google' }),
  ];
  const r = await envoyerAlertesCloud({ evenements: evts, userId: 'u9', deps: b.deps, maintenant: M });
  ok(r.length === 4 && r.map((x) => x.resultat).join(',') === 'coupee,envoye,coupee,coupee' && b.envoyes.length === 1,
    '(14/11) Stripe essai, paiement (fin d’essai), arrêt programmé ; Google essai : seul le PAIEMENT part');
  ok(/premier mois/.test(b.envoyes[0].subject) && /24,99/.test(b.envoyes[0].subject), 'Stripe : montant de la facture (2499 c€) dans le sujet');
}

// ── 3. Le câblage ───────────────────────────────────────────────────────────
const envoi = lire('supabase/functions/_shared/cloud-mails-envoi.ts');
ok(/const bilanClient = await mailsClient\(admin, \{ \.\.\.p, lirePrix: lirePrixUneFois \}, prefixe\);\n\s*await alertesNico\(admin, \{ \.\.\.p, lirePrix: lirePrixUneFois \}, prefixe\);\n\s*return bilanClient;/.test(envoi),
  'mailsCloud : mails clients d’abord, puis l’alerte ; la réponse reste celle des mails clients');
ok(/async function alertesNico[\s\S]*?try \{[\s\S]*?\} catch \(e\) \{\n\s*console\.error\(`\$\{prefixe\} alerte Cloud à Nico impossible/.test(envoi), 'alertesNico : tout dans un filet, jamais d’exception');
ok(/envoyerEmail\(\{ to, subject, html, userId: null, type, categorie: "support", dedup: "journal" \}\)/.test(envoi), 'alerte : porte d’envoi unique, catégorie support, journal email_logs');
ok(/from\("profiles"\)\.select\("email, is_premium, is_pro, is_business, is_comped"\)/.test(envoi), 'alerte : profil lu pour le compte et le palier');
ok(/envoyer: \(\{ to, subject, html, userId, type \}[\s\S]*?envoyerEmail\(\{ to, subject, html, userId, type, categorie: CATEGORIE_MAILS_CLOUD as "support", dedup: "journal" \}\)/.test(envoi), 'mails clients : même envoi qu’avant (inchangé)');
const regles = lire('supabase/functions/_shared/cloud-mails.js');
ok(!/alerte/i.test(regles.replace(/\/\/.*$/gm, '')), 'cloud-mails.js (textes et envoi clients) ne connaît pas l’alerte : les mails clients ne changent pas');
for (const f of ['stripe-webhook', 'cancel-subscription', 'apple-iap-webhook', 'google-play-webhook']) {
  ok(/await mailsCloud\(/.test(lire(`supabase/functions/${f}/index.ts`)), `${f} : passe par mailsCloud (alerte comprise)`);
}
ok(/^ALERTES_DESTINATAIRE=support@fillsell\.app$/m.test(lire('serveur-cloud/deploiement/env.exemple'))
  && /alertesDestinataire: env\.ALERTES_DESTINATAIRE\?\.trim\(\) \|\| 'support@fillsell\.app'/.test(lire('serveur-cloud/src/config.js')),
  'même adresse que l’alerte des IP en pause (orchestrateur : ALERTES_DESTINATAIRE, défaut support@fillsell.app)');
const tunnel = lire('supabase/functions/email-tunnel/index.ts');
const iSecret = tunnel.indexOf('if (!expectedSecret || cronSecret !== expectedSecret)');
const iTest = tunnel.indexOf('if (body?.alerte_cloud_test === true)');
ok(iSecret > 0 && iTest > iSecret, 'email-tunnel : l’envoi de test est derrière le secret du cron');
ok(/export async function envoyerAlerteCloudTest[\s\S]*?test: true[\s\S]*?to: ALERTE_CLOUD_DESTINATAIRE/.test(envoi), 'envoi de test : même texte, même adresse, marqué TEST, sans registre');

console.log(`✓ selftest:cloud-alerte-nico — ${n} assertions`);
