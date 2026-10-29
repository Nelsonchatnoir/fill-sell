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
// qu'eBay rend pour le site. Ce module la lit, la met en cache une heure par
// isolat, et sert à VALIDER le code d'un mode de l'app AVANT de le poser dans
// une politique : un code absent ou non valide pour la vente est refusé ici,
// avec la liste, plutôt que par un « LSAS » opaque côté eBay.
//
// ── (29/10/2026) LA SOURCE : API Metadata, plus GeteBayDetails ─────────────
// eBay retire GeteBayDetails (Trading) le 15/03/2027 (page « API Deprecation
// Status », dépréciée le 21/09/2026) ; son remplaçant est la méthode
// getShippingServices de l'API Metadata (spec v1.13.0) :
//   GET /sell/metadata/v1/shipping/marketplace/EBAY_FR/get_shipping_services
//   jeton APPLICATIF (client_credentials, scope api_scope — déjà utilisé pour
//   Browse : _shared/ebay-app-token.ts) : la liste est celle du marketplace,
//   pas d'un vendeur ; aucun vendeur n'a à se reconnecter.
// Les champs lus sont les mêmes (code texte, libellé, transporteur, catégorie,
// valide pour la vente, international, délais) ; le numéro ShippingServiceID
// n'existe plus — FillSell n'a jamais lu que le CODE texte, qui fait foi des
// deux côtés. Un service déprécié n'est plus rendu du tout (guide de migration
// eBay) : `deprecie` reste false et le filtre reste juste.
// REPLI : si Metadata échoue, la liste vient de GeteBayDetails (jeton du
// vendeur) tant qu'eBay le sert — journalisé « [ebay-shipping] repli ». Les
// publications ne lisent jamais cette liste (elles portent la politique déjà
// posée) : un échec ici ne touche que l'écran « Modes d'envoi » des Réglages.
// ═══════════════════════════════════════════════════════════════════════════
import { hotes, type EbayEnv } from "./ebay-oauth.ts";
import { obtenirJetonApplicatif } from "./ebay-app-token.ts";

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

const cache = new Map<string, { services: ServiceLivraison[]; exp: number; source: SourceServices }>();

// Site Trading → marketplace des API REST. Le seul site du chantier est la France.
const MARCHE_PAR_SITE: Record<string, string> = { "71": "EBAY_FR" };

// Date de retrait de GeteBayDetails annoncée par eBay : passé ce jour, plus de repli ni de comparaison.
export const RETRAIT_GETEBAYDETAILS = Date.parse("2027-03-15T00:00:00Z");

export type SourceServices = "metadata" | "trading";

export interface DependancesServices {
  fetch?: typeof fetch;
  jetonApplicatif?: (env: EbayEnv) => Promise<string>;
  journal?: (ligne: string) => void;
  maintenant?: () => number;
}

function champ(bloc: string, balise: string): string {
  const m = bloc.match(new RegExp(`<${balise}>([^<]*)</${balise}>`));
  return m ? m[1].replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";
}

const entierOuNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const vrai = (v: unknown): boolean => v === true || v === "true";

// La liste du marketplace, par l'API Metadata (getShippingServices, jeton applicatif).
export async function lireServicesMetadata(env: EbayEnv, siteId = SITE_FR, d: DependancesServices = {}): Promise<ServiceLivraison[]> {
  const marche = MARCHE_PAR_SITE[siteId];
  if (!marche) throw new Error(`getShippingServices : site ${siteId} sans marketplace connu`);
  const jeton = await (d.jetonApplicatif ?? obtenirJetonApplicatif)(env);
  const r = await (d.fetch ?? fetch)(`${hotes(env).api}/sell/metadata/v1/shipping/marketplace/${marche}/get_shipping_services`, {
    headers: { Authorization: `Bearer ${jeton}`, Accept: "application/json", "Accept-Language": "fr-FR" },
  });
  const texte = await r.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(texte); } catch { json = null; }
  if (!r.ok) {
    const e = (json?.errors as Array<Record<string, unknown>> | undefined)?.[0];
    throw new Error(`getShippingServices refusé : ${String(e?.longMessage ?? e?.message ?? `HTTP ${r.status}`).slice(0, 200)}`);
  }
  const liste = Array.isArray(json?.shippingServices) ? json!.shippingServices as Array<Record<string, unknown>> : [];
  const services: ServiceLivraison[] = liste.map((s) => ({
    code: String(s.shippingService ?? ""),
    libelle: String(s.description ?? ""),
    transporteur: String(s.shippingCarrier ?? ""),
    categorie: String(s.shippingCategory ?? ""),
    valide: vrai(s.validForSellingFlow),
    international: vrai(s.internationalService),
    delaiMin: entierOuNull(s.minShippingTime),
    delaiMax: entierOuNull(s.maxShippingTime),
    // Un service déprécié n'est plus rendu par getShippingServices (guide de migration eBay).
    deprecie: false,
  })).filter((s) => s.code);
  if (!services.length) throw new Error("getShippingServices : aucun service de livraison rendu");
  return services;
}

// Les services PROPOSABLES (valides, domestiques, non dépréciés), réduits à ce que l'écran et la politique lisent.
function proposables(services: ServiceLivraison[]) {
  return new Map(services.filter((s) => s.valide && !s.international && !s.deprecie)
    .map((s) => [s.code, { libelle: s.libelle, transporteur: s.transporteur.trim().toUpperCase(), categorie: s.categorie, delaiMin: s.delaiMin, delaiMax: s.delaiMax }]));
}

