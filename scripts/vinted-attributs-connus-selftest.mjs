// selftest:vinted-attributs-connus — (02/11, XEWER, règle de Nico) UN ATTRIBUT VINTED EXIGÉ ET CONNU PART DANS L'ENVOI
//
// Sept lots de livres Barbie retirés de Vinted le 01/11, jamais recréés (needs_user « recreation_bloquee ») : Vinted
// répondait 400 « Sélectionne une langue pour continuer » (language_book) alors que « Français » était dans
// vintedAspects / needsUserResolved. La langue ne partait que par le formulaire, où le champ n'apparaît pas (ISBN
// d'origine de treize zéros) ; et le message disait « vérifie ton compte ».
//
//   A. la sonde de l'envoi (background.js, code LIVRÉ) : les attributs connus posés par leurs identifiants pour les codes
//      que la page a laissés vides, jamais par-dessus, jamais hors du rayon armé, ni périmés, la pose relevée ;
//   B. le remplissage (vinted.js, code LIVRÉ) : la langue par son libellé → identifiant RELEVÉ (Français 6436, Anglais
//      6435, rien d'autre) ; la porte de la langue ouverte par l'étape ISBN qui a trouvé le champ ; un attribut connu
//      résolu sur la config de LA catégorie (une seule option, sinon rien) ; l'ISBN d'origine posé tel quel, inchangé ;
//   C. le serveur (_shared/recreation-bloquee.js, handler-watch) : la cause nommée, jamais « vérifie ton compte » ; la
//      relance UNE fois au build qui corrige ; le message dit l'attente tant que le poste ne l'a pas.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const hw = lire("supabase/functions/handler-watch/index.ts");

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// ── A. LA SONDE ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nA. LA SONDE DE L'ENVOI");
const d = bg.indexOf("        window.__fsAttributsConnusAPoser = null;");
const f = bg.indexOf("        // (29/10) Les attributs de l'annonce d'origine (recréation) ferment la chaîne ; (02/11) puis les attributs connus.", d);
if (d < 0 || f < 0) { console.error("✗ bloc de pose des attributs connus introuvable dans background.js"); process.exit(1); }
const fabrique = new Function("window", "ISBN_ARME_TTL_MS", `let dernierePoseAttributs = null; ${bg.slice(d, f)}; return { corpsAvecAttributsConnus, derniere: () => dernierePoseAttributs, poser: (v) => { dernierePoseAttributs = v; } };`);
function sonde(armement, ageMs = 0) {
  const ecouteurs = [];
  const win = { addEventListener: (t, fn) => ecouteurs.push(fn), __fsAttributsConnusAPoser: null };
  const api = fabrique(win, 15 * 60 * 1000);
  if (armement !== undefined) {
    for (const fn of ecouteurs) fn({ source: win, data: { __fillsellArmeAttributsConnus: true, ...armement } });
    if (win.__fsAttributsConnusAPoser && ageMs) win.__fsAttributsConnusAPoser.armeeA -= ageMs;
  }
  return api;
}
const URL = "https://www.vinted.fr/api/v2/item_upload/items";
const corps = (item) => JSON.stringify({ item, feedback_id: null });
const jeu = (extra = {}) => ({ id: null, title: "Rage 2", catalog_id: 3026, price: "15", ...extra });
const ARME = { attrs: [{ code: "video_game_platform", ids: [1280] }], catalogId: 3026 };
{
  const s = sonde(ARME);
  const r = s.corpsAvecAttributsConnus(URL, corps(jeu({ item_attributes: [{ code: "condition", ids: [3] }] })));
  const ia = r && JSON.parse(r).item.item_attributes;
  ok(Array.isArray(ia) && ia.some((a) => a.code === "video_game_platform" && a.ids[0] === 1280) && ia.some((a) => a.code === "condition" && a.ids[0] === 3),
    "code laissé vide par la page : posé par son identifiant, l'état de la page gardé", JSON.stringify(ia));
  ok(s.derniere() === "video_game_platform=1280", "la pose est relevée (attributsPoses)", String(s.derniere()));
}
{
  const s = sonde(ARME);
  s.poser("sim_lock=1313");
  s.corpsAvecAttributsConnus(URL, corps(jeu()));
  ok(s.derniere() === "sim_lock=1313,video_game_platform=1280", "la pose s'ajoute à celle des attributs d'origine (un seul relevé)", String(s.derniere()));
}
ok(sonde(ARME).corpsAvecAttributsConnus(URL, corps(jeu({ item_attributes: [{ code: "video_game_platform", ids: [999] }] }))) === null,
  "⛔ jamais par-dessus un code posé par la page");
