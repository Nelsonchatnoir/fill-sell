import { drapeauxStripeAvecStores } from "../_shared/droits-canaux.js";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { notifierPaiement, alerterPaiementNonCredite, signalerPaiementEchoue } from "../_shared/payment-notify.ts";
import { drapeauxDepuisStripe, miseAJourProfilDepuisStripe, estAbonnementCloud } from "../_shared/cloud-option.js";
import { evenementArretStripe, evenementDebutStripe, evenementPaiementStripe, montantStripe } from "../_shared/cloud-mails.js";
import { mailsCloud, type EvenementCloud } from "../_shared/cloud-mails-envoi.ts";
import { notificationDeTest } from "../_shared/environnement-store.js";
import { prixDepuisStripe } from "../_shared/cloud-prix.js";
import { faitsEchec, decisionMailEchec, causeDuPaiement } from "../_shared/paiement-echoue.js";
import { palierDeFacture } from "../_shared/paiement-stripe.js";
import { colonnesDescente, descentePrevue } from "../_shared/descente-formule.js";
import { palierDuProfil } from "../_shared/palier.js";
// (11/11/2026, offres Cloud) Les formules avec Cloud : un abonnement qui porte un palier ET le Cloud (formules-serveur.js).
import { formuleDeMetadonnees, formuleDAbonnementStripe, grantDeFormule, planTypeDeFormule, formuleDuProduit, nomDeFormule } from "../_shared/formules-serveur.js";
import { prixStripe } from "../_shared/prix-stripe.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// ── L'OPTION « FILLSELL CLOUD » (04/10/2026) ─────────────────────────────────
// Un abonnement Stripe À PART (prix STRIPE_PRICE_CLOUD, 24,99 €/mois depuis le 03/11, essai 7 j,
// metadata.option = "cloud"), ouvert à tous, comptes Free compris. Il ne pose
// JAMAIS is_premium / is_pro / is_business, ne crédite AUCUN quota, et continue
// si le palier tombe. Règles : _shared/cloud-option.js (testé par
// scripts/option-cloud-selftest.mjs).
// (11/11) Lus à un seul endroit (_shared/prix-stripe.ts), les trois formules avec Cloud comprises.
function prixConnus() {
  return prixStripe();
}

// Recalcule is_premium/is_pro depuis les abonnements Stripe RESTANTS du
// customer (2026-07-23) — remplace les remises à zéro aveugles : un customer
// historique peut avoir DEUX abonnements (bug double-abo Premium→Pro, corrigé
// dans create-checkout-session le même jour), et la suppression de l'un ne
// doit jamais couper l'autre. Le plan supprimé est identifié par ce qui
// RESTE : price Pro (STRIPE_PRICE_PRO) ou metadata.plan_type='pro' → is_pro ;
// n'importe quel abonnement vivant → is_premium. is_founder n'est JAMAIS
// touché (marqueur de prix legacy sans effet sur l'accès, cf. CLAUDE.md).
//
// ⛔ (29/10, Romain Colson — remplace la règle du 25/07, cas Mériné) UN IMPAYÉ
// NE GARDE PLUS SON PALIER. Avant : past_due comptait comme vivant, et un
// renouvellement refusé gardait Pro pendant toute la relance Stripe (relevé :
// 13 à 14 jours, puis customer.subscription.deleted — geronimo0550 06/10 →
// 19/10, nivake03 13/10 → 27/10 ; Romain Colson, 5 refus du 19/10 au 28/10,
// toujours Pro). Maintenant seul un abonnement PAYÉ (active | trialing) porte
// un palier (litAbonnementStripe.paye, _shared/cloud-option.js) : past_due,
// unpaid, incomplete, incomplete_expired, canceled → le palier tombe au
// recalcul, et REVIENT au recalcul quand la facture est réglée (past_due →
// active). Le recalcul se fait donc à CHAQUE changement de statut
// (customer.subscription.updated, plus bas). L'option Cloud garde sa règle.
// deno-lint-ignore no-explicit-any
// Un abonnement vivant porte-t-il CE palier ? metadata.plan_type d'abord
// (posé par create-checkout-session), price ID en repli (abonnements créés
// avant la pose de metadata, ou édités à la main dans le dashboard).
function portePlan(s: Stripe.Subscription, planType: string, envKey: string): boolean {
  if (s.metadata?.plan_type === planType) return true;
  const priceId = Deno.env.get(envKey) ?? "";
  return !!priceId && !!s.items?.data?.some((it: Stripe.SubscriptionItem) => it.price?.id === priceId);
}

// ── LA FACTURE D'UNE MONTÉE DE PALIER (2026-09-24, Jocabroc / Klarna) ────────
// create-checkout-session bascule l'abonnement existant en
// `pending_if_incomplete` : la montée ne s'applique qu'une fois la facture de
// différence PAYÉE — sur-le-champ (carte), ou par le client sur la page Stripe
// (Klarna, Amazon Pay, Link, 3-D Secure…). C'est ICI, sur invoice.paid, que le
// palier se pose alors : flags et Pépites, jamais avant le paiement.
// Le palier visé se lit sur la marque posée par create-checkout-session
// (metadata.fillsell_upgrade_vers) ; à défaut (montée payée à l'instant, avant
// que la marque ne soit posée), sur les lignes POSITIVES d'une facture de
// changement d'abonnement (billing_reason subscription_update).
// ⚠️ DEUX FORMES D'OBJETS (relevé le 24/09) : l'endpoint Stripe rend ses
//    événements au format d'API `2026-03-25.dahlia`, pas au 2023-10-16 du SDK.
//    Là, `invoice.subscription` et `line.price` n'existent plus : l'abonnement
//    est sous `parent.subscription_details.subscription`, le prix sous
//    `pricing.price_details.price`. On lit les deux.
// deno-lint-ignore no-explicit-any
function prixDeLigne(l: any): string | null {
  return l?.price?.id ?? l?.pricing?.price_details?.price ?? null;
}
// deno-lint-ignore no-explicit-any
function abonnementDeFacture(invoice: any): string | null {
  const s = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription ?? null;
  return typeof s === "string" ? s : (s?.id ?? null);
}
function planDeMontee(invoice: Stripe.Invoice): "pro" | "business" | null {
  const marque = String(invoice.metadata?.fillsell_upgrade_vers ?? "");
  if (marque === "pro" || marque === "business") return marque;
  if (invoice.billing_reason !== "subscription_update") return null;
  const lignes = invoice.lines?.data ?? [];
  const porte = (envKey: string) => {
    const priceId = Deno.env.get(envKey) ?? "";
    return !!priceId && lignes.some((l: Stripe.InvoiceLineItem) => (l.amount ?? 0) > 0 && prixDeLigne(l) === priceId);
  };
  if (porte("STRIPE_PRICE_BUSINESS")) return "business";
  if (porte("STRIPE_PRICE_PRO")) return "pro";
  return null;
}

// Le palier d'un abonnement lu sur son PRIX seul (jamais sa métadonnée) : c'est
// lui qui fait foi après une mise à jour en attente appliquée.
function planDuPrix(s: Stripe.Subscription): string | null {
  const ids = (s.items?.data ?? []).map((it: Stripe.SubscriptionItem) => it.price?.id ?? "");
  // (11/11) Une formule avec Cloud : le palier de la formule (plan_type « standard » pour Premium + Cloud).
  const formulePrix = formuleDAbonnementStripe(s, prixConnus());
  if (formulePrix && ids.some((id: string) => formuleDuProduit(id, prixConnus())?.formule === formulePrix)) return planTypeDeFormule(formulePrix);
  for (const [plan, envKey] of [["business", "STRIPE_PRICE_BUSINESS"], ["pro", "STRIPE_PRICE_PRO"], ["standard", "STRIPE_PRICE_STANDARD"]] as const) {
    const priceId = Deno.env.get(envKey) ?? "";
    if (priceId && ids.includes(priceId)) return plan;
  }
  return null;
}

