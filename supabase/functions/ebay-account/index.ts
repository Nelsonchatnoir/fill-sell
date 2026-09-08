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
//   services_livraison  la liste VIVANTE des modes d'envoi qu'eBay FR accepte
//                       aujourd'hui (GeteBayDetails), groupée pour un vendeur
//   detail_politique    { type, id } — LECTURE SEULE du contenu d'une politique
//                       (transporteur, prix, délai) : la liste des politiques
//                       ne rend qu'un nom, le vendeur ne savait pas ce qu'il
//                       désignait (07/09)
//   poser_livraison     { services:[{code, frais_eur}], delai_jours } — écrit
//                       la politique de livraison FillSell avec les
//                       transporteurs CHOISIS (1 à 4), sur action explicite.
//                       Ne touche JAMAIS une politique faite par le vendeur :
//                       elle est adressée par son nom (« Livraison FillSell »).
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
//   · lieu_expedition      ← nos propres réglages (adresse d'expédition eBay,
//                            à défaut adresse Leboncoin) ou emplacement
//                            marchand déjà créé — déterminable, et BLOQUANT :
//                            sans lui la 1re publication API tombe en
//                            needs_user (cf. lieuExpeditionEtat) ;
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
import {
  listerServicesLivraison, resoudreServiceLivraison, resumerServicesDomestiques, MODES_LIVRAISON,
  grouperServicesDomestiques, resoudreCodeService, familleService, PLAFOND_SERVICES_DOMESTIQUES,
  type ServiceLivraison,
} from "../_shared/ebay-shipping.ts";

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

// ── Lieu d'expédition : la 6e ligne de la checklist (07/09/2026, soir) ─────
// Relevé du jour : 2 048 comptes sur 2 150 n'ont aucune adresse exploitable.
// Sans elle, la 1re publication par API s'arrête en needs_user au moment de
// créer l'emplacement marchand eBay — le vendeur découvre le problème au pire
// moment, sur sa première annonce.
//
// ⛔ LE VERROU SE POSE ICI, ET NULLE PART AILLEURS. La décision de voie vit
// dans le trigger cross_post_jobs_voie_ebay, qui reste INCHANGÉ : il lit
// seller_state->>'bloque_par_etat_ebay'. En faisant entrer le lieu
// d'expédition dans ce drapeau, un compte sans adresse garde voie='extension'
// (il publie par le formulaire, comme tout le parc) au lieu de partir en
// needs_user — et l'écran, qui reflète le même drapeau, le dit. Aucune
// désynchronisation possible entre ce que l'app affiche et ce que la base
// décide : c'est la même valeur, calculée une fois.
//
// MÊMES SOURCES, MÊME ORDRE que emplacementMarchand (_shared/ebay-publication.ts) :
//   0. emplacement marchand DÉJÀ créé chez eBay → plus rien à demander ;
//   1. platform_settings.ebay.adresse_expedition {code_postal, ville} ;
//   2. l'adresse de remise Leboncoin.
// Si l'une des deux lectures échoue, l'état est « inconnu » : la ligne n'est
// pas affichée et ne bloque RIEN — on ne ferme jamais une porte sur une
// lecture ratée.
async function lieuExpeditionEtat(admin: SupabaseClient, userId: string): Promise<Etat> {
  try {
    const [{ data: compte }, { data: profil }] = await Promise.all([
      admin.from("ebay_accounts").select("merchant_location_key").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("platform_settings").eq("id", userId).maybeSingle(),
    ]);
    if (String((compte as { merchant_location_key?: string } | null)?.merchant_location_key ?? "").trim()) return "ok";
    const reglages = (profil?.platform_settings ?? null) as
      { ebay?: { adresse_expedition?: { code_postal?: string; ville?: string } }; leboncoin?: { adresse?: string } } | null;
    const propre = reglages?.ebay?.adresse_expedition ?? null;
    if (/^\d{5}$/.test(String(propre?.code_postal ?? "").trim()) && String(propre?.ville ?? "").trim()) return "ok";
    return /\b(\d{5})\b\s*(.+)$/.test(String(reglages?.leboncoin?.adresse ?? "")) ? "ok" : "manque";
  } catch (e) {
    console.warn(`[ebay-account] lieu d'expédition illisible pour ${userId} :`, (e as Error)?.message ?? e);
    return "inconnu";
  }
}

