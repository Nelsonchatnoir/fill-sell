// Selftest — (29/10, lot C partie 1) LA LECTURE QU'UNE PERSONNE ATTEND PASSE DEVANT TOUT LE RESTE (extension 0.6.159).
//
//     node scripts/lecture-prioritaire-selftest.mjs
//
// Les fonctions sont EXTRAITES de chrome-extension/background.js (le code servi), jouées dans un bac à sable avec des
// doublures (onglets, réseau, horloge). Ce qui est prouvé :
//   1. verrou libre : la lecture part tout de suite ;
//   2. verrou tenu (un dépôt), deux flux en file (poll, synchro) : la lecture passe AVANT eux, juste après le dépôt ;
//   3. entre deux tâches du poll (drain) : la lecture demandée pendant la tâche 1 passe avant la tâche 2 ;
//   4. sans le verrou : un onglet Vinted vivant lit la page pendant qu'un flux tient le verrou (jamais une navigation) ;
//      aucun onglet vivant → en tête de file ;
//   5. « Réessayer » : une demande posée après l'échec n'attend pas le repos de 5 à 60 min ;
//   6. l'état de la lecture écrit sur la demande : prise, échec et son motif, conclusion (ok, sans_texte, introuvable) ;
//   7. le signal de 30 s : rien à lire → une seule ligne lue ; une demande → lue en priorité ; pause anti-robot → dite.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

function extraire(nom) {
  const m = new RegExp(`\\n((?:async )?function ${nom}\\()`).exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const debut = m.index + 1;
  const fin = BG.indexOf("\n}\n", debut);
  return BG.slice(debut, fin + 2);
}
function constante(nom) {
  const m = new RegExp(`\\nconst ${nom} = [^\\n]*\\n`).exec(BG);
  if (!m) throw new Error(`constante introuvable : ${nom}`);
  return m[0];
}
function bac(noms, doublures = {}, prelude = "") {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, Promise, RegExp, URL, setTimeout, clearTimeout, ...doublures };
  vm.createContext(ctx);
  return vm.runInContext(`${prelude}\n${noms.map(extraire).join("\n")}\n;({ ${noms.join(", ")} })`, ctx);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Le verrou réel (withJobFlowLock) et la voie prioritaire ─────────────────────────────────────────────────────
const VERROU = ["withJobFlowLock", "drainerLecturesPrioritaires", "withJobFlowLockPrioritaire"];
const PRELUDE_VERROU = `let jobFlowBusyLabel = null; let jobFlowWaiters = 0; let jobFlowTail = Promise.resolve(); let travailEnCours = null;\n${constante("lecturesPrioritaires")}let drainPrioritaireEnCours = false;`;
const doublesVerrou = { noterAttenteVerrou: () => {}, demarrerBattementPresence: () => () => {} };

console.log("1. Verrou libre : la lecture part tout de suite");
{
  const v = bac(VERROU, doublesVerrou, PRELUDE_VERROU);
  const ordre = [];
  await v.withJobFlowLockPrioritaire("lecture", async () => { ordre.push("lecture"); });
  ok(ordre.join() === "lecture", "aucun flux : lue sans attendre");
}

console.log("2. Verrou tenu par un dépôt, poll et synchro en file : la lecture passe devant eux");
{
  const v = bac(VERROU, doublesVerrou, PRELUDE_VERROU);
  const ordre = [];
  const depot = v.withJobFlowLock("depot-leboncoin", async () => { ordre.push("depot:debut"); await pause(40); ordre.push("depot:fin"); });
  await pause(5);
  const poll = v.withJobFlowLock("poll", async () => { ordre.push("poll"); });
  const sync = v.withJobFlowLock("sync-dressing", async () => { ordre.push("sync"); });
  const lecture = v.withJobFlowLockPrioritaire("lecture", async () => { ordre.push("lecture"); return "lue"; });
  const [, , , rl] = await Promise.all([depot, poll, sync, lecture]);
  ok(ordre.join(",") === "depot:debut,depot:fin,lecture,poll,sync", "ordre : le dépôt finit, puis la LECTURE, puis le poll et la synchro mis en file avant elle", ordre.join(","));
  ok(rl === "lue", "la lecture rend sa valeur à qui l'attend");
}

