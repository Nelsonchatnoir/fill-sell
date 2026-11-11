// Autotest — délai vente → retrait et rythme Leboncoin (05/11, points 10, 10A, 12 et 15 — Louis) —
// `npm run selftest:retrait-vente-prouvee`.
//   · serveur : un retrait de vente PROUVÉE (numéro de commande) est servi sans l'attente de 10 min ; dans « une action
//     Leboncoin toutes les 10 min », les retraits d'abord (_shared/retrait-vente-prouvee.js, get-pending-jobs) ;
//   · extension 0.6.174 : un retrait passe avant tout ; le numéro d'annonce d'une vente Leboncoin est lu dans le détail de
//     la transaction AVANT l'envoi ; une pause Leboncoin arrête aussi la messagerie et les lectures de routine.
//   · (11/11, A1a, D1 — f4367beb, n = 679) seule l'attente de l'ARMEMENT est levée (arme_par.le + 10 min, à 1 s près) ;
//     une reprise (Beebs en modération, connexion, « tentative N/5 », « pas de rouge ») garde sa cadence ;
//     update-job-status ne persiste plus `attente_levee` ; miroir ATTENTE_ANNULATION_MS = p_delai des appelants SQL.
import fs from "node:fs";
import { FENETRE_VENTE_MS, retraitDeVenteEnAttente, retraitServiSansAttente, retraitsDabord, venteProuveePourRetrait } from "../supabase/functions/_shared/retrait-vente-prouvee.js";
// Espace de noms : une constante absente (version d'avant) fait tomber l'assertion, pas l'import.
import * as RVP from "../supabase/functions/_shared/retrait-vente-prouvee.js";
const ATTENTE_ANNULATION_MS = RVP.ATTENTE_ANNULATION_MS;

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const MAINT = Date.parse("2026-11-05T10:56:00Z");
// Cas réel du 05/11 (vente 10:49:40Z, retraits armés 10:53:32Z, servis 11:05:2xZ). arme_par.le : posé par
// armer_retrait_job_pour avec le MÊME now() que next_action_after (armement + p_delai).
const retrait = (o = {}) => ({ id: "r1", action: "delete", platform: "depop", inventaire_id: 1792354259491005, user_id: "u", created_at: "2026-11-05T10:53:32Z",
  platform_fields: { arme_par: { chemin: "vente_article_serveur", le: "2026-11-05T10:53:32Z" }, next_action_after: "2026-11-05T11:03:32Z" }, ...o });
const vente = (o = {}) => ({ user_id: "u", inventaire_id: 1792354259491005, created_at: "2026-11-05T10:53:30Z", commande_ref: "17723871944:10672640008", ...o });

console.log("1. Serveur : une vente prouvée n'attend pas 10 min");
ok(retraitDeVenteEnAttente(retrait(), MAINT), "retrait de vente qui attend son heure → candidat");
ok(!retraitDeVenteEnAttente(retrait({ action: "publish" }), MAINT), "une publication → jamais");
ok(!retraitDeVenteEnAttente(retrait({ platform_fields: { arme_par: { chemin: "doublon_vendu_confirme" }, next_action_after: "2026-11-05T11:03:32Z" } }), MAINT), "un retrait qui n'est pas armé par une vente → jamais");
ok(!retraitDeVenteEnAttente(retrait({ platform_fields: { arme_par: { chemin: "vente_article_serveur", le: "2026-11-05T10:40:00Z" }, next_action_after: "2026-11-05T10:50:00Z" } }), MAINT), "échéance passée → déjà servi, rien à lever");
ok(venteProuveePourRetrait(retrait(), [vente()]), "vente de la fiche avec numéro de commande Vinted → prouvée");
ok(venteProuveePourRetrait(retrait(), [vente({ commande_ref: "370563621" })]), "transaction Leboncoin → prouvée");
ok(!venteProuveePourRetrait(retrait(), [vente({ commande_ref: null })]), "« Vendu » cliqué à la main (aucun numéro) → garde ses 10 min");
ok(!venteProuveePourRetrait(retrait(), [vente({ user_id: "autre" })]), "la vente d'un autre compte → jamais");
ok(!venteProuveePourRetrait(retrait(), [vente({ inventaire_id: 1 })]), "la vente d'une autre fiche → jamais");
ok(!venteProuveePourRetrait(retrait(), [vente({ created_at: new Date(Date.parse("2026-11-05T10:53:32Z") - FENETRE_VENTE_MS - 60_000).toISOString() })]),
  "une vente ancienne de la même fiche (série revendue) ne lève pas l'attente d'aujourd'hui");
