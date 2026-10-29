// ═══════════════════════════════════════════════════════════════════════════
// PUBLIER SANS ORDINATEUR : ON N'ATTEND QUE S'IL EXISTE UN LECTEUR (26/10/2026 nuit, point 9 — patrick giry)
//   node --import ./scripts/loader-ext.mjs scripts/attente-sans-lecteur-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Le 25/10 sur Android, « Publier » sur une fiche du dressing sans texte attendait la lecture de sa description Vinted
// et promettait « la lecture se fait depuis ton ordinateur » : son poste (0.6.141, vu pour la dernière fois à 17:15)
// ne pouvait pas lire (il faut la 0.6.144). Règle de Nico (26/10) : on n'attend que s'il existe un lecteur MAINTENANT
// (extension ≥ 0.6.144 sur cet appareil, ou un poste du compte en ≥ 0.6.144 vu il y a moins de 15 min) ; sinon une
// phrase vraie et trois choix — « Écrire ma description », « La faire rédiger par FillSell », « Attendre mon
// ordinateur » ; jamais une publication sans description ; rien ne change quand le lecteur est là. Ce test prouve :
//   1. le lecteur (attenteLectureRegles.lecteurDisponible) sur les cas réels et leurs voisins ;
//   2. la phrase (heure de Paris, version réelle, jamais une heure future) et les trois issues ;
//   3. la règle partagée app + serveur (_shared/contenu-fiche.js) : le choix de la personne met fin à l'attente ;
//   4. jamais une publication sans description (champ ≥ 2 mots, « rédiger » n'écrit rien sur la fiche, relecture) ;
//   5. les lectures et écritures (lectureOrigine.js) sur une base factice ;
//   6. le câblage : stepper (StockTab, AttenteLectureOrigine) et lot (LotPublication) — et la non-régression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, detail = "") => {
  if (c) { verts++; console.log(`  ✓ ${m}`); }
  else { rouges++; console.log(`  ✗ ${m}${detail ? `  ← ${detail}` : ""}`); }
};

const R = await import("../src/publication/attenteLectureRegles.js");
const CF = await import("../supabase/functions/_shared/contenu-fiche.js");
const LF = await import("../supabase/functions/_shared/lecture-fond.js");
const LO = await import("../src/publication/lectureOrigine.js");
const LOT = await import("../src/publication/lot/regles.js");

// Le poste de patrick giry, tel que la base le portait (profiles, relu le 26/10) : 0.6.141, vu le 25/10 à 17:15 Paris.
const PATRICK = {
  version: "0.6.141",
  vuLe: "2026-10-25T16:15:28.173Z",
  postes: { "6a1b8979": { le: "2026-10-25T16:15:28.234Z", build: "2026-10-24T21:18:48Z+a07091c", navigateur: "chrome" } },
};
const A_21H34 = Date.parse("2026-10-25T20:34:00Z"); // 21:34 à Paris (heure d'hiver depuis le 25/10 à 03:00)
const BUILD_144 = "2026-10-25T15:28:19Z+7b08e45";   // la 0.6.144 servie par le Chrome Web Store
const ilYa = (maintenant, min) => new Date(maintenant - min * 60_000).toISOString();

