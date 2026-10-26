// ═══════════════════════════════════════════════════════════════════════════
// BLOC D DU 26/10 (XEWER et Nico) — `npm run selftest:bloc-d-2610`
// ═══════════════════════════════════════════════════════════════════════════
//   D1. L'Âge Beebs d'un jeu vidéo se déduit du classement RÉPONDU dans la même publication (Vinted « Classement du
//       contenu », eBay « Classification ») ou gardé sur la fiche — PEGI, USK, et l'ESRB qui dit un âge minimum.
//       Jamais deviné : « E – Tous publics », « Non précisé », rien du tout → la question, comme avant.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

console.log("D1. L'Âge Beebs d'un jeu vidéo, depuis le classement répondu");
const A = await imp("supabase/functions/_shared/champs-requis-auto.js");
const J = await imp("src/utils/jeuxVideo.js");
const AGES = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
const JEUX = ["Jeux, jouets et loisirs", "Multimédia", "Jeux vidéo"];
const age = (classement, textes = ["Call of Duty Black Ops 4 – PS4"]) => A.ageBeebsAuto({ chemin: JEUX, textes, classement, allowedValues: AGES })?.valeur ?? null;
// Les 9 jeux de XEWER redemandés en 10 jours : leurs classements répondus sur Vinted.
ok(age("PEGI 7") === "6 ans - 8 ans" && age("PEGI 16") === "16 ans et +" && age("PEGI 3") === "3 ans - 4 ans", "PEGI répondu : la table du 25/09 (7 → 6-8 ans, 16 → 16 ans et +, 3 → 3-4 ans)");
ok(age("M – 17 ans et plus") === "16 ans et +", "ESRB « M – 17 ans et plus » (3 jeux de XEWER) → « 16 ans et + »");
ok(age("E10+ – 10 ans et plus") === "8 ans - 12 ans", "ESRB « E10+ » (Kirby) → « 8 ans - 12 ans » (la tranche qui contient 10)");
ok(age("T – 13 ans et plus") === "12 ans - 16 ans" && age("AO – Réservé aux adultes") === "16 ans et +", "ESRB T et AO → la tranche qui contient leur âge minimum");
ok(age("E – Tous publics") === null && age("Non précisé") === null && age("RP – En attente de classement") === null && age("USK 0") === null, "aucun âge minimum (E, RP, Non précisé, USK 0) → la question reste");
ok(age("") === null, "rien de répondu ni d'écrit → la question reste (jamais deviné d'après le titre)");
ok(age("", ["Jeu Mario M - très bon état"]) === null, "une lettre « M » dans le texte libre n'est jamais un classement ESRB");
ok(age("", ["Call of Duty PEGI 18"]) === "16 ans et +", "un PEGI écrit dans l'annonce, comme avant");
for (const [c, v] of [["E10+ – 10 ans et plus", "8 ans - 12 ans"], ["T – 13 ans et plus", "12 ans - 16 ans"], ["M – 17 ans et plus", "16 ans et +"], ["AO – Réservé aux adultes", "16 ans et +"]]) {
  ok(J.ageBeebsDuClassement(c) === v && J.VINTED_CLASSEMENTS.includes(c), `la table du serveur (ageBeebsDuClassement) lit « ${c} », écrit comme la liste de Vinted`);
}
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/classementFiche: String\(edited\?\.vinted\?\.platform_fields\?\.vintedAspects\?\.\[VINTED_CHAMP_CLASSEMENT\]\s*\|\| edited\?\.ebay\?\.platform_fields\?\.ebayAspects\?\.\[EBAY_ASPECT_CLASSEMENT\] \|\| vF\("classement_age"\) \|\| ""\)/.test(lps),
  "le moteur lit le classement répondu dans CETTE publication (Vinted, puis eBay), avant celui de la fiche");

