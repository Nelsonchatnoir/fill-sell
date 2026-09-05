// ═══════════════════════════════════════════════════════════════════════════
// ebay-account — LOT 0 (état de connexion) + LOT 1 « dire ce qui manque »
// (05/09/2026). Ne publie RIEN.
//
// Appelée par l'app avec le JWT utilisateur (verify_jwt = TRUE). Renvoie une
// vue PUBLIQUE du compte eBay relié — jamais un jeton — et, sur demande, la
// checklist vendeur relevée par l'Account API.
//
// Actions (POST { action, … }) :
//   statut              état de connexion, sans appel eBay
//   checklist           relève l'état vendeur chez eBay (5 appels), le stocke
//                       dans ebay_accounts.seller_state (MESURE), le renvoie
//   choisir_politique   { type, id }  — mémorise une politique EXISTANTE
//   creer_politique     { type, options } — crée une politique chez eBay, sur
//                       action EXPLICITE de l'utilisateur (bouton « Créer »),
//                       puis la mémorise. JAMAIS appelée d'office.
//   activer_politiques  opt-in au programme SELLING_POLICY_MANAGEMENT, sur
//                       action explicite
//   deconnecter         supprime la ligne ebay_accounts
//
// CHECKLIST — ce qu'on affiche et ce qu'on N'AFFICHE PAS (garde-fou Nico :
// un état indéterminable ne s'affiche pas plutôt que de s'afficher au
// conditionnel) :
//   · inscription_vendeur  ← GET /sell/account/v1/privilege
//                            (sellerRegistrationCompleted) — déterminable ;
//   · politiques_activees  ← GET /program/get_opted_in_programs
//                            (SELLING_POLICY_MANAGEMENT) — déterminable ;
//   · politique_livraison / paiement / retours ← GET /{type}_policy
//                            ?marketplace_id=EBAY_FR — déterminables dès que
//                            le programme est actif ;
//   · « paiements gérés »  ← getPaymentsProgram / getPaymentsProgramOnboarding
//                            sont INERTES depuis que tous les vendeurs sont
//                            passés aux paiements eBay (doc : « no longer
//                            applicable ») → on ne l'affiche PAS ;
//   · « vérification KYC » ← getKYC rend 204 vide pour tout le monde depuis
//                            la fin de l'onboarding global → pas affiché.
//   Le plafond de vente (sellingLimit) est relevé et stocké, informatif.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  appelEbay,
  etatPublic,
  lireCompte,
  lireEnvEbay,
  messageErreurEbay,
  obtenirAccessToken,
  type EbayEnv,
} from "../_shared/ebay-oauth.ts";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];
const MARKETPLACE = "EBAY_FR";

type TypePolitique = "fulfillment" | "payment" | "return";
const TYPES: Record<TypePolitique, { chemin: string; liste: string; id: string; colonne: string }> = {
  fulfillment: { chemin: "/sell/account/v1/fulfillment_policy", liste: "fulfillmentPolicies", id: "fulfillmentPolicyId", colonne: "fulfillment_policy_id" },
  payment: { chemin: "/sell/account/v1/payment_policy", liste: "paymentPolicies", id: "paymentPolicyId", colonne: "payment_policy_id" },
  return: { chemin: "/sell/account/v1/return_policy", liste: "returnPolicies", id: "returnPolicyId", colonne: "return_policy_id" },
};

interface PolitiqueResume { id: string; name: string; }
type Etat = "ok" | "manque" | "inconnu";

async function listerPolitiques(env: EbayEnv, token: string, type: TypePolitique): Promise<{ etat: Etat; liste: PolitiqueResume[]; http: number; detail?: string }> {
  const t = TYPES[type];
  const r = await appelEbay(env, token, `${t.chemin}?marketplace_id=${MARKETPLACE}`);
  if (r.http === 200 && r.json && typeof r.json === "object") {
    const brut = (r.json as Record<string, unknown>)[t.liste];
    const liste = Array.isArray(brut)
      ? brut.map((p) => ({ id: String((p as Record<string, unknown>)[t.id] ?? ""), name: String((p as Record<string, unknown>).name ?? "") })).filter((p) => p.id)
      : [];
    return { etat: liste.length ? "ok" : "manque", liste, http: r.http };
  }
  // Programme non activé : eBay refuse la liste (4xx) — l'état des politiques
  // est alors porté par la ligne « politiques_activees », pas par celle-ci.
  return { etat: "inconnu", liste: [], http: r.http, detail: messageErreurEbay(r.json, r.texte) };
}

