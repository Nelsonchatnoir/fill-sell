// `npm run selftest:depop-couleur-fiche` — VERROU DU POINT 5c (13/11/2026, lot « zéro problème », étape 5).
// « Depop, couleur : prise sur la fiche pour tous » (Nico). Compte 8ac5bbda : 30 publications Depop sur 49 (45 jours)
// parties SANS couleur alors que la fiche en porte une — 28 imports vinted_sync, 100 % depuis le 07/11 (096856f2 « Gris »,
// 755d1a13 « Marine », 90ff4b58 « Orange », e8cada2b « Bleu, Marine »…). Cas relus en base le 13/11 (lecture seule).
//
// Ce qu'il tient :
//   A. PAR IDENTIFIANTS (principe de Nico du 12/11) : la couleur de la fiche (libellé de la palette Vinted dans la langue
//      du compte) est lue en identifiant Vinted puis en identifiant Depop ; table Vinted → Depop = relevé Depop (19),
//      = la table de l'app ; une teinte à cheval (« Turquoise ») ne part jamais ;
//   B. L'APP (champsDepop) : copie → valeur commune → fiche ; jamais par-dessus une couleur de la copie ; une couleur
//      retirée à la main n'est jamais reposée ; la résolution passe la fiche et la valeur commune ;
//   C. LE FILET DU SERVEUR (get-pending-jobs) : une publication Depop servie sans couleur reçoit celle de la copie, sinon
//      de la fiche — tous builds, unité et lot ;
//   D. LA COPIE D'UNE REPUBLICATION : l'annonce en ligne d'abord (sa couleur à elle reste la sienne), le dépôt, puis la
//      fiche — même pour une copie par ailleurs complète ;
//   E. L'EXTENSION (0.6.187) : le relevé garde les identifiants de couleur de Depop ; la modification en place est
//      PRÉPARÉE derrière un interrupteur FERMÉ (aucun appel d'écriture), jamais par-dessus une couleur en ligne.
//
//   node --import ./scripts/loader-ext.mjs scripts/depop-couleur-fiche-selftest.mjs [--racine <dossier>]
//   (--racine : rejouer le verrou sur une autre copie du dépôt, ex. la base d'avant le correctif.)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iR = process.argv.indexOf("--racine");
const RACINE = iR > 0 ? path.resolve(process.argv[iR + 1]) : ICI;
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
const existe = (p) => fs.existsSync(path.join(RACINE, p));
let ko = 0;
let n = 0;
const dit = (nom, c, detail) => { n++; if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };
const importer = async (rel) => {
  try { return await import(pathToFileURL(path.join(RACINE, rel)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 200) }; }
};
const J = (x) => JSON.stringify(x);

const C = await importer("supabase/functions/_shared/depop-couleur.js");
const att = await importer("src/utils/depopAttributs.js");
const dp = await importer("src/utils/depopPublication.js");
const rep = await importer("supabase/functions/_shared/copie-republication-depop.js");
const RELEVE = JSON.parse(lire("docs/plateformes/depop/attributs.json")).couleur;

// Les fiches réelles (compte 8ac5bbda, inventaire.attributs, relues le 13/11).
const FICHE_096856F2 = { couleur: { v: "Gris", source: "vinted_detail" } };          // Reebok XXL, vinted_sync
const FICHE_755D1A13 = { couleur: { v: "Marine", source: "vinted_detail" } };        // jean femme, vinted_sync
const FICHE_90FF4B58 = { couleur: { v: "Orange", source: "vinted_detail" } };        // jean femme, vinted_sync
const FICHE_E8CADA2B = { couleur: { v: "Bleu, Marine", source: "releve_depop" } };   // jean homme, releve_ebay
const FICHE_9EC3B807 = { couleur: { v: "Bleu", source: "vinted_detail" } };          // Under Armour L, vinted_sync
const FICHE_8CED3803 = { couleur: { v: "Marron", source: "vinted_detail" } };        // Nike XL, vinted_sync
// Le job de publication 096856f2 tel qu'en base (clés relues : aucune couleur, ni `couleur` ni `depopCouleurs`).
const PF_096856F2 = {
  categorie_source: "moteur_depop", depopCategoryId: "menswear/tops/tshirts", depopCategoryPath: ["menswear", "tops", "tshirts"],
  depopCategoryLibelles: ["Homme", "Hauts", "T-shirts"], depopEtat: "used_excellent", depopMarque: "Reebok", depopMatieres: [],
  depopPort: 4, depopTaille: "XS", etat: "Très bon état", marque: "Reebok", taille: "XS", depop_product_id: 995000000,
};

