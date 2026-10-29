// Selftest : les modes d'envoi eBay viennent de l'API Metadata (getShippingServices), plus de GeteBayDetails
// (retiré par eBay le 15/03/2027) — repli propre et journalisé (29/10/2026, lot A point 2).
//   deno run --allow-read --allow-env scripts/ebay-modes-envoi-metadata-selftest.ts
//
// Ce qu'il verrouille, en exécutant le VRAI module (_shared/ebay-shipping.ts, fetch et jeton simulés) :
//   1. la lecture Metadata : URL du marketplace EBAY_FR, jeton APPLICATIF, champs lus un à un (code texte, libellé,
//      transporteur, catégorie, valide pour la vente, international, délais) ;
//   2. le repli : Metadata en échec → GeteBayDetails, journalisé « [ebay-shipping] repli » ; les deux en échec →
//      une erreur qui dit les deux motifs ; après le 15/03/2027, plus de repli ;
//   3. la comparaison des deux sources (journal de bascule) : identiques, puis un code manquant et un libellé changé ;
//   4. le reste du module inchangé sur la nouvelle source (résolution d'un mode, familles) ; le cache d'une heure ;
//   5. les listes RÉELLES du 29/10 (fixtures/ebay-modes-envoi-fr-2910.json) : même écran, mêmes codes ;
//   6. le câblage : ebay-account sert la source à l'écran « Modes d'envoi ».
import {
  _viderCacheServices, comparerSourcesServices, grouperServicesDomestiques, listerServicesLivraisonAvecSource,
  resoudreServiceLivraison, RETRAIT_GETEBAYDETAILS, type ServiceLivraison,
} from "../supabase/functions/_shared/ebay-shipping.ts";

let ko = 0;
const ok = (c: boolean, m: string, d?: unknown) => {
  if (c) console.log(`  ✓ ${m}`);
  else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 400)}` : ""}`); }
};

// La réponse Metadata, forme de la spec v1.13.0 (getShippingServices) ; codes, transporteurs et catégories du relevé
// FR du 06/09 (docs/ebay-shipping-services-fr.md : Colissimo et la remise en main propre sans transporteur).
const META = {
  shippingServices: [
    { shippingService: "FR_ColiposteColissimo", description: "Colissimo", shippingCarrier: "", shippingCategory: "STANDARD",
      validForSellingFlow: true, internationalService: false, minShippingTime: 1, maxShippingTime: 2, shippingCostTypes: ["FLAT"] },
    { shippingService: "FR_RemiseEnMainPropre", description: "Remise en mains propres", shippingCarrier: "", shippingCategory: "PICKUP",
      validForSellingFlow: true, internationalService: false, shippingCostTypes: ["NOT_SPECIFIED"] },
    { shippingService: "FR_LivraisonEnRelaisMondialRelay", description: "Mondial Relay", shippingCarrier: "MondialRelay",
      shippingCategory: "POINT_TO_POINT", validForSellingFlow: true, internationalService: false, minShippingTime: 3, maxShippingTime: 5 },
    { shippingService: "FR_LivraisonEnLockerMondialRelay", description: "Locker Mondial Relay", shippingCarrier: "MondialRelay",
      shippingCategory: "POINT_TO_POINT", validForSellingFlow: false, internationalService: false },
    { shippingService: "FR_IT_Colissimo", description: "Colissimo International", shippingCarrier: "LAPOSTE", shippingCategory: "STANDARD",
      validForSellingFlow: true, internationalService: true },
  ],
};
const bloc = (s: Record<string, unknown>) => `<ShippingServiceDetails><Description>${s.description}</Description>`
  + `${s.internationalService ? "<InternationalService>true</InternationalService>" : ""}<ShippingService>${s.shippingService}</ShippingService>`
  + `<ShippingServiceID>${Math.floor(Math.random() * 90000)}</ShippingServiceID>`
  + `${s.minShippingTime != null ? `<ShippingTimeMax>${s.maxShippingTime}</ShippingTimeMax><ShippingTimeMin>${s.minShippingTime}</ShippingTimeMin>` : ""}`
  + `<ValidForSellingFlow>${s.validForSellingFlow ? "true" : "false"}</ValidForSellingFlow><ShippingCategory>${s.shippingCategory}</ShippingCategory>`
  + `<ShippingCarrier>${s.shippingCarrier}</ShippingCarrier><DetailVersion>283</DetailVersion></ShippingServiceDetails>`;
