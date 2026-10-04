import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { envoyerEmail } from "../_shared/desinscription.ts";
import { dateSeuleParis, langue, mailResiliation } from "../_shared/emails-fillsell.ts";
import { itemCloud } from "../_shared/cloud-option.js";

// (04/10) L'option Cloud est un second article de l'abonnement du palier : la
// retirer SEULE (`{ option: "cloud" }`) supprime cet article tout de suite,
// avec un avoir au prorata sur la prochaine facture ; résilier le palier
// (appel sans option, comme avant) emporte l'option avec lui. Un Cloud pris
// dans l'App Store ou Google Play ne se résilie pas d'ici : la boutique.
function prixConnus() {
  return {
    standard: Deno.env.get("STRIPE_PRICE_STANDARD") ?? "",
    pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
    business: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? "",
    cloud: Deno.env.get("STRIPE_PRICE_CLOUD") ?? "",
  };
}

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

function nomFormule(p: { is_business?: boolean; is_pro?: boolean }): string {
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
    // (04/10) Sans corps : résiliation du palier, comme toujours. `{ option: "cloud" }` : l'option seule.
    let option: string | null = null;
    try {
      const corps = await req.json();
      option = typeof corps?.option === "string" ? corps.option : null;
    } catch { /* appel historique sans corps */ }

    // Récupère stripe_customer_id depuis profiles (admin = bypass RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium, is_pro, is_business, cloud_canal")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[cancel-subscription] Profile introuvable:", profileError?.message);
      return new Response(JSON.stringify({ error: "Profil introuvable" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[cancel-subscription] Profile:", {
      stripe_customer_id: profile.stripe_customer_id,
      is_premium: profile.is_premium,
    });

    // Cas : pas de customer Stripe — force is_premium=false immédiatement
    if (!profile.stripe_customer_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", user.id);
      console.log("[cancel-subscription] No Stripe customer — is_premium=false");
      return new Response(
        JSON.stringify({ success: true, period_end: null }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Récupère les abonnements vivants Stripe. (04/10) « trialing » compris :
    // l'essai « palier + Cloud » doit pouvoir être résilié avant son 3e jour
    // (sinon le débit part), et past_due comme partout ailleurs.
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      limit: 10,
    });
    const vivants = subscriptions.data.filter((s) =>
      s.status === "active" || s.status === "trialing" || s.status === "past_due");

    console.log("[cancel-subscription] Abonnements vivants:", vivants.length);

    // ── L'OPTION CLOUD SEULE (04/10) ─────────────────────────────────────────
    // L'article Cloud est retiré tout de suite, avec un avoir au prorata sur la
    // prochaine facture ; le palier continue. Un Cloud porté par l'App Store ou
    // Google Play se résilie dans la boutique, jamais d'ici.
    if (option === "cloud") {
      const prix = prixConnus();
      const porteur = vivants.find((s) => itemCloud(s, prix));
      if (!porteur) {
        if (profile.cloud_canal === "apple" || profile.cloud_canal === "google") {
          return new Response(JSON.stringify({ success: false, error: "resilier_dans_la_boutique", canal: profile.cloud_canal }), {
            status: 409, headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        console.log("[cancel-subscription] option Cloud : aucun article chez Stripe — rien à retirer");
        return new Response(JSON.stringify({ success: true, option: "cloud", deja: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const article = itemCloud(porteur, prix)!;
      await stripe.subscriptionItems.del(article.id, { proration_behavior: "create_prorations" });
      await supabaseAdmin.from("profiles")
        .update({ is_cloud: false, cloud_fin_periode: null, cloud_annule_fin_periode: false })
        .eq("id", user.id);
      console.log(`[cancel-subscription] option Cloud retirée de ${porteur.id} (article ${article.id}), avoir au prorata`);
      return new Response(JSON.stringify({ success: true, option: "cloud" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let periodEnd: string | null = null;

    if (vivants.length > 0) {
      const canceled = await stripe.subscriptions.update(vivants[0].id, {
        cancel_at_period_end: true,
      });
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
          destinataire, idUtilisateur, nomFormule(profile), fin, profilLangue?.lang,
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
