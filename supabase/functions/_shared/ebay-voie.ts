// ═══════════════════════════════════════════════════════════════════════════
// eBay — CONNECTÉ ? UTILISABLE ? ET LE RÉ-ARMEMENT VERS LA VOIE API (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Un nouvel inscrit qui publie sur eBay part par l'extension, bute sur le mur
// « REAUTH VENTE » du flux de vente, et brûle ses tentatives : il n'a jamais
// relié de compte eBay par l'API, et rien ne l'y menait. La correction amène
// ces comptes vers la voie API (34 comptes y publient, la voie fonctionne).
//
// Ce module répond à deux questions, sans jamais appeler eBay (SELECT seul), et
// porte le ré-armement automatique — même principe qu'« Autoriser Opla » :
//   · `compteEbayApiConnecte`  : y a-t-il une connexion OAuth NON révoquée ?
//   · `compteEbayApiUsable`    : le compte est-il PRÊT à publier par API —
//                                (17/10) LA règle partagée avec l'app,
//                                etatCompteEbay (_shared/ebay-etat-compte.js) :
//                                connexion, 3 politiques RETENUES, étapes vertes,
//                                plafond de vente eBay non nul ;
//   · `rearmerJobsEbayConnexionSiUtilisable` : quand le compte devient
//     utilisable, les publications parquées repartent en voie='api', pending ;
//     (19/11, décision de Nico) un RETRAIT parqué repart dès que le compte est
//     relié, sans attendre les règles de vente (rearmementEbayPermis).
//
// ⛔ ON NE DÉPLACE JAMAIS LE MUR. Le ré-armement d'une PUBLICATION n'a lieu que
//    si le compte est réellement UTILISABLE : sinon elle repartirait en API pour
//    buter aussitôt sur « politiques absentes ». Tant que ce n'est pas prêt,
//    le job attend en needs_user, avec son bouton « Connecte ton compte eBay ».
//    Un retrait n'a besoin d'aucune règle de vente : la liaison suffit.
//
// deno-lint-ignore-file no-explicit-any
import { etatCompteEbay } from "./ebay-etat-compte.js";
import { texteCompteEbayAFinir } from "./ebay-compte-a-finir.js";

/** Le marqueur porté par un job parqué : nommé, donc mesurable et filtrable. */
export const SOURCE_EBAY_CONNEXION_REQUISE = "ebay_connexion_requise";

/**
 * (2026-09-27) Compte RELIÉ par l'API mais pas encore prêt à vendre (politiques
 * non retenues, statut vendeur bloqué). Depuis ce jour, une publication d'un
 * compte relié part TOUJOURS en voie 'api' (trigger cross_post_jobs_voie_ebay) ;
 * ebay-api-worker la parque ici au lieu de l'envoyer buter chez eBay, et le
 * ré-armement ci-dessous la relance dès que le compte est prêt — même bouton,
 * même parcours eBay que « Connecte ton compte eBay ».
 */
export const SOURCE_EBAY_COMPTE_A_FINIR = "ebay_compte_a_finir";

/** Les sources qu'un compte devenu utilisable ré-arme vers la voie API. */
export const SOURCES_EBAY_REARMABLES = [SOURCE_EBAY_CONNEXION_REQUISE, SOURCE_EBAY_COMPTE_A_FINIR];

/** Le message montré sur une publication parquée « compte à finir ». Rien n'est parti chez eBay. */
export const MESSAGE_EBAY_COMPTE_A_FINIR =
  "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : " +
  "il reste à finir sa configuration (paiement, retours, livraison). Rien n'a été envoyé à eBay — " +
  "l'annonce partira toute seule dès que ton compte sera prêt.";

/**
 * (17/10, Fluxen) eBay refuse « Pas de retour » pour CE compte (refus 25002,
 * paramètre ReturnsAcceptedOption : vendeur professionnel, retours obligatoires).
 * Rien n'est en ligne ; la politique de retours n'est plus retenue — c'est la
 * personne qui en choisit une autre, jamais FillSell à sa place.
 */
export const MESSAGE_EBAY_RETOURS_OBLIGATOIRES =
  "eBay refuse « Pas de retour » sur ton compte : il exige que tu acceptes les retours " +
  "(c'est la règle pour les vendeurs professionnels). Dans Réglages › Compte eBay, choisis les retours acceptés : " +
  "rien n'a été mis en ligne, et l'annonce partira toute seule.";

