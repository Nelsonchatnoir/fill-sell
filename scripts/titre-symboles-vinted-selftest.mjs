// Autotest : TITRE VINTED « TROP DE SYMBOLES D'AFFILÉE » — FILLSELL CORRIGE SEUL (18/10, décision de Nico).
//
//     npm run selftest:titre-symboles-vinted
//
// Job réel 5d993767 (needs_user depuis le 15/10) : « Hoodie Streetwear "Gangs / Security" – Motif
// Bandana Paisley – Taille S ✨ », refusé en 400 par Vinted. Ce qu'il prouve, sans réseau ni base :
//   A. LA RÈGLE (_shared/titre-symboles-vinted.js) sur les refus réels ; idempotente ; la marque intacte ;
//      seuls les symboles changent (jamais une lettre, un chiffre, un accent) ;
//   B. LES TITRES ACCEPTÉS PAR VINTED ne changent pas en mode préventif (formes mesurées le 18/10 sur
//      les 70 555 titres publiés ou vendus : « – » seul, deux symboles d'affilée, ½ ⅓ comme chiffres) ;
//   C. LA MÊME RÈGLE que la copie de l'extension (background.js, assagirSymbolesVinted) ;
//   D. QUESTIONS TRANCHÉES, règle 7 : la question « Titre » du hoodie repart avec le titre strict, une fois ;
//   E. PAS-DE-ROUGE : un refus « symboles » → reprise assagie UNE fois, puis la question comme avant ;
//   F. LE CÂBLAGE : get-pending-jobs (service, publications ET républications, motif « symboles »),
//      update-job-status (titre du job passé au classement), handler-watch (règle 7).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const T = await charger("supabase/functions/_shared/titre-symboles-vinted.js");
const { assagirSymbolesVinted: assagir, retirerEmojiVinted, titreSymbolesATrancher, repriseTitreSymbolesVinted } = T;
const HOODIE = 'Hoodie Streetwear "Gangs / Security" – Motif Bandana Paisley – Taille S ✨';
const HOODIE_STRICT = 'Hoodie Streetwear "Gangs / Security" - Motif Bandana Paisley - Taille S';
// Les lettres, chiffres et accents d'un titre, dans l'ordre : ils ne doivent jamais bouger.
const mots = (s) => [...String(s)].filter((c) => /[\p{L}\p{N}\p{M}]/u.test(c)).join("");