// ═══ A ═══════════════════════════════════════════════════════════════════════
console.log("\nA. PAR IDENTIFIANTS : libellé de la fiche → identifiant Vinted → identifiant Depop");
dit("module partagé _shared/depop-couleur.js", typeof C.depopCouleursDe === "function", C.__erreur ?? "fonction absente");
if (typeof C.depopCouleursDe === "function") {
  const actifs = RELEVE.valeurs.filter((v) => v.statut === "active").map((v) => v.id);
  dit("les 19 couleurs Depop = le relevé du 08/10 (ordre compris)", J(C.DEPOP_COULEURS) === J(actifs), J(C.DEPOP_COULEURS));
  const { COULEURS_VINTED_PAR_LANGUE } = await importer("supabase/functions/_shared/couleur-posee-par-nous.js");
  const idsVinted = Object.keys(COULEURS_VINTED_PAR_LANGUE.fr).map(Number).sort((a, b) => a - b);
  const table = C.DEPOP_COULEUR_PAR_ID_VINTED;
  dit("chaque identifiant Vinted (29) a sa ligne, aucune en trop", J(Object.keys(table).map(Number).sort((a, b) => a - b)) === J(idsVinted));
  dit("aucune cible hors du relevé Depop", Object.values(table).every((v) => v === null || actifs.includes(v)));
  dit("chaque couleur Depop est atteinte", actifs.every((id) => Object.values(table).includes(id)));
  const parLibelle = att.DEPOP_COULEUR_PAR_LIBELLE ?? {};
  const ecarts = Object.entries(COULEURS_VINTED_PAR_LANGUE.fr).filter(([id, lib]) => table[id] !== parLibelle[lib]).map(([id, lib]) => `${lib}(${id})`);
  dit("même correspondance que la table de l'app (DEPOP_COULEUR_PAR_LIBELLE), lue par identifiant", ecarts.length === 0, ecarts.join(", "));
  const libsDepop = Object.fromEntries(RELEVE.valeurs.map((v) => [v.id, [...new Set([v.libelle_fr, v.libelle_en])]]));
  dit("les libellés de Depop = le relevé (fr, en)", J(C.LIBELLES_DEPOP) === J(libsDepop));
  const ids = (v) => J(C.depopCouleursDe(v).ids);
  dit("096856f2 « Gris » → grey", ids("Gris") === '["grey"]');
  dit("755d1a13 « Marine » → navy ; 90ff4b58 « Orange » → orange", ids("Marine") === '["navy"]' && ids("Orange") === '["orange"]');
  dit("e8cada2b « Bleu, Marine » → blue, navy", ids("Bleu, Marine") === '["blue","navy"]');
  dit("vinted.it (même identifiants) : « Grigio » → grey, « Blu marino » → navy, « Rosa » (5 et 24) → pink",
    ids("Grigio") === '["grey"]' && ids("Blu marino") === '["navy"]' && ids("Rosa") === '["pink"]');
  dit("autres langues (synonymes exacts de la palette) : « Black » → black, « Schwarz » → black, « Bleu marine » → navy",
    ids("Black") === '["black"]' && ids("Schwarz") === '["black"]' && ids("Bleu marine") === '["navy"]');
  dit("les identifiants et libellés de Depop eux-mêmes : « khaki », « Bourgogne » → burgundy", ids("khaki") === '["khaki"]' && ids("Bourgogne") === '["burgundy"]');
  dit("teintes à cheval ou sans équivalent : « Turquoise », « Corail », « Transparence », « Chiaro » → rien",
    ["Turquoise", "Corail", "Transparence", "Chiaro"].every((c) => ids(c) === "[]"));
  dit("inconnu → rien (« Fibre magique ») ; « Bleu gris » (deux couleurs dans un mot) → rien, jamais une voisine",
    ids("Fibre magique") === "[]" && ids("Bleu gris") === "[]");
  const r3 = C.depopCouleursDe("Rouge et Blanc, Noir");
  dit("2 au plus : « Rouge et Blanc, Noir » → red, white ; black nommée", J(r3.ids) === '["red","white"]' && J(r3.tronquees) === '["black"]');
  dit("« Nero e bianco » (italien) → black, white", ids("Nero e bianco") === '["black","white"]');
  dit("la table de l'app lit par identifiant : depopCouleurs(« Grigio ») → grey (inchangé pour le français)",
    J(att.depopCouleurs?.("Grigio")?.ids) === '["grey"]' && J(att.depopCouleurs?.("Rouge et Blanc, Noir")?.ids) === '["red","white"]');
}

