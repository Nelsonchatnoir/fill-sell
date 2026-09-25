// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LA DICTÉE DU STEPPER » (2026-09-25, Romain sur Chrome/Mac)
//   node scripts/dictee-selftest.mjs
//
// Prouve, sans micro ni réseau (MediaRecorder, getUserMedia et la
// transcription sont simulés), les promesses de src/utils/dictee.js :
//   1. le texte dicté ARRIVE dans le champ, APRÈS ce qui est déjà écrit ;
//   2. une dictée vide, refusée ou ratée ne touche JAMAIS au champ, et se DIT ;
//   3. pas de MediaRecorder/getUserMedia → pas de micro affiché ;
//   4. jamais de format explicite dans une WebView iOS ; webm demandé à
//      Firefox (son ogg serait refusé par voice-transcribe) ;
//   5. l'écran ne dépend plus de la reconnaissance du navigateur.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── Un navigateur simulé ────────────────────────────────────────────────────
let refusMicro = null;           // une erreur à lever sur getUserMedia
let typesSupportes = ["audio/webm;codecs=opus", "audio/webm"];
let dernierFormatDemande = "non appelé";
class FauxEnregistreur {
  constructor(flux, opts) {
    dernierFormatDemande = opts?.mimeType ?? null;
    this.mimeType = opts?.mimeType ?? "audio/mp4";
    this.state = "inactive";
  }
  static isTypeSupported(t) { return typesSupportes.includes(t); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    setTimeout(() => { this.ondataavailable?.({ data: { size: 4096 } }); this.onstop?.(); }, 5);
  }
}
globalThis.window = { MediaRecorder: FauxEnregistreur };
globalThis.Blob = class { constructor(parts, o) { this.size = parts.reduce((s, p) => s + (p.size ?? 0), 0); this.type = o?.type; } };
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140", mediaDevices: { getUserMedia: async () => { if (refusMicro) throw refusMicro; return { getTracks: () => [{ stop() {} }] }; } } },
  configurable: true, writable: true,
});

const D = await import(pathToFileURL(join(ROOT, "src/utils/dictee.js")).href);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function dicter({ transcrire, dureeMs = 900, isNative = false, lang = "fr" }) {
  let champ = "jamais porté";
  const etats = []; let message = "(aucun)";
  const ctrl = await D.demarrerDictee({
    lang, isNative, transcrire,
    onEtat: (e) => etats.push(e),
    onMessage: (m) => { message = m; },
    onTexte: (t) => { champ = D.ajouterDictee(champ, t); },
  });
  if (ctrl) { await attendre(dureeMs); ctrl.arreter(); await attendre(40); }
  return { champ, etats, message, ctrl };
}

console.log("\n[1] Le texte dicté arrive, APRÈS ce qui est écrit");
{
  const r = await dicter({ transcrire: async () => ({ texte: "  offert, jamais servi " }) });
  ok("« jamais porté » + dictée → « jamais porté offert, jamais servi »", r.champ === "jamais porté offert, jamais servi", JSON.stringify(r.champ));
  ok("états : écoute → transcription → repos", JSON.stringify(r.etats) === JSON.stringify(["ecoute", "transcription", "repos"]), JSON.stringify(r.etats));
  ok("aucun message d'erreur après un succès", r.message === null, String(r.message));
  ok("ajouterDictee('', x) = x", D.ajouterDictee("", "cadeau") === "cadeau");
  ok("ajouterDictee('a  ', 'b') = 'a b'", D.ajouterDictee("a  ", "b") === "a b");
  ok("ajouterDictee('a', '   ') = 'a' (une dictée vide n'efface rien)", D.ajouterDictee("a", "   ") === "a");
}