// ── A. La règle sur les refus réels ─────────────────────────────────────────
console.log("A. Les refus réels");
ok(assagir(HOODIE, { marque: "Gang", strict: true }) === HOODIE_STRICT, "hoodie 5d993767 (strict) : « \" – » → « \" - », « – » → « - », ✨ retiré", assagir(HOODIE, { marque: "Gang", strict: true }));
ok(assagir(HOODIE, { marque: "Gang" }) === 'Hoodie Streetwear "Gangs / Security" - Motif Bandana Paisley – Taille S', "hoodie (préventif) : seul le « – » collé au guillemet change, le « – » seul reste");
ok(assagir("TEST FillSell — Paris 2024 — ne pas acheter") === "TEST FillSell - Paris 2024 - ne pas acheter", "R1 : « — » → « - » (TEST FillSell)");
ok(assagir("Une, deux, trois... Princesses tome 6 – À l'école du royaume") === "Une, deux, trois Princesses tome 6 – À l'école du royaume", "R2 : « ... » retiré, le « – » seul gardé en préventif");
ok(assagir("Une, deux, trois... Princesses tome 6 – À l'école du royaume", { strict: true }) === "Une, deux, trois Princesses tome 6 - À l'école du royaume", "strict : le « – » seul devient « - »");
ok(assagir("… Bruder — Neuf en boîte") === "Bruder - Neuf en boîte", "R2 + R1 : « … » en tête retiré, « — » → « - »");
ok(assagir("trois...Princesses") === "trois Princesses", "R2 : une espace quand le retrait collerait deux mots");
ok(assagir("Robe !!! neuve") === "Robe ! neuve", "R4 : trois symboles d'affilée → le premier séparateur");
ok(assagir('Sac "Ma marque" (neuf) - #vintage') === 'Sac "Ma marque" (neuf) - vintage', "R4 : guillemets et parenthèses gardés, le premier séparateur gardé, le reste retiré");
ok(assagir("Lot – (2) jouets") === "Lot - (2) jouets", "R3 : « – » collé à une parenthèse (espaces ignorés) → « - »");
for (const [t, m] of [[HOODIE, "Gang"], ["TEST FillSell — Paris 2024 — ne pas acheter", null], ["… Bruder — Neuf en boîte", null], ["Robe !!! neuve", null], ["Une, deux, trois... Princesses tome 6 – À l'école du royaume", null]]) {
  for (const strict of [false, true]) {
    const a = assagir(t, { marque: m, strict });
    ok(assagir(a, { marque: m, strict }) === a, `idempotent (${strict ? "strict" : "préventif"}) : « ${t.slice(0, 32)}… »`);
    ok(mots(a) === mots(retirerEmojiVinted(t)), `aucune lettre, aucun chiffre touché (${strict ? "strict" : "préventif"}) : « ${t.slice(0, 32)}… »`);
  }
}
ok(assagir("Jean C&A — taille 38 !!!", { marque: "C&A" }) === "Jean C&A - taille 38 !", "la marque « C&A » masquée : jamais touchée");
ok(assagir("Coffret !!!Mania... édition", { marque: "!!!Mania" }).includes("!!!Mania"), "une marque faite de symboles reste entière");
ok(assagir("Levi's 501 — W32", { marque: "Levi's" }) === "Levi's 501 - W32", "« Levi's » intacte");
ok(assagir("") === "" && assagir(null) === "", "titre vide : vide");

// ── B. Les titres acceptés par Vinted ne changent pas ───────────────────────
console.log("B. Les formes acceptées par Vinted (mesurées le 18/10) ne changent pas");
const acceptes = [
  // Réels, publiés le 18/10 : « ½ » et « ⅓ » sont des CHIFFRES (\p{N}), pas des symboles.
  "Chemise HUGO Hugo Boss Slim Fit Easy Iron Bleu Rayée Homme Taille 44 / 17½ – XL – Authentique",
  "Adidas Stan Smith beige / crème cuir – Taille 41⅓ – Bon état",
  "Adidas Originals New York vert/blanc – 41 ⅓ – neuves avec boîte",
  // Les suites de deux symboles les plus fréquentes du parc (« ) - » 418, « \" - » 171, « - # » 118…).
  "Robe Zara (S) - neuve", 'Pull "Noël" - taille M', "Jean slim - #vintage", "Lot (2)(3) jouets", "Veste (M) #y2k",
  "Sac (cuir) (noir)", "Ensemble (10€) bébé", "Chemise “Oxford” - bleu", "Jupe (S) | neuve", 'Tee-shirt "Paris" (L)',
  "Short M. - été", "Robe (S), neuve", "Pull - \"laine\"", "Lot 3 + (2) livres", "T-shirt 100% - coton", "Bottes 38 -- cuir",
  "Pantalon 36/38 - noir", "Jean W32 L34 – Levi's", "Robe – Taille 38 – Très bon état", "Livre .. tome 2",
];
for (const t of acceptes) ok(assagir(t) === t, `inchangé : « ${t} »`, assagir(t));
ok(assagir("Robe  Zara   neuve") === "Robe  Zara   neuve", "un titre que rien ne vise ressort À L'IDENTIQUE (espaces compris)");
for (const t of ["Robe 🌸 fleurie", "Sweat 🔥🔥 noir", "Haltères 🏋️‍♂️ lot", "Maillot 🇫🇷 2018"]) {
  ok(assagir(t) === retirerEmojiVinted(t), `emoji seuls : rien de plus que ce que l'extension retire déjà (« ${t} »)`);
}
ok(T.titreStrictUtile("Robe rouge taille 38", null) === null, "un titre sans symbole : aucune reprise utile");
ok(T.titreStrictUtile("Robe 🌸 rouge", null) === null, "emoji seuls : aucune reprise utile (l'extension les retire déjà)");