// ═══ B ═══════════════════════════════════════════════════════════════════════
console.log("\nB. L'APP : la copie, puis la valeur commune, puis la fiche — jamais par-dessus");
{
  const c = (pf, o = {}) => dp.champsDepop({ icon: "👕", genre: "Homme", pf: { etat: "Très bon état", marque: "Reebok", taille: "XS", depopPort: "4", ...pf }, rayonParMoteur: true, categorieId: "menswear/tops/tshirts", ...o }).champs;
  const r1 = c({}, { ficheAttributs: FICHE_096856F2 });
  dit("096856f2 (import vinted_sync, copie sans couleur, fiche « Gris ») → depopCouleurs grey, source fiche",
    J(r1.depopCouleurs) === '["grey"]' && r1.depop_couleur_source === "fiche", J({ c: r1.depopCouleurs, s: r1.depop_couleur_source }));
  const r2 = c({}, { ficheAttributs: FICHE_E8CADA2B });
  dit("e8cada2b (fiche « Bleu, Marine ») → blue, navy", J(r2.depopCouleurs) === '["blue","navy"]', J(r2.depopCouleurs));
  const r3 = c({ couleur: "Noir" }, { ficheAttributs: FICHE_096856F2 });
  dit("une couleur sur la copie (« Noir ») : la sienne, jamais celle de la fiche", J(r3.depopCouleurs) === '["black"]' && r3.depop_couleur_source === "copie");
  const r4 = c({}, { couleurCommune: "Bleu", ficheAttributs: FICHE_096856F2 });
  dit("la valeur commune (« Bleu ») avant la fiche", J(r4.depopCouleurs) === '["blue"]' && r4.depop_couleur_source === "valeur_commune");
  const r5 = c({}, { couleurRetireeALaMain: true, ficheAttributs: FICHE_096856F2 });
  dit("couleur retirée à la main de la copie Depop : rien n'est reposé, et c'est tracé", !r5.depopCouleurs && r5.depop_couleur_source === "retiree_a_la_main");
  const r6 = c({ couleur: "Turquoise" }, { ficheAttributs: FICHE_9EC3B807 });
  dit("copie « Turquoise » (sans équivalent Depop) : rien — jamais la fiche à sa place", !r6.depopCouleurs && r6.depop_couleur_source === "copie");
  const r7 = c({});
  dit("ni copie, ni valeur commune, ni fiche : aucun champ (comme avant)", !("depopCouleurs" in r7) && !("depop_couleur_source" in r7));
  const r8 = c({ couleur: "Rouge et Blanc" });
  dit("comme avant : « Rouge et Blanc » → red, white", J(r8.depopCouleurs) === '["red","white"]');
  const res = lire("src/utils/resolutionPublication.js");
  const appel = res.slice(res.indexOf("const { champs } = champsDepop("), res.indexOf("const { champs } = champsDepop(") + 600);
  dit("la résolution (unité et lot) passe la valeur commune, la fiche et la couleur retirée à la main",
    /couleurCommune:\s*sharedFields\.couleur/.test(appel) && /ficheAttributs:/.test(appel) && /couleurRetireeALaMain:/.test(appel), appel.slice(0, 300));
}