async function releverChecklist(admin: SupabaseClient, env: EbayEnv, token: string, userId: string) {
  const [priv, prog, liv, pai, ret] = await Promise.all([
    appelEbay(env, token, "/sell/account/v1/privilege"),
    appelEbay(env, token, "/sell/account/v1/program/get_opted_in_programs"),
    listerPolitiques(env, token, "fulfillment"),
    listerPolitiques(env, token, "payment"),
    listerPolitiques(env, token, "return"),
  ]);

  // Inscription vendeur
  let inscription: Etat = "inconnu";
  let sellingLimit: unknown = null;
  if (priv.http === 200 && priv.json && typeof priv.json === "object") {
    const p = priv.json as { sellerRegistrationCompleted?: boolean; sellingLimit?: unknown };
    if (typeof p.sellerRegistrationCompleted === "boolean") inscription = p.sellerRegistrationCompleted ? "ok" : "manque";
    sellingLimit = p.sellingLimit ?? null;
  }

  // Programme « politiques de vente »
  let programme: Etat = "inconnu";
  if (prog.http === 200 && prog.json && typeof prog.json === "object") {
    const programs = (prog.json as { programs?: Array<{ programType?: string }> }).programs;
    if (Array.isArray(programs)) programme = programs.some((x) => x.programType === "SELLING_POLICY_MANAGEMENT") ? "ok" : "manque";
  }
  // Programme inactif ET listes refusées → les politiques manquent par
  // construction : on le dit (une ligne par type), sans « inconnu ».
  const normaliser = (x: { etat: Etat; liste: PolitiqueResume[] }) => (x.etat === "inconnu" && programme === "manque") ? { ...x, etat: "manque" as Etat } : x;
  const livraison = normaliser(liv), paiement = normaliser(pai), retours = normaliser(ret);

  const lignes = [
    { cle: "inscription_vendeur", etat: inscription },
    { cle: "politiques_activees", etat: programme },
    { cle: "politique_livraison", etat: livraison.etat, existantes: livraison.liste },
    { cle: "politique_paiement", etat: paiement.etat, existantes: paiement.liste },
    { cle: "politique_retours", etat: retours.etat, existantes: retours.liste },
  ];
  const affichees = lignes.filter((l) => l.etat !== "inconnu");
  const indeterminees = lignes.filter((l) => l.etat === "inconnu").map((l) => l.cle);

  // Jeton d'accès mort en cours de route (401 partout) : la ligne dira « à
  // reconnecter » au prochain statut — on ne stampe pas ici, le refresh du
  // prochain appel tranchera (un 401 isolé peut être transitoire).
  const http = { privilege: priv.http, programs: prog.http, fulfillment: liv.http, payment: pai.http, return: ret.http };
  const sellerState = {
    inscription_vendeur: inscription === "inconnu" ? null : inscription === "ok",
    politiques_activees: programme === "inconnu" ? null : programme === "ok",
    politiques: {
      livraison: livraison.etat === "inconnu" ? null : livraison.liste.length,
      paiement: paiement.etat === "inconnu" ? null : paiement.liste.length,
      retours: retours.etat === "inconnu" ? null : retours.liste.length,
    },
    selling_limit: sellingLimit,
    indeterminees,
    http,
    // Résumé pour la MESURE : bloqué par un état eBay ?
    bloque_par_etat_ebay: inscription === "manque" || programme === "manque" || [livraison, paiement, retours].some((x) => x.etat === "manque"),
    at: new Date().toISOString(),
  };
  await admin.from("ebay_accounts").update({ seller_state: sellerState, seller_state_at: sellerState.at }).eq("user_id", userId);
  return { lignes: affichees, indeterminees, selling_limit: sellingLimit, http, at: sellerState.at };
}

