// selftest:alerte-essai-cloud — (16/11/2026 soir, ordre de Nico) « Je ne reçois AUCUN mail quand un essai Cloud démarre
// (ni le compte a962a59e à 15:39 sur le web, ni mon essai iPhone à 19:47). Ajoute une alerte vers moi à chaque essai démarré, sur
// tous les canaux (web, iPhone, Android), avec le compte, la formule, le canal et la date de fin d'essai — comme l'alerte
// des paiements. »
// La cause (prouvée en base le 16/11) : l'essai passait bien par le point unique des alertes Cloud (mailsCloud →
// alertesNico, celui de l'alerte « Paiement reçu »), la clé « alerte:<abonnement> » était réservée dans cloud_mails…
// puis la liste fermée du 14/11 (_shared/alertes-nico.js, 'cloud.essai_debut' → null) coupait l'envoi : registre
// envoye_le NULL, aucune ligne cloud_alerte_essai_debut dans email_logs depuis le 14/11 00:39.
// Ce verrou rejoue le VRAI module d'envoi (_shared/cloud-mails-envoi.ts + cloud-mails.js + cloud-alerte-nico.js +
// alertes-nico.js), seules la porte d'envoi (desinscription.ts) et la mise en page (emails-fillsell.ts) sont remplacées
// par un enregistreur, sur les événements construits par les MÊMES fonctions que les webhooks :
//   A. un essai qui démarre, 3 canaux (Stripe web, Apple, Google Play) × (Cloud seul, Premium + Cloud, Pro + Cloud), plus
//      l'essai d'un abonné Stripe (create-checkout-session) et les 7 jours offerts à un abonné de boutique → EXACTEMENT une
//      alerte à support@fillsell.app : compte (adresse + id court), formule, canal, début et FIN d'essai (heure de Paris),
//      prix de la prochaine échéance quand la source le donne ; le mail client ne change pas ;
//   B. la même notification rejouée → aucune seconde alerte ;
//   C. le paiement de fin d'essai (3 canaux) → l'alerte « Paiement » d'avant, aucune alerte d'essai ;
//   D. Business + Cloud (aucun essai) → rien ;
//   E. le câblage : chaque fonction qui POSE un essai passe par le point unique (ou est une anticipation de droits
//      dont le webhook de la boutique porte l'événement).
// Rouge sur le code du 16/11 (alerte d'essai coupée), vert après.
//   npm run selftest:alerte-essai-cloud
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, passes = 0;
const ok = (c, m, d) => { if (c) passes++; else { echecs++; console.error(`✗ ${m}${d !== undefined ? ` — ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };

// ── Le vrai module d'envoi, porte d'envoi et gabarit remplacés ──────────────────────────────────────────────────────
globalThis.__envois = [];
const STUB_ENVOI = 'data:text/javascript,' + encodeURIComponent(
  'export async function envoyerEmail(e) { globalThis.__envois.push(e); return { envoye: true }; }');
const STUB_GABARIT = 'data:text/javascript,' + encodeURIComponent(
  'export const langue = (l) => (l === "en" ? "en" : "fr"); export const mailCloud = (t) => ({ sujet: t?.sujet ?? "mail", html: "<p>mail</p>", ...t });');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && /cloud-mails-envoi\.ts$/.test(context.parentURL)) {
      if (/\/desinscription\.ts$/.test(specifier)) return { url: STUB_ENVOI, shortCircuit: true };
      if (/\/emails-fillsell\.ts$/.test(specifier)) return { url: STUB_GABARIT, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const envoi = await import(pathToFileURL(`${RACINE}supabase/functions/_shared/cloud-mails-envoi.ts`).href);
const CM = await import('../supabase/functions/_shared/cloud-mails.js');
const CO = await import('../supabase/functions/_shared/cloud-option.js');
const CA = await import('../supabase/functions/_shared/cloud-alerte-nico.js');
const AN = await import('../supabase/functions/_shared/alertes-nico.js');
const FS = await import('../supabase/functions/_shared/formules-serveur.js');
const { PRODUITS_BOUTIQUES } = await import('../supabase/functions/_shared/formules-cloud.js');
const { prixDepuisAppleRenouvellement, prixDepuisGoogle, formatPrix } = await import('../supabase/functions/_shared/cloud-prix.js');

// ── Un faux client Supabase : cloud_mails (clé unique user + événement + clé → 23505) et profiles (colonnes LUES) ────
function baseFactice(profils) {
  const registre = new Map();
  const cle = (l) => `${l.user_id}|${l.evenement}|${l.cle}`;
  return {
    registre,
    from(table) {
      const q = {
        op: 'select', ligne: null, colonnes: '*', filtres: {},
        insert(l) { this.op = 'insert'; this.ligne = l; return this; },
        update(l) { this.op = 'update'; this.ligne = l; return this; },
        delete() { this.op = 'delete'; return this; },
        select(c) { if (this.op === 'select') this.colonnes = c ?? '*'; return this; },
        eq(k, v) { this.filtres[k] = v; return this; },
        maybeSingle() {
          const p = table === 'profiles' ? profils.get(this.filtres.id) ?? null : null;
          if (!p) return Promise.resolve({ data: null, error: null });
          if (this.colonnes === '*') return Promise.resolve({ data: { ...p }, error: null });
          const lu = {};
          for (const c of this.colonnes.split(',').map((x) => x.trim())) if (c in p) lu[c] = p[c];
          return Promise.resolve({ data: lu, error: null });
        },
        then(res, rej) {
          let r = { data: null, error: null };
          if (table === 'cloud_mails') {
            const f = this.filtres;
            if (this.op === 'insert') {
              if (registre.has(cle(this.ligne))) r = { data: null, error: { code: '23505', message: 'duplicate key' } };
              else registre.set(cle(this.ligne), { ...this.ligne, envoye_le: null });
            } else if (this.op === 'update') {
              const k = `${f.user_id}|${f.evenement}|${f.cle}`;
              if (registre.has(k)) registre.set(k, { ...registre.get(k), ...this.ligne });
            } else if (this.op === 'delete') registre.delete(`${f.user_id}|${f.evenement}|${f.cle}`);
          }
          return Promise.resolve(r).then(res, rej);
        },
      };
      return q;
    },
  };
}

const J = 86_400_000;
const T0 = Date.parse('2026-11-16T18:47:35Z');          // lundi 16 novembre 2026 à 19:47 (Paris)
const FIN = T0 + 7 * J;                                   // lundi 23 novembre 2026 à 19:47 (Paris)
const iso = (t) => new Date(t).toISOString();
const DEBUT_PARIS = 'lundi 16 novembre 2026 à 19:47';
const FIN_PARIS = 'lundi 23 novembre 2026 à 19:47';
ok(CA.dateParis?.(T0) === DEBUT_PARIS && CA.dateParis?.(FIN) === FIN_PARIS, 'dates de référence en heure de Paris', [CA.dateParis?.(T0), CA.dateParis?.(FIN)]);
const PRIX = { cloud: { montant: 24.99, devise: 'EUR' }, premium_cloud: { montant: 34.99, devise: 'EUR' }, pro_cloud: { montant: 49.99, devise: 'EUR' } };
const NOM = { cloud: 'FillSell Cloud', premium_cloud: 'Premium + Cloud', pro_cloud: 'Pro + Cloud' };
const NOM_CANAL = { stripe: 'Stripe (carte, web)', apple: 'Apple (App Store)', google: 'Google Play' };
const FLAGS = { cloud: {}, premium_cloud: { is_premium: true }, pro_cloud: { is_premium: true, is_pro: true } };
const PRODUIT_APPLE = { cloud: CO.PRODUIT_CLOUD_APPLE, premium_cloud: PRODUITS_BOUTIQUES.premium_cloud.apple, pro_cloud: PRODUITS_BOUTIQUES.pro_cloud.apple, business_cloud: PRODUITS_BOUTIQUES.business_cloud.apple };
const PRODUIT_GOOGLE = { cloud: CO.PRODUIT_CLOUD_GOOGLE, premium_cloud: PRODUITS_BOUTIQUES.premium_cloud.google, pro_cloud: PRODUITS_BOUTIQUES.pro_cloud.google, business_cloud: PRODUITS_BOUTIQUES.business_cloud.google };
const OFFRE_GOOGLE = { cloud: CO.OFFRE_ESSAI_CLOUD_GOOGLE, premium_cloud: PRODUITS_BOUTIQUES.premium_cloud.google_offre_essai, pro_cloud: PRODUITS_BOUTIQUES.pro_cloud.google_offre_essai, business_cloud: null };

// ── Les événements, construits comme dans chaque fonction ───────────────────────────────────────────────────────────
// Stripe (stripe-webhook, checkout.session.completed / customer.subscription.created) : l'abonnement relu, en essai.
function essaiStripe(formule, i) {
  const metadata = formule === 'cloud' ? { option: 'cloud', essai_cloud: '1' } : FS.metadonneesFormule({ formule, essai: true, userId: 'u' });
  const sub = { id: `sub_essai_${i}`, status: 'trialing', trial_start: T0 / 1000, trial_end: FIN / 1000, metadata };
  return { evenements: CM.evenementDebutStripe(sub), lirePrix: async () => PRIX[formule], ref: sub.id };
}
// Apple (apple-iap-webhook, SUBSCRIBED → nature « debut ») : la transaction signée d'une offre d'introduction gratuite.
function txApple(produit, ref, essai = true, t = T0) {
  return { productId: produit, originalTransactionId: ref, transactionId: `${ref}${essai ? '0' : '1'}`, purchaseDate: t, expiresDate: t + 7 * J,
    ...(essai ? { offerType: 1, offerDiscountType: 'FREE_TRIAL', price: 0 } : { price: 34990 }), currency: 'EUR' };
}
function essaiApple(formule, i, avant = {}) {
  const ref = `33000329335563${i}`;
  const tx = txApple(PRODUIT_APPLE[formule], ref);
  const renouv = { autoRenewStatus: 1, autoRenewProductId: PRODUIT_APPLE[formule], renewalPrice: Math.round(PRIX[formule]?.montant * 1000), currency: 'EUR' };
  const lecture = formule === 'cloud' ? CO.lectureCloudApple(tx, renouv) : CO.lectureFormuleApple(tx, renouv);
  if (formule !== 'cloud') {
    const plan = FS.planAchatBoutique({ produit: PRODUIT_APPLE[formule], sens: 'on', essaiBoutique: lecture?.essai === true, verdictEssai: CO.verdictEssaiStore(avant, 'apple', ref), rangAutres: 0, cloudLie: false });
    if (plan?.cloud !== 'ecrire') return { evenements: [], plan, ref };
  }
  const { update } = CO.ecritureCloudStore({ canal: 'apple', lecture, sens: 'on', ref, profil: avant });
  return { evenements: CM.evenementsBoutique({ canal: 'apple', nature: 'debut', avant, update, lecture, ref }), lirePrix: async () => prixDepuisAppleRenouvellement(renouv).prix, ref, update };
}
// Google (google-play-webhook, SUBSCRIPTION_PURCHASED = 4 → nature « debut ») : l'achat subscriptionsv2 avec l'offre d'essai.
function achatGoogle(produit, offre, prix, t = T0) {
  return { startTime: iso(t), subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', latestOrderId: 'GPA.3300-0000-0000-00001',
    lineItems: [{ productId: produit, expiryTime: iso(t + 7 * J), offerDetails: { basePlanId: 'mensuel', ...(offre ? { offerId: offre } : {}) },
      autoRenewingPlan: { autoRenewEnabled: true, ...(prix ? { recurringPrice: { units: String(Math.floor(prix.montant)), nanos: Math.round((prix.montant % 1) * 1e9), currencyCode: prix.devise } } : {}) } }] };
}
function essaiGoogle(formule, i, avant = {}) {
  const ref = `jeton-google-essai-${i}`;
  const achat = achatGoogle(PRODUIT_GOOGLE[formule], OFFRE_GOOGLE[formule], PRIX[formule]);
  const lecture = formule === 'cloud' ? CO.lectureCloudGoogle(PRODUIT_GOOGLE[formule], achat, 4) : CO.lectureFormuleGoogle(PRODUIT_GOOGLE[formule], achat, 4);
  if (formule !== 'cloud') {
    const plan = FS.planAchatBoutique({ produit: PRODUIT_GOOGLE[formule], sens: 'on', essaiBoutique: lecture?.essai === true || lecture?.phaseEssai === true, verdictEssai: CO.verdictEssaiStore(avant, 'google', ref), rangAutres: 0, cloudLie: false });
    if (plan?.cloud !== 'ecrire') return { evenements: [], plan, ref };
  }
  const { update } = CO.ecritureCloudStore({ canal: 'google', lecture, sens: 'on', ref, profil: avant });
  return { evenements: CM.evenementsBoutique({ canal: 'google', nature: 'debut', avant, update, lecture, ref }), lirePrix: async () => prixDepuisGoogle(achat).prix, ref, update };
}

const alertesEssai = () => globalThis.__envois.filter((e) => e.to === 'support@fillsell.app' && e.type === 'cloud_alerte_essai_debut');
const alertesPaiement = () => globalThis.__envois.filter((e) => e.to === 'support@fillsell.app' && e.type === 'cloud_alerte_paiement');
const mailsClientEssai = () => globalThis.__envois.filter((e) => e.userId != null && e.type === 'cloud_essai_debut');
const sansBalises = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── A. + B. Un essai qui démarre : une alerte, une seule ────────────────────────────────────────────────────────────
let i = 0;
for (const canal of ['stripe', 'apple', 'google']) {
  for (const formule of ['cloud', 'premium_cloud', 'pro_cloud']) {
    i += 1;
    const userId = `a96${canal[0]}${i}e9b-ab37-42ca-a3d2-2ddd0328e1${String(i).padStart(2, '0')}`;
    const email = `essai.${canal}.${formule}@exemple.fr`;
    const sc = canal === 'stripe' ? essaiStripe(formule, i) : canal === 'apple' ? essaiApple(formule, i) : essaiGoogle(formule, i);
    const nom = `${NOM_CANAL[canal]} × ${NOM[formule]}`;
    ok(sc.evenements.length === 1 && sc.evenements[0].evenement === 'essai_debut', `${nom} : la fonction produit l’événement « essai_debut »`, sc.evenements.map((e) => e.evenement));
    // Le profil tel que la fonction vient de l'écrire (palier de la formule, colonnes d'essai) — lu par le module d'envoi.
    const profils = new Map([[userId, { email, lang: 'fr', ...FLAGS[formule], cloud_essai_debut: iso(T0), cloud_essai_fin: iso(FIN), cloud_canal: canal, cloud_formule: formule === 'cloud' ? null : formule }]]);
    const base = baseFactice(profils);
    globalThis.__envois = [];
    await envoi.mailsCloud(base, { userId, email, lang: 'fr', canal, journal: '[selftest]', evenements: sc.evenements, lirePrix: sc.lirePrix });
    const a = alertesEssai();
    ok(a.length === 1, `${nom} : EXACTEMENT une alerte « nouvel essai » à support@fillsell.app`, a.length);
    ok(mailsClientEssai().length === 1, `${nom} : le mail client de début d’essai part comme avant (inchangé)`, mailsClientEssai().length);
    if (a.length === 1) {
      const t = sansBalises(a[0].html);
      ok(/Nouvel essai/.test(a[0].subject) && a[0].subject.includes(NOM[formule]) && a[0].subject.includes(email), `${nom} : sujet = nouvel essai, formule, compte`, a[0].subject);
      ok(a[0].userId == null, `${nom} : jamais au client (user_id null, adresse = support@)`);
      ok(t.includes(email) && t.includes(userId.slice(0, 8)), `${nom} : le compte (adresse + id court ${userId.slice(0, 8)})`);
      ok(new RegExp(`Formule\\s+${NOM[formule].replace(/[+]/g, '\\+')}`).test(t), `${nom} : la formule, en nom lisible (« ${NOM[formule]} »)`, t.slice(0, 400));
      ok(t.includes(NOM_CANAL[canal]), `${nom} : le canal (${NOM_CANAL[canal]})`);
      ok(t.includes(`Début de l’essai ${DEBUT_PARIS} (heure de Paris)`), `${nom} : le DÉBUT d’essai, heure de Paris`, t.slice(0, 600));
      ok(t.includes(`Fin de l’essai ${FIN_PARIS} (heure de Paris)`), `${nom} : la FIN d’essai, heure de Paris`, t.slice(0, 600));
      ok(t.includes(sansBalises(formatPrix(PRIX[formule], 'fr'))), `${nom} : le prix prélevé à la fin de l’essai (${formatPrix(PRIX[formule], 'fr')}), lu à la source`);
    }
    // B. La même notification rejouée (Apple / Google rejouent ; validate-* puis webhook ; customer.subscription.updated).
    globalThis.__envois = [];
    await envoi.mailsCloud(base, { userId, email, lang: 'fr', canal, journal: '[selftest]', evenements: sc.evenements, lirePrix: sc.lirePrix });
    ok(alertesEssai().length === 0 && mailsClientEssai().length === 0, `${nom} : notification rejouée → aucune seconde alerte (registre cloud_mails)`);
    const k = `${userId}|essai_debut|alerte:${sc.ref}`;
    ok(base.registre.get(k)?.envoye_le != null, `${nom} : registre « alerte:${sc.ref} » noté envoyé`, [...base.registre.keys()]);
  }
}

// L'essai du Cloud d'un ABONNÉ Stripe (create-checkout-session, schedule) : Premium + Cloud et Pro + Cloud.
for (const formule of ['premium_cloud', 'pro_cloud']) {
  const userId = `ab0nne${formule === 'pro_cloud' ? '2' : '1'}-0000-4000-8000-000000000001`;
  const profils = new Map([[userId, { email: `abonne.${formule}@exemple.fr`, ...FLAGS[formule], cloud_essai_debut: iso(T0), cloud_essai_fin: iso(FIN) }]]);
  const base = baseFactice(profils);
  const evenements = CM.evenementDebutFormuleStripe({ formule, ref: `sub_abonne_${formule}`, finIso: iso(FIN), abonne: true });
  globalThis.__envois = [];
  await envoi.mailsCloud(base, { userId, email: `abonne.${formule}@exemple.fr`, lang: 'fr', canal: 'stripe', evenements, journal: '[selftest]' });
  const a = alertesEssai();
  ok(a.length === 1 && a[0].subject.includes(NOM[formule]) && sansBalises(a[0].html).includes(`Fin de l’essai ${FIN_PARIS}`),
    `Stripe × ${NOM[formule]} (essai d’un abonné, create-checkout-session) : une alerte, formule et fin d’essai`, a.map((x) => x.subject));
  ok(a.length === 1 && /non communiqué par Stripe/.test(sansBalises(a[0].html)), `Stripe abonné × ${NOM[formule]} : la source ne donne pas de prix → aucun montant inventé`);
  globalThis.__envois = [];
  await envoi.mailsCloud(base, { userId, email: `abonne.${formule}@exemple.fr`, lang: 'fr', canal: 'stripe', evenements, journal: '[selftest]' });
  ok(alertesEssai().length === 0, `Stripe abonné × ${NOM[formule]} : rejoué → rien`);
}

// Les 7 jours offerts à un abonné Apple / Google (create-checkout-session, essaiOffertBoutique : cloud_canal « offert »).
{
  const builder = CA.evenementEssaiOffert;
  const seul = envoi.alerteSeuleCloud;
  ok(typeof builder === 'function' && typeof seul === 'function', '7 jours offerts : l’événement (evenementEssaiOffert) et l’alerte seule (alerteSeuleCloud) existent');
  if (typeof builder === 'function' && typeof seul === 'function') {
    for (const canal of ['apple', 'google']) {
      const userId = `0ffe${canal[0]}t00-0000-4000-8000-000000000001`;
      const profils = new Map([[userId, { email: `offert.${canal}@exemple.fr`, is_premium: true, is_pro: true, cloud_essai_debut: iso(T0), cloud_essai_fin: iso(FIN) }]]);
      const base = baseFactice(profils);
      const evenements = builder({ canal, formule: 'pro_cloud', ref: `offert:${canal}:pro_cloud`, debutIso: iso(T0), finIso: iso(FIN) });
      globalThis.__envois = [];
      await seul(base, { userId, email: `offert.${canal}@exemple.fr`, canal, evenements, journal: '[selftest]' });
      const a = alertesEssai();
      const t = a.length ? sansBalises(a[0].html) : '';
      ok(a.length === 1 && a[0].subject.includes('Pro + Cloud') && t.includes(NOM_CANAL[canal]) && t.includes(`Fin de l’essai ${FIN_PARIS}`) && /offerts/.test(t),
        `7 jours offerts (${NOM_CANAL[canal]}) : une alerte, formule, canal, fin d’essai, « offerts »`, a.map((x) => x.subject));
      ok(globalThis.__envois.filter((e) => e.userId != null).length === 0, `7 jours offerts (${canal}) : aucun mail client (il n’y en avait pas)`);
      globalThis.__envois = [];
      await seul(base, { userId, email: `offert.${canal}@exemple.fr`, canal, evenements, journal: '[selftest]' });
      ok(alertesEssai().length === 0, `7 jours offerts (${canal}) : rejoué → rien`);
    }
    ok(builder({ canal: 'apple', formule: 'business_cloud', ref: 'offert:apple:business_cloud' }).length === 0, '7 jours offerts : jamais pour Business + Cloud');
  }
}

// ── C. Le paiement de fin d'essai : l'alerte « Paiement » d'avant, aucune alerte d'essai ─────────────────────────────
{
  const avantEssai = (canal, ref) => ({ email: 'fin.essai@exemple.fr', is_cloud: false, cloud_canal: canal, cloud_ref: ref, cloud_essai_debut: iso(T0), cloud_essai_fin: iso(FIN), cloud_essai_arrete: false });
  const scenarios = [];
  // Stripe : la facture qui suit l'essai (invoice.paid).
  scenarios.push({ canal: 'stripe', evenements: CM.evenementPaiementStripe(
    { id: 'in_fin_essai', amount_paid: 2499, currency: 'eur', billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: FIN / 1000, end: (FIN + 30 * J) / 1000 } }] } },
    { id: 'sub_essai_1', trial_end: FIN / 1000, metadata: { option: 'cloud' } }) });
  // Apple : DID_RENEW (transaction payée, sans offre) après la semaine gratuite.
  {
    const ref = '330003293355631';
    const avant = avantEssai('apple', ref);
    const tx = txApple(CO.PRODUIT_CLOUD_APPLE, ref, false, FIN);
    const lecture = CO.lectureCloudApple(tx, { autoRenewStatus: 1 });
    const { update } = CO.ecritureCloudStore({ canal: 'apple', lecture, sens: 'on', ref, profil: avant });
    scenarios.push({ canal: 'apple', evenements: CM.evenementsBoutique({ canal: 'apple', nature: 'paiement', avant, update, lecture, ref }) });
  }
  // Google : SUBSCRIPTION_RENEWED (2) après la semaine gratuite.
  {
    const ref = 'jeton-google-fin-essai';
    const avant = avantEssai('google', ref);
    const achat = achatGoogle(CO.PRODUIT_CLOUD_GOOGLE, null, PRIX.cloud, FIN);
    const lecture = CO.lectureCloudGoogle(CO.PRODUIT_CLOUD_GOOGLE, achat, 2);
    const { update } = CO.ecritureCloudStore({ canal: 'google', lecture, sens: 'on', ref, profil: avant });
    scenarios.push({ canal: 'google', evenements: CM.evenementsBoutique({ canal: 'google', nature: 'paiement', avant, update, lecture, ref }) });
  }
  for (const s of scenarios) {
    const userId = `f1ness${s.canal[0]}0-0000-4000-8000-000000000001`;
    const base = baseFactice(new Map([[userId, { email: 'fin.essai@exemple.fr', cloud_essai_debut: iso(T0), cloud_essai_fin: iso(FIN) }]]));
    globalThis.__envois = [];
    await envoi.mailsCloud(base, { userId, email: 'fin.essai@exemple.fr', lang: 'fr', canal: s.canal, evenements: s.evenements, journal: '[selftest]' });
    ok(s.evenements.every((e) => e.evenement === 'paiement') && alertesPaiement().length === 1 && alertesEssai().length === 0,
      `${NOM_CANAL[s.canal]} : paiement de fin d’essai → l’alerte « Paiement » d’avant, AUCUNE alerte d’essai`, { ev: s.evenements.map((e) => e.evenement), p: alertesPaiement().length, e: alertesEssai().length });
    ok(alertesPaiement().length === 1 && /premier mois \(fin d’essai\)/.test(alertesPaiement()[0].subject), `${NOM_CANAL[s.canal]} : l’alerte de paiement dit « premier mois (fin d’essai) » (inchangée)`, alertesPaiement().map((x) => x.subject));
  }
}

