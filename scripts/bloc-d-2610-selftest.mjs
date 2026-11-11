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
ok(age("M – 17 ans et plus") === "16 ans et +", "ESRB « M – 17 ans et plus » (3 jeux de COMPTE-DE63CA45) → « 16 ans et + »");
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
// (29/10, lot B 1.1) Le titre de FillSell ne remplit plus la carte d'office : seule la FICHE du stock (un résultat Lens
// n'en a pas) — la proposition attend derrière « Générer avec l'IA ».
ok(/title:\s+aLaDemande \? titreFiche : \(data\.platforms\[p\]\?\.title \?\? ""\)/.test(lps) && /description:\s+aLaDemande \? descriptionFiche : \(data\.platforms\[p\]\?\.description \?\? ""\)/.test(lps)
    && /const titreFiche = ficheDuStock \? String\(initialListing\?\.titre \?\? ""\)\.trim\(\) : "";/.test(lps),
  "à la demande, les copies reçoivent le titre et la description de la FICHE (la rédaction tourne : rayon, caractéristiques)");
ok(/setPrice\(prev => \(aLaDemande \? prev : \(data\.price \?\? prev\)\)\)/.test(lps) && /res\?\.prix_vente_suggere != null && !redactionALaDemandeConnue\(userId\)/.test(lps), "le prix reste celui de la fiche (ni la rédaction, ni l'estimation des photos)");
// (29/10, lot B 1.1) « Générer avec l'IA » est asynchrone (proposition rédigée si besoin) et demande l'accord sur un champ rempli.
ok(/const genererChamp = async \(champ\) =>/.test(lps) && /texteGenereRef\.current = \{ \.\.\.texteGenereRef\.current, \[champ\]: true \}/.test(lps)
    && /setRemplacer\(\{ champ, actuel, propose: prop\.valeur/.test(lps), "« Générer » pose ce que FillSell a écrit, champ par champ — et ce champ redevient « écrit par FillSell » (règles 4 et 5)");
ok(/descriptionVideALaDemande \|\|/.test(lps) && /Description à écrire \(ou « Générer »\)/.test(lps), "une description vide ne part jamais : le bouton le dit");
const Rg = await imp("src/publication/lot/regles.js");
const mALD = { redactionALaDemande: true, generales: { titre: "Pull", description: "" }, edited: { vinted: { description: "" } }, texteVendeur: { titre: "Pull", description: "" }, texteGenere: {} };
ok(Rg.texteARelire(mALD) === false, "à la demande : jamais « Texte écrit par FillSell » pour le texte de la personne");
ok(Rg.texteARelire({ ...mALD, generales: { description: "Joli pull" }, texteGenere: { description: true } }) === true, "… sauf la description qu'elle vient de faire générer");
ok(Rg.descriptionDuMoteur(mALD) === "" && Rg.descriptionDuMoteur({ edited: { leboncoin: { description: " x " } } }) === "x", "la description qui partirait se lit (général, sinon une copie)");
const fa = lire("src/publication/lot/FicheArticle.jsx");
ok(/generer\("titre"\)/.test(fa) && /generer\("description"\)/.test(fa) && /generer\("prix"\)/.test(fa), "la pop-up de l'article (lot et « Vérifier ») : « Générer » sur le titre, la description, le prix");
// (29/10, lot B 1.1) Le choix vit dans Réglages › Rédaction et consignes IA (avec les consignes et la stratégie de prix).
const pref = lire("src/reglages/SousPageRedaction.jsx");
ok(/useRedactionALaDemande\(userId\)/.test(pref) && /redaction\.choisir\(true\)/.test(pref) && /redaction\.choisir\(false\)/.test(pref), "Réglages › Rédaction : « FillSell écrit tout » / « J'écris, FillSell m'aide champ par champ »");

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
ok(/const d = decisionProgrammee\(\{ enAttente: enAttenteProg, reglage: reglageProg/.test(gpj) && /\.eq\("id", idP\)\.eq\("status", "pending"\)\.select\("id"\)/.test(gpj), "get-pending-jobs retient les programmées et n'en sert qu'une, marquée servie (garde « pending »)");
// (29/10, lot B 4.7) La servie n'est marquée qu'en FIN de chaîne, si elle part vraiment.
{
  const iChoix = gpj.indexOf("if (d.servir) programmeeAMarquer = d.servir;");
  const iReservation = gpj.indexOf("admin.rpc(\"reserver_jobs_extension\"");
  const iDernierePorte = gpj.indexOf("job(s) retenu(s) à la dernière porte");
  const iMarque = gpj.indexOf("programmee_servie_le: le };");
  const ecritures = [...gpj.matchAll(/programmee_servie_le: (?:new Date|le)/g)].map((m) => m.index);
  ok(iChoix > 0 && iReservation > iChoix && iDernierePorte > iReservation && iMarque > iDernierePorte && ecritures.every((i) => i > iDernierePorte),
    "la marque programmee_servie_le n'est écrite qu'après toutes les gardes, la réservation et la dernière porte (une écartée ne compte plus dans le plafond)");
  ok(/if \(!marquee\) \{\s*out = out\.filter\(\(x\) => String\(x\.id\) !== idP\);/.test(gpj), "marque impossible : retenue jusqu'au poll suivant (jamais deux servies)");
  ok(/select\("platform_fields"\)\.eq\("id", idP\)\.eq\("status", "pending"\)\.maybeSingle\(\)/.test(gpj), "la marque se pose sur la ligne EN BASE, jamais sur la copie servie ajustée pour l'envoi");
  // L'ordre : celles dont l'échéance est venue d'abord ; même liste, même nombre (espacement inchangé).
  const tard = { id: "t", action: "publish", platform_fields: { programmee: true, next_action_after: "2026-10-26T09:00:00Z" } };
  const o = PP.ordreProgrammeesPretesDabord([tard, ...jobs], lundi0830);
  ok(o.map((j) => j.id).join() === "a,b,c,d,t" && o.length === 5, "une programmée à l'échéance pas venue passe derrière (elle ne bloque plus la file)");
  const d1 = PP.decisionProgrammee({ enAttente: o, reglage: reg, servies: 1, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830 });
  const d0 = PP.decisionProgrammee({ enAttente: [tard, ...jobs], reglage: reg, servies: 1, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830 });
  const e1 = PP.decisionProgrammee({ enAttente: o, reglage: reg, servies: 1, derniereServieMs: lundi0830 - 31 * 60_000, maintenant: lundi0830 });
  const e0 = PP.decisionProgrammee({ enAttente: [tard, ...jobs], reglage: reg, servies: 1, derniereServieMs: lundi0830 - 31 * 60_000, maintenant: lundi0830 });
  // (01/11 nuit) La décision elle-même ne choisit plus jamais une programmée dont l'échéance n'est pas venue : même sans
  // l'ordre « prêtes d'abord », la servie est une qui peut partir.
  ok(d1.servir === "a" && d0.servir === "a" && d1.motif === d0.motif && e1.motif === "espacement" && e0.motif === "espacement",
    "même décision (créneau, plafond, espacement de 40 min), et la servie est toujours une qui peut partir", JSON.stringify({ d1, d0, e1: e1.motif }));
  ok(PP.ordreProgrammeesPretesDabord([tard, ...jobs], Date.parse("2026-10-26T10:00:00Z"))[0].id === "t", "échéance venue : elle reprend sa place dans la file");
  ok(/ordreProgrammeesPretesDabord\(out\.filter\(\(j\) => estProgrammee\(j\)\)\)/.test(gpj), "get-pending-jobs ordonne les programmées avant la décision");
}
// (01/11 soir, gjehly) UNE PLATEFORME BLOQUÉE NE BLOQUE JAMAIS LES AUTRES : 79 Vinted passaient devant 13 Leboncoin,
// plafond 8 par jour, chaque place mangée par un Vinted dont la page de dépôt restait muette (reprises 4 et 2).
{
  const PB = PP.plateformesEnRepriseTechnique;
  const servies = [
    { id: "eed4", status: "pending", platform: "vinted", reprises: "4", boucle: null },
    { id: "64d5", status: "processing", platform: "vinted", reprises: "2", boucle: null },
    { id: "eb1", status: "published", platform: "ebay", reprises: "1", boucle: null },
  ];
  ok([...PB(servies)].join() === "vinted", "Vinted en reprise technique (pending/processing, reprises ≥ 1) : bloquée ; une publiée ne bloque rien");
  ok(PB([{ status: "needs_user", platform: "vinted", reprises: null, boucle: null }]).size === 0, "une question sur l'article (needs_user sans boucle) ne bloque pas la plateforme");
  ok([...PB([{ status: "needs_user", platform: "leboncoin", reprises: null, boucle: { signature: "onglet_muet" } }])].join() === "leboncoin", "une boucle technique (needs_user « relancer ») bloque sa plateforme");
  ok(PB([{ status: "pending", platform: "vinted", reprises: null }]).size === 0 && PB(null).size === 0, "servie sans reprise, ou rien lu : rien de bloqué (comme avant)");
  const file = [
    ...["v1", "v2", "v3"].map((id) => ({ id, platform: "vinted", action: "publish", platform_fields: { programmee: true } })),
    ...["l1", "l2"].map((id) => ({ id, platform: "leboncoin", action: "publish", platform_fields: { programmee: true } })),
  ];
  const sansBlocage = PP.decisionProgrammee({ enAttente: file, reglage: reg, servies: 2, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830 });
  const avecBlocage = PP.decisionProgrammee({ enAttente: file, reglage: reg, servies: 2, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830, plateformesBloquees: PB(servies) });
  ok(sansBlocage.servir === "v1" && avecBlocage.servir === "l1" && avecBlocage.retenues.join() === "v1,v2,v3,l2" && avecBlocage.motif === "une_a_la_fois",
    "Vinted bloquée : la place va au premier Leboncoin, les Vinted gardent leur rang (rien perdu)", JSON.stringify(avecBlocage));
  const toutesBloquees = PP.decisionProgrammee({ enAttente: file.slice(0, 3), reglage: reg, servies: 2, derniereServieMs: lundi0830 - 41 * 60_000, maintenant: lundi0830, plateformesBloquees: ["vinted"] });
  ok(toutesBloquees.servir === null && toutesBloquees.retenues.length === 3 && toutesBloquees.motif === "plateforme_bloquee", "il ne reste que la plateforme bloquée : rien de servi (jamais le même mur une fois de plus)");
  for (const [nom, args] of [
    ["créneau", { maintenant: lundi1100 }], ["plafond", { servies: 3 }], ["une_a_la_fois", { servies: 2, enVol: true }],
    ["espacement", { servies: 2, derniereServieMs: lundi0830 - 10 * 60_000 }],
  ]) {
    const a = PP.decisionProgrammee({ enAttente: file, reglage: reg, maintenant: lundi0830, ...args });
    const b = PP.decisionProgrammee({ enAttente: file, reglage: reg, maintenant: lundi0830, ...args, plateformesBloquees: ["vinted"] });
    ok(a.motif === b.motif && a.servir === b.servir && b.servir === null, `cadence intouchée (${nom}) : même verdict avec ou sans plateforme bloquée`, JSON.stringify({ a, b }));
  }
  ok(/const plateformesBloquees = plateformesEnRepriseTechnique\(lignes\);/.test(gpj) && /derniereServieMs: derniere, plateformesBloquees,\s*file: fileProg, dernierePlateforme: dernierePlateformeServie\(lignes\) \}\)/.test(gpj)
    && /reprises:platform_fields->>pas_de_rouge_reprises, boucle:platform_fields->boucle_technique/.test(gpj),
    "get-pending-jobs lit plateforme, reprises et boucle des servies (même lecture) et les passe à la décision");
}
// (01/11 soir, décision de Nico) LES PUBLICATIONS eBay (API) PROGRAMMÉES SUIVENT LE MÊME CRÉNEAU ET LE MÊME PLAFOND :
// gjehly, 78 eBay programmées parties en rafale 21:10 – 21:33 par ebay-api-worker, qui ne lisait pas le réglage.
{
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  const f = w.slice(w.indexOf("async function programmeesEbayAServir"), w.indexOf("return { servir, aMarquer, retenues };"));
  ok(/import \{ reglageProgrammation, estProgrammee, servieAujourdhui, decisionProgrammee, ordreProgrammeesPretesDabord, plateformesEnRepriseTechnique, etatFileProgrammee, dernierePlateformeServie \} from "\.\.\/_shared\/publication-programmee\.js";/.test(w),
    "ebay-api-worker prend la MÊME décision que get-pending-jobs (_shared/publication-programmee.js)");
  ok(/\.eq\("platform_fields->>programmee", "true"\)\.is\("platform_fields->>programmee_servie_le", null\)/.test(f) && /\.limit\(300\)/.test(f),
    "les programmées non servies sont lues à part (300 au plus) : elles n'occupent jamais les LOT_MAX places des autres comptes");
  ok(/\.gte\("platform_fields->>programmee_servie_le", depuis\)/.test(f) && !/\.eq\("platform", "ebay"\)[^\n]*programmee_servie_le", depuis/.test(f)
    && /plateformesBloquees: plateformesEnRepriseTechnique\(lignes\)/.test(f),
    "plafond, une à la fois, espacement : les servies de TOUTES les plateformes du compte (même lecture de 36 h)");
  ok(/if \(!reglage\) \{ servir\.push\(\.\.\.liste\); continue; \}/.test(f), "réglage éteint : ses programmées partent comme avant");
  ok(/if \(programmation\) cible = cible\.or\("platform_fields->>programmee\.is\.null,platform_fields->>programmee\.neq\.true,platform_fields->>programmee_servie_le\.not\.is\.null"\);/.test(w),
    "la file ordinaire écarte les programmées non servies — sauf si la programmation est illisible (servie comme avant)");
  ok(/programmation\?\.aMarquer\.has\(String\(brut\.id\)\) \? \{ programmee_servie_le: new Date\(\)\.toISOString\(\) \} : \{\}/.test(w)
    && /\.eq\("id", brut\.id\)\.eq\("status", "pending"\)\.eq\("voie", "api"\)/.test(w),
    "la servie est marquée programmee_servie_le à sa prise (même compare-and-swap) : le plafond et « une à la fois » la voient");
}
// (01/11 nuit, décision de Nico) LE TOUR STRICT PAR PLATEFORME : « chaque place libre va à la plateforme suivante dans
// l'ordre, pour qu'aucune (eBay compris) ne rafle le plafond du jour pendant que les autres attendent ; une plateforme
// sans tâche prête passe son tour ».
{
  const reg8 = PP.reglageProgrammation({ publication_programmee: { actif: true, creneau: "soir", plafond_jour: 8, fuseau: "Europe/Paris" } });
  const soir19h = Date.parse("2026-11-02T18:00:00Z"); // lundi 02/11, 19:00 Paris
  const fileDe = (comptes) => Object.entries(comptes).flatMap(([p, n]) => [...Array(n)].map((_, i) => ({ id: `${p}${i}`, platform: p, action: "publish", platform_fields: { programmee: true } })));
  ok(PP.ORDRE_PLATEFORMES_PROGRAMMEES.join() === "vinted,leboncoin,ebay,beebs,depop" && PP.DELAI_TOUR_MS === 600_000, "ordre fixe Vinted, Leboncoin, eBay, Beebs, Depop ; 10 min pour prendre sa place");
  ok(PP.ordreDuTour("vinted", new Set(["vinted", "leboncoin", "ebay"])).join() === "leboncoin,ebay,vinted"
    && PP.ordreDuTour("ebay", new Set(["vinted", "leboncoin", "ebay"])).join() === "vinted,leboncoin,ebay"
    && PP.ordreDuTour(null, new Set(["ebay", "beebs"])).join() === "ebay,beebs"
    && PP.ordreDuTour("vinted", new Set(["vinted"])).join() === "vinted", "le tour suit la dernière servie ; seule prête, une plateforme reprend");
  ok(PP.ordreDuTour("vinted", new Set(["vinted", "ebay"])).join() === "ebay,vinted", "Leboncoin sans tâche prête passe son tour");
  const etat = PP.etatFileProgrammee([{ platform: "vinted" }, { platform: "ebay", naa: "2026-11-02T20:00:00Z" }, { platform: "leboncoin", naa: "2026-11-02T17:00:00Z" }], soir19h);
  ok([...etat.pretes].sort().join() === "leboncoin,vinted" && etat.total === 3, "état commun : une programmée à l'échéance pas venue ne rend pas sa plateforme prête");
  ok(PP.dernierePlateformeServie([{ platform: "vinted", servie: "2026-11-02T18:10:00Z" }, { platform: "ebay", servie: "2026-11-02T18:30:00Z" }]) === "ebay", "la dernière servie se lit sur les servies du compte");

  // Une soirée simulée : 79 Vinted, 12 Leboncoin, 6 eBay ; get-pending-jobs (extension) et ebay-api-worker décident
  // chacun sur LEURS candidates, avec le MÊME état ; passages toutes les 2 min, chacun prend aussitôt sa place.
  const file = { vinted: 79, leboncoin: 12, ebay: 6 };
  const servies = [];
  let t = soir19h;
  const sequence = [];
  for (let k = 0; k < 90 && servies.length < 8; k++, t += 120_000) {
    for (const cote of ["extension", "api"]) {
      const enFile = fileDe(file);
      const miennes = enFile.filter((j) => (cote === "api") === (j.platform === "ebay"));
      const der = servies.length ? Math.max(...servies.map((s) => s.le)) : null;
      const d = PP.decisionProgrammee({ enAttente: miennes, reglage: reg8, servies: servies.length, enVol: false, derniereServieMs: der, maintenant: t,
        file: PP.etatFileProgrammee(enFile, t), dernierePlateforme: PP.dernierePlateformeServie(servies.map((s) => ({ platform: s.p, servie: new Date(s.le).toISOString() }))) });
      if (d.servir) { const p = miennes.find((j) => j.id === d.servir).platform; servies.push({ p, le: t }); file[p]--; sequence.push(p); }
    }
  }
  ok(sequence.join() === "vinted,leboncoin,ebay,vinted,leboncoin,ebay,vinted,leboncoin",
    "soirée de 8 places : Vinted, Leboncoin, eBay à tour de rôle — aucune ne rafle le plafond (eBay compris)", sequence.join());
  // eBay sans programmée prête : il passe son tour.
  const sansEbay = { vinted: 3, leboncoin: 3 };
  const enFile2 = fileDe(sansEbay);
  const d2 = PP.decisionProgrammee({ enAttente: enFile2, reglage: reg8, servies: 1, derniereServieMs: soir19h - 30 * 60_000, maintenant: soir19h + 60_000,
    file: PP.etatFileProgrammee(enFile2, soir19h), dernierePlateforme: "leboncoin" });
  ok(d2.servir === "vinted0" && d2.tour === "vinted", "après Leboncoin, eBay sans tâche prête passe son tour : Vinted");
  // Au tour d'eBay, l'extension attend ; 10 min sans preneur (worker en panne), le tour passe à la suivante.
  const enFile3 = fileDe({ vinted: 3, leboncoin: 3, ebay: 2 });
  const ext = enFile3.filter((j) => j.platform !== "ebay");
  const base = { reglage: reg8, servies: 2, derniereServieMs: Date.parse("2026-11-02T18:00:00Z"), dernierePlateforme: "leboncoin" };
  const libre = Date.parse("2026-11-02T18:00:00Z") + Math.floor(3 * 3600_000 / 8); // espacement : 3 h ÷ (2 servies + 6 restantes)
  const dA = PP.decisionProgrammee({ ...base, enAttente: ext, maintenant: libre + 60_000, file: PP.etatFileProgrammee(enFile3, libre) });
  const dB = PP.decisionProgrammee({ ...base, enAttente: ext, maintenant: libre + 10 * 60_000 + 1, file: PP.etatFileProgrammee(enFile3, libre) });
  const dE = PP.decisionProgrammee({ ...base, enAttente: enFile3.filter((j) => j.platform === "ebay"), maintenant: libre + 60_000, file: PP.etatFileProgrammee(enFile3, libre) });
  ok(dA.servir === null && dA.motif === "tour" && dA.tour === "ebay" && dE.servir === "ebay0",
    "au tour d'eBay : l'extension attend, le worker eBay prend la place", JSON.stringify({ dA, dE: dE.servir }));
  ok(dB.servir === "vinted0" && dB.tour === "vinted", "10 min sans preneur : le tour passe à Vinted (jamais une place perdue)", JSON.stringify(dB));
  const bloq = PP.decisionProgrammee({ ...base, enAttente: ext, maintenant: libre + 60_000, file: PP.etatFileProgrammee(enFile3, libre), dernierePlateforme: "ebay", plateformesBloquees: ["vinted"] });
  ok(bloq.servir === "leboncoin0", "Vinted en reprise technique passe son tour : Leboncoin");
  const sansFile = PP.decisionProgrammee({ ...base, enAttente: ext, maintenant: libre + 60_000, file: null, dernierePlateforme: "vinted" });
  ok(sansFile.servir === "leboncoin0", "état commun illisible : le tour se fait sur les seules candidates (jamais un point de panne)");
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  const lectureFile = /\.select\("platform, naa:platform_fields->>next_action_after"\)\s*\.eq\("user_id", (?:user\.id|userId)\)\.eq\("status", "pending"\)\.eq\("action", "publish"\)\s*\.eq\("platform_fields->>programmee", "true"\)\.is\("platform_fields->>programmee_servie_le", null\)\.limit\(1000\)/;
  ok(lectureFile.test(gpj) && lectureFile.test(w) && /file: eFile \? null : etatFileProgrammee\(enFile \?\? \[\]\),\s*dernierePlateforme: dernierePlateformeServie\(lignes\)/.test(w),
    "get-pending-jobs et ebay-api-worker lisent le MÊME état de la file du compte et la même dernière servie");
}
ok(/jobs_retenus_programmation: idsProgrammeesRetenues\.size/.test(gpj), "la réponse dit combien sont retenues (popup, suivi)");
const mr = lire("src/publication/moteur/regles.js");
// (03/11 soir, gjehly) La marque passe par champsDuJob : posée au clic seulement, jamais héritée d'une tâche d'avant
// (selftest programmation-au-clic).
ok(/platform_fields: champsDuJob\(pf, programmee\),/.test(mr)
  && /return programmee \? \{ \.\.\.propres, programmee: true, programmee_le: new Date\(\)\.toISOString\(\) \} : propres;/.test(mr),
  "la tâche naît marquée « programmée » (quota décompté au clic, comme avant)");
ok(/programmee: Boolean\(programmation\.reglage\) && !envoyerMaintenantRef\.current/.test(lps), "le stepper (et le lot) marquent la tâche quand le réglage est allumé — sauf « Envoyer tout de suite »");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/m\.envoyerMaintenant\?\.\(maintenantLot\)/.test(lot) && /Envoyer tout de suite/.test(lot) && /replace\(\/\^Envoyer\/, "Programmer"\)/.test(lot), "le lot dit « Programmer N annonces », et « Envoyer tout de suite » pour ce lot");
const planR = lire("src/reglages/plan.js");
ok(/id: 'publication-programmee'[\s\S]{0,200}ouvre: 'publication-programmee'/.test(planR), "Réglages › Automatismes › « Publications programmées »");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