// ── Corps de création — minimaux, lisibles, marketplace FR ──────────────────
// Toute valeur refusée par eBay remonte TELLE QUELLE (messageErreurEbay) : on
// ne devine pas ce qu'eBay attend.
function corpsCreation(type: TypePolitique, options: Record<string, unknown>) {
  const nom = String(options.nom ?? "").trim().slice(0, 64) || `FillSell ${type}`;
  const base = { name: nom, marketplaceId: MARKETPLACE, categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }] };
  if (type === "payment") return { ...base, immediatePay: true };
  if (type === "return") {
    if (options.retours === "refuses") return { ...base, returnsAccepted: false };
    return { ...base, returnsAccepted: true, returnPeriod: { value: 30, unit: "DAY" }, refundMethod: "MONEY_BACK", returnShippingCostPayer: "BUYER" };
  }
  // fulfillment
  const delai = Math.min(3, Math.max(1, Number(options.delai_jours) || 2));
  if (options.livraison === "main_propre") return { ...base, handlingTime: { value: delai, unit: "DAY" }, localPickup: true };
  const frais = Math.max(0, Number(String(options.frais_eur ?? "0").replace(",", ".")) || 0);
  return {
    ...base,
    handlingTime: { value: delai, unit: "DAY" },
    shippingOptions: [{
      optionType: "DOMESTIC",
      costType: "FLAT_RATE",
      shippingServices: [{
        shippingServiceCode: "FR_Colissimo",
        sortOrder: 1,
        freeShipping: frais === 0,
        ...(frais === 0 ? {} : { shippingCost: { value: frais.toFixed(2), currency: "EUR" } }),
      }],
    }],
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const CORS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Session invalide" }, 401);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "statut");
    const env = lireEnvEbay();
    // Trace d'entrée : « le bouton ne fait rien » du 05/09 n'a laissé AUCUNE
    // ligne ici — avec ce log, une requête arrivée se voit toujours.
    console.log(`[ebay-account] action=${action} type=${String(body.type ?? "-")} user=${user.id}`);

    if (action === "statut") {
      const { compte, erreur } = await lireCompte(admin, user.id);
      if (erreur) return json({ error: `Lecture impossible : ${erreur}` }, 500);
      return json({ etat: etatPublic(compte) });
    }

    if (action === "deconnecter") {
      const { error } = await admin.from("ebay_accounts").delete().eq("user_id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ etat: etatPublic(null) });
    }

    // Toutes les actions suivantes exigent un jeton valide.
    const jeton = await obtenirAccessToken(admin, user.id);
    if (!jeton.ok) {
      return json({ etat: etatPublic(jeton.compte), checklist: null, motif: jeton.motif, detail: jeton.detail ?? null });
    }
    const token = jeton.token;

    if (action === "checklist") {
      const checklist = await releverChecklist(admin, env, token, user.id);
      const { compte } = await lireCompte(admin, user.id);
      return json({ etat: etatPublic(compte), checklist });
    }

    if (action === "activer_politiques") {
      const r = await appelEbay(env, token, "/sell/account/v1/program/opt_in", { method: "POST", body: { programType: "SELLING_POLICY_MANAGEMENT" } });
      if (r.http < 200 || r.http >= 300) return json({ error: `eBay a refusé l'activation : ${messageErreurEbay(r.json, r.texte)}`, http: r.http }, 502);
      const checklist = await releverChecklist(admin, env, token, user.id);
      const { compte } = await lireCompte(admin, user.id);
      return json({ etat: etatPublic(compte), checklist });
    }

    const type = String(body.type ?? "") as TypePolitique;
    if (!TYPES[type]) return json({ error: "Type de politique inconnu" }, 400);

    if (action === "choisir_politique") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "Identifiant de politique absent" }, 400);
      // On ne mémorise qu'une politique qui EXISTE chez eBay pour ce compte.
      const liste = await listerPolitiques(env, token, type);
      if (!liste.liste.some((p) => p.id === id)) return json({ error: "Cette politique n'existe pas (ou plus) sur ton compte eBay." }, 404);
      const { error } = await admin.from("ebay_accounts").update({ [TYPES[type].colonne]: id }).eq("user_id", user.id);
      if (error) return json({ error: error.message }, 500);
      const { compte } = await lireCompte(admin, user.id);
      return json({ etat: etatPublic(compte) });
    }

    if (action === "creer_politique") {
      // Création UNIQUEMENT ici, sur clic explicite « Créer » de l'utilisateur.
      const options = (body.options && typeof body.options === "object" ? body.options : {}) as Record<string, unknown>;
      const r = await appelEbay(env, token, TYPES[type].chemin, { method: "POST", body: corpsCreation(type, options) });
      if (r.http < 200 || r.http >= 300) {
        return json({ error: `eBay a refusé la création : ${messageErreurEbay(r.json, r.texte)}`, http: r.http }, 502);
      }
      const cree = r.json as Record<string, unknown> | null;
      const id = String(cree?.[TYPES[type].id] ?? "");
      if (!id) return json({ error: "eBay a répondu sans identifiant de politique." }, 502);
      await admin.from("ebay_accounts").update({ [TYPES[type].colonne]: id }).eq("user_id", user.id);
      const checklist = await releverChecklist(admin, env, token, user.id);
      const { compte } = await lireCompte(admin, user.id);
      return json({ etat: etatPublic(compte), checklist, creee: { id, name: String(cree?.name ?? "") } });
    }

    return json({ error: `Action inconnue : ${action}` }, 400);
  } catch (err) {
    console.error("[ebay-account] erreur inattendue :", (err as Error)?.message ?? err);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
