// ═══════════════════════════════════════════════════════════════════════════
// DEPOP DEMANDE DE TERMINER LA CONFIGURATION DE VENDEUR : UNE CARTE PAR
// COMPTE, PLUS AUCUN JOB, UNE REPRISE SEULE — `npm run selftest:depop-vendeur-mur`
// ═══════════════════════════════════════════════════════════════════════════
// 17/10/2026, Nico. Cas réels (formes relues en base le 17/10) : Romain, 8
// publications au mur le 13/10 ; Héloïse, 4 (+ 1 abandonnée) le 16/10 ;
// Thibault, 39 publications toutes au mur les 15 et 16/10, configuration faite
// le 16/10, deux publications encore arrêtées le lendemain. Ce test prouve,
// sans réseau ni base :
//   A. la règle pure (_shared/vendeur-depop.js) : quelle tâche attend ce geste
//      (mur VU, publication retenue — jamais une question de champ, jamais un
//      autre mur), la preuve que Depop accepte le vendeur, l'éclaireur et son
//      barème, la reprise espacée ; une retenue n'est jamais un mur VU ;
//   B. le même message partout (extension, serveur), sans « relance » ;
//   C. les trois cas réels rejoués ;
//   D. le câblage : get-pending-jobs (plus aucun job, retraits jamais retenus,
//      avant la réservation), update-job-status (le mur nommé, levé sur
//      preuve), handler-watch (jamais soldé, preuve, éclaireur), l'app (UNE
//      ligne « À régler », l'écran, « C'est fait »), l'extension (canSell).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
const charger = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
let ko = 0;
let n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

const V = await charger("supabase/functions/_shared/vendeur-depop.js");
const E = await charger("src/utils/etatsPublication.js");

const T0 = Date.parse("2026-10-16T14:24:36Z"); // dernier mur vu chez Thibault
const iso = (t) => new Date(t).toISOString();
const MSG_ANCIEN = "Depop demande de terminer ta configuration de vendeur avant toute mise en ligne (moyen de paiement à relier sur depop.com). Ta connexion n'est pas en cause : termine cette étape sur depop.com sur ton ordinateur, puis relance la publication.";
// Une tâche au mur, telle que l'extension ≤ 0.6.122 l'a laissée (source « relancer » par défaut).
const mur = (id, at, extra = {}) => ({
  id, user_id: "u", platform: "depop", action: "publish", status: "needs_user", created_at: iso(Date.parse(at) - 3600_000), error: MSG_ANCIEN,
  platform_fields: { needs_user_source: "relancer", last_diagnostic: { quoi: V.MOTIF_VENDEUR_DEPOP, at, detail: MSG_ANCIEN },
    work_window_state: { at_end: { at, fill_step: "session", tab_url: "https://www.depop.com/fr/" } }, ...extra },
});

