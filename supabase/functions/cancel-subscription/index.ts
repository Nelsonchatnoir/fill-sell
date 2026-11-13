import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { dateSeuleParis, langue, mailResiliation } from "../_shared/emails-fillsell.ts";
import { estAbonnementCloud, coupureRenouvellementStripe } from "../_shared/cloud-option.js";
import { evenementArretStripe, finPeriodeStripe } from "../_shared/cloud-mails.js";
import { mailsCloud } from "../_shared/cloud-mails-envoi.ts";
// (11/11/2026, offres Cloud) Une formule avec Cloud : { option: "cloud" } arrête son ESSAI ; l'essai du Cloud d'un abonné
// (schedule) s'arrête et sa formule continue. (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) « arrêter » un essai = couper son
// renouvellement, sur tous les canaux : la résiliation est programmée à la fin de l'essai (aucune facture), le Cloud reste
// actif jusque-là — jamais subscriptions.cancel pendant un essai (couperEssaiStripe) ; une formule PAYÉE retire son Cloud à la fin
// de la période par changer-formule ({ action: "retirer_cloud" }). Prix lus à un seul endroit (_shared/prix-stripe.ts).
import { prixStripe } from "../_shared/prix-stripe.ts";
import { formuleDAbonnementStripe, essaiCloudAbonneStripe, nomDeFormule } from "../_shared/formules-serveur.js";

// (04/10) L'option Cloud est un abonnement Stripe À PART. Sans corps (appel
// historique) : résiliation du PALIER, jamais de l'abonnement Cloud.
// `{ option: "cloud" }` : résiliation de Cloud à l'échéance (pendant l'essai,
// à la fin de l'essai : aucun débit). Un Cloud pris dans l'App Store ou Google
// Play se résilie dans la boutique.
function prixConnus() {
  return prixStripe();
}

// (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) Arrêter un ESSAI depuis l'app = couper son
// renouvellement, comme sur l'iPhone et Android : la résiliation est programmée à trial_end — Stripe termine alors
// l'abonnement, AUCUNE facture — et le Cloud reste actif jusque-là, puis s'arrête seul (la relecture, drapeauxDepuisStripe,
// pose cloud_arret_fin_periode). Avant : stripe.subscriptions.cancel, Cloud coupé sur-le-champ. Un schedule (changement de
// formule programmé pendant l'essai) est rendu d'abord : Stripe refuse sinon la résiliation (« managed by the subscription
// schedule »). Idempotent : une résiliation déjà programmée n'est pas réécrite. Rend l'abonnement relu, la fin de l'essai et
// si un schedule a été rendu.
async function couperEssaiStripe(sub: Stripe.Subscription): Promise<{ coupe: Stripe.Subscription; finIso: string | null; scheduleRendu: boolean }> {
  let scheduleRendu = false;
  let coupe = sub;
  if (!coupureRenouvellementStripe(sub)) {
    const idSched = typeof sub.schedule === "string" ? sub.schedule : (sub.schedule as { id?: string } | null)?.id ?? null;
    if (idSched) { await stripe.subscriptionSchedules.release(idSched); scheduleRendu = true; }
    coupe = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  }
  const fin = typeof coupe.trial_end === "number" ? coupe.trial_end : finPeriodeStripe(coupe);
  return { coupe, finIso: typeof fin === "number" ? new Date(fin * 1000).toISOString() : null, scheduleRendu };
}
const SANS_DESCENTE = { formule_prevue: null, formule_prevue_le: null, formule_prevue_canal: null };

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Admin client — SERVICE_ROLE_KEY bypasse le RLS sur toutes les tables
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Accusé de réception de résiliation (7 septembre 2026) ───────────────────
// Exigé par l'article L215-1-1 du Code de la consommation (résiliation en
// trois clics, décret 2023-417) : la confirmation doit arriver sur un
// « support durable ». Un e-mail en est un ; l'écran, non.
//
// RÈGLES, dans l'ordre où elles comptent :
//  · l'e-mail ne part QU'APRÈS une annulation Stripe réussie. Un accusé envoyé
//    sur un échec serait pire que pas d'accusé du tout ;
//  · il ne bloque JAMAIS la résiliation : l'annulation est déjà faite chez
//    Stripe quand on l'envoie, une panne d'e-mail ne doit pas la faire
//    échouer ni la faire rejouer ;
//  · il n'existe QUE pour les résiliations web. Un abonnement souscrit dans
//    l'App Store ou Google Play ne passe pas par ici : c'est la boutique qui
//    accuse réception, et les CGV le disent.
// ⛔ TYPE RÉCURRENT : un même compte peut résilier plusieurs fois dans sa vie.
// 'resiliation_ar' ne doit donc JAMAIS entrer dans l'index partiel
// email_logs_one_shot_unique — sinon la deuxième résiliation d'un même
// utilisateur échouerait en 23505 et l'accusé ne partirait pas.
const TYPE_AR = "resiliation_ar";