ok(sonde(ARME).corpsAvecAttributsConnus(URL, corps(jeu({ catalog_id: 1904 }))) === null, "autre rayon que celui armé : rien");
ok(sonde(ARME, 16 * 60 * 1000).corpsAvecAttributsConnus(URL, corps(jeu())) === null, "armement de plus de 15 min : rien");
ok(sonde().corpsAvecAttributsConnus(URL, corps(jeu())) === null && sonde({ attrs: null, catalogId: null }).corpsAvecAttributsConnus(URL, corps(jeu())) === null,
  "rien d'armé (ou désarmé) : rien");
ok(sonde(ARME).corpsAvecAttributsConnus("https://www.vinted.fr/api/v2/item_upload/attributes", corps(jeu())) === null
  && sonde(ARME).corpsAvecAttributsConnus(URL, "{pas du json") === null, "autre requête ou corps illisible : rien, jamais d'exception");
ok(/const avecConnus = corpsAvecAttributsConnus\(url, avantConnus \?\? body\);\s*return avecConnus \?\? avantConnus;/.test(bg),
  "la chaîne : ISBN → langue → colis → marque → attributs d'origine → attributs connus");

// ── B. LE REMPLISSAGE ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nB. LE REMPLISSAGE (vinted.js)");
const extraire = (debut, fin) => { const i = vt.indexOf(debut); const j = vt.indexOf(fin, i); if (i < 0 || j < 0) throw new Error(`introuvable : ${debut}`); return vt.slice(i, j); };
const srcTexte = extraire("function texteComparable(s) {", "\nconst normalizeFuzzy");
const srcCles = extraire("const CLES_TITRE_OPTION = ", "\nfunction libelleAttributParId");
const srcLangue = extraire("const VINTED_LANGUES_LIVRE_IDS = ", "\n// ── (02/11, XEWER — règle de Nico)");
const srcId = extraire("const CLES_ID_OPTION = ", "\nfunction armerAttributsConnusPourPost");
const M = new Function(`${srcTexte}\n${srcCles}\n${srcLangue}\n${srcId}\nreturn { idLangueLivreDuLibelle, idAttributParLibelle };`)();
ok(M.idLangueLivreDuLibelle("Français") === 6436 && M.idLangueLivreDuLibelle(" francais ") === 6436 && M.idLangueLivreDuLibelle("French") === 6436,
  "« Français » → 6436 (relevé sur 1 151 annonces), casse et accents écrasés");
ok(M.idLangueLivreDuLibelle("Anglais") === 6435 && M.idLangueLivreDuLibelle("English") === 6435, "« Anglais » → 6435 (relevé sur 36 annonces)");
ok(M.idLangueLivreDuLibelle("Allemand") === null && M.idLangueLivreDuLibelle("") === null && M.idLangueLivreDuLibelle("6436") === null,
  "⛔ une langue sans identifiant sûr : rien (jamais devinée)");
const META = { optionsBrutes: [{ id: 1280, title: "PlayStation 4" }, { id: 1281, title: "PlayStation 5" }, { id: 77, title: "Xbox One" }] };
ok(M.idAttributParLibelle(META, "PlayStation 4") === 1280 && M.idAttributParLibelle(META, "playstation  4") === 1280, "libellé de LA config → son identifiant");
ok(M.idAttributParLibelle(META, "PlayStation") === null && M.idAttributParLibelle(null, "PlayStation 4") === null && M.idAttributParLibelle(META, "") === null,
  "⛔ libellé absent de la config, ou config non reniflée : rien");
ok(M.idAttributParLibelle({ optionsBrutes: [{ id: 5, title: "Neuf" }, { id: 6, title: "neuf" }] }, "Neuf") === null, "⛔ deux options de ce libellé : rien (ambigu)");
ok(M.idAttributParLibelle({ optionsBrutes: [{ value: 42, label: "Rouge" }] }, "Rouge") === 42
  && M.idAttributParLibelle({ optionsBrutes: [{ cle: 9, nom: "Bleu", title: "Bleu" }] }, "Bleu") === 9
  && M.idAttributParLibelle({ optionsBrutes: [{ a: 9, b: 10, title: "Vert" }] }, "Vert") === null,
  "clé d'identifiant non présumée : id/value/option_id, sinon la seule valeur entière — deux entiers : rien");
