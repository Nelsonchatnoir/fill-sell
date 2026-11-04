// selftest:ebay-modifier-tout — (04/11, points 3 et 4, décisions de Nico)
//   3. Tout se modifie depuis FillSell sur une annonce eBay de l'API (titre, prix, description, CARACTÉRISTIQUES,
//      PHOTOS) : demandes contrôlées, liste fermée respectée, obligatoire jamais retiré, rien envoyé qui n'a pas changé ;
//   4. « Créer mes conditions eBay » : les réglages lus sur les annonces du vendeur, un prix jamais inventé, rien créé
//      sans son clic, plus de renvoi vers ebay.fr.
//   deno run --allow-read scripts/ebay-modifier-tout-selftest.ts
import { aspectsControles, demandePropre, PHOTOS_MAX_EBAY } from "../supabase/functions/_shared/ebay-modifier-annonce.ts";
import { conditionsDeLAnnonce, identifiantsActifs, proposerConditions } from "../supabase/functions/_shared/ebay-conditions-proposees.ts";
import { etapeEbayAFinir, messageEbayCompteAFinir } from "../supabase/functions/_shared/ebay-voie.ts";
import { aspectsChanges, valeursSaisies } from "../src/utils/ebayModification.js";

let ko = 0, n = 0;
const ok = (c: boolean, m: string, d?: unknown) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); } };
const lire = (f: string) => Deno.readTextFileSync(new URL(`../${f}`, import.meta.url)).replace(/\r\n/g, "\n");

console.log("1. La demande de modification (serveur)");
{
  const a = demandePropre({ aspects: { "Vintage": "Oui", "Coupe": ["Décontracté"], "Pays d'origine": [] }, photos: ["https://x/1.jpg", "https://x/2.jpg"] });
  ok(a.ok && JSON.stringify((a as any).d.aspects) === JSON.stringify({ "Vintage": ["Oui"], "Coupe": ["Décontracté"], "Pays d'origine": [] }),
    "caractéristiques lues (une valeur, une liste, [] = retirée)", a);
  ok(a.ok && (a as any).d.photos.length === 2, "photos https, dans l'ordre", a);
  const b = demandePropre({ photos: ["http://x/1.jpg"] });
  ok(!b.ok && (b as any).motif === "photos_adresse", "une photo sans https : refusée", b);
  const c = demandePropre({ photos: [] });
  ok(!c.ok && (c as any).motif === "photos_vides", "une annonce garde au moins une photo", c);
  const d = demandePropre({ photos: Array.from({ length: PHOTOS_MAX_EBAY + 1 }, (_, i) => `https://x/${i}.jpg`) });
  ok(!d.ok && (d as any).motif === "photos_trop", `${PHOTOS_MAX_EBAY} photos au plus`, d);
  const e = demandePropre({ aspects: { "Coupe": "x".repeat(66) } });
  ok(!e.ok && (e as any).motif === "aspect_valeur", "65 caractères au plus par valeur (limite eBay)", e);
  ok(!demandePropre({}).ok, "rien à modifier : refusé");
}

console.log("2. Les caractéristiques contrôlées contre la catégorie");
{
  const CAT = [
    { name: "Marque", mode: "FREE_TEXT", required: true, cardinality: "SINGLE", allowedValues: ["Lee"] },
    { name: "Vintage", mode: "SELECTION_ONLY", required: false, cardinality: "SINGLE", allowedValues: ["Oui", "Non"] },
    { name: "Coupe", mode: "FREE_TEXT", required: false, cardinality: "SINGLE", allowedValues: ["Décontracté", "Slim"] },
    { name: "Caractéristiques", mode: "FREE_TEXT", required: false, cardinality: "MULTI", allowedValues: [] },
  ];
  const r1 = aspectsControles({ "Vintage": ["oui"], "Coupe": ["décontractée"], "Caractéristiques": ["Poches", "Délavé"] }, CAT);
  ok(r1.ok && (r1 as any).aspects["Vintage"][0] === "Oui" && (r1 as any).aspects["Coupe"][0] === "Décontracté", "recalées à l'écriture exacte d'eBay", r1);
  const r2 = aspectsControles({ "Vintage": ["Peut-être"] }, CAT);
  ok(!r2.ok && (r2 as any).motif === "aspect_hors_liste", "liste fermée : une de ses entrées seulement", r2);
  const r3 = aspectsControles({ "Marque": [] }, CAT);
  ok(!r3.ok && (r3 as any).motif === "aspect_obligatoire", "une caractéristique obligatoire ne se retire pas", r3);
  const r4 = aspectsControles({ "Coupe": ["Slim", "Décontracté"] }, CAT);
  ok(!r4.ok && (r4 as any).motif === "aspect_unique", "une valeur unique n'en prend qu'une", r4);
  const r5 = aspectsControles({ "Inconnue": ["x"] }, null);
  ok(r5.ok, "catalogue illisible : eBay tranche (sa phrase sera rendue)", r5);
}

