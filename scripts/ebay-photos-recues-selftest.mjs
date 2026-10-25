// `node scripts/ebay-photos-recues-selftest.mjs` — (25/10, R1 et R3) Fleur de Lotus
//
// R1 — LES PHOTOS REÇUES PAR eBAY. 22-23/10, extension 0.6.128, fenêtre minimisée :
// 11 refus du brouillon sur 11 nomment « Photos ». Le seul contrôle comptait les
// prévisualisations blob:/data: — éphémères sur eBay : 79 publications par
// l'extension en 30 jours, TOUTES « 0 détectée(s) ». Le champ était le PREMIER
// input[type=file] du DOM. Relevé du 25/10 sur le vrai formulaire (compte de Nico,
// brouillon 5432798485410) : un seul champ, input#fehelix-uploader ; une photo
// reçue = le compteur « N/25 » et une vignette i.ebayimg.com …/z/<id>/$_26.
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : les fonctions sont extraites de
//    chrome-extension/content-scripts/ebay.js (le texte qui part dans le zip) et
//    tournent contre un faux DOM borné aux sélecteurs employés — un nouveau
//    sélecteur fait échouer le test au lieu de passer en silence. Horloge
//    virtuelle : 20 s de budget s'exécutent instantanément.
//    `node scripts/ebay-photos-recues-selftest.mjs build/extension/content-scripts/ebay.js`
//    exécute le fichier minifié du paquet.
//
// R3 — LE COMPTE PAS ENCORE OUVERT À LA VENTE : trois des quatre publications ont
// fini sur onboardweb.ebay.fr (inscription vendeur) — un mur par compte, un seul
// éclaireur (_shared/vendeur-ebay.js), les branchements de get-pending-jobs et
// update-job-status.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = process.argv[2] ? String(process.argv[2]).replace(/\\/g, "/") : "chrome-extension/content-scripts/ebay.js";
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const SRC = lire(FICHIER);
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ""}`); } };

/** Extrait une fonction nommée de la source, par équilibrage d'accolades. */
function extraireFonction(source, nom) {
  const debut = source.search(new RegExp(`(?:async\\s+)?function\\s+${nom}\\s*\\(`));
  if (debut < 0) throw new Error(`${nom} introuvable dans ${FICHIER}`);
  let p = source.indexOf("(", debut), parens = 0;
  for (; p < source.length; p++) { if (source[p] === "(") parens++; else if (source[p] === ")") { parens--; if (parens === 0) break; } }
  let i = source.indexOf("{", p), prof = 0;
  for (; i < source.length; i++) { if (source[i] === "{") prof++; else if (source[i] === "}") { prof--; if (prof === 0) return source.slice(debut, i + 1); } }
  throw new Error(`${nom} : accolades non équilibrées`);
}

// ── Faux DOM : le strict nécessaire, et il le dit quand on sort du cadre ────
class El {
  constructor(tag, attrs = {}, enfants = []) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = []; this.parentElement = null;
    this._texte = attrs.text ?? ""; this.isConnected = true;
    for (const e of enfants) this.append(e);
  }
  append(e) { e.parentElement = this; this.children.push(e); return e; }
  remove() { const p = this.parentElement; if (p) p.children = p.children.filter((c) => c !== this); this.parentElement = null; this.isConnected = false; }
  get id() { return this.attrs.id ?? ""; }
  get type() { return this.attrs.type ?? ""; }
  get accept() { return this.attrs.accept ?? ""; }
  get src() { return this.attrs.src ?? ""; }
  get currentSrc() { return this.attrs.src ?? ""; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  get textContent() { return this._texte + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this._texte = String(v); this.children = []; }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) {
    const tous = [...this.descendants()];
    if (sel === 'input[type="file"]') return tous.filter((e) => e.tagName === "INPUT" && e.type === "file");
    if (sel === "span, div, p, label") return tous.filter((e) => ["SPAN", "DIV", "P", "LABEL"].includes(e.tagName));
    if (sel === 'img[src*="i.ebayimg.com"]') return tous.filter((e) => e.tagName === "IMG" && e.src.includes("i.ebayimg.com"));
    throw new Error(`sélecteur hors du faux DOM : ${sel}`);
  }
}
function faireDocument(body) {
  return {
    body,
    getElementById: (id) => [...body.descendants()].find((e) => e.id === id) ?? null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };
}

// L'horloge virtuelle : sleep avance le temps et rejoue ce que la page fait à cet instant.
let maintenant = 1_000_000;
let evenements = [];
class horloge extends Date { static now() { return maintenant; } }
const sleep = async (ms) => {
  maintenant += ms;
  for (const e of evenements.filter((x) => x.t <= maintenant)) e.f();
  evenements = evenements.filter((x) => x.t > maintenant);
};
const NOMS = ["champPhotosEbay", "compteurPhotosEbay", "vignettesEbay", "zonePhotosEbay", "photosRecuesEbay", "attendrePhotosRecuesEbay"];
const CODE = NOMS.map((nm) => extraireFonction(SRC, nm)).join("\n");
const re = /const COMPTEUR_PHOTOS_RE = (\/.+\/[a-z]*);/.exec(SRC);
const budget = /const PHOTOS_RECUES_BUDGET_MS = ([\d_]+);/.exec(SRC);
ok(Boolean(re && budget), "le compteur et le budget sont lus dans ebay.js");
function charger(document) {
  return new Function("document", "sleep", "Date", "COMPTEUR_PHOTOS_RE", "PHOTOS_RECUES_BUDGET_MS",
    `${CODE}\nreturn { ${NOMS.join(", ")} };`)(document, sleep, horloge, eval(re[1]), Number(budget[1].replace(/_/g, "")));
}

// Le formulaire relevé le 25/10 : la zone photos (compteur, grille), le champ invisible sous .no-touch.
const ACCEPT_EBAY = "image/*,image/heic,image/heif,video/mp4,video/quicktime";
function formulaire({ accept = ACCEPT_EBAY, avecId = true, autresChamps = [] } = {}) {
  const compteur = new El("span", { text: "0/25" });
  const grille = new El("div", { class: "grille" });
  const input = new El("input", { type: "file", accept, ...(avecId ? { id: "fehelix-uploader" } : {}) });
  const zone = new El("div", { class: "photos" }, [new El("div", {}, [compteur]), grille, new El("div", { class: "no-touch" }, [input])]);
  const body = new El("body", {}, [...autresChamps, new El("main", {}, [zone, new El("div", {}, [new El("span", { text: "Prix" })])])]);
  return { body, zone, compteur, grille, input };
}
const vignette = (id, taille = "$_26") => new El("img", { src: `https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/${id}/${taille}.PNG?set_id=880000500F` });

console.log("\nR1.1 Le bon champ : #fehelix-uploader, sinon celui qui accepte des images — jamais une vidéo seule");
{
  const f = formulaire();
  const d = charger(faireDocument(f.body));
  const c = d.champPhotosEbay();
  ok(c?.input === f.input && c.champ === "#fehelix-uploader", "le formulaire du 25/10 : #fehelix-uploader");
  const video = new El("input", { type: "file", accept: "video/mp4,video/quicktime" });
  const g = formulaire({ avecId: false, accept: "image/jpeg,image/png", autresChamps: [new El("div", {}, [video])] });
  const c2 = charger(faireDocument(g.body)).champPhotosEbay();
  ok(c2?.input === g.input && /accept « image\/jpeg,image\/png »/.test(c2.champ), "sans id : le champ qui accepte des images, pas le PREMIER champ du DOM (vidéo)", c2?.champ);
  const h = new El("body", {}, [new El("input", { type: "file", accept: "video/mp4" })]);
  ok(charger(faireDocument(h)).champPhotosEbay() === null, "une vidéo seule n'est jamais le champ des photos");
  const leurre = new El("body", {}, [new El("div", { id: "fehelix-uploader" }), new El("input", { type: "file", accept: "image/*" })]);
  ok(charger(faireDocument(leurre)).champPhotosEbay()?.input?.accept === "image/*", "un #fehelix-uploader qui n'est pas un champ fichier ne trompe pas");
}

console.log("\nR1.2 Une photo REÇUE : le compteur « N/25 », les vignettes i.ebayimg.com — jamais blob:/data:");
{
  const f = formulaire();
  const d = charger(faireDocument(f.body));
  const zone = d.zonePhotosEbay(f.input);
  ok(zone === f.zone, "la zone des photos est l'ancêtre du champ qui porte le compteur");
  ok(d.compteurPhotosEbay(zone) === 0, "« 0/25 » avant la remise");
  const suivi = { zone, champ: "#fehelix-uploader", remises: 2, t0: maintenant, mode: "observer", avant: { compteur: 0, vignettes: d.vignettesEbay(zone) } };
  f.grille.append(new El("img", { src: "blob:https://www.ebay.fr/6b1c" }));
  f.grille.append(new El("img", { src: "data:image/png;base64,iVBOR" }));
  ok(d.photosRecuesEbay(suivi).recues === 0, "des prévisualisations blob:/data: ne sont pas des photos reçues");
  f.compteur.textContent = "1/25";
  f.grille.append(vignette("aaaAAOSw1"));
  f.grille.append(vignette("aaaAAOSw1", "$_57"));
  const r1 = d.photosRecuesEbay(suivi);
  ok(r1.recues === 1 && r1.compteur === 1 && r1.vignettes === 1, "« 1/25 » et une image en deux tailles ($_26, $_57) = UNE photo reçue", JSON.stringify(r1));
  f.grille.append(vignette("bbbAAOSw2"));
  ok(d.photosRecuesEbay(suivi).recues === 2, "la vignette arrive avant le compteur : comptée quand même (le plus grand des deux)");
  ok(d.compteurPhotosEbay(new El("div", {}, [new El("span", { text: "Remise de 3/25 €" }), new El("p", { text: "Photos 2/25 ajoutées" })])) === null,
    "le compteur est une feuille « N/25 » seule, jamais une phrase qui en contient un");
  ok(d.compteurPhotosEbay(new El("div", {}, [new El("span", { text: "1/2" })])) === null, "« 1/2 » (une fraction, une date) n'est pas le compteur de photos");
}

console.log("\nR1.3 L'attente bornée : sortie dès que tout est reçu, 20 s au plus sinon");
{
  const f = formulaire();
  const d = charger(faireDocument(f.body));
  const zone = d.zonePhotosEbay(f.input);
  const suivi = { zone, champ: "#fehelix-uploader", remises: 3, t0: maintenant, mode: "observer", avant: { compteur: 0, vignettes: d.vignettesEbay(zone) } };
  // Le relevé du 25/10 : « 1/25 » 3 à 5 s après le change.
  evenements = [
    { t: maintenant + 3500, f: () => { f.compteur.textContent = "1/25"; f.grille.append(vignette("p1")); } },
    { t: maintenant + 4000, f: () => { f.compteur.textContent = "2/25"; f.grille.append(vignette("p2")); } },
    { t: maintenant + 5000, f: () => { f.compteur.textContent = "3/25"; f.grille.append(vignette("p3")); } },
  ];
  const t = await d.attendrePhotosRecuesEbay(suivi);
  ok(t.recues === 3 && t.remises === 3 && t.delai_ms === 5000 && t.compteur === 3 && t.vignettes === 3 && t.mode === "observer" && t.champ === "#fehelix-uploader",
    `trois photos reçues en 5 s : sortie aussitôt, trace complète`, JSON.stringify(t));
  const g = formulaire();
  const d2 = charger(faireDocument(g.body));
  const z2 = d2.zonePhotosEbay(g.input);
  evenements = [];
  const t2 = await d2.attendrePhotosRecuesEbay({ zone: z2, champ: "#fehelix-uploader", remises: 4, t0: maintenant, mode: "observer", avant: { compteur: 0, vignettes: d2.vignettesEbay(z2) } });
  ok(t2.recues === 0 && t2.remises === 4 && t2.delai_ms >= 20_000 && t2.delai_ms < 21_000, `Fleur de Lotus : rien reçu → 0/4 après le budget (${t2.delai_ms} ms)`);
  g.zone.remove();
  const r3 = d2.photosRecuesEbay({ zone: g.zone, remises: 1, avant: { compteur: 0, vignettes: new Set() } });
  ok(r3.recues === 0, "zone retirée du DOM (rendu refait) : relue sur la page, sans erreur");
}

console.log("\nR1.4 Les branchements : observer par défaut, l'interrupteur bloque AVANT tout clic, jamais de soumission après le code");
{
  const up = extraireFonction(SRC, "uploadPhotos");
  ok(/await waitFor\(\(\) => champPhotosEbay\(\), 8000\)/.test(up) && !/querySelector\('input#fehelix-uploader, input\[type="file"\]'\)/.test(SRC),
    "uploadPhotos choisit le champ par champPhotosEbay — plus jamais le premier input[type=file]");
  ok(/mode: fields\?\.ebay_photos_mode === "bloquer" \? "bloquer" : "observer"/.test(up), "mode « observer » par défaut ; « bloquer » seulement si le serveur le sert");
  ok(!/img\[src\^="blob:"\]/.test(SRC), "le compte blob:/data: (aveugle sur eBay) a disparu d'ebay.js");
  const fill = extraireFonction(SRC, "fillListingForm");
  const garde = fill.indexOf("Garde pré-submit PHOTOS");
  const clic = fill.indexOf('Le clic "Mettre en vente avec les frais affichés" est un engagement');
  ok(garde > 0 && clic > garde, "la garde photos est relue AVANT le clic « Mettre en vente »");
  ok(/if \(r\.recues < suiviPhotos\.remises && suiviPhotos\.mode === "bloquer"\) \{[\s\S]{0,900}success: false,\s*needsUser: true,[\s\S]{0,400}diagnostic: \{ quoi: MOTIF_PHOTOS_NON_RECUES/.test(fill),
    "mode bloquer : arrêt avec le code ebay_photos_non_recues, rien cliqué");
  ok((fill.match(/photosTrace(,| \})/g) ?? []).length >= 5, "la trace part avec chaque issue principale (dry-run, prix, format, photos, fin)");
  const R = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/ebay-brouillon-refus.js")).href);
  ok(/const ANCRE_PHOTOS_NON_RECUES = "([^"]+)"/.exec(SRC)?.[1] === R.ANCRE_PHOTOS_NON_RECUES && /const MOTIF_PHOTOS_NON_RECUES = "ebay_photos_non_recues"/.test(SRC),
    "même ancre et même code que le serveur (_shared/ebay-brouillon-refus.js)");
  const BG = lire("chrome-extension/background.js");
  ok(/ebay_photos_recues: result\.photosTrace/.test(BG), "background : la trace → platform_fields.ebay_photos_recues");
  ok(/const photosNonRecues = job\.platform_fields\?\.ebay_photos_recues\?\.code === "ebay_photos_non_recues";[\s\S]{0,300}if \(draftId && !photosNonRecues\) \{[\s\S]{0,600}direct = await ebayDirectPublish\(tabId, job\);/.test(BG),
    "background : jamais ebayDirectPublish après le code ebay_photos_non_recues");
  const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/eq\("key", "ebay_photos_recues_bloquant"\)[\s\S]{0,300}ebay_photos_mode: "bloquer"/.test(GPJ), "get-pending-jobs : l'interrupteur coin_config ebay_photos_recues_bloquant sert « bloquer » (0 ou absent : observer)");
  const p = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/pas-de-rouge.js")).href);
  const s = p.classerEchec({ platform: "ebay", action: "publish", brut: `${R.ANCRE_PHOTOS_NON_RECUES} : 0 sur 4 après 85 s. Aucun clic fait, rien n'a été soumis ni publié.`, essais: 0, pf: { last_diagnostic: { quoi: "ebay_photos_non_recues" } }, build: "2026-10-26T10:00:00Z+abc · v0.6.150" });
  ok(s.motif === "ebay_photos_non_recues" && s.verdict === "reprise", "le serveur classe l'arrêt de l'extension comme le refus « Photos » (R2 : deux reprises, puis l'arrêt nommé)");
}