const servi = retraitServiSansAttente(retrait());
ok(!("next_action_after" in servi.platform_fields) && servi.platform_fields.attente_levee?.motif === "vente_prouvee" && servi.platform_fields.arme_par?.chemin === "vente_article_serveur",
  "servi sans échéance (l'extension ne le saute plus), le reste intact");
ok("next_action_after" in retrait().platform_fields, "l'original n'est pas modifié (rien n'est écrit en base)");
const file = [
  { id: "a", action: "republish", created_at: "2026-11-01T13:15:00Z" }, { id: "b", action: "republish", created_at: "2026-11-01T13:25:00Z" },
  { id: "c", action: "delete", created_at: "2026-11-01T12:58:43Z" }, { id: "d", action: "delete", created_at: "2026-11-01T12:58:44Z" },
];
ok([...file].sort(retraitsDabord).map((j) => j.id).join("") === "cdab", "Leboncoin « une action / 10 min » : les retraits d'abord, puis l'ancienneté (01/11 : 45 min derrière 3 republications)");

console.log("\n1 bis. (11/11, A1a, D1) Seule l'attente de l'ARMEMENT est levée — jamais une reprise");
const MAINT_B = Date.parse("2026-11-11T20:35:00Z");
// Rejeu du défaut (f4367beb) : retrait Beebs armé par une vente, puis mis en cadence par l'extension (Beebs en
// modération, observation n = 5) : échéance = armement + 2 jours. La v1 la levait à CHAQUE poll (n = 679).
const ARME_B = "2026-11-10T08:00:00Z";
const repriseB = (echeance, o = {}) => ({ id: "rb", action: "delete", platform: "beebs", inventaire_id: 1790000000000001, user_id: "u", created_at: ARME_B,
  platform_fields: { arme_par: { chemin: "vente_article_serveur", le: ARME_B }, next_action_after: echeance, beebs_en_moderation: { n: 5 }, ...o } });
const plus = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 2 * 86_400_000)), MAINT_B), "reprise Beebs en modération (armement + 2 jours, n = 5) → JAMAIS levée (HEAD : levée à chaque poll)");
const MAINT_A = Date.parse(ARME_B) + 60_000; // une minute après l'armement
ok(retraitDeVenteEnAttente(repriseB(plus(ARME_B, 10 * 60_000)), MAINT_A), "échéance = armement + 10 min → levée (la vente prouvée n'attend pas)");
ok(retraitDeVenteEnAttente(repriseB(plus(ARME_B, 10 * 60_000 + 900)), MAINT_A) && retraitDeVenteEnAttente(repriseB(plus(ARME_B, 10 * 60_000 - 900)), MAINT_A),
  "à 1 s près (± 0,9 s) → levée");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 10 * 60_000 + 1500)), MAINT_A) && !retraitDeVenteEnAttente(repriseB(plus(ARME_B, 10 * 60_000 - 1500)), MAINT_A),
  "à 1,5 s de l'armement + 10 min → jamais (l'égalité n'est pas élargie)");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 5 * 60_000)), MAINT_A), "reprise dans les 10 premières minutes (armement + 5 min) → jamais");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 13 * 60_000), { needsUserAttempts: 2 }), MAINT_A), "« tentative N/5 » (reprise espacée, armement + 13 min) → jamais");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 40 * 60_000), { pas_de_rouge: { motif: "connexion" } }), MAINT_A), "« pas de rouge » (reprise à 40 min) → jamais");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 30 * 60_000), { attente_connexion: { platform: "vinted" } }), MAINT_A), "attente de connexion (30 min) → jamais par ce module");