console.log("3. L'écran n'envoie que ce qui a changé");
{
  const avant = { "Marque": ["Lee"], "Couleur": ["Noir", "Bleu"] };
  const CAT = [{ name: "Couleur", cardinality: "SINGLE" }, { name: "Caractéristiques", cardinality: "MULTI" }];
  ok(JSON.stringify(aspectsChanges(avant, { "Marque": "Lee", "Couleur": "Noir, Bleu" }, CAT)) === "{}", "rien touché (même plusieurs valeurs chez eBay) : rien envoyé");
  ok(JSON.stringify(aspectsChanges(avant, { "Marque": "Lee", "Vintage": "Oui" }, CAT)) === JSON.stringify({ "Vintage": ["Oui"] }), "une caractéristique ajoutée part seule");
  ok(JSON.stringify(aspectsChanges(avant, { "Marque": "" }, CAT)) === JSON.stringify({ "Marque": [] }), "une saisie vidée retire la caractéristique");
  ok(JSON.stringify(valeursSaisies("Poches, Délavé, Poches", true)) === JSON.stringify(["Poches", "Délavé"]) && valeursSaisies("a, b", false).length === 1,
    "plusieurs valeurs seulement si eBay l'accepte (MULTI)");
}

console.log("4. « Créer mes conditions eBay » : les réglages lus sur ses annonces");
{
  const item = `<Item><ItemID>406000000001</ItemID><PostalCode>25490</PostalCode><Location>Badevel</Location><DispatchTimeMax>2</DispatchTimeMax>
    <ShippingDetails><ShippingServiceOptions><ShippingService>FR_ColiposteColissimo</ShippingService><ShippingServiceCost currencyID="EUR">6.9</ShippingServiceCost></ShippingServiceOptions>
    <ShippingServiceOptions><ShippingService>FR_MondialRelay</ShippingService><ShippingServiceCost currencyID="EUR">4.5</ShippingServiceCost></ShippingServiceOptions></ShippingDetails>
    <ReturnPolicy><ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption><ReturnsWithinOption>Days_14</ReturnsWithinOption><ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption></ReturnPolicy></Item>`;
  const c = conditionsDeLAnnonce(item);
  ok(c.services.length === 2 && c.services[0].code === "FR_ColiposteColissimo" && c.services[0].frais === 6.9 && c.delai === 2, "transporteurs, prix, délai lus", c);
  ok(c.retours?.acceptes === true && c.retours?.jours === 14 && c.codePostal === "25490" && c.ville === "Badevel", "retours et lieu lus", c);
  const VALIDES = [
    { code: "FR_ColiposteColissimo", libelle: "Colissimo", valide: true, international: false },
    { code: "FR_MondialRelay", libelle: "Mondial Relay", valide: true, international: false },
    { code: "FR_Ancien", libelle: "Ancien", valide: false, international: false },
  ];
  const p = proposerConditions([c, c], VALIDES, 4);
  ok(p.source === "annonces" && p.livraison.services.map((s) => s.code).join() === "FR_ColiposteColissimo,FR_MondialRelay" && p.livraison.services[1].frais === 4.5,
    "la proposition reprend SES transporteurs et SES prix", p);
  ok(p.retours.acceptes && p.retours.jours === 14 && p.adresse?.code_postal === "25490" && p.livraison.delai_jours === 2, "ses retours (14 j), son délai, son code postal", p);
  const ancien = conditionsDeLAnnonce(item.replace("FR_MondialRelay", "FR_Ancien"));
  ok(!proposerConditions([ancien], VALIDES, 4).livraison.services.some((s) => s.code === "FR_Ancien"), "un service qu'eBay n'accepte plus ne passe pas");
  const vide = proposerConditions([], VALIDES, 4);
  ok(vide.source === "defauts" && vide.livraison.services.length === 1 && vide.livraison.services[0].frais === null && vide.retours.jours === 30,
    "sans annonce : Colissimo, prix VIDE à remplir (jamais inventé), retours 30 jours", vide);
  ok(JSON.stringify(identifiantsActifs("<ActiveList><ItemArray><Item><ItemID>406000000001</ItemID></Item><Item><ItemID>406000000002</ItemID></Item></ItemArray></ActiveList>", 3)) === '["406000000001","406000000002"]',
    "les annonces actives lues (GetMyeBaySelling)");
}

