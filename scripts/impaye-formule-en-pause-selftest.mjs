// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 13/11/2026 (3e réponse de Nico, point d) — LE MAIL D'IMPAYÉ DIT CE QUI EST EN PAUSE, ET COMMENT REPRENDRE
//     npm run selftest:impaye-formule-en-pause
// ═══════════════════════════════════════════════════════════════════════════
// « Mail d'impayé : il doit dire que la formule et le Cloud sont en pause, et comment reprendre. »
// La vraie règle (code relu le 13/11) : impayé = gratuit sur les trois canaux (règle de Nico du 29/10) — Stripe past_due ne
// porte plus de palier ni de Cloud (cloud-option.js litAbonnementStripe) ; Apple DID_FAIL_TO_RENEW et Google ON_HOLD /
// IN_GRACE_PERIOD → off. Avant : le mail Stripe d'une formule (Premium, Pro, Business, ou … + Cloud) ne disait RIEN de la
// pause (« Ton abonnement n'a pas pu être renouvelé » + la facture), et pouvait dire « Ton abonnement reste actif » ; le
// mail Apple / Google d'une formule finissait par « FillSell Cloud repart tout seul » (le Cloud seul, pas la formule).
// Comment reprendre, par canal : Stripe → régler la facture (bouton : page Stripe, avec la carte ou une autre) ; changer de
// carte → fillsell.app, Réglages › Abonnement › Mes factures (portail Stripe : « payment_method_update » activé, relu le
// 13/11) ; Apple → le moyen de paiement chez Apple ; Google → chez Google Play. Le palier et le Cloud repartent seuls au paiement.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const PE = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/paiement-echoue.js')).href);
const CM = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/cloud-mails.js')).href);
const corps = (m) => [m.sujet, m.intro, m.encadre, ...(m.suite ?? []), m.bouton?.texte ?? '', m.fin ?? ''].join(' ');
const LIEN = 'https://invoice.stripe.com/i/acct_x/live_y';

console.log('A. Stripe (paiement-echoue.js) — renouvellement refusé, abonnement past_due');
for (const [plan, offre, nom] of [['Premium', null, 'Premium'], ['Pro', null, 'Pro'], ['Business', null, 'Business'], ['Pro + Cloud', 'formule_cloud', 'Pro + Cloud'], ['Premium + Cloud', 'formule_cloud', 'Premium + Cloud']]) {
  for (const lang of ['fr', 'en']) {
    const m = PE.texteEchec({ lang, cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, relanceLe: '2026-11-17T10:00:00Z', abonnementActif: false, offre, plan });
    const t = corps(m);
    const pause = lang === 'en' ? new RegExp(`${nom.replace('+', '\\+')} is paused`) : new RegExp(`${nom.replace('+', '\\+')} est en pause`);
    ok(pause.test(t), `${nom} (${lang}) : la formule est dite EN PAUSE`, t);
    if (offre) ok(lang === 'en' ? /FillSell Cloud/.test(t) && /plan's features/.test(t) : /FillSell Cloud et les avantages de ta formule/.test(t), `${nom} (${lang}) : le Cloud aussi est dit en pause`, t);
    ok(lang === 'en' ? /starts again on its own/.test(t) : /repart tout seul|repart toute seule/.test(t), `${nom} (${lang}) : elle repart seule au paiement`, t);
    ok(lang === 'en' ? /Settings › Subscription › My invoices/.test(t) : /Réglages › Abonnement › Mes factures/.test(t), `${nom} (${lang}) : comment reprendre — régler la facture, ou changer de carte (Mes factures)`, t);
    ok(!/reste actif|stays active/.test(t), `${nom} (${lang}) : jamais « ton abonnement reste actif » (impayé = gratuit)`, t);
    ok(!/ordinateur|computer/i.test(t), `${nom} (${lang}) : sans « ordinateur »`, t);
  }
}
const fe = corps(PE.texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'fin_essai', lienFacture: LIEN, offre: 'formule_cloud', plan: 'Pro + Cloud' }));
ok(/Pro \+ Cloud est en pause/.test(fe), 'fin d’essai de Pro + Cloud ratée : en pause, dit', fe);
const sc = corps(PE.texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'souscription', offre: null, plan: 'Pro' }));
ok(!/en pause/.test(sc), 'souscription jamais ouverte : pas de « en pause » (rien n’a été ouvert)', sc);
const cl = corps(PE.texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, offre: 'cloud', plan: 'Cloud' }));
ok(/FillSell Cloud est en pause/.test(cl) && /repart tout seul/.test(cl), 'Cloud seul : « FillSell Cloud est en pause … repart tout seul » (inchangé)', cl);
const actif = corps(PE.texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, abonnementActif: true, plan: 'Pro' }));
ok(!/en pause/.test(actif), 'abonnement relu « active » (droits encore ouverts) : jamais « en pause »', actif);

