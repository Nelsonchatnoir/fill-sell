// ═══════════════════════════════════════════════════════════════════════════
// Selftest « photos gratuites » — DÉPÔT LEBONCOIN (16/10/2026)
//   node scripts/lbc-photos-gratuites-selftest.mjs [chemin/vers/leboncoin.js]
//
// LE CAS : au-delà des photos gratuites, Leboncoin active son « Pack Photos
// supplémentaires » et n'offre plus que « Valider et payer ». Une table codée
// en dur ne plafonnait que Divers > Autres (3) : PAUGUES (PRO) a eu 11 dépôts
// bloqués à 6 photos ou plus (Décoration, Collection, Montres & Bijoux), un
// autre compte pro 23 dépôts Mode > Vêtements à 7-17 photos. Et le même écran
// finissait tantôt en « relancer », tantôt en « champ_a_choisir ».
// CE QUE CE TEST PROUVE, sur les fonctions RÉELLES (extraites, jamais
// recopiées) de content-scripts/leboncoin.js et de background.js :
//   1. le nombre gratuit est LU sur la galerie du formulaire (libellé de la
//      tuile d'ajout, sinon les emplacements montrés), dans tous les cas relevés
//      dans le code du dépôt (particulier, pro, sans pack, avec pack, rayons
//      illustrés, plus de 10 gratuites) ;
//   2. seules les N premières photos partent, dans l'ordre de la fiche ; rien
//      n'est retiré quand la fiche tient dans le gratuit ; illisible = le
//      minimum de Leboncoin (3), jamais une photo payante ;
//   3. la lecture attend que le pack de la catégorie soit arrivé (deux lectures
//      identiques) ;
//   4. le bilan voyage avec tout résultat (platform_fields.photos_lbc) ;
//   5. aucun plafond codé dans l'extension (elle LIT) ; le plafond de l'app
//      (Divers > Autres = 3, posé à la création du job) reste tel quel : c'est le
//      filet des extensions d'avant pendant la mise à jour — redondant ensuite ;
//   6. le mur « Valider et payer » n'hérite jamais d'une question passée : une
//      seule source, « relancer » ; les autres attentes restent comme avant.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonction } from "./lib/vinted-taille-bac.mjs";
import { Doc, h } from "./lib/mini-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/leboncoin.js");
const SRC = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n");
const BG = readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
const lire = (f) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const ligne = (src, re) => { const m = src.match(re); if (!m) throw new Error(`introuvable : ${re}`); return m[0]; };

// ── Le bac à sable : les fonctions RÉELLES, un document fabriqué ────────────
function charger(document, { sleep = () => Promise.resolve(), page = null } = {}) {
  const corps = [
    ligne(SRC, /^const LBC_PHOTOS_GRATUITES_MINIMUM = .+;$/m),
    ligne(SRC, /^const LBC_TUILE_EN_PLUS = .+;$/m),
    ligne(SRC, /^let bilanPhotosLbc = .+;$/m),
    // Le pont monde MAIN : par défaut muet (ancienne page, canal coupé) ; `page` le fait répondre.
    "const demanderMainLbc = async (fn, args) => (page ? page(fn, args) : { ok: false, reason: 'pont muet (test)' });",
    extraireFonction(SRC, "quotaPhotosDepuisLibelle"),
    extraireFonction(SRC, "lireEmplacementsPhotosLbc"),
    extraireFonction(SRC, "quotaPhotosGratuitesLbc"),
    extraireFonction(SRC, "photosAEnvoyerLbc"),
    extraireFonction(SRC, "messageQuotaPhotosIllisibleLbc"),
    extraireFonction(SRC, "joindreBilanPhotosLbc"),
    extraireFonction(SRC, "motPhotosMurPayantLbc"),
    extraireFonction(SRC, "quotaPhotosDepuisPageLbc"),
    extraireFonction(SRC, "lireQuotaPhotosLbcStable"),
    "return { quotaPhotosDepuisLibelle, lireEmplacementsPhotosLbc, quotaPhotosGratuitesLbc, photosAEnvoyerLbc, messageQuotaPhotosIllisibleLbc, joindreBilanPhotosLbc, motPhotosMurPayantLbc, quotaPhotosDepuisPageLbc, lireQuotaPhotosLbcStable, poserBilan: (b) => { bilanPhotosLbc = b; } };",
  ].join("\n\n");
  return new Function("document", "sleep", "page", corps)(document, sleep, page);
}

