// ═══════════════════════════════════════════════════════════════════════════
// Selftest LOT E (30/10/2026) — retours de thecloset72000 (Pro)
//   deno run --allow-read scripts/lot-e-3010-selftest.ts
// Sur les règles RÉELLES (importées, jamais recopiées) :
//   7. le genre ÉCRIT dans l'article prime sur un genre deviné (app, moteur Depop, Département eBay) ;
//   6. la matière d'un vêtement = la composition de l'étiquette (jamais « Denim » deviné) ;
//   5a. eBay : les caractéristiques connues partent même facultatives, jamais inventées.
// ═══════════════════════════════════════════════════════════════════════════
import { genreDuTexte, genreAccordeAuTexte } from "../supabase/functions/_shared/genre-du-texte.js";
import { indicesAgeGenre, departementsDepop } from "../supabase/functions/_shared/depop-rayon.js";
import { matieresDeLaComposition } from "../supabase/functions/_shared/composition-matieres.js";
import { assemblerAspects } from "../supabase/functions/_shared/ebay-publication.ts";

let ko = 0;
const ok = (nom: string, cond: boolean, detail: unknown = "") => {
  if (!cond) ko++;
  console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};
const lire = (f: string) => Deno.readTextFileSync(new URL(`../${f}`, import.meta.url)).replace(/\r\n/g, "\n");

console.log("7. Le genre écrit dans l'article prime sur le genre deviné");
const titreCloset = "Lee Taille (14) FR 44 Femme Jean Bleu Denim Relaxed Fit Straight Leg Mom";
ok("« … Femme Jean … » → Femme", genreDuTexte({ titre: titreCloset }) === "Femme");
ok("titre muet, description « jean pour homme » → Homme", genreDuTexte({ titre: "Jean Levi's 501", description: "Jean pour homme, coupe droite." }) === "Homme");
ok("les deux nommés → rien (la règle d'avant)", genreDuTexte({ titre: "Sweat mixte homme femme" }) === null);
ok("article d'enfant → rien", genreDuTexte({ titre: "Jean fille 10 ans" }) === null);
ok("« women » (anglais) → Femme ; « men » n'est jamais lu dans « women »", genreDuTexte({ titre: "Lee Women Jeans vintage" }) === "Femme");
ok("un titre qui nomme les deux : la description ne tranche pas", genreDuTexte({ titre: "Pull homme ou femme", description: "Pour femme." }) === null);
ok("genre deviné « Homme » contre « Femme » écrit → Femme", JSON.stringify(genreAccordeAuTexte("Homme", "Femme")) === JSON.stringify({ genre: "Femme", corrige: true }));
ok("Mixte, Enfant, vide : jamais touchés", !genreAccordeAuTexte("Mixte", "Femme").corrige && !genreAccordeAuTexte("Fille", "Femme").corrige && !genreAccordeAuTexte("", "Femme").corrige);
{
  // Le cas réel : genre « Homme » sur le job, « Femme » dans le titre. Avant : les deux signaux → Homme ET Femme
  // proposés, la garde « genre contraire » désarmée.
  const ind = indicesAgeGenre({ titre: titreCloset, genre: "Homme" });
  ok("Depop : le genre deviné « Homme » ne compte pas contre « Femme » écrit", ind.homme.length === 0 && ind.femme.length > 0, ind);
  ok("Depop : un seul département proposé, Femme", JSON.stringify(departementsDepop(ind, { horsMode: false })) === JSON.stringify(["womenswear"]), departementsDepop(ind, { horsMode: false }));
  const ind2 = indicesAgeGenre({ titre: "Jean Levi's 501 bleu", genre: "Homme" });
  ok("Depop : sans mot de genre, le genre de la fiche compte toujours (règle d'avant)", ind2.homme.length === 1);
}
{
  const res = lire("src/utils/resolutionPublication.js");
  ok("app : le genre du texte corrige toutes les copies AVANT la résolution des rayons", /const dit = genreDuTexte\(\{ titre: titres, description: descFr \}\);[\s\S]{0,900}edited = corrige;[\s\S]{0,200}const iconFor = /.test(res));
}

console.log("6. La matière d'un vêtement = la composition de l'étiquette");
ok("« 78% coton, 20% polyester, 2% élasthanne » → Coton, Polyester, Élasthanne",
  matieresDeLaComposition("78% coton, 20% polyester, 2% élasthanne").join() === "Coton,Polyester,Élasthanne");