const XML = (services: Array<Record<string, unknown>>) =>
  `<?xml version="1.0"?><GeteBayDetailsResponse><Ack>Success</Ack>${services.map(bloc).join("")}</GeteBayDetailsResponse>`;

function banc({ meta = { status: 200, corps: JSON.stringify(META) }, trading = { status: 200, corps: XML(META.shippingServices) }, maintenant = Date.parse("2026-10-29T15:00:00Z") } = {}) {
  const appels: Array<{ url: string; init?: RequestInit }> = [];
  const journal: string[] = [];
  const jetons: string[] = [];
  const fetchSimule = (async (url: string | URL, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    const r = String(url).includes("/ws/api.dll") ? trading : meta;
    return new Response(r.corps, { status: r.status });
  }) as typeof fetch;
  _viderCacheServices();
  return {
    appels, journal, jetons,
    d: { fetch: fetchSimule, jetonApplicatif: async () => { jetons.push("app"); return "JETON_APP"; }, journal: (l: string) => journal.push(l), maintenant: () => maintenant },
  };
}

console.log("1. La lecture Metadata");
{
  const b = banc();
  const { services, source } = await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  const meta = b.appels[0];
  ok(source === "metadata", "source : metadata");
  ok(meta.url === "https://api.ebay.com/sell/metadata/v1/shipping/marketplace/EBAY_FR/get_shipping_services", `URL du marketplace EBAY_FR (${meta.url})`);
  const h = new Headers(meta.init?.headers);
  ok(h.get("Authorization") === "Bearer JETON_APP" && b.jetons.length === 1, "jeton APPLICATIF (client_credentials), jamais celui du vendeur");
  const colissimo = services.find((s) => s.code === "FR_ColiposteColissimo")!;
  ok(colissimo.libelle === "Colissimo" && colissimo.transporteur === "" && colissimo.categorie === "STANDARD"
    && colissimo.valide === true && colissimo.international === false && colissimo.delaiMin === 1 && colissimo.delaiMax === 2 && colissimo.deprecie === false,
    "Colissimo : code, libellé, transporteur, catégorie, valide, domestique, délais 1-2 j", colissimo);
  const main = services.find((s) => s.code === "FR_RemiseEnMainPropre")!;
  ok(main.delaiMin === null && main.delaiMax === null, "délais absents → null (jamais 0)");
  ok(services.find((s) => s.code === "FR_LivraisonEnLockerMondialRelay")?.valide === false, "validForSellingFlow false → non valide (le locker n'apparaît jamais)");
  ok(services.find((s) => s.code === "FR_IT_Colissimo")?.international === true, "internationalService true → international");
  const avant = b.appels.length;
  await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  ok(b.appels.length === avant, "cache d'une heure : le second appel ne touche pas eBay");
}

console.log("2. Le repli, journalisé");
{
  const b = banc({ meta: { status: 500, corps: JSON.stringify({ errors: [{ errorId: 2003, longMessage: "Internal error" }] }) } });
  const { services, source } = await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  ok(source === "trading" && services.some((s) => s.code === "FR_ColiposteColissimo"), "Metadata en échec → liste de GeteBayDetails");
  ok(b.journal.some((l) => /^\[ebay-shipping\] repli GeteBayDetails .*Internal error/.test(l)), "le repli est journalisé avec le motif d'eBay", b.journal);
  const t = b.appels.find((a) => a.url.endsWith("/ws/api.dll"));
  ok(new Headers(t?.init?.headers).get("X-EBAY-API-IAF-TOKEN") === "JETON_VENDEUR", "le repli lit avec le jeton du vendeur (comme avant)");
}
{
  const b = banc({ meta: { status: 401, corps: "{}" }, trading: { status: 200, corps: "<GeteBayDetailsResponse><Ack>Failure</Ack><LongMessage>Call retired</LongMessage></GeteBayDetailsResponse>" } });
  let e: Error | null = null;
  try { await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d); } catch (x) { e = x as Error; }
  ok(!!e && /Metadata : getShippingServices refusé : HTTP 401/.test(e.message) && /GeteBayDetails : GeteBayDetails refusé : Call retired/.test(e.message),
    "les deux en échec → une erreur qui dit les deux motifs (l'écran l'affiche, aucune liste inventée)", e?.message);
}
{
  const b = banc({ meta: { status: 503, corps: "{}" }, maintenant: RETRAIT_GETEBAYDETAILS + 1000 });
  let e: Error | null = null;
  try { await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d); } catch (x) { e = x as Error; }
  ok(!!e && !b.appels.some((a) => a.url.endsWith("/ws/api.dll")), "après le 15/03/2027 : plus aucun appel GeteBayDetails");
}

