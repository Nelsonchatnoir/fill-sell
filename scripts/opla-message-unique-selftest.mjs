// ═══════════════════════════════════════════════════════════════════════════
// Selftest « OPLA : UN SEUL MESSAGE, UN SEUL BOUTON » (2026-09-23)
//   node scripts/opla-message-unique-selftest.mjs
//
// Le 23/09, quatre textes coexistaient en base pour la même cause (permission
// d'hôte Opla non accordée), dont deux interdits : une instruction de
// navigateur (« clique sur l'icône FillSell ») et une fausse promesse
// (« rien à faire de ton côté »). Ce test fige :
//   1. la source de vérité (_shared/textes-jobs.ts, autorisationOplaRequise)
//      et ses copies hors serveur (background.js, BoutonMeConnecter.jsx,
//      popup.js, reglages/textes.js) — identiques à l'octet sur la forme
//      « publication » ;
//   2. l'absence de mots interdits dans tout texte Opla montré à quelqu'un :
//      icône, menu, Chrome, navigateur, « rien à faire », opla.co ;
//   3. que pas-de-rouge et handler-watch n'ont plus de texte propre ;
//   4. que le bouton existe sur les trois points de contact (carte, stepper,
//      modale) et qu'aucun texte n'est plus posé sur la photo de la carte.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const check = (nom, ok, extra = "") => { if (ok) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom} ${extra}`); } };

// ── 1. La source de vérité et ses copies ──────────────────────────────────
const textes = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/textes-jobs.ts")).href);
const canon = textes.autorisationOplaRequise("publish");
console.log("\n1. Le message unique et ses copies");
check("la source de vérité existe (autorisationOplaRequise)", typeof canon === "string" && canon.length > 40);

const bg = lire("chrome-extension/background.js");
const blocBg = bg.slice(bg.indexOf("// ⟦opla-autorisation:début⟧"), bg.indexOf("// ⟦opla-autorisation:fin⟧"));
const messageAutorisationOpla = new Function(`${blocBg.replace(/^\/\/.*$/gm, "")}; return messageAutorisationOpla;`)();
for (const action of ["publish", "republish", "delete"]) {
  check(`background.js — forme « ${action} » identique à l'octet`, messageAutorisationOpla(action) === textes.autorisationOplaRequise(action));
}

// ── 1 bis. Le message « cookies opla.co trop volumineux » et sa copie (2026-09-24)
const canonCookies = textes.cookiesOplaTropVolumineux?.("publish");
check("la source de vérité existe (cookiesOplaTropVolumineux)", typeof canonCookies === "string" && canonCookies.length > 40);
const blocCookies = bg.slice(bg.indexOf("// ⟦opla-cookies:début⟧"), bg.indexOf("// ⟦opla-cookies:fin⟧"));
const messageCookiesOpla = new Function(`${blocCookies.replace(/^\/\/.*$/gm, "")}; return messageCookiesOpla;`)();
for (const action of ["publish", "republish", "delete"]) {
  check(`background.js — cookies, forme « ${action} » identique à l'octet`, messageCookiesOpla(action) === textes.cookiesOplaTropVolumineux(action));
}
check("le message cookies ne dit ni « relancer » ni « rien à faire de ton côté »", !/relancer|rien à faire de ton côté/i.test(canonCookies));

const app = lire("src/components/BoutonMeConnecter.jsx");
const blocApp = app.slice(app.indexOf("// ⟦opla-autorisation-app:début⟧"), app.indexOf("// ⟦opla-autorisation-app:fin⟧"));
const MESSAGE_AUTORISATION_OPLA = new Function(`${blocApp.replace(/^\/\/.*$/gm, "").replace("export const", "const")}; return MESSAGE_AUTORISATION_OPLA;`)();
check("BoutonMeConnecter.jsx — identique à l'octet (forme publication)", MESSAGE_AUTORISATION_OPLA === canon, `\n    app   : ${MESSAGE_AUTORISATION_OPLA}\n    canon : ${canon}`);

const popup = lire("chrome-extension/popup.js");
const debutCanon = canon.split(" : ")[0]; // « Opla attend ton autorisation … Appuie sur « Autoriser Opla » »
check("popup.js — commence par la même phrase", popup.includes(debutCanon), `attendu : ${debutCanon}`);
const reglages = lire("src/reglages/textes.js");
check("reglages/textes.js — commence par la même phrase", reglages.includes(debutCanon));

