// ═══════════════════════════════════════════════════════════════════════════
// PLUS JAMAIS D'ÉCHEC INVISIBLE CÔTÉ SERVEUR — garde (25/10/2026, Nico — Jocabroc)
//   node --import ./scripts/loader-ext.mjs scripts/action-app-ratee-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Nico : « l'app (web et mobile) doit signaler elle-même au serveur CHAQUE action ratée (bouton qui échoue, requête
// refusée, session expirée), avec la version de l'app et le motif » ; « Ajoute une alerte au digest : compte actif
// dont les actions app s'arrêtent net, et actions app en échec ». Ce test prouve :
//   1. la ligne (src/utils/actionRatee.js) : action, motif, build, plateforme — et ses bornes (même motif une fois par
//      2 min, 40 par heure) ;
//   2. le câblage aux gestes : Publier (attente de lecture, publication refusée, rédaction ratée), Republier (unité, lot,
//      retenues de l'app), contact, exceptions non rattrapées, file d'attente sans session ;
//   3. l'écran d'attente de la lecture d'origine : jamais une impasse (lecture immédiate, relecture bornée, ouverture
//      du stepper dès que c'est lu, jamais d'écriture à la place du vendeur) ;
//   4. le digest : les deux alertes, lues par pages (PostgREST coupe à 1 000).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

// Node : pas de Capacitor natif, pas de session — la ligne se teste pure.
globalThis.localStorage = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
const AR = await import("../src/utils/actionRatee.js");

console.log("\n1. La ligne et ses bornes");
{
  AR._remettreBornes();
  const t = Date.parse("2026-10-25T14:00:00Z");
  const l = AR.ligneActionRatee({ action: "publier", motif: "lecture_origine_en_attente", details: { fiche: 17, manque: "description", objet: { a: 1 } } },
    { maintenant: t, build: "2026-10-25T10:22:55Z+d9e1819", plateforme: "web" });
  ok(l && l.action === "publier" && l.motif === "lecture_origine_en_attente" && l.build === "2026-10-25T10:22:55Z+d9e1819" && l.plateforme === "web"
    && l.fiche === 17 && l.manque === "description" && typeof l.objet === "string", "action, motif, build, plateforme et détails courts (objets en texte)");
  ok(AR.ligneActionRatee({ action: "publier", motif: "lecture_origine_en_attente" }, { maintenant: t + 60_000 }) === null, "même action et même motif dans les 2 min : rien (jamais un flot)");
  ok(AR.ligneActionRatee({ action: "publier", motif: "lecture_origine_en_attente" }, { maintenant: t + 121_000 }) !== null, "… après 2 min : de nouveau signalé");
  ok(AR.ligneActionRatee({ action: "republier", motif: "republication_en_pause" }, { maintenant: t + 1000 }) !== null, "une autre action passe tout de suite");
  ok(AR.ligneActionRatee({ action: "" }, { maintenant: t }) === null, "sans action : rien");
  AR._remettreBornes();
  let n = 0;
  for (let i = 0; i < 60; i++) if (AR.ligneActionRatee({ action: "a", motif: `m${i}` }, { maintenant: t + i })) n++;
  ok(n === 40, `40 lignes par heure au plus (${n})`);
  ok(AR.plateformeApp() === "web", "plateforme hors natif : web");
}