ok("ordre des parts, pas de l'écriture : « 2% EA 98% CO » → Coton, Élasthanne", matieresDeLaComposition("2% EA 98% CO").join() === "Coton,Élasthanne", matieresDeLaComposition("2% EA 98% CO"));
ok("le mot d'abord : « coton 78 %, polyester 20 %, élasthanne 2 % »", matieresDeLaComposition("coton 78 %, polyester 20 %, élasthanne 2 %").join() === "Coton,Polyester,Élasthanne", matieresDeLaComposition("coton 78 %, polyester 20 %, élasthanne 2 %"));
ok("« 98% coton et 2% élasthanne »", matieresDeLaComposition("98% coton et 2% élasthanne").join() === "Coton,Élasthanne", matieresDeLaComposition("98% coton et 2% élasthanne"));
ok("anglais : « cotton / polyester / elastane » → Coton, Polyester, Élasthanne", matieresDeLaComposition("cotton / polyester / elastane").join() === "Coton,Polyester,Élasthanne");
ok("« Coton, Polyester » (relevé eBay) → Coton, Polyester", matieresDeLaComposition("Coton, Polyester").join() === "Coton,Polyester");
ok("vide → rien (jamais inventé)", matieresDeLaComposition("").length === 0 && matieresDeLaComposition(null).length === 0);
ok("un mot inconnu reste tel qu'écrit", matieresDeLaComposition("100% bambou").join() === "Bambou");

console.log("5a. eBay : les caractéristiques connues partent, même facultatives — jamais inventées");
const catalogue = [
  { name: "Marque", required: true, mode: "FREE_TEXT", allowedValues: ["Lee", "Levi's"] },
  { name: "Département", required: false, mode: "SELECTION_ONLY", allowedValues: ["Femme", "Homme", "Adulte unisexe"] },
  { name: "Matière", required: false, mode: "FREE_TEXT", allowedValues: ["Coton", "Denim", "Élasthanne"] },
  { name: "Saison", required: false, mode: "SELECTION_ONLY", allowedValues: ["Printemps", "Été", "Automne", "Hiver"] },
  { name: "Coupe", required: false, mode: "FREE_TEXT", allowedValues: ["Droite", "Slim"] },
  { name: "Motif", required: false, mode: "FREE_TEXT", allowedValues: ["Uni", "Rayé"] },
  { name: "Style", required: false, mode: "FREE_TEXT", allowedValues: ["Jean"] },
  { name: "Numéro de pièce fabricant", required: false, mode: "FREE_TEXT", allowedValues: [] },
];
{
  const pf = {
    marque: "Lee", genre: "Homme", matiere: null,
    ebayCategoryPath: ["Vêtements, accessoires", "Femme : vêtements, accessoires", "Femme : vêtements", "Jeans"],
    attributs_visibles: { composition: "78% coton, 20% polyester, 2% élasthanne", saison: "hiver", coupe: "Straight leg relaxed fit" },
  };
  const r = assemblerAspects(pf as never, catalogue as never);
  ok("Département : le rayon « Femme : vêtements » prime sur le genre deviné « Homme »", r.aspects["Département"]?.[0] === "Femme", r.aspects);
  ok("Matière (facultative) : la composition de l'étiquette → Coton, jamais Denim", r.aspects["Matière"]?.[0] === "Coton", r.aspects);
  ok("Saison (facultative, liste fermée) : « hiver » lu → Hiver", r.aspects["Saison"]?.[0] === "Hiver", r.aspects);
  ok("Coupe (facultative, texte libre) : la coupe lue part", r.aspects["Coupe"]?.[0] === "Straight leg relaxed fit", r.aspects);
  ok("Motif, Style : rien de connu → rien (jamais inventé, jamais demandé)", !("Motif" in r.aspects) && !("Style" in r.aspects) && !r.manquants.includes("Motif"));
  ok("Numéro de pièce fabricant facultatif : jamais « Ne s'applique pas » par défaut", !("Numéro de pièce fabricant" in r.aspects));
  ok("aucun aspect facultatif n'est compté manquant", r.manquants.length === 0, r.manquants);
  const r2 = assemblerAspects({ ...pf, ebayAspects: { "Département": "Homme" } } as never, catalogue as never);
  ok("un Département « Homme » posé sur un rayon Femme est recalé sur le rayon", r2.aspects["Département"]?.[0] === "Femme" && r2.recalages.some((x) => /Département/.test(x)), r2);
  const r3 = assemblerAspects({ marque: "Lee", attributs_visibles: { saison: "toutes saisons" } } as never, catalogue as never);
  ok("liste fermée sans correspondance (« toutes saisons ») : rien, sans question", !("Saison" in r3.aspects) && r3.manquants.length === 0, r3);
  const r4 = assemblerAspects({ marque: "Lee", attributs_visibles: { reference_fabricant: "L7DXJN" } } as never, catalogue as never);
  ok("la référence LUE sur l'article part", r4.aspects["Numéro de pièce fabricant"]?.[0] === "L7DXJN", r4.aspects);
}

