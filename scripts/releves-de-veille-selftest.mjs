// Autotest — relevés de VEILLE au retour de la connexion (05/11, décision de Nico — A4) —
// `npm run selftest:releves-de-veille` (_shared/releves-de-veille.js, handler-watch).
// Rallumés pour Leboncoin, Beebs et Depop, en lecture seule ; eBay (API) et Opla (quittée) hors du code ; dressing Vinted
// toujours coupé ; jamais pendant une pause Leboncoin ; les gardes d'avant le 05/10 inchangées.
import fs from "node:fs";
import {
  CADENCE_REPRISE_MS, DECLENCHEUR_REPRISE_CONNEXION, PLAFOND_REPRISES_PAR_EPISODE, PLATEFORMES_VEILLE_REPRISE,
  ligneReleveDeVeille, murConnexionVeille, relevesDeVeilleAReposer,
} from "../supabase/functions/_shared/releves-de-veille.js";
import { DECLENCHEURS_VEILLE } from "../src/utils/declencheursReleve.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const MAINTENANT = Date.parse("2026-11-05T14:00:00Z");
const iso = (minAvant) => new Date(MAINTENANT - minAvant * 60_000).toISOString();
const U = "u1";
const mur = (platform, minAvant = 120, o = {}) => ({ user_id: U, platform, status: "failed", finished_at: iso(minAvant), erreur: `session ${platform} : page de connexion`, ...o });
const profil = (o = {}) => new Map([[U, {
  extVue: iso(1),
  sessions: { leboncoin: true, beebs: true, depop: true, opla: true, ebay: true, checked_at_par_plateforme: { leboncoin: iso(10), beebs: iso(10), depop: iso(10), opla: iso(10), ebay: iso(10) } },
  ps: {}, ...o,
}]]);
const ouvert = new Map([[U, true]]);
const run = (o) => relevesDeVeilleAReposer({ arrets: [], historique: [], profils: profil(), ouverte: ouvert, maintenant: MAINTENANT, ...o });
const plateformes = (r) => r.map((x) => x.platform).sort().join(",");

console.log("1. Le périmètre de la décision");
ok(PLATEFORMES_VEILLE_REPRISE.join(",") === "leboncoin,beebs,depop", "Leboncoin, Beebs, Depop — et rien d'autre");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("opla"), "Opla retirée (quittée le 10/10)");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("ebay"), "eBay hors du code : il passe par son API");
ok(!PLATEFORMES_VEILLE_REPRISE.includes("vinted"), "dressing Vinted : toujours coupé (hors de la décision)");
ok(plateformes(run({ arrets: ["leboncoin", "beebs", "depop", "opla", "ebay", "vinted"].map((p) => mur(p)) })) === "beebs,depop,leboncoin",
  "un mur Opla, eBay ou Vinted ne pose jamais rien");

console.log("\n2. Lecture seule : un relevé de VEILLE, jamais un geste");
const ligne = ligneReleveDeVeille({ user_id: U, platform: "beebs" }, iso(0));
ok(ligne.declencheur === DECLENCHEUR_REPRISE_CONNEXION && ligne.kind === "annonces" && ligne.status === "queued", "la ligne posée : kind annonces, déclencheur reprise_connexion");
const migration = lire("supabase/migrations/20261105110000_releves_rouverts_republication_partie.sql");
const veilleSql = migration.slice(migration.indexOf("FUNCTION public.releve_est_veille"), migration.indexOf("$function$;", migration.indexOf("FUNCTION public.releve_est_veille")));
ok(veilleSql.includes(`'${DECLENCHEUR_REPRISE_CONNEXION}'`), "la base le range en VEILLE (releve_est_veille, 20261105110000)");
ok(DECLENCHEURS_VEILLE.includes(DECLENCHEUR_REPRISE_CONNEXION), "l'app aussi (src/utils/declencheursReleve.js)");
ok(!new RegExp("^(bouton|bouton_distant|app)(:redemande)?$").test(DECLENCHEUR_REPRISE_CONNEXION), "ce n'est pas un geste (releve_est_geste : bouton, bouton_distant, app) : aucun import, aucune création d'article");
ok(!/FUNCTION public.releve_est_geste/.test(migration.replace(/--.*$/gm, "")), "la migration ne touche pas releve_est_geste");

console.log("\n3. Les gardes d'avant le 05/10, inchangées");
ok(run({ arrets: [mur("beebs")] }).length === 1, "mur Beebs, session revenue après le mur, sonde fraîche → un relevé de veille");
ok(murConnexionVeille("session beebs : page de connexion") && !murConnexionVeille("[défilement] 0 annonce") && !murConnexionVeille("accès Opla non accordé"),
  "le mur : « page de connexion » écrit par nos relevés, rien d'autre");
