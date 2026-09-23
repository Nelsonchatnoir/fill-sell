// ── AUTOTEST : QUELLES ANNONCES LE RELEVÉ RECAPTURE (2026-09-21) ────────────
// Le cas de Louis THONET : annonce capturée une fois le 19/09, modifiée sur
// Beebs, relevée à nouveau le 21/09 — et la fiche est née avec le texte du
// 19/09. La cause tenait à une ligne : `capture_le=not.is.null` servait de
// drapeau « déjà fait ».
//
// Ce que ce fichier VERROUILLE, et ce ne sont pas des détails de confort :
//   1. le BUDGET ne bouge pas (30 fiches par run) — c'est la garde anti-robot ;
//   2. une annonce MODIFIÉE passe avant tout le reste ;
//   3. les PÉRIMÉES ont un CONTINGENT — ni affamées par le rattrapage du parc,
//      ni assez nombreuses pour alourdir chaque run indéfiniment ;
//   4. une annonce fraîche n'est PAS rouverte (sinon on multiplierait la charge) ;
//   5. le cas de Louis, rejoué sur ses chiffres réels (47 Beebs, toutes périmées).
//
// Il n'analyse pas le code : il CHARGE background.js dans un vm et appelle la
// vraie fonction (même patron que sync-veille-selftest.mjs).
//
//   node scripts/capture-fraicheur-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");

let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ""}`);
};

// ── Bac à sable minimal : la fonction testée est pure, background.js a juste
//    besoin d'un `chrome` et d'un `fetch` pour se charger sans exploser.
function charger() {
  const rien = { addListener: () => {} };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
                 lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire(), session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
              remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}

const ctx = charger();
// ⚠️ Les `function` déclarées au premier niveau deviennent des propriétés du
//    global du vm — pas les `const`. Les trois bornes sont donc relues dans la
//    SOURCE, ce qui vérifie exactement la même chose : la valeur écrite dans
//    le fichier qui part dans le paquet.
const { choisirCapturesARefaire } = ctx;
const SOURCE = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
const borne = (nom) => Number(SOURCE.match(new RegExp(`^const ${nom} = (\\d+);`, "m"))?.[1]);
const CAPTURE_MAX_PAR_RUN = borne("CAPTURE_MAX_PAR_RUN");
const CAPTURE_FRAICHEUR_H = borne("CAPTURE_FRAICHEUR_H");
const CAPTURE_PERIMEES_PAR_RUN = borne("CAPTURE_PERIMEES_PAR_RUN");
const MAINTENANT = Date.parse("2026-09-21T17:00:00Z");
const ilYaH = (h) => new Date(MAINTENANT - h * 3_600_000).toISOString();
const annonce = (id, titre = `Article ${id}`, prix = 10) => ({ listing_id: String(id), url: `https://x/${id}`, titre, prix });
const connue = (id, ageH, titre = `Article ${id}`, prix = 10) => ({
  listing_id: String(id), capture_le: ilYaH(ageH), ligne: { titre, prix },
});

console.log("\n── QUELLES ANNONCES LE RELEVÉ RECAPTURE ───────────────────────");

console.log("\n1. LE BUDGET NE BOUGE PAS — la garde anti-robot");
{
  ok("CAPTURE_MAX_PAR_RUN vaut toujours 30", CAPTURE_MAX_PAR_RUN === 30, String(CAPTURE_MAX_PAR_RUN));
  const annonces = Array.from({ length: 500 }, (_, i) => annonce(i));
  const r = choisirCapturesARefaire(annonces, [], MAINTENANT);
  ok("500 annonces jamais capturées → 30 ouvertures, pas une de plus",
    r.pris.length === 30, `${r.pris.length}`);
  const mixte = choisirCapturesARefaire(
    annonces,
    Array.from({ length: 500 }, (_, i) => connue(i, 200, "Autre titre")), // toutes changées ET périmées
    MAINTENANT,
  );
  ok("500 annonces modifiées → 30 ouvertures, pas une de plus",
    mixte.pris.length === 30, `${mixte.pris.length}`);
}

console.log("\n2. UNE MODIFICATION CONNUE PASSE AVANT TOUT");
{
  const annonces = [annonce(1, "Titre CHANGÉ"), ...Array.from({ length: 40 }, (_, i) => annonce(100 + i))];
  const r = choisirCapturesARefaire(annonces, [connue(1, 1)], MAINTENANT);
  ok("l'annonce dont le titre a bougé est prise, malgré 40 jamais capturées devant",
    r.pris.some((a) => a.listing_id === "1"), r.pris.slice(0, 3).map((a) => a.listing_id).join(","));
  ok("et elle est PREMIÈRE", r.pris[0].listing_id === "1", r.pris[0].listing_id);
  const rPrix = choisirCapturesARefaire([annonce(1, "Article 1", 25)], [connue(1, 1, "Article 1", 10)], MAINTENANT);
  ok("un PRIX qui bouge suffit aussi", rPrix.pris.length === 1 && rPrix.changees === 1);
}