console.log("3. Entre deux tâches du poll : la lecture demandée pendant la tâche 1 passe avant la tâche 2");
{
  const v = bac(VERROU, doublesVerrou, PRELUDE_VERROU);
  const ordre = [];
  const poll = v.withJobFlowLock("poll", async () => {
    for (const t of ["tache1", "tache2", "tache3"]) {
      await v.drainerLecturesPrioritaires("entre_taches");
      ordre.push(`${t}:debut`); await pause(15); ordre.push(`${t}:fin`);
    }
  });
  await pause(5);
  const lecture = v.withJobFlowLockPrioritaire("lecture", async () => { ordre.push("lecture"); });
  await Promise.all([poll, lecture]);
  ok(ordre.join(",") === "tache1:debut,tache1:fin,lecture,tache2:debut,tache2:fin,tache3:debut,tache3:fin", "la lecture s'insère entre la tâche 1 et la tâche 2 (au pire, la fin de la tâche en cours)", ordre.join(","));
  // Le filet : la lecture déjà faite par le drain ne se refait pas à son propre tour.
  ok(ordre.filter((x) => x === "lecture").length === 1, "jamais lue deux fois (le tour du filet trouve la file vide)");
}

console.log("4. Sans le verrou : un onglet Vinted vivant lit la page pendant qu'un dépôt tient le verrou");
{
  const PAGE = `<script type="application/ld+json">{"@type":"Product","name":"Pull","description":"Texte du vendeur","url":"https://www.vinted.fr/items/123-pull","offers":{"url":"https://www.vinted.fr/items/123-pull"}}</script>`;
  const navigations = [];
  let injections = 0;
  const onglets = { 7: { id: 7, url: "https://www.vinted.fr/items/999", status: "complete", discarded: false, frozen: false } };
  const chrome = {
    storage: { session: { get: async () => ({ fillsell_work_tab_vinted: 7 }) } },
    tabs: { get: async (id) => onglets[id] ?? null, query: async () => Object.values(onglets), update: async (...a) => { navigations.push(a); } },
    scripting: { executeScript: async () => { injections++; return [{ result: { ok: true, status: 200, finalUrl: "https://www.vinted.fr/items/123", html: PAGE } }]; } },
  };
  const VO = { origineVinted: () => "https://www.vinted.fr" };
  const sousVerrou = [];
  const noms = [...VERROU, "ongletVintedVivant", "lirePagePubliqueVintedSansVerrou", "lirePagePubliqueVintedPrioritaire", "lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"];
  const v = bac(noms, { ...doublesVerrou, chrome, VO, workTabKey: (p) => `fillsell_work_tab_${p}`,
    lirePagePubliqueVintedSousVerrou: async (id) => { sousVerrou.push(id); return { ok: true, description: "par le verrou" }; } }, PRELUDE_VERROU);
  let depotFini = false;
  const depot = v.withJobFlowLock("depot-vinted", async () => { await pause(60); depotFini = true; });
  await pause(5);
  const r = await v.lirePagePubliqueVintedPrioritaire("123", "page-publique-vinted");
  ok(r?.ok === true && r.description === "Texte du vendeur" && r.sans_verrou === true && depotFini === false,
    "lue PENDANT le dépôt, par un GET dans l'onglet vivant (sans_verrou)", JSON.stringify({ r, depotFini }));
  ok(navigations.length === 0 && sousVerrou.length === 0 && injections === 1, "aucune navigation, aucun onglet créé, une seule injection");
  // Aucun onglet vivant (déchargé) : en tête de file, lue juste après le dépôt.
  onglets[7].discarded = true;
  const depot2 = v.withJobFlowLock("depot-vinted", async () => { await pause(30); });
  await pause(5);
  const r2 = await v.lirePagePubliqueVintedPrioritaire("123", "page-publique-vinted");
  ok(r2?.description === "par le verrou" && sousVerrou.length === 1, "onglet déchargé : rien n'est réveillé hors verrou — lue en tête de file, après le dépôt");
  await Promise.all([depot, depot2]);
  // Un onglet qui navigue (injection en échec) : null, jamais une erreur.
  onglets[7].discarded = false;
  chrome.scripting.executeScript = async () => { throw new Error("Frame with ID 0 was removed"); };
  const r3 = await v.lirePagePubliqueVintedSansVerrou("123");
  ok(r3 === null, "onglet en pleine navigation : null (l'appelant passe en tête de file)");
}