console.log("\nR3 Le compte pas encore ouvert à la vente : un mur par compte, un seul éclaireur");
{
  const V = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/vendeur-ebay.js")).href);
  const T = Date.parse("2026-10-23T08:10:00Z");
  const iso = (min) => new Date(T + min * 60_000).toISOString();
  const mur = { id: "93012c53", platform: "ebay", action: "publish", status: "needs_user", voie: "extension", created_at: iso(-120), error: "Ton compte eBay n'est pas encore prêt pour vendre.",
    platform_fields: { needs_user_source: "ebay_compte_vendeur_inactif", compte_vendeur_inactif: { depuis: iso(-4), derniere: iso(-4), observations: 1, tab_url: "https://onboardweb.ebay.fr/onboard-revamped/", fill_step: "clic_mise_en_vente" } } };
  const p = (id, min, pf = {}) => ({ id, platform: "ebay", action: "publish", status: "pending", voie: "extension", created_at: iso(min), platform_fields: pf });
  const a = p("7f97e131", -100), b = p("00f81af0", -90), c = p("c64e5596", -130);
  ok(V.murVendeurEbayVuLe(mur, T) === T - 4 * 60_000, "le mur VU : la page d'inscription et sa date (compte_vendeur_inactif)");
  const d1 = V.decisionVendeurEbay([a, b, c], [mur], T);
  ok(d1.servir === null && d1.retenir.length === 3, "4 min après le mur : aucun dépôt eBay de l'extension servi, les 3 retenus");
  const relance = p("7f97e131", -100, { derniere_relance_manuelle: iso(-2) });
  const d2 = V.decisionVendeurEbay([relance, b, c], [mur], T);
  ok(d2.servir === relance && !d2.eclaireurAuto && d2.retenir.length === 2, "la tâche relancée par la personne est l'éclaireur, les autres attendent");
  const d3 = V.decisionVendeurEbay([a, b, c], [mur], T + 61 * 60_000);
  ok(d3.servir === c && d3.eclaireurAuto && d3.retenir.length === 2, "au barème (1 h) : UN éclaireur, le plus ancien");
  const eclaire = { ...c, platform_fields: V.champsEclaireurVendeurEbay(c.platform_fields, iso(61)) };
  const d4 = V.decisionVendeurEbay([a, b], [mur, eclaire], T + 120 * 60_000);
  ok(d4.servir === null && d4.retenir.length === 2, "un éclaireur lancé : le suivant attend l'écart suivant (3 h)");
  const vendu = { id: "pub1", platform: "ebay", action: "publish", status: "published", voie: "api", published_at: iso(10), handler_build: null };
  ok(V.decisionVendeurEbay([a, b], [mur, vendu], T + 20 * 60_000).retenir.length === 0, "une publication eBay faite APRÈS le mur (toute voie) : plus rien n'est retenu");
  ok(V.decisionVendeurEbay([{ ...a, action: "delete" }, { ...b, voie: "api" }], [mur], T).retenir.length === 0, "jamais un retrait, jamais la voie API");
  const niveau = { ...mur, platform_fields: { ...mur.platform_fields, compte_vendeur_inactif: { ...mur.platform_fields.compte_vendeur_inactif, mur: "mise_a_niveau" } } };
  ok(V.decisionVendeurEbay([a, b], [niveau], T).retenir.length === 0, "la mise à niveau (/fpa/upgrade) n'est pas ce mur : son pré-vol l'arrête déjà avant tout formulaire");
  ok(V.decisionVendeurEbay([a, b], [mur], T + 31 * 86_400_000).retenir.length === 0, "un mur vu il y a plus de 30 jours ne retient plus rien");
  const pfRet = V.champsRetenueVendeurEbay({ next_action_after: iso(5) }, iso(0));
  const retenu = { ...a, status: "needs_user", platform_fields: pfRet };
  ok(pfRet.needs_user_source === "ebay_compte_vendeur_inactif" && pfRet.compte_vendeur_inactif.retenue_le === iso(0) && !pfRet.next_action_after
    && !Number.isFinite(V.murVendeurEbayVuLe(retenu, T)), "une retenue porte le geste du compte, jamais un mur VU");
  ok(V.attendVendeurEbay(retenu) && V.attendVendeurEbay(mur) && V.attentesVendeurEbay([retenu, mur])[0] === mur, "les tâches en attente : le mur vu et la retenue, la plus ancienne d'abord");
  const pfRep = V.champsRepriseVendeurEbay(pfRet, 2, T, "selftest");
  ok(!V.attendVendeurEbay({ ...retenu, platform_fields: pfRep }) && pfRep.next_action_after === new Date(T + 90_000).toISOString() && !pfRep.needs_user_source,
    "relâchée : plus en attente, espacée de 45 s par rang");
  ok(!V.attendVendeurEbay({ ...retenu, platform_fields: { ...pfRet, needsUserField: { field_key: "Taille" } } }), "une vraie question de champ garde sa ligne");
  ok(/doit d'abord être ouvert à la vente \(inscription vendeur eBay\)/.test(V.MESSAGE_VENDEUR_EBAY) && /Rien n'a été publié/.test(V.MESSAGE_VENDEUR_EBAY),
    "le message vrai : « ton compte eBay doit d'abord être ouvert à la vente (inscription vendeur eBay) », rien publié");
  const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/decisionVendeurEbay\(out\.filter\(\(j\) => estDepotEbayExtension\(j as never\)\) as never\[\], jobsE as never\[\], maintenantE\)/.test(GPJ)
    && /update\(\{ status: "needs_user", error: MESSAGE_VENDEUR_EBAY, platform_fields: pfAPersister\(pfV\) \}\)\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(GPJ),
    "get-pending-jobs : la décision, puis la retenue en compare-and-swap sur pending");
  const UJS = lire("supabase/functions/update-job-status/index.ts");
  ok(/if \(statutEffectif === "published"\) \{[\s\S]{0,700}eq\("platform_fields->>needs_user_source", SOURCE_VENDEUR_EBAY\)[\s\S]{0,600}champsRepriseVendeurEbay\(/.test(UJS),
    "update-job-status : une publication eBay faite relâche les tâches en attente");
}

console.log(ko ? `\n✗ ebay-photos-recues : ${ko} échec(s) sur ${n}` : `\n✓ ebay-photos-recues : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