console.log("\nD2. Le colis Leboncoin par défaut (Réglages › Expédition), pour les nouvelles annonces sans poids");
const P = await imp("src/utils/choixPoidsLeboncoin.js");
ok(JSON.stringify(P.colisDefautValide({ format: "Petit", poids_g: 500 })) === JSON.stringify({ format: "Petit", poids_g: 500 }), "taille + poids valides : gardés");
ok(P.colisDefautValide({ format: "Lettre", poids_g: 0 }) === null && P.colisDefautValide(null) === null, "une taille hors des trois de Leboncoin, un poids nul : rien n'est appliqué");
ok(P.colisDefautValide({ format: "Moyen" })?.poids_g === null && P.colisDefautValide({ poids_g: "1200" })?.format === null, "la taille seule, ou le poids seul, suffisent");
ok(P.colisDefautValide({ poids_g: 40000 }) === null, "au-delà de 30 kg (Leboncoin ne livre pas) : refusé");
ok(P.colisDefautDesReglages({ leboncoin: { colis_defaut: { format: "Volumineux", poids_g: 3000 } } })?.format === "Volumineux", "lu dans platform_settings.leboncoin.colis_defaut");
ok(P.poidsAvecDefaut(650, { poids_g: 500 }) === 650, "le poids de la fiche passe toujours devant le défaut");
ok(P.poidsAvecDefaut(null, { poids_g: 500 }) === 500 && P.poidsAvecDefaut(null, null) === null, "sans poids de fiche : le défaut ; sans défaut : rien (Leboncoin estime)");
const F = await imp("src/publication/lot/ficheLue.js");
ok(F.poidsAffiche({}, {}, { poids_g: null }, 500) === 500 && F.poidsParDefaut({}, {}, { poids_g: null }, 500), "le lot montre le poids par défaut, dit « par défaut »");
ok(F.poidsAffiche({}, { poids: 900 }, { poids_g: null }, 500) === 900 && !F.poidsParDefaut({}, { poids: 900 }, null, 500), "le poids choisi dans le lot passe devant, et n'est plus « par défaut »");
const hook = lire("src/utils/useChoixPoidsLeboncoin.js");
ok(/fusionnerReglages\(\['leboncoin'\], \{ \[CLE_COLIS_DEFAUT_LBC\]: v \}\)/.test(hook) && /fusionnerReglages\(\['leboncoin'\], null, \[CLE_COLIS_DEFAUT_LBC\]\)/.test(hook), "écrit par platform_settings_fusionner seulement (jamais l'objet entier) ; « Ne plus rien appliquer » supprime la clé");
ok(/const poids = poidsDeLaFiche \?\? defaut\?\.poids_g \?\? null;/.test(lps) && /if \(defaut\?\.format && !String\(pf\.format_colis \?\? ""\)\.trim\(\)\)/.test(lps), "le stepper (et le lot, qui le pilote) pose le poids et la taille par défaut sur la copie Leboncoin, jamais par-dessus une valeur connue");
ok(/const poidsDefautBeebs = poidsDeLaFiche == null && plateformesAPublier\.includes\("beebs"\)/.test(lps), "le même poids sert à Beebs : rangé sur la fiche quand elle n'en a aucun");
const plan = lire("src/reglages/plan.js"), page = lire("src/reglages/ReglagesPage.jsx");
ok(/id: 'colis-lbc'[\s\S]{0,120}ouvre: 'colis-lbc'/.test(plan) && /'colis-lbc':\s*\{ titre: \(T\) => T\.colisLbcDefaut, Composant: ColisLeboncoinParDefaut \}/.test(page), "Réglages › Expédition › « Colis Leboncoin par défaut »");

console.log("\nD3. Titre, description et prix générés à la demande (réglage, éteint par défaut)");
const RD = lire("src/utils/redactionALaDemande.js");
const { redactionALaDemandeDesReglages } = await import(pathToFileURL(join(RACINE, "scripts/loader-ext.mjs")).href).then(() => imp("src/utils/redactionALaDemande.js")).catch(() => ({}));
if (redactionALaDemandeDesReglages) {
  ok(redactionALaDemandeDesReglages({}) === false && redactionALaDemandeDesReglages(null) === false, "défaut inchangé : rien de réglé → FillSell écrit comme avant");
  ok(redactionALaDemandeDesReglages({ redaction: { a_la_demande: true } }) === true && redactionALaDemandeDesReglages({ redaction: { a_la_demande: "oui" } }) === false, "allumé seulement par la valeur true");
} else {
  ok(/r\.a_la_demande === true/.test(RD), "allumé seulement par la valeur true (lecture du fichier : import navigateur)");
}
ok(/fusionnerReglages\(\[CLE_REGLAGE_REDACTION\], \{ a_la_demande: true \}\)/.test(RD) && /fusionnerReglages\(\[CLE_REGLAGE_REDACTION\], null, \['a_la_demande'\]\)/.test(RD), "écrit par platform_settings_fusionner seulement ; l'éteindre supprime la clé");
ok(/title:\s+aLaDemande && titreFiche \? titreFiche : \(data\.platforms\[p\]\?\.title \?\? ""\)/.test(lps) && /description:\s+aLaDemande \? descriptionFiche : \(data\.platforms\[p\]\?\.description \?\? ""\)/.test(lps),
  "à la demande, les copies reçoivent le titre et la description de la FICHE (la rédaction tourne : rayon, caractéristiques)");
