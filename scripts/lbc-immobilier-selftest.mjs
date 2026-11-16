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
  ok(autres.every((f) => !A.cheminImmobilierLbc(f.chemin)), `aucune des ${autres.length} autres feuilles (Locations de vacances comprise) n'est visée`);
  ok(A.cheminImmobilierLbc(" immobilier > Locations") && !A.cheminImmobilierLbc([]) && !A.cheminImmobilierLbc(null), "chemin écrit « A > B », casse et blancs : règle ; vide : rien");
  ok(A.urlImmobilierLbc(URL_TOSCANE) && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/locations/3266901489")
    && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/ventes_immobilieres/1") && A.urlImmobilierLbc("https://www.leboncoin.fr/ad/colocations/2"),
    "les liens /ad/<ventes_immobilieres|locations|colocations|bureaux_commerces>/ → Immobilier");
  ok(!A.urlImmobilierLbc("https://www.leboncoin.fr/ad/locations_saisonnieres/5") && !A.urlImmobilierLbc("https://www.leboncoin.fr/ad/vetements/6") && !A.urlImmobilierLbc(null),
    "locations saisonnières, vêtements, lien absent : jamais");
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
ok(/import \{ estAnnonceImmobilierLbc, messageImmobilierLbc, champsImmobilierLbc \} from "\.\.\/_shared\/leboncoin-immobilier\.js";/.test(gpj), "la règle est importée par get-pending-jobs");
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
const blocE = iImmo > 0 ? lps.slice(iImmo, iImmo + 900) : "";
ok(iSans > 0 && iImmo > iSans && iRpc > iImmo, "écartée APRÈS la résolution du rayon et AVANT le débit (spend_coins_and_publish)");
ok(/rows = rows\.filter\(r => !immobilierLbc\.includes\(r\.platform\)\);/.test(blocE) && /motif: "immobilier_lbc"/.test(blocE)
  && /PHRASE_IMMOBILIER_LBC\.fr\} Rien n'a été débité\./.test(blocE), "la ligne Leboncoin ne part pas ; seule cochée, la publication s'arrête sur la phrase", blocE.slice(0, 300));
const suivi = lire("src/publication/EcranSuivi.jsx");
ok(/immobilier_lbc: "la catégorie Immobilier n'est pas encore prise en charge par FillSell\. Publie cette annonce toi-même sur Leboncoin\."/.test(suivi)
  && /immobilier_lbc: "FillSell doesn't handle the Real estate category yet/.test(suivi), "l'écran de suivi dit « Leboncoin — la phrase » (FR + EN)");
const carte = lire("src/components/CarteRayon.jsx");
ok(/platform === 'leboncoin' && cheminImmobilierLbc\(rayon\?\.chemin\) &&/.test(carte) && /PHRASE_IMMOBILIER_LBC\[lang === 'en' \? 'en' : 'fr'\]/.test(carte),
  "la carte du rayon (stepper, lot) dit la phrase dès que le rayon Leboncoin est Immobilier");
const stock = lire("src/tabs/StockTab.jsx");
const iCopie = stock.indexOf("async function relancerParCopie(job) {");
const iRpcCopie = stock.indexOf("spend_coins_and_publish", iCopie);
const copie = iCopie > 0 && iRpcCopie > iCopie ? stock.slice(iCopie, iRpcCopie) : "";
ok(/if \(jobImmobilierLbc\(full\)\) \{\n\s*setRelanceMsg\(PHRASE_IMMOBILIER_LBC\[lang === 'en' \? 'en' : 'fr'\]\);\n\s*return;/.test(copie),
  "la relance par copie d'une publication échouée (Stock) ne recrée jamais une publication Immobilier : la phrase, rien débité");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