async function releverChecklist(admin: SupabaseClient, env: EbayEnv, token: string, userId: string) {
  const [priv, prog, liv, pai, ret, lieu] = await Promise.all([
    appelEbay(env, token, "/sell/account/v1/privilege"),
    appelEbay(env, token, "/sell/account/v1/program/get_opted_in_programs"),
    listerPolitiques(env, token, "fulfillment"),
    listerPolitiques(env, token, "payment"),
    listerPolitiques(env, token, "return"),
    lieuExpeditionEtat(admin, userId),
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
    { cle: "lieu_expedition", etat: lieu },
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
    lieu_expedition: lieu === "inconnu" ? null : lieu === "ok",
    selling_limit: sellingLimit,
    indeterminees,
    http,
    // Drapeau LU PAR LE TRIGGER cross_post_jobs_voie_ebay (migration
    // 20260906150000) : « ce compte est-il prêt à publier par API ? ».
    // ⚠️ Son nom dit « état eBay » (il ne portait que ça au 06/09) mais depuis
    // le 07/09 il porte AUSSI le lieu d'expédition, qui est notre donnée à
    // nous : sans ville + code postal, l'emplacement marchand eBay ne peut pas
    // être créé et la 1re publication tomberait en needs_user. Le nom de la
    // clé ne change pas — le trigger et le miroir de l'app la lisent
    // littéralement, la renommer les casserait tous les deux en silence.
    bloque_par_etat_ebay: inscription === "manque" || programme === "manque" || lieu === "manque"
      || [livraison, paiement, retours].some((x) => x.etat === "manque"),
    at: new Date().toISOString(),
  };
  await admin.from("ebay_accounts").update({ seller_state: sellerState, seller_state_at: sellerState.at }).eq("user_id", userId);
  return { lignes: affichees, indeterminees, selling_limit: sellingLimit, http, at: sellerState.at };
}

// ── Corps de création — minimaux, lisibles, marketplace FR ──────────────────
// Toute valeur refusée par eBay remonte TELLE QUELLE (messageErreurEbay) : on
// ne devine pas ce qu'eBay attend.
// Politique de livraison : le shippingServiceCode n'est JAMAIS écrit en dur
// ici — il est résolu depuis la liste GeteBayDetails d'eBay pour le mode de
// l'app (cf. _shared/ebay-shipping.ts) et passé en `serviceCode`. Le 06/09,
// « FR_Colissimo » codé en dur avait valu « Échec de la validation LSAS ».
// ⚠️ Ces corps ne servent QU'À LA CRÉATION (POST). eBay y applique les défauts
// des champs absents — c'est pourquoi les politiques du 06/09 sont passées sans
// globalShipping. Le jour où une MISE À JOUR (PUT) est ajoutée pour le paiement
// ou les retours, elle devra envoyer un corps COMPLET (« this call overwrites
// the existing policy »), sinon elle butera sur le même « field is null » que
// la livraison le 07/09, et effacera au passage description / instructions /
// overrides que le vendeur aurait posés. Voir corpsLivraison.
function corpsCreation(type: TypePolitique, options: Record<string, unknown>, serviceCode?: string) {
  const nom = String(options.nom ?? "").trim().slice(0, 64) || `FillSell ${type}`;
  const base = { name: nom, marketplaceId: MARKETPLACE, categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }] };
  if (type === "payment") return { ...base, immediatePay: true };
  if (type === "return") {
    if (options.retours === "refuses") return { ...base, returnsAccepted: false };
    return { ...base, returnsAccepted: true, returnPeriod: { value: 30, unit: "DAY" }, refundMethod: "MONEY_BACK", returnShippingCostPayer: "BUYER" };
  }
  // fulfillment
  const delai = Math.min(3, Math.max(1, Number(options.delai_jours) || 2));
  if (!serviceCode) throw new Error("code de service de livraison non résolu");
  // Remise en main propre = un service de livraison eBay à part entière
  // (FR_RemiseEnMainPropre, catégorie PICKUP, valide pour la vente), gratuit
  // par nature. On ne combine PAS avec le booléen localPickup : un seul
  // mécanisme, celui que la liste d'eBay valide.
  const mainPropre = options.livraison === "main_propre";
  const frais = mainPropre ? 0 : Math.max(0, Number(String(options.frais_eur ?? "0").replace(",", ".")) || 0);
  return {
    ...base,
    handlingTime: { value: delai, unit: "DAY" },
    shippingOptions: [{
      optionType: "DOMESTIC",
      costType: "FLAT_RATE",
      shippingServices: [{
        shippingServiceCode: serviceCode,
        sortOrder: 1,
        freeShipping: frais === 0,
        ...(frais === 0 ? {} : { shippingCost: { value: frais.toFixed(2), currency: "EUR" } }),
      }],
    }],
  };
}