console.log('\nB. Le nom de la formule et sa nature arrivent jusqu’au mail (stripe-webhook → email-tunnel)');
const FS = await import('node:fs');
const w = FS.readFileSync(join(ROOT, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
ok(/faitsEchec\(\{ facture, abonnement, estCloud, formule: formuleEchec \}\)/.test(w), 'stripe-webhook : faitsEchec reçoit la formule avec Cloud');
const et = FS.readFileSync(join(ROOT, 'supabase/functions/email-tunnel/index.ts'), 'utf8');
ok(/plan: pf\.plan \?\? null/.test(et), 'email-tunnel : le nom de la formule passe au mail');
const ef = FS.readFileSync(join(ROOT, 'supabase/functions/_shared/emails-fillsell.ts'), 'utf8');
ok(/plan\?: string \| null/.test(ef) && /plan: e\.plan \?\? null/.test(ef), 'emails-fillsell : mailPaiementEchoue transmet le nom');

console.log('\nC. Apple / Google (cloud-mails.js) — formule avec Cloud impayée');
for (const canal of ['apple', 'google']) {
  for (const lang of ['fr', 'en']) {
    const m = CM.texteMailFormule({ evenement: 'impaye', lang, canal, faits: { formule: 'pro_cloud' } });
    const t = (m?.paragraphes ?? []).join(' ');
    ok(lang === 'en' ? /Pro \+ Cloud is paused: the Cloud and your plan's features/.test(t) : /Pro \+ Cloud est en pause : le Cloud et les avantages de ta formule/.test(t), `${canal} (${lang}) : formule ET Cloud en pause`, t);
    ok(lang === 'en' ? (canal === 'apple' ? /payment method with Apple/.test(t) : /payment method with Google Play/.test(t)) : (canal === 'apple' ? /moyen de paiement chez Apple/.test(t) : /moyen de paiement chez Google Play/.test(t)), `${canal} (${lang}) : comment reprendre (le moyen de paiement chez la boutique)`, t);
    ok(lang === 'en' ? !/FillSell Cloud starts again on its own/.test(t) : !/FillSell Cloud repart tout seul/.test(t), `${canal} (${lang}) : plus « FillSell Cloud repart tout seul » sous une FORMULE (c’est toute la formule qui repart)`, t);
  }
}

// ── D. (13/11/2026, règle permanente de Nico) Un client FillSell Cloud ne lit JAMAIS « ordinateur » ni « Chrome » ─────────
// Tous les textes de paiement qu'un client du Cloud reçoit ou voit : les mails du Cloud seul et des formules avec Cloud
// (chaque événement × canal × langue × contexte), le mail d'impayé Stripe du Cloud et d'une formule avec Cloud (chaque cause
// et contexte), la ligne commune des cartes de paiement des formules. Avant : « … passent par l'extension FillSell, sur ton
// ordinateur » (impayé, arrêt), « plus besoin d'ordinateur » (début d'essai), « sans ordinateur » (cartes).
console.log('\nD. Aucun « ordinateur » ni « Chrome » dans un texte de paiement d’un client Cloud');
const INTERDIT = /ordinateur|computer|chrome/i;
const fautes = [];
const voir = (ou, texte) => { if (INTERDIT.test(String(texte ?? ''))) fautes.push(`${ou} : ${String(texte).match(/.{0,60}(ordinateur|computer|chrome).{0,30}/i)?.[0]}`); };
const toutTexteMail = (m) => (m ? [m.sujet, m.titre, m.preheader, ...(m.paragraphes ?? []), m.bouton?.texte, m.raisonEnvoi].join(' ') : '');
const FAITS = [
  {}, { contexte: 'fin_essai' }, { contexte: 'renouvellement' }, { contexte: 'debut' }, { contexte: 'changement' },
  { aucunPrelevement: true }, { aucunPrelevement: true, abonne: true }, { retraitCloud: true }, { abonne: true },
  { finIso: '2026-11-20T10:00:00Z', prochaineIso: '2026-12-20T10:00:00Z', arreteIso: '2026-11-14T10:00:00Z', montant: '24,99 €' },
];
let rendus = 0;
for (const evenement of CM.EVENEMENTS_MAIL ?? []) {
  for (const canal of ['stripe', 'apple', 'google', null]) {
    for (const lang of ['fr', 'en']) {
      for (const f of FAITS) {
        for (const formule of [null, 'premium_cloud', 'pro_cloud', 'business_cloud']) {
          const faits = formule ? { ...f, formule } : f;
          let m = null;
          try { m = CM.texteMailCloud({ evenement, lang, canal, faits, prix: '24,99 €' }); } catch { m = null; }
          if (m) { rendus++; voir(`mail ${evenement}/${canal}/${lang}/${formule ?? 'cloud'}`, toutTexteMail(m)); }
        }
      }
    }
  }
}
for (const lang of ['fr', 'en']) {
  for (const contexte of PE.CONTEXTES ?? []) {
    for (const cause of PE.CAUSES ?? []) {
      for (const [offre, plan] of [['cloud', 'Cloud'], ['formule_cloud', 'Pro + Cloud']]) {
        for (const lienFacture of [LIEN, null]) {
          const m = PE.texteEchec({ lang, cause, contexte, lienFacture, relanceLe: '2026-11-17T10:00:00Z', offre, plan });
          rendus++; voir(`impayé Stripe ${offre}/${contexte}/${cause}/${lang}`, corps(m));
        }
      }
    }
  }
}
const TFo = await import(pathToFileURL(join(ROOT, 'src/cloud/textesFormules.js')).href).catch(() => null);
for (const lang of ['fr', 'en']) { rendus++; voir(`cartes des formules (${lang}) ligneCommune`, TFo?.textesFormules?.(lang)?.ligneCommune); }
ok(rendus > 200, `${rendus} textes de paiement du Cloud rendus par le vrai code`);
ok(fautes.length === 0, 'aucun « ordinateur » / « computer » / « Chrome » dans un texte de paiement d’un client Cloud', fautes.slice(0, 6).join(' | '));
ok(/il ne publie, ne republie et ne retire plus tes annonces/.test(PE.texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, offre: 'cloud' }).suite.join(' ')),
  'impayé du Cloud seul : la phrase vraie du Cloud (il ne publie, ne republie et ne retire plus ; les annonces en ligne y restent)');

console.log(`\n${rouges === 0 ? '✓' : '✗'} impaye-formule-en-pause : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
