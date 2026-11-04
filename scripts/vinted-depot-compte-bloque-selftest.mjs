// ═══════════════════════════════════════════════════════════════════════════
// Selftest « compte bloqué par Vinted » sur le DÉPÔT (04/11, lp.vtd89, job f2849ebb)
//   npm run selftest:vinted-depot-compte-bloque
//
// LE CAS : compte déjà banni par Vinted, aucune action de FillSell avant. Dès la
// toute première publication, /items/new renvoyait sur /main/banned ; vinted.js
// le rendait en « Page de dépôt Vinted non atteinte (pathname inattendu
// (/main/banned)) … nouvelle tentative » (refus passager) : quatre essais en
// 23 min (19:57, 20:00, 20:08, 20:19) avant que le serveur le nomme.
// CE QUE CE TEST PROUVE :
//   1. remplirFormulaireVinted RÉEL (extrait de vinted.js) sur /main/banned :
//      attente nommée « compte_vinted_bloque », aucune sonde, aucune reprise,
//      préfixe « COMPTE VINTED BLOQUÉ » ;
//   2. détection EXACTE : /main/bannedx, la connexion, le captcha DataDome et la
//      restriction de mise en vente ne sont jamais pris pour un bannissement ;
//   3. le serveur (essaiSurPageCompteBloque) arrête au PREMIER essai, y compris
//      pour les extensions ≤ 0.6.172 (le texte exact relevé chez lp.vtd89) ;
//   4. le message dit le compte bloqué PAR VINTED, jamais une panne de FillSell ;
//   5. le background passe l'attente nommée en needs_user sans ré-armement.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Fins de ligne ramenées à LF : la copie de travail Windows est en CRLF (core.autocrlf), l'index en LF.
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const SRC = lire("chrome-extension/content-scripts/vinted.js");
const V = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/vinted-compte-bloque.js")).href);