// ── Politique de livraison « à plusieurs transporteurs » (07/09/2026) ───────
// La politique FillSell est adressée par SON NOM : on ne réécrit jamais une
// politique que le vendeur a faite lui-même (cas relevé le 07/09 : un vendeur
// avait désigné la sienne, avec Mondial Relay à 2,78 € — l'écraser aurait
// effacé son réglage). Si elle existe déjà chez eBay → PUT (mise à jour),
// sinon → POST (création). Dans les deux cas UN SEUL appel : eBay l'applique
// en entier ou pas du tout, il n'y a pas de politique à moitié écrite.
const NOM_POLITIQUE_LIVRAISON = "Livraison FillSell";

// ── « Global shipping field is null » (refus relevé le 07/09 au soir, compte
// nelsonthecat, mise à jour d'une politique existante) ─────────────────────
// CAUSE, dans la doc d'eBay elle-même (updateFulfillmentPolicy, PUT
// /fulfillment_policy/{id}, sell_account_v1_oas3) : « Supply a COMPLETE policy
// payload with the updates you want to make; this call OVERWRITES the existing
// policy with the new details specified in the payload. »
// Un PUT n'est donc pas une mise à jour partielle : tout champ absent est
// écrasé, et les booléens absents arrivent à null — d'où le refus. (Le POST de
// création, lui, applique les défauts : c'est pourquoi les créations du 06/09
// étaient passées avec le même corps.)
// ⚠️ La spec ne déclare AUCUN champ `required` pour ces trois schémas — la
// vérité est dans la phrase ci-dessus et dans le refus d'eBay, pas dans le JSON.
//
// DEUX conséquences, traitées ici :
//  1. les quatre booléens du schéma sont TOUJOURS envoyés, à leur valeur
//     documentée « non activé » :
//       globalShipping  false — « If set to false or if the field is omitted,
//                        the seller has to specify any international shipping
//                        service options ». Le programme d'expédition
//                        internationale n'est donc PAS activé, et la doc
//                        précise qu'il ne concerne de toute façon que le
//                        marché britannique (EBAY_GB) ;
//       freightShipping false — « Default: false » (fret, objets > 150 lbs) ;
//       localPickup     false — « Default: false ». On ne l'active pas : la
//                        remise en main propre passe par le service
//                        FR_RemiseEnMainPropre, un seul mécanisme ;
//       pickupDropOff   false — « Click and Collect », réservé aux grands
//                        distributeurs. Non activé.
//  2. sur une MISE À JOUR, les champs que cet écran ne gère pas sont REPRIS
//     tels qu'eBay les rend (description, shipToLocations) : sans ça, le PUT
//     effacerait en silence ce que le vendeur y avait mis. Et si l'un des
//     quatre booléens était déjà à true chez lui, sa valeur est conservée —
//     on ne décide à sa place ni dans un sens ni dans l'autre.
const BOOLEENS_POLITIQUE = ["globalShipping", "freightShipping", "localPickup", "pickupDropOff"] as const;
const CHAMPS_REPRIS = ["description", "shipToLocations"] as const;

interface ServiceDemande { code: string; frais: number }

