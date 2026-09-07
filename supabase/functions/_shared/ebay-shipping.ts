// ═══════════════════════════════════════════════════════════════════════════
// eBay — services de livraison VALIDES pour un site, demandés à eBay (06/09/2026)
//
// Le 06/09, la création d'une politique de livraison depuis l'app a été
// refusée : « Échec de la validation LSAS. : FR_Colissimo ». Le code avait
// été écrit en dur, et il n'existe pas : eBay FR appelle son Colissimo
// FR_ColiposteColissimo. Relevé complet dans docs/ebay-shipping-services-fr.md
// (GeteBayDetails, DetailVersion 283, compte de Nico).
//
// RÈGLE : un shippingServiceCode ne se devine pas, il se lit dans la liste
// qu'eBay rend pour le site (Trading API GeteBayDetails,
// DetailName=ShippingServiceDetails, jeton OAuth du vendeur en
// X-EBAY-API-IAF-TOKEN). Ce module la lit, la met en cache une heure par
// isolat, et sert à VALIDER le code d'un mode de l'app AVANT de le poser dans
// une politique : un code absent ou non valide pour la vente est refusé ici,
// avec la liste, plutôt que par un « LSAS » opaque côté eBay.
// ═══════════════════════════════════════════════════════════════════════════
import { hotes, type EbayEnv } from "./ebay-oauth.ts";

export interface ServiceLivraison {
  code: string;
  libelle: string;
  transporteur: string;
  categorie: string;        // STANDARD, EXPRESS, ECONOMY, POINT_TO_POINT, PICKUP, OTHER, …
  valide: boolean;          // ValidForSellingFlow
  international: boolean;   // InternationalService
  delaiMin: number | null;
  delaiMax: number | null;
  deprecie: boolean;
}

// Site eBay France (Trading X-EBAY-API-SITEID) — le seul marketplace du chantier.
export const SITE_FR = "71";

// Modes proposés par l'app → code eBay, RELEVÉS le 06/09 dans la liste
// GeteBayDetails du site 71 (docs/ebay-shipping-services-fr.md), jamais
// devinés. Ils sont re-validés contre la liste vivante à chaque création.
//   colissimo   → FR_ColiposteColissimo  (« Colissimo », STANDARD, 1-2 j)
//   main_propre → FR_RemiseEnMainPropre  (« Remise en mains propres », PICKUP)
export const MODES_LIVRAISON: Record<string, { code: string; libelle: string }> = {
  colissimo: { code: "FR_ColiposteColissimo", libelle: "Colissimo" },
  main_propre: { code: "FR_RemiseEnMainPropre", libelle: "Remise en mains propres" },
};

const cache = new Map<string, { services: ServiceLivraison[]; exp: number }>();

function champ(bloc: string, balise: string): string {
  const m = bloc.match(new RegExp(`<${balise}>([^<]*)</${balise}>`));
  return m ? m[1].replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";
}

export async function listerServicesLivraison(env: EbayEnv, token: string, siteId = SITE_FR): Promise<ServiceLivraison[]> {
  const cle = `${env}:${siteId}`;
  const enCache = cache.get(cle);
  if (enCache && enCache.exp > Date.now()) return enCache.services;

  const r = await fetch(`${hotes(env).api}/ws/api.dll`, {
    method: "POST",
    headers: {
      "X-EBAY-API-IAF-TOKEN": token,
      "X-EBAY-API-CALL-NAME": "GeteBayDetails",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      "Content-Type": "text/xml",
    },
    body: '<?xml version="1.0" encoding="utf-8"?><GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailName>ShippingServiceDetails</DetailName></GeteBayDetailsRequest>',
  });
  const xml = await r.text();
  if (!r.ok || !/<Ack>(Success|Warning)<\/Ack>/.test(xml)) {
    const motif = champ(xml, "LongMessage") || champ(xml, "ShortMessage") || `HTTP ${r.status}`;
    throw new Error(`GeteBayDetails refusé : ${motif}`);
  }
  const blocs = xml.match(/<ShippingServiceDetails>[\s\S]*?<\/ShippingServiceDetails>/g) ?? [];
  const services: ServiceLivraison[] = blocs.map((b) => ({
    code: champ(b, "ShippingService"),
    libelle: champ(b, "Description"),
    transporteur: champ(b, "ShippingCarrier"),
    categorie: champ(b, "ShippingCategory"),
    valide: champ(b, "ValidForSellingFlow") === "true",
    international: champ(b, "InternationalService") === "true",
    delaiMin: champ(b, "ShippingTimeMin") ? Number(champ(b, "ShippingTimeMin")) : null,
    delaiMax: champ(b, "ShippingTimeMax") ? Number(champ(b, "ShippingTimeMax")) : null,
    deprecie: /<DeprecationDetails>/.test(b),
  })).filter((s) => s.code);
  if (!services.length) throw new Error("GeteBayDetails : aucun service de livraison rendu");
  cache.set(cle, { services, exp: Date.now() + 60 * 60 * 1000 });
  return services;
}

// Le code d'un mode de l'app, s'il est ENCORE valide pour la vente domestique
// selon eBay ; sinon null (l'appelant explique avec la liste).
export function resoudreServiceLivraison(mode: string, services: ServiceLivraison[]): ServiceLivraison | null {
  const attendu = MODES_LIVRAISON[mode];
  if (!attendu) return null;
  const s = services.find((x) => x.code === attendu.code);
  return s && s.valide && !s.international && !s.deprecie ? s : null;
}