// ── C. La même règle que l'extension ────────────────────────────────────────
console.log("C. Même règle que la copie de l'extension (background.js)");
const bg = lire("chrome-extension/background.js");
const debut = bg.indexOf("const VINTED_TITRE_GARDES");
const fin = debut >= 0 ? bg.indexOf("\nfunction sanitizeJob", debut) : -1;
const debutEmoji = bg.indexOf("function stripEmoji(");
const finEmoji = debutEmoji >= 0 ? bg.indexOf("\n}\n", debutEmoji) : -1;
if (debut < 0 || fin < 0 || debutEmoji < 0 || finEmoji < 0) {
  console.log("  ⚠ copie de l'extension introuvable dans background.js : parité non vérifiée");
} else {
  const ext = new Function(`${bg.slice(debutEmoji, finEmoji + 2)}\n${bg.slice(debut, fin)}\nreturn { stripEmoji, assagirSymbolesVinted };`)();
  const corpus = [HOODIE, "TEST FillSell — Paris 2024 — ne pas acheter", "Une, deux, trois... Princesses tome 6 – À l'école du royaume",
    "… Bruder — Neuf en boîte", "trois...Princesses", "Robe !!! neuve", 'Sac "Ma marque" (neuf) - #vintage', "Lot – (2) jouets",
    "Jean C&A — taille 38 !!!", "Levi's 501 — W32", ...acceptes];
  for (const t of corpus) {
    const m = /C&A/.test(t) ? "C&A" : /Levi's/.test(t) ? "Levi's" : /Gangs/.test(t) ? "Gang" : null;
    const e = ext.assagirSymbolesVinted(ext.stripEmoji(t), { marque: m });
    ok(assagir(t, { marque: m }) === e, `serveur = extension : « ${t.slice(0, 40)}… »`, { serveur: assagir(t, { marque: m }), extension: e });
  }
}

// ── D. Questions tranchées, règle 7 ─────────────────────────────────────────
console.log("D. handler-watch, règle 7 : la question « Titre » repart seule");
const MAINTENANT = "2026-10-18T16:00:00.000Z";
const jobHoodie = {
  id: "5d993767-eeae-40dd-8480-a82555f7737b", platform: "vinted", action: "publish", status: "needs_user", title: HOODIE,
  error: "Vinted refuse le titre de cette annonce : « Le titre contient trop de symboles d'affilée ». Rien n'a été publié.",
  platform_fields: {
    marque: "Gang", needs_user_source: "champ_a_choisir", needs_user_vu_le: "2026-10-16T08:00:00Z",
    needsUserField: { target: { key: "titre_saisi", root: null }, platform: "vinted", field_key: "title", input_type: "text", field_label: "Titre" },
    titre_refuse: { le: "2026-10-15T18:09:37.895Z", motif: "Le titre contient trop de symboles d'affilée" },
  },
};
const r7 = titreSymbolesATrancher(jobHoodie, MAINTENANT);
ok(r7 && r7.apres === HOODIE_STRICT, "hoodie 5d993767 : titre strict posé", r7?.apres);
ok(r7 && r7.platform_fields.titre_saisi === HOODIE_STRICT && r7.platform_fields.titre_refuse?.motif, "titre_saisi posé, titre_refuse GARDÉ (get-pending-jobs écrira le titre sur le job)");
ok(r7 && !("needsUserField" in r7.platform_fields) && !("needs_user_source" in r7.platform_fields) && !("needs_user_vu_le" in r7.platform_fields), "la question tombe (needsUserField, needs_user_source, compteurs d'attente)");
ok(r7 && r7.platform_fields.titre_symboles_assagi?.avant === HOODIE && r7.platform_fields.titre_symboles_assagi?.le === MAINTENANT, "trace titre_symboles_assagi {le, avant, apres}");
ok(r7 && Array.isArray(r7.platform_fields.erreurs_archivees) && /trop de symboles/.test(r7.platform_fields.erreurs_archivees.at(-1)?.erreur ?? ""), "l'erreur affichée est archivée");
ok(titreSymbolesATrancher({ ...jobHoodie, platform_fields: r7.platform_fields, status: "needs_user" }, MAINTENANT) === null, "une seule passe : un job déjà assagi garde la question au refus suivant");
ok(titreSymbolesATrancher({ ...jobHoodie, platform_fields: { ...jobHoodie.platform_fields, titre_refuse: { motif: "Le titre contient trop de lettres majuscules" } } }) === null, "un autre motif de refus : jamais tranché ici");
ok(titreSymbolesATrancher({ ...jobHoodie, platform: "leboncoin" }) === null, "Vinted seulement");
ok(titreSymbolesATrancher({ ...jobHoodie, status: "pending" }) === null, "needs_user seulement");
ok(titreSymbolesATrancher({ ...jobHoodie, platform_fields: { ...jobHoodie.platform_fields, needsUserField: { target: { key: "etat" } } } }) === null, "la question « Titre » seulement (target titre_saisi)");
ok(titreSymbolesATrancher({ ...jobHoodie, title: "Robe rouge taille 38 ✨" }) === null, "rien de plus que ce que Vinted a reçu : la question reste");
ok(titreSymbolesATrancher({ ...jobHoodie, action: "republish" })?.apres === HOODIE_STRICT, "republication : même geste qu'une réponse de la personne");