// (09/11, C4) LA DESCENTE PRÉVUE (« Ta formule passera à Premium le … »), lue chez Stripe — ses schedules sont la source
// de vérité (_shared/descente-formule.js). Écrite À PART des droits, jamais bloquante : les droits ne changent qu'avec le
// prix facturé (ci-dessus). Aucun appel tant qu'aucun abonnement n'a de schedule ; si les colonnes n'existent pas
// (migration 20261109020000 pas appliquée), l'erreur est journalisée et rien d'autre ne bouge.
// deno-lint-ignore no-explicit-any
async function ecrireDescentePrevue(supabase: any, customerId: string, subs: Stripe.Subscription[]) {
  try {
    const prix = prixConnus();
    const avecSchedule = subs.filter((s) => s.schedule && !estAbonnementCloud(s, prix));
    if (!avecSchedule.length) {
      // Plus aucun schedule : une descente encore affichée (rendue ailleurs, au tableau de bord Stripe) est effacée.
      const { data: fp, error: lu } = await supabase.from("profiles").select("formule_prevue_canal").eq("stripe_customer_id", customerId).maybeSingle();
      if (!lu && fp?.formule_prevue_canal === "stripe") {
        await supabase.from("profiles").update(colonnesDescente(null)).eq("stripe_customer_id", customerId);
      }
      return;
    }
    const schedules: Record<string, unknown> = {};
    for (const s of avecSchedule) {
      const id = typeof s.schedule === "string" ? s.schedule : (s.schedule as { id: string }).id;
      schedules[id] = await stripe.subscriptionSchedules.retrieve(id);
    }
    const prevue = descentePrevue(avecSchedule, schedules, prix);
    const { error } = await supabase.from("profiles").update(colonnesDescente(prevue)).eq("stripe_customer_id", customerId);
    if (error) console.error(`[webhook] descente prévue non écrite pour ${customerId} : ${error.message}`);
    else console.log(`[webhook] descente prévue pour ${customerId} :`, prevue ? `${prevue.formule} le ${prevue.le}` : "aucune");
  } catch (e) {
    console.error(`[webhook] descente prévue illisible pour ${customerId} : ${(e as Error)?.message ?? e}`);
  }
}

async function recomputeStripeFlags(supabase: any, customerId: string) {
  const { data: subs } = await stripe.subscriptions.list({ customer: customerId, limit: 20 });
  // ⚠️ is_business RECALCULÉ ICI, et pas seulement posé à l'achat (2026-08-09).
  // Sans cette ligne, la résiliation d'un Business Stripe faisait tomber
  // is_premium et is_pro mais laissait is_business à TRUE — pour toujours, et
  // en silence : un ex-abonné gardait le nom du palier, son grant de 3000 au
  // renouvellement (invoice.paid lit is_business en premier) et les avantages
  // qui s'y brancheront. C'est exactement la classe du « premium fantôme »
  // corrigée le 25/07, une couche plus haut.
  // Flags CUMULATIFS : un Business vaut aussi Pro — sans quoi un abonnement
  // Business seul laisserait is_pro à false et fermerait toutes les gates
  // écrites en isPro.
  //
  // (04/10) Le calcul vit dans drapeauxDepuisStripe : mêmes règles qu'avant
  // pour les paliers (tout abonnement PAYÉ hors Cloud vaut premium ; pro /
  // business par métadonnée plan_type, prix en repli ; payé = active |
  // trialing depuis le 29/10, past_due n'en est plus). Les abonnements Cloud (metadata.option = "cloud")
  // n'y entrent JAMAIS : ils posent is_cloud et l'essai, rien d'autre — Cloud
  // seul ne rend jamais premium, et Cloud continue si le palier tombe. Les
  // colonnes Cloud ne bougent que si Stripe porte l'option (ou personne).
  const d = drapeauxDepuisStripe(subs ?? [], prixConnus());
  const { data: prof } = await supabase
    .from("profiles").select("cloud_canal, google_purchase_token, google_product_id, apple_original_transaction_id, is_premium, is_pro, is_business, subscription_period_end")
    .eq("stripe_customer_id", customerId).maybeSingle();
  const update = miseAJourProfilDepuisStripe(d, prof?.cloud_canal ?? null);
  // (30/10, lot D point 2) Un canal qui s'arrête ne retire que SON droit : la fin d'un abonnement Stripe ne fait
  // jamais tomber un abonnement Google ou Apple VIVANT (jeton + fin à venir) — avant, ce recalcul écrasait tout.
  {
    const avecStores = drapeauxStripeAvecStores(d, prof ?? null);
    if (avecStores.rangStore > avecStores.rangStripe) {
      update.is_premium = avecStores.is_premium;
      update.is_pro = avecStores.is_pro;
      update.is_business = avecStores.is_business;
      console.log("[webhook] drapeaux gardés au rang du store vivant", avecStores.rangStore, "(Stripe :", avecStores.rangStripe, ") pour", customerId);
    }
  }
  // (11/11) La formule avec Cloud tombée (ou remplacée par le Cloud seul) : profiles.cloud_formule remis à NULL — lu à part,
  // et seulement s'il en porte une (colonne absente : rien, jamais une erreur sur l'écriture des drapeaux).
  if (!("cloud_formule" in update)) {
    const { data: cf, error: ecf } = await supabase.from("profiles").select("cloud_formule").eq("stripe_customer_id", customerId).maybeSingle();
    if (!ecf && cf?.cloud_formule && (prof?.cloud_canal == null || prof?.cloud_canal === "stripe")) update.cloud_formule = null;
  }
  await supabase.from("profiles").update(update).eq("stripe_customer_id", customerId);
  await ecrireDescentePrevue(supabase, customerId, subs ?? []);
  console.log(
    "[webhook] recomputed flags for", customerId,
    "paid subs:", (subs ?? []).filter((s: Stripe.Subscription) => ["active", "trialing"].includes(s.status)).length,
    "unpaid subs:", (subs ?? []).filter((s: Stripe.Subscription) => ["past_due", "unpaid", "incomplete"].includes(s.status)).length,
    "→", JSON.stringify(update)
  );
}

// (08/11) Les mails Cloud d'un client Stripe (début d'essai, paiement, arrêt) : le compte retrouvé par son client
// Stripe, un mail par événement (registre cloud_mails). Jamais bloquant.
// deno-lint-ignore no-explicit-any
async function mailsCloudDuClient(supabase: any, customerId: string, evenements: EvenementCloud[]) {
  if (!evenements?.length) return;
  const { data: p } = await supabase.from("profiles").select("id, email, lang").eq("stripe_customer_id", customerId).maybeSingle();
  if (!p?.id) {
    console.warn(`[webhook] mails Cloud : aucun compte pour le client ${customerId}`);
    return;
  }
  await mailsCloud(supabase, { userId: p.id, email: p.email ?? null, lang: p.lang ?? null, canal: "stripe", evenements, journal: "[webhook]" });
}