ok(/setPrice\(prev => \(aLaDemande \? prev : \(data\.price \?\? prev\)\)\)/.test(lps) && /res\?\.prix_vente_suggere != null && !redactionALaDemandeConnue\(userId\)/.test(lps), "le prix reste celui de la fiche (ni la rédaction, ni l'estimation des photos)");
ok(/const genererChamp = \(champ\) =>/.test(lps) && /texteGenereRef\.current = \{ \.\.\.texteGenereRef\.current, \[champ\]: true \}/.test(lps), "« Générer » pose ce que FillSell a écrit, champ par champ — et ce champ redevient « écrit par FillSell » (règles 4 et 5)");
ok(/descriptionVideALaDemande \|\|/.test(lps) && /Description à écrire \(ou « Générer »\)/.test(lps), "une description vide ne part jamais : le bouton le dit");
const Rg = await imp("src/publication/lot/regles.js");
const mALD = { redactionALaDemande: true, generales: { titre: "Pull", description: "" }, edited: { vinted: { description: "" } }, texteVendeur: { titre: "Pull", description: "" }, texteGenere: {} };
ok(Rg.texteARelire(mALD) === false, "à la demande : jamais « Texte écrit par FillSell » pour le texte de la personne");
ok(Rg.texteARelire({ ...mALD, generales: { description: "Joli pull" }, texteGenere: { description: true } }) === true, "… sauf la description qu'elle vient de faire générer");
ok(Rg.descriptionDuMoteur(mALD) === "" && Rg.descriptionDuMoteur({ edited: { leboncoin: { description: " x " } } }) === "x", "la description qui partirait se lit (général, sinon une copie)");
const fa = lire("src/publication/lot/FicheArticle.jsx");
ok(/generer\("titre"\)/.test(fa) && /generer\("description"\)/.test(fa) && /generer\("prix"\)/.test(fa), "la pop-up de l'article (lot et « Vérifier ») : « Générer » sur le titre, la description, le prix");
const pref = lire("src/reglages/SousPagePreferences.jsx");
ok(/useRedactionALaDemande\(c\.user\?\.id \?\? null\)/.test(pref) && /<Toggle checked=\{redaction\.aLaDemande\}/.test(pref), "Réglages › Préférences › Rédaction : l'interrupteur");