// ── E. Pas-de-rouge ─────────────────────────────────────────────────────────
console.log("E. pas-de-rouge : refus « symboles » → reprise assagie UNE fois, puis la question");
const { classerEchec } = await charger("supabase/functions/_shared/pas-de-rouge.js");
const brut = 'HTTP 400 {"code":99,"message":"validation_error","errors":[{"field":"title","value":"Le titre contient trop de symboles d\'affilée"}]}';
const s1 = classerEchec({ platform: "vinted", action: "publish", brut, titre: HOODIE, pf: { marque: "Gang" } });
ok(s1.verdict === "reprise" && s1.statut === "pending" && s1.motif === "vinted_titre_assagi" && s1.dansMinutes >= 1, "1er refus : reprise, aucune question", s1);
ok(s1.pf?.titre_saisi === HOODIE_STRICT && s1.pf?.titre_refuse?.motif && s1.pf?.titre_symboles_assagi?.apres === HOODIE_STRICT, "pf : titre_refuse, titre_saisi, titre_symboles_assagi");
ok(!/✋|Compléter|Écris/.test(s1.message) && s1.message.includes(HOODIE_STRICT), "le message dit le nouveau titre, aucun geste demandé");
const s2 = classerEchec({ platform: "vinted", action: "publish", brut, titre: HOODIE_STRICT, pf: { marque: "Gang", ...s1.pf }, titreDejaAssagi: true });
ok(s2.verdict === "a_toi" && s2.source === "champ_a_choisir" && s2.motif === "vinted_titre_refuse", "2e refus (passe faite) : la question « Titre », comme avant", s2);
const s2b = classerEchec({ platform: "vinted", action: "publish", brut, titre: HOODIE_STRICT, pf: { marque: "Gang", titre_symboles_assagi: { le: MAINTENANT } } });
ok(s2b.verdict === "a_toi", "le marqueur dans pf suffit aussi");
const s3 = classerEchec({ platform: "vinted", action: "publish", brut, titre: "Robe rouge", pf: {} });
ok(s3.verdict === "a_toi" && s3.motif === "vinted_titre_refuse", "titre sans symbole à retirer : la question tout de suite");
const majus = 'HTTP 400 {"code":99,"message":"validation_error","errors":[{"field":"title","value":"Le titre contient trop de lettres majuscules"}]}';
ok(classerEchec({ platform: "vinted", action: "publish", brut: majus, titre: HOODIE, pf: {} }).motif === "vinted_titre_refuse", "un refus « majuscules » n'est pas touché par cette règle");
ok(classerEchec({ platform: "vinted", action: "republish", brut, titre: HOODIE, pf: { marque: "Gang" } }).motif === "vinted_titre_assagi", "republication : même reprise");
ok(classerEchec({ platform: "vinted", action: "publish", brut, pf: { marque: "Gang" } }).verdict === "a_toi", "titre inconnu de l'appelant : la question (rien n'est deviné)");
ok(repriseTitreSymbolesVinted({ titre: HOODIE, pf: {}, motifRefus: "autre chose" }) === null, "repriseTitreSymbolesVinted : motif « symboles » seulement");