function nomFormule(p: { is_business?: boolean; is_pro?: boolean; formule?: string | null }): string {
  // (11/11) Une formule avec Cloud se nomme (« Pro + Cloud ») dans l'accusé de réception.
  if (p?.formule) return nomDeFormule(p.formule) ?? "Premium";
  if (p?.is_business) return "Business";
  if (p?.is_pro) return "Pro";
  return "Premium";
}

/**
 * L'accusé part par la PORTE UNIQUE, dans le gabarit de marque.
 *
 * Ce qui a changé le 19/09/2026 :
 *  · il avait AUCUN habillage — un <div> nu, sans logo, sans en-tête, sans
 *    pied, sans mentions légales. Pour un document qui sert de preuve de
 *    résiliation, ça ressemblait à un mail cassé ;
 *  · il signait « L'équipe FillSell » quand tout le reste du parc signe
 *    « Nico » ;
 *  · il n'existait qu'en français, alors que profiles.lang est lu partout
 *    ailleurs ;
 *  · ⚠️ la date de FIN d'accès était formatée en UTC (getUTCDate/Month/Year,
 *    plus bas dans le fichier) alors que la date de DEMANDE annonçait « heure
 *    de Paris » : un jour d'écart possible en fin de mois. Les deux passent
 *    par dateParis/dateSeuleParis.
 *
 * Toujours non bloquant : l'annulation est déjà actée chez Stripe quand on
 * arrive ici, une panne de mail ne doit ni la faire échouer ni la rejouer.
 */