// ── 2. Aucun mot interdit dans les textes Opla montrés ────────────────────
console.log("\n2. Mots interdits (instruction de navigateur, fausse promesse)");
const INTERDITS = /ic[oô]ne FillSell|menu FillSell|dans Chrome|en haut à droite|rien à faire de ton côté|opla\.co/i;
const surveilles = [
  ["textes-jobs.ts (Opla)", [textes.autorisationOplaRequise("publish"), textes.connexionOplaRequise("publish")].join("\n")],
  ["background.js (message Opla)", messageAutorisationOpla("publish")],
  ["BoutonMeConnecter.jsx", MESSAGE_AUTORISATION_OPLA],
  ["OplaAutorisationModal.jsx (textes)", lire("src/components/OplaAutorisationModal.jsx").slice(0, lire("src/components/OplaAutorisationModal.jsx").indexOf("export default"))],
  ["popup.js (lignes Opla)", popup.split("\n").filter((l) => /autoris/i.test(l) && !l.trim().startsWith("//")).join("\n")],
  ["reglages/textes.js (Opla)", reglages.split("\n").filter((l) => /Opla/.test(l) && !l.trim().startsWith("//")).join("\n")],
  ["opla.js (OPLA_MSG_SESSION)", lire("chrome-extension/content-scripts/opla.js").match(/const OPLA_MSG_SESSION =[\s\S]*?;/)?.[0] ?? ""],
];
for (const [nom, texte] of surveilles) {
  const m = texte.match(INTERDITS);
  check(`${nom} — aucun mot interdit`, !m, m ? `→ « ${m[0]} »` : "");
}

// ── 3. Le serveur n'a plus de texte propre ────────────────────────────────
console.log("\n3. Le serveur parle d'une seule voix");
const pdr = lire("supabase/functions/_shared/pas-de-rouge.js");
check("pas-de-rouge importe autorisationOplaRequise, connexionOplaRequise et cookiesOplaTropVolumineux", /import \{ autorisationOplaRequise, connexionOplaRequise, cookiesOplaTropVolumineux \} from "\.\/textes-jobs\.ts"/.test(pdr));
check("pas-de-rouge — plus de texte Opla en dur", !/Opla ne nous laisse plus|Opla a besoin de ton autorisation/.test(pdr));
check("pas-de-rouge — la session fermée VUE PAR LA PAGE rend « connexion » ; un 401 de sonde ne classe RIEN (règle du 24/09 : ni « opla_acces », ni « connexion », ni retenue)",
  /sondeDit === false && httpOpla === HTTP_MUR_OBSERVE/.test(pdr) && /message: connexionOplaRequise\(action\)/.test(pdr) && !/http === 401 \|\| http === 403/.test(pdr) && !/sonde_401 → a_autoriser/.test(pdr));
const hw = lire("supabase/functions/handler-watch/index.ts");
check("handler-watch importe autorisationOplaRequise", /import \{ autorisationOplaRequise \} from "\.\.\/_shared\/textes-jobs\.ts"/.test(hw));
// Les autres « rien à faire de ton côté » de handler-watch (extension endormie
// qui se réveille) restent vrais : ici on ne juge que le texte Opla.
const hwCode = hw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
check("handler-watch — plus de texte Opla propre (« accès à opla.co a été refusé », OPLA_ACCES_MSG_*)", !/accès à opla\.co a été refusé|OPLA_ACCES_MSG_DEPOT|OPLA_ACCES_MSG_RETRAIT/.test(hwCode));
check("handler-watch — la reprise exige la permission prouvée (sonde)", /accesProuve\.get\(String\(j\.user_id\)\) !== true/.test(hw));