// (30/10) La NOUVELLE page de dépôt, telle que relevée le 30/10 sur le compte de Nico (Mode > Vêtements) :
// composant data-qa-id « …dynamic-deposit-input-photo-v2 », zone de dépôt vide (role=button) avec son texte,
// le champ fichier À CÔTÉ de la zone (pas dedans), aucune tuile, aucune case d'emplacement avant envoi.
function pageV2(texte) {
  return new Doc([h("form", {}, h("div", { "data-rhf-name": "images" },
    h("div", { "data-qa-id": "dynamic-deposit-input-photo-v2" },
      h("p", { "aria-live": "polite", id: "notification" }),
      h("div", {}, h("div", {}, h("div", {},
        h("div", { role: "button", tabindex: "0" }, h("svg", {}), h("p", {}, texte), h("span", { "data-spark-component": "file-upload-trigger" }, "Importer"), h("p", {}, "Formats jpg ou png")),
        h("input", { type: "file", multiple: "", accept: "image/*", "aria-label": "Upload files" })))))))]);
}

// La galerie telle que le composant « photos » du dépôt la rend avant tout
// envoi (code lu le 16/10) : la question « Vos photos », la zone de dépôt
// (role=button, aria-label = libellé du bouton), puis la galerie — la tuile
// d'ajout (data-qa-id « deposit-add_photos ») et une case par emplacement
// (<button role="presentation"> vide), plus la tuile « Ajouter des photos
// supplémentaires » quand il en reste au-delà des 10 affichées.
function galerie({ libelle, emplacements = 0, illustrations = null, enPlus = false, sansSection = false }) {
  const cases = Array.from({ length: emplacements }, (_, i) => h("div", { class: "m-0" },
    h("button", { type: "button", role: "presentation" }, h("div", {}), h("span", {}, illustrations?.[i] ?? `Photo n° ${i + 1}`))));
  const grille = h("div", {},
    // L'icône de la tuile porte un titre (« Ajouter des images ») : le libellé se lit sur #refDrop.
    h("div", { class: "m-0" }, h("div", { "data-qa-id": "deposit-add_photos", "data-position": "0" }, h("span", {}, h("span", { class: "icone" }, h("svg", {}, h("title", {}, "Ajouter des images"))), h("span", { id: "refDrop" }, libelle)))),
    ...cases,
    ...(enPlus ? [h("div", { class: "m-0" }, h("div", {}, h("button", { "aria-label": "Ajouter des photos supplémentaires", role: "presentation" })))] : []));
  const zone = h("div", { class: "py-lg relative" }, h("div", { class: "relative" },
    h("div", { role: "button", "aria-label": libelle }, h("input", { type: "file" })), grille));
  const section = sansSection ? h("div", {}, zone) : h("div", {}, h("label", { for: "photo-input" }, "Vos photos"), zone);
  return new Doc([h("form", {}, section)]);
}
const fiche = (n) => Array.from({ length: n }, (_, i) => ({ type: i ? `photo_${i}` : "original", url: `https://x/${i + 1}.jpg` }));