// ── (12/10, Nico) LE LIEN DIRECT VERS CE QUI RESTE À FINIR CHEZ eBAY ─────────
// « ajoute au message le lien direct vers la page eBay où finir la
// configuration du compte vendeur ». Liens VÉRIFIÉS seulement (garde-fou Nico,
// src/utils/ebayParcours.js LIENS_EBAY, relevés le 05/09 et le 22/09) :
//   · statut vendeur bloqué par eBay (vérification d'identité, inscription) :
//     le Seller Hub, seule porte vivante (src/utils/shared.js EBAY_SELLER_HUB_URL) ;
//   · conditions de vente (paiement, retours, livraison) absentes :
//     la page des conditions de vente.
export const LIEN_EBAY_VENDEUR = "https://www.ebay.fr/sh/ovw";
export const LIEN_EBAY_CONDITIONS = "https://www.ebay.fr/bp/manage";

/**
 * Ce qui reste à finir pour une ligne ebay_accounts, et son lien — ou null (compte prêt / absent).
 * (17/10) Lu sur LA règle partagée (etatCompteEbay) :
 *   · plafond   — eBay plafonne le compte à zéro : c'est eBay, sur le compte vendeur (Seller Hub) ;
 *   · vendeur   — inscription vendeur pas finie, ou rien de relevé : Seller Hub ;
 *   · retours   — seule la politique de retours manque : à choisir dans FillSell (aucun lien eBay) ;
 *   · parcours  — le reste se règle dans FillSell (conditions qui EXISTENT chez eBay à choisir,
 *                 lieu d'expédition, activation) : aucun lien eBay ;
 *   · conditions — des conditions de vente n'existent nulle part : (04/11, décision de Nico, remplace le 12/10)
 *                 FillSell les crée sur un clic de la personne (« Créer mes conditions eBay », ebay-account
 *                 proposer_conditions / creer_conditions) — aucun lien eBay.
 *   · a_lire    — (14/11, point 5a de Nico — af37fa49) RIEN de relevé : on ne nomme pas une étape qu'on n'a pas lue.
 *                 Jusqu'au 14/11, « rien de relevé » valait « vendeur » (« finis ton inscription vendeur ») : une cause
 *                 inventée. ebay-api-worker relève désormais le compte avant de parquer (_shared/ebay-releve-compte.ts) ;
 *                 « a_lire » ne reste que si ce relevé a échoué.
 * `manque` (14/11) : les étapes qui manquent, dans l'ordre d'eBay — le message les NOMME (règles de paiement, de
 * retours, de livraison, ville d'expédition), _shared/ebay-compte-a-finir.js.
 */
export type EtapeEbayAFinir = { etape: "plafond" | "vendeur" | "retours" | "parcours" | "conditions" | "a_lire"; url: string | null; manque?: string[] };
// deno-lint-ignore no-explicit-any
export function etapeEbayAFinir(a: any): EtapeEbayAFinir | null {
  if (!a || a.revoked_at != null) return null;
  const e = etatCompteEbay(a);
  if (e.pret) return null;
  const manque = [...e.manquantes];
  if (e.statut === "bloque_par_ebay") return { etape: "plafond", url: LIEN_EBAY_VENDEUR, manque };
  if (e.statut === "inconnu") return { etape: "a_lire", url: null, manque };
  if (e.etapes.inscription_vendeur === "manque") return { etape: "vendeur", url: LIEN_EBAY_VENDEUR, manque };
  if (e.manquantes.length === 1 && e.manquantes[0] === "politique_retours") return { etape: "retours", url: null, manque };
  const aCreerChezEbay = e.manquantes.some((c: string) => c.startsWith("politique_") && !e.aChoisir.includes(c));
  return aCreerChezEbay ? { etape: "conditions", url: null, manque } : { etape: "parcours", url: null, manque };
}

/**
 * Le message « compte à finir » : il NOMME ce qui manque, et le geste est un bouton sous le message (l'écran eBay de
 * FillSell, l'espace vendeur eBay) — (14/11) plus jamais une adresse dans le texte : l'app la retire à l'affichage, et
 * la phrase devenait « C'est ici : — rien n'a été envoyé… » (af37fa49). Textes : _shared/ebay-compte-a-finir.js.
 */
export function messageEbayCompteAFinir(etape: EtapeEbayAFinir | null): string {
  if (!etape) return MESSAGE_EBAY_COMPTE_A_FINIR;
  return texteCompteEbayAFinir(etape, "fr");
}

