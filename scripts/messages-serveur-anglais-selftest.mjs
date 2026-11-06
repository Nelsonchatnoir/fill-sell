// Autotest — LES MESSAGES ÉCRITS EN FRANÇAIS EN BASE, LUS EN ANGLAIS (06/11/2026, phase 3 point 1 — suite)
//   npm run selftest:messages-serveur-anglais
//
// Le serveur, les fonctions SQL et l'extension écrivent leurs phrases en français (cross_post_jobs.error, motif d'une
// vente refusée, erreurs des fonctions eBay, raisons SQL). La traduction se fait À L'AFFICHAGE
// (src/utils/messagesServeur.js), seulement en anglais. Ce test prouve :
//   1. FRANÇAIS INCHANGÉ OCTET POUR OCTET — humanizeJobError et jobErrorSansFaussePromesse rendent, en français, les
//      mêmes textes qu'avant (empreintes calculées le 06/11 avec le code de HEAD 976f13b, sur le corpus réel du
//      03/10 — 202 formes — et sur les 133 échantillons synthétiques de scripts/corpus/messages-serveur-2026-11-06.json) ;
//      traduireMessageServeur(x, 'fr') rend x lui-même ;
//   2. ANGLAIS TRADUIT — chaque échantillon sort en anglais, sans mot français ni mot de développeur ; les phrases
//      qui ont déjà une version anglaise dans le code (annulerFile, abandonPlateforme, empreinteContenu,
//      lbc-adresse-france, ebay-hors-france, texteSuiviLisible) sont traduites PAR CETTE VERSION, mot pour mot ;
//   3. MESSAGE INCONNU INCHANGÉ — en anglais, une phrase hors table ressort telle quelle ;
//   4. BRANCHEMENTS — chaque écran qui montre un texte du serveur passe par la table (et seulement en anglais).
// Aucune donnée de client dans ce test : numéros, boutiques et titres sont inventés.
import fs from "node:fs";
import crypto from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { traduireMessageServeur, NB_MESSAGES_TRADUITS } = await charger("src/utils/messagesServeur.js");
const { humanizeJobError, jobErrorSansFaussePromesse, texteSuiviLisible } = await charger("src/utils/shared.js");
const { langueDeLApp } = await charger("src/utils/langueApp.js");
const { messageAnnule } = await charger("src/utils/annulerFile.js");
const { messageAbandon } = await charger("src/utils/abandonPlateforme.js");
const { MESSAGE_ARRET_DEPOT } = await charger("src/publication/lot/regles.js");
const { messageRefusBeebsMemeContenu } = await charger("src/utils/empreinteContenu.js");
const { messageLbcHorsFrance } = await charger("supabase/functions/_shared/lbc-adresse-france.js");
const { messageClotureEbayHorsFrance, texteEbayHorsFrance } = await charger("supabase/functions/_shared/ebay-hors-france.js");
const { MESSAGE_REPUBLICATION_RETRAIT } = await charger("supabase/functions/_shared/republication-retrait.js");
const { MESSAGE_REPUBLICATION_EN_PAUSE } = await charger("supabase/functions/_shared/file-pause.js");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Un texte anglais ne porte aucun de ces mots français (les valeurs de plateforme citées — « Article vendu »,
// « Valider et payer », Nom, Prénom, Taille — n'en contiennent aucun).
const FRANCAIS = /\b(?:ton|ta|tes|rien|annonce|annonces|depuis|fiche|n['’]a|l['’]article|été|pas une vente|à ta demande|publication|republication|retrait|relance|vérification|plateforme|est|sur|dans|avec|pour)\b/i;
// Les mots qu'un vendeur ne doit jamais lire (le juge de scripts/textes-montres-selftest.mjs, réduit).
const JARGON = /\bjobs?\b|\bHTTP\b|https?:\/\/|\bnull\b|\bundefined\b|\bworker\b|platform_fields|needs_user|Observabilit|\bLIVE\s*:/i;

const corpusReel = JSON.parse(lire("scripts/corpus/messages-montres-2026-10-03.json"));
const echantillons = JSON.parse(lire("scripts/corpus/messages-serveur-2026-11-06.json"));
const jobDe = (x) => ({ platform: x.p, action: x.a, status: x.s, error: x.t, platform_fields: x.pf ?? {} });
const empreinte = (arr) => crypto.createHash("sha256").update(JSON.stringify(arr)).digest("hex");

console.log("\n1. LE FRANÇAIS NE CHANGE PAS D'UN OCTET");
ok(corpusReel.length === 202 && echantillons.length === 133, "corpus intacts (202 formes réelles du 03/10, 133 échantillons du 06/11)");
// Empreintes du français affiché, calculées avec le code de HEAD (976f13b) AVANT ce changement.
const AVANT = {
  humanizeJobError: { reel: "351929931e00b37c3a180bd3624b1a7ed23feb6b5322d89ebd7ff248912305b9", echantillons: "5c307706e66ae87dbc188d3f635e8c2d60cb8adaccaf8cf95948f2aa1f06c216" },
  jobErrorSansFaussePromesse: { reel: "1960de6c82aad7d0b9d1a5beb2d20b26d4a66102f4867641e786867f24705b64", echantillons: "5c21d2792e7fdad1ffd5976e852760a6834486ef4265b310bc69444389fc878a" },
};
for (const [nom, fn] of [["humanizeJobError", humanizeJobError], ["jobErrorSansFaussePromesse", jobErrorSansFaussePromesse]]) {
  ok(empreinte(corpusReel.map((x) => fn(jobDe(x), "fr"))) === AVANT[nom].reel, `${nom}, français : les 202 formes réelles rendent le texte d'avant (empreinte)`);
  ok(empreinte(echantillons.map((x) => fn(jobDe(x), "fr"))) === AVANT[nom].echantillons, `${nom}, français : les 133 échantillons rendent le texte d'avant (empreinte)`);
  ok(empreinte(echantillons.map((x) => fn(jobDe(x)))) === AVANT[nom].echantillons, `${nom}, langue absente (= français) : idem`);
}
const tousLesTextes = [...corpusReel.map((x) => x.t), ...echantillons.map((x) => x.t)];
ok(tousLesTextes.every((t) => traduireMessageServeur(t, "fr") === t && traduireMessageServeur(t) === t && traduireMessageServeur(t, undefined) === t),
  "traduireMessageServeur(x, 'fr' | absent) rend x lui-même, pour les 335 textes");
ok(tousLesTextes.every((t) => humanizeJobError({ platform: "vinted", status: "cancelled", error: t }, "fr") === humanizeJobError({ platform: "vinted", status: "cancelled", error: t })),
  "humanizeJobError : 'fr' et langue absente identiques");

console.log("\n2. L'ANGLAIS EST TRADUIT");
const restes = [];
for (const x of echantillons) {
  const job = jobDe(x);
  for (const [nom, fn] of [["humanizeJobError", humanizeJobError], ["jobErrorSansFaussePromesse", jobErrorSansFaussePromesse]]) {
    const fr = fn(job, "fr");
    const en = fn(job, "en");
    if (en === fr || FRANCAIS.test(en.replace(/“[^”]*”/g, "")) || JARGON.test(en)) restes.push(`${nom} ${x.p}/${x.a}/${x.s} : ${en.slice(0, 150)}`);
  }
}
ok(restes.length === 0, `les 133 échantillons sortent en anglais (humanizeJobError ET jobErrorSansFaussePromesse), sans mot français ni mot de développeur — ${NB_MESSAGES_TRADUITS} phrases dans la table`, restes.slice(0, 6).join("\n      "));

// La version anglaise qui existe déjà dans le code est celle qu'on lit.
const egal = (fr, attendu, nom) => ok(traduireMessageServeur(fr, "en") === attendu, nom, `${traduireMessageServeur(fr, "en")}\n      attendu : ${attendu}`);
for (const action of ["publish", "republish"]) {
  egal(messageAnnule({ action }, "fr"), messageAnnule({ action }, "en"), `annulerFile (${action}) : la phrase anglaise du code`);
  egal(messageRefusBeebsMemeContenu({ action }, "fr"), messageRefusBeebsMemeContenu({ action }, "en"), `refus Beebs « même contenu » (${action}) : la phrase anglaise du code`);
}
for (const p of ["Vinted", "Leboncoin", "eBay", "Beebs", "Depop"]) egal(messageAbandon(p, "fr"), messageAbandon(p, "en"), `abandon de ${p} : la phrase anglaise du code`);
egal(messageLbcHorsFrance("fr"), messageLbcHorsFrance("en"), "Leboncoin hors de France : la phrase anglaise du code");
egal(MESSAGE_ARRET_DEPOT, "Stopped at your request — nothing was listed.", "arrêt d'un dépôt à ta demande (MESSAGE_ARRET_DEPOT)");
egal("Arrêtée à ta demande — ton annonce est restée en ligne.", "Stopped at your request — your listing stayed online.", "arrêt d'une republication à ta demande (comme le parc anglais déjà écrit)");
egal(MESSAGE_REPUBLICATION_RETRAIT, "Listing removed at your request: this repost no longer applies. It removed nothing and recreated nothing.", "republication close par un retrait demandé");
egal(MESSAGE_REPUBLICATION_EN_PAUSE, "Paused at your request: your repost goes out again when you resume your queue. Your listing is still online.", "republication retenue par la pause de la file");
egal("Annulé : l'article a été supprimé du stock", "Cancelled: the item was deleted from stock", "article supprimé du stock : la phrase anglaise d'App.jsx");
for (const [site, compte] of [["US", "vendeur_essai"], ["UK", null], ["Belgium_French", "boutique-essai"], ["Germany", null]]) {
  const fr = messageClotureEbayHorsFrance(site, compte);
  const en = traduireMessageServeur(fr, "en");
  const attendu = texteEbayHorsFrance(site, "en", compte).replace(/^eBay: FillSell only publishes on eBay France — (.*)\.$/, "FillSell only publishes on eBay France: $1. Nothing was published.");
  ok(en === attendu, `eBay hors de France (${site}) : le pays et le compte de la phrase anglaise du code`, `${en}\n      attendu : ${attendu}`);
}
{
  const brut = "Impossible de vérifier l'état de cette annonce vinted après 4 tentatives (page de vérification anti-bot ou format inattendu). L'annonce N'A PAS été touchée et le job reste 'published' : vérifier à la main sur la plateforme.";
  egal(texteSuiviLisible(brut, "Vinted", false), texteSuiviLisible(brut, "Vinted", true), "« Impossible de vérifier cette annonce » : la phrase anglaise de texteSuiviLisible");
}
// Les phrases à variables : la variable passe, le reste est traduit.
egal("Annonce déjà retirée de Vinted : le n° 7000000002 n'apparaît dans aucun des deux derniers relevés complets de @boutique-essai. Rien n'a été fait sur Vinted, rien n'est à faire.",
  "Listing already removed from Vinted: no. 7000000002 appears in neither of the last two full scans of @boutique-essai. Nothing was done on Vinted, nothing to do.", "numéro et boutique gardés");
egal("Rien à retirer : l'annonce n° 300000000002 n'apparaît plus sur ton compte eBay (relevés complets du 01/11 à 10:05 et du 02/11 à 11h20). Elle est déjà retirée.",
  "Nothing to remove: listing no. 300000000002 no longer appears on your eBay account (full scans of 01/11 at 10:05 and 02/11 at 11:20). It is already removed.", "dates gardées, heures « 11h20 » écrites « 11:20 »");
egal("Republication Beebs mise en pause AVANT tout retrait : Beebs exige « Pointure » pour ce rayon et aucune valeur certaine n'a pu être posée. Ton annonce est TOUJOURS en ligne, rien n'a été touché. Choisis la valeur dans l'app : la republication repartira seule.",
  "Beebs repost paused BEFORE any removal: Beebs requires “Pointure” for this category and no certain value could be set. Your listing is STILL online, nothing was touched. Choose the value in the app: the repost will start again on its own.", "le nom du champ Beebs reste celui de Beebs");

// Raisons SQL, motifs de vente refusée, erreurs des fonctions eBay : traduites, et inchangées en français.
const SERVEUR = [
  "Le job a changé entre-temps. Actualise la file.", "Le job a changé entre-temps.", "Job introuvable.", "Ce job n’est plus à exécuter. Actualise la file.",
  "Ce job est réservé à un autre poste. Rien à exécuter ici.", "La réservation de ce poste a changé. Actualise la file.", "Ce job a été arrêté entre-temps.",
  "Session de ce poste indisponible. Reconnecte FillSell.", "Arrêtée à ta demande : rien à faire.",
  "En cours de lecture de ton annonce d'origine : elle partira toute seule avec toutes ses photos. Rien à faire.",
  "La fiche a changé ; réessaie.", "Identité non prouvée : confirme le rattachement dans tes annonces.",
  "Cette annonce est toujours en ligne sur Vinted (relevé du dressing du 03/11 à 14:05) : aucune vente n’est enregistrée.",
  "Cet article est de nouveau en ligne sur Vinted sous une autre annonce (n° 7000000003, vue le 03/11 à 14:05) : l’ancienne annonce a été remplacée, ce n’est pas une vente. Si l’article est vendu, enregistre la vente depuis sa fiche en ligne.",
  "Cette annonce a été revue en ligne sur Leboncoin le 03/11 à 14:05, après l’alerte : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.",
  "Cet article est déjà vendu : si c’est cette vente-là, touche « Déjà enregistrée » ; rien ne sera compté deux fois.",
  "Une vente est déjà liée à cette fiche. Vérifie-la dans tes ventes pour éviter de la compter deux fois.",
  "Leboncoin affichait déjà « Vendu » sur cette annonce quand FillSell l'a lue pour la première fois, le 02/11 : c'est une vente ancienne, pas une vente d'aujourd'hui. Rien n'est enregistré, rien n'est retiré ailleurs. Si tu viens d'en vendre un exemplaire, enregistre la vente depuis la fiche de l'article.",
  "Cette fiche a déjà une annonce Vinted et une annonce Beebs en ligne, et l'autre fiche en a d'autres : deux annonces d'une même plateforme, ce sont deux exemplaires. Rien n'a été regroupé.",
  "Choisis au moins un mode d'envoi.", "Indique le prix de « Colissimo » (0 pour la livraison gratuite).",
  "eBay a refusé la livraison : Invalid shipping service. (déjà fait : conditions de vente activées, paiement, retours)",
  "eBay a refusé le paiement : Policy name already exists. — eBay active tes conditions de vente (jusqu'à 24 h) : appuie de nouveau sur « Créer mes conditions eBay » un peu plus tard, tes choix seront proposés de nouveau",
  "eBay ne propose pas (ou plus) le mode d'envoi « FR_Essai » pour la France. Modes valides selon eBay : Colissimo, Mondial Relay.",
  "Session invalide", "Erreur inattendue",
];
const restesServeur = SERVEUR.filter((t) => { const en = traduireMessageServeur(t, "en"); return en === t || FRANCAIS.test(en.replace(/“[^”]*”/g, "")) || JARGON.test(en); });
ok(restesServeur.length === 0, `${SERVEUR.length} phrases du serveur (raisons SQL, ventes refusées, rattachement, fonctions eBay) traduites`, restesServeur.map((t) => traduireMessageServeur(t, "en")).join("\n      "));
ok(SERVEUR.every((t) => traduireMessageServeur(t, "fr") === t), "les mêmes, inchangées en français");
egal("eBay a refusé la livraison : Invalid shipping service. (déjà fait : conditions de vente activées, paiement, retours)",
  "eBay refused the shipping: Invalid shipping service. (already done: selling policies turned on, payment, returns)", "le motif rendu par eBay passe tel quel, les étapes faites sont traduites");
// Le refus Beebs détaillé (« la fiche porte « L » ») n'est pas une phrase de la table : il reste entier, jamais à moitié traduit.
const beebsDetail = "Beebs exige des champs encore vides pour cette catégorie : Taille. « Taille » : la fiche porte « L » mais la valeur n'a pas pu être posée. Compléter ces champs dans l'app (copie Beebs), puis relancer la publication.";
ok(traduireMessageServeur(beebsDetail, "en") === beebsDetail, "une phrase composée hors table n'est jamais traduite à moitié");

console.log("\n3. UN MESSAGE INCONNU RESTE TEL QUEL");
const inconnus = [
  "Une phrase que la table ne connaît pas, écrite un jour par le serveur.",
  "Already written in English by the server.",
  "Annulée à ta demande — ton annonce est restée en ligne. Et une suite inconnue.", // préfixe connu, phrase inconnue
  "  ", "",
];
for (const t of inconnus) ok(traduireMessageServeur(t, "en") === t, `inchangé en anglais : « ${t.slice(0, 60)} »`);
for (const v of [null, undefined, 42, { error: "Job introuvable." }]) ok(traduireMessageServeur(v, "en") === v, `valeur non textuelle rendue telle quelle (${JSON.stringify(v) ?? "undefined"})`);
{
  const job = { platform: "vinted", action: "publish", status: "cancelled", error: inconnus[0] };
  ok(humanizeJobError(job, "en") === inconnus[0] && jobErrorSansFaussePromesse(job, "en") === inconnus[0], "humanizeJobError / jobErrorSansFaussePromesse : un texte inconnu passe en anglais comme avant");
}

console.log("\n4. LA LANGUE DE L'APP ET LES BRANCHEMENTS");
const fenetre = (fsLang, nav) => ({ localStorage: { getItem: (k) => (k === "fs_lang" ? fsLang : null) }, navigator: { language: nav } });
ok(langueDeLApp(fenetre("en", "fr-FR")) === "en" && langueDeLApp(fenetre("fr", "en-US")) === "fr", "fs_lang (le réglage de l'app) prime sur le téléphone");
ok(langueDeLApp(fenetre(null, "en-GB")) === "en" && langueDeLApp(fenetre(null, "fr-BE")) === "fr" && langueDeLApp(null) === "fr", "sans réglage : la langue du téléphone ; sans navigateur : le français");
ok(langueDeLApp({ get localStorage() { throw new Error("privé"); }, navigator: { language: "en-US" } }) === "en", "stockage illisible : jamais d'exception");
const shared = lire("src/utils/shared.js");
ok((shared.match(/lang === 'en' \? traduireMessageServeur\(/g) ?? []).length === 2, "shared.js : humanizeJobError ET le brut de jobErrorSansFaussePromesse traduisent, en anglais seulement");
const toast = lire("src/components/Toast.jsx");
ok(/const affiche = lang === 'en' \? traduireMessageServeur\(message, 'en'\) : message;/.test(toast) && /\{affiche\}/.test(toast) && !/\{message\}/.test(toast), "le toast (motif d'une vente refusée, raisons du serveur) traduit en anglais seulement");
ok(/throw new Error\(traduireMessageServeur\(json\?\.error, lang\) \?\? `HTTP \$\{r\.status\}`\)/.test(lire("src/utils/ebayCompte.js")), "client des fonctions eBay : l'erreur rendue passe par la table, avec la langue de l'appelant");
ok((lire("src/stock/CreerConditionsEbay.jsx").match(/traduireMessageServeur\(data\?\.error, lang\) \|\| M\.reseau/g) ?? []).length === 2, "« Créer mes conditions eBay » : les deux erreurs d'ebay-account");
const repub = lire("src/utils/republication.js");
ok(/if \(res\?\.message\) return traduireMessageServeur\(res\.message, fr \? 'fr' : 'en'\);/.test(repub) && /traduireMessageServeur\(res\?\.error, fr \? 'fr' : 'en'\)/.test(repub), "refus d'une republication : le texte du serveur");
ok(/setErreur\(traduireMessageServeur\(r\?\.message, lang\) \?\? r\?\.reason \?\? T\.ratErreur\)/.test(lire("src/annonces/EcranRattachement.jsx")), "écran de rattachement : le refus du serveur");
ok(/\{traduireMessageServeur\(venteSuppr\.err,lang\)\}/.test(lire("src/App.jsx")), "modale de suppression d'une vente : le motif du refus");

console.log("\n5. COUVERTURE DU PARC RÉEL DU 03/10 (information)");
{
  let formes = 0, jobs = 0, formesFr = 0, jobsFr = 0;
  for (const x of corpusReel) {
    const job = jobDe(x);
    if (humanizeJobError(job, "en") === humanizeJobError(job, "fr")) { formesFr++; jobsFr += x.n; } else { formes++; jobs += x.n; }
  }
  console.log(`  · en anglais, ${formes} formes / ${jobs} jobs sortent traduites ; ${formesFr} formes / ${jobsFr} jobs restent en français (phrases anciennes, composées ou rares)`);
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ messages du serveur : français inchangé, anglais traduit, inconnu inchangé");
process.exit(ko ? 1 : 0);