console.log("4. Les photos de chaque plateforme (choix, ordre, limite)");
{
  const { photosDuJob, photosParDefaut, choixValide, PHOTOS_MAX_PLATEFORME } = await import("../src/publication/photosParPlateforme.js");
  const fiche = Array.from({ length: 15 }, (_, i) => ({ type: i ? `photo_${i}` : "original", url: `https://x/${i + 1}.jpg` }));
  const urls = fiche.map((p) => p.url);
  ok("limites : Depop 8, Beebs 10, Vinted 20, eBay 24", PHOTOS_MAX_PLATEFORME.depop === 8 && PHOTOS_MAX_PLATEFORME.beebs === 10 && PHOTOS_MAX_PLATEFORME.vinted === 20 && PHOTOS_MAX_PLATEFORME.ebay === 24);
  ok("par défaut (aucun choix) : la règle d'avant — toutes les photos, la plateforme coupe", photosDuJob("beebs", fiche, undefined).photos.length === 15 && !photosDuJob("beebs", fiche, undefined).choisies);
  ok("le défaut montré est ce que la plateforme garde (Beebs : les 10 premières)", photosParDefaut("beebs", urls).length === 10);
  const choix = [urls[4], urls[0], urls[9]];
  const r = photosDuJob("depop", fiche, choix);
  ok("Depop, 3 photos choisies et réordonnées : elles partent, dans cet ordre", r.choisies && r.photos.map((p: { url: string }) => p.url).join() === choix.join(), r);
  ok("un choix est borné par la limite (Depop : 8 au plus)", choixValide("depop", urls, urls)!.length === 8);
  ok("une URL étrangère à la fiche ou un doublon : ignorés", choixValide("vinted", [urls[0], urls[0], "https://autre/x.jpg"], urls)!.join() === urls[0]);
  ok("un « choix » identique au défaut n'en est pas un (rien de marqué)", !photosDuJob("depop", fiche, urls.slice(0, 8)).choisies);
}
{
  const { construireJobs } = await import("../src/publication/moteur/regles.js");
  const photos = Array.from({ length: 6 }, (_, i) => `https://x/${i + 1}.jpg`);
  const outils = {
    entreesPhotos: (l: string[]) => l.map((url, i) => ({ type: i ? `photo_${i}` : "original", url })),
    getLbcFreePhotoQuota: () => null, normalizeVintedTitle: (t: string) => t,
  };
  const base = { userId: "u", photoOption: "original", price: 10, outils, processedPhotos: photos };
  const c = construireJobs({
    ...base, plateformes: ["vinted", "leboncoin", "beebs"],
    champsResolus: { vinted: { matiere: "Coton, Polyester, Élasthanne" }, leboncoin: { matiere: "Coton, Polyester, Élasthanne" }, beebs: {} },
    edited: {
      vinted: { title: "Jean", description: "d" }, leboncoin: { title: "Jean", description: "d", photos: [photos[2], photos[0]] },
      beebs: { title: "Jean", description: "d" },
    },
    villePublicationLbc: { code_postal: "72000", ville: "Le Mans" },
  });
  const lbc = c.rows.find((x: { platform: string }) => x.platform === "leboncoin");
  const vin = c.rows.find((x: { platform: string }) => x.platform === "vinted");
  const bee = c.rows.find((x: { platform: string }) => x.platform === "beebs");
  ok("job Leboncoin : les 2 photos choisies, dans l'ordre choisi", lbc.photos.map((p: { url: string }) => p.url).join() === [photos[2], photos[0]].join(), lbc.photos);
  ok("…marqué photos_choisies + lbcPhotosCapped (la fiche n'est jamais réécrite par un extrait)", lbc.platform_fields.photos_choisies === true && lbc.platform_fields.lbcPhotosCapped === true);
  ok("job Vinted / Beebs sans choix : toutes les photos, rien de marqué", vin.photos.length === 6 && bee.photos.length === 6 && !vin.platform_fields.photos_choisies);
  ok("ville Leboncoin : le réglage part sur le job", JSON.stringify(lbc.platform_fields.ville_publication_lbc) === JSON.stringify({ code_postal: "72000", ville: "Le Mans" }));
  ok("composition : Vinted coche la liste (matieres), la case unique prend la 1re matière", vin.platform_fields.matiere === "Coton" && vin.platform_fields.matieres?.join() === "Coton,Polyester,Élasthanne" && lbc.platform_fields.matiere === "Coton" && !lbc.platform_fields.matieres);
  const c2 = construireJobs({
    ...base, plateformes: ["leboncoin"], champsResolus: { leboncoin: { ville_publication_lbc: { code_postal: "75001", ville: "Paris" } } },
    edited: { leboncoin: { title: "Jean", description: "d" } }, villePublicationLbc: { code_postal: "72000", ville: "Le Mans" },
  });
  ok("ville choisie sur la carte : elle prime sur le réglage", c2.rows[0].platform_fields.ville_publication_lbc.ville === "Paris");
  const c3 = construireJobs({
    ...base, plateformes: ["leboncoin"], champsResolus: { leboncoin: { ville_publication_lbc: "adresse" } },
    edited: { leboncoin: { title: "Jean", description: "d" } }, villePublicationLbc: { code_postal: "72000", ville: "Le Mans" },
  });
  ok("« Mon adresse » sur la carte : aucune ville posée (l'adresse de remise, comme avant)", !("ville_publication_lbc" in c3.rows[0].platform_fields));
  const c4 = construireJobs({ ...base, plateformes: ["leboncoin"], champsResolus: { leboncoin: {} }, edited: { leboncoin: { title: "Jean", description: "d" } } });
  ok("sans réglage ni choix : rien ne change", !("ville_publication_lbc" in c4.rows[0].platform_fields));
}
{
  const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
  ok("extension Leboncoin : la ville choisie est saisie (« ville code_postal ») et sert au repli commune", /parVilleChoisie \? `\$\{villeChoisie\.ville\} \$\{villeChoisie\.cp\}` : fields\.adresse/.test(lbc) && /commune: \(estRepublication && adresseOrigine\) \? communeOrigine : \(parVilleChoisie \? villeChoisie : null\)/.test(lbc));
  const cf = lire("supabase/functions/_shared/contenu-fiche.js");
  ok("serveur : des photos choisies ne sont jamais complétées par la fiche", /photos_choisies !== true/.test(cf));
  const vin = lire("chrome-extension/content-scripts/vinted.js");
  ok("extension Vinted : la composition cochée matière par matière avant la voie d'avant", /Array\.isArray\(fields\.matieres\) && fields\.matieres\.length > 1\s*&& await selectMaterialsByLabels\(fields\.matieres, warnings\)/.test(vin));
  const lens = lire("supabase/functions/lens-analysis/index.ts");
  ok("analyse photo : la matière d'un vêtement vient de l'étiquette lue, jamais devinée", /JAMAIS une matière devinée à l'aspect ou au type d'article/.test(lens) && /NEVER a material guessed from the look/.test(lens));
}