// ── LE SIGNAL D'UN ÉCHEC ACQUIS (09/10/2026) ─────────────────────────────────
// Un seul chemin pour les deux échecs qui s'écrivent (decisionMailEchec,
// _shared/paiement-echoue.js) : la tentative d'un renouvellement / d'une fin
// d'essai qui a échoué (invoice.payment_failed / payment_action_required), et
// la souscription abandonnée (abonnement incomplete_expired). On établit les
// FAITS (qui, quelle cause, quel contexte) puis on signale à email-tunnel
// (mode payment_failed : mail client, alerte Nico, dédup PAR FACTURE). Jamais
// d'incidence sur le code HTTP rendu à Stripe.
// deno-lint-ignore no-explicit-any
async function signalerEchecAcquis(supabase: any, p: {
  // deno-lint-ignore no-explicit-any
  invoice: any; facture: any; abonnement: any; evenement: string; userIdIndice?: string | null;
}) {
  const { invoice, facture, abonnement, evenement } = p;
  const customerId = (typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id) ?? null;

  // ── POURQUOI LE MAIL CLIENT N'EST JAMAIS PARTI (relevé du 19/09/2026) ──────
  // Zéro ligne 'payment_failed:%' dans email_logs depuis la mise en service
  // du 07/08, alors que des échecs RÉELS ont eu lieu (05/09 et 08/09, tous
  // deux traités à la main ensuite). La cause n'est ni Stripe, ni la dédup :
  // email-tunnel n'envoie au client que si user_id ET email sont présents,
  // et user_id arrivait à NULL.
  //
  // profiles.stripe_customer_id n'est écrit qu'APRÈS un paiement abouti
  // (checkout.session.completed / invoice.paid) ou sur le chemin d'upgrade
  // in situ. Une PREMIÈRE souscription qui échoue ne l'a donc jamais écrit :
  // la recherche par customer id ne rend rien. Filets : le compte nommé par
  // l'abonnement (metadata.fillsell_user_id, posé par create-checkout-session),
  // puis l'ADRESSE de la facture (celle que la personne a saisie dans
  // Checkout, qui existe dès la première tentative).
  let userId: string | null = null;
  let lang: string | null = null;
  let emailCompte: string | null = null;
  if (customerId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, lang, email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = prof?.id ?? null;
    lang = prof?.lang ?? null;
    emailCompte = prof?.email ?? null;
  }
  if (!userId && p.userIdIndice) {
    const { data: parId } = await supabase
      .from("profiles")
      .select("id, lang, email")
      .eq("id", p.userIdIndice)
      .maybeSingle();
    if (parId?.id) {
      userId = parId.id;
      lang = parId.lang ?? null;
      emailCompte = parId.email ?? null;
    }
  }
  const emailFacture = invoice.customer_email ?? null;
  if (!userId && emailFacture) {
    const adresse = emailFacture.trim().toLowerCase();
    const { data: parMail } = await supabase
      .from("profiles")
      .select("id, lang, email")
      .ilike("email", adresse)
      .maybeSingle();
    if (parMail?.id) {
      userId = parMail.id;
      lang = lang ?? parMail.lang ?? null;
      emailCompte = emailCompte ?? parMail.email ?? null;
      console.log(`[webhook] compte retrouvé par adresse (pas de stripe_customer_id) : ${userId}`);
    }
  }

  // Cause FINE via le PaymentIntent relu (causeDuPaiement) : lecture
  // best-effort, une cause illisible donne 'autre', jamais un blocage.
  // deno-lint-ignore no-explicit-any
  let pi: any = null;
  try {
    // deno-lint-ignore no-explicit-any
    const piBrut = facture?.payment_intent ?? (invoice as any)?.payment_intent ?? null;
    const piId = typeof piBrut === "string" ? piBrut : (piBrut?.id ?? null);
    if (piId) pi = await stripe.paymentIntents.retrieve(piId);
  } catch (e) {
    console.warn("[webhook] PaymentIntent illisible (cause générique):", (e as Error)?.message);
  }
  const { cause, code } = causeDuPaiement({ pi, evenement });

  // Libellé du plan dans le mail d'échec — purement informatif, mais il doit
  // nommer le bon palier : Business d'abord (le plus cher, celui dont l'échec
  // coûte le plus à laisser filer).
  const portePrix = (envKey: string) => {
    const priceId = Deno.env.get(envKey) ?? "";
    return !!priceId && (facture?.lines?.data ?? invoice.lines?.data ?? []).some(
      (l: Stripe.InvoiceLineItem) => prixDeLigne(l) === priceId
    );
  };
  const estCloud = abonnement ? estAbonnementCloud(abonnement, prixConnus()) : portePrix("STRIPE_PRICE_CLOUD");
  // (11/11) Une formule avec Cloud se nomme (« Pro + Cloud »).
  const formuleEchec = abonnement ? formuleDAbonnementStripe(abonnement, prixConnus()) : null;
  const nomPlan = formuleEchec ? (nomDeFormule(formuleEchec) ?? "Premium") : estCloud ? "Cloud"
    : portePrix("STRIPE_PRICE_BUSINESS") ? "Business"
    : portePrix("STRIPE_PRICE_PRO") ? "Pro"
    : "Premium";
  // Fin d'essai = billing_reason subscription_cycle + une ligne dont
  // period.start === abonnement.trial_end ; bouton = hosted_invoice_url d'une
  // facture ouverte (jamais pour une souscription) ; relance =
  // next_payment_attempt ; « reste actif » = abonnement active | past_due.
  const faits = faitsEchec({ facture, abonnement, estCloud });
  console.log(
    `[webhook] échec ${invoice.id} : cause=${cause} contexte=${faits.contexte} ` +
    `bouton=${faits.contexte === "souscription" ? "app" : faits.lien_facture ? "facture" : "aucun"} ` +
    `relance=${faits.relance_le ?? "aucune"} actif=${faits.abonnement_actif} offre=${faits.offre ?? "-"} ` +
    `(${evenement})`
  );
  await signalerPaiementEchoue({
    user_id: userId,
    // L'adresse de la facture d'abord (celle que la personne vient de
    // saisir), le profil en repli — une facture sans customer_email ne doit
    // plus faire sauter le mail.
    email: emailFacture ?? emailCompte,
    lang,
    invoice_id: invoice.id,
    cause,
    code,
    contexte: faits.contexte as "souscription" | "renouvellement" | "fin_essai",
    montant: invoice.amount_due != null
      ? `${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`
      : null,
    plan: nomPlan,
    lien_facture: faits.lien_facture,
    relance_le: faits.relance_le,
    abonnement_actif: faits.abonnement_actif,
    offre: faits.offre,
  });
}

// ── LA SOUSCRIPTION ABANDONNÉE (09/10/2026) ──────────────────────────────────
// Le seul moment où un paiement INITIAL a définitivement échoué : Stripe passe
// l'abonnement à incomplete_expired 23 h après la première tentative, sans
// paiement (facture annulée). C'est là, et seulement là, que le mail part —
// si la personne n'a pas payé autrement entre-temps (autre abonnement vivant
// de la même offre, palier ou Cloud déjà ouvert sur le compte). Toute erreur
// est avalée : le recalcul des drapeaux qui suit ne doit jamais en dépendre.
// deno-lint-ignore no-explicit-any
async function signalerSouscriptionAbandonnee(supabase: any, subscription: Stripe.Subscription, customerId: string, evenement: string) {
  try {
    const li = subscription.latest_invoice as string | { id?: string } | null;
    const factureId = typeof li === "string" ? li : (li?.id ?? null);
    if (!factureId) {
      console.log(`[webhook] abonnement ${subscription.id} incomplete_expired sans facture : aucun mail`);
      return;
    }
    // deno-lint-ignore no-explicit-any
    const facture: any = await stripe.invoices.retrieve(factureId);
    const prix = prixConnus();
    const cloud = estAbonnementCloud(subscription, prix);
    const { data: subs } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const memeOffreVivante = (subs ?? []).some((s: Stripe.Subscription) =>
      s.id !== subscription.id
      && ["active", "trialing", "past_due"].includes(s.status)
      && estAbonnementCloud(s, prix) === cloud
    );
    const userIdIndice = (subscription.metadata?.fillsell_user_id as string | undefined) || null;
    const colonnes = "id, is_premium, is_pro, is_business, is_comped, is_cloud";
    const { data: prof } = userIdIndice
      ? await supabase.from("profiles").select(colonnes).eq("id", userIdIndice).maybeSingle()
      : await supabase.from("profiles").select(colonnes).eq("stripe_customer_id", customerId).maybeSingle();
    const compteDejaOuvert = !!prof && (cloud ? prof.is_cloud === true : palierDuProfil(prof) !== "gratuit");
    const decision = decisionMailEchec({ evenement, facture, abonnement: subscription, memeOffreVivante, compteDejaOuvert });
    if (!decision.envoyer) {
      console.log(`[webhook] abonnement ${subscription.id} incomplete_expired (facture ${factureId}, ${facture?.status ?? "?"}) : aucun mail — ${decision.raison}`);
      return;
    }
    await signalerEchecAcquis(supabase, {
      invoice: facture, facture, abonnement: subscription, evenement, userIdIndice: userIdIndice ?? prof?.id ?? null,
    });
  } catch (e) {
    console.error(`[webhook] abandon de la souscription ${subscription.id} non traité : ${(e as Error)?.message ?? e}`);
  }
}

