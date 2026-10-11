// `npm run selftest:depop-file-jamais-silencieuse` — DEPOP COMME OPLA (11/10/2026).
//
// Cas fondateurs : Simon BORGET (4 publications Depop « pending » depuis
// 14:27, sans un mot : son poste n'a pas la permission www.depop.com) et Jake
// Wright (2 depuis le 10/10 23:34). Ce test tient la règle, pas le cas :
//   A. la décision (_shared/acces-depop.js) : « Autoriser Depop » après 15 min
//      quand un poste SANS accès est là, après 1 h quand aucun poste autorisé
//      (anciennes extensions, poste éteint) ; JAMAIS quand un poste du compte a
//      l'accès ; la levée dès qu'un poste autorisé est vu ;
//   B. le message : LE MÊME à l'octet côté serveur, extension et app ;
//   C. get-pending-jobs écrit la trace par poste (depop_acces) et relance les
//      jobs « Autoriser Depop » quand un poste autorisé polle ; le relevé
//      Depop reste en file pour le poste autorisé ;
//   D. handler-watch pose la demande, remet le message, relance ;
//   E. l'app : l'attente se lit « Autoriser Depop » (jamais « repart seule »
//      sur une preuve d'Opla), LE bouton (web : l'extension ouvre son panneau ;
//      téléphone : l'ordinateur), la ligne Depop du lot le dit ;
//   F. Depop n'est JAMAIS pré-cochée dans le lot (comme à l'unité) ;
//   G. connexion Depop : « connecte-toi à Depop sur ton ordinateur », point.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { demanderAutorisationDepop, repartirApresAutorisationDepop, etatAccesDepop, DEPOP_DEMANDE_APRES_MS, DEPOP_FILET_MS } from "../supabase/functions/_shared/acces-depop.js";
import { messageConnexionRequise } from "../supabase/functions/_shared/mur-geste.js";
import { parcageDepasse } from "../supabase/functions/_shared/acces-opla.js";
import { natureAttente } from "../src/utils/etatsPublication.js";
import { choixInitial } from "../src/publication/lot/regles.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const dit = (nom, c, detail) => { n++; if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const T0 = Date.parse("2026-10-11T16:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const job = (ageMin, extra = {}) => ({ platform: "depop", status: "pending", created_at: iso(T0 - ageMin * 60_000), platform_fields: {}, ...extra });
const postes = (...l) => Object.fromEntries(l.map((p, i) => [`s${i}`, { le: iso(T0 - p.vuMin * 60_000), ...(p.depop === undefined ? {} : { depop_acces: p.depop }) }]));

console.log("\nA. LA DÉCISION « AUTORISER DEPOP »");
{
  dit("job de 10 min, poste sans accès : on attend encore", demanderAutorisationDepop(job(10), postes({ vuMin: 1, depop: false }), T0).demander === false);
  dit("job de 16 min, poste sans accès vu à l'instant : DEMANDE (cas Simon)", demanderAutorisationDepop(job(16), postes({ vuMin: 1, depop: false }), T0).demander === true);
  dit("… pourquoi = poste_sans_acces", demanderAutorisationDepop(job(16), postes({ vuMin: 1, depop: false }), T0).pourquoi === "poste_sans_acces");
  dit("job de 16 min, un AUTRE poste du compte a l'accès : rien", demanderAutorisationDepop(job(16), postes({ vuMin: 1, depop: false }, { vuMin: 300, depop: true }), T0).demander === false);
  dit("poste autorisé vu il y a 40 h (ordinateur éteint) : jamais de demande", demanderAutorisationDepop(job(600), postes({ vuMin: 40 * 60, depop: true }), T0).demander === false);
  dit("job de 30 min, poste d'avant la trace (aucune clé) : on attend", demanderAutorisationDepop(job(30), postes({ vuMin: 5 }), T0).demander === false);
  dit("job de 61 min, aucun poste autorisé (cas Jake, extension muette) : DEMANDE", demanderAutorisationDepop(job(61), postes({ vuMin: 18 * 60 }), T0).demander === true);
  dit("job de 61 min, aucun poste du tout : DEMANDE (filet)", demanderAutorisationDepop(job(61), null, T0).pourquoi === "aucun_poste_autorise");
  dit("après une relance (accordé il y a 5 min) : on attend de nouveau", demanderAutorisationDepop(job(120, { platform_fields: { depop_acces_accorde_le: iso(T0 - 5 * 60_000) } }), postes({ vuMin: 1, depop: false }), T0).demander === false);
  dit("un job needs_user ou d'une autre plateforme n'est jamais jugé", demanderAutorisationDepop(job(99, { status: "needs_user" }), null, T0).demander === false && demanderAutorisationDepop(job(99, { platform: "opla" }), null, T0).demander === false);
  dit("seuils : 15 min et 1 h", DEPOP_DEMANDE_APRES_MS === 15 * 60_000 && DEPOP_FILET_MS === 60 * 60_000);
  dit("levée : poste autorisé vu depuis 30 min", repartirApresAutorisationDepop(postes({ vuMin: 2, depop: true }), T0) === true);
  dit("pas de levée sur un poste autorisé vu il y a 2 h (il n'est pas là)", repartirApresAutorisationDepop(postes({ vuMin: 120, depop: true }), T0) === false);
  dit("état : poste expiré (> 48 h) ignoré", etatAccesDepop(postes({ vuMin: 49 * 60, depop: true }), T0).avecAcces === false);
}