console.log("\n1. Le lecteur : il existe MAINTENANT, ou pas");
{
  ok(R.LECTEUR_VERSION_MIN === "0.6.144" && R.LECTEUR_VERSION_MIN === LF.LECTURE_FOND_VERSION_MIN,
    "la borne est celle du serveur (LECTURE_FOND_VERSION_MIN, get-pending-jobs) : 0.6.144");
  ok(/export const PUBLIC_VERSION_MIN = '0\.6\.144'/.test(lire("src/utils/vintedSync.js")), "… et celle de la page publique lue par l'extension (vintedSync)");
  ok(R.LECTEUR_VU_MAX_MS === 15 * 60_000, "« là maintenant » : vu il y a moins de 15 min");

  const p = R.lecteurDisponible({ versionIci: null, compte: PATRICK, maintenant: A_21H34 });
  ok(p.disponible === false && p.raison === "extension_ancienne" && p.version === "0.6.141" && p.allume === false && p.vuLe === "2026-10-25T16:15:28.234Z",
    "patrick giry (téléphone, poste 0.6.141 vu à 17:15) : AUCUN lecteur — pas d'attente", JSON.stringify(p));

  const vu5 = { version: "0.6.144", vuLe: ilYa(A_21H34, 5), postes: { a: { le: ilYa(A_21H34, 5), build: BUILD_144 } } };
  const q = R.lecteurDisponible({ versionIci: null, compte: vu5, maintenant: A_21H34 });
  ok(q.disponible === true && q.ou === "poste", "poste 0.6.144 vu il y a 5 min : un lecteur — l'attente comme avant", JSON.stringify(q));

  const ici = R.lecteurDisponible({ versionIci: "0.6.144", compte: PATRICK, maintenant: A_21H34 });
  ok(ici.disponible === true && ici.ou === "ici", "extension 0.6.144 sur cet appareil : un lecteur (il lit lui-même), quel que soit le poste", JSON.stringify(ici));
  ok(R.lecteurDisponible({ versionIci: "0.6.150", maintenant: A_21H34 }).disponible === true, "… et toute version plus récente");

  const eteint = R.lecteurDisponible({ compte: { version: "0.6.144", vuLe: ilYa(A_21H34, 20), postes: { a: { le: ilYa(A_21H34, 20), build: BUILD_144 } } }, maintenant: A_21H34 });
  ok(eteint.disponible === false && eteint.raison === "ordinateur_eteint", "poste à jour mais vu il y a 20 min : pas de lecteur maintenant", JSON.stringify(eteint));
  ok(R.lecteurDisponible({ compte: { version: "0.6.144", vuLe: ilYa(A_21H34, 14), postes: null }, maintenant: A_21H34 }).disponible === true,
    "sans postes connus : le dernier poll du compte fait foi (vu il y a 14 min, à jour)");

  const aucun = R.lecteurDisponible({ compte: { version: null, vuLe: null, postes: null }, maintenant: A_21H34 });
  ok(aucun.disponible === false && aucun.raison === "aucun_ordinateur", "aucune extension jamais vue : aucun lecteur", JSON.stringify(aucun));

  const vieilleIci = R.lecteurDisponible({ versionIci: "0.6.141", compte: { ...PATRICK, vuLe: ilYa(A_21H34, 1), postes: { a: { le: ilYa(A_21H34, 1), build: PATRICK.postes["6a1b8979"].build } } }, maintenant: A_21H34 });
  ok(vieilleIci.disponible === false && vieilleIci.raison === "extension_ancienne_ici" && vieilleIci.version === "0.6.141",
    "sur l'ordinateur même, extension 0.6.141 : pas de lecteur, et c'est CETTE extension qui doit se mettre à jour", JSON.stringify(vieilleIci));
  const allume = R.lecteurDisponible({ compte: { ...PATRICK, vuLe: ilYa(A_21H34, 2), postes: { a: { le: ilYa(A_21H34, 2), build: PATRICK.postes["6a1b8979"].build } } }, maintenant: A_21H34 });
  ok(allume.disponible === false && allume.allume === true, "poste 0.6.141 allumé (vu il y a 2 min) : pas de lecteur pour autant", JSON.stringify(allume));

  // Deux postes, une version notée par COMPTE (la plus haute jamais vue) : c'est le poste au build le plus récent qui la porte.
  const deux = (vuNeuf, vuVieux) => ({ version: "0.6.144", vuLe: ilYa(A_21H34, Math.min(vuNeuf, vuVieux)),
    postes: { neuf: { le: ilYa(A_21H34, vuNeuf), build: BUILD_144 }, vieux: { le: ilYa(A_21H34, vuVieux), build: "2026-10-24T21:18:48Z+a07091c" } } });
  ok(R.lecteurDisponible({ compte: deux(180, 1), maintenant: A_21H34 }).disponible === false,
    "deux postes : le 0.6.144 éteint (3 h), le 0.6.141 allumé → pas de lecteur (le vieux ne sait pas lire)");
  ok(R.lecteurDisponible({ compte: deux(1, 180), maintenant: A_21H34 }).disponible === true, "deux postes : le 0.6.144 allumé → un lecteur");
  ok(R.lecteurDisponible({ compte: { version: "0.6.145", vuLe: ilYa(A_21H34, 2), postes: { dev: { le: ilYa(A_21H34, 2), build: "__FILLSELL_BUILD_ID__" }, cws: { le: ilYa(A_21H34, 300), build: BUILD_144 } } }, maintenant: A_21H34 }).disponible === true,
    "un poste au build illisible (dépôt local) peut porter la version du compte : il compte");
}