// ── (11/11/2026) LA SOUSCRIPTION D'UNE FORMULE AVEC CLOUD (checkout.session.completed) ───────────────────────────────
// deno-lint-ignore no-explicit-any
async function formuleCloudSouscrite(supabase: any, session: Stripe.Checkout.Session, customerId: string, email: string | null): Promise<Response> {
  const formule = formuleDeMetadonnees(session.metadata)!;
  const cible = session.metadata?.fillsell_user_id || null;
  const { data: qui } = cible
    ? await supabase.from("profiles").select("id").eq("id", cible).maybeSingle()
    : await supabase.from("profiles").select("id").eq("email", email ?? "").maybeSingle();
  if (!qui?.id) {
    console.error(`[webhook] session ${formule} ${session.id} : compte introuvable (user=${cible ?? "?"}, email=${email ?? "?"})`);
    await alerterPaiementNonCredite({
      canal: "stripe", type: "abonnement", email, produit: formule, ref: `stripe:${session.id}`, rpc: null,
      erreur: `Formule ${formule} (essai ou payée) sans compte FillSell retrouvé.`,
    });
    return new Response(JSON.stringify({ received: true, formule }), { headers: { "Content-Type": "application/json" } });
  }
  await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", qui.id);
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  let sub: Stripe.Subscription | null = null;
  let carteRefusee = false;
  if (subId) {
    try {
      sub = await stripe.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
    } catch (e) {
      console.error(`[webhook] abonnement ${subId} (${formule}) illisible : ${(e as Error)?.message ?? e}`);
    }
  }
  // Le 4e verrou de l'essai : la carte (empreinte hachée, cloud_essai_noter_carte) — même règle que le Cloud seul.
  if (sub && sub.status === "trialing") {
    try {
      let pm = sub.default_payment_method as Stripe.PaymentMethod | string | null;
      if (!pm || typeof pm === "string") {
        const client = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] }) as Stripe.Customer;
        pm = (client.invoice_settings?.default_payment_method ?? null) as Stripe.PaymentMethod | string | null;
      }
      const empreinte = pm && typeof pm !== "string" ? pm.card?.fingerprint ?? null : null;
      if (!empreinte) console.warn(`[webhook] essai ${formule} ${sub.id} : empreinte de carte illisible — verrou carte non appliqué`);
      else {
        const { data: verdict, error: errCarte } = await supabase.rpc("cloud_essai_noter_carte", { p_user: qui.id, p_carte: empreinte });
        if (errCarte) console.error(`[webhook] cloud_essai_noter_carte : ${errCarte.message}`);
        else if (verdict?.ok === false && verdict?.raison === "carte_deja_vue") {
          await stripe.subscriptions.cancel(sub.id);
          carteRefusee = true;
          console.log(`[webhook] essai ${formule} ${sub.id} ANNULÉ : carte déjà utilisée pour l'essai d'un autre compte (rien prélevé)`);
        }
      }
    } catch (e) {
      console.error(`[webhook] verrou carte de l'essai ${formule} : ${(e as Error)?.message ?? e}`);
    }
  }
  await recomputeStripeFlags(supabase, customerId);
  if (carteRefusee) await supabase.from("profiles").update({ cloud_essai_refus: "carte_deja_vue" }).eq("id", qui.id);
  if (sub && !carteRefusee && sub.status === "trialing") {
    // Le mail de début d'essai (un seul), au prix de la PREMIÈRE échéance lu chez Stripe. ⛔ Jamais pour Business + Cloud.
    const subLu = sub;
    await mailsCloud(supabase, {
      userId: qui.id, canal: "stripe", evenements: evenementDebutStripe(subLu), journal: "[webhook]",
      lirePrix: async () => {
        try {
          const aVenir = await stripe.invoices.retrieveUpcoming({ subscription: subLu.id });
          const m = montantStripe(Number(aVenir?.amount_due), aVenir?.currency);
          if (m) return m;
        } catch (e) {
          console.warn(`[webhook] facture à venir de ${subLu.id} illisible : ${(e as Error)?.message ?? e}`);
        }
        return prixDepuisStripe(subLu).prix;
      },
    });
  } else if (sub && !carteRefusee && sub.status === "active") {
    // Payée tout de suite : le crédit du mois au palier de la formule (le mail de paiement part d'invoice.paid).
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
      p_user_id: qui.id, p_tier: grantDeFormule(formule), p_period_end: periodEnd, p_source: "payment",
    });
    const montant = session.amount_total != null ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}` : null;
    if (grantErr) {
      console.error(`[webhook] ${formule} : upgrade_monthly_grant : ${grantErr.message}`);
      await alerterPaiementNonCredite({ canal: "stripe", type: "abonnement", user_id: qui.id, email, produit: formule, montant, ref: `stripe:${session.id}`, rpc: null, erreur: grantErr.message });
    } else if ((grantRes as { granted?: boolean })?.granted === true) {
      await notifierPaiement({ canal: "stripe", type: "abonnement", user_id: qui.id, email, produit: formule, montant,
        pepites: (grantRes as { amount?: number })?.amount ?? null, ref: `stripe:${session.id}`, rpc: grantRes });
    }
  }
  console.log(`[webhook] ${formule} souscrite → user=${qui.id} session=${session.id} statut=${sub?.status ?? "?"}${carteRefusee ? " (essai refusé : carte déjà vue)" : ""}`);
  return new Response(JSON.stringify({ received: true, formule }), { headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEventAsync
      ? await stripe.webhooks.constructEventAsync(
          body,
          signature!,
          Deno.env.get("STRIPE_WEBHOOK_SECRET")!
        )
      : stripe.webhooks.constructEvent(
          body,
          signature!,
          Deno.env.get("STRIPE_WEBHOOK_SECRET")!
        );
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // ── (12/11, lot « zéro problème », point 4a) UN ÉVÉNEMENT DU MODE TEST N'EST JAMAIS APPLIQUÉ EN PRODUCTION ──────────
  // Aujourd'hui fermé par construction (un seul secret de signature : celui du mode réel), mais par aucune règle. Un
  // client, un abonnement ou une session du mode test n'existe pas en production : rien à y appliquer, aucun mail
  // client ; une alerte à support@ marquée « [TEST] » dit qu'un tel événement est arrivé ici. Règle :
  // _shared/environnement-store.js (notificationDeTest, livemode).
  if (notificationDeTest({ canal: "stripe", livemode: (event as { livemode?: boolean }).livemode })) {
    console.warn(`[webhook] événement du MODE TEST ${event.id} (${event.type}) : rien appliqué, aucun mail client`);
    await alerterPaiementNonCredite({
      canal: "stripe", test: true, type: "abonnement", produit: event.type, ref: event.id, rpc: null,
      erreur: "Événement Stripe du MODE TEST reçu par le webhook de production : rien appliqué (aucun droit, aucun mail client).",
    });
    return new Response(JSON.stringify({ received: true, ignore: "mode_test" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;
    const customerId = session.customer as string;
    const planType = session.metadata?.plan_type ?? "standard";

    // ── Pack de pièces (mode payment) : créditer et sortir — pas un abonnement ──
    // Idempotent : ref stripe:<session.id>, un event rejoué ne crédite pas deux fois.
    if (session.metadata?.purchase_type === "coins") {
      const coins = parseInt(session.metadata?.coins ?? "0", 10);
      const packUserId = session.metadata?.user_id;
      if (packUserId && coins > 0) {
        const { data: credit, error: creditErr } = await supabase.rpc("credit_purchased_coins", {
          p_user_id: packUserId,
          p_amount: coins,
          p_ref: `stripe:${session.id}`,
          p_metadata: { pack: session.metadata?.coin_pack ?? null, amount_total: session.amount_total },
        });
        const montantPack = session.amount_total != null
          ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
          : null;
        if (creditErr) {
          console.error("[webhook] credit coins failed:", creditErr.message);
          await alerterPaiementNonCredite({
            canal: "stripe", type: "pack", user_id: packUserId, email: email ?? null,
            produit: session.metadata?.coin_pack ?? `${coins} Pépites`,
            montant: montantPack, ref: `stripe:${session.id}`, rpc: null, erreur: creditErr.message,
          });
        } else {
          console.log(`[webhook] coins pack → user=${packUserId} coins=${coins}`, JSON.stringify(credit));
          // credited=false = event Stripe rejoué, déjà crédité → pas de mail.
          if ((credit as { credited?: boolean })?.credited === true) {
            await notifierPaiement({
              canal: "stripe", type: "pack", user_id: packUserId, email: email ?? null,
              produit: session.metadata?.coin_pack ?? `${coins} Pépites`,
              montant: montantPack, pepites: coins, ref: `stripe:${session.id}`, rpc: credit,
            });
          }
        }
      } else {
        console.error("[webhook] coins session without user_id/coins metadata:", session.id);
        // Paiement encaissé par Stripe mais métadonnées inexploitables : sans
        // user_id ni montant de Pépites, aucun crédit possible automatiquement.
        await alerterPaiementNonCredite({
          canal: "stripe", type: "pack", email: email ?? null,
          produit: session.metadata?.coin_pack ?? null,
          montant: session.amount_total != null
            ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
            : null,
          ref: `stripe:${session.id}`, rpc: null,
          erreur: "Session de pack sans user_id ou sans nombre de Pépites dans les métadonnées.",
        });
      }
      // Conversion TikTok RETIRÉE le 7 septembre 2026 (décision Nico) : plus
      // aucune donnée d'achat ne part vers une régie publicitaire.
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── L'ABONNEMENT CLOUD (04/10/2026) ─────────────────────────────────────
    // ⛔ AVANT le chemin des paliers, qui pose is_premium = true pour toute
    // session d'abonnement. Une session Cloud ne pose QUE les colonnes Cloud
    // (relues chez Stripe) et ne crédite aucun quota.
    if (session.metadata?.option === "cloud") {
      const cible = session.metadata?.fillsell_user_id || null;
      const { data: qui } = cible
        ? await supabase.from("profiles").select("id").eq("id", cible).maybeSingle()
        : await supabase.from("profiles").select("id").eq("email", email ?? "").maybeSingle();
      if (qui?.id) {
        await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", qui.id);
        // ── LE 4e VERROU : LA CARTE (05/10) ─────────────────────────────────
        // Un essai Cloud = une carte. Son empreinte Stripe (card.fingerprint),
        // hachée en base (cloud_essai_noter_carte), déjà vue sur l'essai d'un
        // AUTRE compte → l'abonnement d'essai est annulé SUR-LE-CHAMP (rien
        // n'est prélevé), l'essai compte comme pris, et la raison est écrite
        // pour que l'app la dise. Best-effort sur la LECTURE de la carte (une
        // carte illisible ne bloque pas un client), jamais sur le verdict.
        let carteRefusee = false;
        let subEssai: Stripe.Subscription | null = null;
        if (session.metadata?.essai_cloud === "1" && session.subscription) {
          try {
            const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
            const sub = await stripe.subscriptions.retrieve(subId, { expand: ["default_payment_method"] });
            subEssai = sub;
            let pm = sub.default_payment_method as Stripe.PaymentMethod | string | null;
            if (!pm || typeof pm === "string") {
              const client = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] }) as Stripe.Customer;
              pm = (client.invoice_settings?.default_payment_method ?? null) as Stripe.PaymentMethod | string | null;
            }
            const empreinte = pm && typeof pm !== "string" ? pm.card?.fingerprint ?? null : null;
            if (!empreinte) {
              console.warn(`[webhook] essai Cloud ${subId} : empreinte de carte illisible — verrou carte non appliqué`);
            } else {
              const { data: verdict, error: errCarte } = await supabase.rpc("cloud_essai_noter_carte", { p_user: qui.id, p_carte: empreinte });
              if (errCarte) console.error(`[webhook] cloud_essai_noter_carte : ${errCarte.message}`);
              else if (verdict?.ok === false && verdict?.raison === "carte_deja_vue") {
                await stripe.subscriptions.cancel(subId);
                carteRefusee = true;
                console.log(`[webhook] essai Cloud ${subId} ANNULÉ : carte déjà utilisée pour l'essai d'un autre compte (rien prélevé)`);
              }
            }
          } catch (e) {
            console.error(`[webhook] verrou carte de l'essai Cloud : ${(e as Error)?.message ?? e}`);
          }
        }
        await recomputeStripeFlags(supabase, customerId);
        if (carteRefusee) {
          await supabase.from("profiles").update({ cloud_essai_refus: "carte_deja_vue" }).eq("id", qui.id);
        }
        console.log(`[webhook] abonnement Cloud créé → user=${qui.id} session=${session.id} essai=${session.metadata?.essai_cloud ?? "?"}${carteRefusee ? " (refusé : carte déjà vue)" : ""}`);
        // (08/11) Le mail de début d'essai (un seul : registre cloud_mails, clé = l'abonnement), au prix de la PREMIÈRE
        // échéance lu chez Stripe (facture à venir, remise comprise ; sinon le prix de l'abonnement). Un essai refusé
        // par le verrou carte n'en reçoit pas. Une souscription payée sans essai : son mail part de invoice.paid.
        if (!carteRefusee && subEssai) {
          const subLu = subEssai;
          await mailsCloud(supabase, {
            userId: qui.id, canal: "stripe", evenements: evenementDebutStripe(subLu), journal: "[webhook]",
            lirePrix: async () => {
              try {
                const aVenir = await stripe.invoices.retrieveUpcoming({ subscription: subLu.id });
                const m = montantStripe(Number(aVenir?.amount_due), aVenir?.currency);
                if (m) return m;
              } catch (e) {
                console.warn(`[webhook] facture à venir de ${subLu.id} illisible : ${(e as Error)?.message ?? e}`);
              }
              return prixDepuisStripe(subLu).prix;
            },
          });
        }
      } else {
        console.error(`[webhook] session Cloud ${session.id} : compte introuvable (user=${cible ?? "?"}, email=${email ?? "?"})`);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", email: email ?? null, produit: "cloud",
          ref: `stripe:${session.id}`, rpc: null,
          erreur: "Abonnement Cloud (essai ou payé) sans compte FillSell retrouvé.",
        });
      }
      return new Response(JSON.stringify({ received: true, cloud: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── (11/11/2026) UNE FORMULE AVEC CLOUD (Premium + Cloud, Pro + Cloud, Business + Cloud) ──────────────
    // Un abonnement qui porte le palier ET le Cloud : drapeaux et colonnes Cloud relus chez Stripe (recomputeStripeFlags).
    // Essai (Premium + Cloud, Pro + Cloud seulement) : le 4e verrou (la carte) ; AUCUN crédit pendant l'essai — le crédit
    // du mois vient avec le premier paiement réel (invoice.paid). Payée tout de suite (Business + Cloud, ou essai déjà pris) :
    // le crédit du mois ici, au palier de la formule.
    if (formuleDeMetadonnees(session.metadata)) {
      return await formuleCloudSouscrite(supabase, session, customerId, email ?? null);
    }

    // (15/10) Le compte se retrouve par l'identifiant FillSell posé sur la
    // session (create-checkout-session, metadata.fillsell_user_id depuis le
    // 01/10) ; l'adresse de Checkout n'est plus qu'un repli. Avant : une
    // adresse de paiement différente de celle du compte ne créditait RIEN, et
    // rien ne le signalait.
    const cibleUser = String(session.metadata?.fillsell_user_id ?? "").trim() || null;
    if (!email && !cibleUser) {
      return new Response("No email found", { status: 400 });
    }

    let users: Array<{ id: string }> | null = null;
    if (cibleUser) {
      const { data } = await supabase.from("profiles").select("id").eq("id", cibleUser).limit(1);
      users = (data ?? null) as Array<{ id: string }> | null;
    }
    if ((!users || users.length === 0) && email) {
      const { data } = await supabase.from("profiles").select("id").eq("email", email).limit(1);
      users = (data ?? null) as Array<{ id: string }> | null;
    }
    if (!users || users.length === 0) {
      console.error(`[webhook] checkout ${session.id} : compte introuvable (user=${cibleUser ?? "?"}, email=${email ?? "?"})`);
      await alerterPaiementNonCredite({
        canal: "stripe", type: "abonnement", email: email ?? null, produit: planType,
        montant: session.amount_total != null
          ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
          : null,
        ref: `stripe:${session.id}`, rpc: null,
        erreur: "Abonnement payé sans compte FillSell retrouvé (ni par l'identifiant de la session, ni par l'adresse).",
      });
    }

    if (users && users.length > 0) {
      const profileUpdate: Record<string, unknown> = {
        is_premium: true,
        stripe_customer_id: customerId,
      };
      // is_founder is set once and NEVER cleared — only set on founder plan
      if (planType === "founder") {
        profileUpdate.is_founder = true;
      }
      // Flags CUMULATIFS (migration 20260808213000) : Business ⊇ Pro ⊇ Premium.
      // Un Business reçoit donc AUSSI is_pro — sinon toutes les gates écrites
      // en isPro (republication auto, outils Excel avancés…) se fermeraient
      // pour le palier le plus cher.
      if (planType === "pro" || planType === "business") {
        profileUpdate.is_pro = true;
      }
      if (planType === "business") {
        profileUpdate.is_business = true;
      }

      await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", users[0].id);

      // Atomically increment founder slot counter
      if (planType === "founder") {
        await supabase.rpc("increment_founder_slots");
      }

      // Pièces incluses créditées dès l'activation. Depuis le cycle par
      // utilisateur (2026-07-28), on transmet AUSSI l'échéance réelle du
      // store : current_period_end de l'abonnement fraîchement créé fixe la
      // date du prochain grant. Sans elle, le cycle retomberait sur la date
      // d'inscription — pas faux, mais décalé par rapport à la facturation.
      // Lecture tolérante : un échec ici ne doit jamais empêcher le crédit,
      // la RPC sait retomber sur l'ancrage.
      let periodEnd: string | null = null;
      try {
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          if (sub?.current_period_end) {
            periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }
        }
      } catch (e) {
        console.error("[webhook] current_period_end illisible:", (e as Error)?.message);
      }
      // 'business' TESTÉ EN PREMIER : upgrade_monthly_grant n'accepte que
      // 'free'|'premium'|'pro'|'business' (migration 20260808214000) et le
      // grant Business vaut 3000 (coin_config.monthly_grant_business). Sans ce
      // cran, un abonné Business payé 59,99 € recevait le grant Premium.
      const grantTier = planType === "business" ? "business" : planType === "pro" ? "pro" : "premium";
      const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
        p_user_id: users[0].id,
        p_tier: grantTier,
        p_period_end: periodEnd,
        p_source: "payment",
      });
      const montantAbo = session.amount_total != null
        ? `${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? "eur").toUpperCase()}`
        : null;
      if (grantErr) {
        console.error("[webhook] upgrade_monthly_grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", user_id: users[0].id, email: email ?? null,
          produit: planType, montant: montantAbo, ref: `stripe:${session.id}`,
          rpc: null, erreur: grantErr.message,
        });
      } else if ((grantRes as { granted?: boolean })?.granted === true) {
        await notifierPaiement({
          canal: "stripe", type: "abonnement", user_id: users[0].id, email: email ?? null,
          produit: planType, montant: montantAbo,
          pepites: (grantRes as { amount?: number })?.amount ?? null,
          ref: `stripe:${session.id}`, rpc: grantRes,
        });
      }
    }

    // Conversion TikTok RETIRÉE le 7 septembre 2026 (décision Nico).
  }

  // Renouvellements d'abonnement : re-crédit des pièces incluses, idempotent
  // par période. Activation de l'événement VÉRIFIÉE dans le dashboard le
  // 2026-07-28 — l'endpoint « Fill & Sell webhook » écoute bien les quatre
  // événements que ce fichier traite : checkout.session.completed,
  // customer.subscription.deleted, customer.subscription.updated, invoice.paid.
  // C'est la configuration Stripe qui fait foi : si quelqu'un la modifie, les
  // abonnés cessent d'être crédités et ops-digest le signale (section 6,
  // « renouvellement non constaté »).
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    // ── LA FACTURE D'UN ABONNEMENT CLOUD (04/10/2026) ───────────────────────
    // Fin d'essai (première facture à 24,99 €), renouvellement, ou facture à 0 € de
    // la création : on relit les colonnes Cloud chez Stripe et on SORT — le
    // chemin des paliers ci-dessous créditerait les quotas du palier du compte
    // sur une facture Cloud.
    const subIdFacture = abonnementDeFacture(invoice);
    // (15/10, DeadRoz) L'abonnement de la facture sert aussi à lire le PALIER
    // payé (palierDeFacture), plus bas — jamais les drapeaux du profil.
    let subFacture: Stripe.Subscription | null = null;
    if (subIdFacture) {
      try {
        const sub = await stripe.subscriptions.retrieve(subIdFacture);
        subFacture = sub;
        if (estAbonnementCloud(sub, prixConnus())) {
          await recomputeStripeFlags(supabase, customerId);
          console.log(`[webhook] facture Cloud ${invoice.id} (${sub.id}, statut ${sub.status}, ${invoice.amount_paid ?? "?"} ${invoice.currency ?? ""}) : colonnes Cloud relues, aucun quota`);
          // (08/11) Prélèvement fait (montant PAYÉ de la facture, remise comprise) : un mail par facture.
          await mailsCloudDuClient(supabase, customerId, evenementPaiementStripe(invoice, sub));
          return new Response(JSON.stringify({ received: true, cloud: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.error(`[webhook] abonnement ${subIdFacture} de la facture ${invoice.id} illisible : ${(e as Error)?.message ?? e}`);
      }
    }
    // ── MONTÉE DE PALIER PAYÉE (2026-09-24) ─────────────────────────────────
    // Le paiement de la différence est CONFIRMÉ : c'est maintenant, et
    // seulement maintenant, que le palier se pose. Flags CUMULATIFS (Business ⊇
    // Pro ⊇ Premium), métadonnée de l'abonnement et annulation programmée levée
    // — celles-ci seulement une fois la mise à jour réellement appliquée (plus
    // de pending_update), sinon customer.subscription.updated s'en charge.
    // (11/11/2026) AUCUN CRÉDIT PENDANT UN ESSAI, sur aucun abonnement : la facture à 0 € de la création d'un essai
    // (formule avec Cloud) ne crédite rien et n'ouvre aucun cycle — les droits de l'essai viennent des drapeaux.
    if (subFacture?.status === "trialing") {
      await recomputeStripeFlags(supabase, customerId);
      console.log(`[webhook] facture ${invoice.id} pendant l'essai de ${subFacture.id} (${invoice.amount_paid ?? "?"} ${invoice.currency ?? ""}) : aucun crédit`);
      return new Response(JSON.stringify({ received: true, essai: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const formuleFacture = subFacture ? formuleDAbonnementStripe(subFacture, prixConnus()) : null;
    const montee = planDeMontee(invoice);
    if (montee) {
      const { error: flagsErr } = await supabase
        .from("profiles")
        .update({ is_premium: true, is_pro: true, ...(montee === "business" ? { is_business: true } : {}) })
        .eq("stripe_customer_id", customerId);
      if (flagsErr) console.error(`[webhook] montée ${montee} payée — flags non posés : ${flagsErr.message}`);
      const subId = abonnementDeFacture(invoice);
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          if (!sub.pending_update && (sub.metadata?.plan_type !== montee || sub.cancel_at_period_end)) {
            await stripe.subscriptions.update(subId, {
              metadata: { ...(sub.metadata ?? {}), plan_type: montee },
              cancel_at_period_end: false,
            });
          }
        } catch (e) {
          const se = e as { code?: string; message?: string };
          console.error(`[webhook] montée ${montee} payée — metadata de ${subId} non posée : code=${se?.code ?? "?"} message=${se?.message ?? e}`);
        }
      }
      console.log(`[webhook] montée de palier PAYÉE → ${montee} (facture ${invoice.id}, customer ${customerId}, ${invoice.amount_paid ?? "?"} ${invoice.currency ?? ""})`);
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, is_pro, is_business")
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (profs && profs.length > 0) {
      // upgrade_monthly_grant : identique à grant_monthly_coins au 1er du mois
      // (délégation si mois vierge) ; en cours de mois, la facture de proration
      // d'un upgrade sert de filet si le top-up synchrone de
      // create-checkout-session a raté (idempotent, no-op sinon).
      // is_business testé d'abord (2026-08-08) : Business n'existe pas côté
      // Stripe, mais un Business mobile qui porterait AUSSI un abonnement
      // Stripe résiduel ne doit pas voir son grant rétrogradé à 'pro'.
      // Une montée payée donne SON palier, quel que soit l'ordre d'arrivée des
      // événements (les flags viennent d'être posés juste au-dessus).
      // ⛔ (15/10, DeadRoz) Hors montée, le palier se lit sur CE QUE STRIPE
      // FACTURE (lignes de la facture, prix puis plan_type de l'abonnement),
      // jamais sur les drapeaux : un client qui REVIENT (ancien identifiant
      // Stripe gardé, drapeaux encore à false) était crédité « premium » ici,
      // puis « business » par checkout.session.completed — deux crédits, deux
      // mails pour un seul prélèvement. Même palier des deux côtés : un seul
      // crédit (upgrade_monthly_grant, no_upgrade_needed). Les drapeaux ne
      // restent qu'en repli, dit dans les journaux.
      const palierPaye = palierDeFacture(invoice, subFacture, prixConnus());
      const tier = montee ?? palierPaye ?? (profs[0].is_business ? "business" : profs[0].is_pro ? "pro" : "premium");
      if (!montee && !palierPaye) {
        console.warn(`[webhook] invoice.paid ${invoice.id} : palier illisible sur la facture et l'abonnement — repli sur les drapeaux du profil (${tier})`);
      }
      // Fin de la période facturée = échéance du prochain grant. C'est LE
      // signal de renouvellement : depuis le cycle par utilisateur, un compte
      // à canal de paiement n'est plus crédité que sur cet événement (le sweep
      // ne rattrape qu'un retard de 3 jours). D'où p_source: "payment".
      // ⛔ La fin de période la PLUS TARDIVE des lignes, jamais la ligne 0
      // (2026-09-26, XEWER recalé sur le 1er du mois) : sur une facture de
      // proration, Stripe range TOUJOURS le crédit « Temps non utilisé » en
      // premier (relevé sur les 41 factures du compte). Quand l'ancrage de
      // facturation change, ce crédit s'arrête à l'ANCIENNE échéance : lue en
      // ligne 0, elle reposait next_grant_at sur l'ancien cycle et le balayage
      // y aurait fait une seconde recharge. Neutre partout ailleurs : facture à
      // une ligne = même valeur ; les 4 factures multi-lignes de l'historique
      // (montées de palier) ont toutes leurs lignes sur la même échéance.
      const finsDeLignes = (invoice.lines?.data ?? [])
        // deno-lint-ignore no-explicit-any
        .map((l: any) => l?.period?.end)
        .filter((e: unknown): e is number => typeof e === "number" && e > 0);
      const invPeriodEnd = finsDeLignes.length > 0 ? Math.max(...finsDeLignes) : invoice.period_end;
      const { data: grantRes, error: grantErr } = await supabase.rpc("upgrade_monthly_grant", {
        p_user_id: profs[0].id,
        p_tier: tier,
        p_period_end: invPeriodEnd ? new Date(invPeriodEnd * 1000).toISOString() : null,
        p_source: "payment",
      });
      const montantFacture = invoice.amount_paid != null
        ? `${(invoice.amount_paid / 100).toFixed(2)} ${(invoice.currency ?? "eur").toUpperCase()}`
        : null;
      if (grantErr) {
        console.error("[webhook] invoice.paid grant:", grantErr.message);
        await alerterPaiementNonCredite({
          canal: "stripe", type: "abonnement", user_id: profs[0].id, produit: tier,
          montant: montantFacture, ref: invoice.id ?? null, rpc: null, erreur: grantErr.message,
        });
      } else {
        console.log(`[webhook] invoice.paid grant → user=${profs[0].id} tier=${tier}`);
        // granted=false : facture de proration ou event rejoué sur un cycle
        // déjà crédité — le renouvellement n'a rien ajouté, donc pas de mail.
        // (11/11) Une formule avec Cloud : son mail de paiement (« Pro + Cloud continue », montant payé), un par facture.
        if (formuleFacture) await mailsCloudDuClient(supabase, customerId, evenementPaiementStripe(invoice, subFacture));
        if ((grantRes as { granted?: boolean })?.granted === true) {
          await notifierPaiement({
            canal: "stripe", type: "abonnement", user_id: profs[0].id, produit: formuleFacture ?? tier,
            montant: montantFacture,
            pepites: (grantRes as { amount?: number })?.amount ?? null,
            ref: invoice.id ?? null, rpc: grantRes,
          });
        }
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    console.log(
      "[webhook] subscription.deleted for customer:", customerId,
      "plan_type:", subscription.metadata?.plan_type ?? "?",
      "price:", subscription.items?.data?.[0]?.price?.id ?? "?"
    );

    // Plus JAMAIS is_premium/is_pro à false en bloc : l'abonnement supprimé a
    // déjà le statut canceled, recomputeStripeFlags ne compte que ce qui reste.
    // Un seul abonnement existait → tout tombe (correct) ; un double historique
    // Premium+Pro → l'autre survit.
    await recomputeStripeFlags(supabase, customerId);
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;

    console.log("[webhook] subscription.updated for customer:", customerId, "status:", status, "cancel_at_period_end:", cancelAtPeriodEnd);

    // ── SOUSCRIPTION ABANDONNÉE : LE SEUL MAIL D'UN PAIEMENT INITIAL (09/10) ──
    // Avant le chemin Cloud (qui sort plus bas) : une souscription Cloud payante
    // abandonnée s'écrit aussi. Tout est avalé dans la fonction.
    if (status === "incomplete_expired") {
      await signalerSouscriptionAbandonnee(supabase, subscription, customerId, event.type);
    }

    // ── LE PRIX A CHANGÉ : UNE MONTÉE EN ATTENTE VIENT D'ÊTRE APPLIQUÉE
    //    (2026-09-24) ─────────────────────────────────────────────────────────
    // Filet d'invoice.paid : si la facture est arrivée avant que Stripe
    // n'applique la mise à jour, la métadonnée de palier n'a pas pu suivre. Le
    // prix fait foi : métadonnée réalignée (le rang de create-checkout-session
    // la lit en premier) et flags recalculés depuis Stripe. Jamais pendant une
    // mise à jour encore en attente — rien n'est payé.
    const precedent = ((event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes) ?? {};
    const prixChange = "items" in precedent || "plan" in precedent;
    // (04/10) Un abonnement Cloud se relit à chaque changement (fin d'essai,
    // résiliation programmée ou levée, impayé) et ne passe JAMAIS par le
    // réalignement de métadonnée de palier ci-dessous.
    if (estAbonnementCloud(subscription, prixConnus())) {
      // Arrêt demandé PENDANT l’essai (portail Stripe, dashboard) : effet immédiat,
      // comme le bouton de l’app (palier.js : rien facturé, l’essai s’arrête).
      let evenementsArret: EvenementCloud[] = [];
      if (status === "trialing" && cancelAtPeriodEnd) {
        try {
          const annule = await stripe.subscriptions.cancel(subscription.id);
          console.log(`[webhook] essai Cloud ${subscription.id} arrêté tout de suite (résiliation pendant l’essai)`);
          // (08/11) « Aucun prélèvement » seulement si Stripe le MONTRE : abonnement annulé avant la fin de l'essai,
          // toutes ses factures à 0.
          const factures = await stripe.invoices.list({ subscription: subscription.id, limit: 20 });
          evenementsArret = evenementArretStripe(annule, factures.data);
        } catch (e) {
          console.error(`[webhook] arrêt immédiat de l’essai Cloud ${subscription.id} impossible : ${(e as Error)?.message ?? e}`);
        }
      } else if (status === "active" && cancelAtPeriodEnd && precedent.cancel_at_period_end === false) {
        // Arrêt programmé posé hors de l'app (portail) : même mail que cancel-subscription, même clé (un seul).
        evenementsArret = evenementArretStripe(subscription);
      }
      console.log(`[webhook] abonnement Cloud ${subscription.id} mis à jour (statut ${status}, annulation ${cancelAtPeriodEnd}) → relecture`);
      await recomputeStripeFlags(supabase, customerId);
      await mailsCloudDuClient(supabase, customerId, evenementsArret);
      return new Response(JSON.stringify({ received: true, cloud: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    // (11/11) UNE FORMULE AVEC CLOUD : arrêt pendant l'essai = effet IMMÉDIAT, rien facturé (même règle que le Cloud
    // seul) ; arrêt programmé posé hors de l'app (portail) = le mail d'arrêt de la formule.
    const formuleSub = formuleDAbonnementStripe(subscription, prixConnus());
    if (formuleSub && status === "trialing" && cancelAtPeriodEnd) {
      let evenementsArretF: EvenementCloud[] = [];
      try {
        const annule = await stripe.subscriptions.cancel(subscription.id);
        const factures = await stripe.invoices.list({ subscription: subscription.id, limit: 20 });
        evenementsArretF = evenementArretStripe(annule, factures.data);
        console.log(`[webhook] essai ${formuleSub} ${subscription.id} arrêté tout de suite (résiliation pendant l'essai)`);
      } catch (e) {
        console.error(`[webhook] arrêt immédiat de l'essai ${formuleSub} ${subscription.id} impossible : ${(e as Error)?.message ?? e}`);
      }
      await recomputeStripeFlags(supabase, customerId);
      await mailsCloudDuClient(supabase, customerId, evenementsArretF);
      return new Response(JSON.stringify({ received: true, formule: formuleSub }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (formuleSub && status === "active" && cancelAtPeriodEnd && precedent.cancel_at_period_end === false) {
      await mailsCloudDuClient(supabase, customerId, evenementArretStripe(subscription));
    }
    // La métadonnée `formule` suit le PRIX (retrait du Cloud, changement de formule appliqué par un schedule).
    if (prixChange && !subscription.pending_update && (subscription.metadata?.formule ?? null) !== (formuleSub ?? null)
        && (status === "active" || status === "trialing" || status === "past_due")) {
      try {
        await stripe.subscriptions.update(subscription.id, { metadata: { ...(subscription.metadata ?? {}), formule: formuleSub ?? "" } });
      } catch (e) {
        console.error(`[webhook] métadonnée de formule non réalignée sur ${subscription.id} : ${(e as Error)?.message ?? e}`);
      }
    }
    let recalcule = false;
    if (prixChange && !subscription.pending_update
        && (status === "active" || status === "trialing" || status === "past_due")) {
      const plan = planDuPrix(subscription);
      if (plan && subscription.metadata?.plan_type !== plan) {
        try {
          await stripe.subscriptions.update(subscription.id, { metadata: { ...(subscription.metadata ?? {}), plan_type: plan } });
        } catch (e) {
          const se = e as { code?: string; message?: string };
          console.error(`[webhook] metadata de palier non réalignée sur ${subscription.id} : code=${se?.code ?? "?"} message=${se?.message ?? e}`);
        }
      }
      await recomputeStripeFlags(supabase, customerId);
      recalcule = true;
    }

    // ── (29/10) LE STATUT A CHANGÉ : LE PALIER SUIT, DANS LES DEUX SENS ───────
    // active → past_due (renouvellement refusé) : le palier tombe ; past_due /
    // unpaid → active (facture réglée, même des jours plus tard) : il revient.
    // Avant, seuls unpaid / incomplete_expired recalculaient : une facture
    // impayée réglée après coup (unpaid → active) ne rendait jamais le palier.
    // Même logique que subscription.deleted : recalcul depuis ce qui reste de
    // PAYÉ, jamais de remise à zéro aveugle (un double-abo historique dont SEUL
    // le Premium tombe en impayé garde son Pro).
    const statutChange = "status" in precedent;
    if (statutChange || status === "unpaid" || status === "incomplete_expired" || status === "past_due") {
      if (statutChange) console.log(`[webhook] statut ${String(precedent.status)} → ${status} (${subscription.id}) : palier recalculé`);
      if (!recalcule) await recomputeStripeFlags(supabase, customerId);
    } else {
      await supabase
        .from("profiles")
        .update({ subscription_cancel_at_period_end: cancelAtPeriodEnd })
        .eq("stripe_customer_id", customerId);
    }
  }

  // ── Échec de paiement client (2026-08-07, cas Matt) ─────────────────────────
  // Deux événements, deux nuances du même trou :
  //   · invoice.payment_failed : la tentative a eu lieu et a échoué (carte
  //     refusée, expirée, 3DS refusé par la banque) — souscription OU
  //     renouvellement (billing_reason les distingue) ;
  //   · invoice.payment_action_required : la banque attend une validation
  //     3D Secure que le client n'a jamais faite (le cas Matt exactement).
  // ⚠️ Ces événements doivent AUSSI être cochés sur l'endpoint dans le
  // dashboard Stripe — sans ça, ce code ne reçoit rien. La ligne de log
  // ci-dessous est le témoin de bout en bout : un « Send test event » depuis
  // le dashboard doit la faire apparaître dans les logs de la fonction ET
  // déclencher l'alerte ops (avec « compte introuvable », normal sur un
  // event de test aux données factices).
  // Le mail client, l'alerte Nico et la dédup par facture vivent dans
  // email-tunnel (mode payment_failed) — ici on ne fait qu'établir les FAITS
  // (qui, quelle cause, quel contexte) puis signaler. Toujours 200 à Stripe :
  // un échec de notification ne doit jamais faire rejouer l'événement.
  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = (invoice.customer as string | null) ?? null;
    console.log(
      `[webhook] échec de paiement reçu: ${event.type} facture=${invoice.id} ` +
      `customer=${customerId ?? "?"} billing_reason=${invoice.billing_reason ?? "?"} ` +
      `amount_due=${invoice.amount_due ?? "?"}`
    );
    // ── MONTÉE DE PALIER EN ATTENTE DE VALIDATION (2026-09-24) ──────────────
    // Une facture de différence (billing_reason subscription_update) qui
    // réclame une action du client n'est PAS un échec : create-checkout-session
    // vient d'ouvrir sa page Stripe au client, qui la valide lui-même. Aucun
    // mail « paiement échoué », aucune alerte : s'il abandonne, Stripe annule la
    // facture et la mise à jour à l'échéance, et il reste à son palier.
    if (invoice.billing_reason === "subscription_update") {
      console.log(`[webhook] ${event.type} sur la facture de MONTÉE ${invoice.id} : le client valide sur la page Stripe — ni mail ni alerte`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── LES FAITS, RELUS CHEZ STRIPE (05/10/2026) ───────────────────────────
    // L'événement arrive au format d'API de l'endpoint (2026-03-25.dahlia,
    // relevé du 24/09, cf. abonnementDeFacture) : ni `payment_intent` ni
    // `subscription` à la racine de la facture — la cause fine ne se lisait
    // donc jamais (« autre », ou « 3ds » sur action_required). On RELIT la
    // facture par le SDK, épinglé au 2023-10-16 (payment_intent, subscription,
    // status, hosted_invoice_url, next_payment_attempt, lignes et périodes),
    // puis son abonnement (trial_end, status, option Cloud). Une lecture ratée
    // = l'événement seul, jamais un blocage. Règles et textes :
    // _shared/paiement-echoue.js.
    // deno-lint-ignore no-explicit-any
    let facture: any = invoice;
    try {
      if (invoice.id) facture = await stripe.invoices.retrieve(invoice.id);
    } catch (e) {
      console.warn(`[webhook] facture ${invoice.id} non relue, l'événement seul fait foi : ${(e as Error)?.message ?? e}`);
    }
    // deno-lint-ignore no-explicit-any
    let abonnement: any = null;
    const subEchec = abonnementDeFacture(facture) ?? abonnementDeFacture(invoice);
    if (subEchec) {
      try {
        abonnement = await stripe.subscriptions.retrieve(subEchec);
      } catch (e) {
        console.warn(`[webhook] abonnement ${subEchec} non relu (ni fin d'essai, ni « reste actif ») : ${(e as Error)?.message ?? e}`);
      }
    }

    // ── UN ÉCHEC ACQUIS, SINON RIEN (09/10/2026, cas Marta) ─────────────────
    // Une souscription au Checkout dont la banque demande le 3D Secure fait
    // partir CES DEUX événements pendant que la personne valide encore sur la
    // page (Marta : mail à 11:06:47, payé à 11:07:20). Paiement initial en
    // cours → ni mail ni alerte : son abandon s'écrit à incomplete_expired
    // (signalerSouscriptionAbandonnee). Facture relue déjà payée → rien.
    // Renouvellement / fin d'essai non payés → le mail part, comme avant.
    const decision = decisionMailEchec({ evenement: event.type, facture, abonnement });
    if (!decision.envoyer) {
      console.log(
        `[webhook] ${event.type} ${invoice.id} : aucun mail ni alerte — ${decision.raison} ` +
        `(billing_reason=${facture?.billing_reason ?? "?"}, facture ${facture?.status ?? "?"}, abonnement ${abonnement?.status ?? "?"})`
      );
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    await signalerEchecAcquis(supabase, { invoice, facture, abonnement, evenement: event.type });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
