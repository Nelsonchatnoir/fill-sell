// VERROU — complément 3 du 14/11/2026 (Nico), point 1 : LE CONTRÔLE DE SANTÉ DES IP NE REGARDE QUE CE QUI PASSE PAR L'IP DU
// POSTE CLOUD, ET « GRILLÉE » N'EST PLUS DÉFINITIF.
// Constat : l'IP 79 (#88469923) déclarée grillée sur eBay seulement — or, sur le Cloud, eBay ne passe jamais par l'IP du poste
// (connexion dans le navigateur du téléphone, publications et retraits par l'API eBay côté serveur, ebay-api-worker) ; et une
// IP grillée l'était pour toujours (cloud_ip_sante_noter refusait « deja_grillee »), alors que la règle de Nico est « aucune
// IP payée ne doit être gaspillée » (la quarantaine du 14/11 remplace « grillée définitif » pour toutes les IP).
// Ce verrou casse si : eBay revient dans le contrôle ; un échec « ebay » compte encore ; une grillée qui passe un contrôle
// ne revient pas au pool ; une grillée n'est plus jamais recontrôlée ; la base refuse de nouveau la sortie de « grillée ».
import fs from "node:fs";
import * as M from "../supabase/functions/_shared/cloud-pool.js";

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m, d === undefined ? "" : `\n      ${JSON.stringify(d).slice(0, 300)}`); } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const T = Date.parse("2026-11-14T12:00:00Z");
const iso = (t) => new Date(t).toISOString();

console.log("1. eBay hors du contrôle");
const sante = lire("serveur-cloud/src/sante.js");
const bloc = sante.slice(sante.indexOf("export const PLATEFORMES_SANTE"), sante.indexOf("]);", sante.indexOf("export const PLATEFORMES_SANTE")));
ok(/vinted/.test(bloc) && /leboncoin/.test(bloc) && /beebs/.test(bloc) && /depop/.test(bloc) && !/ebay/.test(bloc), "sante.js : Vinted, Leboncoin, Beebs, Depop — jamais eBay");
ok(Array.isArray(M.PLATEFORMES_SANTE_CONTROLEES) && M.PLATEFORMES_SANTE_CONTROLEES.join() === "vinted,leboncoin,beebs,depop", "cloud-pool.js : la même liste");
ok(M.codeSanteCompte?.("leboncoin") && M.codeSanteCompte("sortie:hebergeur") && M.codeSanteCompte("sortie") && !M.codeSanteCompte("ebay"), "un échec « ebay » ne compte plus ; la sortie et les 4 plateformes comptent");
const e0 = M.santeSuivante(null, { fait_le: iso(T), echecs: ["ebay"], inconnus: [] });
ok(e0.verdict === "saine", "un contrôle qui ne rate qu'eBay (ancien conteneur) : saine", e0);

console.log("2. Grillée : recontrôlée, de retour au pool dès qu'un contrôle passe");
const ip79 = { version: 1, verdict: "grillee", le: iso(T - 3 * 3600_000), grillee_le: iso(T - 3 * 3600_000), suspecte_le: iso(T - 4 * 3600_000), echecs: ["ebay"] };
const ip3 = { version: 1, verdict: "grillee", le: iso(T - 3 * 3600_000), grillee_le: iso(T - 3 * 3600_000), suspecte_le: iso(T - 4 * 3600_000), echecs: ["beebs", "leboncoin"] };
const r79 = M.santeSuivante(ip79, { fait_le: iso(T), echecs: [], inconnus: [] });
const r3ok = M.santeSuivante(ip3, { fait_le: iso(T), echecs: [], inconnus: [] });
const r3ko = M.santeSuivante(ip3, { fait_le: iso(T), echecs: ["beebs"], inconnus: [] });
ok(r79.verdict === "saine" && r79.sortie_grillee_le === iso(T), "IP « grillée sur eBay seulement » + contrôle qui passe → saine (retour au pool)", r79);
ok(r3ok.verdict === "saine" && r3ok.grillee_avant?.echecs?.join() === "beebs,leboncoin", "grillée Beebs + Leboncoin + contrôle qui passe → saine, la trace d'avant gardée", r3ok);
ok(r3ko.verdict === "grillee" && r3ko.recontroles === 1 && r3ko.echecs.join() === "beebs", "échec réel → reste grillée, recontrôle compté", r3ko);
const lib = (s) => ({ id: 79, commande: "c79", ip: "10.1.0.79", etat: "disponible", attributions: 0, refus: {}, expire_le: iso(T + 20 * 864e5), sante: s });
ok(M.choisirIpASonder([lib({ ...ip79, le: iso(T - 16 * 60_000) })], { maintenant: T })?.raison === "grillee_recontrole"
  && M.choisirIpASonder([lib({ ...ip79, le: iso(T - 10 * 60_000) })], { maintenant: T }) === null
  && M.choisirIpASonder([lib({ ...ip79, le: iso(T - 5 * 3600_000), recontroles: 2 })], { maintenant: T })?.ip.id === 79
  && M.choisirIpASonder([lib({ ...ip79, le: iso(T - 5 * 3600_000), recontroles: 3 })], { maintenant: T }) === null,
  "une grillée est recontrôlée 15 min, 1 h, 4 h, puis toutes les 12 h après le contrôle précédent");

console.log("3. La base et les outils");
const mig = lire("supabase/migrations/20261114120000_cloud_ip_grillee_recontrolee.sql");
const inv = lire("supabase/rollbacks/20261114120000_cloud_ip_grillee_recontrolee_INVERSE.sql");
const sansCommentaires = (sql) => sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(/CREATE OR REPLACE FUNCTION public\.cloud_ip_sante_noter/.test(mig) && !/deja_grillee/.test(sansCommentaires(mig)) && /deja_grillee/.test(sansCommentaires(inv)),
  "migration : la garde « deja_grillee » retirée (inverse : rendue)");
ok(fs.existsSync(new URL("./essais/20261114120000_banc.mjs", import.meta.url)), "banc jetable de la migration présent (scripts/essais/20261114120000_banc.mjs)");
const outil = lire("serveur-cloud/outils/controle-sante.mjs");
ok(/regles\.santeSuivante/.test(outil) && /cloud_ip_sante_noter/.test(outil) && /ip_tenue_par_un_compte/.test(outil), "outil de recontrôle à la demande : même règle, jamais une IP tenue par un compte");
const ent = lire("serveur-cloud/src/entretien.js");
ok(!/ne sera jamais renouvelée : elle expire à son terme/.test(ent) && /revient au pool dès qu'un contrôle passe/.test(ent), "l'entretien ne dit plus « jamais renouvelée, elle expire à son terme »");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