// La langue : porte et armement.
const blocLangue = extraire("  const langueFournie = String(fields.vintedAspects?.language_book ?? \"\").trim();", "  // Marque : catalogue d'abord");
ok(/if \(isbnChampVu \|\| langueFournie \|\| document\.querySelector\(vintedFieldSelector\("isbn"\)\)\) \{/.test(blocLangue),
  "la porte : l'étape ISBN qui a TROUVÉ le champ, une langue fournie, ou #isbn présent");
ok(/const idFourni = idLangueLivreDuLibelle\(langueFournie\);\s*if \(idFourni\) armerLangueLivrePourPost\(\[idFourni\]\);/.test(blocLangue),
  "langue fournie à identifiant relevé : armée au POST (la sonde ne la pose que si la page l'a laissée vide)");
ok(/const idsCapture = langueLivreDeLaCapture\(job\);\s*const ids = idsCapture\.length \? idsCapture : \[VINTED_LANGUE_LIVRE_DEFAUT_ID\];/.test(blocLangue),
  "sans langue fournie : capture, sinon le défaut — inchangé");
ok(/const el = await waitForElement\('#isbn, \[data-testid="isbn--input"\]', ISBN_ATTENTE_MS\)\.catch\(\(\) => null\);\s*if \(!el\) \{[\s\S]{0,800}?return;\s*\}\s*isbnChampVu = true;/.test(vt),
  "isbnChampVu : posé seulement quand l'étape ISBN a trouvé le champ");
ok(/isbnCaptureTelQuel = valeur;\s*tracePose\.push\("ISBN capturé non standard posé TEL QUEL/.test(vt) && /armerIsbnPourPost\(valeur\);/.test(vt),
  "⛔ l'ISBN d'origine reste remis TEL QUEL (pose et armement inchangés)");
// L'attribut connu générique.
const blocGen = extraire("    // (02/11, XEWER — règle de Nico) Ce que le formulaire n'a pas su poser", "  jalonRemplissage(\"Attributs\");");
ok(/!handledCodes\.has\(code\) && !ATTRIBUTS_CONNUS_HORS_SONDE\.has\(code\)/.test(blocGen) && /!\(el && String\(valeurChampVinted\(el\) \?\? ""\)\.trim\(\)\)/.test(blocGen),
  "seulement les valeurs que le formulaire n'a pas posées, hors canaux dédiés");
ok(/idAttributParLibelle\(parCode\.get\(code\), val\)/.test(blocGen) && /armerAttributsConnusPourPost\(connus, \/\^\\d\+\$\/\.test\(catalogue\) \? Number\(catalogue\) : null\)/.test(blocGen),
  "identifiant résolu sur la config de la catégorie posée, armé pour CE rayon (#category)");
ok(/diagnosticsRecreation\.push\(note\)/.test(blocGen), "ce qui est armé (ou laissé faute d'identifiant) part dans le diagnostic");
ok(/armerAttributsOriginePourPost\(null\);\s*\/\/ \(02\/11\)[^\n]*\n\s*armerAttributsConnusPourPost\(null\);/.test(vt), "désarmé à chaque remplissage (aucun armement d'un article sur le suivant)");
ok(/ATTRIBUTS_CONNUS_HORS_SONDE = new Set\(\["isbn", "language_book", "brand", "model", "size", "condition", "color", "material", "package_size"\]\)/.test(vt),
  "ISBN, langue, marque, modèle, taille, état, couleur, matière, colis : leurs propres chemins, jamais celui-ci");
ok(/attributsPoses: c\?\.attributsPoses \?\? null/.test(vt) && /attributs POSÉS dans le corps par la sonde/.test(vt), "un refus dit quels attributs la sonde a posés");

// ── C. LE SERVEUR ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\nC. LE SERVEUR (remise en ligne bloquée)");
const R = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/recreation-bloquee.js")).href);
const BUILD = R.BUILD_ATTRIBUTS_CONNUS;
ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(BUILD), `build qui corrige : un horodatage (${BUILD})`);
const xewer = {
  id: "ddb5a34d", user_id: "de63ca45", platform: "vinted", action: "republish", status: "needs_user",
  title: "Lot de 4 livres Barbie – Collection « Vie de rêve",
  error: "Ton annonce « Lot de 4 livres Barbie – Collection « Vie de rêve » a été retirée de Vinted le 01/11 et FillSell n'a pas réussi à la remettre en ligne (11 essais). Rien n'est perdu : titre, description, photos et champs sont gardés. Ouvre Vinted sur ton ordinateur pour vérifier ton compte, puis appuie sur « Republier maintenant » : elle repartira. Tes autres republications, elles, continuent.",
  platform_fields: {
    republish_step: "deleted", needs_user_source: "recreation_bloquee", deleted_at_serveur: "2026-11-01T12:52:00Z",
    recreation_reprises: 11, vintedAspects: { language_book: "Français" }, needsUserResolved: { "vintedAspects.language_book": "Français" },
    server_required_fields: [{ key: "language_book", label: "language_book", message: "Sélectionne une langue pour continuer" }],
    last_diagnostic: "refus serveur HTTP 400 (/api/v2/item_upload/items) || réponse : {\"code\":99,\"message_code\":\"validation_error\",\"errors\":[{\"field\":\"language_book\"}]} || champs exigés : language_book (language_book)",
  },
};
const avant = new Date(Date.parse(BUILD) - 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const apres = new Date(Date.parse(BUILD) + 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
ok(R.causeLeveePourRelance(xewer, `${avant}+be4a6aa`) === null, "poste en 0.6.165 (sans le correctif) : pas encore relancée");
const c = R.causeLeveePourRelance(xewer, `${apres}+abcdef0`);
ok(c?.code === "vinted_attribut_connu_non_pose", "poste au build qui corrige : relancée une fois (cause vinted_attribut_connu_non_pose)", String(c?.code));
const pf = c ? R.champsRelanceCauseLevee(xewer.platform_fields, c, "2026-11-02T12:00:00Z") : {};
ok(pf.republish_step === "deleted" && pf.recreation_relancee?.vinted_attribut_connu_non_pose && pf.build_min_requis === BUILD && !pf.needs_user_source,
  "relancée : étape gardée, marquée une fois, servie seulement à un poste au build qui corrige");
ok(R.causeLeveePourRelance({ ...xewer, platform_fields: { ...xewer.platform_fields, ...pf, needs_user_source: "recreation_bloquee" } }, `${apres}+abcdef0`)?.code !== "vinted_attribut_connu_non_pose",
  "⛔ une fois : si elle retombe, cette cause ne la relance plus");
ok(R.causeLeveePourRelance({ ...xewer, platform_fields: { ...xewer.platform_fields, vintedAspects: {} } }, `${apres}+abcdef0`) === null,
  "valeur exigée INCONNUE de la tâche : pas cette cause (la question reste à la personne)");
ok(R.causeLeveePourRelance({ ...xewer, platform_fields: { ...xewer.platform_fields, selling_restriction: { n: 1 } } }, `${apres}+abcdef0`) === null,
  "cause du compte : jamais relancée d'office");
ok(R.causeLeveePourRelance(xewer, `${avant}+be4a6aa`, { ignorerBuild: true })?.code === "vinted_attribut_connu_non_pose",
  "la cause qui ATTEND le poste se lit (ignorerBuild) — pour le message");
const attente = R.messageRecreationBloquee(xewer, { causeEnAttente: { code: "vinted_attribut_connu_non_pose" } });
ok(!/vérifier ton compte/.test(attente) && /« Langue du livre » \(« Sélectionne une langue pour continuer » \)|« Langue du livre » \(« Sélectionne une langue pour continuer »\)/.test(attente)
  && /défaut de notre côté, corrigé : elle repartira toute seule dès que l'extension FillSell de ton ordinateur sera à jour/.test(attente)
  && /Rien n'est perdu/.test(attente) && /Rien à faire/.test(attente) && /01\/11/.test(attente) && /11 essais/.test(attente),
  "message en attente : la vraie cause nommée, l'attente dite, rien à faire, jamais « vérifie ton compte »", attente);
const sans = R.messageRecreationBloquee({ ...xewer, platform_fields: { ...xewer.platform_fields, vintedAspects: {} } });
ok(!/vérifier ton compte/.test(sans) && /il exige « Langue du livre »/.test(sans) && /Republier maintenant/.test(sans),
  "valeur inconnue : le champ exigé nommé, le geste « Republier maintenant »");
const inconnu = R.messageRecreationBloquee({ ...xewer, platform_fields: { republish_step: "deleted", deleted_at_serveur: "2026-11-01T12:52:00Z", recreation_reprises: 3 } });
ok(!/vérifier ton compte/.test(inconnu) && /Republier maintenant/.test(inconnu) && /\(3 essais\)\./.test(inconnu), "cause inconnue : plus jamais « vérifie ton compte » (le compte a son propre message)");
const iHw = hw.indexOf("(02/11, XEWER) Le message d'une remise en ligne bloquée nomme la vraie cause");
const blocHw = hw.slice(iHw, iHw + 1400);
ok(iHw > 0 && /needs_user_source !== SOURCE_RECREATION_BLOQUEE\) continue;/.test(blocHw) && /if \(j\.error === juste\) continue;/.test(blocHw)
  && /archiverErreur/.test(blocHw) && /\.eq\("status", "needs_user"\)/.test(blocHw) && !/status: "pending"/.test(blocHw),
  "handler-watch : le message réécrit seulement s'il a changé (ancien archivé), jamais le statut");
ok(/import \{[^}]*messageRecreationBloquee[^}]*causeLeveePourRelance[^}]*\} from "\.\.\/_shared\/recreation-bloquee\.js"/.test(hw), "handler-watch : la règle vient du module partagé");

console.log(`\n${ko ? "✗" : "✓"} attributs connus dans l'envoi Vinted : ${n - ko}/${n}`);
process.exit(ko ? 1 : 0);