console.log("3. La comparaison des deux sources");
{
  const b = banc();
  await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  ok(b.journal.some((l) => /comparaison Metadata\/GeteBayDetails IDENTIQUES/.test(l)), "mêmes services → journal « IDENTIQUES »", b.journal);
  const m = META.shippingServices.map((s) => ({ ...s }));
  m[0].description = "Colissimo (domicile)";
  const sansMondial = m.filter((s) => s.shippingService !== "FR_LivraisonEnRelaisMondialRelay");
  const lireMeta = (l: Array<Record<string, unknown>>): ServiceLivraison[] => l.map((s) => ({
    code: String(s.shippingService), libelle: String(s.description), transporteur: String(s.shippingCarrier), categorie: String(s.shippingCategory),
    valide: !!s.validForSellingFlow, international: !!s.internationalService, delaiMin: (s.minShippingTime as number) ?? null, delaiMax: (s.maxShippingTime as number) ?? null, deprecie: false,
  }));
  const c = comparerSourcesServices(lireMeta(sansMondial), lireMeta(META.shippingServices));
  ok(!c.identiques && c.seulementTrading.join() === "FR_LivraisonEnRelaisMondialRelay" && c.differents.length === 1
    && c.differents[0].code === "FR_ColiposteColissimo" && c.differents[0].champ === "libelle", "un code manquant et un libellé changé sont nommés", c);
}

console.log("4. Le reste du module sur la nouvelle source");
{
  const b = banc();
  const { services } = await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  ok(resoudreServiceLivraison("colissimo", services)?.code === "FR_ColiposteColissimo" && resoudreServiceLivraison("main_propre", services)?.code === "FR_RemiseEnMainPropre",
    "les modes de l'app se résolvent (Colissimo, remise en main propre)");
  const familles = grouperServicesDomestiques(services).map((f) => `${f.cle}:${f.services.map((s) => s.code).join("+")}`);
  ok(familles.join(" ") === "point_relais:FR_LivraisonEnRelaisMondialRelay domicile:FR_ColiposteColissimo main_propre:FR_RemiseEnMainPropre",
    `familles de l'écran : point relais, domicile, main propre — ni locker, ni international (${familles.join(" ")})`);
}

