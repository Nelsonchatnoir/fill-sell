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
