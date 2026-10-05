// Selftest — le mail « paiement échoué » (05/10/2026), SANS réseau ni Stripe.
//
//     npm run selftest:paiement-echoue   (node scripts/paiement-echoue-selftest.mjs)
//
// Ce qu'il prouve :
//   · la fin d'essai se lit sur les données de Stripe (billing_reason
//     subscription_cycle + une ligne dont period.start = abonnement.trial_end),
//     jamais devinée ; souscription / renouvellement comme avant ;
//   · le bouton ne mène qu'à un geste réel : l'app pour une souscription (la
//     page de paiement s'y rouvre), la page Stripe d'une facture OUVERTE sinon,
//     aucun bouton quand il n'y a rien à régler en ligne ;
//   · 3D Secure : jamais « retenté automatiquement » ; carte expirée non plus ;
//     fin d'essai : ni « renouvellement » ni « reste actif » ; « reste actif »
//     seulement si Stripe le dit ; aucun « moyen de paiement depuis l'app » ;
//   · les 24 variantes (fr/en × 4 causes × 3 contextes) et les cas sans lien,
//     rendues par le VRAI gabarit (_shared/emails-fillsell.ts) : un mail anglais
//     n'a plus un mot de français, pied compris ; le pied français est inchangé ;
//   · le câblage : stripe-webhook → payment-notify → email-tunnel passe les faits.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CAUSES, CONTEXTES, LIEN_APP, estFinEssai, contexteEchec, lienFacture, lienStripeSur,
  faitsEchec, dateRelance, texteEchec,
} from '../supabase/functions/_shared/paiement-echoue.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(`\n${t}`);
const lire = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const FIN_ESSAI = 1_791_300_000;                       // fin d'essai de l'abonnement (s)
const MOIS = 30 * 86_400;
const LIEN = 'https://invoice.stripe.com/i/acct_X/live_YWNjdF8x';
const ligne = (debut) => ({ period: { start: debut, end: debut + MOIS } });
const facture = (o = {}) => ({ id: 'in_1', status: 'open', billing_reason: 'subscription_cycle', hosted_invoice_url: LIEN, next_payment_attempt: FIN_ESSAI + 3 * 86_400, lines: { data: [ligne(FIN_ESSAI)] }, ...o });
const abo = (o = {}) => ({ id: 'sub_1', status: 'past_due', trial_end: FIN_ESSAI, metadata: { option: 'cloud' }, ...o });

titre('Fin d\'essai : lue sur Stripe (billing_reason, trial_end, période de la ligne)');
ok(estFinEssai(facture(), abo()) === true, 'subscription_cycle + ligne qui commence à trial_end → fin d\'essai');
ok(estFinEssai(facture({ lines: { data: [ligne(FIN_ESSAI + 45)] } }), abo()) === true, 'à 45 s près (même seconde chez Stripe, une minute de marge)');
ok(estFinEssai(facture({ lines: { data: [ligne(FIN_ESSAI + MOIS)] } }), abo()) === false, 'le cycle suivant (un mois après la fin d\'essai) → renouvellement');
ok(estFinEssai(facture(), abo({ trial_end: null })) === false, 'abonnement sans essai → jamais une fin d\'essai');
ok(estFinEssai(facture(), null) === false, 'abonnement illisible → pas de fin d\'essai supposée');
ok(estFinEssai(facture({ billing_reason: 'subscription_create' }), abo()) === false, 'subscription_create → jamais une fin d\'essai');
ok(estFinEssai(facture({ billing_reason: 'subscription_update' }), abo()) === false, 'subscription_update → non');
ok(estFinEssai(facture({ lines: { data: [] } }), abo()) === false, 'facture sans ligne → non');
ok(estFinEssai(facture({ lines: { data: [{ period: { start: '1791300000' } }] } }), abo()) === false, 'période illisible (texte) → non');
ok(contexteEchec(facture({ billing_reason: 'subscription_create' }), abo()) === 'souscription', 'contexte : souscription');
ok(contexteEchec(facture(), abo()) === 'fin_essai', 'contexte : fin_essai');
ok(contexteEchec(facture({ lines: { data: [ligne(FIN_ESSAI + MOIS)] } }), abo()) === 'renouvellement', 'contexte : renouvellement');
ok(contexteEchec(facture({ billing_reason: 'manual' }), abo()) === 'renouvellement', 'autre billing_reason → renouvellement (comme avant)');

