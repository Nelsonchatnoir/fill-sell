// Autotest — lot de Nico du 08/11 après-midi, côté app : points 7 (changement de version), 8 (coupure réseau pendant un
// lot de republications) et 10 (parcours de publication fermé sans publier). `npm run selftest:lot-0811-app`
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const fichiers = (dir) => fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? fichiers(`${dir}/${e.name}`) : /\.(jsx?|tsx?)$/.test(e.name) ? [`${dir}/${e.name}`] : []);

console.log("\n1. POINT 7 — UN CHUNK ABSENT PENDANT UN CHANGEMENT DE VERSION NE PLANTE PLUS (doriane-henri, 07/11 20:37)");
{
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, postMessage: () => {}, location: { origin: "https://fillsell.app", href: "https://fillsell.app/app" } };
  const L = await import("../src/utils/lazySur.js");
  const m = { default: () => null };
  ok(L.moduleOuAttente(m) === m, "un module chargé est rendu tel quel");
  let leve = null;
  try { L.moduleOuAttente(undefined); } catch (e) { leve = e; }
  ok(leve && /module chargé à la demande vide/.test(leve.message), "hors rechargement, un module vide est une vraie erreur (elle remonte, lisible)");
  window.__fillsellRechargeVersion = Date.now();
  const r = L.moduleOuAttente(undefined);
  let resolu = false;
  r.then(() => { resolu = true; });
  await new Promise((res) => setTimeout(res, 30));
  ok(r instanceof Promise && resolu === false, "pendant le rechargement de version : l'import attend en silence (Suspense garde son fallback, rien ne plante)");
  window.__fillsellRechargeVersion = Date.now() - 61_000;
  ok(L.rechargementDeVersionEnCours() === false, "le repère ne vaut que 60 s");
  const sansLazy = fichiers("src").filter((f) => f !== "src/utils/lazySur.js")
    .filter((f) => /\blazy(?:Messagerie)?\(\s*\(\)\s*=>/.test(lire(f).replace(/\/\/[^\n]*/g, "")));
  ok(sansLazy.length === 0, "plus aucun `lazy(() => import(...))` hors de lazySur", sansLazy.join(", "));
  const main = lire("src/main.jsx");
  ok(/window\.__fillsellRechargeVersion = Date\.now\(\)\n\s+evt\.preventDefault\(\)/.test(main), "main.jsx pose le repère AVANT d'annuler l'événement et de recharger");
  ok(/const t = Number\(window\.__fillsellRechargeVersion \|\| 0\)\n\s+if \(t > 0 && Date\.now\(\) - t < 60000\) return/.test(main),
    "pendant le rechargement, une erreur née du chunk absent n'est pas journalisée comme une panne");
  ok(/if \(Date\.now\(\) - dernier < 10000\) return/.test(main), "jamais de boucle : un seul rechargement par tranche de 10 s (inchangé)");
}

console.log("\n2. POINT 8 — UNE COUPURE RÉSEAU N'EST PLUS UN REFUS, ET JAMAIS UNE TÂCHE PERDUE (XEWER, 07/11 18:17)");
{
  const R = await import("../src/utils/republication.js");
  const faux = (reponses, jobExistant = null) => {
    const appels = [];
    return {
      appels,
      rpc: async (nom, params) => { appels.push(params); const r = reponses.shift(); return r; },
      from: () => {
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: async () => ({ data: jobExistant ? [{ id: jobExistant }] : [] }) };
        return q;
      },
    };
  };
  const coupure = { data: null, error: { message: "TypeError: Failed to fetch" } };
  const opts = { attendre: async () => true, pause: async () => {} };
  const params = { platform: "leboncoin", inventaireId: 1789717143519005, prixRepublication: null };
  let sb = faux([coupure, { data: { allowed: true, job_id: "j-1" }, error: null }]);
  let r = await R.republierAvecReprise(sb, params, opts);
  ok(r.success === true && r.job_id === "j-1" && r.coupures === 1 && sb.appels.length === 2, "le cas du 07/11 : la coupure se rejoue au retour, la republication est créée");
  sb = faux([coupure, { data: { allowed: false, reason: "republish_en_cours" }, error: null }], "j-deja");
  r = await R.republierAvecReprise(sb, params, opts);
  ok(r.success === true && r.job_id === "j-deja" && r.repris_apres_coupure === true, "la première demande était arrivée : « déjà en cours » = le job existant, jamais un doublon");
  sb = faux([coupure, coupure, coupure, coupure]);
  r = await R.republierAvecReprise(sb, params, opts);
  ok(r.success === false && r.reason === "coupure_reseau" && sb.appels.length === 4, "3 reprises sans réseau : un motif nommé « coupure_reseau », jamais « TypeError »");
  ok(/Connexion coupée pendant l'envoi/.test(R.messageRefusRepublication(r, "fr", "leboncoin")), `phrase : « ${R.messageRefusRepublication(r, "fr", "leboncoin")} »`);
  sb = faux([{ data: { allowed: false, reason: "cadence_24h" }, error: null }]);
  r = await R.republierAvecReprise(sb, params, opts);
  ok(r.success === false && r.reason === "cadence_24h" && sb.appels.length === 1, "un vrai refus du serveur n'est jamais rejoué");
  ok(/const res = await republierAvecReprise\(supabase, \{/.test(lire("src/tabs/StockTab.jsx")), "la boucle du lot (StockTab) passe par la reprise");
}

console.log("\n3. POINT 10 — UN PARCOURS DE PUBLICATION FERMÉ SANS PUBLIER SE TRACE (Stéphanie Durand, 07/11 18:11)");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/signalerActionRatee\(\{ action: "stepper_ferme", motif: "sans_publier"/.test(lps), "une ligne « stepper_ferme » (étape, plateformes, durée)");
  ok(/window\.addEventListener\("pagehide", surPagehide\)/.test(lps), "… aussi au rechargement de la page (pagehide)");
  ok(/if \(!pubErr && pubRes && pubRes\.allowed !== false\) publiePartieRef\.current = true;/.test(lps), "… jamais après une publication acceptée");
  ok(/traceStepperRef\.current\.plateformes = \[\.\.\.selected\];/.test(lps), "les plateformes cochées sont celles du moment");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ lot du 08/11 (app) : changement de version propre, coupure rejouée, sortie du parcours tracée");
process.exit(ko ? 1 : 0);