console.log("1. Le nombre gratuit est lu sur le formulaire");
const cas = [
  { nom: "Divers > Autres (particulier) : 3 emplacements, pack au-delà", g: { libelle: "Ajouter des photos", emplacements: 3 }, attendu: [3, "emplacements"] },
  { nom: "Mode > Vêtements (particulier) : « Ajouter 20 photos », tout gratuit", g: { libelle: "Ajouter 20 photos", emplacements: 10, enPlus: true }, attendu: [20, "libelle_sans_pack"] },
  { nom: "PRO Décoration : 5 emplacements illustrés, pack au-delà", g: { libelle: "Ajouter des photos", emplacements: 5, illustrations: ["Vue d’ensemble", "Vue de face", "Vue de côté", "Vue détaillée", "Dimensions"] }, attendu: [5, "emplacements"] },
  { nom: "PRO Mode > Vêtements : 5 emplacements, pack au-delà", g: { libelle: "Ajouter des photos", emplacements: 5 }, attendu: [5, "emplacements"] },
  { nom: "plus de 10 gratuites, pack au-delà : 10 au moins (jamais plus)", g: { libelle: "Ajouter des photos", emplacements: 10, enPlus: true }, attendu: [10, "emplacements_10_au_moins"] },
  { nom: "« Ajouter jusqu’à 12 photos » (apostrophe typographique)", g: { libelle: "Ajouter jusqu’à 12 photos", emplacements: 10, enPlus: true }, attendu: [12, "libelle_sans_pack"] },
  { nom: "« Ajouter plus de 3 photos »", g: { libelle: "Ajouter plus de 3 photos", emplacements: 3 }, attendu: [3, "libelle_plus_de"] },
  { nom: "« Ajouter 3 photos supplémentaires » n'est pas un nombre GRATUIT", g: { libelle: "Ajouter 3 photos supplémentaires", emplacements: 5 }, attendu: [5, "emplacements"] },
  { nom: "pas de question « Vos photos » : repli sur « Photo n° k »", g: { libelle: "Ajouter des photos", emplacements: 4, sansSection: true }, attendu: [4, "emplacements"] },
  { nom: "rien de lisible : null (illisible)", g: { libelle: "Déposez ici", emplacements: 0, sansSection: true }, attendu: [null, "illisible"] },
];
for (const c of cas) {
  const doc = galerie(c.g);
  const S = charger(doc);
  const q = S.quotaPhotosGratuitesLbc(S.lireEmplacementsPhotosLbc(doc));
  ok(c.nom, q.gratuites === c.attendu[0] && q.source === c.attendu[1], JSON.stringify(q));
}
// (30/10) La nouvelle page de dépôt : l'ancien code y lisait « illisible » (347 lectures, 200 dépôts à 3 photos).
for (const [nom, texte, attendu] of [
  ["NOUVELLE page : « Cliquez et déposez jusqu’à 20 photos » → 20", "Cliquez et déposez jusqu’à 20 photos", [20, "libelle_v2"]],
  ["NOUVELLE page, apostrophe droite : « jusqu'à 5 photos » → 5", "Cliquez et déposez jusqu'à 5 photos", [5, "libelle_v2"]],
  ["NOUVELLE page avec pack payant : « Cliquez et ajoutez des photos » → aucun chiffre", "Cliquez et ajoutez des photos", [null, "libelle_v2_pack_payant"]],
]) {
  const doc = pageV2(texte);
  const S = charger(doc);
  const q = S.quotaPhotosGratuitesLbc(S.lireEmplacementsPhotosLbc(doc));
  ok(nom, q.gratuites === attendu[0] && q.source === attendu[1], JSON.stringify(q));
}

