// ═══════════════════════════════════════════════════════════════════════════
// changer-formule — C4 (09/11/2026 nuit, point C4 de Nico) : « voir les autres formules » et DESCENDRE à la fin de la
// période. Ouverte le 09/11 (décision de Nico) pour les abonnés STRIPE seulement ; l'écran ne l'appelle que si
// coin_config.descente_formule_ouverte = 1 (config/interrupteurs.js). Une formule tenue par une boutique vivante : rien.
//
// Appelant : l'app, avec la session de l'utilisateur (verify_jwt true ; jamais --no-verify-jwt).
// POST { action: "lire" }                         → { canal, actuelle, fin_periode, prevue, possibles }
// POST { action: "programmer", vers: "premium" | "pro" } → la descente posée (Stripe : subscription schedule) ;
// POST { action: "annuler" }                      → la descente retirée (l'abonnement rendu à lui-même).
// STRIPE SEULEMENT. Une formule prise dans l'App Store ou Google Play : { canal, disponible: false } — la descente s'y
// fait dans la boutique, et nos fonctions de paiement mobiles ne savent pas encore faire tomber un palier (RAPPORT).
// Règles (pures, testées) : _shared/descente-formule.js ; parcours prouvé en mode test Stripe :
// scripts/stripe-test/descente-formule-test.mjs. Les DROITS ne bougent jamais ici : ils suivent ce que Stripe facture
// (stripe-webhook). Le Cloud (abonnement à part) n'est jamais touché.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { estAbonnementCloud } from "../_shared/cloud-option.js";
import {
  abonnementDeFormule, boutiqueVivante, colonnesDescente, descentePrevue, formuleDuPrix, formuleStripe, parametresDescente, peutDescendre,
} from "../_shared/descente-formule.js";
// (11/11/2026, offres Cloud) Les formules avec Cloud : descendre (Pro + Cloud → Premium + Cloud), RETIRER le Cloud à la fin
// de la période (action « retirer_cloud » : Pro + Cloud → Pro), et changer de formule PENDANT l'essai (sans prorata :
// l'essai continue, le premier débit se fait au prix choisi). Prix lus à un seul endroit (_shared/prix-stripe.ts).
import { prixStripe } from "../_shared/prix-stripe.ts";
import { estFormuleCloud, essaiCloudAbonneStripe, metadonneesFormule, planTypeDeFormule } from "../_shared/formules-serveur.js";
import { PALIER_DE_FORMULE } from "../_shared/formules-cloud.js";

function prixConnus() {
  return prixStripe();
}
const CANDIDATES = ["standard", "pro", "premium_cloud", "pro_cloud"];
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const nomApp = (f: string | null) => (f === "standard" ? "premium" : f);
const idSchedule = (s: Stripe.Subscription) => (typeof s.schedule === "string" ? s.schedule : (s.schedule as { id?: string } | null)?.id ?? null);

// Les colonnes de la migration 20261109020000 : écriture À PART des droits, jamais bloquante (journalisée).
// deno-lint-ignore no-explicit-any
async function ecrireColonnes(userId: string, prevue: any) {
  const { error } = await supabaseAdmin.from("profiles").update(colonnesDescente(prevue)).eq("id", userId);
  if (error) console.error(`[changer-formule] colonnes formule_prevue non écrites pour ${userId} : ${error.message}`);
}

