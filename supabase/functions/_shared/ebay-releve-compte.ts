// ═══════════════════════════════════════════════════════════════════════════
// eBAY — LE RELEVÉ DU COMPTE VENDEUR, UNE SEULE FONCTION POUR L'APP ET LE SERVEUR
// (14/11/2026, cliente af37fa49 — point 5a de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le relevé (inscription vendeur, conditions de vente activées, livraison / paiement / retours, lieu d'expédition,
// plafond, type de vendeur) n'était lu QUE quand l'app ouvrait Réglages › Compte eBay (ebay-account « checklist »).
// af37fa49 a relié eBay à 14:27 depuis son iPhone sans repasser par cet écran : seller_state est resté vide, le serveur
// a parqué sa publication sur « finis ton compte vendeur (vérification ou inscription vendeur) » — une cause qu'il
// n'avait pas lue —, et rien ne relisait jamais le compte : ses publications ne pouvaient pas repartir seules.
// Le relevé vit donc ICI (déplacé tel quel d'ebay-account, qui l'importe) ; ebay-api-worker le lit aussi : avant de
// parquer une publication sur un compte jamais relevé (ou relevé il y a plus de 30 min), et pour la relecture bornée
// des comptes qui ont des publications parquées (_shared/ebay-voie.ts, relectureCompteEbayDue).
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, messageErreurEbay, obtenirAccessToken, type EbayEnv } from "./ebay-oauth.ts";
import { appelTrading, erreurTrading } from "./ebay-trading-releve.ts";
import { typeVendeurEbayDuXml } from "./ebay-retours.js";
import { plafondEbay } from "./ebay-etat-compte.js";
import { compteEbayApiUsableDepuisLigne, etapeEbayAFinir, type EtapeEbayAFinir } from "./ebay-voie.ts";

export const MARKETPLACE = "EBAY_FR";

export type TypePolitique = "fulfillment" | "payment" | "return";
export const TYPES: Record<TypePolitique, { chemin: string; liste: string; id: string; colonne: string }> = {
  fulfillment: { chemin: "/sell/account/v1/fulfillment_policy", liste: "fulfillmentPolicies", id: "fulfillmentPolicyId", colonne: "fulfillment_policy_id" },
  payment: { chemin: "/sell/account/v1/payment_policy", liste: "paymentPolicies", id: "paymentPolicyId", colonne: "payment_policy_id" },
  return: { chemin: "/sell/account/v1/return_policy", liste: "returnPolicies", id: "returnPolicyId", colonne: "return_policy_id" },
};

export interface PolitiqueResume { id: string; name: string; }
export type Etat = "ok" | "manque" | "inconnu";

export async function listerPolitiques(env: EbayEnv, token: string, type: TypePolitique): Promise<{ etat: Etat; liste: PolitiqueResume[]; http: number; detail?: string }> {
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
export async function lieuExpeditionEtat(admin: SupabaseClient, userId: string): Promise<Etat> {
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

// (06/11, Nico, point 4 — Pascal Caffray) Le type de vendeur LU chez eBay (Trading GetUser, SellerBusinessType) :
// "professionnel", "particulier" ou null (illisible). « Pas de retour » n'est permis qu'à un particulier
// (_shared/ebay-retours.js) : eBay le refuse aux professionnels (25002) — à la publication, jamais à la création.
export async function lireTypeVendeurEbay(env: EbayEnv, token: string): Promise<string | null> {
  try {
    const r = await appelTrading(env, token, "GetUser", "<DetailLevel>ReturnAll</DetailLevel>");
    if (r.http !== 200 || erreurTrading(r.xml)) return null;
    return typeVendeurEbayDuXml(r.xml);
  } catch {
    return null;
  }
}

export async function releverChecklist(admin: SupabaseClient, env: EbayEnv, token: string, userId: string) {
  const [priv, prog, liv, pai, ret, lieu, typeVendeur] = await Promise.all([
    appelEbay(env, token, "/sell/account/v1/privilege"),
    appelEbay(env, token, "/sell/account/v1/program/get_opted_in_programs"),
    listerPolitiques(env, token, "fulfillment"),
    listerPolitiques(env, token, "payment"),
    listerPolitiques(env, token, "return"),
    lieuExpeditionEtat(admin, userId),
    lireTypeVendeurEbay(env, token),
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
    { cle: "politique_retours", etat: retours.etat, existantes: retours.liste, type_vendeur: typeVendeur },
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
    type_vendeur: typeVendeur,
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
      || [livraison, paiement, retours].some((x) => x.etat === "manque")
      // (17/10, Louis) eBay plafonne le compte à 0 article OU 0 € : il ne peut rien vendre.
      || plafondEbay(sellingLimit)?.nul === true,
    at: new Date().toISOString(),
  };
  await admin.from("ebay_accounts").update({ seller_state: sellerState, seller_state_at: sellerState.at }).eq("user_id", userId);
  return { lignes: affichees, indeterminees, selling_limit: sellingLimit, type_vendeur: typeVendeur, http, at: sellerState.at };
}


/** Un relevé de plus de 30 min ne dit plus l'état du compte au moment d'y parquer une publication. */
export const RELEVE_PERIME_MS = 30 * 60_000;

/** La ligne ebay_accounts telle que la lisent la règle (etatCompteEbay) et la relecture. */
export const COLONNES_ETAT_COMPTE = "revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state, seller_state_at";

/**
 * L'état du compte eBay pour PARQUER une publication, relevé chez eBay s'il ne l'a jamais été (ou s'il date de plus de
 * `perimeMs`) — jamais une cause devinée. Le relevé est best-effort : jeton indisponible, eBay muet → l'état déjà en
 * base (le message dit alors « pas encore lu », jamais une étape inventée). (service_role)
 * ⛔ Un compte que la base dit PRÊT n'est jamais relevé ici (aucun appel eBay de plus pour les comptes qui publient :
 *    le quota Account API est partagé par tout le parc) — seul un compte pas prêt, ou jamais lu, l'est.
 */
export async function etatCompteEbayApiFrais(
  admin: SupabaseClient, env: EbayEnv, userId: string,
  { perimeMs = RELEVE_PERIME_MS, maintenant = Date.now() }: { perimeMs?: number; maintenant?: number } = {},
): Promise<{ usable: boolean; aFinir: EtapeEbayAFinir | null; releve: boolean }> {
  const lire = async () => {
    const { data } = await admin.from("ebay_accounts").select(COLONNES_ETAT_COMPTE).eq("user_id", userId).maybeSingle();
    return data as Record<string, unknown> | null;
  };
  try {
    let ligne = await lire();
    if (compteEbayApiUsableDepuisLigne(ligne)) return { usable: true, aFinir: null, releve: false };
    let releve = false;
    const lu = Date.parse(String(ligne?.seller_state_at ?? ""));
    if (ligne && ligne.revoked_at == null && (ligne.seller_state == null || !Number.isFinite(lu) || maintenant - lu >= perimeMs)) {
      const jeton = await obtenirAccessToken(admin, userId);
      if (jeton.ok) {
        try {
          await releverChecklist(admin, env, jeton.token, userId);
          releve = true;
          ligne = await lire();
        } catch (e) {
          console.warn(`[ebay-releve-compte] relevé impossible pour ${userId} : ${(e as Error)?.message ?? e}`);
        }
      }
    }
    return { usable: compteEbayApiUsableDepuisLigne(ligne), aFinir: etapeEbayAFinir(ligne), releve };
  } catch {
    return { usable: false, aFinir: null, releve: false };
  }
}