// Comparaison des deux sources sur ce que FillSell lit : codes proposables et, pour chacun, libellé, transporteur,
// catégorie et délais. Sert la bascule (journal) et sa preuve sur des cas réels.
export function comparerSourcesServices(metadata: ServiceLivraison[], trading: ServiceLivraison[]) {
  const a = proposables(metadata), b = proposables(trading);
  const seulementMetadata = [...a.keys()].filter((c) => !b.has(c)).sort();
  const seulementTrading = [...b.keys()].filter((c) => !a.has(c)).sort();
  const differents: Array<{ code: string; champ: string; metadata: unknown; trading: unknown }> = [];
  for (const [code, x] of a) {
    const y = b.get(code);
    if (!y) continue;
    for (const k of ["libelle", "transporteur", "categorie", "delaiMin", "delaiMax"] as const) {
      if (x[k] !== y[k]) differents.push({ code, champ: k, metadata: x[k], trading: y[k] });
    }
  }
  return {
    identiques: seulementMetadata.length === 0 && seulementTrading.length === 0 && differents.length === 0,
    proposables_metadata: a.size, proposables_trading: b.size,
    seulementMetadata, seulementTrading, differents,
  };
}

/** Les modes d'envoi du site, et d'où ils viennent (`metadata`, ou `trading` en repli). */
export async function listerServicesLivraisonAvecSource(env: EbayEnv, token: string, siteId = SITE_FR, d: DependancesServices = {}):
  Promise<{ services: ServiceLivraison[]; source: SourceServices }> {
  const maintenant = (d.maintenant ?? Date.now)();
  const journal = d.journal ?? ((l: string) => console.log(l));
  const cle = `${env}:${siteId}`;
  const enCache = cache.get(cle);
  if (enCache && enCache.exp > maintenant) return { services: enCache.services, source: enCache.source };

  let services: ServiceLivraison[];
  let source: SourceServices = "metadata";
  try {
    services = await lireServicesMetadata(env, siteId, d);
  } catch (e) {
    const motif = String((e as Error)?.message ?? e);
    if (maintenant >= RETRAIT_GETEBAYDETAILS) throw new Error(`modes d'envoi illisibles chez eBay : ${motif}`);
    journal(`[ebay-shipping] repli GeteBayDetails (Trading, retiré par eBay le 15/03/2027) — Metadata getShippingServices a échoué : ${motif}`);
    try {
      services = await lireServicesTrading(env, token, siteId, d);
      source = "trading";
    } catch (e2) {
      throw new Error(`modes d'envoi illisibles chez eBay — Metadata : ${motif} ; GeteBayDetails : ${String((e2 as Error)?.message ?? e2)}`);
    }
  }
  // Tant que GeteBayDetails vit, la liste Metadata est COMPARÉE à l'ancienne une fois par remplissage du cache (une
  // heure par isolat) et l'écart journalisé : une divergence d'eBay entre les deux se voit avant le retrait.
  if (source === "metadata" && token && maintenant < RETRAIT_GETEBAYDETAILS) {
    try {
      const ancienne = await lireServicesTrading(env, token, siteId, d);
      const c = comparerSourcesServices(services, ancienne);
      // Écrit EN ENTIER, par morceaux (une ligne de journal coupe vers 2 000 caractères) ; une divergence écrit aussi
      // les deux listes, une ligne compacte par service (code|catégorie|transporteur|valide|international|délais).
      const morceaux = (etiquette: string, texte: string) => {
        for (let i = 0, n = 1; i < texte.length; i += 1500, n++) journal(`[ebay-shipping] ${etiquette} [${n}/${Math.ceil(texte.length / 1500)}] ${texte.slice(i, i + 1500)}`);
      };
      morceaux(`comparaison Metadata/GeteBayDetails ${c.identiques ? "IDENTIQUES" : "DIFFÉRENTES"}`, JSON.stringify(c));
      if (!c.identiques) {
        const compact = (l: ServiceLivraison[]) => l.map((s) => `${s.code}|${s.categorie}|${s.transporteur}|${s.valide ? 1 : 0}|${s.international ? 1 : 0}|${s.delaiMin ?? ""}-${s.delaiMax ?? ""}`).join(" ");
        morceaux("liste Metadata", compact(services));
        morceaux("liste GeteBayDetails", compact(ancienne));
      }
    } catch (e) {
      journal(`[ebay-shipping] comparaison impossible (GeteBayDetails) : ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
  }
  cache.set(cle, { services, exp: maintenant + 60 * 60 * 1000, source });
  return { services, source };
}

export async function listerServicesLivraison(env: EbayEnv, token: string, siteId = SITE_FR, d: DependancesServices = {}): Promise<ServiceLivraison[]> {
  return (await listerServicesLivraisonAvecSource(env, token, siteId, d)).services;
}

/** Pour le selftest : le cache d'isolat se vide. */
export function _viderCacheServices() { cache.clear(); }

// L'ANCIENNE source (Trading GeteBayDetails, jeton du vendeur) — repli et comparaison jusqu'au 15/03/2027.
export async function lireServicesTrading(env: EbayEnv, token: string, siteId = SITE_FR, d: DependancesServices = {}): Promise<ServiceLivraison[]> {
  const r = await (d.fetch ?? fetch)(`${hotes(env).api}/ws/api.dll`, {
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
// chaque service (getShippingServices de l'API Metadata depuis le 29/10/2026,
// GeteBayDetails avant), et rien d'autre.
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