console.log("2. Seules les N premières partent, dans l'ordre ; jamais une photo payante");
{
  const S = charger(new Doc());
  const r1 = S.photosAEnvoyerLbc(fiche(8), { gratuites: 5, source: "emplacements" });
  ok("8 photos, 5 gratuites → les 5 premières, dans l'ordre", r1.photos.length === 5 && r1.photos.map((p) => p.url).join() === fiche(5).map((p) => p.url).join());
  ok("bilan : 5 gratuites, 8 sur la fiche, 5 envoyées", r1.bilan.gratuites === 5 && r1.bilan.fiche === 8 && r1.bilan.envoyees === 5 && r1.bilan.source === "emplacements");
  ok("une note le dit, sans vocabulaire de paiement trompeur", /5 photo\(s\) gratuite\(s\).*5 premières envoyées sur 8, aucune photo payante/.test(r1.note ?? ""), r1.note);
  const r2 = S.photosAEnvoyerLbc(fiche(4), { gratuites: 20, source: "libelle_sans_pack" });
  ok("4 photos, 20 gratuites → les 4, aucune note", r2.photos.length === 4 && r2.note === null);
  // (30/10) Plus jamais le repli silencieux à 3 : illisible + plus de 3 photos = RIEN ne part.
  const r3 = S.photosAEnvoyerLbc(fiche(15), { gratuites: null, source: "illisible" });
  ok("illisible, 15 photos → dépôt ARRÊTÉ, aucune photo retenue (jamais 3 sur 15)", r3.bloque === true && r3.photos.length === 0 && r3.bilan.arrete === true && r3.bilan.envoyees === 0 && r3.bilan.fiche === 15, JSON.stringify(r3.bilan));
  ok("…la note le dit (aucune annonce amputée)", /dépôt arrêté avant tout envoi \(15 photos sur la fiche, aucune annonce amputée\)/.test(r3.note ?? ""), r3.note);
  ok("…et le message pour la personne est court (< 300 car.) et dit quoi faire", (() => { const m = S.messageQuotaPhotosIllisibleLbc(15); return m.length < 300 && /rien n'est parti/.test(m) && /Relance/.test(m) && /3 photos sur 15/.test(m); })(), S.messageQuotaPhotosIllisibleLbc(15));
  const r4 = S.photosAEnvoyerLbc(fiche(3), { gratuites: null, source: "illisible" });
  ok("illisible mais 3 photos : tout part (le minimum gratuit), rien n'est arrêté", r4.photos.length === 3 && r4.note === null && r4.bloque === false);
  const r5 = S.photosAEnvoyerLbc(fiche(6), { gratuites: 0, source: "x" });
  ok("un zéro lu n'est jamais un quota (arrêt, pas 3)", r5.bloque === true && r5.photos.length === 0 && r5.bilan.gratuites === null);
  const r6 = S.photosAEnvoyerLbc(fiche(15), { gratuites: 20, source: "page_lbc", page: { max: 20, pack_gratuit: true } });
  ok("lu dans la page : 20 gratuites → les 15 partent, la configuration suit au bilan", r6.photos.length === 15 && r6.bloque === false && r6.bilan.source === "page_lbc" && r6.bilan.page?.max === 20);
}

console.log("3. La lecture attend que le pack de la catégorie soit arrivé");
{
  // Premier rendu : valeurs par défaut (3) ; la catégorie arrive ensuite (5, compte pro).
  let doc = galerie({ libelle: "Ajouter des photos", emplacements: 3 });
  const docProxy = { querySelector: (s) => doc.querySelector(s), querySelectorAll: (s) => doc.querySelectorAll(s) };
  let appels = 0;
  const S = charger(docProxy, { sleep: async () => { appels++; if (appels === 1) doc = galerie({ libelle: "Ajouter des photos", emplacements: 5 }); } });
  const q = await S.lireQuotaPhotosLbcStable();
  ok("3 puis 5 puis 5 → 5 (deux lectures identiques)", q.gratuites === 5, JSON.stringify(q));
  let n = 0;
  const S2 = charger(galerie({ libelle: "Ajouter 20 photos", emplacements: 10, enPlus: true }), { sleep: async () => { n++; } });
  const q2 = await S2.lireQuotaPhotosLbcStable();
  ok("page stable : une attente seulement", q2.gratuites === 20 && n === 1, `${JSON.stringify(q2)} attentes=${n}`);
  // (30/10) La cause des 347 « illisible » : deux lectures illisibles de suite valaient réponse (0,7 s).
  let doc3 = new Doc([h("form", {}, h("div", { "data-rhf-name": "images" }, h("input", { type: "file" })))]);
  const proxy3 = { querySelector: (s) => doc3.querySelector(s), querySelectorAll: (s) => doc3.querySelectorAll(s) };
  let n3 = 0;
  const S3 = charger(proxy3, { sleep: async () => { n3++; if (n3 === 3) doc3 = pageV2("Cliquez et déposez jusqu’à 20 photos"); } });
  const q3 = await S3.lireQuotaPhotosLbcStable();
  ok("galerie dessinée tard (illisible ×3 puis « jusqu'à 20 ») → 20, jamais « illisible »", q3.gratuites === 20 && q3.source === "libelle_v2", `${JSON.stringify(q3)} attentes=${n3}`);
  let n4 = 0;
  const S4 = charger(new Doc([h("form", {}, h("input", { type: "file" }))]), { sleep: async () => { n4++; } });
  const q4 = await S4.lireQuotaPhotosLbcStable();
  ok("vraiment illisible : la lecture insiste (~8 s) puis dit « illisible »", q4.gratuites === null && n4 === 12, `${JSON.stringify(q4)} attentes=${n4}`);
  // La page elle-même (packPhotoConfig, monde MAIN) passe avant les libellés.
  const appelsPage = [];
  const S5 = charger(pageV2("Cliquez et ajoutez des photos"), { page: (fn) => { appelsPage.push(fn); return { ok: true, basicPhotoLimit: 5, maxPackPhotoLimit: 20, hasFreePackPhoto: false }; } });
  const q5 = await S5.lireQuotaPhotosLbcStable();
  ok("pack payant (texte sans chiffre) mais page lisible : 5 gratuites (packPhotoConfig.basicPhotoLimit)", q5.gratuites === 5 && q5.source === "page_lbc" && q5.page?.max === 20 && q5.page?.pack_gratuit === false && appelsPage[0] === "lireQuotaPhotos", JSON.stringify(q5));
  const S6 = charger(pageV2("Cliquez et déposez jusqu’à 20 photos"), { page: () => ({ ok: false, reason: "packPhotoConfig introuvable" }) });
  const q6 = await S6.lireQuotaPhotosLbcStable();
  ok("page muette : le libellé prend le relais", q6.gratuites === 20 && q6.source === "libelle_v2", JSON.stringify(q6));
  const S7 = charger(pageV2("Cliquez et déposez jusqu’à 20 photos"), { page: () => ({ ok: true, basicPhotoLimit: 0 }) });
  ok("un zéro de la page n'est jamais un quota", (await S7.quotaPhotosDepuisPageLbc()) === null);
}

console.log("4. Le bilan voyage avec tout résultat");
{
  const S = charger(new Doc());
  ok("sans bilan : résultat inchangé", JSON.stringify(S.joindreBilanPhotosLbc({ success: true })) === '{"success":true}');
  S.poserBilan({ gratuites: 5, fiche: 8, envoyees: 5 });
  ok("succès : photosLbc joint", S.joindreBilanPhotosLbc({ success: true }).photosLbc?.envoyees === 5);
  ok("attente (Valider et payer) : photosLbc joint", S.joindreBilanPhotosLbc({ success: false, attenteUtilisateur: true }).photosLbc?.gratuites === 5);
  ok("un bilan déjà posé n'est jamais écrasé", S.joindreBilanPhotosLbc({ photosLbc: { gratuites: 3 } }).photosLbc.gratuites === 3);
  ok("le dépôt envoie le CHOIX, jamais toute la fiche", /photosAEnvoyerLbc\(job\.photos, await lireQuotaPhotosLbcStable\(\)\)/.test(SRC) && /uploadPhotos\(photoInput, choixPhotos\.photos\)/.test(SRC) && !/uploadPhotos\(photoInput, job\.photos\)/.test(SRC));
  ok("le bilan est remis à zéro à chaque dépôt", /async function fillListingForm\(job\) \{[\s\S]{0,400}bilanPhotosLbc = null;/.test(SRC));
  ok("les deux canaux (message, port) joignent le bilan", (SRC.match(/joindreBilanPhotosLbc\(result\)/g) ?? []).length === 2);
  ok("background persiste platform_fields.photos_lbc", /\.\.\.\(result\.photosLbc \? \{ photos_lbc: result\.photosLbc \} : \{\}\)/.test(BG) && /if \(job\.platform === "leboncoin" && !result\.photosLbc\) delete extras\.platform_fields\.photos_lbc;/.test(BG));
  ok("mur « Valider et payer », photos dans le gratuit lu : « ce n'est pas le pack photos »", /dans la limite gratuite affichée par Leboncoin \(5\) : ce n'est donc pas le pack photos/.test(S.motPhotosMurPayantLbc({ gratuites: 5, envoyees: 5 })));
  ok("…et rien quand le gratuit n'a pas été lu", S.motPhotosMurPayantLbc({ gratuites: null, envoyees: 3 }) === "" && S.motPhotosMurPayantLbc(null) === "");
  ok("le mur payant porte cette phrase", /\$\{MSG_LBC_PAYANT_SEULEMENT\}\$\{motPhotosMurPayantLbc\(\)\}/.test(SRC));
}

console.log("5. Aucun plafond codé dans l'extension ; celui de l'app reste le filet des extensions d'avant");
{
  const code = SRC.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n"); // sans les commentaires
  ok("leboncoin.js : aucune table de photos par catégorie", !/LBC_FREE_PHOTO_QUOTA|getLbcFreePhotoQuota|Divers\|Autres/.test(code));
  // (30/10) Le minimum ne sert plus qu'à deux choses : laisser partir une fiche de 3 photos ou moins, et le dire.
  ok("le minimum n'ampute jamais : illisible + plus de 3 photos = arrêt", /const bloque = gratuites == null && liste\.length > LBC_PHOTOS_GRATUITES_MINIMUM;/.test(code) && /const envoyees = bloque \? \[\] : liste\.slice\(0, gratuites \?\? LBC_PHOTOS_GRATUITES_MINIMUM\);/.test(code));
  const regles = lire("src/publication/moteur/regles.js");
  ok("l'app plafonne toujours Divers > Autres à la création du job (inchangée : filet des extensions d'avant)", /rowPhotos = rowPhotos\.slice\(0, quotaPhotosLbc\)/.test(regles));
}

console.log("6. Le mur « Valider et payer » n'hérite jamais d'une question passée");
{
  const corps = [
    ligne(BG, /^const MURS_SANS_QUESTION = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    ligne(BG, /^const MARQUEURS_QUESTION_PASSEE = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    extraireFonction(BG, "champsAttenteUtilisateur"),
    "return champsAttenteUtilisateur;",
  ].join("\n\n");
  const champsAttenteUtilisateur = new Function(corps)();
  const pfAvant = {
    lbcCategoryPath: ["Mode", "Vêtements"], needs_user_source: "champ_a_choisir",
    needsUserField: { field_key: "clothing_color", field_label: "Couleur*" }, needsUserFields: [{ field_key: "clothing_st" }],
    champs_a_completer: ["Taille"], server_required_fields: ["color"], needsUserBoucle: 2, needsUserAttempts: 1,
  };
  const pf = champsAttenteUtilisateur(pfAvant, { error: "Leboncoin ne propose aucune option gratuite…", photosLbc: { gratuites: 5 } }, "lbc_options_payant_seulement");
  ok("une seule source : « relancer »", pf.needs_user_source === "relancer");
  ok("les questions passées tombent (Couleur, Taille…)", ["needsUserField", "needsUserFields", "champs_a_completer", "server_required_fields", "needsUserBoucle"].every((k) => !(k in pf)));
  ok("le reste est gardé (rayon, compteur de tentatives)", pf.lbcCategoryPath?.[1] === "Vêtements" && pf.needsUserAttempts === 1);
  ok("le motif du mur est nommé (last_diagnostic.quoi)", pf.last_diagnostic?.quoi === "lbc_options_payant_seulement");
  ok("le bilan des photos suit", pf.photos_lbc?.gratuites === 5);
  ok("l'objet du job n'est pas muté", pfAvant.needs_user_source === "champ_a_choisir" && pfAvant.needsUserField);
  ok("marquerAttenteUtilisateur passe par cette règle", /platform_fields: champsAttenteUtilisateur\(job\.platform_fields, result, motif\)/.test(BG));
  const autre = champsAttenteUtilisateur(pfAvant, { error: "Le pays de ton profil Depop n'a pas pu être lu" }, "depop_lieu");
  ok("une autre attente : écriture d'avant (marqueurs et source tels quels, motif posé)", autre.needs_user_source === "champ_a_choisir" && autre.needsUserField?.field_key === "clothing_color" && autre.last_diagnostic?.quoi === "depop_lieu");
}

console.log("7. (30/10) Quota illisible : le dépôt s'arrête, nommé, la personne est prévenue");
{
  ok("l'arrêt part AVANT tout envoi de photo", /if \(choixPhotos\.bloque\) \{[\s\S]{0,500}attenteMotif: "lbc_photos_quota_illisible"[\s\S]{0,400}quitterSansEnregistrer: true,[\s\S]{0,40}\}[\s\S]{0,20}\}\s*const photoNote = await uploadPhotos\(photoInput, choixPhotos\.photos\);/.test(SRC));
  ok("le dépôt entamé est quitté sans enregistrer (aucun brouillon laissé)", /if \(avance\.quitterSansEnregistrer\) await lbcQuitterDepotSansEnregistrer\(t\)\.catch\(\(\) => null\);\s*return avance\.blocked;/.test(SRC));
  ok("le background lit le quota dans la page (packPhotoConfig, monde MAIN)", /lireQuotaPhotos: \(\) => \{[\s\S]{0,1500}packPhotoConfig[\s\S]{0,400}basicPhotoLimit/.test(BG));
  const corps = [
    ligne(BG, /^const MURS_SANS_QUESTION = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    ligne(BG, /^const MARQUEURS_QUESTION_PASSEE = Object\.freeze\(\[[\s\S]*?\]\);$/m),
    extraireFonction(BG, "champsAttenteUtilisateur"),
    "return champsAttenteUtilisateur;",
  ].join("\n\n");
  const champsAttenteUtilisateur = new Function(corps)();
  const pf = champsAttenteUtilisateur({ needsUserField: { field_key: "x" } }, { error: "…", photosLbc: { gratuites: null, fiche: 15, envoyees: 0, arrete: true } }, "lbc_photos_quota_illisible");
  ok("attente à relancer, jamais une question de champ", pf.needs_user_source === "relancer" && !("needsUserField" in pf) && pf.last_diagnostic?.quoi === "lbc_photos_quota_illisible" && pf.photos_lbc?.arrete === true);
  const etats = lire("src/utils/etatsPublication.js");
  ok("l'app nomme l'attente (« rien n'est parti, appuie sur Relancer »)", /quoi === "lbc_photos_quota_illisible"\) return \{ kind: "attente", motif: "photos_lbc" \}/.test(etats) && /motif === "photos_lbc"[\s\S]{0,300}rien n'est parti, appuie sur Relancer/.test(etats));
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ photos gratuites Leboncoin : tout passe");
process.exit(ko ? 1 : 0);