function corpsLivraison(demandes: ServiceDemande[], services: ServiceLivraison[], delaiJours: number, existant: Record<string, unknown> | null) {
  const delai = Math.min(3, Math.max(1, delaiJours || 2));
  const repris: Record<string, unknown> = {};
  for (const champ of CHAMPS_REPRIS) {
    const v = existant?.[champ];
    if (v !== undefined && v !== null) repris[champ] = v;
  }
  for (const b of BOOLEENS_POLITIQUE) {
    repris[b] = typeof existant?.[b] === "boolean" ? existant[b] as boolean : false;
  }
  return {
    ...repris,
    name: NOM_POLITIQUE_LIVRAISON,
    marketplaceId: MARKETPLACE,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
    handlingTime: { value: delai, unit: "DAY" },
    shippingOptions: [{
      optionType: "DOMESTIC",
      costType: "FLAT_RATE",
      shippingServices: demandes.map((d, i) => {
        // Remise en main propre (catégorie PICKUP) : gratuite par nature, eBay
        // ne veut pas de prix dessus. Le reste porte SON prix — jamais 4,99 €
        // recopié sur tout le monde.
        const s = services.find((x) => x.code === d.code);
        const frais = s?.categorie === "PICKUP" ? 0 : Math.max(0, d.frais);
        return {
          shippingServiceCode: d.code,
          sortOrder: i + 1,
          freeShipping: frais === 0,
          ...(frais === 0 ? {} : { shippingCost: { value: frais.toFixed(2), currency: "EUR" } }),
        };
      }),
    }],
  };
}