titre('Le lien de la facture : une page Stripe réglable, rien d\'autre');
ok(lienFacture(facture()) === LIEN, 'facture ouverte, https, invoice.stripe.com → le lien');
ok(lienFacture(facture({ status: 'paid' })) === null, 'facture déjà payée → aucun lien');
ok(lienFacture(facture({ status: 'void' })) === null, 'facture annulée → aucun lien');
ok(lienFacture(facture({ status: 'uncollectible' })) === null, 'facture irrécouvrable → aucun lien');
ok(lienStripeSur('http://invoice.stripe.com/i/x') === null, 'http → refusé');
ok(lienStripeSur('https://invoice.stripe.com.exemple.net/i/x') === null, 'faux hôte qui commence comme Stripe → refusé');
ok(lienStripeSur('https://evil.com/?u=https://invoice.stripe.com') === null, 'autre hôte → refusé');
ok(lienStripeSur('javascript:alert(1)') === null && lienStripeSur('') === null && lienStripeSur(null) === null, 'javascript:, vide, null → refusés');
ok(lienStripeSur('https://pay.stripe.com/invoice/x') === 'https://pay.stripe.com/invoice/x', 'pay.stripe.com → accepté');

titre('Les faits transmis à email-tunnel');
{
  const s = faitsEchec({ facture: facture({ billing_reason: 'subscription_create' }), abonnement: abo({ status: 'incomplete' }) });
  ok(s.contexte === 'souscription' && s.lien_facture === null && s.relance_le === null && s.abonnement_actif === false, 'souscription : ni lien de facture, ni relance, ni « actif »');
  const r = faitsEchec({ facture: facture({ lines: { data: [ligne(FIN_ESSAI + MOIS)] } }), abonnement: abo({ status: 'past_due', metadata: {} }) });
  ok(r.contexte === 'renouvellement' && r.lien_facture === LIEN && r.abonnement_actif === true && r.offre === null, 'renouvellement past_due : lien, « actif »');
  ok(r.relance_le === new Date((FIN_ESSAI + 3 * 86_400) * 1000).toISOString(), 'relance = next_payment_attempt (ISO)');
  const r2 = faitsEchec({ facture: facture({ lines: { data: [ligne(FIN_ESSAI + MOIS)] }, next_payment_attempt: null }), abonnement: abo({ status: 'unpaid' }) });
  ok(r2.abonnement_actif === false && r2.relance_le === null, 'unpaid, sans prochaine tentative : ni « actif », ni relance');
  const f = faitsEchec({ facture: facture(), abonnement: abo(), estCloud: true });
  ok(f.contexte === 'fin_essai' && f.offre === 'cloud' && f.abonnement_actif === false && f.lien_facture === LIEN, 'fin d\'essai Cloud : lien, jamais « actif »');
  const sans = faitsEchec({ facture: facture({ status: 'void' }), abonnement: abo() });
  ok(sans.lien_facture === null, 'facture close → aucun lien transmis');
}
ok(dateRelance('2026-10-08T12:00:00Z', 'fr') === 'jeudi 8 octobre', 'date de relance fr : « jeudi 8 octobre » (Paris)');
ok(dateRelance('2026-10-08T12:00:00Z', 'en') === 'Thursday 8 October', 'date de relance en : « Thursday 8 October »');
ok(dateRelance('2026-10-08T22:30:00Z', 'fr') === 'vendredi 9 octobre', 'heure de Paris, pas UTC (22:30 UTC = vendredi 00:30)');