// ── (14/11, point 5a de Nico — af37fa49) LA RELECTURE BORNÉE D'UN COMPTE QUI A DES PUBLICATIONS PARQUÉES ─────────────
// Les publications « compte à finir » ne repartaient que sur un geste DANS l'app (ebay-account : statut, relevé,
// création des conditions). Fait sur eBay (règles créées sur ebay.fr, inscription finie), rien ne relisait le compte :
// elles attendaient sans fin. ebay-api-worker relit donc le compte d'un compte PARQUÉ, au barème ci-dessous (le temps
// depuis la publication parquée la plus récente) : toutes les 15 min les 2 premières heures, toutes les heures le premier
// jour, toutes les 6 h la première semaine, une fois par jour jusqu'à 30 jours, puis plus jamais (le geste dans l'app
// relit toujours). Un compte sans publication parquée n'est jamais relu ; 3 comptes au plus par passe.
export const RELECTURES_COMPTE_EBAY_PAR_PASSE = 3;
const BAREME_RELECTURE: Array<[number, number]> = [
  [2 * 3600_000, 15 * 60_000],
  [24 * 3600_000, 3600_000],
  [7 * 24 * 3600_000, 6 * 3600_000],
  [30 * 24 * 3600_000, 24 * 3600_000],
];
/** Quand une publication a été parquée « compte à finir » (le parcage du worker, sinon le passage à l'API, sinon sa création). */
// deno-lint-ignore no-explicit-any
export function parqueeLeEbay(j: any): string | null {
  const pf = (j?.platform_fields ?? {}) as Record<string, any>;
  const d = pf.last_diagnostic && typeof pf.last_diagnostic === "object" && pf.last_diagnostic.quoi === "compte_pas_pret" ? pf.last_diagnostic.at : null;
  const r = pf.voie_reroutee && typeof pf.voie_reroutee === "object" && pf.voie_reroutee.compte_pret === false ? pf.voie_reroutee.le : null;
  for (const v of [d, r, j?.created_at]) if (Number.isFinite(Date.parse(String(v ?? "")))) return String(v);
  return null;
}
/** La relecture d'un compte parqué est-elle due ? (pure) — `parqueDepuis` = le parcage le plus RÉCENT du compte. */
export function relectureCompteEbayDue(
  { releveLe, parqueDepuis, maintenant = Date.now() }: { releveLe: string | null | undefined; parqueDepuis: string | null | undefined; maintenant?: number },
): boolean {
  const depuis = Date.parse(String(parqueDepuis ?? ""));
  if (!Number.isFinite(depuis)) return false;
  const age = Math.max(0, maintenant - depuis);
  const palier = BAREME_RELECTURE.find(([borne]) => age < borne);
  if (!palier) return false;
  const lu = Date.parse(String(releveLe ?? ""));
  return !Number.isFinite(lu) || maintenant - lu >= palier[1];
}

/** L'état du compte en UNE lecture : utilisable, et sinon ce qui reste à finir. (service_role) */
// deno-lint-ignore no-explicit-any
export async function etatCompteEbayApi(admin: any, userId: string): Promise<{ usable: boolean; aFinir: EtapeEbayAFinir | null }> {
  try {
    const { data } = await admin
      .from("ebay_accounts")
      .select("revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state")
      .eq("user_id", userId).maybeSingle();
    return { usable: compteEbayApiUsableDepuisLigne(data), aFinir: etapeEbayAFinir(data) };
  } catch {
    return { usable: false, aFinir: null };
  }
}

/** Y a-t-il une connexion API eBay NON révoquée pour ce compte ? (service_role) */
export async function compteEbayApiConnecte(admin: any, userId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ebay_accounts").select("revoked_at").eq("user_id", userId).maybeSingle();
    return !!data && data.revoked_at == null;
  } catch {
    // Lecture impossible : on ne conclut RIEN de « connecté ». Le doute penche
    // vers « pas de connexion » ici, mais l'appelant ne requalifie que sur une
    // signature de mur AVÉRÉE — jamais sur cette seule valeur.
    return false;
  }
}

/**
 * Le compte est-il PRÊT à publier par l'API ? (17/10) LA règle partagée avec
 * l'app (etatCompteEbay, _shared/ebay-etat-compte.js) : relié, 3 politiques
 * RETENUES, étapes vertes, et plafond de vente eBay non nul — zéro en quantité
 * OU en montant, eBay n'autorise pas ce compte à vendre : on parque AVANT tout
 * appel. Le trigger cross_post_jobs_voie_ebay ne décide plus de la préparation
 * depuis le 27/09 (relié = voie API, prêt ou non).
 */