console.log("5. Les listes RÉELLES d'eBay FR du 29/10 (compte de Nico) : même écran, mêmes codes");
{
  // scripts/fixtures/ebay-modes-envoi-fr-2910.json : les deux listes journalisées en production le 29/10 à 16:19.
  const fx = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/ebay-modes-envoi-fr-2910.json", import.meta.url)));
  const lire = (l: string) => {
    const [code, cat, transp, valide, intl, delais] = l.split("|");
    const [min, max] = delais.split("-");
    return { code, cat, transp, valide: valide === "1", intl: intl === "1", min: min === "" ? null : Number(min), max: max === "" ? null : Number(max) };
  };
  const meta = { shippingServices: fx.metadata.map(lire).map((s: ReturnType<typeof lire>) => ({
    shippingService: s.code, description: s.code, shippingCarrier: s.transp, shippingCategory: s.cat,
    validForSellingFlow: s.valide, internationalService: s.intl, ...(s.min != null ? { minShippingTime: s.min } : {}), ...(s.max != null ? { maxShippingTime: s.max } : {}),
  })) };
  const xml = `<?xml version="1.0"?><GeteBayDetailsResponse><Ack>Success</Ack>${fx.trading.map(lire).map((s: ReturnType<typeof lire>) =>
    `<ShippingServiceDetails><Description>${s.code}</Description>${s.intl ? "<InternationalService>true</InternationalService>" : ""}`
    + `<ShippingService>${s.code}</ShippingService>${s.min != null ? `<ShippingTimeMax>${s.max}</ShippingTimeMax><ShippingTimeMin>${s.min}</ShippingTimeMin>` : ""}`
    + `<ValidForSellingFlow>${s.valide}</ValidForSellingFlow><ShippingCategory>${s.cat}</ShippingCategory>${s.transp ? `<ShippingCarrier>${s.transp}</ShippingCarrier>` : ""}`
    + `</ShippingServiceDetails>`).join("")}</GeteBayDetailsResponse>`;
  const b = banc({ meta: { status: 200, corps: JSON.stringify(meta) }, trading: { status: 200, corps: xml } });
  const { services, source } = await listerServicesLivraisonAvecSource("production", "JETON_VENDEUR", "71", b.d);
  const ligne = b.journal.find((l) => /comparaison Metadata\/GeteBayDetails/.test(l)) ?? "";
  ok(source === "metadata" && /IDENTIQUES/.test(ligne), "comparaison des listes réelles : IDENTIQUES (codes affichés, famille, délais)", ligne.slice(0, 600));
  const { lireServicesTrading } = await import("../supabase/functions/_shared/ebay-shipping.ts");
  const ancienne = await lireServicesTrading("production", "JETON_VENDEUR", "71", b.d);
  const ecran = (l: ServiceLivraison[]) => grouperServicesDomestiques(l).map((f) => `${f.cle}: ${f.services.map((s) => s.code).join(", ")}`).join(" | ");
  ok(ecran(services) === ecran(ancienne), `l'écran « Modes d'envoi » est le même, famille par famille, dans le même ordre (${ecran(services)})`,
    { metadata: ecran(services), trading: ecran(ancienne) });
  const courrier = grouperServicesDomestiques(services).find((f) => f.cle === "courrier")?.services.map((s) => s.code) ?? [];
  ok(["FR_PostOfficeLetterFollowed", "FR_PostOfficeLetterRecommended", "FR_Ecopli"].every((c) => courrier.includes(c)),
    "« LA_POSTE » de Metadata lu « LAPOSTE » : Lettre Suivie, Lettre recommandée et Ecopli restent dans « courrier »");
  const domicile = grouperServicesDomestiques(services).find((f) => f.cle === "domicile")?.services.map((s) => s.code) ?? [];
  ok(domicile.includes("FR_Chrono13"), "Chrono13 (EXPEDITED chez Metadata, EXPRESS avant) reste « à domicile »");
  ok(!grouperServicesDomestiques(services).some((f) => f.services.some((s) => s.code === "FR_ColissimoReturnsDomestic")),
    "FR_ColissimoReturnsDomestic (étiquette de retour, « valide » chez Metadata, non valide avant) n'est jamais proposé");
  ok(resoudreServiceLivraison("colissimo", services)?.code === "FR_ColiposteColissimo" && resoudreServiceLivraison("main_propre", services)?.code === "FR_RemiseEnMainPropre",
    "les deux modes de l'app (Colissimo, remise en main propre) se résolvent sur la liste réelle");
}

console.log("6. Le câblage");
{
  const src = Deno.readTextFileSync(new URL("../supabase/functions/ebay-account/index.ts", import.meta.url)).replace(/\r\n/g, "\n");
  ok(/const \{ services, source \} = await listerServicesLivraisonAvecSource\(env, token\);[\s\S]{0,200}source,/.test(src), "« Modes d'envoi » : la liste et sa source rendues à l'écran");
  const mod = Deno.readTextFileSync(new URL("../supabase/functions/_shared/ebay-shipping.ts", import.meta.url));
  ok(/import \{ obtenirJetonApplicatif \} from "\.\/ebay-app-token\.ts";/.test(mod), "le jeton applicatif vient du module partagé déjà en production (Browse)");
}

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
if (ko) Deno.exit(1);
