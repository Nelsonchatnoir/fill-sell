import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
const TYPE_AR = "resiliation_ar";

function nomFormule(p: { is_business?: boolean; is_pro?: boolean }): string {
  if (p?.is_business) return "Business";
  if (p?.is_pro) return "Pro";
  return "Premium";
}

async function envoyerAccuseResiliation(
  email: string,
  userId: string,
  formule: string,
  finAcces: string | null,
): Promise<void> {
  const cle = Deno.env.get("RESEND_API_KEY");
  if (!cle) {
    console.error("[cancel-subscription] RESEND_API_KEY absente — accusé de réception NON envoyé");
    return;
  }
  const demandeLe = new Date().toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const ligneFin = finAcces
    ? `Ton accès ${formule} reste actif jusqu'au <strong>${finAcces}</strong> inclus. Aucun nouveau prélèvement ne sera effectué après cette date.`
    : `Ton accès ${formule} prend fin à l'issue de la période déjà payée. Aucun nouveau prélèvement ne sera effectué.`;
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0F172A">
<p>Bonjour,</p>
<p>Nous confirmons la <strong>résiliation de ton abonnement FillSell</strong>.</p>
<ul>
<li>Demande reçue le <strong>${demandeLe}</strong> (heure de Paris)</li>
<li>Formule résiliée : <strong>${formule}</strong></li>
<li>${ligneFin}</li>
</ul>
<p>Ton compte, ton inventaire et ton historique de ventes <strong>restent accessibles</strong> : tu repasses simplement en formule gratuite. Rien n'est supprimé.</p>
<p>Si tu changes d'avis, tu peux te réabonner à tout moment depuis l'application.</p>
<p style="color:#64748B;font-size:13px">Cet e-mail est l'accusé de réception de ta demande de résiliation. Conserve-le.</p>
<p>— L'équipe FillSell</p>
</div>`;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: "Ta résiliation FillSell est bien enregistrée",
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[cancel-subscription] Resend a refusé l'accusé (HTTP ${res.status}) :`, await res.text());
      return;
    }
    console.log(`[cancel-subscription] accusé de réception envoyé à l'utilisateur ${userId}`);
  } catch (e) {
    console.error("[cancel-subscription] envoi de l'accusé impossible :", (e as Error)?.message ?? e);
    return;
  }
  // Trace : jamais bloquante, jamais muette. Une violation 23505 ici voudrait
  // dire que le type a été ajouté par erreur à l'index one-shot.
  const { error } = await supabaseAdmin.from("email_logs").insert({ user_id: userId, email_type: TYPE_AR });
  if (error) console.error("[cancel-subscription] email_logs (accusé) :", error.message);
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

    // Récupère stripe_customer_id depuis profiles (admin = bypass RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_premium, is_pro, is_business")
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

    // Récupère les abonnements actifs Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 5,
    });

    console.log("[cancel-subscription] Abonnements actifs:", subscriptions.data.length);

    let periodEnd: string | null = null;

    if (subscriptions.data.length > 0) {
      const canceled = await stripe.subscriptions.update(subscriptions.data[0].id, {
        cancel_at_period_end: true,
      });
      // current_period_end = date réelle de fin de période payée
      const d = new Date(canceled.current_period_end * 1000);
      periodEnd = `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
      console.log("[cancel-subscription] cancel_at_period_end=true, fin le:", periodEnd);
      await supabaseAdmin.from("profiles").update({ subscription_period_end: periodEnd }).eq("id", user.id);
      // L'accusé ne part QUE d'ici : Stripe a accepté l'annulation, la date de
      // fin est connue. Non bloquant — la résiliation est déjà actée.
      const destinataire = user?.email ?? null;
      const idUtilisateur = user?.id ?? null;
      if (destinataire && idUtilisateur) {
        await envoyerAccuseResiliation(destinataire, idUtilisateur, nomFormule(profile), periodEnd);
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
