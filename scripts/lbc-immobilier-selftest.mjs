// VERROU (16/11/2026, point 9 de Nico) : UNE ANNONCE LEBONCOIN EN IMMOBILIER N'EST JAMAIS TENTÉE — « PAS ENCORE PRIS EN
// CHARGE », DIT EN UNE PHRASE, AUCUNE TÂCHE CRÉÉE PAR L'APP, AUCUNE TÂCHE SERVIE PAR LE SERVEUR.
//
//     npm run selftest:lbc-immobilier
//
// Cas fondateur : joshua.sapone (f8a94c06), « à vendre – la table toscane – pizzeria à riez (04) – 90 000 », annonce
// Leboncoin 3271304443 rangée « Immobilier › Bureaux & Commerces » (lien /ad/bureaux_commerces/3271304443) : sa
// republication 0a1cac7c a bouclé sur le contrôle d'avant retrait (≈ 40 contrôles par jour depuis le 11/11). Même chose
// sur le compte 8a7f95d5 (« Studio meublé 25 m² », Immobilier › Locations, republication dd58c22f, 07/11).
//   A. La règle (_shared/leboncoin-immobilier.js) : les 4 feuilles de la racine Immobilier de l'arbre relevé, le lien
//      d'une annonce Immobilier ; « Locations de vacances », les objets, les autres plateformes, un retrait, une
//      republication engagée : jamais.
//   B. La phrase de Nico, mot pour mot (FR + EN) ; les champs de la tâche retenue.
//   C. get-pending-jobs ne la sert jamais : retenue au premier passage, AVANT le poids, écriture conditionnée.
//   D. L'app ne crée jamais la republication : repubEtatPlateforme « interdit », la porte unique refuse avec la phrase.
//   E. L'app ne crée jamais la publication : écartée avant le débit (stepper et lot), l'écran de suivi et la carte du
//      rayon disent la phrase.
//   F. (16/11/2026 soir, point 6 de Nico) LA MÊME RÈGLE POUR LA RACINE « LOCATIONS DE VACANCES » (feuille « Locations
//      saisonnières », lien /ad/locations_saisonnieres/ — relevé en base le 16/11 : 16 annonces de 4 comptes, 6d347cc3,
//      7f2cadb8, b2de74c9, faf5021a ; aucune tâche vivante) : sa phrase à elle (FR + EN, et sa traduction de l'écrit du
//      serveur), la même retenue serveur, la même porte de l'app (publication, republication, relance par copie, carte
//      du rayon, écran de suivi). Avant ce lot : F rouge (racine non visée).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

let A = null;
try { A = await charger("supabase/functions/_shared/leboncoin-immobilier.js"); } catch { /* absent avant le correctif */ }
const URL_TOSCANE = "https://www.leboncoin.fr/ad/bureaux_commerces/3271304443";
// La republication telle que spend_coins_and_publish la crée : le lien, AUCUN chemin (la capture n'a pas encore eu lieu).
const LE_CAS = { id: "0a1cac7c", platform: "leboncoin", action: "republish", status: "pending", listing_url: URL_TOSCANE,
  platform_fields: { republish_snapshot: { listing_url: URL_TOSCANE, platform_listing_id: "3271304443" }, processing_since: "x" } };
const CAPTUREE = { ...LE_CAS, platform_fields: { ...LE_CAS.platform_fields, republish_step: "captured", lbcCategoryPath: ["Immobilier", "Bureaux & Commerces"] } };
const PHRASE_FR = "Leboncoin : la catégorie Immobilier n'est pas encore prise en charge par FillSell. Publie cette annonce toi-même sur Leboncoin.";