// ── F. Le câblage ───────────────────────────────────────────────────────────
console.log("F. Le câblage serveur");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/import \{ assagirSymbolesVinted, retirerEmojiVinted \} from "\.\.\/_shared\/titre-symboles-vinted\.js";/.test(gpj), "get-pending-jobs importe la règle");
const blocServi = gpj.slice(gpj.indexOf("── TITRE VINTED : TROP DE MAJUSCULES"), gpj.indexOf("── « UNIVERS » ET « PRODUIT » LEBONCOIN"));
ok(/\(j\.action !== "publish" && j\.action !== "republish"\)/.test(blocServi), "service : publications ET républications");
ok(/assagirSymbolesVinted\(servi, \{ marque: marqueJ \}\)/.test(blocServi) && /motifs\.push\("symboles"\)/.test(blocServi), "service : symboles en trop retirés, motif « symboles »");
ok(/let servi = j\.action === "publish" \? tempererMajuscules\(j\.title, marqueJ\) : j\.title;/.test(blocServi), "service : les majuscules restent publish seulement");
ok(/j\.title_servi_tempere = \{ avant: j\.title, apres: servi, motif \}/.test(blocServi) && !/\.update\(/.test(blocServi), "service : trace title_servi_tempere, job en base jamais réécrit");
ok(/if \(!pf\.titre_refuse \|\| titreVide\(pf\[CLE_TITRE_SAISI\]\) \|\| !titreRecevable\(pf\[CLE_TITRE_SAISI\]\)\) continue;/.test(gpj), "get-pending-jobs écrit titre_saisi sur le job (bloc du 15/10) — jamais une réponse générique (24/10, B4)");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/select\("platform, action, title, platform_fields"\)\.eq\("id", jobId\)\.maybeSingle\(\);\n\s*const pfBase = /.test(ujs), "update-job-status lit le titre du job avant le classement");
ok(/titre: typeof jPdr\?\.title === "string" \? jPdr\.title : "",/.test(ujs) && /titreDejaAssagi: Boolean\(pfBase\["titre_symboles_assagi"\]/.test(ujs), "update-job-status passe le titre et la passe déjà faite");
const qt = lire("supabase/functions/_shared/questions-tranchees.ts");
ok(/\.select\("id, user_id, platform, action, status, inventaire_id, created_at, error, title, platform_fields"\)/.test(qt), "questions-tranchees lit le titre");
ok(/const r = titreSymbolesATrancher\(j, maintenant\);[\s\S]{0,300}\.update\(\{ status: "pending", error: null, platform_fields: r\.platform_fields \}\)\s*\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(qt), "règle 7 : compare-and-swap sur needs_user, pending, erreur effacée");
ok(/import \{ titreSymbolesATrancher \} from "\.\/titre-symboles-vinted\.js";/.test(qt), "questions-tranchees importe la règle");

console.log(ko ? `\n❌ selftest:titre-symboles-vinted — ${ko} échec(s)` : "\n[selftest:titre-symboles-vinted] OK — trop de symboles : corrigé seul, une fois, la marque et les mots intacts.");
process.exit(ko ? 1 : 0);