console.log("\nB. LE MÊME MESSAGE PARTOUT");
{
  const tj = lire("supabase/functions/_shared/textes-jobs.ts");
  const m = tj.match(/export function autorisationDepopRequise\(action: string\): string \{[\s\S]*?\n\}/);
  const js = ts.transpileModule(m[0].replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const srv = new Function(`${js}\nreturn autorisationDepopRequise;`)();
  const app = lire("src/components/BoutonMeConnecter.jsx");
  const bloc = app.slice(app.indexOf("// ⟦depop-autorisation-app:début⟧"), app.indexOf("// ⟦depop-autorisation-app:fin⟧"));
  const msgApp = new Function(`${bloc.replace(/^\/\/.*$/gm, "").replace("export const", "const")}; return MESSAGE_AUTORISATION_DEPOP;`)();
  dit("app = serveur, à l'octet (forme publication)", msgApp === srv("publish"), `${msgApp} ≠ ${srv("publish")}`);
  const bg = lire("chrome-extension/background.js");
  const mb = bg.match(/\/\/ ⟦depop-autorisation:début⟧\n([\s\S]*?)\/\/ ⟦depop-autorisation:fin⟧/);
  const ext = mb ? new Function(`${mb[1]}\nreturn messageAutorisationDepop;`)() : () => null;
  dit("extension = serveur, à l'octet (publication, republication, retrait)", ["publish", "republish", "delete"].every((a) => ext(a) === srv(a)));
  dit("ni Chrome, ni icône, ni menu dans le message", !/chrome|ic[ôo]ne|menu|onglet/i.test(srv("publish")));
}

console.log("\nC. GET-PENDING-JOBS");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  dit("trace par poste : depop_acces true / false selon la capacité déclarée", gpj.includes("if (posteAvecDepop) { patchPoste.depop_acces = true;") && gpj.includes('else if (capacites.includes("sans_depop")) { patchPoste.depop_acces = false;'));
  dit("un poste autorisé relance les jobs « Autoriser Depop » (≤ 1 fois / 10 min)", gpj.includes("rearmerJobsDepopParques(admin, user.id, sessionId)") && gpj.includes("avant.rearme_depop_le"));
  dit("la relance cible needs_user_source = depop_acces, en compare-and-swap", /\.eq\("platform_fields->>needs_user_source", "depop_acces"\)[\s\S]{0,1600}\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(gpj));
  dit("le relevé Depop reste en file pour le poste autorisé", gpj.includes("relevé Depop laissé en file pour le poste autorisé"));
  // (12/10, A9) La file d'EXÉCUTION seulement : le popup (include_needs_user, lecture) voit ses jobs Depop pour les compter.
  dit("un poste sans accès ne reçoit toujours aucun job Depop (règle du 09/10)", gpj.includes('if (!posteAvecDepop && !includeNeedsUser) {') && gpj.includes('out = out.filter((j) => j.platform !== "depop");'));
  const pe = lire("supabase/functions/_shared/poste-extension.ts");
  dit("poste-extension : posteAvecAccesDepop / posteSansAccesDepop", pe.includes("export function posteAvecAccesDepop") && pe.includes("export function posteSansAccesDepop"));
}

console.log("\nD. HANDLER-WATCH");
{
  const hw = lire("supabase/functions/handler-watch/index.ts");
  // (11/10 19:30, v97) La requête ne lisait pas `platform` : la règle jugeait chaque job « hors champ ».
  const debut = hw.indexOf("DEPOP : JAMAIS DE FILE SILENCIEUSE");
  const bloc = debut >= 0 ? hw.slice(debut, hw.indexOf('.eq("platform", "depop").in("status", ["pending", "needs_user"])', debut)) : "";
  const sel = bloc.match(/\.select\("([^"]*)"\)/);
  dit("la requête des jobs Depop lit `platform` (sinon la règle juge tout « hors champ »)", !!sel && sel[1].split(/,\s*/).includes("platform"), sel ? sel[1] : "requête introuvable");
  dit("un job SANS `platform` n'est jamais demandé (c'est pourquoi la colonne doit être lue)", demanderAutorisationDepop({ status: "pending", created_at: iso(T0 - 120 * 60_000), platform_fields: {} }, null, T0).pourquoi === "hors_champ");
  dit("tout refus d'écriture est journalisé", hw.includes("demande « Autoriser Depop » refusée"));
  dit("demande posée par la règle unique (demanderAutorisationDepop)", hw.includes("demanderAutorisationDepop(j, postesJ, maintenantD)") && hw.includes("pf.needs_user_source = SOURCE_DEPOP_ACCES;"));
  dit("le message est LE texte unique (autorisationDepopRequise)", hw.includes("autorisationDepopRequise(String(j.action ?? \"publish\"))"));
  dit("relance quand un poste autorisé est vu (repartirApresAutorisationDepop)", hw.includes("repartirApresAutorisationDepop(postesJ, maintenantD)"));
  dit("écritures en compare-and-swap sur le statut", (hw.match(/\.eq\("id", j\.id\)\.eq\("status", "pending"\)/g) ?? []).length >= 1 && (hw.match(/\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/g) ?? []).length >= 2);
}

