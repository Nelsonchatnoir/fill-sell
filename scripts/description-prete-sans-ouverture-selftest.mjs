// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION PRÊTE, SANS JAMAIS RIEN OUVRIR (15/11/2026, point 3 de Nico — maquette validée)
//   npm run selftest:description-prete-sans-ouverture
// ═══════════════════════════════════════════════════════════════════════════
// VERROU : « jamais d'ouverture automatique hors de l'écran d'attente ». Le 14/11 (point A), la fiche fermée pendant la
// lecture de sa description se rouvrait TOUTE SEULE en publication dès que la description arrivait — même si la
// personne faisait autre chose. Désormais : resté sur l'écran d'attente, la publication s'ouvre comme avant ; fermé ou
// autre écran, seule la carte change (« Lecture… » → « Prêt à publier » + bandeau qui part seul, ou « Description
// introuvable · Écrire la description » au bout de 5 min), et la publication ne s'ouvre qu'au TOUCHER, déjà remplie,
// jamais sans description. Ce test casse si une ouverture automatique revient, ou si ces états changent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Un fichier absent (le code d'avant) se lit vide : le test compte ses rouges au lieu de planter.
const lire = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
let verts = 0, rouges = 0;
const ok = (c, m, detail = "") => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${detail ? `  ← ${detail}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return `exception : ${e.message}`; } };

let D = null;
try { D = await import("../src/publication/descriptionsSuivies.js"); } catch (e) { console.log(`  (module du suivi absent : ${e.message.slice(0, 80)})`); }
const fn = (nom) => (D && typeof D[nom] === "function" ? D[nom] : () => { throw new Error(`${nom} absente`); });

console.log("1. Les états de la carte (règles pures)");
const apres = fn("etatApresDecision");
ok(essai(() => apres("ouvrir")) === "prete", "description RÉELLEMENT en base → « prête » (rien ne s'ouvre)");
ok(essai(() => apres("attendre")) === "lecture", "pas encore lue → « Lecture… »");
ok(essai(() => apres("expiree")) === "introuvable" && essai(() => apres("conclue")) === "introuvable", "5 min sans description, ou lue sans texte → « Description introuvable »");
const pastille = fn("pastilleSuivi");
ok(JSON.stringify(essai(() => pastille("lecture", "fr"))) === JSON.stringify({ texte: "Lecture…", ton: "neutre", pulse: true }), "pastille « Lecture… » (point gris qui pulse)");
ok(JSON.stringify(essai(() => pastille("prete", "fr"))) === JSON.stringify({ texte: "Prêt à publier", ton: "ok", pulse: false }), "pastille « Prêt à publier » (point teal)");
ok(JSON.stringify(essai(() => pastille("introuvable", "fr"))) === JSON.stringify({ texte: "Description introuvable", ton: "regler", pulse: false }), "pastille « Description introuvable » (ambre, jamais rouge)");
ok(essai(() => pastille(null)) === null, "pas suivie → la pastille de toujours");

console.log("\n2. Le bandeau : un seul, qui part seul, jamais par-dessus une publication");
const contenu = fn("contenuBandeau");
const S = (id, etat, pretLe, titre = `Article ${id}`) => ({ id, etat, pretLe, titre, photo: `p${id}.jpg` });
ok(essai(() => contenu([S("1", "lecture", null)])) === null, "aucune fiche prête → aucun bandeau");
const un = essai(() => contenu([S("1", "prete", 10, "Nike Hoodie Kaki S"), S("2", "lecture", null)], "fr"));
ok(un?.mode === "un" && un.titre === "Description prête" && un.sousTitre === "Nike Hoodie Kaki S" && un.action === "Publier" && un.id === "1",
  "une fiche prête → « Description prête · Publier » (avec son titre)", JSON.stringify(un));
const groupe = essai(() => contenu([S("1", "prete", 10), S("2", "prete", 30), S("3", "prete", 20), S("4", "prete", 5), S("5", "introuvable", null)], "fr"));
ok(groupe?.mode === "groupe" && groupe.n === 4 && groupe.titre === "4 articles prêts" && groupe.action === "Voir" && groupe.vignettes.join(",") === "p2.jpg,p3.jpg,p1.jpg",
  "plusieurs prêtes → UN bandeau « N articles prêts · Voir », 3 vignettes, les plus récentes d'abord", JSON.stringify(groupe));
const permis = fn("bandeauPermis");
ok(essai(() => permis({})) === true && essai(() => permis({ ecranPublication: true })) === false && essai(() => permis({ modaleOuverte: true })) === false,
  "jamais par-dessus un stepper, un écran d'attente ou une modale");
ok(D?.BANDEAU_MS >= 3_000 && D?.BANDEAU_MS <= 8_000, "le bandeau part seul après quelques secondes", String(D?.BANDEAU_MS));

console.log("\n3. Le suivi (magasin) : une demande d'ouverture ne naît que d'un toucher, et ne se prend qu'une fois");
if (D) {
  D.viderSuivis();
  D.suivre({ id: 42, title: "Nike Hoodie Kaki S", photos: [] }, { photo: "p.jpg", maintenant: 1000 });
  const s1 = D.lireSuivis();
  ok(s1.suivis.length === 1 && s1.suivis[0].etat === "lecture" && s1.suivis[0].id === "42" && s1.annonce === 0 && s1.demande === null,
    "fermé pendant la lecture → suivie, « Lecture… », aucune demande d'ouverture");
  D.marquer(42, "prete", { item: { id: 42, description: "Hoodie kaki" }, maintenant: 2000 });
  const s2 = D.lireSuivis();
  ok(s2.suivis[0].etat === "prete" && s2.annonce === 1 && s2.demande === null && s2.suivis[0].item.description === "Hoodie kaki",
    "description arrivée → « prête », le bandeau est annoncé, MAIS aucune demande d'ouverture n'est posée");
  D.marquer(42, "prete");
  ok(D.lireSuivis().annonce === 1, "déjà prête : pas de second bandeau");
  ok(D.prendreDemande() === null, "sans toucher, le Stock ne trouve rien à ouvrir");
  D.demanderOuverture({ type: "un", id: "42" });
  ok(JSON.stringify(D.prendreDemande()) === JSON.stringify({ type: "un", id: "42" }) && D.prendreDemande() === null, "un toucher = une demande, prise une seule fois");
  D.signalerEcranPublication(true);
  ok(D.lireSuivis().ecranPublication === true, "un écran de publication ouvert est connu du bandeau");
  D.oublier(42);
  ok(D.lireSuivis().suivis.length === 0, "publication ouverte (ou « Publier » de nouveau) → plus suivie");
  D.viderSuivis();
}

console.log("\n4. Le câblage : SEUL un toucher ouvre une publication hors de l'écran d'attente");
const sv = lire("src/publication/SuiviDescriptions.jsx");
const st = lire("src/tabs/StockTab.jsx");
const app = lire("src/App.jsx");
const ecran = lire("src/publication/AttenteLectureOrigine.jsx");
ok(!/ouvrirStepper|setPublishItem|setAttenteStepper|onPret|window\.open/.test(sv), "le suivi n'ouvre RIEN lui-même (ni stepper, ni écran, ni fenêtre)");
const iToucher = sv.indexOf("const toucher = () => {");
ok(iToucher > 0 && (sv.match(/demanderOuverture\(/g) ?? []).length === 1 && sv.indexOf("demanderOuverture(") > iToucher && (sv.match(/onOuvrirStock\?\.\(\)/g) ?? []).length === 1 && sv.indexOf("onOuvrirStock?.()") > iToucher,
  "le bandeau : une demande et le passage au Stock, seulement dans « toucher »");
ok(/onClick=\{toucher\}/.test(sv) && /onClick=\{\(e\) => \{ e\.stopPropagation\(\); toucher\(\); \}\}/.test(sv), "« toucher » n'est appelé que par un clic (bandeau ou son bouton)");
const appelsDemande = ["src/App.jsx", "src/tabs/StockTab.jsx", "src/publication/AttenteLectureOrigine.jsx"].filter((p) => /demanderOuverture\(/.test(lire(p)));
ok(appelsDemande.length === 0, "aucun autre fichier ne pose de demande d'ouverture", appelsDemande.join(","));
ok(!/ouvrirStepperRef|setPublicationGardee|occupeRepriseRef/.test(st), "Stock : plus aucune reprise qui ouvre le stepper toute seule (le chemin du 14/11 est retiré)");
const usages = (re) => [...st.matchAll(re)].map((m) => m.index);
const ouvrirAppels = usages(/ouvrirDepuisSuivi\(item\)/g);
const contextes = ouvrirAppels.map((i) => st.slice(Math.max(0, i - 160), i));
ok(ouvrirAppels.length === 3
  && contextes.filter((c) => /onTap: \(\) => $/.test(c)).length === 1
  && contextes.filter((c) => /onOuvrir=\{suivi\?\.etat === 'prete' \? \(\) => $/.test(c)).length === 1
  && contextes.filter((c) => /if \(item\) $/.test(c)).length === 1,
  "Stock : la publication d'une fiche suivie s'ouvre au toucher de la carte, de son bouton, ou d'une demande du bandeau", String(ouvrirAppels.length));
const iEffet = st.indexOf("const dem = prendreDemande();");
ok(iEffet > 0 && (st.match(/prendreDemande\(\)/g) ?? []).length === 1 && /if \(!suiviDescriptions\.demande\) return;/.test(st), "Stock : n'agit que sur une demande posée par un toucher, prise une fois");
ok(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); ecrireDepuisSuivi\(item\); \}\}/.test(st) && (st.match(/ecrireDepuisSuivi\(item\)/g) ?? []).length === 1,
  "Stock : « Écrire la description » ne s'ouvre qu'au toucher");

console.log("\n5. Les garde-fous");
const corpsOuvrir = st.slice(st.indexOf("const ouvrirDepuisSuivi = async (item) => {"), st.indexOf("const ecrireDepuisSuivi = async (item) => {"));
ok(/select\('description'\)/.test(corpsOuvrir) && /if \(data && texteSuffisant\(data\.description\)\) description = data\.description;/.test(corpsOuvrir)
  && /if \(description\) \{ ouvrirStepper\(\{ \.\.\.item, description \}\); return; \}\n    publierAvecDetail\(item\);/.test(corpsOuvrir),
  "jamais de publication sans description : relue au toucher ; absente → le chemin normal (écran d'attente)");
ok(/<CarteArticle key=\{item\.id\}[\s\S]{0,700}onOuvrir=\{suivi\?\.etat === 'prete' \? \(\) => ouvrirDepuisSuivi\(item\) : d\.openEdit\}/.test(st), "toucher la carte « Prêt à publier » ouvre la publication (sinon la fiche, comme avant)");
ok(/lang === 'fr' \? 'Écrire la description' : 'Write the description'/.test(st) && /background: SK\.ambreFond, border: `1px solid \$\{SK\.ambreBord\}`, color: SK\.ambreEncre/.test(st),
  "carte « Description introuvable » : le bouton ambre « Écrire la description »");
ok(/if \(filtrePrets\) return \(items \|\| \[\]\)\.filter\(\(i\) => i\.statut === 'stock' && suiviParId\.get\(String\(i\.id\)\)\?\.etat === 'prete'\);/.test(st) && /data-filtre-prets="1" onClick=\{\(\)=>setFiltrePrets\(false\)\}/.test(st),
  "« Voir » : le Stock filtré sur les fiches prêtes, un toucher retire le filtre");
ok(/useEffect\(\(\) => \{ signalerEcranPublication\(Boolean\(publishItem \|\| attenteStepper\)\); \}, \[publishItem, attenteStepper\]\);/.test(st), "le bandeau attend qu'un écran de publication se ferme");
ok(/\{user\?\.id&&<SuiviDescriptions supabase=\{supabase\} userId=\{user\.id\} lang=\{lang\} onOuvrirStock=\{\(\)=>\{setTab\(1\);/.test(app), "le suivi est monté par App (il survit au changement d'onglet)");
ok(/const \[mode, setMode\] = useState\(\(\) => \(modeInitial === "ecrire" \? "ecrire" : issuesSansLecteur\(lecteurInitial\)\.length \? "choix" : "attente"\)\);/.test(ecran) && /modeInitial = null,/.test(ecran),
  "l'écran d'attente : sans modeInitial, exactement l'écran d'avant");
ok(/if \(!a\) \{ await pret\(\); return true; \}/.test(ecran) && /onPret\?\.\(relu, \{ note: derniereNote\.current \}\);/.test(ecran), "resté sur l'écran d'attente : la publication s'ouvre dès que c'est lu (inchangé)");

console.log(`\n${verts}/${verts + rouges} vérifications`);
if (rouges) { console.log(`ÉCHEC : ${rouges}`); process.exit(1); }