ok(!retraitDeVenteEnAttente(repriseB(plus(ARME_B, 60 * 60_000), { lbc_moderation_410: { n: 1 } }), MAINT_A), "410 Leboncoin (1 h) → jamais");
ok(!retraitDeVenteEnAttente({ ...repriseB(""), platform_fields: { arme_par: { chemin: "vente_article_serveur" }, next_action_after: plus(ARME_B, 10 * 60_000) } }, MAINT_A),
  "arme_par.le absent → jamais");
ok(!retraitDeVenteEnAttente({ ...repriseB(""), platform_fields: { arme_par: { chemin: "vente_article_serveur", le: "hier" }, next_action_after: plus(ARME_B, 10 * 60_000) } }, MAINT_A),
  "arme_par.le illisible → jamais");
// Format réel de la base (to_jsonb(timestamptz) : microsecondes, décalage +00:00), même now() des deux côtés.
const reel = { id: "rr", action: "delete", platform: "vinted", inventaire_id: 1, created_at: "2026-11-05T10:53:32.123456+00:00",
  platform_fields: { arme_par: { chemin: "vente_commande_vinted", le: "2026-11-05T10:53:32.123456+00:00" }, next_action_after: "2026-11-05T11:03:32.123456+00:00" } };
ok(retraitDeVenteEnAttente(reel, Date.parse("2026-11-05T10:54:00Z")), "format réel de la base (microsecondes, +00:00) → reconnu");
const moduleSrc = lire("supabase/functions/_shared/retrait-vente-prouvee.js");
ok(!/aucune visite de plus/i.test(moduleSrc), "le commentaire « aucune visite de plus » est corrigé (une visite avancée, une fois)");

console.log("\n1 ter. update-job-status ne persiste plus `attente_levee` (l'extension recopie la copie servie)");
const ujs = lire("supabase/functions/update-job-status/index.ts");
const iBloc = ujs.indexOf("delete (body.platform_fields as Record<string, unknown>).attente_connexion;");
const blocUjs = iBloc > 0 ? ujs.slice(ujs.lastIndexOf("if (body.platform_fields", iBloc), ujs.indexOf("\n    }", iBloc)) : "";
ok(iBloc > 0 && blocUjs.includes("delete (body.platform_fields as Record<string, unknown>).attente_levee;"), "retiré du corps reçu au même endroit que `attente_connexion`, à toute écriture");
const iLevee = ujs.indexOf("delete (body.platform_fields as Record<string, unknown>).attente_levee;");
ok(iLevee > 0 && iLevee < ujs.indexOf("patch.platform_fields = body.platform_fields;"), "avant la copie du corps dans l'écriture");