console.log("\nD4. Les nouvelles publications programmées (créneau, jours actifs, plafond par jour, une à la fois)");
const PP = await imp("supabase/functions/_shared/publication-programmee.js");
ok(PP.reglageProgrammation({}) === null && PP.reglageProgrammation({ publication_programmee: { actif: false } }) === null, "éteint par défaut : rien n'est retenu");
const reg = PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "matin", jours: [1, 2, 3, 4, 5], plafond_jour: 3, fuseau: "Europe/Paris" } });
ok(reg && reg.de === "08:00" && reg.a === "10:00" && reg.jours.join() === "1,2,3,4,5" && reg.plafond_jour === 3, "créneau du matin 8 h – 10 h, du lundi au vendredi, 3 par jour");
ok(PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "perso", de: "14:00", a: "13:00" } }).de === "08:00", "des horaires perso incohérents retombent sur le matin (jamais une fenêtre vide)");
ok(PP.reglageProgrammation({ publication_programmee: { actif: true, plafond_jour: 0 } }).plafond_jour === null, "plafond 0 ou vide : sans plafond");
// Le lundi 26/10/2026 (Paris, UTC+1) : 08:30 = 07:30 Z ; 11:00 = 10:00 Z ; samedi 31/10 08:30.
const lundi0830 = Date.parse("2026-10-26T07:30:00Z"), lundi1100 = Date.parse("2026-10-26T10:00:00Z"), samedi0830 = Date.parse("2026-10-31T07:30:00Z");
ok(PP.fenetreProgrammation(reg, lundi0830).ouverte === true && PP.fenetreProgrammation(reg, lundi1100).ouverte === false, "lundi 8 h 30 (Paris) : ouvert ; 11 h : fermé");
ok(PP.fenetreProgrammation(reg, samedi0830).ouverte === false, "samedi (jour non actif) : fermé");
const jobs = ["a", "b", "c", "d"].map((id, i) => ({ id, action: "publish", platform_fields: { programmee: true }, created_at: `2026-10-26T0${i}:00:00Z` }));
ok(PP.estProgrammee(jobs[0]) && !PP.estProgrammee({ action: "publish", platform_fields: { programmee: true, programmee_servie_le: "x" } }) && !PP.estProgrammee({ action: "republish", platform_fields: { programmee: true } }), "seule une publication programmée pas encore servie est retenue");
let d = PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 0, maintenant: lundi0830 });
ok(d.servir === "a" && d.retenues.join() === "b,c,d", "créneau ouvert : UNE servie (la plus ancienne), les autres attendent", JSON.stringify(d));
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 0, maintenant: lundi1100 }).motif === "creneau", "hors créneau : toutes retenues (motif créneau)");
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 3, maintenant: lundi0830 }).motif === "plafond", "plafond du jour atteint : le surplus attend le créneau suivant");
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 1, enVol: true, maintenant: lundi0830 }).motif === "une_a_la_fois", "une programmée en cours : la suivante attend (une à la fois)");
// Espacement : 3 par jour sur 2 h → 40 min entre deux.
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 1, derniereServieMs: lundi0830 - 20 * 60_000, maintenant: lundi0830 }).motif === "espacement", "20 min après la précédente (espacement 40 min) : elle attend");
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: reg, servies: 1, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830 }).servir === "a", "41 min après : elle part");
ok(PP.decisionProgrammee({ enAttente: jobs, reglage: null }).retenues.length === 0, "réglage éteint : la file part comme avant (rien retenu)");
ok(PP.servieAujourdhui({ platform_fields: { programmee_servie_le: "2026-10-26T07:00:00Z" } }, reg, lundi0830) && !PP.servieAujourdhui({ platform_fields: { programmee_servie_le: "2026-10-25T07:00:00Z" } }, reg, lundi0830), "le compte du jour suit le jour LOCAL du réglage");
ok(!/\d{1,2}\s*h|\d{1,2}:\d{2}/.test(PP.messageProgrammee("creneau", reg) + PP.messageProgrammee("plafond", reg) + PP.messageProgrammee("espacement", reg)), "les phrases ne promettent jamais une heure (règle du 15/10 soir)");
const EJ = await imp("supabase/functions/_shared/etat-job.js");
ok(EJ.etatJob({ status: "pending", action: "publish", platform: "vinted", platform_fields: { programmee: true } }, { programmation: true }).motif === "programmee", "dans l'app : « Programmée : elle partira dans ton créneau » (jamais une erreur)");
ok(EJ.etatJob({ status: "pending", action: "publish", platform: "vinted", platform_fields: { programmee: true } }, { programmation: false }).motif !== "programmee", "réglage éteint : elle part à son tour, sans phrase de programmation");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const d = decisionProgrammee\(\{ enAttente: enAttenteProg, reglage: reglageProg/.test(gpj) && /\.eq\("id", d\.servir\)\.eq\("status", "pending"\)/.test(gpj), "get-pending-jobs retient les programmées et n'en sert qu'une, marquée servie (garde « pending »)");
ok(/jobs_retenus_programmation: idsProgrammeesRetenues\.size/.test(gpj), "la réponse dit combien sont retenues (popup, suivi)");
const mr = lire("src/publication/moteur/regles.js");
ok(/platform_fields: programmee \? \{ \.\.\.pf, programmee: true, programmee_le: new Date\(\)\.toISOString\(\) \} : pf/.test(mr), "la tâche naît marquée « programmée » (quota décompté au clic, comme avant)");
ok(/programmee: Boolean\(programmation\.reglage\) && !envoyerMaintenantRef\.current/.test(lps), "le stepper (et le lot) marquent la tâche quand le réglage est allumé — sauf « Envoyer tout de suite »");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/m\.envoyerMaintenant\?\.\(maintenantLot\)/.test(lot) && /Envoyer tout de suite/.test(lot) && /replace\(\/\^Envoyer\/, "Programmer"\)/.test(lot), "le lot dit « Programmer N annonces », et « Envoyer tout de suite » pour ce lot");
const planR = lire("src/reglages/plan.js");
ok(/id: 'publication-programmee'[\s\S]{0,200}ouvre: 'publication-programmee'/.test(planR), "Réglages › Automatismes › « Publications programmées »");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