// ── D. Business + Cloud : aucun essai, aucune alerte d'essai ─────────────────────────────────────────────────────────
{
  ok(CM.evenementDebutStripe({ id: 'sub_biz', status: 'trialing', trial_end: FIN / 1000, metadata: FS.metadonneesFormule({ formule: 'business_cloud', essai: false, userId: 'u' }) }).length === 0
    && CM.evenementDebutFormuleStripe({ formule: 'business_cloud', ref: 'sub_biz', finIso: iso(FIN), abonne: true }).length === 0, 'Business + Cloud (Stripe, abonné) : aucun événement d’essai');
  const apple = essaiApple('business_cloud', 90);
  ok(!apple.evenements.some((e) => e.evenement === 'essai_debut'), 'Business + Cloud (Apple, offre gratuite forcée) : aucun événement d’essai', apple.evenements.map((e) => e.evenement));
  const google = essaiGoogle('business_cloud', 91);
  ok(!google.evenements.some((e) => e.evenement === 'essai_debut'), 'Business + Cloud (Google) : aucun événement d’essai', google.evenements.map((e) => e.evenement));
  // Même un événement forcé (une future erreur d'appelant) n'envoie rien.
  const userId = 'b1z00000-0000-4000-8000-000000000001';
  const base = baseFactice(new Map([[userId, { email: 'biz@exemple.fr', is_premium: true, is_pro: true, is_business: true }]]));
  globalThis.__envois = [];
  await envoi.mailsCloud(base, { userId, email: 'biz@exemple.fr', lang: 'fr', canal: 'stripe', journal: '[selftest]',
    evenements: [{ evenement: 'essai_debut', cle: 'sub_biz_force', canal: 'stripe', faits: { formule: 'business_cloud', finIso: iso(FIN) } }] });
  ok(alertesEssai().length === 0 && ![...base.registre.keys()].some((k) => k.includes('alerte:')), 'Business + Cloud : un événement d’essai forcé → aucune alerte, rien réservé');
}