console.log("\n[2] Vide, refusée ou ratée : le champ ne bouge pas, et on le DIT");
{
  const vide = await dicter({ transcrire: async () => ({ texte: "" }) });
  ok("transcription vide → champ intact", vide.champ === "jamais porté", vide.champ);
  ok("transcription vide → « rien entendu » + le geste Mac", /rien entendu/.test(vide.message) && /Réglages Système/.test(vide.message), vide.message);
  const panne = await dicter({ transcrire: async () => { throw new Error("réseau coupé"); } });
  ok("serveur injoignable → champ intact", panne.champ === "jamais porté", panne.champ);
  ok("serveur injoignable → message qui rassure sur le texte", /n'a pas été touché/.test(panne.message), panne.message);
  const quota = await dicter({ transcrire: async () => ({ erreur: "Tu as atteint ta limite de dictées pour aujourd’hui — tu peux écrire ta précision au clavier." }) });
  ok("quota atteint → champ intact + message du serveur", quota.champ === "jamais porté" && /limite de dictées/.test(quota.message), quota.message);
  const court = await dicter({ transcrire: async () => ({ texte: "ne doit pas arriver" }), dureeMs: 50 });
  ok("enregistrement trop court → champ intact, pas d'envoi", court.champ === "jamais porté" && /trop court/.test(court.message), JSON.stringify(court));
  refusMicro = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  const refus = await dicter({ transcrire: async () => ({ texte: "x" }) });
  ok("micro refusé → pas de contrôleur, champ intact", refus.ctrl === null && refus.champ === "jamais porté");
  ok("micro refusé → le geste pour l'autoriser", /bloqué pour fillsell\.app/.test(refus.message), refus.message);
  refusMicro = Object.assign(new Error("none"), { name: "NotFoundError" });
  const absent = await dicter({ transcrire: async () => ({ texte: "x" }) });
  ok("aucun micro → « Aucun micro trouvé »", /Aucun micro/.test(absent.message), absent.message);
  refusMicro = null;
}

console.log("\n[3] Là où l'on ne sait pas enregistrer, pas de micro");
{
  ok("MediaRecorder + getUserMedia → disponible", D.dicteeDisponible() === true);
  const mr = globalThis.window.MediaRecorder;
  globalThis.window.MediaRecorder = undefined;
  ok("sans MediaRecorder → indisponible (micro masqué)", D.dicteeDisponible() === false);
  const r = await dicter({ transcrire: async () => ({ texte: "x" }) });
  ok("sans MediaRecorder → un message clair, champ intact", /pas disponible/.test(r.message) && r.champ === "jamais porté", r.message);
  globalThis.window.MediaRecorder = mr;
  const gum = globalThis.navigator.mediaDevices;
  globalThis.navigator.mediaDevices = undefined;
  ok("sans getUserMedia → indisponible (micro masqué)", D.dicteeDisponible() === false);
  globalThis.navigator.mediaDevices = gum;
}

console.log("\n[4] Le format d'enregistrement");
{
  ok("WebView iOS/Android (natif) → jamais de format explicite", D.formatEnregistrement(true) === null);
  typesSupportes = ["audio/ogg;codecs=opus", "audio/webm"];
  ok("Firefox (ogg par défaut, webm possible) → webm demandé", D.formatEnregistrement(false) === "audio/webm");
  typesSupportes = ["audio/mp4"];
  ok("Safari → mp4", D.formatEnregistrement(false) === "audio/mp4");
  await dicter({ transcrire: async () => ({ texte: "x" }), isNative: true });
  ok("natif : MediaRecorder créé SANS mimeType", dernierFormatDemande === null, String(dernierFormatDemande));
  typesSupportes = ["audio/webm;codecs=opus", "audio/webm"];
}

console.log("\n[5] Les écrans ne dépendent plus de la reconnaissance du navigateur");
{
  const lps = fs.readFileSync(join(ROOT, "src/components/ListingPreviewScreen.jsx"), "utf8");
  const ecran = fs.readFileSync(join(ROOT, "src/publication/EcranOuPublier.jsx"), "utf8");
  ok("ListingPreviewScreen n'utilise plus webkitSpeechRecognition", !/webkitSpeechRecognition/.test(lps));
  ok("toggleMic passe par demarrerDictee et ajoute (ajouterDictee)", /demarrerDictee\(/.test(lps) && /ajouterDictee\(prev, texte\)/.test(lps));
  ok("micDisponible = dicteeDisponible()", /micDisponible: dicteeDisponible\(\)/.test(lps));
  ok("l'ancien écran masque le micro sans dictée possible", /\{micDisponible && \(/.test(lps));
  ok("le nouvel écran dit l'état et les échecs sous le champ", /m\.micMessage/.test(ecran) && /Je transcris/.test(ecran));
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : "\nTous les contrôles passent : la dictée arrive dans le champ, n'efface jamais rien, et ne se tait jamais sur un échec.");
process.exit(ko ? 1 : 0);