console.log("\nA. LA RÈGLE");
{
  ok(V.attendVendeurDepop(mur("r1", "2026-10-13T17:26:32Z")), "mur vu (motif exact, source « relancer » d'avant le 17/10)");
  ok(V.attendVendeurDepop(mur("r2", "2026-10-13T17:26:32Z", { needs_user_source: V.SOURCE_VENDEUR_DEPOP })), "mur vu, source nommée « depop_vendeur »");
  const retenue = { id: "t1", platform: "depop", action: "publish", status: "needs_user", created_at: iso(T0 + 3600_000),
    platform_fields: V.champsRetenue({ depopMarque: "Zara" }, iso(T0 + 7200_000)) };
  ok(V.attendVendeurDepop(retenue) && retenue.platform_fields.needs_user_source === V.SOURCE_VENDEUR_DEPOP && !retenue.platform_fields.last_diagnostic, "publication retenue par le serveur : même attente, last_diagnostic non touché");
  ok(V.derniereObservationMur([retenue]) === -Infinity, "une retenue n'est JAMAIS un mur vu");
  ok(V.derniereObservationMur([mur("a", "2026-10-13T17:26:32Z"), mur("b", "2026-10-16T14:24:36Z"), retenue]) === T0, "le dernier mur vu : celui de l'extension, le plus récent");
  const questionMarque = mur("q", "2026-10-16T14:24:36Z", { needs_user_source: "champ_a_choisir", needsUserField: { field_key: "depopMarque" } });
  ok(!V.attendVendeurDepop(questionMarque), "une question de champ (marque, motif périmé resté sur le job) garde sa ligne");
  ok(!V.attendVendeurDepop(mur("c", "2026-10-16T14:24:36Z", { needs_user_source: "connexion" })), "un autre mur (connexion) n'entre pas, même avec le motif périmé");
  ok(!V.attendVendeurDepop({ ...mur("d", "2026-10-16T14:24:36Z"), action: "delete" }), "jamais un retrait");
  ok(!V.attendVendeurDepop({ ...mur("e", "2026-10-16T14:24:36Z"), platform: "leboncoin" }), "une autre plateforme n'entre pas");
  ok(!V.attendVendeurDepop({ ...mur("f", "2026-10-16T14:24:36Z"), status: "pending" }), "seulement une attente (needs_user)");
  const passe = mur("g", "2026-10-16T14:24:36Z");
  passe.platform_fields.work_window_state = { at_end: { at: iso(T0 + 600_000), fill_step: "referentiels" } };
  ok(!V.attendVendeurDepop(passe), "passé au-delà du contrôle vendeur depuis : plus ce mur");
  const relache = mur("h", "2026-10-16T14:24:36Z", { vendeur_depop: { reprise_le: iso(T0 + 600_000) } });
  ok(!V.attendVendeurDepop(relache), "relâchée après ce mur puis arrêtée pour autre chose : plus ce mur");
  ok(!V.attendVendeurDepop(mur("i", "2026-10-16T14:24:36Z", { last_diagnostic: { quoi: "depop_description_vide", at: "x" } })), "un autre motif de l'extension : pas ce mur");

  ok(V.controleVendeurPasse({ platform: "depop", action: "publish", status: "published", published_at: iso(T0 + 4200_000) }, T0), "publiée après le mur : preuve");
  ok(!V.controleVendeurPasse({ platform: "depop", action: "publish", status: "published", published_at: iso(T0 - 60_000) }, T0), "publiée avant le mur : pas une preuve");
  ok(!V.controleVendeurPasse({ platform: "depop", action: "publish", status: "published", handler_build: "releve-annonces", published_at: iso(T0 + 9e6) }, T0), "un relevé n'est jamais une preuve");
  ok(V.controleVendeurPasse({ platform: "depop", action: "publish", status: "needs_user", platform_fields: { work_window_state: { at_end: { at: iso(T0 + 60_000), fill_step: "referentiels" } } } }, T0), "arrêtée sur une question APRÈS le contrôle vendeur : preuve");
  ok(!V.controleVendeurPasse({ platform: "depop", action: "publish", status: "needs_user", platform_fields: { work_window_state: { at_end: { at: iso(T0 + 60_000), fill_step: "session" } } } }, T0), "arrêtée à l'étape « session » : pas une preuve");
  ok(V.sondeVendeurDepopOk({ depop_vendeur: true, checked_at_par_plateforme: { depop: iso(T0 + 1000) } }, T0)
    && !V.sondeVendeurDepopOk({ depop_vendeur: true, checked_at_par_plateforme: { depop: iso(T0 - 1000) } }, T0)
    && !V.sondeVendeurDepopOk({ depop_vendeur: false, checked_at: iso(T0 + 1000) }, T0) && !V.sondeVendeurDepopOk(null, T0), "la sonde : canSell lu APRÈS le mur, seulement");

  const att = [mur("x1", iso(T0)), mur("x2", iso(T0))];
  att[1].created_at = iso(T0 - 9e6);
  ok(V.eclaireurVendeurDepop(att, T0 + 10 * 60_000) === null, "pas d'éclaireur avant l'écart du barème");
  const e1 = V.eclaireurVendeurDepop(att, T0 + 16 * 60_000);
  ok(e1?.id === "x2", "éclaireur = la plus ancienne, après le premier écart");
  const pfE = V.champsEclaireur(e1.platform_fields, "geste", iso(T0 + 16 * 60_000));
  ok(pfE.vendeur_depop.eclaireur_le === iso(T0 + 16 * 60_000) && pfE.vendeur_depop.n === 1 && !pfE.needs_user_source && pfE.last_diagnostic?.quoi === V.MOTIF_VENDEUR_DEPOP && pfE.needsUserAttempts === 0, "éclaireur marqué (date, geste, n), motif gardé pour l'historique");
  // L'éclaireur relancé est EN COURS (pending) : il n'est plus une attente, mais il compte.
  const enRoute = { ...e1, status: "pending", platform_fields: pfE };
  const restent = att.filter((j) => j.id !== e1.id);
  ok(V.eclaireurVendeurDepop(restent, T0 + 30 * 60_000, [enRoute]) === null, "un éclaireur en route : pas un 2e avant l'écart suivant (plus long)");
  ok(V.eclaireurVendeurDepop(restent, T0 + 30 * 60_000) !== null, "(sans le compter, il en partirait un second : c'est pourquoi handler-watch lui passe les tâches en cours)");
  const revenu = { ...e1, platform_fields: { ...pfE, needs_user_source: V.SOURCE_VENDEUR_DEPOP, last_diagnostic: { quoi: V.MOTIF_VENDEUR_DEPOP, at: iso(T0 + 17 * 60_000) } } };
  ok(V.attendVendeurDepop(revenu) && V.eclaireurVendeurDepop([...restent, revenu], T0 + 40 * 60_000) === null && V.eclaireurVendeurDepop([...restent, revenu], T0 + 48 * 60_000) !== null,
    "revenu au même mur : il rejoint la carte, l'éclaireur suivant attend l'écart suivant");
  ok(V.estEclaireurFrais({ platform: "depop", platform_fields: pfE }, T0 + 20 * 60_000) && !V.estEclaireurFrais({ platform: "depop", platform_fields: pfE }, T0 + 50 * 60_000), "l'éclaireur reste servi un moment, puis plus");
  ok(V.estEclaireurFrais({ platform: "depop", platform_fields: { derniere_relance_manuelle: iso(T0) } }, T0 + 60_000), "une relance de l'app vaut éclaireur");
  const r3 = V.champsReprise({ needs_user_source: V.SOURCE_VENDEUR_DEPOP, vendeur_depop: { retenue_le: "x" } }, 3, T0, "test");
  ok(r3.next_action_after === iso(T0 + 3 * V.ESPACEMENT_REPRISE_MS) && !r3.needs_user_source && !r3.vendeur_depop.retenue_le && r3.vendeur_depop.reprise_le === iso(T0), "reprise espacée de 45 s par rang, retenue levée");
  ok(V.DELAIS_ECLAIREUR_MIN.every((x, i, l) => i === 0 || x >= l[i - 1]), "le barème ne raccourcit jamais");
}