// ═══ C ═══════════════════════════════════════════════════════════════════════
console.log("\nC. LE FILET DU SERVEUR (get-pending-jobs) : une publication servie sans couleur");
if (typeof C.couleurDepopDuJobServeur === "function") {
  const s1 = C.couleurDepopDuJobServeur({ pf: PF_096856F2, ficheAttributs: FICHE_096856F2 });
  dit("096856f2 tel qu'en base + fiche « Gris » → grey (source fiche)", J(s1?.depopCouleurs) === '["grey"]' && s1?.source === "fiche", J(s1));
  dit("755d1a13 / 90ff4b58 : navy / orange", J(C.couleurDepopDuJobServeur({ pf: PF_096856F2, ficheAttributs: FICHE_755D1A13 })?.depopCouleurs) === '["navy"]'
    && J(C.couleurDepopDuJobServeur({ pf: PF_096856F2, ficheAttributs: FICHE_90FF4B58 })?.depopCouleurs) === '["orange"]');
  dit("des identifiants déjà posés : jamais touchés", C.couleurDepopDuJobServeur({ pf: { ...PF_096856F2, depopCouleurs: ["black"] }, ficheAttributs: FICHE_096856F2 }) === null);
  const s2 = C.couleurDepopDuJobServeur({ pf: { ...PF_096856F2, couleur: "Grigio" }, ficheAttributs: FICHE_8CED3803 });
  dit("une couleur sur la copie que l'app d'avant ne lisait pas (« Grigio ») : la sienne, jamais la fiche", J(s2?.depopCouleurs) === '["grey"]' && s2?.source === "copie", J(s2));
  dit("copie « Turquoise » : rien", C.couleurDepopDuJobServeur({ pf: { ...PF_096856F2, couleur: "Turquoise" }, ficheAttributs: FICHE_096856F2 }) === null);
  dit("retirée à la main : rien", C.couleurDepopDuJobServeur({ pf: { ...PF_096856F2, depop_couleur_source: "retiree_a_la_main" }, ficheAttributs: FICHE_096856F2 }) === null);
  dit("fiche sans couleur : rien", C.couleurDepopDuJobServeur({ pf: PF_096856F2, ficheAttributs: {} }) === null);
} else dit("filet du serveur (couleurDepopDuJobServeur)", false, "fonction absente");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const i = gpj.indexOf("LA COULEUR DEPOP DE LA FICHE");
  const bloc = i >= 0 ? gpj.slice(i, i + 4500) : "";
  dit("get-pending-jobs : le bloc existe et appelle le module partagé", i >= 0 && /couleurDepopDuJobServeur\(/.test(bloc) && /from "\.\.\/_shared\/depop-couleur\.js"/.test(gpj));
  dit("   publications Depop seulement, poll d'exécution, lecture de la fiche seulement si la copie ne dit rien",
    /j\.platform === "depop" && j\.action === "publish"/.test(bloc) && /besoinFicheCouleurDepop\(/.test(bloc) && /!includeProcessing && !includeNeedsUser/.test(bloc));
  dit("   écriture seulement sur une tâche encore en attente, seulement quand quelque chose change",
    /\.eq\("status", "pending"\)/.test(bloc) && /if \(!r\) continue;/.test(bloc));
}

// ═══ D ═══════════════════════════════════════════════════════════════════════
console.log("\nD. LA COPIE D'UNE REPUBLICATION : l'annonce en ligne, le dépôt, puis la fiche");
{
  const LIEN = (slug) => `https://www.depop.com/products/${slug}/`;
  const depot = (id, inv, slug, pfx = {}) => ({ id, user_id: "8ac5bbda", inventaire_id: inv, platform: "depop", action: "publish", status: "published",
    description: "T-shirt", platform_listing_id: slug, listing_url: LIEN(slug), published_at: "2026-11-12T13:51:00Z", platform_fields: { ...PF_096856F2, ...pfx } });
  const repub = (inv, slug, pfx = {}) => ({ id: "r-" + slug.slice(-4), user_id: "8ac5bbda", inventaire_id: inv, platform: "depop", action: "republish", status: "pending",
    description: "T-shirt", platform_listing_id: slug, listing_url: LIEN(slug), platform_fields: { ...PF_096856F2, republish_step: "captured", ...pfx } });
  const S1 = "the_closeto2-reebok-taille-xxl-homme-t-shirt-eacc";
  const fiche = (a) => ({ etat: { v: "Très bon état" }, couleur: a.couleur, couleur2: a.couleur2 });
  const r1 = rep.completerCopieDepop?.({ job: repub(1794490616213000, S1), depots: [depot("096856f2", 1794490616213000, S1)], capture: null, fiche: fiche(FICHE_096856F2), le: "2026-11-13T12:00:00Z" });
  dit("096856f2 : copie complète par ailleurs, dépôt sans couleur, pas de relevé → la fiche (grey)",
    J(r1?.platform_fields?.depopCouleurs) === '["grey"]' && r1?.sources?.depopCouleurs === "fiche", J(r1?.platform_fields?.depopCouleurs ?? r1));
  const S2 = "the_cloyet72-nike-taille-xl-homme-t-shirt-a941";
  const CAP_8CED = { source: "api", categorie: "tops/tshirts", genre: "Homme", etat: "Bon état", couleur: "Marron", depop_id: 994985093 };
  const r2 = rep.completerCopieDepop?.({ job: repub(1794336421406004, S2), depots: [depot("8ced3803", 1794336421406004, S2)], capture: CAP_8CED, fiche: fiche(FICHE_8CED3803) });
  dit("8ced3803 : en ligne « Marron » (posée hors de FillSell) → brown, source annonce en ligne",
    J(r2?.platform_fields?.depopCouleurs) === '["brown"]' && r2?.sources?.depopCouleurs === "annonce_en_ligne", J(r2?.sources));
  const S3 = "the_closet7t-under-armour-taille-l-homme-5504";
  const CAP_9EC3 = { source: "api", categorie: "tops/tshirts", genre: "Homme", etat: "Bon état", couleur: "Bleu, Marine", depop_id: 993973261 };
  const r3 = rep.completerCopieDepop?.({ job: repub(1794336421406007, S3), depots: [depot("9ec3b807", 1794336421406007, S3)], capture: CAP_9EC3, fiche: fiche(FICHE_9EC3B807) });
  dit("9ec3b807 : en ligne « Bleu, Marine », fiche « Bleu » → blue, navy (la sienne, jamais la fiche par-dessus)",
    J(r3?.platform_fields?.depopCouleurs) === '["blue","navy"]', J(r3?.platform_fields?.depopCouleurs));
  const r4 = rep.completerCopieDepop?.({ job: repub(1794336421406007, S3), depots: [depot("9ec3b807", 1794336421406007, S3)], capture: { ...CAP_9EC3, couleurs_ids: ["navy"] }, fiche: fiche(FICHE_9EC3B807) });
  dit("relevé 0.6.187 : les identifiants de Depop (couleurs_ids) priment sur le libellé", J(r4?.platform_fields?.depopCouleurs) === '["navy"]', J(r4?.platform_fields?.depopCouleurs));
  const r5 = rep.completerCopieDepop?.({ job: repub(1794490616213000, S1), depots: [depot("096856f2", 1794490616213000, S1, { depopCouleurs: ["grey"] })],
    capture: { source: "api", categorie: "tops/tshirts", genre: "Homme", couleur: null }, fiche: fiche(FICHE_096856F2) });
  dit("en ligne SANS couleur alors que notre dépôt en avait envoyé une : retirée sur Depop, rien n'est remis", !r5?.platform_fields?.depopCouleurs, J(r5?.platform_fields?.depopCouleurs));
  const r6 = rep.completerCopieDepop?.({ job: repub(1794490616213000, S1, { depopCouleurs: ["black"] }), depots: [], capture: null, fiche: fiche(FICHE_096856F2) });
  dit("une couleur déjà sur la copie : jamais touchée (rien à compléter → null)", r6 === null, J(r6));
  const r7 = rep.completerCopieDepop?.({ job: repub(1794490616213000, S1), depots: [depot("096856f2", 1794490616213000, S1, { depopCouleurs: ["grey"] })], capture: null, fiche: fiche(FICHE_8CED3803) });
  dit("sans relevé de l'API : le dépôt FillSell avant la fiche (comme avant)", J(r7?.platform_fields?.depopCouleurs) === '["grey"]' && r7?.sources?.depopCouleurs === "depot_fillsell", J(r7?.sources));
  const r8 = rep.completerCopieDepop?.({ job: repub(1794490616213000, S1), depots: [], capture: null, fiche: { etat: { v: "Bon état" } } });
  dit("aucune source : rien (null — aucune écriture)", r8 === null, J(r8));
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const i = gpj.indexOf("LA COPIE D'UNE REPUBLICATION DEPOP SE COMPLÈTE AVANT LE DÉPART");
  const bloc = i >= 0 ? gpj.slice(i, i + 5200) : "";
  dit("get-pending-jobs : la copie se complète aussi quand seule la couleur manque, la fiche porte sa couleur",
    /couleurDepopACompleter\(/.test(bloc) && /couleur: attr\.couleur \?\? null/.test(bloc) && /couleur2: attr\.couleur2 \?\? null/.test(bloc), bloc.slice(0, 200));
}

// ═══ E ═══════════════════════════════════════════════════════════════════════
console.log("\nE. L'EXTENSION : le relevé garde les identifiants ; la modification en place, préparée et FERMÉE");
{
  const SLUG = "the_closet7t-under-armour-taille-l-homme-5504";
  const appels = [];
  const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corps ?? {}) });
  const ecouteurs = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} }, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date,
    Promise, RegExp, Error, TypeError, Uint8Array, globalThis: undefined, document: { cookie: "access_token=jeton" },
    setTimeout: (f) => setTimeout(f, 0), clearTimeout, crypto: globalThis.crypto,
    chrome: { runtime: { onMessage: { addListener: (f) => ecouteurs.push(f) }, sendMessage: () => Promise.resolve() } },
    fetch: async (url, init = {}) => {
      appels.push(`${init.method ?? "GET"} ${String(url).replace("https://webapi.depop.com", "")}`);
      if (String(url).endsWith(`/presentation/api/v1/products/by-slug/${SLUG}/`)) {
        return reponse(200, { id: 993973261, slug: SLUG, user_id: 77, status: "STATUS_ONSALE", description: "T-shirt",
          attributes: { colour: ["blue", "navy", "inconnue"], group: "tops", product_type: "tshirts", gender: "male", condition: "used_good", brand: "unbranded" }, pictures: [], variants_all: [] });
      }
      if (String(url).endsWith("/presentation/api/v1/users/me/")) return reponse(200, { id: 77, username: "essai", country: "FR" });
      return reponse(404);
    },
  });
  ctx.globalThis = ctx;
  vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
  vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}