export function compteEbayApiUsableDepuisLigne(a: any): boolean {
  if (!a || a.revoked_at != null) return false;
  return etatCompteEbay(a).pret;
}

export async function compteEbayApiUsable(admin: any, userId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ebay_accounts")
      .select("revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state")
      .eq("user_id", userId).maybeSingle();
    return compteEbayApiUsableDepuisLigne(data);
  } catch {
    return false;
  }
}

/**
 * (19/11, point 2 de Nico — décision : OUI) Une tâche eBay parquée « connexion requise / compte à finir » peut-elle
 * repartir ? Un RETRAIT dès que le compte est relié (non révoqué) : retirer une annonce n'a besoin d'aucune règle de
 * vente, et l'attendre laissait en ligne sur eBay l'annonce d'un article vendu ailleurs (double vente). Une publication
 * ou une republication (action absente = publication) garde l'exigence : le compte PRÊT (3 règles retenues, état
 * vendeur, plafond — etatCompteEbay), sinon elle buterait sur « politiques absentes ». Jamais sans liaison. Pure.
 */
export function rearmementEbayPermis(job: { action?: string | null } | null | undefined, { relie, pret }: { relie: boolean; pret: boolean }): boolean {
  if (!relie) return false;
  if (String(job?.action ?? "publish") === "delete") return true;
  return pret;
}

/**
 * Ré-arme les tâches eBay PARQUÉES (« Connecte ton compte eBay », « compte à finir ») vers la voie API : un retrait dès
 * que le compte est relié, une publication seulement si le compte est utilisable (rearmementEbayPermis, 19/11). Rend le
 * nombre de jobs relancés. Best-effort intégral : jamais bloquant, jamais une exception qui remonte. Idempotent : un
 * compte non relié ne touche rien, un job déjà reparti (sorti de needs_user) n'est plus candidat.
 *
 * ⛔ Garde `.eq('status','needs_user')` sur l'UPDATE : on ne réécrit jamais
 *    par-dessus un job qui aurait bougé entre-temps.
 */
export async function rearmerJobsEbayConnexionSiUtilisable(admin: any, userId: string): Promise<number> {
  try {
    // (19/11) La ligne lue UNE fois : relié (non révoqué) pour un retrait, prêt pour une publication.
    const { data: compte } = await admin
      .from("ebay_accounts")
      .select("revoked_at, fulfillment_policy_id, payment_policy_id, return_policy_id, seller_state")
      .eq("user_id", userId).maybeSingle();
    const relie = !!compte && compte.revoked_at == null;
    if (!relie) return 0;
    const pret = compteEbayApiUsableDepuisLigne(compte);
    const { data: jobs } = await admin
      .from("cross_post_jobs")
      .select("id, action, platform_fields")
      .eq("user_id", userId)
      .eq("platform", "ebay")
      .eq("status", "needs_user")
      .limit(200);
    let n = 0;
    for (const j of (jobs ?? [])) {
      const pf0 = (j.platform_fields ?? {}) as Record<string, unknown>;
      if (!SOURCES_EBAY_REARMABLES.includes(String(pf0["needs_user_source"] ?? ""))) continue;
      if (!rearmementEbayPermis(j, { relie, pret })) continue;
      const pf = { ...pf0 };
      delete pf["needs_user_source"]; delete pf["next_action_after"];
      delete pf["needsUserAttempts"]; delete pf["needsUserBoucle"];
      delete pf["needs_user_tick_le"]; delete pf["needs_user_actif_ms"];
      delete pf["needs_user_vu_le"]; delete pf["needs_user_vu_erreur"];
      delete pf["processing_since"];
      pf["ebay_connexion_resolue_le"] = new Date().toISOString();
      const { data: maj } = await admin
        .from("cross_post_jobs")
        .update({ status: "pending", voie: "api", error: null, platform_fields: pf })
        .eq("id", j.id).eq("status", "needs_user").select("id");
      if (maj?.length) n++;
    }
    if (n) console.log(`[ebay-voie] ${n} tâche(s) eBay ré-armée(s) en voie API pour ${userId} (${pret ? "compte prêt" : "compte relié : retraits seulement"})`);
    return n;
  } catch (e) {
    console.warn("[ebay-voie] ré-armement eBay non abouti :", (e as Error)?.message ?? e);
    return 0;
  }
}
