// Selftest : où le job s'est arrêté, et si c'est un mur de connexion.
//   deno run scripts/pages-de-job-selftest.ts
//
// Ce que ce test protège (21/09) :
//   · `at_end` est ÉCRASÉ à chaque tentative. La 0.6.50 écrira une LISTE
//     (`fins`). Le serveur doit lire la liste quand elle est là, la case
//     sinon — et toujours la DERNIÈRE entrée, jamais une ancienne : un job
//     qui a franchi le mur à la 3e tentative n'est plus devant lui.
//   · Sur les 32 jobs du parc arrêtés devant un mur de connexion, 13 ont eu
//     le bon message et les autres ont lu « restée en attente trop
//     longtemps », « publication non confirmée », ou rien. Les adresses
//     ci-dessous sont celles RELEVÉES en base.
//   · ⛔ `vinted.fr/member/register/select_type` n'est PAS la preuve d'une
//     absence de compte : c'est là que Vinted renvoie tout visiteur non
//     connecté. Ce test verrouille qu'on la traite comme un mur de
//     connexion, ni plus ni moins.

import {
  derniereFinDeJob,
  estPageDeConnexionPlateforme,
  estPageDeConnexionQuelconque,
} from "../supabase/functions/_shared/pages-de-job.ts";

let ko = 0;
const ok = (nom: string, cond: boolean, detail = "") => {
  if (!cond) ko++;
  console.log(`  ${cond ? "ok  " : "⚠ KO"} ${nom}${detail ? " — " + detail : ""}`);
};

console.log("=== 1. LA FIN DE LA DERNIÈRE TENTATIVE ===");
ok("pas de relevé → null", derniereFinDeJob({}) === null);
ok("platform_fields absent → null", derniereFinDeJob(null) === null);
ok("work_window_state vide → null", derniereFinDeJob({ work_window_state: {} }) === null);

const caseSeule = { work_window_state: { at_end: { tab_url: "https://www.ebay.fr/lstng", fill_step: "clic", at: "2026-09-21T16:00:00Z" } } };
ok("case at_end seule → elle est lue",
  derniereFinDeJob(caseSeule)?.tab_url === "https://www.ebay.fr/lstng");
ok("… avec son étape", derniereFinDeJob(caseSeule)?.fill_step === "clic");

const liste = {
  work_window_state: {
    at_end: { tab_url: "https://www.ebay.fr/lstng/error" },
    fins: [
      { tab_url: "https://onboardweb.ebay.fr/onboard-revamped/", at: "2026-09-21T16:05:00Z" },
      { tab_url: "https://onboardweb.ebay.fr/onboard-revamped/", at: "2026-09-21T16:10:00Z" },
      { tab_url: "https://www.ebay.fr/lstng/error", at: "2026-09-21T16:15:00Z" },
    ],
  },
};
ok("liste présente → c'est la DERNIÈRE entrée qui décide, pas la première",
  derniereFinDeJob(liste)?.tab_url === "https://www.ebay.fr/lstng/error",
  String(derniereFinDeJob(liste)?.tab_url));
ok("liste VIDE → repli sur la case",
  derniereFinDeJob({ work_window_state: { fins: [], at_end: { tab_url: "https://x.fr/a" } } })?.tab_url === "https://x.fr/a");
ok("entrée sans tab_url → tab_url null, pas de plantage",
  derniereFinDeJob({ work_window_state: { fins: [{ at: "x" }] } })?.tab_url === null);

console.log("=== 2. LES MURS DE CONNEXION RELEVÉS EN BASE ===");
ok("beebs /fr/auth", estPageDeConnexionPlateforme("beebs", "https://www.beebs.app/fr/auth"));
ok("beebs /auth", estPageDeConnexionPlateforme("beebs", "https://www.beebs.app/auth"));
ok("vinted /member/register/select_type (mur de connexion, PAS « pas de compte »)",
  estPageDeConnexionPlateforme("vinted", "https://www.vinted.fr/member/register/select_type"));
ok("vinted /member/signup_login", estPageDeConnexionPlateforme("vinted", "https://www.vinted.fr/member/signup_login"));
ok("ebay signin", estPageDeConnexionPlateforme("ebay", "https://signin.ebay.fr/ws/eBayISAPI.dll"));
ok("leboncoin /connexion", estPageDeConnexionPlateforme("leboncoin", "https://www.leboncoin.fr/connexion"));
ok("leboncoin auth.", estPageDeConnexionPlateforme("leboncoin", "https://auth.leboncoin.fr/x"));

console.log("=== 3. CE QUI N'EST PAS UN MUR DE CONNEXION ===");
ok("vinted /items/new", !estPageDeConnexionPlateforme("vinted", "https://www.vinted.fr/items/new"));
ok("vinted /member/257364012 (profil, pas connexion)",
  !estPageDeConnexionPlateforme("vinted", "https://www.vinted.fr/member/257364012"));
ok("beebs /fr/listing", !estPageDeConnexionPlateforme("beebs", "https://www.beebs.app/fr/listing"));
ok("beebs /fr/account/my-adverts", !estPageDeConnexionPlateforme("beebs", "https://www.beebs.app/fr/account/my-adverts"));
ok("leboncoin /deposer-une-annonce", !estPageDeConnexionPlateforme("leboncoin", "https://www.leboncoin.fr/deposer-une-annonce"));
ok("⛔ ebay onboardweb : PAS un défaut de connexion (autre cause, autre message)",
  !estPageDeConnexionPlateforme("ebay", "https://onboardweb.ebay.fr/onboard-revamped/"));
ok("ebay /lstng", !estPageDeConnexionPlateforme("ebay", "https://www.ebay.fr/lstng"));
ok("opla /sell/create", !estPageDeConnexionPlateforme("opla", "https://www.opla.co/sell/create"));

console.log("=== 4. L'HÔTE DOIT ÊTRE CELUI DE LA PLATEFORME DU JOB ===");
ok("job vinted fini sur beebs/auth → NON",
  !estPageDeConnexionPlateforme("vinted", "https://www.beebs.app/fr/auth"));
ok("job beebs fini sur vinted/register → NON",
  !estPageDeConnexionPlateforme("beebs", "https://www.vinted.fr/member/register/select_type"));
ok("domaine trompeur beebs.app.exemple.com → NON",
  !estPageDeConnexionPlateforme("beebs", "https://www.beebs.app.exemple.com/fr/auth"));
ok("plateforme inconnue → NON", !estPageDeConnexionPlateforme("truc", "https://www.beebs.app/fr/auth"));
ok("url absente → NON", !estPageDeConnexionPlateforme("beebs", null));
ok("pas une url → NON", !estPageDeConnexionPlateforme("beebs", "n'importe quoi"));

console.log("=== 5. LE PRÉ-FILTRE SANS PLATEFORME ===");
ok("beebs/auth reconnu", estPageDeConnexionQuelconque("https://www.beebs.app/fr/auth"));
ok("vinted/register reconnu", estPageDeConnexionQuelconque("https://www.vinted.fr/member/register/select_type"));
ok("page de dépôt non reconnue", !estPageDeConnexionQuelconque("https://www.leboncoin.fr/deposer-une-annonce"));
ok("null non reconnu", !estPageDeConnexionQuelconque(null));

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
if (ko) Deno.exit(1);