console.log("A. La règle");
ok(!!A, "_shared/leboncoin-immobilier.js existe");
if (A) {
  const { FEUILLES } = await charger("src/utils/arbres/leboncoinFeuilles.js");
  const filles = FEUILLES.filter((f) => f.chemin[0] === "Immobilier").map((f) => f.chemin[1]);
  ok(filles.length === 4 && filles.every((f) => A.FEUILLES_IMMOBILIER_LBC.includes(f)) && filles.every((f) => A.cheminImmobilierLbc(["Immobilier", f])),
    "les 4 feuilles Immobilier de l'arbre relevé (Ventes immobilières, Locations, Colocations, Bureaux & Commerces) → règle", filles);
  const autres = FEUILLES.filter((f) => f.chemin[0] !== "Immobilier");
  ok(autres.every((f) => !A.cheminImmobilierLbc(f.chemin)), `aucune des ${autres.length} autres feuilles n'est Immobilier (Locations de vacances : sa propre règle, section F)`);
  ok(A.cheminImmobilierLbc(" immobilier > Locations") && !A.cheminImmobilierLbc([]) && !A.cheminImmobilierLbc(null), "chemin écrit « A > B », casse et blancs : règle ; vide : rien");
  ok(A.urlImmobilierLbc(URL_TOSCANE) && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/locations/3266901489")
    && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/ventes_immobilieres/1") && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/colocations/2"),
    "les liens /ad/<ventes_immobilieres|locations|colocations|bureaux_commerces>/ → Immobilier");
  ok(!A.urlImmobilierLbc("https://www.leboncoin.fr/ad/locations_saisonnieres/5") && !A.urlImmobilierLbc("https://www.leboncoin.fr/ad/vetements/6") && !A.urlImmobilierLbc(null),
    "locations saisonnières, vêtements, lien absent : jamais Immobilier");
  ok(A.estAnnonceImmobilierLbc(LE_CAS), "LE CAS : la republication de « la table toscane », par son lien, AVANT toute capture → règle");
  ok(A.estAnnonceImmobilierLbc(CAPTUREE), "la même, capturée (chemin Immobilier › Bureaux & Commerces) → règle");
  ok(A.estAnnonceImmobilierLbc({ platform: "leboncoin", status: "pending", platform_fields: { lbcCategoryPath: ["Immobilier", "Ventes immobilières"] } }), "une publication (action absente = publish) en Ventes immobilières → règle");
  ok(!A.estAnnonceImmobilierLbc({ ...CAPTUREE, platform_fields: { ...CAPTUREE.platform_fields, republish_step: "deleted" } }), "une republication engagée (annonce retirée) : jamais ici");
  ok(!A.estAnnonceImmobilierLbc({ ...LE_CAS, action: "delete" }) && !A.estAnnonceImmobilierLbc({ ...LE_CAS, platform: "vinted" }), "un retrait, une autre plateforme : jamais");
  ok(!A.estAnnonceImmobilierLbc({ platform: "leboncoin", action: "publish", listing_url: "https://www.leboncoin.fr/ad/decoration/9", platform_fields: { lbcCategoryPath: ["Maison & Jardin", "Décoration"] } }),
    "un objet (Décoration) : jamais");
  ok(JSON.stringify(A.plateformesImmobilierLbc([{ platform: "vinted", platform_fields: {} }, { platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Immobilier", "Locations"] } }])) === '["leboncoin"]'
    && A.plateformesImmobilierLbc([{ platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Divers", "Autres"] } }]).length === 0,
    "lignes de l'app : seule la publication Leboncoin en Immobilier est écartée");

  console.log("B. La phrase et la tâche");
  ok(A.PHRASE_IMMOBILIER_LBC.fr === PHRASE_FR, "la phrase de Nico, mot pour mot", A.PHRASE_IMMOBILIER_LBC.fr);
  ok(/Real estate/.test(A.PHRASE_IMMOBILIER_LBC.en) && /yourself on Leboncoin/.test(A.PHRASE_IMMOBILIER_LBC.en), "sa version anglaise");
  ok(A.messageImmobilierLbc(LE_CAS) === `${PHRASE_FR} Ton annonce reste en ligne : rien n'a été retiré.`, "republication : la phrase, l'annonce reste en ligne", A.messageImmobilierLbc(LE_CAS));
  ok(A.messageImmobilierLbc({ action: "publish" }) === `${PHRASE_FR} Rien n'a été publié.` && /Nothing was published\.$/.test(A.messageImmobilierLbc({ action: "publish" }, "en")),
    "publication : rien n'a été publié (FR + EN)");
  ok(!/wizard|needs_user|prevol|formulaire/i.test(A.messageImmobilierLbc(LE_CAS)), "aucun jargon");
  const pf = A.champsImmobilierLbc({ ...CAPTUREE.platform_fields, needsUserField: { field_key: "square" }, next_action_after: "x" }, "essai", "2026-11-16T15:00:00Z");
  ok(pf.needs_user_source === "lbc_immobilier" && pf.immobilier_lbc?.pose_par === "essai" && JSON.stringify(pf.immobilier_lbc.chemin) === '["Immobilier","Bureaux & Commerces"]'
    && !("processing_since" in pf) && !("needsUserField" in pf) && !("next_action_after" in pf),
    "la tâche : la source du geste, la trace, aucune question, aucune marque de travail ni de reprise", pf);
}

console.log("C. get-pending-jobs ne la sert jamais");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iGarde = gpj.indexOf("LEBONCOIN IMMOBILIER : JAMAIS TENTÉ");
const iPoids = gpj.indexOf("══ LEBONCOIN : AUCUN FORMAT DEVINÉ, LE POIDS DE LA FICHE");
const bloc = iGarde > 0 && iPoids > iGarde ? gpj.slice(iGarde, iPoids) : "";
ok(/import \{ estAnnonceImmobilierLbc, messageImmobilierLbc, champsImmobilierLbc(, categorieJobLbc)? \} from "\.\.\/_shared\/leboncoin-immobilier\.js";/.test(gpj), "la règle est importée par get-pending-jobs");
ok(iGarde > 0 && iGarde < iPoids, "la garde est AVANT le poids Leboncoin (rien calculé, rien servi)");
ok(/j\.status === "pending" && estAnnonceImmobilierLbc\(j as never\)/.test(bloc)
  && /status: "needs_user", error: messageImmobilierLbc\(j\), platform_fields: champsImmobilierLbc\(j\.platform_fields, "get-pending-jobs"\)/.test(bloc)
  && /\.eq\("status", "pending"\)/.test(bloc) && /out = out\.filter\(\(j\) => !ids\.has\(String\(j\.id\)\)\)/.test(bloc),
  "premier passage : à la personne avec la phrase vraie, écriture conditionnée à « pending », jamais servie");
ok(/if \(!includeProcessing && !includeNeedsUser\)/.test(bloc), "le popup et les reprises en cours ne sont pas touchés");

console.log("D. L'app ne crée jamais la republication");
const R = await charger("src/utils/republication.js");
const item = { id: 1794064808157, statut: "en_vente", titre: "à vendre – la table toscane – pizzeria à riez (04) – 90 000" };
const PUB = { id: "4b736ee5", platform: "leboncoin", action: "publish", status: "published", listing_url: URL_TOSCANE, created_at: "2026-11-07T15:20:07Z", platform_fields: {} };
ok(R.repubEtatPlateforme(item, [PUB], "leboncoin") === "interdit", "LE CAS : l'annonce en ligne (lien /ad/bureaux_commerces/) → « interdit », jamais proposée", R.repubEtatPlateforme(item, [PUB], "leboncoin"));
ok(!R.plateformesRepubliables(item, [PUB], { multiOuverte: true, plateformesOuvertes: ["leboncoin"] }).includes("leboncoin"), "le bouton, la feuille et le lot ne proposent pas Leboncoin");
const OBJET = { ...PUB, listing_url: "https://www.leboncoin.fr/ad/decoration/3271304444" };
ok(R.repubEtatPlateforme(item, [OBJET], "leboncoin") === "ok", "un objet en ligne sur Leboncoin reste republiable (rien d'autre ne change)");
const appels = { rpc: 0 };
const fauxSupabase = {
  from: () => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: [{ platform: "leboncoin", action: "publish", listing_url: URL_TOSCANE, lbcCategoryPath: null }], error: null }) };
    return q;
  },
  rpc: async () => { appels.rpc++; return { data: { allowed: true, job_id: "x" }, error: null }; },
};
const res = await R.republierArticle(fauxSupabase, { platform: "leboncoin", inventaireId: item.id });
ok(res?.success === false && res?.reason === "lbc_immobilier" && appels.rpc === 0, "la porte unique (republierArticle) refuse AVANT le serveur : aucune tâche créée, rien débité", { res, appels });
ok(R.messageRefusRepublication(res, "fr") === PHRASE_FR && /Real estate/.test(R.messageRefusRepublication(res, "en")), "le refus dit la phrase de Nico (FR + EN)");

console.log("E. L'app ne crée jamais la publication");
const lps = lire("src/components/ListingPreviewScreen.jsx");
const iSans = lps.indexOf("const sansCategorie = plateformesSansChemin(rows);");
const iImmo = lps.indexOf("const immobilierLbc = plateformesImmobilierLbc(rows);");
const iRpc = lps.indexOf('await supabase.rpc("spend_coins_and_publish"');
const blocE = iImmo > 0 ? lps.slice(iImmo, iImmo + 1100) : "";
ok(iSans > 0 && iImmo > iSans && iRpc > iImmo, "écartée APRÈS la résolution du rayon et AVANT le débit (spend_coins_and_publish)");
ok(/rows = rows\.filter\(r => !immobilierLbc\.includes\(r\.platform\)\);/.test(blocE) && /motif: categorieLbc\.motif/.test(blocE)
  && /\$\{categorieLbc\.phrase\.fr\} Rien n'a été débité\./.test(blocE)
  && A?.categorieLignesLbc?.([{ platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Immobilier", "Locations"] } }])?.phrase === A?.PHRASE_IMMOBILIER_LBC,
  "la ligne Leboncoin ne part pas ; seule cochée, la publication s'arrête sur la phrase (Immobilier : la sienne)", blocE.slice(0, 300));
const suivi = lire("src/publication/EcranSuivi.jsx");
ok(/immobilier_lbc: "la catégorie Immobilier n'est pas encore prise en charge par FillSell\. Publie cette annonce toi-même sur Leboncoin\."/.test(suivi)
  && /immobilier_lbc: "FillSell doesn't handle the Real estate category yet/.test(suivi), "l'écran de suivi dit « Leboncoin — la phrase » (FR + EN)");
const carte = lire("src/components/CarteRayon.jsx");
ok(/platform === 'leboncoin' && categorieCheminLbc\(rayon\?\.chemin\) &&/.test(carte) && /categorieCheminLbc\(rayon\?\.chemin\)\.phrase\[lang === 'en' \? 'en' : 'fr'\]/.test(carte)
  && A?.categorieCheminLbc?.(["Immobilier", "Bureaux & Commerces"])?.phrase === A?.PHRASE_IMMOBILIER_LBC,
  "la carte du rayon (stepper, lot) dit la phrase dès que le rayon Leboncoin est Immobilier");
const stock = lire("src/tabs/StockTab.jsx");
const iCopie = stock.indexOf("async function relancerParCopie(job) {");
const iRpcCopie = stock.indexOf("spend_coins_and_publish", iCopie);
const copie = iCopie > 0 && iRpcCopie > iCopie ? stock.slice(iCopie, iRpcCopie) : "";
ok(/const categorieLbc = categorieJobLbc\(full\);\n\s*if \(categorieLbc\) \{\n\s*setRelanceMsg\(categorieLbc\.phrase\[lang === 'en' \? 'en' : 'fr'\]\);\n\s*return;/.test(copie)
  && A?.categorieJobLbc?.(CAPTUREE)?.phrase === A?.PHRASE_IMMOBILIER_LBC,
  "la relance par copie d'une publication échouée (Stock) ne recrée jamais une publication Immobilier : la phrase, rien débité");

console.log("F. (16/11 soir, point 6 de Nico) Locations de vacances : la même règle, sa phrase à elle");
const PHRASE_VAC_FR = "Leboncoin : la catégorie Locations de vacances n'est pas encore prise en charge par FillSell. Publie cette annonce toi-même sur Leboncoin.";
const URL_VAC = "https://www.leboncoin.fr/ad/locations_saisonnieres/3000000001";
// Une republication telle que le serveur la crée (le lien, aucun chemin), puis une publication rangée par l'app.
const VAC_REPUB = { id: "vac-repub", platform: "leboncoin", action: "republish", status: "pending", listing_url: URL_VAC,
  platform_fields: { republish_snapshot: { listing_url: URL_VAC, platform_listing_id: "3000000001" }, processing_since: "x" } };
const VAC_PUB = { id: "vac-pub", platform: "leboncoin", action: "publish", status: "pending", platform_fields: { lbcCategoryPath: ["Locations de vacances", "Locations saisonnières"] } };
const fn = (nom) => (A && typeof A[nom] === "function" ? A[nom] : () => undefined);
{
  const { FEUILLES } = await charger("src/utils/arbres/leboncoinFeuilles.js");
  const vac = FEUILLES.filter((f) => f.chemin[0] === "Locations de vacances");
  ok(vac.length === 1 && vac[0].chemin[1] === "Locations saisonnières" && JSON.stringify(A?.FEUILLES_VACANCES_LBC) === '["Locations saisonnières"]'
    && A?.RACINE_VACANCES_LBC === "Locations de vacances" && JSON.stringify(A?.SEGMENTS_URL_VACANCES_LBC) === '["locations_saisonnieres"]',
    "la racine relevée (« Locations de vacances » › « Locations saisonnières ») et son segment de lien (locations_saisonnieres)", vac.map((f) => f.chemin));
  ok(vac.every((f) => fn("categorieCheminLbc")(f.chemin)?.cle === "locations_vacances" && A?.jobImmobilierLbc({ platform: "leboncoin", platform_fields: { lbcCategoryPath: f.chemin } })),
    "la feuille de l'arbre → catégorie non prise en charge « locations_vacances »");
  const objets = FEUILLES.filter((f) => !["Immobilier", "Locations de vacances"].includes(f.chemin[0]));
  ok(objets.length > 0 && objets.every((f) => fn("categorieCheminLbc")(f.chemin) === null) && fn("categorieCheminLbc")(["Immobilier", "Locations"])?.cle === "immobilier",
    `aucune des ${objets.length} feuilles d'objets n'est visée ; Immobilier reste Immobilier`);
  ok(fn("categorieCheminLbc")(" locations de vacances > Locations saisonnières")?.cle === "locations_vacances" && fn("categorieCheminLbc")("Locations") === null,
    "chemin écrit « A > B », casse et blancs : règle ; la feuille Immobilier « Locations » seule n'est pas la racine");
}
ok(fn("urlVacancesLbc")(URL_VAC) && fn("categorieUrlLbc")(URL_VAC)?.cle === "locations_vacances" && !A?.urlImmobilierLbc(URL_VAC)
  && fn("categorieUrlLbc")("https://www.leboncoin.fr/ad/locations/3266901489")?.cle === "immobilier" && fn("categorieUrlLbc")("https://www.leboncoin.fr/ad/vetements/6") === null,
  "le lien /ad/locations_saisonnieres/ → Locations de vacances (jamais Immobilier) ; /ad/locations/ reste Immobilier ; un objet : rien");
ok(A?.estAnnonceImmobilierLbc(VAC_REPUB) === true && A?.estAnnonceImmobilierLbc(VAC_PUB) === true,
  "une republication par son seul lien (avant toute capture) et une publication rangée → retenues (même porte que l'Immobilier)");
ok(A?.estAnnonceImmobilierLbc({ ...VAC_REPUB, platform_fields: { ...VAC_REPUB.platform_fields, republish_step: "deleted" } }) === false
  && A?.estAnnonceImmobilierLbc({ ...VAC_REPUB, action: "delete" }) === false && A?.estAnnonceImmobilierLbc({ ...VAC_PUB, platform: "vinted" }) === false,
  "une republication engagée, un retrait, une autre plateforme : jamais");
ok(A?.PHRASE_VACANCES_LBC?.fr === PHRASE_VAC_FR, "la phrase de Nico, mot pour mot", A?.PHRASE_VACANCES_LBC?.fr);
ok(/Holiday rentals/.test(A?.PHRASE_VACANCES_LBC?.en ?? "") && /yourself on Leboncoin/.test(A?.PHRASE_VACANCES_LBC?.en ?? ""), "sa version anglaise", A?.PHRASE_VACANCES_LBC?.en);
ok(A?.messageImmobilierLbc(VAC_REPUB) === `${PHRASE_VAC_FR} Ton annonce reste en ligne : rien n'a été retiré.` && A?.messageImmobilierLbc(VAC_PUB) === `${PHRASE_VAC_FR} Rien n'a été publié.`
  && A?.messageImmobilierLbc(VAC_PUB, "en") === `${A?.PHRASE_VACANCES_LBC?.en} Nothing was published.`,
  "la tâche retenue dit SA catégorie (republication : rien retiré ; publication : rien publié ; FR + EN)", A?.messageImmobilierLbc(VAC_REPUB));
{
  const pfV = A?.champsImmobilierLbc(VAC_REPUB.platform_fields, "essai", "2026-11-16T20:00:00Z") ?? {};
  const pfP = A?.champsImmobilierLbc(VAC_PUB.platform_fields, "essai", "2026-11-16T20:00:00Z") ?? {};
  ok(pfV.needs_user_source === "lbc_locations_vacances" && pfV.locations_vacances_lbc?.pose_par === "essai" && !("immobilier_lbc" in pfV) && !("processing_since" in pfV)
    && pfP.needs_user_source === "lbc_locations_vacances" && JSON.stringify(pfP.locations_vacances_lbc?.chemin) === '["Locations de vacances","Locations saisonnières"]',
    "la tâche porte sa source (lbc_locations_vacances) et sa trace, par le chemin comme par le lien", { pfV, pfP });
}
{
  const { traduireMessageServeur } = await charger("src/utils/messagesServeur.js");
  for (const j of [VAC_REPUB, VAC_PUB, LE_CAS, { ...CAPTUREE, action: "publish" }]) {
    const fr = A?.messageImmobilierLbc(j) ?? "";
    ok(traduireMessageServeur(fr, "en") === A?.messageImmobilierLbc(j, "en") && traduireMessageServeur(fr, "fr") === fr,
      `l'écrit du serveur (${j.id}/${j.action}) est lu en anglais par l'app (messagesServeur.js), inchangé en français`, traduireMessageServeur(fr, "en"));
  }
}
{
  const PUB_VAC = { id: "vac-en-ligne", platform: "leboncoin", action: "publish", status: "published", listing_url: URL_VAC, created_at: "2026-11-01T10:00:00Z", platform_fields: {} };
  const itemV = { id: 1790000000001, statut: "en_vente", titre: "Mobil-home au camping, semaine d'essai" };
  ok(R.repubEtatPlateforme(itemV, [PUB_VAC], "leboncoin") === "interdit", "l'annonce en ligne (lien /ad/locations_saisonnieres/) → « interdit », jamais proposée à la republication");
  const appelsV = { rpc: 0 };
  const fauxV = {
    from: () => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: [{ platform: "leboncoin", action: "publish", listing_url: URL_VAC, lbcCategoryPath: null }], error: null }) }; return q; },
    rpc: async () => { appelsV.rpc++; return { data: { allowed: true, job_id: "x" }, error: null }; },
  };
  const resV = await R.republierArticle(fauxV, { platform: "leboncoin", inventaireId: itemV.id });
  ok(resV?.success === false && resV?.reason === "lbc_locations_vacances" && appelsV.rpc === 0, "la porte unique refuse AVANT le serveur, avec SA raison : aucune tâche, rien débité", { resV, appelsV });
  ok(R.messageRefusRepublication(resV, "fr") === PHRASE_VAC_FR && /Holiday rentals/.test(R.messageRefusRepublication(resV, "en")), "le refus dit la phrase Locations de vacances (FR + EN)");
  ok(R.messageRefusRepublication(res, "fr") === PHRASE_FR, "l'Immobilier garde la sienne");
}
{
  const lignes = [{ platform: "vinted", platform_fields: {} }, { platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Locations de vacances", "Locations saisonnières"] } }];
  ok(JSON.stringify(A?.plateformesImmobilierLbc(lignes)) === '["leboncoin"]' && fn("categorieLignesLbc")(lignes)?.motif === "locations_vacances_lbc"
    && fn("categorieLignesLbc")([{ platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Immobilier", "Locations"] } }])?.motif === "immobilier_lbc"
    && fn("categorieLignesLbc")([{ platform: "leboncoin", platform_fields: { lbcCategoryPath: ["Divers", "Autres"] } }]) === null,
    "publication (stepper, lot) : la ligne Leboncoin en Locations de vacances est écartée, avec son motif");
  const blocF = iImmo > 0 ? lps.slice(iImmo, iImmo + 1100) : "";
  ok(/const categorieLbc = categorieLignesLbc\(rows\);/.test(blocF) && /motif: categorieLbc\.motif/.test(blocF)
    && /\$\{categorieLbc\.phrase\.en\} Nothing was charged\./.test(blocF) && /\$\{categorieLbc\.phrase\.fr\} Rien n'a été débité\./.test(blocF),
    "l'écran de publication dit la phrase de SA catégorie (motif et message d'arrêt)", blocF.slice(0, 400));
  ok(/locations_vacances_lbc: "la catégorie Locations de vacances n'est pas encore prise en charge par FillSell\. Publie cette annonce toi-même sur Leboncoin\."/.test(suivi)
    && /locations_vacances_lbc: "FillSell doesn't handle the Holiday rentals category yet\. Post this listing yourself on Leboncoin\."/.test(suivi),
    "l'écran de suivi dit « Leboncoin — la phrase Locations de vacances » (FR + EN)");
  ok(/platform === 'leboncoin' && categorieCheminLbc\(rayon\?\.chemin\) &&/.test(carte) && /categorieCheminLbc\(rayon\?\.chemin\)\.phrase\[lang === 'en' \? 'en' : 'fr'\]/.test(carte),
    "la carte du rayon dit la phrase de SA catégorie (Immobilier ou Locations de vacances)");
  ok(/const categorieLbc = categorieJobLbc\(full\);\n\s*if \(categorieLbc\) \{\n\s*setRelanceMsg\(categorieLbc\.phrase\[lang === 'en' \? 'en' : 'fr'\]\);\n\s*return;/.test(copie),
    "la relance par copie (Stock) : jamais recréée, la phrase de SA catégorie");
  const blocG = iGarde > 0 && iPoids > iGarde ? gpj.slice(iGarde, iPoids) : "";
  ok(/categorieJobLbc\(j as never\)\?\.racine/.test(blocG) && /import \{ estAnnonceImmobilierLbc, messageImmobilierLbc, champsImmobilierLbc, categorieJobLbc \} from "\.\.\/_shared\/leboncoin-immobilier\.js";/.test(gpj),
    "get-pending-jobs : la même retenue (règle partagée), son journal nomme la catégorie retenue");
}

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
