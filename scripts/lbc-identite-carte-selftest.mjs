// Autotest — LEBONCOIN NOM ET PRÉNOM : UNE CARTE PAR COMPTE (06/10 soir)
// `npm run selftest:lbc-identite-carte`
// _shared/lbc-identite.js, l'écran (src/stock/EcranIdentiteLbc.jsx), le Stock
// (« À régler ») et handler-watch (éclaireur, reprise, jamais soldé).
// Cas réel : patrick giry, 35 dépôts Leboncoin arrêtés au même mur
// (last_diagnostic.quoi = « lbc_escrow_identite », posé par leboncoin.js).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOTIF_LBC_IDENTITE, attendIdentiteLbc, attentesIdentiteLbc, eclaireurIdentiteLbc, champsEclaireur, champsReprise,
  ECLAIREUR_INTERVALLE_MS, ESPACEMENT_REPRISE_MS, URL_INFOS_LBC,
} from "../supabase/functions/_shared/lbc-identite.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const MSG = "Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : sans eux, la publication ne peut pas être validée.";
const job = (id, jour, extra = {}) => ({
  id, platform: "leboncoin", status: "needs_user", action: "publish", inventaire_id: Number(id.replace(/\D/g, "")) || 1,
  created_at: `2026-10-0${jour}T10:00:00Z`, error: MSG,
  platform_fields: { needs_user_source: "relancer", last_diagnostic: { quoi: MOTIF_LBC_IDENTITE, at: "x" }, ...extra },
});

console.log("\n1. LE MOTIF EXACT, RIEN D'AUTRE");
ok(attendIdentiteLbc(job("a1", 1)), "Leboncoin + needs_user + last_diagnostic.quoi = lbc_escrow_identite");
ok(!attendIdentiteLbc({ ...job("a2", 1), platform: "vinted" }), "une autre plateforme n'entre pas");
ok(!attendIdentiteLbc({ ...job("a3", 1), status: "failed" }) && !attendIdentiteLbc({ ...job("a3", 1), status: "pending" }), "seulement une attente (needs_user)");
ok(!attendIdentiteLbc({ ...job("a4", 1), action: "delete" }), "jamais un retrait");
ok(!attendIdentiteLbc(job("a5", 1, { last_diagnostic: { quoi: "lbc_depot_incertain" } })), "dépôt incertain : sa propre ligne");
ok(!attendIdentiteLbc(job("a6", 1, { last_diagnostic: "Leboncoin demande ton nom et ton prénom" })), "un texte ne suffit jamais (motif exact seulement)");
ok(!attendIdentiteLbc({ ...job("a7", 1, { last_diagnostic: { quoi: "refus_apercu" } }), error: "Leboncoin refuse le dépôt sur l'aperçu : « … »" }), "refus de l'aperçu : sa propre ligne");
ok(!attendIdentiteLbc(job("a8", 1, { needsUserField: { field_key: "adresse" } })), "une question de champ (adresse…) garde sa ligne");

console.log("\n2. L'ÉCLAIREUR ET LA REPRISE");
const trente5 = Array.from({ length: 35 }, (_, k) => job(`j${k + 10}`, (k % 6) + 1));
const att = attentesIdentiteLbc([...trente5, job("x", 1, { last_diagnostic: { quoi: "autre" } })]);
ok(att.length === 35 && Date.parse(att[0].created_at) <= Date.parse(att[34].created_at), "35 tâches, la plus ancienne d'abord (la 36e, autre motif, exclue)");
const t0 = Date.parse("2026-10-06T20:00:00Z");
const e1 = eclaireurIdentiteLbc(trente5, t0);
ok(e1?.id === att[0].id, "éclaireur = la plus ancienne");
const pfE = champsEclaireur(e1.platform_fields, "geste", new Date(t0).toISOString());
ok(pfE.identite_lbc.eclaireur_le === new Date(t0).toISOString() && pfE.identite_lbc.par === "geste" && pfE.identite_lbc.n === 1 && !pfE.needs_user_source && pfE.last_diagnostic?.quoi === MOTIF_LBC_IDENTITE, "éclaireur marqué (date, geste, n), motif gardé pour l'historique");
const apres = trente5.map((j) => (j.id === e1.id ? { ...j, platform_fields: pfE } : j));
ok(eclaireurIdentiteLbc(apres, t0 + 3_600_000) === null, "pas un 2e éclaireur avant 12 h");
ok(eclaireurIdentiteLbc(apres, t0 + ECLAIREUR_INTERVALLE_MS + 1)?.id != null, "un nouvel essai après 12 h");
const r3 = champsReprise({ needs_user_source: "relancer" }, 3, t0);
ok(r3.next_action_after === new Date(t0 + 3 * ESPACEMENT_REPRISE_MS).toISOString() && !r3.needs_user_source && r3.identite_lbc.par === "eclaireur_publie", "reprise espacée de 45 s par rang");
ok(URL_INFOS_LBC === "https://www.leboncoin.fr/account/private-details", "le lien relevé le 06/10 (« Informations personnelles »)");

console.log("\n3. L'APP : UNE CARTE PAR COMPTE");
const st = lire("src/tabs/StockTab.jsx");
ok(/if \(attendIdentiteLbc\(j\)\) continue;/.test(st), "les tâches sortent des lignes par article (attenteAction)");
ok(/const nbIdentiteLbc = identiteLbc\.length \? 1 : 0;/.test(st), "« À régler » compte UNE carte, quel que soit le nombre");
ok(/\{ cle: 'lbc_identite', n: nbIdentiteLbc,/.test(st) && /setGesteOuvert\('lbc_identite'\)/.test(st), "la ligne ouvre l'écran dédié");
const ec = lire("src/stock/EcranIdentiteLbc.jsx");
ok(/champsEclaireur\(eclaireur\.platform_fields, 'geste'/.test(ec) && /\.eq\('status', 'needs_user'\)/.test(ec), "« C'est fait » : UN éclaireur, compare-and-swap");
ok(/href=\{URL_INFOS_LBC\}/.test(ec), "« Ouvrir mes informations Leboncoin »");
ok(!/escrow|Transaction sécurisée.*relance la publication depuis la fiche/.test(ec.replace(/\/\/.*$/gm, "")), "aucun « relance depuis la fiche » dans l'écran");

console.log("\n4. LE SERVEUR (handler-watch)");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/if \(attendIdentiteLbc\(\{ \.\.\.j, status: "needs_user" \}\) && now - Date\.parse\(String\(j\.created_at \?\? ""\)\) < FENETRE_IDENTITE_MS\) return false;/.test(hw), "jamais soldé à 72 h tant qu'il a moins de 30 j");
ok(/\.eq\("platform_fields->last_diagnostic->>quoi", MOTIF_LBC_IDENTITE\)/.test(hw), "lecture par le motif EXACT");
ok(/if \(!Number\.isFinite\(vu\) \|\| now - \(vu as number\) > 24 \* 3_600_000\) continue;/.test(hw), "éclaireur seulement si le poste a été vu < 24 h");
ok(/pub >= le && !il\?\.libere_le/.test(hw) && /champsReprise\(j\.platform_fields/.test(hw), "éclaireur publié → toutes les autres repartent, une fois");
ok(/if \(traites >= 10\) break;/.test(hw), "10 comptes par passage au plus");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ Leboncoin nom et prénom : une carte par compte, tout est vert");
process.exit(ko ? 1 : 0);