// Contenu LISIBLE d'une politique — ce que la liste {id, name} ne disait pas.
// Les libellés et délais viennent de la liste vivante d'eBay quand elle est
// lisible ; sans elle, on rend le code brut plutôt que rien.
function resumerPolitique(type: TypePolitique, brut: unknown, services: ServiceLivraison[] | null) {
  const p = (brut ?? {}) as Record<string, unknown>;
  const base = { id: String(p[TYPES[type].id] ?? ""), nom: String(p.name ?? "") };
  if (type === "payment") return { ...base, paiement_immediat: p.immediatePay === true };
  if (type === "return") {
    const periode = (p.returnPeriod ?? {}) as { value?: number };
    return {
      ...base,
      retours_acceptes: p.returnsAccepted === true,
      delai_jours: typeof periode.value === "number" ? periode.value : null,
      payeur_retour: String(p.returnShippingCostPayer ?? "") || null,
    };
  }
  const handling = (p.handlingTime ?? {}) as { value?: number };
  const options = Array.isArray(p.shippingOptions) ? p.shippingOptions as Record<string, unknown>[] : [];
  const domestiques = options.filter((o) => String(o.optionType ?? "") === "DOMESTIC");
  const lignes: Array<Record<string, unknown>> = [];
  for (const o of domestiques) {
    const liste = Array.isArray(o.shippingServices) ? o.shippingServices as Record<string, unknown>[] : [];
    for (const sv of liste) {
      const code = String(sv.shippingServiceCode ?? "");
      if (!code) continue;
      const vivant = services?.find((x) => x.code === code) ?? null;
      const cout = (sv.shippingCost ?? {}) as { value?: string };
      const gratuit = sv.freeShipping === true || Number(cout.value ?? NaN) === 0;
      lignes.push({
        code,
        libelle: vivant?.libelle || code,
        famille: vivant ? familleService(vivant) : null,
        delai_min: vivant?.delaiMin ?? null,
        delai_max: vivant?.delaiMax ?? null,
        frais_eur: gratuit ? 0 : (cout.value != null ? Number(cout.value) : null),
        gratuit,
        ordre: typeof sv.sortOrder === "number" ? sv.sortOrder : null,
      });
    }
  }
  return {
    ...base,
    delai_traitement_jours: typeof handling.value === "number" ? handling.value : null,
    services: lignes.sort((a, b) => Number(a.ordre ?? 99) - Number(b.ordre ?? 99)),
    a_international: options.some((o) => String(o.optionType ?? "") === "INTERNATIONAL"),
    nous_appartient: String(p.name ?? "") === NOM_POLITIQUE_LIVRAISON,
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
      // Sortie explicite de la voie API (2026-09-08) : sans compte relié, le
      // drapeau retombe — l'app rend eBay à la voie extension, sans grisage.
      const { error: ePf } = await admin.from("profiles").update({ ebay_voie_api: false }).eq("id", user.id);
      if (ePf) console.warn(`[ebay-account] deconnecter : ebay_voie_api non remis à false pour ${user.id} : ${ePf.message}`);
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

    // ── Les modes d'envoi qu'eBay FR accepte AUJOURD'HUI ────────────────────
    // Lecture seule. La liste vient de GeteBayDetails (cache 1 h par isolat),
    // filtrée sur ValidForSellingFlow : un service retiré par eBay disparaît
    // de l'écran tout seul, un service ajouté y apparaît sans redéploiement.
    if (action === "services_livraison") {
      try {
        const services = await listerServicesLivraison(env, token);
        return json({
          familles: grouperServicesDomestiques(services),
          plafond: PLAFOND_SERVICES_DOMESTIQUES,
          at: new Date().toISOString(),
        });
      } catch (e) {
        return json({ error: `Impossible de lire les modes d'envoi chez eBay : ${(e as Error).message}` }, 502);
      }
    }

    // ── Écrire la politique de livraison avec les transporteurs choisis ─────
    if (action === "poser_livraison") {
      const brut = Array.isArray(body.services) ? body.services as Array<Record<string, unknown>> : [];
      if (!brut.length) return json({ error: "Choisis au moins un mode d'envoi." }, 400);
      if (brut.length > PLAFOND_SERVICES_DOMESTIQUES) {
        return json({ error: `eBay accepte au maximum ${PLAFOND_SERVICES_DOMESTIQUES} modes d'envoi dans une même politique.` }, 400);
      }
      const codes = brut.map((s) => String(s.code ?? "").trim()).filter(Boolean);
      if (codes.length !== brut.length) return json({ error: "Un mode d'envoi est arrivé sans code." }, 400);
      if (new Set(codes).size !== codes.length) return json({ error: "Le même mode d'envoi est choisi deux fois." }, 400);

      let services: ServiceLivraison[];
      try { services = await listerServicesLivraison(env, token); }
      catch (e) { return json({ error: `Impossible de lire les modes d'envoi chez eBay : ${(e as Error).message}` }, 502); }

      // Chaque code est RE-VALIDÉ contre la liste vivante avant d'être posé —
      // un code absent ou plus valide est refusé ICI, avec la liste, plutôt
      // que par un « Échec de la validation LSAS » opaque côté eBay.
      const demandes: ServiceDemande[] = [];
      for (const s of brut) {
        const code = String(s.code ?? "").trim();
        const service = resoudreCodeService(code, services);
        if (!service) {
          return json({
            error: `eBay ne propose pas (ou plus) le mode d'envoi « ${code} » pour la France. Modes valides selon eBay : ${resumerServicesDomestiques(services)}.`,
          }, 400);
        }
        const fraisTexte = String(s.frais_eur ?? "0").replace(",", ".").trim();
        const frais = Number(fraisTexte);
        if (fraisTexte !== "" && !Number.isFinite(frais)) {
          return json({ error: `Le prix de « ${service.libelle} » n'est pas un montant.` }, 400);
        }
        demandes.push({ code, frais: Number.isFinite(frais) ? Math.max(0, frais) : 0 });
      }

      // Politique FillSell déjà chez eBay ? On la met à jour ; sinon on la crée.
      // 404 = elle n'existe pas encore, c'est un état normal, pas une erreur.
      // getFulfillmentPolicyByName rend la politique COMPLÈTE : c'est elle qui
      // fournit les champs à reprendre pour que le PUT n'écrase rien.
      const existante = await appelEbay(env, token, `${TYPES.fulfillment.chemin}/get_by_policy_name?marketplace_id=${MARKETPLACE}&name=${encodeURIComponent(NOM_POLITIQUE_LIVRAISON)}`);
      const dejaLa = existante.http === 200 && existante.json && typeof existante.json === "object"
        ? existante.json as Record<string, unknown>
        : null;
      const idExistant = String(dejaLa?.fulfillmentPolicyId ?? "");
      const corps = corpsLivraison(demandes, services, Number(body.delai_jours ?? 2), dejaLa);
      const r = idExistant
        ? await appelEbay(env, token, `${TYPES.fulfillment.chemin}/${idExistant}`, { method: "PUT", body: corps })
        : await appelEbay(env, token, TYPES.fulfillment.chemin, { method: "POST", body: corps });
      if (r.http < 200 || r.http >= 300) {
        // Rien n'est écrit chez nous : le vendeur garde la politique qu'il avait.
        return json({ error: `eBay a refusé ${idExistant ? "la mise à jour" : "la création"} de la politique de livraison : ${messageErreurEbay(r.json, r.texte)}`, http: r.http }, 502);
      }
      const rendu = (r.json ?? {}) as Record<string, unknown>;
      const id = String(rendu[TYPES.fulfillment.id] ?? idExistant);
      if (!id) return json({ error: "eBay a répondu sans identifiant de politique." }, 502);
      await admin.from("ebay_accounts").update({ fulfillment_policy_id: id }).eq("user_id", user.id);
      console.log(`[ebay-account] livraison posée user=${user.id} ${idExistant ? "maj" : "creation"}=${id} services=${demandes.map((d) => d.code).join(",")}`);
      const lecture = await appelEbay(env, token, `${TYPES.fulfillment.chemin}/${id}`);
      const checklist = await releverChecklist(admin, env, token, user.id);
      const { compte } = await lireCompte(admin, user.id);
      return json({
        etat: etatPublic(compte),
        checklist,
        detail: lecture.http === 200 ? resumerPolitique("fulfillment", lecture.json, services) : null,
        maj: Boolean(idExistant),
      });
    }

    const type = String(body.type ?? "") as TypePolitique;
    if (!TYPES[type]) return json({ error: "Type de politique inconnu" }, 400);

    // ── Ce qu'il y a DANS une politique — lecture seule, n'écrit rien ───────
    if (action === "detail_politique") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "Identifiant de politique absent" }, 400);
      const r = await appelEbay(env, token, `${TYPES[type].chemin}/${encodeURIComponent(id)}`);
      if (r.http !== 200) {
        return json({ error: `eBay n'a pas rendu cette politique : ${messageErreurEbay(r.json, r.texte)}`, http: r.http }, 502);
      }
      // La liste vivante sert à nommer les codes ; si elle manque, on rend le
      // code brut — un détail partiel vaut mieux qu'un écran vide.
      let services: ServiceLivraison[] | null = null;
      if (type === "fulfillment") {
        try { services = await listerServicesLivraison(env, token); } catch { services = null; }
      }
      return json({ detail: resumerPolitique(type, r.json, services) });
    }

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
      let serviceCode: string | undefined;
      if (type === "fulfillment") {
        // Le code du mode est lu dans la liste qu'eBay rend pour le site FR
        // (GeteBayDetails, cache 1 h) et refusé ICI s'il n'y est pas valide.
        const mode = String(options.livraison ?? "colissimo");
        if (!MODES_LIVRAISON[mode]) return json({ error: `Mode de livraison inconnu : ${mode}` }, 400);
        let services;
        try { services = await listerServicesLivraison(env, token); }
        catch (e) { return json({ error: `Impossible de lire les services de livraison chez eBay : ${(e as Error).message}` }, 502); }
        const service = resoudreServiceLivraison(mode, services);
        if (!service) {
          return json({
            error: `eBay ne propose pas (ou plus) le service « ${MODES_LIVRAISON[mode].code} » pour la France. Services domestiques valides selon eBay : ${resumerServicesDomestiques(services)}.`,
          }, 400);
        }
        serviceCode = service.code;
        console.log(`[ebay-account] politique livraison : mode=${mode} → ${service.code} (${service.libelle}, ${service.categorie})`);
      }
      const r = await appelEbay(env, token, TYPES[type].chemin, { method: "POST", body: corpsCreation(type, options, serviceCode) });
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