titre('Les textes : chaque variante, chaque promesse');
const RELANCE = '2026-10-08T12:00:00Z';
const FRANCAIS = /[éèêàçùûôîâ]|\b(ton|ta|tes|le|la|les|une?|des|et|pas|rien|réponds|abonnement|paiement|facture|banque|carte)\b/i;
const variantes = [];
for (const lang of ['fr', 'en']) {
  for (const contexte of CONTEXTES) {
    for (const cause of CAUSES) {
      const t = texteEchec({ lang, cause, contexte, lienFacture: LIEN, relanceLe: RELANCE, abonnementActif: contexte === 'renouvellement', offre: contexte === 'fin_essai' ? 'cloud' : null });
      variantes.push({ lang, contexte, cause, t });
      const tout = [t.sujet, t.preheader, t.salut, t.intro, t.encadre, ...t.suite, t.bouton?.texte, t.fin, t.raisonEnvoi].filter(Boolean).join(' \n ');
      const nom = `${lang} · ${contexte} · ${cause}`;
      if (lang === 'en') ok(!FRANCAIS.test(tout), `${nom} : pas un mot de français`);
      else ok(!/\b(your|the|payment|bank|please|you)\b/i.test(tout), `${nom} : pas un mot d'anglais`);
      ok(t.encadre.includes(lang === 'fr' ? "Rien n'a été débité." : 'Nothing was charged.'), `${nom} : « rien n'a été débité »`);
      if (cause === '3ds') ok(!/retent|retried|try the payment again|automatiquement|automatically/i.test(tout), `${nom} : 3D Secure, aucune nouvelle tentative promise`);
      if (cause === 'carte_expiree') ok(!/retent|try the payment again/i.test(tout), `${nom} : carte expirée, aucune nouvelle tentative promise`);
      if (cause === 'carte_expiree') ok(!/même carte|same card|ta carte ou|your card or/i.test(tout), `${nom} : carte expirée, jamais « la même carte »`);
      if (contexte === 'fin_essai') ok(!/renouvel|renewal|reste actif|stays active/i.test(tout), `${nom} : ni renouvellement, ni « reste actif »`);
      ok(!/moyen de paiement depuis|payment method from the app/i.test(tout), `${nom} : aucun « moyen de paiement depuis l'app »`);
      if (contexte === 'souscription') ok(t.bouton?.url === LIEN_APP, `${nom} : bouton → l'app (la page de paiement s'y rouvre), jamais la facture`);
      else ok(t.bouton?.url === LIEN, `${nom} : bouton → page Stripe de la facture`);
      if (cause === '3ds' && contexte !== 'souscription') ok(t.bouton.texte === (lang === 'fr' ? 'Valider le paiement' : 'Confirm the payment'), `${nom} : bouton « valider »`);
      const relanceDite = /retentera|try the payment again/.test(tout);
      ok(relanceDite === (contexte !== 'souscription' && (cause === 'carte_refusee' || cause === 'autre')), `${nom} : relance dite seulement si Stripe la prévoit et qu'elle peut aboutir`);
      ok(/reste actif|stays active/.test(tout) === (contexte === 'renouvellement'), `${nom} : « reste actif » seulement au renouvellement actif`);
    }
  }
}
ok(variantes.length === 24, '24 variantes (fr/en × 3 contextes × 4 causes)');
{
  const t = texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, relanceLe: RELANCE, abonnementActif: false });
  ok(!/reste actif/.test(t.suite.join(' ')), 'renouvellement, Stripe ne dit pas l\'abonnement actif → on ne le dit pas');
  const t2 = texteEchec({ lang: 'fr', cause: 'carte_refusee', contexte: 'renouvellement', lienFacture: LIEN, relanceLe: null, abonnementActif: true });
  ok(!/retentera/.test(t2.suite.join(' ')), 'aucune prochaine tentative chez Stripe → on ne la promet pas');
  for (const lang of ['fr', 'en']) for (const contexte of ['renouvellement', 'fin_essai']) for (const cause of CAUSES) {
    const s = texteEchec({ lang, cause, contexte, lienFacture: null, relanceLe: null, abonnementActif: false, offre: 'cloud' });
    ok(s.bouton === null && s.fin === null && /réponds à ce mail|reply to this email/i.test(s.suite[0]), `${lang} · ${contexte} · ${cause}, sans lien : aucun bouton, la réponse au mail`);
  }
  const malveillant = texteEchec({ lang: 'fr', cause: '3ds', contexte: 'renouvellement', lienFacture: 'https://evil.com/x' });
  ok(malveillant.bouton === null, 'un lien hors Stripe reçu par email-tunnel ne fait jamais un bouton');
  const nonCloud = texteEchec({ lang: 'fr', cause: 'autre', contexte: 'fin_essai', lienFacture: LIEN, offre: null });
  ok(!/Cloud/.test(nonCloud.sujet + nonCloud.intro + nonCloud.suite.join(' ')), 'fin d\'essai hors Cloud : texte générique, sans « Cloud »');
  const inconnu = texteEchec({ lang: 'de', cause: 'xyz', contexte: 'abc' });
  ok(inconnu.intro.startsWith("Ton abonnement n'a pas pu démarrer") && inconnu.bouton?.url === LIEN_APP, 'langue, cause ou contexte inconnus → français, « autre », souscription (comme avant)');
}