console.log("5. Plus de renvoi vers ebay.fr ; rien créé sans clic ; le câblage");
{
  const SS = { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 0, paiement: 0, retours: 0 }, lieu_expedition: true };
  const e = etapeEbayAFinir({ revoked_at: null, fulfillment_policy_id: null, payment_policy_id: null, return_policy_id: null, seller_state: SS });
  ok(e?.etape === "conditions" && e.url === null && /Créer mes conditions eBay/.test(messageEbayCompteAFinir(e)) && !/ebay\.fr\/bp/.test(messageEbayCompteAFinir(e)),
    "le cas de Benjamin : « Créer mes conditions eBay », plus de lien eBay", { e, m: messageEbayCompteAFinir(e) });
  const acc = lire("supabase/functions/ebay-account/index.ts");
  const iProp = acc.indexOf('if (action === "proposer_conditions") {');
  const iCreer = acc.indexOf('if (action === "creer_conditions") {');
  const prop = acc.slice(iProp, iCreer);
  ok(iProp > 0 && iCreer > iProp && !/method: "(POST|PUT)"/.test(prop) && !/opt_in/.test(prop), "proposer_conditions : lecture seule (aucun POST / PUT chez eBay)");
  ok(/fraisTexte === "" \|\| !Number\.isFinite\(frais\)/.test(acc.slice(iCreer)), "creer_conditions : un prix de livraison vide est refusé (jamais deviné)");
  ok(/"creer_conditions"\]\.includes\(action\)/.test(acc), "compte eBay étranger : jamais de conditions créées sur ebay.fr");
  const app = lire("src/stock/CreerConditionsEbay.jsx");
  ok(/action: 'proposer_conditions'/.test(app) && /action: 'creer_conditions'/.test(app) && /onClick=\{creer\}/.test(app) && /fusionnerReglages\(\['ebay', 'adresse_expedition'\]/.test(app),
    "l'app : la proposition à l'ouverture, la création au clic seulement, l'adresse par platform_settings_fusionner");
  const st = lire("src/tabs/StockTab.jsx");
  ok(/lien\.action === 'creer_conditions_ebay'/.test(st) && /<BoutonConditionsEbay /.test(st), "le Stock : le bouton dans la fiche de la publication arrêtée");
  const mod = lire("src/stock/ModifierAnnonceEbay.jsx");
  ok(/action: 'lire_annonce'/.test(mod) && /corps\.aspects = ch/.test(mod) && /corps\.photos = photos/.test(mod), "« Modifier sur eBay » : caractéristiques et photos lues chez eBay, envoyées si changées");
}

console.log(ko ? `\n✗ ebay-modifier-tout : ${ko} rouge(s) sur ${n}` : `\n✓ ebay-modifier-tout : ${n} contrôles verts`);
Deno.exit(ko ? 1 : 0);