console.log("\n1 quater. Miroir : ATTENTE_ANNULATION_MS = p_delai des appelants SQL (lecture prod du 11/11, pg_get_functiondef)");
// Relu en prod le 11/11/2026 vers 21:35 (lecture seule) : seuls ces deux appelants arment avec un délai non nul.
const APPELANTS_A_DELAI_PROD = [
  { fonction: "inventaire_vendu_retire_ses_copies", md5: "40049975a832346be9acea0e8eea4bea", chemin: "vente_article_serveur", delai: "10 minutes" },
  { fonction: "vente_vinted_lot_eclater", md5: "5b7d3966a6aa6e2b1be8509c6e900ca4", chemin: "vente_commande_vinted", delai: "10 minutes" },
];
const intervalleMs = (txt) => {
  const m = /^\s*(\d+)\s*(second|minute|hour)s?\s*$/i.exec(String(txt));
  if (m) return Number(m[1]) * { second: 1000, minute: 60_000, hour: 3_600_000 }[m[2].toLowerCase()];
  return /^\s*0\s*$/.test(String(txt)) ? 0 : NaN;
};
ok(ATTENTE_ANNULATION_MS === 600_000, "ATTENTE_ANNULATION_MS = 600 000 ms");
for (const a of APPELANTS_A_DELAI_PROD) {
  ok(intervalleMs(a.delai) === ATTENTE_ANNULATION_MS && /^vente_/.test(a.chemin),
    `${a.fonction} : p_delai = interval '${a.delai}' = ATTENTE_ANNULATION_MS, chemin « ${a.chemin} » reconnu comme vente`);
}
const cat = JSON.parse(lire("scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json"));
const defCat = (nom) => (cat.fonctions ?? []).find((f) => f.nom === nom)?.def ?? "";
const md5Cat = (nom) => Object.entries(cat.md5_prod ?? {}).find(([k]) => k.startsWith(`${nom}(`))?.[1] ?? "";
const pour = defCat("armer_retrait_job_pour");
ok(md5Cat("armer_retrait_job_pour") === "6ae927733a30ed5f88c2d649f5ec0c5e", "armer_retrait_job_pour de la fixture = prod relue le 11/11 (md5 6ae92773…)");
ok(/'arme_par',\s*jsonb_build_object\(\s*'chemin',\s*p_chemin,\s*'le',\s*now\(\)/.test(pour) && /'next_action_after',\s*to_jsonb\(now\(\)\s*\+\s*p_delai\)/.test(pour),
  "arme_par.le = now() et next_action_after = now() + p_delai : MÊME now(), l'égalité vaut à la microseconde");
const ivr = defCat("inventaire_vendu_retire_ses_copies");
ok(md5Cat("inventaire_vendu_retire_ses_copies") === APPELANTS_A_DELAI_PROD[0].md5 && /'vente_article_serveur'[\s\S]{0,160}interval '10 minutes'/.test(ivr),
  "inventaire_vendu_retire_ses_copies (fixture = prod) : « vente_article_serveur », interval '10 minutes'");
// Tout appel d'armement de la fixture (et de la dernière définition de vente_vinted_lot_eclater) : un délai écrit vaut 0
// ou ATTENTE_ANNULATION_MS, et 10 min ne s'écrit que pour une vente (chemin « vente_… »). Une autre valeur = miroir à revoir.
const appels = [];
const lireAppels = (src, ou) => {
  for (const m of String(src).matchAll(/\barmer_retrait(?:s_copies|_job_pour|_job|_annonce_pour)\s*\(((?:[^()]|\([^()]*\))*)\)/g)) {
    const lits = [...m[1].matchAll(/interval\s+'([^']*)'|'(\d+\s*[a-z]+)'/gi)].map((x) => x[1] ?? x[2]);
    const chemin = /^\s*[^,]+,\s*'([^']+)'/.exec(m[1])?.[1] ?? null;
    for (const l of lits) appels.push({ ou, chemin, delai: l });
  }
};
for (const f of cat.fonctions ?? []) lireAppels(f.def, `fixture:${f.nom}`);
const dossierMig = new URL("../supabase/migrations/", import.meta.url);
const migs = fs.readdirSync(dossierMig).filter((n) => n.endsWith(".sql")).sort();
const derniereDef = (nom) => {
  for (let i = migs.length - 1; i >= 0; i--) {
    const t = fs.readFileSync(new URL(migs[i], dossierMig), "utf8");
    if (new RegExp(`function\\s+(public\\.)?${nom}\\s*\\(`, "i").test(t)) return { nom: migs[i], t };
  }
  return null;
};
const lot = derniereDef("vente_vinted_lot_eclater");
if (lot) lireAppels(lot.t, `migration:${lot.nom}`);
ok(!!lot && /armer_retraits_copies\(v_inv, 'vente_commande_vinted', NULL, 'vinted', interval '10 minutes'\)/.test(lot.t),
  "vente_vinted_lot_eclater (dernière définition du dépôt) : l'appel relu en prod (« vente_commande_vinted », 10 minutes)");
const hors = appels.filter((a) => { const ms = intervalleMs(a.delai); return !(ms === 0 || (ms === ATTENTE_ANNULATION_MS && /^vente_/.test(String(a.chemin ?? "")))); });
ok(appels.length >= 5 && hors.length === 0, `${appels.length} délai(s) d'armement écrit(s) : 0, ou 10 min pour une vente — rien d'autre`, JSON.stringify(hors));