console.log("\n2. La phrase vraie et les trois issues");
{
  const p = R.lecteurDisponible({ compte: PATRICK, maintenant: A_21H34 });
  const phrase = R.phraseSansLecteur(p, { lang: "fr", maintenant: A_21H34 });
  ok(phrase === "Seule l'extension FillSell d'un ordinateur sait lire ta description Vinted : ton ordinateur n'a pas été vu depuis 17:15 et son extension (0.6.141) doit se mettre à jour.",
    "patrick, le 25/10 à 21:34 : heure de Paris et version réelles", phrase);
  ok(R.phraseSansLecteur(p, { maintenant: Date.parse("2026-10-26T09:00:00Z") }).includes("depuis hier à 17:15"), "le lendemain : « hier à 17:15 »");
  ok(R.phraseSansLecteur(p, { maintenant: Date.parse("2026-10-28T09:00:00Z") }).includes("depuis le 25/10 à 17:15"), "plus tard : « le 25/10 à 17:15 »");
  ok(R.phraseSansLecteur(p, { lang: "en", maintenant: A_21H34 }) === "Only the FillSell extension on a computer can read your Vinted description: your computer hasn't been seen since 17:15 and its extension (0.6.141) needs updating.",
    "en anglais, la même phrase");
  ok(R.quandEnMots("2026-07-15T08:05:00Z", Date.parse("2026-07-15T20:00:00Z")) === "10:05", "heure d'été : 08:05 UTC = 10:05 à Paris");
  ok(R.quandEnMots(ilYa(A_21H34, -90), A_21H34) === "21:34", "un horodatage dans le futur (horloge décalée) ne se dit jamais au futur : maintenant au plus");
  ok(!/\b(vers|dans|à partir de|d'ici|bientôt)\b/i.test(phrase), "aucune heure future estimée, aucune promesse");
  ok(R.phraseSansLecteur(R.lecteurDisponible({ compte: { version: null, vuLe: null, postes: null } }), {}) ===
    "Seule l'extension FillSell d'un ordinateur sait lire ta description Vinted : aucun ordinateur avec l'extension n'est relié à ton compte.", "sans poste connu : la phrase dédiée");
  ok(R.phraseSansLecteur(R.lecteurDisponible({ versionIci: "0.6.141", compte: PATRICK, maintenant: A_21H34 }), { maintenant: A_21H34 }).endsWith(": l'extension de cet ordinateur (0.6.141) doit se mettre à jour."),
    "sur l'ordinateur à l'extension ancienne : c'est elle qui est nommée");
  ok(R.phraseSansLecteur(R.lecteurDisponible({ compte: { version: "0.6.144", vuLe: "2026-10-25T16:15:28Z", postes: null }, maintenant: A_21H34 }), { maintenant: A_21H34 }).endsWith(": ton ordinateur n'a pas été vu depuis 17:15."),
    "poste à jour, éteint : l'heure seule (rien à mettre à jour)");
  ok(R.phraseSansLecteur(R.lecteurDisponible({ compte: { ...PATRICK, vuLe: ilYa(A_21H34, 2), postes: null }, maintenant: A_21H34 }), { maintenant: A_21H34 }).endsWith(": ton ordinateur est allumé, mais son extension (0.6.141) doit se mettre à jour."),
    "poste allumé mais ancien : dit tel quel");

  const issues = R.issuesSansLecteur(p);
  ok(issues.length === 3 && issues.map((x) => x.cle).join(",") === "ecrire,rediger,attendre" && issues.filter((x) => x.principal).length === 1 && issues[0].principal,
    "sans lecteur : trois choix, « Écrire ma description » seul principal", JSON.stringify(issues));
  ok(R.issuesSansLecteur(R.lecteurDisponible({ versionIci: "0.6.144" })).length === 0 && R.issuesSansLecteur(null).length === 0,
    "avec un lecteur — ou sans savoir (profil illisible) : aucun choix, l'attente d'avant (règle du 25/10)");
  ok(R.phraseSansLecteur(R.lecteurDisponible({ versionIci: "0.6.144" })) === null && R.phraseSansLecteur(null) === null, "… et aucune phrase « sans lecteur »");
  const L = R.libellesSansLecteur("fr");
  ok(L.ecrire === "Écrire ma description" && L.rediger === "La faire rédiger par FillSell" && L.attendre === "Attendre mon ordinateur" && L.ouvrirVinted.startsWith("Ouvrir mon annonce Vinted"),
    "les mots de Nico, tels quels");
  ok(R.urlAnnonceVinted({ vinted_item_id: "10525819076" }) === "https://www.vinted.fr/items/10525819076" && R.urlAnnonceVinted({ vinted_item_id: null }) === null,
    "« Ouvrir mon annonce Vinted » : seulement quand son numéro est connu");
  const tA = R.texteAttenteSansLecteur(p, { contexte: "stepper" });
  ok(tA === "Dès que ton ordinateur est allumé avec l'extension à jour, ta description est lue et l'écran de publication s'ouvre."
    && R.texteAttenteSansLecteur(p, { contexte: "lot" }).endsWith("ta description est lue et l'article se prépare.")
    && R.texteAttenteSansLecteur(R.lecteurDisponible({ versionIci: "0.6.141", compte: PATRICK, maintenant: A_21H34 })).startsWith("Dès que l'extension de cet ordinateur est à jour")
    && !/\d{1,2}:\d{2}/.test(tA),
    "« Attendre mon ordinateur » : la condition dite (jamais une heure), l'écran de publication ou l'article selon l'endroit", tA);
}

console.log("\n3. La règle partagée (app et get-pending-jobs) : le choix de la personne met fin à l'attente");
{
  const fiche = { id: 1792935402880003, origine: "vinted_sync", description: "", photos: ["https://images1.vinted.net/a.jpg"], attributs: {}, disparu_le: null };
  ok(CF.lectureOrigineEnAttente(fiche, [])?.manque?.join(",") === "description", "fiche du dressing sans texte, jamais lue : attendue (comme avant)");
  const redigee = { ...fiche, attributs: R.patchChoixRedigee("2026-10-26T01:00:00.000Z").attributs };
  ok(CF.lectureOrigineEnAttente(redigee, []) === null, "« La faire rédiger par FillSell » : plus attendue (get-pending-jobs ne retient plus la publication)");
  ok(CF.choixSansLecture(redigee)?.choix === "redigee" && CF.choixSansLecture(fiche) === null, "le choix se lit sur la fiche (attributs.description_sans_lecture)");
  ok(CF.lectureOrigineEnAttente(redigee, [], { ignorerChoix: true })?.manque?.[0] === "description",
    "… mais l'app, à chaque « Publier », n'en tient pas compte (ignorerChoix) : avec un lecteur elle attend le vrai texte, sans lui elle redemande");
  const ecrite = { ...fiche, ...R.patchDescriptionEcrite("Chemise Dickies neuve avec étiquette, taille L", "2026-10-26T01:00:00.000Z") };
  ok(CF.lectureOrigineEnAttente(ecrite, []) === null, "« Écrire ma description » : la fiche porte SA description, plus rien à attendre");
  ok(CF.lectureOrigineEnAttente({ ...fiche, attributs: { description_sans_lecture: { v: "attendre", source: "manuel" } } }, [])?.manque?.[0] === "description"
    && CF.lectureOrigineEnAttente({ ...fiche, attributs: { description_sans_lecture: { v: null } } }, [])?.manque?.[0] === "description",
    "« Attendre » ou un marqueur vide : l'attente continue (seuls « ecrite » et « redigee » la lèvent)");
  const lbc = { id: 2, origine: "releve_leboncoin", description: "", photos: [], attributs: { description_sans_lecture: { v: "redigee", source: "manuel" } } };
  const a = CF.lectureOrigineEnAttente(lbc, [{ platform: "leboncoin", capture_le: null, disparu_le: null }]);
  ok(a && !a.manque.includes("description") && a.manque.includes("etat") && a.manque.includes("photos"),
    "le choix ne vaut que pour la description : un état ou des photos jamais lus s'attendent comme avant", JSON.stringify(a));
  ok(CF.texteDuVendeurSurFiche(redigee) === true && !("description_source" in redigee.attributs),
    "« redigee » ne se fait jamais passer pour le texte du vendeur (aucun description_source posé)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/import \{ lectureOrigineEnAttente, contenuAImposer, messageLectureOrigine \} from "\.\.\/_shared\/contenu-fiche\.js"/.test(gpj)
    && /lectureOrigineEnAttente\(f, \(f\.annonces as unknown\[\]\) \?\? \[\]/.test(gpj),
    "get-pending-jobs applique LA règle à la fiche lue par fiches_contenu_vendeur (attributs compris) — effet au prochain déploiement");
}

console.log("\n4. Jamais une publication sans description");
{
  ok(R.descriptionEcriteSuffisante("") === false && R.descriptionEcriteSuffisante("   ") === false && R.descriptionEcriteSuffisante("Neuf") === false && R.descriptionEcriteSuffisante("Chemise neuve") === true,
    "« Continuer » n'existe qu'avec deux mots au moins (même seuil que l'attente et generate-listing)");
  ok(R.patchDescriptionEcrite("") === null && R.patchDescriptionEcrite("Neuf") === null, "rien de trop court n'est écrit sur la fiche");
  const pe = R.patchDescriptionEcrite("  Chemise Dickies neuve  ", "2026-10-26T01:00:00.000Z");
  ok(pe?.description === "Chemise Dickies neuve" && pe.attributs.description_source?.v === "manuel" && pe.attributs.description_source?.source === "manuel"
    && pe.attributs.description_sans_lecture?.v === "ecrite" && pe.attributs.description_sans_lecture?.source === "manuel",
    "la description écrite part sur la fiche, marquée « manuel » comme une retouche du stepper (texteDeLaFiche), choix daté", JSON.stringify(pe));
  const pr = R.patchChoixRedigee("2026-10-26T01:00:00.000Z");
  ok(!("description" in pr) && Object.keys(pr).join(",") === "attributs" && Object.keys(pr.attributs).join(",") === "description_sans_lecture",
    "« La faire rédiger » n'écrit JAMAIS de texte sur la fiche — seulement le choix", JSON.stringify(pr));
  ok(CF.lectureOrigineEnAttente({ origine: "vinted_sync", description: "", photos: [], attributs: {} }, []) !== null,
    "sans choix et sans lecture, la publication reste retenue au départ : jamais partie sans description");
  // Le lot : un article « rédigé » se prépare, et son texte passe par « Relis le texte qui part » avant l'envoi.
  ok(LOT.texteARelire({ texteVendeur: { titre: "Chemise Dickies", description: "" } }) === true,
    "lot : un texte rédigé par FillSell est à relire (« C'est bon » / « Tout valider ») avant l'envoi");
  const b = LOT.bilanArticle({ plateformesPubliables: new Set(["leboncoin"]), price: 20, texteVendeur: { titre: "Chemise Dickies", description: "" }, nbQuestions: 0, motifsCtaGris: [] }, {}, "fr");
  ok(!b.pret && b.motifs.some((x) => x.cle === "texte"), "… tant qu'il n'est pas validé, l'article n'est pas prêt", JSON.stringify(b.motifs));
}

console.log("\n5. Les lectures et les écritures (lectureOrigine.js), sur une base factice");
function fausseBase({ profil = null, erreurProfil = null, lignes = 1, erreurMaj = null } = {}) {
  const appels = [];
  return {
    appels,
    rpc(nom, args) { appels.push({ table: `rpc:${nom}`, op: "rpc", patch: args, filtres: [] }); return Promise.resolve({ data: null, error: null }); },
    from(table) {
      const q = { table, op: null, patch: null, filtres: [], select: null };
      appels.push(q);
      const chaine = {
        select(c) { if (!q.op) q.op = "select"; q.select = c; return chaine; },
        update(p) { q.op = "update"; q.patch = p; return chaine; },
        insert(p) { q.op = "insert"; q.patch = p; return Promise.resolve({ error: null }); },
        eq(c, v) { q.filtres.push([c, v]); return chaine; },
        limit() { return chaine; },
        maybeSingle() { return Promise.resolve(erreurProfil ? { data: null, error: erreurProfil } : { data: profil, error: null }); },
        then(res, rej) {
          const r = erreurMaj ? { data: null, error: erreurMaj } : { data: Array.from({ length: lignes }, (_, i) => ({ id: i + 1 })), error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return chaine;
    },
  };
}
{
  const b1 = fausseBase({ profil: { extension_version: PATRICK.version, extension_last_seen_at: PATRICK.vuLe, extension_postes: PATRICK.postes } });
  const l1 = await LO.lireLecteurVinted(b1, "u-patrick", { versionIci: null, maintenant: A_21H34 });
  ok(l1?.disponible === false && l1.raison === "extension_ancienne" && b1.appels.length === 1 && b1.appels[0].table === "profiles"
    && /extension_version/.test(b1.appels[0].select) && /extension_postes/.test(b1.appels[0].select) && b1.appels[0].filtres.some(([c, v]) => c === "id" && v === "u-patrick"),
    "une lecture du profil, au clic : version, dernier poll, postes — pas de lecteur pour patrick", JSON.stringify(l1));
  const b2 = fausseBase();
  const l2 = await LO.lireLecteurVinted(b2, "u", { versionIci: "0.6.144" });
  ok(l2?.disponible === true && b2.appels.length === 0, "extension 0.6.144 ici : lecteur, sans aucune lecture de base");
  const l3 = await LO.lireLecteurVinted(fausseBase({ erreurProfil: { message: "timeout" } }), "u", {});
  ok(l3 === null && R.issuesSansLecteur(l3).length === 0, "profil illisible : on ne conclut rien (l'attente d'avant, jamais un faux « pas de lecteur »)");

  const b4 = fausseBase();
  const e1 = await LO.ecrireDescriptionSansLecteur(b4, "u", 17, "Chemise Dickies neuve, taille L");
  const maj = b4.appels.find((q) => q.op === "update");
  ok(e1.ok === true && e1.description === "Chemise Dickies neuve, taille L" && maj?.table === "inventaire" && maj.patch.description === "Chemise Dickies neuve, taille L"
    && maj.patch.attributs?.description_source?.v === "manuel" && maj.filtres.some(([c, v]) => c === "id" && v === 17) && maj.filtres.some(([c, v]) => c === "user_id" && v === "u"),
    "« Écrire ma description » : écrite sur SA fiche (id et propriétaire), marquée manuelle", JSON.stringify(maj?.patch));
  ok(b4.appels.some((q) => q.table === "rpc:lecture_origine_faite" && q.patch?.p_fiche === 17),
    "… et la demande de lecture se ferme (plus comptée dans le Stock, plus de file retenue pour rien)");
  const b5 = fausseBase();
  const e2 = await LO.ecrireDescriptionSansLecteur(b5, "u", 17, "Neuf");
  ok(e2.ok === false && b5.appels.length === 0, "trop court : rien n'est écrit, rien ne s'ouvre");
  ok((await LO.ecrireDescriptionSansLecteur(fausseBase({ lignes: 0 }), "u", 17, "Chemise neuve")).ok === false
    && (await LO.ecrireDescriptionSansLecteur(fausseBase({ erreurMaj: { message: "refus" } }), "u", 17, "Chemise neuve")).ok === false,
    "écriture refusée ou fiche introuvable : un échec dit (ok:false), jamais un faux succès");
  const b6 = fausseBase();
  const n1 = await LO.noterChoixSansLecteur(b6, "u", 17);
  const maj6 = b6.appels.find((q) => q.op === "update");
  ok(n1.ok === true && maj6 && !("description" in maj6.patch) && maj6.patch.attributs?.description_sans_lecture?.v === "redigee",
    "« La faire rédiger » : le choix seul sur la fiche, jamais un texte", JSON.stringify(maj6?.patch));
  ok(!b6.appels.some((q) => q.op === "rpc"), "… et la demande de lecture reste ouverte : le vrai texte, lu plus tard, passera devant la copie rédigée");
  ok((await LO.noterChoixSansLecteur(fausseBase({ erreurMaj: { message: "x" } }), "u", 17)).ok === false, "choix non écrit : dit — rien ne s'ouvre (sinon get-pending-jobs retiendrait la publication)");
  const ficheRedigee = { id: 17, origine: "vinted_sync", description: "", photos: [], attributs: R.patchChoixRedigee("2026-10-26T01:00:00.000Z").attributs, disparu_le: null };
  const a8 = await LO.attenteLectureOrigine(fausseBase({ profil: ficheRedigee }), "u", 17);
  ok(a8?.plateforme === "vinted" && a8.manque.includes("description"),
    "l'app (attenteLectureOrigine) repose la question malgré un « rédiger » d'hier — le serveur, lui, laisse partir la publication d'alors", JSON.stringify(a8));
  const b7 = fausseBase();
  LO.tracerChoixSansLecteur(b7, "u", { choix: "attendre", fiche: 17, lecteur: R.lecteurDisponible({ compte: PATRICK, maintenant: A_21H34 }) });
  const t7 = b7.appels.find((q) => q.op === "insert");
  ok(t7?.table === "usage_logs" && t7.patch.feature === "lecture_origine_sans_lecteur" && t7.patch.metadata.choix === "attendre" && t7.patch.metadata.version === "0.6.141" && t7.patch.metadata.raison === "extension_ancienne",
    "chaque choix est tracé (usage_logs « lecture_origine_sans_lecteur » : choix, raison, version, vu le)", JSON.stringify(t7?.patch));
}

console.log("\n6. Le câblage, et rien ne change quand le lecteur est là");
{
  const stock = lire("src/tabs/StockTab.jsx");
  const pad = stock.slice(stock.indexOf("const publierAvecDetail = async"), stock.indexOf("ouvrirStepper(r?.item ?? item);"));
  ok(/if \(attenteOrigine\?\.plateforme === 'vinted'\) \{\s*try \{ lecteur = await lireLecteurVinted\(supabase, user\.id, \{ versionIci: extVersionIci \}\); \} catch \{ lecteur = null; \}/.test(pad),
    "Stock : le lecteur est lu au clic « Publier », pour une fiche Vinted qui attend sa lecture");
  ok(/if \(lecteur && !lecteur\.disponible\) \{\s*signalerActionRatee\(\{ action: 'publier', motif: 'lecture_origine_sans_lecteur'/.test(pad)
    && /\} else \{\s*signalerActionRatee\(\{ action: 'publier', motif: 'lecture_origine_en_attente'/.test(pad),
    "Stock : sans lecteur, le serveur en est prévenu (lecture_origine_sans_lecteur) ; avec lui, la trace d'avant");
  ok(/setLecteurAttente\(lecteur\);\s*setAttenteStepper\(\{ item: r\?\.item \?\? item, attente: attenteOrigine \}\);/.test(pad), "Stock : l'écran reçoit le lecteur (rien d'autre ne change à l'ouverture)");
  ok(/lecteurInitial=\{lecteurAttente\}/.test(stock) && /lireLecteur=\{\(\) => lireLecteurVinted\(supabase, user\.id, \{ versionIci: extVersionIci \}\)\}/.test(stock)
    && /else if \(info\?\.choix === 'redigee'\) montrerNoteDetail\(libellesSansLecteur\(lang\)\.redigeeNote\);/.test(stock),
    "Stock : l'écran peut relire le lecteur ; « rédiger » ouvre le stepper avec sa note (relire, rien sur la fiche)");
  ok(/setExtVersionIci\(version \? String\(version\) : null\);/.test(stock) && /versionExtensionIci=\{extVersionIci\}/.test(stock),
    "Stock : la version de l'extension de CET appareil (sa présence dans la page), passée au lot aussi");

  const e = lire("src/publication/AttenteLectureOrigine.jsx");
  ok(/useState\(\(\) => \(issuesSansLecteur\(lecteurInitial\)\.length \? "choix" : "attente"\)\)/.test(e),
    "écran : les choix SEULEMENT sans lecteur ; avec lui (ou sans savoir), l'attente d'avant d'emblée");
  // (29/10, lot C 1 — Nico : « jamais d'attente sans issue », « choix immédiat ») La règle du 25/10 (« aucune issue
  // d'écriture pendant l'attente ») est remplacée : les issues de l'attente viennent d'UNE règle (issuesDeLEtat) —
  // aucune pendant une lecture qui avance (moins de 45 s), en discret ensuite, et TOUT DE SUITE sur un échec.
  const brancheLecteur = e.slice(e.indexOf("    // (29/10, lot C 1) « Récupération en cours »"), e.indexOf("  const contenu = ("));
  ok(brancheLecteur.length > 500 && /const issues = issuesDeLEtat\(etat, attendu\);/.test(brancheLecteur)
    && /phraseEtatDemande\(etat, \{ lang, lecteur, travail: lecteur\?\.travail \?\? null, plateforme \}\)/.test(brancheLecteur)
    && !/Ferme, et publie/.test(brancheLecteur)
    && /Fermer \(la lecture continue\)/.test(brancheLecteur) && /Recharger la page/.test(brancheLecteur),
    "écran, avec un lecteur : l'étape vraie, les issues par la règle (issuesDeLEtat) ; garder l'écran ouvert, recharger si le pont est mort");
  ok(/if \(mode !== "attente"\) return undefined;/.test(e) && /immediat: true/.test(e) && /if \(!a\) \{ await pret\(\); return true; \}/.test(e),
    "écran : la relecture est celle de l'attente (rien ne se relit pendant que la personne choisit ou écrit)");
  ok(/intervalleMs: sansLecteurAuDepart \? RELECTURE_SANS_LECTEUR_MS : RELECTURE_ATTENTE_MS/.test(e) && /if \(l\.disponible\) r\?\.changerIntervalle\(RELECTURE_ATTENTE_MS\);/.test(e)
    && /ATTENTE_SANS_LECTEUR_MAX_MS/.test(e),
    "« Attendre mon ordinateur » : une attente vraie (le lecteur se relit, retour à 6 s dès qu'il revient), bornée à 15 min de relecture");
  ok(/disabled=\{!assez \|\| envoi\} onClick=\{enregistrerTexte\}/.test(e) && /if \(envoi \|\| !descriptionEcriteSuffisante\(texte\)\) return;/.test(e)
    && /fontSize: 16/.test(e) && /minHeight: 46/.test(e),
    "écrire : « Continuer » seulement avec une description (≥ 2 mots) ; champ à 16 px, cibles ≥ 44 px");
  ok(/const url = urlAnnonceVinted\(item\);/.test(e) && /\{url \? \(/.test(e) && /target="_blank" rel="noopener noreferrer"/.test(e), "écrire : le lien « Ouvrir mon annonce Vinted », quand l'URL est connue");
  ok(/if \(!r\?\.ok\) \{\s*setEchec\(L\.echec\);\s*signalerActionRatee\(\{ action: "publier", motif: "choix_sans_lecteur_non_enregistre"/.test(e)
    && /motif: "description_ecrite_non_enregistree"/.test(e),
    "un choix non enregistré se dit à l'écran et au serveur — jamais un échec silencieux");
  ok(/onPret\?\.\(dernierItem\.current, \{ choix: "redigee" \}\)/.test(e) && /onPret\?\.\(\{ \.\.\.dernierItem\.current, description: r\.description \}, \{ choix: "ecrite" \}\)/.test(e),
    "écran : « rédiger » et « écrire » ouvrent le stepper — avec SA description pour « écrire »");
  ok(!/Write my description/.test(e), "le contrôle d'action-app-ratee tient : aucun libellé d'écriture dans l'écran (ils vivent dans les règles, rendus sans lecteur seulement)");

  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(/lireLecteurVinted\(supabase, userId, \{ versionIci: versionExtensionIci \}\)\.then/.test(lot) && /if \(lecteurRef\.current\?\.disponible === false\) \{\s*const l = await lireLecteurVinted/.test(lot),
    "lot : le lecteur est lu quand un article Vinted attend son origine, puis relu au rythme de la relecture (60 s)");
  ok(/if \(issuesSansLecteur\(lecteur\)\.length\) \{/.test(lot) && /sansLecteur\.ecrire\(id, texte\)/.test(lot) && /sansLecteur\.rediger\(id\)/.test(lot) && /sansLecteur\.attendre\(id\)/.test(lot),
    "lot : la ligne de l'article en attente propose les mêmes trois issues, chacune en un geste");
  ok(/reprendreApresChoix\(id, \{ \.\.\.\(complets\[id\] \?\? item \?\? \{\}\), description: r\.description \}, null\)/.test(lot) && /reprendreApresChoix\(id, null, "redigee_sans_lecteur"\)/.test(lot),
    "lot : « écrire » prépare l'article avec SA description ; « rédiger » le prépare pour un texte à relire");
  ok(/lecture\?\.note === "redigee_sans_lecteur"/.test(lot), "lot : le texte rédigé dit pourquoi il est à relire");
  ok(/tracerChoixSansLecteur\(supabase, userId, \{ evenement: "propose"/.test(lot) && /evenement: "echec", choix: "ecrite"/.test(lot) && /choix: "attendre"/.test(lot),
    "lot : proposé, choisi, raté — chaque cas tracé");
  ok(/n\[id\] = \{ \.\.\.n\[id\], phase: "attente", raison: null \}/.test(lot) && /function AttenteOrigine\([^)]*\) \{[\s\S]*?Retirer du lot[\s\S]*?\n\}/.test(lot),
    "lot, avec un lecteur : l'attente d'avant (elle repart toute seule une fois lue ; « Retirer du lot » après 60 s)");
}

console.log(`\n${rouges ? "✗" : "✓"} attente-sans-lecteur : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