ok(run({ arrets: [mur("beebs", 120, { erreur: "réseau coupé" })] }).length === 0, "un arrêt qui n'est pas un mur → rien");
ok(run({ arrets: [mur("beebs", 120, { erreur: "réseau coupé" }), mur("beebs", 300)] }).length === 0, "le plus récent arrêt fait foi : non-mur après un mur → rien");
ok(run({ arrets: [mur("beebs", 5)] }).length === 0, "sonde plus ancienne que le mur → rien de neuf, rien");
ok(run({ arrets: [mur("beebs")], profils: profil({ sessions: { beebs: true, checked_at_par_plateforme: { beebs: iso(200) } } }) }).length === 0, "sonde de plus de 3 h → rien");
ok(run({ arrets: [mur("beebs")], profils: profil({ sessions: { beebs: false, checked_at_par_plateforme: { beebs: iso(10) } } }) }).length === 0, "pas connecté → rien");
ok(run({ arrets: [mur("beebs")], profils: profil({ extVue: null }) }).length === 0, "extension jamais vue → rien");
ok(run({ arrets: [mur("beebs")], ouverte: new Map([[U, false]]) }).length === 0, "interrupteur serveur fermé → rien");
ok(run({ arrets: [mur("beebs", 8 * 24 * 60)] }).length === 0, "mur de plus de 7 jours → rien");
ok(run({ arrets: [mur("beebs")], historique: [{ user_id: U, platform: "beebs", status: "queued" }] }).length === 0, "un relevé déjà en file → rien");
ok(run({ arrets: [mur("beebs")], historique: [{ user_id: U, platform: "beebs", status: "done", finished_at: iso(60) }] }).length === 0, "un relevé réussi après le mur → rien");
ok(run({ arrets: [mur("beebs", 120)], historique: [{ user_id: U, platform: "beebs", status: "done", finished_at: iso(130) }] }).length === 1, "réussi AVANT le mur → la reprise part");
const reprisesFaites = (k) => Array.from({ length: k }, (_, i) => ({ user_id: U, platform: "beebs", status: "failed", declencheur: DECLENCHEUR_REPRISE_CONNEXION, queued_at: iso(100 - i) }));
ok(run({ arrets: [mur("beebs")], historique: reprisesFaites(PLAFOND_REPRISES_PAR_EPISODE - 1) }).length === 1, `${PLAFOND_REPRISES_PAR_EPISODE - 1} reprises dans l'épisode → encore une`);
ok(run({ arrets: [mur("beebs")], historique: reprisesFaites(PLAFOND_REPRISES_PAR_EPISODE) }).length === 0, `${PLAFOND_REPRISES_PAR_EPISODE} reprises dans l'épisode → plus rien (jamais un martèlement)`);
ok(CADENCE_REPRISE_MS === 15 * 60_000, "cadence : 15 min après le dernier relevé réussi");

console.log("\n4. NEUF : jamais pendant une pause Leboncoin");
const pause = { leboncoin: { blocage_acces: { depuis: iso(600), signe: "acces_restreint" } } };
const r = run({ arrets: [mur("leboncoin"), mur("beebs")], profils: profil({ ps: pause }) });
ok(plateformes(r) === "beebs", "Leboncoin en pause → pas de relevé Leboncoin ; Beebs du même compte part", plateformes(r));
const levee = { leboncoin: { blocage_acces: { depuis: iso(600), leve_le: iso(30) } } };
ok(plateformes(run({ arrets: [mur("leboncoin")], profils: profil({ ps: levee }) })) === "leboncoin", "pause levée (reprise prudente) → la veille reprend");

console.log("\n5. handler-watch : branché, eBay et Opla hors du code, dressing Vinted coupé");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/from "\.\.\/_shared\/releves-de-veille\.js"/.test(hw) && /relevesDeVeilleAReposer\(\{/.test(hw) && /insert\(ligneReleveDeVeille\(c\)\)/.test(hw),
  "handler-watch pose la ligne de la règle, et elle seule");
ok(!/PF_RELEVE = \["leboncoin", "beebs", "ebay", "opla", "depop"\]/.test(hw), "l'ancienne liste (eBay, Opla) a disparu");
ok(/const RELANCE_AUTOMATIQUE_DRESSING_VINTED = false;/.test(hw) && /if \(RELANCE_AUTOMATIQUE_DRESSING_VINTED\) try \{/.test(hw), "le dressing Vinted reste coupé");
ok(!/RELANCE_AUTOMATIQUE_RELEVE\b/.test(hw), "plus aucun interrupteur global");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — relevés de veille`);
process.exit(ko ? 1 : 0);