console.log("5b. Modifier une annonce eBay en ligne depuis FillSell (eBay simulé, aucun appel réel)");
{
  const { demandePropre, modifierAnnonceEbay } = await import("../supabase/functions/_shared/ebay-modifier-annonce.ts");
  ok("demande : prix « 19,90 » → 19.9", (() => { const d = demandePropre({ prix: "19,90" }); return d.ok && d.d.prix === 19.9; })());
  ok("demande vide → « Rien à modifier », titre vide refusé, prix faux refusé",
    !demandePropre({}).ok && !demandePropre({ titre: "  " }).ok && !demandePropre({ prix: "abc" }).ok);
  const offre = {
    offerId: "O1", sku: "fs-1", marketplaceId: "EBAY_FR", status: "PUBLISHED", listing: { listingId: "123456789012", listingStatus: "ACTIVE", soldQuantity: 0 },
    availableQuantity: 1, categoryId: "11554", format: "FIXED_PRICE", listingDuration: "GTC", listingDescription: "<p>avant</p>",
    listingPolicies: { fulfillmentPolicyId: "F", paymentPolicyId: "P", returnPolicyId: "R" }, merchantLocationKey: "fillsell-fr",
    pricingSummary: { price: { value: "30.00", currency: "EUR" } },
  };
  const article = {
    sku: "fs-1", locale: "fr_FR", availability: { shipToLocationAvailability: { quantity: 1 } }, condition: "USED_EXCELLENT",
    product: { title: "Jean Lee", description: "<p>avant</p>", aspects: { Marque: ["Lee"] }, imageUrls: ["https://x/1.jpg"] },
  };
  const jouer = async (o: Record<string, unknown>, a: Record<string, unknown>, d: Record<string, unknown>, refusOffre = false) => {
    const appels: Array<{ methode: string; url: string; corps: any }> = [];
    const avant = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const methode = init.method ?? "GET";
      appels.push({ methode, url: String(url), corps: init.body ? JSON.parse(String(init.body)) : null });
      if (methode === "GET" && /\/offer\//.test(String(url))) return new Response(JSON.stringify(o), { status: 200 });
      if (methode === "GET") return new Response(JSON.stringify(a), { status: 200 });
      if (refusOffre && /\/offer\//.test(String(url))) return new Response(JSON.stringify({ errors: [{ errorId: 25007, message: "Prix refusé." }] }), { status: 400 });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try { return { r: await modifierAnnonceEbay("production", "jeton", { sku: "fs-1", offerId: "O1", listingId: "123456789012" }, d as never), appels }; }
    finally { globalThis.fetch = avant; }
  };
  const { r, appels } = await jouer(offre, article, { titre: "Jean Lee femme", prix: 25 });
  const putArticle = appels.find((x) => x.methode === "PUT" && /inventory_item/.test(x.url));
  const putOffre = appels.find((x) => x.methode === "PUT" && /\/offer\//.test(x.url));
  ok("titre + prix : l'article puis l'offre sont réécrits, eBay révise EN PLACE", r.ok && putArticle && putOffre, r);
  ok("l'article garde tout le reste (état, quantité, aspects, photos)", putArticle?.corps.condition === "USED_EXCELLENT" && putArticle?.corps.product.title === "Jean Lee femme"
    && putArticle?.corps.product.aspects.Marque[0] === "Lee" && putArticle?.corps.product.imageUrls.length === 1 && putArticle?.corps.availability, putArticle?.corps);
  ok("l'offre garde ses politiques, son rayon, sa durée ; seul le prix change", putOffre?.corps.pricingSummary.price.value === "25.00" && putOffre?.corps.listingPolicies.returnPolicyId === "R"
    && putOffre?.corps.categoryId === "11554" && !("status" in putOffre.corps) && !("listing" in putOffre.corps), putOffre?.corps);
  const seul = await jouer(offre, article, { prix: 25 });
  ok("le prix seul : l'article n'est pas touché", seul.r.ok && !seul.appels.some((x) => x.methode === "PUT" && /inventory_item/.test(x.url)));
  const fini = await jouer({ ...offre, listing: { ...offre.listing, listingStatus: "ENDED" } }, article, { prix: 25 });
  ok("annonce terminée : rien n'est écrit, la phrase le dit", !fini.r.ok && fini.r.motif === "annonce_pas_en_vente" && !fini.appels.some((x) => x.methode === "PUT"));
  const inconnu = await jouer({ ...offre, nouveauChampEbay: { x: 1 } }, article, { prix: 25 });
  ok("un champ que FillSell ne sait pas réécrire : rien n'est écrit (jamais effacé)", !inconnu.r.ok && inconnu.r.motif === "champ_non_reecrivable" && !inconnu.appels.some((x) => x.methode === "PUT"));
  const refus = await jouer(offre, article, { prix: 25 }, true);
  ok("refus d'eBay : sa phrase est rendue", !refus.r.ok && /Prix refusé/.test((refus.r as { message: string }).message), refus.r);
  const acc = lire("supabase/functions/ebay-account/index.ts");
  ok("ebay-account : la personne seulement, sur SES publications eBay API en ligne", /action === "modifier_annonce"[\s\S]{0,900}\.eq\("id", jobId\)\.eq\("user_id", user\.id\)[\s\S]{0,600}j\.voie !== "api" \|\| j\.status !== "published"/.test(acc));
  const st = lire("src/tabs/StockTab.jsx");
  ok("Stock : « Modifier sur eBay » sur une annonce eBay publiée par l'API", /cle: 'modifier-ebay'/.test(st) && /<ModifierAnnonceEbay /.test(st));
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ lot E (genre, matière, aspects eBay, photos, ville, modification eBay) : tout passe");
Deno.exit(ko ? 1 : 0);