async function envoyerAccuseResiliation(
  email: string,
  userId: string,
  formule: string,
  finAcces: Date | null,
  lang: string | null | undefined,
): Promise<void> {
  try {
    const { sujet, html } = mailResiliation(
      { formule, demandeLe: new Date(), finAcces },
      langue(lang),
    );
    const r = await envoyerEmail({
      to: email,
      subject: sujet,
      html,
      // ⛔ TYPE RÉCURRENT : un même compte peut résilier plusieurs fois dans
      // sa vie. 'resiliation_ar' ne doit JAMAIS entrer dans l'index partiel
      // email_logs_one_shot_unique — sinon la deuxième résiliation échouerait
      // en 23505 et l'accusé, exigé par l'article L215-1-1, ne partirait pas.
      type: TYPE_AR,
      userId,
      categorie: "support",
      dedup: "journal",
    });
    if (r.envoye) {
      console.log(`[cancel-subscription] accusé de réception envoyé à l'utilisateur ${userId}`);
    } else {
      console.error("[cancel-subscription] accusé NON envoyé :", r.motif ?? "inconnu", r.status ?? "");
    }
  } catch (e) {
    console.error("[cancel-subscription] envoi de l'accusé impossible :", (e as Error)?.message ?? e);
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);

    console.log("[cancel-subscription] User OK:", user.id);
    let option: string | null = null;
    // (05/10) { option: "cloud", reprendre: true } : « Garder l'option » — un
    // arrêt prévu en fin de période (Stripe) est levé. Rien d'autre ne change.
    let reprendre = false;
    try {
      const corps = await req.json();
      option = typeof corps?.option === "string" ? corps.option : null;
      reprendre = corps?.reprendre === true;
    } catch { /* appel historique sans corps */ }

    // Récupère stripe_customer_id depuis profiles (admin = bypass RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium, is_pro, is_business, cloud_canal, google_purchase_token, apple_original_transaction_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[cancel-subscription] Profile introuvable:", profileError?.message);
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // (13/11/2026, audit des paiements de Nico) Rien à résilier chez Stripe : aucune écriture, la phrase vraie (où ça
    // s'arrête). Jamais « Abonnement annulé » pour un abonnement que FillSell n'a pas annulé.
    const rienAResilier = () => {
      const boutique = profile.google_purchase_token ? "google" : profile.apple_original_transaction_id ? "apple" : null;
      const corps = boutique === "apple"
        ? { message_fr: "Ton abonnement est géré par l'App Store : arrête-le dans tes abonnements Apple (sur l'iPhone : Réglages › ton nom › Abonnements). Rien n'a changé ici.",
          message_en: "Your subscription is managed by the App Store: stop it in your Apple subscriptions (on iPhone: Settings › your name › Subscriptions). Nothing changed here." }
        : boutique === "google"
          ? { message_fr: "Ton abonnement est géré par Google Play : arrête-le dans tes abonnements Google Play (Play Store › Paiements et abonnements). Rien n'a changé ici.",
            message_en: "Your subscription is managed by Google Play: stop it in your Google Play subscriptions (Play Store › Payments & subscriptions). Nothing changed here." }
          : { message_fr: "Aucun abonnement payé par carte à résilier sur ce compte. Rien n'a changé. Une question ? Écris-nous depuis Réglages › Aide.",
            message_en: "There is no card-paid subscription to cancel on this account. Nothing changed. A question? Write to us from Settings › Help." };
      return new Response(JSON.stringify({ success: false, error: "rien_a_resilier", canal: boutique, ...corps }), {
        status: 409, headers: { ...CORS, "Content-Type": "application/json" },
      });
    };

    // (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) La réponse d'un essai coupé : l'app dit « Ton essai
    // Cloud continue jusqu'au {date}. Rien ne sera prélevé. » ; period_end sert les apps d'avant (« continue jusqu'au … »).
    const reponseEssaiSansSuite = (finIso: string | null, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
      success: true, essai_sans_suite: true, aucun_prelevement: true, fin_essai: finIso,
      period_end: finIso ? dateSeuleParis(new Date(finIso)) : null, ...extra,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

    console.log("[cancel-subscription] Profile:", {
      stripe_customer_id: profile.stripe_customer_id,
      is_premium: profile.is_premium,
    });

    // Cas : pas de customer Stripe — force is_premium=false immédiatement
    if (option === "cloud" && (profile.cloud_canal === "apple" || profile.cloud_canal === "google")) {
      return new Response(JSON.stringify({ success: false, error: "resilier_dans_la_boutique", canal: profile.cloud_canal }), {
        status: 409, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    if (option === "cloud" && !profile.stripe_customer_id) {
      return new Response(JSON.stringify({ success: true, option: "cloud", deja: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    // (13/11/2026, audit des paiements de Nico) Sans client Stripe, il n'y a RIEN à résilier ici. Avant : is_premium passait à
    // false tout de suite et l'app disait « Abonnement annulé. Tu gardes l'accès jusqu'à la fin de la période » — faux deux
    // fois pour un abonné App Store / Google Play (rien annulé chez la boutique, accès coupé net) ou un compte offert.
    // Désormais : aucune écriture, 409 et la phrase vraie (où ça s'arrête).
    if (!profile.stripe_customer_id) {
      console.log("[cancel-subscription] aucun client Stripe — rien à résilier ici (aucune écriture)");
      return rienAResilier();
    }

    // Récupère les abonnements actifs Stripe
    // (04/10) Abonnements vivants (essai compris), séparés : paliers / Cloud.
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      limit: 10,
    });
    const vivants = subscriptions.data.filter((x: Stripe.Subscription) =>
      x.status === "active" || x.status === "trialing" || x.status === "past_due");
    const cloudVivant = vivants.find((x: Stripe.Subscription) => estAbonnementCloud(x, prixConnus())) ?? null;
    const paliersVivants = vivants.filter((x: Stripe.Subscription) => !estAbonnementCloud(x, prixConnus()));
    console.log("[cancel-subscription] Abonnements vivants: paliers", paliersVivants.length, "Cloud", cloudVivant ? 1 : 0);

    // (11/11) Le Cloud d'une FORMULE (ou l'essai du Cloud d'un abonné) — jamais quand un Cloud seul est vivant à côté.
    if (option === "cloud" && !cloudVivant && !reprendre) {
      const essaiAbonneSub = paliersVivants.find((x: Stripe.Subscription) => essaiCloudAbonneStripe(x)) ?? null;
      const formuleSub = paliersVivants.find((x: Stripe.Subscription) => formuleDAbonnementStripe(x, prixConnus())) ?? null;
      if (essaiAbonneSub) {
        // L'essai du Cloud d'un abonné. (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) Le schedule est
        // rendu — la phase « formule avec Cloud » ne viendra jamais : le Cloud n'est jamais facturé, la formule payée
        // continue telle quelle — et la marque essai_cloud_sans_suite est posée (les métadonnées de l'essai restent) : le
        // Cloud reste actif jusqu'à la fin de son essai, puis s'arrête seul. Avant : Cloud arrêté tout de suite.
        const ea = essaiCloudAbonneStripe(essaiAbonneSub)!;
        const idSched = typeof essaiAbonneSub.schedule === "string" ? essaiAbonneSub.schedule : (essaiAbonneSub.schedule as { id?: string } | null)?.id ?? null;
        if (!ea.sansSuite) {
          if (idSched) await stripe.subscriptionSchedules.release(idSched);
          await stripe.subscriptions.update(essaiAbonneSub.id, { metadata: { essai_cloud_sans_suite: "1" } });
        }
        // cloud_formule remis à NULL : la formule ne deviendra jamais la formule avec Cloud (drapeauxDepuisStripe : un essai
        // d'abonné « sans suite » ne porte plus de formule) ; le bloc du Cloud dit l'essai qui continue.
        await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: true, cloud_formule: null, ...SANS_DESCENTE }).eq("id", user.id);
        console.log(`[cancel-subscription] essai ${ea.formule} de l'abonné ${user.id} : renouvellement coupé, le Cloud continue jusqu'au ${ea.fin} (schedule ${idSched ?? "?"} rendu, ${essaiAbonneSub.id} continue)`);
        // Aucun mail au client (l'app le dit) ; l'alerte interne seule.
        await mailsCloud(supabaseAdmin, { userId: user.id, email: user.email ?? null, canal: "stripe", journal: "[cancel-subscription]",
          evenements: [{ evenement: "essai_renouvellement_coupe", cle: `${essaiAbonneSub.id}:renouvellement_coupe:${ea.fin}`, canal: "stripe", faits: { finIso: ea.fin, aucunPrelevement: true, formule: ea.formule, abonne: true } }] });
        return reponseEssaiSansSuite(ea.fin, { option: "cloud", formule_continue: true });
      }
      if (formuleSub && formuleSub.status === "trialing") {
        // L'essai d'une formule avec Cloud. (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) La résiliation
        // est programmée à la fin de l'essai : la formule et le Cloud continuent jusque-là, puis Stripe termine l'abonnement,
        // aucune facture. Avant : subscriptions.cancel, tout coupé sur-le-champ.
        const { coupe, finIso, scheduleRendu } = await couperEssaiStripe(formuleSub);
        await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: true, subscription_cancel_at_period_end: true,
          ...(finIso ? { cloud_periode_fin: finIso } : {}), ...(scheduleRendu ? SANS_DESCENTE : {}) }).eq("id", user.id);
        console.log(`[cancel-subscription] essai ${formuleDAbonnementStripe(formuleSub, prixConnus())} ${formuleSub.id} : renouvellement coupé, continue jusqu'au ${finIso ?? "?"}`);
        await mailsCloud(supabaseAdmin, { userId: user.id, email: user.email ?? null, canal: "stripe", evenements: evenementArretStripe(coupe), journal: "[cancel-subscription]" });
        return reponseEssaiSansSuite(finIso, { option: "cloud", formule_continue: false });
      }
      if (formuleSub) {
        // Une formule PAYÉE : retirer le Cloud = changer-formule, à la fin de la période (jamais un second abonnement).
        return new Response(JSON.stringify({ success: false, error: "retirer_par_changer_formule", action: "retirer_cloud" }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }
    if (option === "cloud") {
      if (!cloudVivant) {
        return new Response(JSON.stringify({ success: true, option: "cloud", deja: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      if (reprendre) {
        if (cloudVivant.cancel_at_period_end) {
          await stripe.subscriptions.update(cloudVivant.id, { cancel_at_period_end: false });
          await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: false }).eq("id", user.id);
          console.log(`[cancel-subscription] Cloud ${cloudVivant.id} : arrêt prévu levé (l'option continue)`);
        }
        return new Response(JSON.stringify({ success: true, option: "cloud", reprise: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      // Arrêtée une fois PAYÉE → tourne jusqu'à la fin de la période. (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai)
      // PENDANT l'essai, même règle : la résiliation est programmée à la fin de l'essai, le Cloud reste actif jusque-là,
      // rien n'est facturé (avant : effet IMMÉDIAT, subscriptions.cancel).
      // (08/11, ordre de Nico) La FORMULE n'est jamais touchée ici : seul l'abonnement Cloud (cloudVivant) est programmé ;
      // is_premium / is_pro / is_business ne sont ni lus pour décider ni écrits.
      if (cloudVivant.status === "trialing") {
        const { coupe, finIso } = await couperEssaiStripe(cloudVivant);
        await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: true, ...(finIso ? { cloud_periode_fin: finIso } : {}) }).eq("id", user.id);
        console.log(`[cancel-subscription] essai Cloud ${cloudVivant.id} : renouvellement coupé, le Cloud continue jusqu'au ${finIso ?? "?"}`);
        // Aucun mail au client (l'app le dit) ; l'alerte interne seule (evenementArretStripe → essai_renouvellement_coupe).
        await mailsCloud(supabaseAdmin, { userId: user.id, email: user.email ?? null, canal: "stripe", evenements: evenementArretStripe(coupe), journal: "[cancel-subscription]" });
        return reponseEssaiSansSuite(finIso, { option: "cloud" });
      }
      const fini = await stripe.subscriptions.update(cloudVivant.id, { cancel_at_period_end: true });
      const finCloud = fini.current_period_end;
      await supabaseAdmin.from("profiles").update({
        cloud_arret_fin_periode: true,
        cloud_periode_fin: finCloud ? new Date(finCloud * 1000).toISOString() : null,
      }).eq("id", user.id);
      console.log(`[cancel-subscription] Cloud ${cloudVivant.id} arrêté à la fin de la période payée`);
      // Le mail d'arrêt programmé (accusé de réception, L215-1-1) : même clé que le webhook (un seul mail).
      await mailsCloud(supabaseAdmin, { userId: user.id, email: user.email ?? null, canal: "stripe", evenements: evenementArretStripe(fini), journal: "[cancel-subscription]" });
      return new Response(JSON.stringify({ success: true, option: "cloud", period_end: finCloud ? dateSeuleParis(new Date(finCloud * 1000)) : null }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let periodEnd: string | null = null;

    // (13/11/2026, audit des paiements de Nico) Rien de vivant chez Stripe : la phrase vraie, aucune écriture.
    if (paliersVivants.length === 0) {
      console.log("[cancel-subscription] aucun palier vivant chez Stripe — rien à résilier (aucune écriture)");
      return rienAResilier();
    }
    // (13/11/2026) Une formule EN ESSAI résiliée. (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) Plus
    // jamais arrêtée tout de suite : la résiliation est programmée à la fin de l'essai (formule et Cloud continuent jusque-là,
    // aucune facture), l'app dit « Ton essai Cloud continue jusqu'au … Rien ne sera prélevé. » ; aucun mail au client, l'alerte
    // interne seule. Avant : subscriptions.cancel.
    if (paliersVivants[0].status === "trialing" && formuleDAbonnementStripe(paliersVivants[0], prixConnus())) {
      const { coupe, finIso, scheduleRendu } = await couperEssaiStripe(paliersVivants[0]);
      await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: true, subscription_cancel_at_period_end: true,
        ...(finIso ? { cloud_periode_fin: finIso } : {}), ...(scheduleRendu ? SANS_DESCENTE : {}) }).eq("id", user.id);
      console.log(`[cancel-subscription] palier en essai ${coupe.id} : renouvellement coupé, continue jusqu'au ${finIso ?? "?"}`);
      await mailsCloud(supabaseAdmin, { userId: user.id, email: user.email ?? null, canal: "stripe", evenements: evenementArretStripe(coupe), journal: "[cancel-subscription]" });
      return reponseEssaiSansSuite(finIso);
    }

    {
      // (09/11, C4) Une descente de formule programmée (subscription schedule) : Stripe REFUSE alors toute résiliation
      // directe (« managed by the subscription schedule », banc descente-formule E). La résiliation prime : l'abonnement
      // est rendu à lui-même d'abord (la descente disparaît), puis résilié. Sans schedule : rien ne change.
      const sched = paliersVivants[0].schedule;
      const idSched = typeof sched === "string" ? sched : (sched as { id?: string } | null)?.id ?? null;
      if (idSched) {
        await stripe.subscriptionSchedules.release(idSched);
        console.log(`[cancel-subscription] descente prévue retirée (schedule ${idSched} rendu) avant la résiliation`);
        const { error: colErr } = await supabaseAdmin.from("profiles")
          .update({ formule_prevue: null, formule_prevue_le: null, formule_prevue_canal: null }).eq("id", user.id);
        if (colErr) console.error(`[cancel-subscription] colonnes formule_prevue non effacées : ${colErr.message}`);
      }
      // (13/11/2026, décision de Nico — plus aucun arrêt immédiat d'un essai) Le palier porte l'essai du Cloud d'un abonné
      // (schedule rendu ci-dessus : la formule avec Cloud ne viendra pas) : l'essai court jusqu'à sa fin, sans suite.
      const eaPalier = essaiCloudAbonneStripe(paliersVivants[0]);
      const canceled = await stripe.subscriptions.update(paliersVivants[0].id, {
        cancel_at_period_end: true,
        ...(eaPalier && !eaPalier.sansSuite ? { metadata: { essai_cloud_sans_suite: "1" } } : {}),
      });
      if (eaPalier) await supabaseAdmin.from("profiles").update({ cloud_arret_fin_periode: true }).eq("id", user.id);
      // current_period_end = date réelle de fin de période payée.
      // ⚠️ HEURE DE PARIS, pas UTC : jusqu'au 19/09 cette ligne formatait en
      // UTC (getUTCDate/getUTCMonth/getUTCFullYear) pendant que l'accusé
      // annonçait « heure de Paris » juste au-dessus. Une période finissant le
      // 30 à 23 h 30 UTC s'affichait « 30/09 » ici et « 01/10 » à Paris : un
      // jour d'écart sur le document qui sert de preuve de résiliation.
      const fin = new Date(canceled.current_period_end * 1000);
      periodEnd = dateSeuleParis(fin);
      console.log("[cancel-subscription] cancel_at_period_end=true, fin le:", periodEnd);
      await supabaseAdmin.from("profiles").update({ subscription_period_end: periodEnd }).eq("id", user.id);
      // L'accusé ne part QUE d'ici : Stripe a accepté l'annulation, la date de
      // fin est connue. Non bloquant — la résiliation est déjà actée.
      const destinataire = user?.email ?? null;
      const idUtilisateur = user?.id ?? null;
      if (destinataire && idUtilisateur) {
        const { data: profilLangue } = await supabaseAdmin
          .from("profiles").select("lang").eq("id", idUtilisateur).maybeSingle();
        await envoyerAccuseResiliation(
          destinataire, idUtilisateur, nomFormule({ ...profile, formule: formuleDAbonnementStripe(paliersVivants[0], prixConnus()) }), fin, profilLangue?.lang,
        );
      } else {
        console.error("[cancel-subscription] utilisateur sans e-mail — accusé de réception impossible");
      }
    }

    // is_premium reste true — sera mis à false par le webhook customer.subscription.deleted

    return new Response(
      JSON.stringify({ success: true, period_end: periodEnd }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[cancel-subscription] Erreur inattendue:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