// ── E. La règle et le câblage ────────────────────────────────────────────────────────────────────────────────────────
ok(AN.decisionMail('cloud.essai_debut').mail === true, 'liste fermée des mails à Nico : « cloud.essai_debut » envoie (ordre du 16/11)', AN.decisionMail('cloud.essai_debut'));
ok(AN.decisionMail('cloud.essai_debut').categorie === 'essai_demarre' && AN.ALERTES['cloud.essai_debut']?.silenceH === null,
  'catégorie « essai_demarre », un ÉVÉNEMENT (une clé par essai : un mail, jamais deux)');
for (const k of ['cloud.arret_essai', 'cloud.arret_programme', 'cloud.essai_renouvellement_coupe', 'cloud.zero_connexion']) {
  ok(AN.decisionMail(k).mail === false, `${k} : reste coupée (rien d’autre ne change)`);
}
ok(AN.decisionMail('cloud.paiement').mail === true, '« Paiement reçu » : inchangé');
// Chaque fonction qui POSE un essai (cloud_essai_debut écrit, ou ecritureCloudStore) passe par le point unique.
const ANTICIPATION = {
  // Ces deux fonctions ANTICIPENT les droits au retour de la feuille de la boutique ; l'essai, son mail client et son
  // alerte viennent de la notification de la boutique (apple-iap-webhook SUBSCRIBED, google-play-webhook PURCHASED),
  // même référence (originalTransactionId / purchaseToken) → même clé, une seule alerte.
  'validate-apple-receipt': 'apple-iap-webhook',
  'validate-google-purchase': 'google-play-webhook',
};
const fonctions = readdirSync(`${RACINE}supabase/functions`).filter((d) => !d.startsWith('_') && existsSync(`${RACINE}supabase/functions/${d}/index.ts`));
const posent = [];
for (const f of fonctions) {
  const t = lire(`supabase/functions/${f}/index.ts`).replace(/^\s*\/\/.*$/gm, '');
  if (/ecritureCloudStore\(|cloud_essai_debut: [a-zA-Z]|evenementDebutStripe\(/.test(t)) posent.push(f);
}
ok(['apple-iap-webhook', 'create-checkout-session', 'google-play-webhook', 'stripe-webhook', 'validate-apple-receipt', 'validate-google-purchase'].every((f) => posent.includes(f)),
  `les fonctions qui posent un essai Cloud sont lues (${posent.join(', ')})`);
for (const f of posent) {
  const t = lire(`supabase/functions/${f}/index.ts`);
  if (ANTICIPATION[f]) { ok(posent.includes(ANTICIPATION[f]), `${f} : anticipation, l’événement vient de ${ANTICIPATION[f]}`); continue; }
  ok(/await (mailsCloud|alerteSeuleCloud)\(/.test(t), `${f} : passe par le point unique des alertes Cloud (mailsCloud / alerteSeuleCloud)`);
}
{
  const s = lire('supabase/functions/stripe-webhook/index.ts');
  ok((s.match(/await mailsCloud\(supabase, \{\n\s*userId: qui\.id, canal: "stripe", evenements: evenementDebutStripe\(subLu\)/g) ?? []).length === 2,
    'stripe-webhook : les deux débuts d’essai (Cloud seul, formule) passent par mailsCloud avec evenementDebutStripe');
  const c = lire('supabase/functions/create-checkout-session/index.ts');
  ok(/await mailsCloud\(supabase, \{[^}]*canal: "stripe",\n\s*evenements: evenementDebutFormuleStripe\(\{ formule, ref: cible\.id, finIso: essaiLu\.fin, abonne: true \}\)/.test(c),
    'create-checkout-session : l’essai d’un abonné passe par mailsCloud');
  const ecritsOffert = (c.match(/cloud_canal: "offert"/g) ?? []).length;
  ok(ecritsOffert === 1 && /await alerteSeuleCloud\(supabase, \{[\s\S]{0,300}evenementEssaiOffert\(/.test(c), 'create-checkout-session : les 7 jours offerts → l’alerte seule (aucun mail client)');
  const a = lire('supabase/functions/apple-iap-webhook/index.ts');
  ok(/const nature = notificationType === "SUBSCRIBED" \? "debut"/.test(a) && /evenements: evenementsBoutique\(\{ canal: "apple", nature, avant: profilCloud \?\? \{\}, update, lecture: lectureCloud, ref: originalTransactionId \?\? null \}\)/.test(a)
    && /const nature = notificationType === "SUBSCRIBED" \? "debut"[^\n]*\n\s*if \(f\.cloud\) evenements\.push\(\.\.\.evenementsBoutique\(/.test(a),
    'apple-iap-webhook : SUBSCRIBED = « debut » (Cloud seul et formules) → evenementsBoutique → mailsCloud');
  const g = lire('supabase/functions/google-play-webhook/index.ts');
  ok(/const nature = notificationType === 4 \? "debut"/.test(g) && /if \(f\.cloud\) evenements\.push\(\.\.\.evenementsBoutique\(\{ canal: "google", nature: notificationType === 4 \? "debut" : "paiement"/.test(g),
    'google-play-webhook : PURCHASED (4) = « debut » (Cloud seul et formules) → evenementsBoutique → mailsCloud');
  const e = lire('supabase/functions/_shared/cloud-mails-envoi.ts');
  ok(/from\("profiles"\)\.select\("email, is_premium, is_pro, is_business, is_comped, cloud_essai_debut, cloud_essai_fin"\)/.test(e),
    'l’alerte lit le début et la fin d’essai ÉCRITS dans le profil (repli quand la source ne les porte pas)');
}

console.log(`${echecs === 0 ? '✓' : '✗'} selftest:alerte-essai-cloud — ${passes} vert(s), ${echecs} rouge(s)`);
if (echecs) process.exit(1);