console.log("\n2. Le câblage aux gestes");
{
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/signalerActionRatee\(\{ action: 'publier', motif: 'lecture_origine_en_attente'/.test(stock), "Publier (fiche importée pas encore lue) : signalé");
  ok(/motif: repubEnPause \? 'republication_en_pause' : 'republication_deja_en_cours'/.test(stock) && /motif: 'extension_jamais_vue'/.test(stock), "Republier (unité) : chaque retenue de l'app signalée");
  ok((stock.match(/action: 'republier'?_?lot'?/g) ?? []).length >= 1 && /action: 'republier_lot', motif: 'lot_reserve_aux_payants'/.test(stock)
    && /motif: !cibles\.length \? 'aucune_cible' : 'lot_precedent_en_cours'/.test(stock), "Republier (lot) : retenues signalées");
  ok((stock.match(/signalerActionRatee\(\{ action: 'republier(_lot)?', motif: String\(res\.reason \?\? 'refus'\)/g) ?? []).length === 2, "Republier : refus du serveur signalés (unité et lot)");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/signalerActionRatee\(\{ action: "generer_annonce"/.test(lps), "stepper : rédaction ratée signalée");
  ok(/if \(pubErr\) signalerActionRatee\(\{ action: "publier", motif: "rpc_erreur"/.test(lps) && /else if \(pubRes\?\.allowed === false\) signalerActionRatee\(\{ action: "publier", motif: String\(pubRes\.reason/.test(lps), "stepper : publication refusée ou en erreur signalée");
  const app = lire("src/App.jsx");
  ok(/^ecouterEchecsNonRattrapes\(\);$/m.test(app), "exceptions et promesses rejetées non rattrapées : signalées (5 par onglet au plus)");
  ok(/viderEnAttente\(uid\)/.test(app), "les échecs gardés sans session partent au chargement suivant");
  ok(/signalerActionRatee\(\{action:'contact',motif:'session_expiree'\}\)/.test(app) && /signalerActionRatee\(\{action:'contact',motif:`http_\$\{res\.status\}`/.test(app), "contact : session expirée et refus signalés");
  const ar = lire("src/utils/actionRatee.js");
  ok(/EXCEPTIONS_PAR_ONGLET_MAX = 5/.test(ar) && /mettreEnAttente\(\{ \.\.\.metadata, sans_session: true \}\)/.test(ar), "sans session : gardé dans le navigateur, jamais perdu");
}

console.log("\n3. L'écran d'attente de la lecture d'origine : jamais une impasse");
{
  const e = lire("src/publication/AttenteLectureOrigine.jsx");
  const r = lire("src/publication/attenteLectureRegles.js");
  ok(/immediat: true/.test(e) && /RELECTURE_ATTENTE_MS = 6_000/.test(r) && /RELECTURE_ATTENTE_MAX_MS = 5 \* 60_000/.test(r), "une lecture tout de suite, puis toutes les 6 s, 5 min au plus");
  ok(/if \(!a\) \{ await pret\(\); return true; \}/.test(e), "le stepper s'ouvre dès que la règle ne retient plus");
  ok(!/Write my description/.test(e), "jamais « Écrire ma description » pendant l'attente (seulement si l'annonce n'a aucun texte : le stepper le dit)");
  ok(/motif: "lecture_origine_abandonnee"/.test(e), "une attente abandonnée est signalée au serveur");
  ok(/Recharger la page/.test(e) && /Fermer \(la lecture continue\)/.test(e), "issues dites : recharger (pont coupé), fermer (la lecture continue)");
  const tv = lire("src/publication/texteDuVendeur.js");
  ok(/detail\?\.success \? "sans_description" : "vinted_echec"/.test(tv), "lue sans texte : « sans_description » (jamais confondue avec une lecture ratée)");
}

console.log("\n4. Le digest : les deux alertes");
{
  const d = lire("supabase/functions/ops-digest/index.ts");
  ok(/lirePagesUsage\(\["action_app_ratee"\], iso24h\)/.test(d) && /Actions app en échec \(24 h\)/.test(d), "« actions app en échec » (24 h, par action et motif, comptes touchés)");
  ok(/n >= 10 && !depuis\.has\(u\)/.test(d) && /extension_last_seen_at >= iso24h/.test(d) && /s'arrêtent net/.test(d), "« comptes actifs dont les actions app s'arrêtent net » (≥ 10 sur 72 h, 0 sur 24 h, extension vue)");
  ok(/l\.feature === "republish" && String\(l\.metadata\?\.source \?\? ""\) !== "manuel"/.test(d), "une republication automatique n'est pas une action de l'app");
  ok(/\.range\(p \* 1000, p \* 1000 \+ 999\)/.test(d), "lecture par pages de 1 000");
  ok(/actions_app_alertes: actionsAppAlertes\.length/.test(d) && /🔴 Actions app — /.test(d), "compté dans le total et dit dans l'objet du mail");
}

console.log(`\n${rouges ? "✗" : "✓"} action-app-ratee : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