async function lireStripe(customerId: string) {
  const prix = prixConnus();
  const { data: subs } = await stripe.subscriptions.list({ customer: customerId, limit: 20 });
  const cible = abonnementDeFormule(subs ?? [], prix, (s: Stripe.Subscription) => estAbonnementCloud(s, prix));
  const schedules: Record<string, unknown> = {};
  if (cible) {
    const id = idSchedule(cible);
    if (id) schedules[id] = await stripe.subscriptionSchedules.retrieve(id);
  }
  const prevue = cible ? descentePrevue([cible], schedules, prix) : null;
  const actuelle = cible
    ? ((cible.items?.data ?? []).map((it: Stripe.SubscriptionItem) => formuleDuPrix(it.price?.id ?? null, prix)).find(Boolean) ?? formuleStripe(cible.metadata?.plan_type))
    : null;
  return { prix, cible, schedules, prevue, actuelle };
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
    if (!user) return repondre({ error: "non_connecte" }, 401);
    let action = "lire";
    let vers: string | null = null;
    try {
      const corps = await req.json();
      if (typeof corps?.action === "string") action = corps.action;
      if (typeof corps?.vers === "string") vers = corps.vers;
    } catch { /* lire */ }

    const { data: profil } = await supabaseAdmin.from("profiles")
      .select("stripe_customer_id, apple_original_transaction_id, google_purchase_token, google_product_id, subscription_period_end, is_premium, is_pro, is_business")
      .eq("id", user.id).maybeSingle();
    if (!profil) return repondre({ error: "profil_introuvable" }, 404);

    // (09/11 matin, décision de Nico : C4 pour les abonnés Stripe SEULEMENT) Une boutique tient une formule vivante :
    // aucun parcours C4, même avec un abonnement Stripe à côté (la descente n'y changerait rien) — et aucun geste accepté.
    const boutique = boutiqueVivante(profil);
    if (boutique) return repondre({ canal: boutique, disponible: false, actuelle: null, prevue: null, possibles: [] });

    if (!profil.stripe_customer_id) {
      // Pas de formule Stripe : la formule (s'il y en a une) vient d'une boutique — la descente s'y fait, pas ici.
      const canal = profil.apple_original_transaction_id ? "apple" : profil.google_purchase_token ? "google" : null;
      return repondre({ canal, disponible: false, actuelle: null, prevue: null, possibles: [] });
    }
    const { prix, cible, prevue, actuelle } = await lireStripe(profil.stripe_customer_id);
    const fin = cible?.current_period_end ? new Date(cible.current_period_end * 1000).toISOString() : null;
    // (11/11) Les formules plus basses, et (formule avec Cloud) la même sans le Cloud — peutDescendre, une règle pour tout.
    const possibles = actuelle ? CANDIDATES.filter((f) => peutDescendre(actuelle, f)).map(nomApp) : [];
    const etat = () => ({ canal: "stripe", disponible: Boolean(cible), actuelle: nomApp(actuelle), fin_periode: fin, possibles,
      prevue: prevue ? { formule: nomApp(prevue.formule), le: prevue.le } : null, arret_prevu: Boolean(cible?.cancel_at_period_end) });

    if (action === "lire") return repondre(etat());

    if (!cible || !actuelle) return repondre({ ...etat(), error: "aucune_formule" }, 409);

    // (11/11, décision 6) L'essai du Cloud d'un abonné tient un schedule à lui : il s'arrête par cancel-subscription
    // ({ option: "cloud" }), jamais en rendant le schedule ici (le Cloud resterait affiché en essai).
    const essaiAbonne = essaiCloudAbonneStripe(cible);
    if (essaiAbonne && (action === "annuler" || action === "programmer" || action === "retirer_cloud")) {
      return repondre({ ...etat(), error: "essai_cloud_en_cours", essai_fin: essaiAbonne.fin }, 409);
    }
    // (11/11) « Retirer le Cloud » = descendre vers la même formule SANS le Cloud, à la fin de la période payée.
    if (action === "retirer_cloud") {
      if (!estFormuleCloud(actuelle)) return repondre({ ...etat(), error: "pas_de_cloud" }, 409);
      action = "programmer";
      vers = PALIER_DE_FORMULE[actuelle as "premium_cloud" | "pro_cloud" | "business_cloud"];
    }
    if (action === "annuler") {
      const id = idSchedule(cible);
      if (id) {
        await stripe.subscriptionSchedules.release(id);
        console.log(`[changer-formule] ${user.id} : descente annulée (schedule ${id} rendu), ${cible.id} reste ${actuelle}`);
      }
      await ecrireColonnes(user.id, null);
      return repondre({ ...etat(), prevue: null, annulee: Boolean(id) });
    }

    if (action !== "programmer") return repondre({ error: "action_inconnue" }, 400);
    if (!peutDescendre(actuelle, vers)) return repondre({ ...etat(), error: "descente_impossible" }, 409);
    // Une résiliation déjà programmée prime : la reprendre d'abord (jamais deux changements contradictoires).
    if (cible.cancel_at_period_end) return repondre({ ...etat(), error: "arret_deja_prevu" }, 409);
    // (11/11) PENDANT L'ESSAI d'une formule avec Cloud : le changement est immédiat, sans prorata — l'essai continue et le
    // premier débit se fait au prix choisi (Pro + Cloud → Premium + Cloud). Jamais vers une formule sans essai ici.
    if (cible.status === "trialing" && estFormuleCloud(actuelle) && estFormuleCloud(formuleStripe(vers))) {
      const versF = formuleStripe(vers) as string;
      const prixVers = (prix as Record<string, string>)[versF];
      if (!prixVers) return repondre({ ...etat(), error: "stripe_refus" }, 502);
      try {
        await stripe.subscriptions.update(cible.id, { items: [{ id: cible.items.data[0].id, price: prixVers }], proration_behavior: "none",
          metadata: { ...(cible.metadata ?? {}), ...metadonneesFormule({ formule: versF, essai: true, userId: user.id }), plan_type: planTypeDeFormule(versF) ?? "" } });
      } catch (e) {
        console.error(`[changer-formule] ${user.id} : ${actuelle} → ${versF} pendant l'essai refusé par Stripe : ${(e as Error)?.message ?? e}`);
        return repondre({ ...etat(), error: "stripe_refus" }, 502);
      }
      console.log(`[changer-formule] ${user.id} : ${actuelle} → ${versF} pendant l'essai (sans prorata, ${cible.id})`);
      return repondre({ ...etat(), actuelle: nomApp(versF), prevue: null, change_pendant_essai: true });
    }
    if (cible.status !== "active") return repondre({ ...etat(), error: "abonnement_pas_actif" }, 409);
    if (cible.pending_update) return repondre({ ...etat(), error: "montee_en_attente" }, 409);

    // Le schedule : celui qui existe déjà (changer de cible), sinon créé depuis l'abonnement tel qu'il est.
    const existant = idSchedule(cible);
    const sched = existant ? await stripe.subscriptionSchedules.retrieve(existant) : await stripe.subscriptionSchedules.create({ from_subscription: cible.id });
    let pose;
    try {
      pose = await stripe.subscriptionSchedules.update(sched.id, parametresDescente({ abonnement: cible, schedule: sched, vers, prix }));
    } catch (e) {
      // Jamais un schedule à moitié posé : celui qu'on vient de créer est rendu (l'abonnement continue comme avant).
      if (!existant) {
        try { await stripe.subscriptionSchedules.release(sched.id); } catch { /* journalisé ci-dessous */ }
      }
      console.error(`[changer-formule] ${user.id} : descente vers ${vers} refusée par Stripe : ${(e as Error)?.message ?? e}`);
      return repondre({ ...etat(), error: "stripe_refus" }, 502);
    }
    const nouvelle = descentePrevue([{ ...cible, schedule: pose.id }], { [pose.id]: pose }, prix);
    await ecrireColonnes(user.id, nouvelle);
    console.log(`[changer-formule] ${user.id} : ${actuelle} → ${nouvelle?.formule} le ${nouvelle?.le} (schedule ${pose.id}, abonnement ${cible.id})`);
    return repondre({ ...etat(), prevue: nouvelle ? { formule: nomApp(nouvelle.formule), le: nouvelle.le } : null });
  } catch (err) {
    console.error("[changer-formule] erreur :", (err as Error)?.message ?? err);
    return repondre({ error: "erreur" }, 500);
  }
});