titre('Le rendu complet, par le vrai gabarit (pied fr / en)');
let E;
try { E = await import('../supabase/functions/_shared/emails-fillsell.ts'); } catch (e) { ok(false, `emails-fillsell.ts importable par node (≥ 22.18, types effacés) : ${e.message}`); }
if (E) {
  const texteVisible = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#847;|&zwnj;|&middot;|&#8594;/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  for (const { lang, contexte, cause } of variantes) {
    const m = E.mailPaiementEchoue({ lang, cause, contexte, lienFacture: LIEN, relanceLe: RELANCE, abonnementActif: contexte === 'renouvellement', offre: contexte === 'fin_essai' ? 'cloud' : null });
    const vu = texteVisible(m.html);
    const nom = `${lang} · ${contexte} · ${cause}`;
    if (lang === 'en') ok(!/Une question|Écris-nous|réponds à ce mail|Mentions légales|Confidentialité|Tu reçois|Salut/.test(vu) && /Questions\? Write to us at support@fillsell\.app or just reply to this email\./.test(vu) && /Legal notice/.test(vu) && /Privacy/.test(vu) && m.html.includes('<html lang="en"'), `${nom} : rendu anglais de bout en bout (pied compris)`);
    else ok(/Une question \? Écris-nous à support@fillsell\.app ou réponds à ce mail\./.test(vu) && /Mentions légales/.test(vu) && /Confidentialité/.test(vu) && m.html.includes('<html lang="fr"'), `${nom} : pied français inchangé`);
    const hrefs = [...m.html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((x) => x[1]);   // les liens cliquables (pas la feuille de police du <head>)
    ok(hrefs.includes(contexte === 'souscription' ? LIEN_APP : LIEN), `${nom} : le bouton porte le bon lien`);
    ok(hrefs.every((h) => h === LIEN || h === LIEN_APP || h === 'mailto:support@fillsell.app' || h === `https://fillsell.app/legal${lang === 'en' ? '?lang=en' : ''}#mentions` || h === `https://fillsell.app/legal${lang === 'en' ? '?lang=en' : ''}#confidentialite`),`${nom} : aucun autre lien (app, facture, contact, mentions, confidentialité)`);
  }
  const b = E.mailBienvenue('en', 'https://fillsell.app/desinscription?t=x');
  ok(/>Unsubscribe</.test(b.html) && !/Me désinscrire/.test(b.html), 'les autres mails anglais aussi : « Unsubscribe » au lieu de « Me désinscrire »');
  const bf = E.mailBienvenue('fr', 'https://fillsell.app/desinscription?t=x');
  ok(/>Me désinscrire</.test(bf.html), 'mail français : « Me désinscrire » inchangé');
}

titre('Les liens du pied mènent à des pages qui existent (relu dans l\'app)');
{
  const legal = lire('../src/pages/Legal.jsx');
  ok(/path: '\/legal'/.test(legal) && /<Section id="mentions"/.test(legal) && /<Section id="confidentialite"/.test(legal), '/legal porte les sections #mentions et #confidentialite');
  ok(/LIEN_MENTIONS = "https:\/\/fillsell\.app\/legal#mentions"/.test(lire('../supabase/functions/_shared/email-template.ts')), 'le gabarit pointe sur /legal#mentions');
  // (05/10) Le pied anglais ajoute ?lang=en, que /legal lit avant le réglage de l'app.
  ok(/LIEN_MENTIONS_EN = "https:\/\/fillsell\.app\/legal\?lang=en#mentions"/.test(lire('../supabase/functions/_shared/email-template.ts')), 'pied anglais : /legal?lang=en#mentions');
  ok(/searchParams|URLSearchParams/.test(legal) && /\.get\('lang'\)/.test(legal), '/legal lit ?lang= (rendu vérifié par selftest:legal-langue)');
}

titre('Le câblage : stripe-webhook → payment-notify → email-tunnel');
{
  const wh = lire('../supabase/functions/stripe-webhook/index.ts');
  ok(/import \{ faitsEchec \} from "\.\.\/_shared\/paiement-echoue\.js"/.test(wh), 'stripe-webhook importe faitsEchec');
  ok(/stripe\.invoices\.retrieve\(invoice\.id\)/.test(wh) && /stripe\.subscriptions\.retrieve\(subEchec\)/.test(wh), 'stripe-webhook RELIT la facture et l\'abonnement chez Stripe');
  ok(/faitsEchec\(\{ facture, abonnement, estCloud \}\)/.test(wh), 'faits établis sur la facture et l\'abonnement relus');
  for (const champ of ['lien_facture: faits.lien_facture', 'relance_le: faits.relance_le', 'abonnement_actif: faits.abonnement_actif', 'offre: faits.offre', 'contexte: faits.contexte']) ok(wh.includes(champ), `stripe-webhook transmet ${champ.split(':')[0]}`);
  ok(/facture\?\.payment_intent \?\?/.test(wh), 'la cause fine se lit sur la facture relue (payment_intent absent du format dahlia)');
  const pn = lire('../supabase/functions/_shared/payment-notify.ts');
  ok(/contexte: "souscription" \| "renouvellement" \| "fin_essai"/.test(pn) && /lien_facture\?: string \| null/.test(pn), 'payment-notify porte fin_essai et les faits');
  const et = lire('../supabase/functions/email-tunnel/index.ts');
  ok(/mailPaiementEchoue\(\{\s*lang,\s*cause: cause as CausePaiement,\s*contexte: contexte as ContextePaiement,\s*lienFacture: pf\.lien_facture \?\? null,\s*relanceLe: pf\.relance_le \?\? null,\s*abonnementActif: pf\.abonnement_actif === true,\s*offre: pf\.offre \?\? null,\s*\}\)/.test(et), 'email-tunnel rend le mail avec les faits reçus');
  ok(/categorie: "support",\s*dedup: "reservation"/.test(et), 'toujours « support » + réservation par facture (une facture = un mail)');
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