console.log("\nB. LE MÊME MESSAGE PARTOUT, SANS « RELANCE »");
{
  const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
  ctx.globalThis = ctx;
  vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
  vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}\n;globalThis.__m = DEPOP_MSG_VENDEUR;`, ctx, { filename: "depop.js" });
  ok(ctx.__m === V.MESSAGE_VENDEUR_DEPOP, "extension = serveur, à l'octet", `${ctx.__m} ≠ ${V.MESSAGE_VENDEUR_DEPOP}`);
  ok(!/relance/i.test(V.MESSAGE_VENDEUR_DEPOP) && /toutes seules/.test(V.MESSAGE_VENDEUR_DEPOP) && /configuration de vendeur/.test(V.MESSAGE_VENDEUR_DEPOP), "ni « relance », la reprise dite ; « configuration de vendeur » (motif « à toi » de etat-job)");
  const nat = E.natureAttente({ platform: "depop", status: "needs_user", action: "publish", platform_fields: { needs_user_source: V.SOURCE_VENDEUR_DEPOP } });
  ok(nat.kind === "attente_vendeur_depop" && /configuration de vendeur Depop/.test(E.phraseEtat("depop", nat, "fr")), "l'état de la plateforme dans l'app : « en attente de ta configuration de vendeur Depop »");
}

console.log("\nC. LES TROIS CAS RÉELS");
{
  const romain = ["17:26:32", "17:26:42", "17:26:51", "17:27:00", "17:28:45", "17:30:44", "17:32:45", "17:46:44"].map((h, i) => mur(`romain${i}`, `2026-10-13T${h}Z`));
  ok(V.attentesVendeurDepop(romain).length === 8, "Romain : 8 publications → UNE carte");
  const heloise = ["19:43:18", "19:44:33", "19:51:01", "19:52:16"].map((h, i) => mur(`heloise${i}`, `2026-10-16T${h}Z`));
  const abandon = { ...mur("heloise4", "2026-10-16T19:48:43Z"), status: "cancelled" };
  ok(V.attentesVendeurDepop([...heloise, abandon]).length === 4, "Héloïse : 4 → UNE carte (l'article abandonné n'en est pas)");
  const thibault = [mur("96da6224", "2026-10-16T14:00:10Z"), mur("d1f968d6", "2026-10-16T13:59:45Z")];
  const publiees = [{ platform: "depop", action: "publish", status: "published", handler_build: "2026-10-15T19:36:02Z+18cc681 · v0.6.114", published_at: "2026-10-16T15:34:50Z" }];
  const depuis = V.derniereObservationMur(thibault);
  ok(publiees.some((p) => V.controleVendeurPasse(p, depuis)), "Thibault : publiée le 16/10 après le dernier mur → preuve, ses 2 publications repartent seules");
}

console.log("\nD. LE CÂBLAGE");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const iBloc = gpj.indexOf("DEPOP DEMANDE DE TERMINER LA CONFIGURATION DE VENDEUR : PLUS AUCUN JOB");
  const iResa = gpj.indexOf('admin.rpc("reserver_jobs_extension"');
  const bloc = iBloc > 0 ? gpj.slice(iBloc, gpj.indexOf("── DEPOP : LES CATÉGORIES QUE DEPOP INTERDIT", iBloc)) : "";
  ok(iBloc > 0 && iResa > iBloc, "get-pending-jobs : la retenue AVANT la réservation");
  ok(/j\.platform === "depop" && j\.action !== "delete" && j !== eclaireurV/.test(bloc), "les retraits ne sont jamais retenus ; l'éclaireur reste servi");
  ok(/champsRetenue\(/.test(bloc) && /status: "needs_user", error: MESSAGE_VENDEUR_DEPOP/.test(bloc) && /\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(bloc), "retenue = attente du même geste, compare-and-swap sur pending");
  ok(/if \(posesV >= 40\) break;/.test(bloc) && /!includeProcessing && !includeNeedsUser/.test(bloc), "au plus 40 écritures, poll d'exécution seul");
  ok(/\.gt\("published_at", new Date\(vuV\)\.toISOString\(\)\)/.test(bloc) && /\.neq\("handler_build", "releve-annonces"\)/.test(bloc), "une publication faite depuis le dernier mur vu : rien n'est retenu");
  const ujs = lire("supabase/functions/update-job-status/index.ts");
  ok(/pfVendeurDepop = \{ \.\.\.pfIn, needs_user_source: SOURCE_VENDEUR_DEPOP \};/.test(ujs) && /messageEffectif = MESSAGE_VENDEUR_DEPOP;/.test(ujs), "update-job-status : le mur nommé, le message du compte");
  ok(/diagFraisD/.test(ujs), "… seulement le mur de CET essai (motif daté récent)");
  const iMaj = ujs.indexOf("const updated = ecriture.job;");
  const iLeve = ujs.indexOf("LE CONTRÔLE VENDEUR PASSÉ LÈVE LE MUR DU COMPTE");
  ok(iMaj > 0 && iLeve > iMaj && /champsRepriseVendeurDepop\(m\.platform_fields/.test(ujs.slice(iLeve)), "update-job-status : levée sur preuve, APRÈS l'écriture du job");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(/if \(attendVendeurDepop\(\{ \.\.\.j, status: "needs_user" \}\) && now - Date\.parse\(String\(j\.created_at \?\? ""\)\) < FENETRE_VENDEUR_DEPOP_MS\) return false;/.test(hw), "handler-watch : jamais soldé à 72 h tant qu'il a moins de 30 j");
  const bhw = hw.slice(hw.indexOf("DEPOP DEMANDE LA CONFIGURATION DE VENDEUR : LA PREUVE"));
  ok(/\.limit\(500\)/.test(bhw) && /\.slice\(0, 10\)/.test(bhw) && /now - vu > POSTE_RECENT_MS/.test(bhw), "handler-watch : borné (500 lignes, 10 comptes), éclaireur seulement à un poste vu récemment");
  ok(/sondeVendeurDepopOk\(p\.extension_sessions, depuis\)/.test(bhw) && /eclaireurVendeurDepop\(enAttente/.test(bhw) && /\.eq\("id", String\(ecl\.id\)\)\.eq\("status", "needs_user"\)/.test(bhw), "handler-watch : preuve (publication, sonde), sinon UN éclaireur, compare-and-swap");
  const st = lire("src/tabs/StockTab.jsx");
  ok(/if \(attendVendeurDepop\(j\)\) continue;/.test(st), "Stock : ces tâches sortent des lignes par article");
  ok(/const nbVendeurDepop = vendeurDepop\.length \? 1 : 0;/.test(st) && /const nbARegler = [^;\n]*\bnbVendeurDepop\b/.test(st), "« À régler » compte UNE carte, quel que soit le nombre");
  ok(/\{ cle: 'vendeur_plateforme', n: nbVendeurDepop,/.test(st) && /setGesteOuvert\('vendeur_plateforme'\)/.test(st) && /gesteOuvert==='vendeur_plateforme'&&\(/.test(st), "la ligne ouvre l'écran dédié");
  ok(/<EcranVendeurPlateforme lang=\{lang\} platform="depop" nom=\{PLATFORM_LABELS\.depop\} url=\{URL_DEPOP\} attentes=\{vendeurDepop\}/.test(st)
    && /preparerEclaireur=\{\(pf\)=>champsEclaireurVendeurDepop\(pf,'geste',/.test(st), "l'écran reçoit la plateforme, son nom, son adresse et l'écriture de l'éclaireur (règle unique)");
  const murs = st.slice(st.indexOf("const MURS_LEVES_A_LA_RELANCE = ["), st.indexOf("];", st.indexOf("const MURS_LEVES_A_LA_RELANCE = [")));
  ok(/'depop_vendeur',/.test(murs), "« Relancer » une tâche de la carte vaut « c'est fait » (source levée, servie comme éclaireur)");
  const ec = lire("src/stock/EcranVendeurPlateforme.jsx");
  ok(/preparerEclaireur\(eclaireur\.platform_fields\)/.test(ec) && /\.eq\('status', 'needs_user'\)/.test(ec) && /href=\{url\}/.test(ec), "l'écran : « Ouvrir … », « C'est fait » = UN éclaireur, compare-and-swap");
  const code = ec.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
  ok(!/relance la publication/i.test(code) && !/depop/i.test(code), "aucun « relance la publication », aucune plateforme écrite en dur dans l'écran (selftest:stock-refonte)");
  const ar = lire("src/stock/EcranARegler.jsx");
  ok(/vendeur_plateforme: Wallet/.test(ar) && /present\('vendeur_plateforme'\)/.test(ar), "« À régler » : l'icône et la phrase de la ligne");
  const bg = lire("chrome-extension/background.js");
  ok(/const vendeur = typeof r\?\.vendeur\?\.canSell === "boolean" \? r\.vendeur\.canSell : null;/.test(bg) && /depop_vendeur: depop\.vendeur \?\? null/.test(bg) && /fusion\.depop_vendeur = prev\.depop_vendeur \?\? null;/.test(bg), "extension : la sonde remonte canSell (extension_sessions.depop_vendeur)");
}

console.log(ko ? `\n✗ depop-vendeur-mur : ${ko} rouge(s) sur ${n}` : `\n✓ depop-vendeur-mur : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