console.log("\n3. UNE ANNONCE FRAÎCHE N'EST PAS ROUVERTE");
{
  const annonces = Array.from({ length: 50 }, (_, i) => annonce(i));
  const connues = annonces.map((a) => connue(a.listing_id, 1)); // capturées il y a 1 h
  const r = choisirCapturesARefaire(annonces, connues, MAINTENANT);
  ok("50 annonces capturées il y a 1 h → AUCUNE ouverture", r.pris.length === 0, `${r.pris.length}`);
  ok("le seuil de fraîcheur est bien de 24 h", CAPTURE_FRAICHEUR_H === 24, String(CAPTURE_FRAICHEUR_H));
  const juste = choisirCapturesARefaire([annonce(1)], [connue(1, CAPTURE_FRAICHEUR_H + 0.1)], MAINTENANT);
  ok("juste au-delà du seuil, elle repasse", juste.pris.length === 1);
}

console.log("\n4. LES PÉRIMÉES ONT UN CONTINGENT — PLANCHER ET PLAFOND");
{
  // Le cas des gros comptes : 400 jamais capturées (le rattrapage du parc) et
  // 50 périmées. Sans plancher, les périmées n'auraient JAMAIS de tour.
  const annonces = [
    ...Array.from({ length: 400 }, (_, i) => annonce(i)),
    ...Array.from({ length: 50 }, (_, i) => annonce(1000 + i)),
  ];
  const connues = Array.from({ length: 50 }, (_, i) => connue(1000 + i, 100 + i));
  const r = choisirCapturesARefaire(annonces, connues, MAINTENANT);
  const perimeesPrises = r.pris.filter((a) => Number(a.listing_id) >= 1000).length;
  ok(`au moins ${CAPTURE_PERIMEES_PAR_RUN} slots réservés aux périmées`,
    perimeesPrises >= CAPTURE_PERIMEES_PAR_RUN, `${perimeesPrises} prise(s)`);
  ok("le total reste au budget", r.pris.length === CAPTURE_MAX_PAR_RUN, String(r.pris.length));
  ok(`jamais PLUS de ${CAPTURE_PERIMEES_PAR_RUN} périmées par run (la charge permanente est bornée)`,
    perimeesPrises === CAPTURE_PERIMEES_PAR_RUN, String(perimeesPrises));
  ok("la PLUS ANCIENNE d'abord (aucune ne reste au fond de la file)",
    r.pris.filter((a) => Number(a.listing_id) >= 1000)[0].listing_id === "1049");
  ok("le reste est annoncé pour le run suivant", r.restantes === 450 - 30, String(r.restantes));
}

console.log("\n5. LE CAS DE LOUIS, SUR SES CHIFFRES RÉELS");
{
  // 47 annonces Beebs, toutes capturées le 19/09, aucune jamais capturée.
  // La sienne (32750579) a été capturée le 19/09 à 13:28, soit ~52 h avant.
  const annonces = [annonce("32750579", "Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices"),
                    ...Array.from({ length: 46 }, (_, i) => annonce(200 + i))];
  const connues = [connue("32750579", 52, "Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices"),
                   ...Array.from({ length: 46 }, (_, i) => connue(200 + i, 50))];
  const r = choisirCapturesARefaire(annonces, connues, MAINTENANT);
  ok("son annonce Beebs est recapturée dès le prochain relevé",
    r.pris.some((a) => a.listing_id === "32750579"));
  ok("elle est même en tête : c'est la plus ancienne",
    r.pris[0].listing_id === "32750579", r.pris[0].listing_id);
  ok("il n'avait touché ni au titre ni au prix — elle passe par la file « périmées »",
    r.changees === 0 && r.perimees === 47, `changees=${r.changees} perimees=${r.perimees}`);
  // Le contingent se LIT dans background.js (2026-09-23 : DIX → VINGT, une
  // capture Beebs de Louis du 19/09 encore servie le 23/09). Le test tient au
  // chiffre, pas à sa valeur : plancher 10, plafond 30 (l'enveloppe mesurée le
  // 21/09), et toute la file passe en ceil(47 / contingent) relevés.
  ok("le contingent reste dans l'enveloppe mesurée : 10 ≤ contingent ≤ 30 (plafond de run)",
    CAPTURE_PERIMEES_PAR_RUN >= 10 && CAPTURE_PERIMEES_PAR_RUN <= 30, String(CAPTURE_PERIMEES_PAR_RUN));
  ok(`${CAPTURE_PERIMEES_PAR_RUN} fiches ce run, les ${47 - CAPTURE_PERIMEES_PAR_RUN} autres aux suivants — le contingent des périmées`,
    r.pris.length === CAPTURE_PERIMEES_PAR_RUN && r.restantes === 47 - CAPTURE_PERIMEES_PAR_RUN,
    JSON.stringify({ pris: r.pris.length, restantes: r.restantes }));
  ok(`son parc Beebs est entièrement rafraîchi en ${Math.ceil(47 / CAPTURE_PERIMEES_PAR_RUN)} relevés (3 à vingt par run, c'était 5 à dix)`,
    Math.ceil(47 / CAPTURE_PERIMEES_PAR_RUN) <= 5);
}

console.log("\n6. UNE CAPTURE D'AVANT CE LOT (sans ligne mémorisée) N'EST PAS PERDUE");
{
  const r = choisirCapturesARefaire([annonce(1)], [{ listing_id: "1", capture_le: ilYaH(50), ligne: null }], MAINTENANT);
  ok("elle tombe en « périmée » et repasse, au lieu d'être ignorée à vie",
    r.pris.length === 1 && r.perimees === 1, JSON.stringify({ pris: r.pris.length, perimees: r.perimees }));
}

console.log(echecs === 0
  ? "\n✅ selftest fraîcheur des captures : tout passe\n"
  : `\n❌ ${echecs} échec(s)\n`);
process.exit(echecs === 0 ? 0 : 1);