// ── Les lectures demandées : repos, état écrit sur la demande, signal ─────────────────────────────────────────────
function monde({ liste = [], lu = () => ({ ok: true, description: "Texte du vendeur", http: 200 }), signal = 0, pauseLocale = false } = {}) {
  const appels = [];
  const lus = [];
  const doublures = {
    restRequest: async (path, token, init = {}) => {
      appels.push({ path, body: init.body ? JSON.parse(init.body) : null });
      if (path === "rpc/lecture_origine_signal") return [{ n: signal, plus_recente: null }];
      if (path === "rpc/lectures_origine_en_attente") return liste;
      return null;
    },
    lirePagePubliqueVintedSousVerrou: async (id) => { lus.push(`verrou:${id}`); return lu(id); },
    lirePagePubliqueVintedPrioritaire: async (id) => { lus.push(`prioritaire:${id}`); return { ...lu(id), sans_verrou: true }; },
    ecrireLecturePagePublique: async () => ["description"],
    tracerLectureFond: async (t, l, r, origine) => { appels.push({ path: "trace", origine }); },
    tracerLectureOrigineRatee: async () => {},
    poserPauseLectureFond: async () => {},
    lectureFondEnPause: async () => pauseLocale,
    getValidSession: async () => ({ access_token: "t" }),
    sleep: async () => {},
  };
  const prelude = `let derniereLectureOrigine = 0; let vintedPauseAntirobotServeur = false; let veilleLectureEnCours = false;\n${constante("echecsLectureOrigine")}${constante("lecturesDemandeesEnVol")}${constante("lecturesFondDuCycle")}${constante("pausesSignalees")}`;
  const f = bac(["lectureOrigineEnRepos", "noterEchecLectureOrigine", "ordreLecturesOrigine", "marquerLectureDemandee", "lireAnnoncesOrigineEnAttente", "veillerLecturesDemandees"], doublures, prelude);
  return { f, appels, lus };
}
const ilYa = (min) => new Date(Date.now() - min * 60_000).toISOString();

console.log("5. « Réessayer » : une demande posée APRÈS l'échec n'attend pas le repos");
{
  const { f } = monde();
  const t0 = Date.now();
  f.noterEchecLectureOrigine(42, t0);
  ok(f.lectureOrigineEnRepos(42, t0 + 60_000, t0 - 5 * 60_000) === true, "la même demande (posée avant l'échec) se repose 5 min");
  ok(f.lectureOrigineEnRepos(42, t0 + 60_000, t0 + 30_000) === false, "« Réessayer » 30 s après l'échec : relue tout de suite");
  ok(f.lectureOrigineEnRepos(42, t0 + 60_000) === true, "sans date de demande : le repos d'avant, inchangé");
}

console.log("6. L'état de la lecture est écrit sur la demande (l'écran le relit)");
{
  const m = monde({ liste: [{ inventaire_id: 7, plateforme: "vinted", vinted_item_id: "70", depuis: ilYa(0.2) }] });
  await m.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  const chemins = m.appels.map((a) => a.path);
  const prise = m.appels.findIndex((a) => a.path === "rpc/lecture_origine_essai" && a.body.p_etat === "prise");
  const conclue = m.appels.findIndex((a) => a.path === "rpc/lecture_origine_conclure" && a.body.p_resultat === "ok");
  ok(prise >= 0 && conclue > prise && chemins.includes("rpc/lecture_origine_faite"), "lue : « prise » d'abord, puis conclue « ok », puis close (faite — les anciennes bases)", chemins.join(","));
  const e = monde({ liste: [{ inventaire_id: 8, plateforme: "vinted", vinted_item_id: "80", depuis: ilYa(0.2) }], lu: () => ({ ok: false, motif: "page_sans_annonce" }) });
  await e.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  const echec = e.appels.find((a) => a.path === "rpc/lecture_origine_essai" && a.body.p_etat === "echec");
  ok(echec?.body?.p_motif === "page_sans_annonce" && !e.appels.some((a) => a.path === "rpc/lecture_origine_faite"), "ratée : l'échec et son motif sont écrits, la demande reste ouverte");
  const i = monde({ liste: [{ inventaire_id: 9, plateforme: "vinted", vinted_item_id: "90", depuis: ilYa(0.2) }], lu: () => ({ ok: false, motif: "introuvable", http: 404 }) });
  await i.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(i.appels.some((a) => a.path === "rpc/lecture_origine_conclure" && a.body.p_resultat === "introuvable"), "annonce supprimée : conclue « introuvable » (l'écran le dit, jamais un stepper muet)");
  const s = monde({ liste: [{ inventaire_id: 10, plateforme: "vinted", vinted_item_id: "100", depuis: ilYa(0.2) }], lu: () => ({ ok: true, description: null, http: 200 }) });
  await s.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(s.appels.some((a) => a.path === "rpc/lecture_origine_conclure" && a.body.p_resultat === "sans_texte"), "annonce sans description : conclue « sans_texte »");
  const a = monde({ liste: [{ inventaire_id: 11, plateforme: "vinted", vinted_item_id: "110", depuis: ilYa(0.2) }], lu: () => ({ ok: false, motif: "antirobot", http: 403 }) });
  await a.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(a.appels.some((x) => x.path === "rpc/lecture_origine_essai" && x.body.p_motif === "antirobot"), "anti-robot : dit sur la demande");
}