// ── 4. Le bouton, et plus rien sur la photo ───────────────────────────────
console.log("\n4. Le bouton sur les trois points de contact, la carte propre");
const stock = lire("src/tabs/StockTab.jsx");
check("carte : la bande .gmur porte BoutonMeConnecter SOUS la photo", /className="gmur"[\s\S]{0,300}<BoutonMeConnecter/.test(stock));
check("carte : plus de BoutonMeConnecter en position absolue sur la photo", !/position:"absolute",left:8,right:8,bottom:8,zIndex:2\}\}>\s*<BoutonMeConnecter/.test(stock));
check("carte : pastilles de statut et quantité sur fond OPAQUE", /\.gstatus\{[^}]*background:#FFFFFF/.test(stock) && /\.gqty\{[^}]*background:#FFFFFF/.test(stock) && /\.gstatus\.is-queued\{[^}]*background:#FFFFFF/.test(stock));
const modale = lire("src/components/OplaAutorisationModal.jsx");
check("modale : BoutonMeConnecter (Autoriser Opla) à la place de l'instruction", /<BoutonMeConnecter[^>]*motif=\{MOTIFS\.AUTORISER_OPLA\}/.test(modale));
const lps = lire("src/components/ListingPreviewScreen.jsx");
check("stepper : bloc « Autoriser Opla » avant la confirmation quand l'accès manque", /oplaAcces === false && selected\.has\("opla"\)/.test(lps) && /motif=\{MOTIFS\.AUTORISER_OPLA\}/.test(lps));
const bmc = app;
check("BoutonMeConnecter (web) : un vrai bouton qui demande à l'extension, plus de texte de consigne", /demanderAutorisationOplaSurLeWeb/.test(bmc) && !/oplaSurWeb\s*\?\s*<Etat/.test(bmc));
const auth = lire("chrome-extension/content-scripts/fillsell-auth.js");
check("pont fillsell-auth : la commande AUTORISER_OPLA est dans la liste fermée et répond", /"AUTORISER_OPLA",/.test(auth) && /__fillsellOplaOuverture/.test(auth));
check("background : AUTORISER_OPLA ouvre la page de l'extension (ouvrirPopupPourOpla)", /msg\?\.type === "AUTORISER_OPLA"[\s\S]{0,400}ouvrirPopupPourOpla\(\)/.test(bg));
check("background : au démarrage, l'accès accordé relance les jobs parqués", /oplaAccesAccorde\(\)\.then\(async \(ok\) => \{[\s\S]{0,400}rearmerJobsOplaEnAttente\(/.test(bg));

// ── 5. Deux murs, deux gestes — en exécutant classerEchec ─────────────────
// Permission Chrome manquante ≠ session Opla fermée. La sonde du service
// worker ne tranche NI l'une NI l'autre (Marine, 23/09 : sonde 401, relevé de
// 57 annonces dans l'onglet ; Nico, 24/09 : sonde 401, poste autorisé, relevé
// réussi la veille — quinze comptes mesurés) — seule la PAGE prouve la
// session fermée, seul le poste (chrome.permissions) prouve la permission.
console.log("\n5. Permission manquante et session fermée : deux messages, deux boutons");
const { classerEchec } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/pas-de-rouge.js")).href);
{
  const base = { platform: "opla", action: "publish", essais: 2, pf: {}, brut: "Could not establish connection. Receiving end does not exist." };
  // ⛔ RÈGLE DU 24/09 (Nico) : le 401 de la sonde du service worker ne prouve
  //    rien. Il ne vaut ni « Autoriser Opla », ni « Me connecter » : l'échec se
  //    classe sur son motif brut (ici un canal coupé → reprise), comme s'il n'y
  //    avait pas de sonde. La 0.6.65 n'écrit plus ce `false` ; les extensions
  //    d'avant l'écrivent encore, et le serveur DOIT l'ignorer.
  const sonde401 = classerEchec({ ...base, sessions: { opla: false, http: { opla: 401 } } });
  check("sonde 401 (service worker) → ne prouve RIEN : reprise sur le motif brut, jamais « Autoriser Opla » ni « Me connecter »",
    sonde401.verdict === "reprise" && sonde401.source !== "opla_acces" && !/Autoriser Opla|Me connecter/.test(sonde401.message), JSON.stringify(sonde401));
  const sonde401SansAcces = classerEchec({ ...base, sessions: { opla: false, http: { opla: 401 } }, oplaAccesDuPoste: false });
  check("sonde 401 + poste déclaré SANS accès : toujours rien sur la seule sonde (la permission manquante passe par son marqueur, règle 1)",
    sonde401SansAcces.source !== "opla_acces" && sonde401SansAcces.source !== "connexion", JSON.stringify(sonde401SansAcces));
  const murVu = classerEchec({ ...base, sessions: { opla: false, http: { opla: "login_redirect_observee" } } });
  check("page de connexion VUE par l'onglet → « Me connecter » (connexion), jamais « Autoriser Opla »",
    murVu.source === "connexion" && /^Connexion Opla requise/.test(murVu.message) && !/Autoriser Opla/.test(murVu.message), JSON.stringify(murVu));
  const page401 = classerEchec({ ...base, brut: "Connexion Opla requise : ta session Opla est fermée sur ton ordinateur.", sessions: null });
  check("« Connexion Opla requise » écrit par la page (401 dans l'onglet), sonde muette → connexion",
    page401.source === "connexion" && page401.message === textes.connexionOplaRequise("publish"), JSON.stringify(page401));
  const permission = classerEchec({ ...base, brut: "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension.", pf: { needs_user_source: "opla_acces" }, sessions: null });
  check("permission d'hôte refusée (marqueur opla_acces) → « Autoriser Opla », texte canonique",
    permission.source === "opla_acces" && permission.message === canon, JSON.stringify(permission));
  check("les deux textes ne se confondent pas : l'un nomme « Autoriser Opla », l'autre « Me connecter »",
    /Autoriser Opla/.test(canon) && !/Me connecter/.test(canon) && /Me connecter/.test(textes.connexionOplaRequise("publish")) && !/Autoriser Opla/.test(textes.connexionOplaRequise("publish")));
}
// handler-watch relance les DEUX murs : le marqueur pour la permission, l'ancre
// « Connexion Opla requise » pour la session, dès que la sonde revoit Opla.
check("handler-watch : l'ancre « Connexion Opla requise » entre dans MUR_CONNEXION (reprise après reconnexion)", /opla: \/\^Connexion Opla requise\/i,/.test(hw));

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