;globalThis.__t = { capturerArticle,
  actif: typeof DEPOP_MODIFICATION_ACTIVE === "undefined" ? undefined : DEPOP_MODIFICATION_ACTIVE,
  permise: typeof depopModificationCouleurPermise === "function" ? depopModificationCouleurPermise : null,
  corps: typeof depopCorpsModificationCouleur === "function" ? depopCorpsModificationCouleur : null };`, ctx, { filename: "depop.js" });
  const T = ctx.__t;
  const cap = (await T.capturerArticle(SLUG))?.capture ?? null;
  dit("le relevé garde les identifiants de couleur de Depop (couleurs_ids), l'inconnu écarté", J(cap?.couleurs_ids) === '["blue","navy"]', J(cap?.couleurs_ids));
  dit("   et le libellé d'avant, inchangé (« Bleu, Marine »)", cap?.couleur === "Bleu, Marine", cap?.couleur);
  dit("modification en place : interrupteur FERMÉ (DEPOP_MODIFICATION_ACTIVE = false)", T.actif === false, String(T.actif));
  if (T.permise) {
    const produit = { id: 993973261, user_id: 77, status: "STATUS_ONSALE", attributes: { colour: [] } };
    dit("garde : annonce à soi, en vente, SANS couleur, identifiants connus → permise", T.permise({ produit, session: { id: 77 }, couleurs: ["grey"] }).ok === true);
    dit("garde : jamais par-dessus une couleur en ligne", T.permise({ produit: { ...produit, attributes: { colour: ["brown"] } }, session: { id: 77 }, couleurs: ["grey"] }).motif === "couleur_deja_posee");
    dit("garde : jamais l'annonce d'un autre compte, jamais une annonce vendue, jamais un identifiant inconnu",
      T.permise({ produit, session: { id: 78 }, couleurs: ["grey"] }).ok === false
      && T.permise({ produit: { ...produit, status: "STATUS_PURCHASED" }, session: { id: 77 }, couleurs: ["grey"] }).ok === false
      && T.permise({ produit, session: { id: 77 }, couleurs: ["gris"] }).ok === false);
  } else dit("garde pure depopModificationCouleurPermise", false, "absente");
  if (T.corps) {
    const lu = { description: "T-shirt", price_amount: "12", attributes: { condition: "used_good" }, colour: [] };
    const corps = T.corps(lu, ["grey"]);
    dit("corps de modification : la couleur seule change, le reste tel que relu", J(corps?.colour) === '["grey"]' && corps?.description === "T-shirt" && corps?.price_amount === "12" && lu.colour.length === 0, J(corps));
  } else dit("corps de modification (depopCorpsModificationCouleur)", false, "absent");
  appels.length = 0;
  const ecouteur = ecouteurs[0];
  let rep = null;
  const gere = ecouteur ? ecouteur({ type: "DEPOP_MODIFIER_COULEUR", job: { platform_listing_id: SLUG, platform_fields: { depopCouleurs: ["grey"] } } }, {}, (r) => { rep = r; }) : undefined;
  for (let k = 0; k < 20 && rep === null; k++) await new Promise((r) => setTimeout(r, 5));
  dit("message DEPOP_MODIFIER_COULEUR reconnu ; interrupteur fermé → rien d'envoyé, dit tel quel",
    gere === true && rep?.success === false && rep?.inactif === true, J(rep)?.slice(0, 200));
  dit("   aucun appel d'écriture (ni PUT, ni PATCH, ni POST, ni DELETE)", !appels.some((a) => /^(PUT|PATCH|POST|DELETE) /.test(a)), appels.join(" ; "));
  const src = lire("chrome-extension/content-scripts/depop.js");
  dit("aucun fichier annexe : la modification vit dans depop.js (rien d'autre sous chrome-extension/)", !existe("chrome-extension/content-scripts/depop-modification.js"));
  dit("le contrat d'écriture n'est pas deviné : chemin et méthode à remplir après le relevé (null)", /ecriture:\s*null/.test(src) && /methode:\s*null/.test(src));
}

console.log(`\n${ko ? `❌ ${ko} échec(s) sur ${n}` : `✅ ${n} vérifications`} — selftest:depop-couleur-fiche`);
process.exit(ko ? 1 : 0);