console.log("7. Le signal de 30 s");
{
  const vide = monde({ signal: 0 });
  await vide.f.veillerLecturesDemandees();
  ok(vide.appels.length === 1 && vide.appels[0].path === "rpc/lecture_origine_signal", "personne n'attend : UNE ligne lue, rien d'autre (aucune liste, aucune page)");
  const liste = [
    { inventaire_id: 1, plateforme: "vinted", vinted_item_id: "11", depuis: ilYa(40) },
    { inventaire_id: 2, plateforme: "vinted", vinted_item_id: "22", depuis: ilYa(0.3) },
  ];
  const un = monde({ signal: 1, liste });
  await un.f.veillerLecturesDemandees();
  ok(un.lus.join() === "prioritaire:22", "une personne attend : SA demande (moins de 15 min) est lue par la voie prioritaire ; la vieille attend le poll", un.lus.join());
  ok(un.appels.some((a) => a.path === "trace" && a.origine === "demandee_vite"), "la trace dit la voie (demandee_vite : sans le verrou)");
  const p = monde({ signal: 1, liste, pauseLocale: true });
  await p.f.veillerLecturesDemandees();
  await p.f.veillerLecturesDemandees();
  const dites = p.appels.filter((a) => a.path === "rpc/lecture_origine_essai" && a.body.p_motif === "antirobot_pause");
  ok(p.lus.length === 0 && dites.length === 1 && dites[0].body.p_fiche === 2, "lectures coupées (anti-robot) : rien n'est lu, l'écran l'apprend UNE fois", JSON.stringify(dites));
}

console.log("8. La page sans JSON-LD (essai réel du 29/10, annonce 9872357762) : les données de la page");
{
  const page = readFileSync(join(RACINE, "scripts/fixtures/vinted-page-sans-jsonld-9872357762.html"), "utf8");
  const f = bac(["lireFluxNextVinted", "analyserPagePubliqueVinted"], { estPageBotShield: () => false });
  const lu = f.analyserPagePubliqueVinted({ ok: true, status: 200, finalUrl: "https://www.vinted.fr/items/9872357762-casquette-volcom-beige-logo-diamant", html: page }, "9872357762");
  ok(lu.ok === true && lu.source === "flux_next" && /^Casquette Volcom de couleur beige/.test(lu.description) && lu.description.includes("\n\n#volcom"),
    "la description du vendeur, mot pour mot (retours à la ligne compris), lue dans le flux de la page", JSON.stringify(lu).slice(0, 200));
  ok(lu.marque === "Volcom" && lu.couleur === "Beige" && lu.catalog_id === 287 && lu.titre === "Casquette Volcom beige logo diamant", "marque, couleur, rayon et titre de CETTE annonce");
  ok(f.lireFluxNextVinted(page, "1111111111") === null || f.lireFluxNextVinted(page, "1111111111")?.description === "Description d'une AUTRE annonce",
    "le bloc d'une autre annonce n'est lu que pour SON numéro");
  ok(f.analyserPagePubliqueVinted({ ok: true, status: 200, finalUrl: "", html: page }, "2222222222").motif === "page_sans_annonce", "aucun bloc pour ce numéro : « page_sans_annonce », comme avant");
  ok(f.analyserPagePubliqueVinted({ ok: true, status: 200, finalUrl: "", html: "<html><title>x</title></html>" }, "9872357762").motif === "page_sans_annonce", "page sans flux : la règle d'avant, à l'identique");
}

console.log("9. Le code servi");
ok(/LECTURE_SIGNAL_ALARM, \{ periodInMinutes: 0\.5/.test(BG), "l'alarme du signal est de 30 s");
ok(/drainerLecturesPrioritaires\("entre_taches"\)/.test(BG), "la boucle des tâches du poll cède entre deux tâches");
ok(/await drainerLecturesPrioritaires\("tour"\);\n\s+return await fn\(\);/.test(BG), "chaque tour de verrou draine d'abord la file prioritaire");
ok(/lirePagePubliqueVintedPrioritaire\(id, "page-publique-vinted"\)/.test(BG), "la lecture demandée par la page (même ordinateur) passe par la voie prioritaire");

console.log(rouges ? `\n✗ lecture-prioritaire : ${rouges} rouge(s), ${verts} verts` : `\n✓ lecture-prioritaire : ${verts} contrôles verts, 0 rouges`);
process.exit(rouges ? 1 : 0);