console.log("\n2. get-pending-jobs : branché au bon endroit");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iLeve = gpj.indexOf("UNE VENTE PROUVÉE RETIRE SES COPIES TOUT DE");
const iFiltre = gpj.indexOf("UNE TÂCHE EN ATTENTE PROGRAMMÉE N'EST PAS SERVIE (04/10)");
ok(iLeve > 0 && iFiltre > iLeve, "la levée passe AVANT le filtre des tâches en attente programmée");
const bloc = gpj.slice(iLeve, iFiltre);
ok(/\.not\("commande_ref", "is", null\)/.test(bloc) && /\.eq\("user_id", user\.id\)/.test(bloc), "lit les ventes à numéro de commande du compte seulement");
ok(!/\.update\(/.test(bloc), "rien n'est écrit en base");
ok((gpj.match(/\.sort\(retraitsDabord\)/g) ?? []).length === 2, "les deux files Leboncoin espacées (propriétaire, délégation) trient les retraits d'abord");

console.log("\n3. Extension : un retrait passe avant tout");
const bg = lire("chrome-extension/background.js");
const prio = bg.slice(bg.indexOf("const prioriteRepub = (j) => {"), bg.indexOf("jobs = jobs\n    .map((j, i) => [j, i])"));
ok(/if \(j\.action === "delete"\) return -1;/.test(prio), "rang -1 pour un retrait, devant les publications et les republications « deleted »");
ok(!/j\.action === "publish" \|\| j\.action === "delete"/.test(prio), "le retrait ne partage plus le rang des publications");

console.log("\n4. Extension : le numéro d'annonce d'une vente Leboncoin (10A, 12)");
const det = bg.slice(bg.indexOf("async function lireDetailsVentesLeboncoin"), bg.indexOf("async function lireDetailsVentesLeboncoin") + 2600);
ok(/\/api\/consumergoods\/proxy\/v2\/pages\/transactions\//.test(det), "le détail : l'appel que fait la page Leboncoin (vérifié sur le compte de Nico le 05/11)");
ok(/http === 403 \|\| http === 429\) \{ echecs\.push\(\{ ref, http \}\); break; \}/.test(det), "un 403/429 arrête le paquet (jamais forcer)");
ok(/"bundle"/.test(det), "une vente groupée n'est jamais rattachée à une annonce");
ok(/const LBC_DETAIL_PAR_RUN = 16;/.test(bg) && /const LBC_DETAIL_PAR_INJECTION = 8;/.test(bg) && /900 \+ Math\.random\(\) \* 1200/.test(det), "cadencé : 16 par passage, 8 par injection, 0,9–2,1 s");
const env = bg.slice(bg.indexOf("LEBONCOIN : le numéro d'annonce AVANT l'envoi"), bg.indexOf("let bilan = await envoyerVentesRelevees(token, platform, lignesVentes);"));
ok(env.length > 0 && /etat\.leboncoin_numeros = borner\(numeros\)/.test(env), "lu AVANT l'envoi, mémorisé par appareil (une transaction détaillée une fois, délégué compris)");
ok(/\(ratees\[ref\] \?\? 0\) < 2/.test(env), "un refus ordinaire : deux essais au plus");
ok(/LBC_ARRIERE_JOURS = 30/.test(bg) && /annonce_id=is\.null/.test(bg), "l'arriéré : les ventes des 30 derniers jours encore sans numéro");

console.log("\n5. Extension : une pause Leboncoin arrête tout (15)");
const mess = bg.slice(bg.indexOf("async function releverMessagerieBeta"), bg.indexOf("async function releverMessagerieBeta") + 4000);
ok(/platform === "leboncoin" && \(\(await leboncoinEnPause\(\)\) \|\| \(await leboncoinDelegueAilleurs\(\)\)\)/.test(mess), "messagerie : pas de Leboncoin en pause, ni sur un compte qui délègue Leboncoin");
const chk = bg.slice(bg.indexOf("async function checkPublishedListings"), bg.indexOf("async function checkPublishedListings") + 1500);
ok(/if \(plateforme === "leboncoin" && lbcEnPause\) return;/.test(chk) && /lbcEnPause \|\| \(await leboncoinDelegueAilleurs\(\)\)\) \? "&platform=neq\.leboncoin"/.test(chk),
  "lectures de routine : aucune page Leboncoin pendant la pause (compte et délégué)");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — vente → retrait, rythme Leboncoin`);
process.exit(ko ? 1 : 0);