let ko = 0;
const ok = (cond, nom, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Le formulaire de dépôt, tel que Chrome le charge, sur une page donnée.
async function deposerSur(pathname, { botShield = false } = {}) {
  const sondes = [];
  // Coupée à la première accolade fermante en colonne 0 (même méthode que selftest:retraits-motifs-vrais) :
  // l'extracteur générique ne suit pas les expressions régulières de ce formulaire.
  const debut = SRC.indexOf("async function remplirFormulaireVinted(job) {");
  const fin = SRC.indexOf("\n}\n", debut);
  if (debut < 0 || fin < 0) throw new Error("remplirFormulaireVinted introuvable dans vinted.js");
  const corps = [SRC.slice(debut, fin + 2), "return remplirFormulaireVinted;"].join("\n");
  const fn = new Function(
    "location", "estPageBotShieldVinted", "DRY_RUN", "console", "VINTED_DOMAINE_PAGE", "navigateurCourtPage", "sel",
    "vintedUtilisateurCourant", "sleep", "messageConditionsVinted", "document", corps,
  )(
    { pathname, href: `https://www.vinted.fr${pathname}` },
    () => botShield, false, { log() {}, warn() {}, error() {} }, "vinted.fr", () => "Chrome",
    async () => ({ tryResolveSelector: () => false }),
    async () => { sondes.push(pathname); return { success: true, login: "lp_vtd89" }; },
    () => new Promise(() => {}), () => "conditions", { querySelector: () => null, body: null },
  );
  const r = await fn({ id: "f2849ebb", title: "Veste adidas France 98", platform_fields: {} });
  return { r, sondes };
}

console.log("\n[1] /main/banned sur le formulaire de dépôt : le mur, nommé, sans reprise");
{
  const { r, sondes } = await deposerSur("/main/banned");
  ok(r?.success === false && r.needsUser === true && r.attenteUtilisateur === true, "attente nommée (needs_user persisté, aucune reprise)", JSON.stringify(r));
  ok(r?.attenteMotif === "compte_vinted_bloque" && r.compteBloque === true, "motif « compte_vinted_bloque »");
  ok(/^COMPTE VINTED BLOQUÉ/.test(String(r?.error ?? "")), "préfixe lu par update-job-status", r?.error);
  ok(!r?.refusPassager, "jamais un refus passager");
  ok(sondes.length === 0, "aucune sonde : la page suffit (la sonde « répond » sous ce mur)");
}

console.log("\n[2] détection exacte : rien d'autre n'est un bannissement");
for (const p of ["/main/bannedx", "/member/login", "/listing-restriction", "/selling-restriction"]) {
  const { r } = await deposerSur(p);
  ok(!(r?.compteBloque) && r?.attenteMotif !== "compte_vinted_bloque" && !/^COMPTE VINTED BLOQUÉ/.test(String(r?.error ?? "")), `${p} : pas « compte bloqué »`, JSON.stringify(r).slice(0, 200));
}
{
  const { r } = await deposerSur("/items/new", { botShield: true });
  ok(/^CHALLENGE DATADOME/.test(String(r?.error ?? "")) && !r?.compteBloque, "captcha DataDome : reste un captcha");
}

console.log("\n[3] le serveur arrête au premier essai (essaiSurPageCompteBloque)");
const brutLp = "Page de dépôt Vinted non atteinte (pathname inattendu (/main/banned)) alors que le compte (@lp_vtd89) répond — nouvelle tentative au prochain passage, rien à faire. Nouvel essai automatique (tentative 1/5), rien à faire.";
ok(V.essaiSurPageCompteBloque({}, brutLp), "texte exact de lp.vtd89 (extension 0.6.169) : reconnu dès le 1er essai");
ok(V.essaiSurPageCompteBloque(null, "COMPTE VINTED BLOQUÉ : Vinted affiche sa page « compte bloqué » à la place du formulaire de dépôt — rien n'a été publié."), "verdict nommé de la 0.6.173");
ok(V.essaiSurPageCompteBloque({ work_window_state: { at_end: { tab_url: "https://www.vinted.fr/main/banned" } } }, ""), "fin de l'essai sur /main/banned : comme avant");
for (const [nom, brut] of [
  ["/main/bannedx", "Page de dépôt Vinted non atteinte (pathname inattendu (/main/bannedx)) alors que le compte (@x) répond"],
  ["connexion", "Page de dépôt Vinted non atteinte (pathname inattendu (/member/login)) alors que le compte (@x) répond"],
  ["connexion requise", "Connexion Vinted requise : se connecter sur vinted.fr dans Chrome"],
  ["captcha", "CHALLENGE DATADOME : Vinted affiche une vérification anti-robot à la place du formulaire de dépôt."],
  ["restriction", "RESTRICTION VINTED : Vinted limite temporairement les mises en vente sur ce compte (page /listing-restriction à la place du formulaire de dépôt)."],
  ["mot dans un titre", "Annonce « main banned edition » : refus passager"],
]) ok(!V.essaiSurPageCompteBloque({}, brut), `${nom} : jamais un bannissement`);
ok(!V.essaiSurPageCompteBloque({ work_window_state: { at_start: { tab_url: "https://www.vinted.fr/main/banned" }, at_end: { tab_url: "https://www.vinted.fr/items/new" } } }, ""),
  "onglet sur /main/banned AVANT notre essai, essai fini ailleurs : non (règle du 04/10)");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/if \(essaiSurPageCompteBloque\(pfBodyB, brutB\)\)/.test(ujs), "update-job-status décide par essaiSurPageCompteBloque");

console.log("\n[4] le message : bloqué PAR VINTED, pas une panne de FillSell");
const m = V.messageCompteVintedBloque("publish", "Veste adidas France 98");
ok(/^Ton compte Vinted est bloqué par Vinted/.test(m), "le compte bloqué par Vinted, dit en premier", m);
ok(/Ce n'est pas une panne de FillSell/.test(m) && /ne réessaie pas/.test(m) && /rien n'a été publié ni touché/.test(m), "pas une panne, pas de nouvel essai, rien de touché");
ok(/tant que Vinted affiche cette page/i.test(m) && /appli Vinted/.test(m), "le geste réel : l'appli Vinted");

console.log("\n[5] le background : l'attente nommée passe en needs_user, jamais ré-armée");
const bg = lire("chrome-extension/background.js");
const iAttente = bg.indexOf("if (result.attenteUtilisateur === true) {");
const iPassager = bg.indexOf("if (result.refusPassager && job.platform !== \"ebay\") {");
ok(iAttente > 0 && iPassager > iAttente, "attenteUtilisateur traitée AVANT le refus passager (aucun rearmBounded)");
ok(/await marquerAttenteUtilisateur\(accessToken, job, result\);\s*\n\s*return \{ status: "needsUser"/.test(bg.slice(iAttente, iAttente + 400)), "marquerAttenteUtilisateur puis needsUser");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ dépôt Vinted : le compte bloqué par Vinted est nommé au premier essai, jamais retenté");