console.log("\nE. L'APP");
{
  dit("needs_user depop_acces → attente_autorisation / autoriser_depop", natureAttente({ platform: "depop", platform_fields: { needs_user_source: "depop_acces" } }).motif === "autoriser_depop");
  dit("la preuve d'accès OPLA ne lève jamais un parcage Depop", parcageDepasse({ platform: "depop", platform_fields: { depop_acces_attendu_le: "2026-10-11T10:00:00Z" } }, { verdict: "autorise", le: "2026-10-11T12:00:00Z" }) === false);
  const cp = lire("src/utils/connexionPlateformes.js");
  dit("motif AUTORISER_DEPOP, demande sur le web par le pont AUTORISER_DEPOP", cp.includes("AUTORISER_DEPOP: 'autoriser_depop'") && cp.includes("__fillsellCmd: 'AUTORISER_DEPOP'") && cp.includes("__fillsellDepopOuverture"));
  const b = lire("src/components/BoutonMeConnecter.jsx");
  dit("le bouton dit « Autoriser Depop » et passe par le pont sur le web", b.includes("autoriserDepop: 'Autoriser Depop'") && b.includes("demanderAutorisationDepopSurLeWeb()"));
  const fa = lire("chrome-extension/content-scripts/fillsell-auth.js");
  dit("l'extension relaie AUTORISER_DEPOP (déjà dans la 0.6.105)", fa.includes('"AUTORISER_DEPOP"'));
  const st = lire("src/tabs/StockTab.jsx");
  dit("la carte du Stock montre le bouton (murDeConnexion → AUTORISER_DEPOP)", st.includes("needs_user_source === 'depop_acces') return MOTIFS.AUTORISER_DEPOP;"));
  const su = lire("src/publication/EcranSuivi.jsx");
  dit("l'écran de suivi : « Attend ton autorisation Depop » et le bouton", su.includes("Attend ton autorisation Depop") && su.includes('motif={MOTIFS.AUTORISER_DEPOP}'));
  const lot = lire("src/publication/lot/LotPublication.jsx");
  dit("le lot : la ligne Depop cochée dit l'autorisation à donner, avec le bouton", lot.includes('p === "depop" && depopAAutoriser') && lot.includes("etatAccesDepop(profil.extension_postes)"));
}

console.log("\nF. DEPOP JAMAIS PRÉ-COCHÉE DANS LE LOT");
{
  const resume = { vinted: { possibles: 4 }, leboncoin: { possibles: 4 }, depop: { possibles: 4 } };
  dit("premier lot : Vinted et Leboncoin cochées, Depop proposée mais pas cochée (cas Simon)", choixInitial(resume).join() === "vinted,leboncoin");
  dit("lot précédent avec Depop cochée : gardée", choixInitial(resume, { memorise: ["vinted", "depop"] }).join() === "vinted,depop");
  const sf = lire("src/utils/stockFiltres.js");
  const rg = lire("src/publication/lot/regles.js");
  dit("la liste du lot = celle de l'unité (stockFiltres)", /PLATEFORMES_JAMAIS_PRECOCHEES = \['depop'\]/.test(sf) && /PLATEFORMES_JAMAIS_PRECOCHEES = Object\.freeze\(\["depop"\]\)/.test(rg));
}

console.log("\nG. CONNEXION DEPOP : SUR TON ORDINATEUR, POINT");
{
  const m = messageConnexionRequise("depop");
  dit("« connecte-toi à Depop sur ton ordinateur »", m.includes("connecte-toi à Depop sur ton ordinateur"), m);
  dit("ni Chrome ni onglet", !/chrome|onglet/i.test(m), m);
  dit("le début « Connexion Depop requise » reste (reconnu par l'app et le serveur)", /^Connexion Depop requise/.test(m));
  dit("les autres plateformes ne changent pas", messageConnexionRequise("vinted").startsWith("Connexion Vinted requise : reconnecte-toi à Vinted dans Chrome, sur ton ordinateur."));
  const ujs = lire("supabase/functions/update-job-status/index.ts");
  dit("update-job-status : l'attente Depop sans « dans Chrome »", ujs.includes('const ouSeConnecter = jrow.platform === "depop" ? "" : " dans Chrome";'));
}

console.log(ko ? `\n❌ depop-file-jamais-silencieuse : ${ko} rouge(s) sur ${n}` : `\n✓ depop-file-jamais-silencieuse : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