// Aperçu lisible des services domestiques valides — pour un message d'erreur
// qui dit ce qu'eBay accepte, au lieu d'un « LSAS ».
export function resumerServicesDomestiques(services: ServiceLivraison[], max = 12): string {
  return services
    .filter((s) => s.valide && !s.international && !s.deprecie)
    .slice(0, max)
    .map((s) => `${s.code} (${s.libelle})`)
    .join(", ");
}

// ═══════════════════════════════════════════════════════════════════════════
// LOT « TRANSPORTEURS » (07/09/2026) — regrouper la liste VIVANTE pour un
// vendeur, sans table de codes écrite en dur.
//
// Le classement n'invente rien : il se lit dans les champs qu'eBay rend pour
// chaque service (GeteBayDetails), et rien d'autre.
//   · ShippingCategory = PICKUP          → remise en main propre
//   · ShippingCategory = POINT_TO_POINT  → point relais (Mondial Relay,
//                                          Shop2Shop, Chrono Relais, DPD Relais)
//   · ShippingCarrier  = LAPOSTE         → courrier (Lettre Suivie, Lettre
//                                          recommandée, Lettre Verte)
//   · ShippingCategory = STANDARD/EXPRESS → à domicile (Colissimo, Colissimo
//                                          Recommandé, GLS, UPS, Chronopost…)
//   · tout le reste (OTHER, …_FROM_OUTSIDE) → PAS proposé : ce sont les
//     SpeedPAK, les livraisons depuis l'étranger, les DOM-TOM, Convelio, le
//     contre-remboursement — rien qu'un vendeur particulier français choisit
//     pour expédier un colis.
// Les services non valides pour la vente sont déjà écartés en amont : c'est
// ainsi que FR_LivraisonEnLockerMondialRelay (ValidForSellingFlow = false)
// n'apparaît JAMAIS à l'écran, sans avoir à le nommer.
// ═══════════════════════════════════════════════════════════════════════════

// Plafond eBay, cité de la spec Account API (sell_account_v1_oas3, ShippingOption) :
// « Sellers can specify up to four domestic shipping services and up to five
// international shipping service options ». On le dit à l'écran plutôt que de
// laisser le vendeur se faire refuser.
export const PLAFOND_SERVICES_DOMESTIQUES = 4;

export type FamilleLivraison = "point_relais" | "domicile" | "courrier" | "main_propre";

export const ORDRE_FAMILLES: FamilleLivraison[] = ["point_relais", "domicile", "courrier", "main_propre"];

export function familleService(s: ServiceLivraison): FamilleLivraison | null {
  if (s.categorie === "PICKUP") return "main_propre";
  if (s.categorie === "POINT_TO_POINT") return "point_relais";
  if (s.transporteur.trim().toUpperCase() === "LAPOSTE") return "courrier";
  if (s.categorie === "STANDARD" || s.categorie === "EXPRESS") return "domicile";
  return null;
}

// ORDRE D'AFFICHAGE SEULEMENT — ne filtre RIEN. Les services connus des
// vendeurs remontent en tête de leur famille ; tous les autres services que
// la liste vivante rend restent affichés, à la suite. Un code absent d'ici
// n'est pas écarté ; un code présent ici mais absent de la liste d'eBay
// n'apparaît pas.
const FREQUENTS = [
  "FR_LivraisonEnRelaisMondialRelay", "FR_Shop2Shop", "FR_ChronopostChronoRelais", "FR_DpdRelais",
  "FR_ColiposteColissimo", "FR_ColiposteColissimoRecommended", "FR_Chronopost", "FR_GLSStandard", "FR_UPSStandard",
  "FR_PostOfficeLetterFollowed", "FR_PostOfficeLetterRecommended", "FR_Ecopli",
  "FR_RemiseEnMainPropre",
];

export interface ServicePropose {
  code: string;
  libelle: string;
  transporteur: string;
  categorie: string;
  delaiMin: number | null;
  delaiMax: number | null;
  gratuitParNature: boolean;   // PICKUP : eBay ne veut pas de prix dessus
}

export interface FamilleProposee { cle: FamilleLivraison; services: ServicePropose[] }

// Les services domestiques VALIDES, non dépréciés, groupés. Rien d'autre.
export function grouperServicesDomestiques(services: ServiceLivraison[]): FamilleProposee[] {
  const retenus = services.filter((s) => s.valide && !s.international && !s.deprecie);
  const rang = (code: string) => {
    const i = FREQUENTS.indexOf(code);
    return i === -1 ? FREQUENTS.length : i;
  };
  return ORDRE_FAMILLES.map((cle) => ({
    cle,
    services: retenus
      .filter((s) => familleService(s) === cle)
      .sort((a, b) => rang(a.code) - rang(b.code)
        || (a.delaiMax ?? 99) - (b.delaiMax ?? 99)
        || a.libelle.localeCompare(b.libelle, "fr"))
      .map((s) => ({
        code: s.code,
        libelle: s.libelle,
        transporteur: s.transporteur,
        categorie: s.categorie,
        delaiMin: s.delaiMin,
        delaiMax: s.delaiMax,
        gratuitParNature: s.categorie === "PICKUP",
      })),
  })).filter((f) => f.services.length > 0);
}

// Un code demandé par l'écran, s'il est ENCORE proposable : présent dans la
// liste vivante, valide pour la vente, domestique, non déprécié. Sinon null —
// l'appelant dit pourquoi, avec la liste. Un code ne se devine jamais
// (« FR_Colissimo » n'existe pas : refus LSAS du 06/09).
export function resoudreCodeService(code: string, services: ServiceLivraison[]): ServiceLivraison | null {
  const s = services.find((x) => x.code === code);
  return s && s.valide && !s.international && !s.deprecie ? s : null;
}
