// VERROU (13/11/2026, point 3b de Nico — extension 0.6.187) : LA PAGE DES VENTES BEEBS LUE SANS 403, ET PLUS SEULEMENT À
// UNE DISPARITION.
//
//     npm run selftest:ventes-beebs-lecture-due
//     VERROU_AVANT=1 npm run selftest:ventes-beebs-lecture-due   (l'extension de HEAD : les défauts, en rouge)
//
// Constat (prod, lecture seule, 10 → 12/11) : 36 échecs de lecture sur 11 comptes — 34 « http_403 », 2 « onglet figé » ;
// de63ca45 : 13 refus et 5 lectures sans commande ; 3f91c02e, 90ace0e4, afeef3c7, ca9afe24 : aucune lecture réussie. Causes :
//   (a) la FORME de la requête (« RSC: 1 » seul + cache coupé), que l'anti-robot de Beebs refuse par moments, alors qu'un
//       fetch simple de la même famille de pages passe (« Mes annonces » : 1 448 fois sur 1 448) ;
//   (b) une lecture refusée, ou demandée dans les 30 min d'une autre, était JETÉE (l'heure notée avant la lecture) et
//       aucune autre ne partait sans nouvelle disparition — a99e2876 (12/11 19:25) : la page lue à la disparition ne
//       portait pas encore la commande, rien ne l'aurait relue.
// Ce que le verrou exige :
//   A. le lecteur : le document par un fetch simple ; renvoi vers la connexion = « session_absente », jamais « 0 commande » ;
//      un refus = bot, sans seconde requête ; filet RSC sans cache coupé ;
//   B. la lecture due (règles pures de background.js) : une marque gardée jusqu'à une lecture réussie ; 30 min entre deux
//      lectures (heure notée APRÈS) ; refus anti-robot → 6 h, 24 h si récidive (règle de la messagerie, Q19 de Nico) ;
//      session absente → la marque tombe, aucune boucle ; une lecture d'ENTRETIEN par 24 h pour un compte qui suit des
//      annonces Beebs (la commande parue après la disparition est lue) ; rejeux de de63ca45 et a99e2876 ;
//   C. le câblage : marque posée à la disparition, lecture à chaque cycle, pause de la messagerie respectée, coupure dans
//      la seule sous-clé « beebs » de veille_commandes_etat — levée par l'orchestrateur Cloud ; trace enrichie dans les
//      DEUX voies ; onglet Beebs réveillé ici seulement (workTabForFetch inchangé) ; aucun setInterval.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AVANT = process.env.VERROU_AVANT === "1";
const lire = (p) => (AVANT ? execFileSync("git", ["-C", ROOT, "show", `HEAD:${p}`], { encoding: "utf8", maxBuffer: 64 << 20 }) : fs.readFileSync(join(ROOT, p), "utf8")).replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };
const BG = lire("chrome-extension/background.js");
const MS = lire("chrome-extension/messagerie.js");
const fonction = (src, nom) => {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let j = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};
const charger = (nom) => { const f = fonction(BG, nom); return f ? new Function(`${f}; return ${nom};`)() : null; };
if (AVANT) console.log("(VERROU_AVANT : l'extension de HEAD)");

// ── A. Le lecteur ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("A. Le lecteur de la page des ventes");
const g = {};
new Function("globalThis", "self", MS)(g, g);
const M = g.FILLSELL_MESSAGERIE;
globalThis.location = { href: "https://www.beebs.app/fr/account/orders/list/seller", origin: "https://www.beebs.app" };
const LISTE = "/fr/account/orders/list/seller";
const appels = [];
async function site(page, f) {
  const f0 = globalThis.fetch, t0 = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  globalThis.fetch = async (url, init) => {
    appels.push({ url: String(url), entetes: Object.keys(init?.headers ?? {}), cache: init?.cache ?? null });
    const rsc = init?.headers?.RSC === "1";
    return { status: (rsc ? page.statusRsc : null) ?? page.status ?? 200, url: `https://www.beebs.app${page.finale ?? url}`,
      headers: { get: (n) => (page.entetes ?? {})[String(n).toLowerCase()] ?? null }, text: async () => (rsc ? page.rsc ?? "" : page.html ?? "") };
  };
  try { appels.length = 0; return await f(); } finally { globalThis.fetch = f0; globalThis.setTimeout = t0; }
}
const FLUX = '0:{"P":null,"c":["","fr","account","orders","list","seller"]}\n7c:{"id":1723956,"status":"LABEL_PRINTED","created_at":"2026-11-09T09:11:00.000Z","products":[{"id":34200615,"price":1.5}],"amount":1.5}\n7d:["$","$L5a","1723956",{"order":"$7c","isSale":true}]\n';
const DOC = `<html><head><script src="https://js.datadome.co/tags.js"></script></head><body><script>self.__next_f.push([1,${JSON.stringify(FLUX.slice(0, 50))}])</script><script>self.__next_f.push([1,${JSON.stringify(FLUX.slice(50))}])</script></body></html>`;
const lecteur = M.LECTEURS.beebs.commandes;
const r1 = await site({ html: DOC, rsc: FLUX }, () => lecteur([], 5));
ok(r1.ok === true && r1.commandes?.length === 1 && appels.length === 1 && appels[0].entetes.length === 0 && appels[0].cache === null,
  "la liste se lit comme une PAGE : le document, un fetch simple (aucun en-tête ajouté, cache par défaut) — 1 requête", { r1: { ok: r1.ok, motif: r1.motif }, appels });
const r2 = await site({ html: DOC, finale: "/fr/auth" }, () => lecteur([], 5));
ok(r2.ok === false && r2.motif === "session_absente", "renvoyée vers la connexion : « session_absente », jamais « 0 commande »", r2);
const r3 = await site({ status: 403, html: "<html>captcha-delivery</html>", entetes: { "x-datadome": "1" } }, () => lecteur([], 5));
ok(r3.ok === false && r3.bot === true && appels.length === 1 && r3.diag?.datadome === true, "403 : refus (bot), aucune seconde requête, la réponse est décrite (DataDome)", { r3, appels });
const r4 = await site({ html: "<html><body>Mes ventes</body></html>", rsc: FLUX }, () => lecteur([], 5));
ok(r4.ok === true && r4.forme === "rsc" && appels.length === 2 && appels[1].cache === null, "document sans flux : UNE relecture RSC (filet), jamais de cache coupé", { r4: { ok: r4.ok, forme: r4.forme }, appels });

// ── B. La lecture due (règles pures) ─────────────────────────────────────────────────────────────────────────────────
console.log("B. La lecture due : gardée, cadencée, jamais en boucle");
const demande = charger("demandeLectureVentesBeebs");
const decision = charger("decisionLectureVentesBeebs");
const issue = charger("issueLectureVentesBeebs");
ok(!!demande && !!decision && !!issue, "background.js porte les trois règles pures (demande, décision, issue)");
if (demande && decision && issue) {
  const MIN = 60_000, H = 60 * MIN, J = 24 * H, T0 = Date.parse("2026-11-12T18:25:00Z");
  // 1. La demande dans les 30 min d'une autre lecture est GARDÉE puis servie (avant : jetée).
  let e = { dernier_essai: T0 - 10 * MIN, dernier_succes: T0 - 10 * MIN };
  e = demande(e, "disparition", T0);
  let d = decision(e, { maintenant: T0 });
  ok(d.lire === false && d.motif === "moins_de_30_min" && d.etat.due?.raison === "disparition", "demande à 10 min d'une lecture : pas de lecture, la marque est GARDÉE", d);
  d = decision(d.etat, { maintenant: T0 + 21 * MIN });
  ok(d.lire === true, "30 min après la dernière lecture : elle part", d);
  // 2. Réussite : la marque tombe.
  let x = issue(d.etat, { ok: true, commandes: [] }, { maintenant: T0 + 21 * MIN });
  ok(x.etat.due === null && x.etat.dernier_succes === T0 + 21 * MIN && x.coupee === null, "lecture réussie : la marque tombe, l'heure est notée APRÈS la lecture", x);
  // 3. Refus anti-robot : 6 h, puis 24 h si récidive dans les 24 h ; la marque reste.
  e = demande({}, "disparition", T0);
  x = issue(e, { ok: false, bot: true, http: 403, motif: "http_403" }, { maintenant: T0 });
  ok(x.etat.due && x.coupee && x.coupee.jusqu - T0 === 6 * H && x.coupee.recidive === false, "1er refus 403 : pause de 6 h, la marque est gardée", x);
  d = decision(x.etat, { maintenant: T0 + 5 * H, pauseJusqu: x.coupee.jusqu });
  ok(d.lire === false && d.motif === "pause_anti_robot", "pendant la pause : rien ne part", d);
  const x2 = issue(decision(x.etat, { maintenant: T0 + 6 * H + MIN, pauseJusqu: x.coupee.jusqu }).etat, { ok: false, bot: true, http: 403, motif: "http_403" }, { maintenant: T0 + 6 * H + MIN, coupeeAvant: x.coupee });
  ok(x2.coupee.jusqu - (T0 + 6 * H + MIN) === 24 * H && x2.coupee.recidive === true, "récidive dans les 24 h : pause de 24 h (règle de la messagerie)", x2.coupee);
  const x3 = issue(e, { ok: false, bot: true, http: 403 }, { maintenant: T0 + 30 * H, coupeeAvant: x.coupee });
  ok(x3.coupee.jusqu - (T0 + 30 * H) === 6 * H, "un refus plus de 24 h après le précédent : 6 h de nouveau", x3.coupee);
  // 4. Session absente : la marque tombe, aucune relance avant 24 h (jamais une boucle).
  x = issue(demande({}, "disparition", T0), { ok: false, motif: "session_absente", http: 200 }, { maintenant: T0 });
  ok(x.etat.due === null && x.etat.dernier_abandon === T0 && x.coupee === null, "session absente : la marque tombe (tracée), aucune pause", x);
  ok(decision(x.etat, { maintenant: T0 + 23 * H, beebsSuivie: true }).lire === false && decision(x.etat, { maintenant: T0 + 24 * H + MIN, beebsSuivie: true }).lire === true,
    "… et la lecture d'entretien ne revient que 24 h plus tard");
  // 5. Échec passager (onglet figé) : la marque reste, 30 min entre deux essais ; 24 h au plus.
  x = issue(demande({}, "disparition", T0), { ok: false, motif: "onglet_fige" }, { maintenant: T0 });
  ok(x.etat.due?.essais === 1 && decision(x.etat, { maintenant: T0 + 29 * MIN }).lire === false && decision(x.etat, { maintenant: T0 + 31 * MIN }).lire === true,
    "onglet figé : la marque reste, nouvel essai 30 min après", x.etat);
  const vieille = decision(x.etat, { maintenant: T0 + 24 * H + MIN });
  ok(vieille.lire === false && vieille.etat.due === null && vieille.etat.dernier_abandon === T0 + 24 * H + MIN, "une marque de plus de 24 h tombe (une vente de plus de 24 h n'envoie jamais de mail)", vieille);
  // 6. Entretien : un compte qui suit des annonces Beebs, aucune disparition.
  ok(decision({}, { maintenant: T0, beebsSuivie: true }).lire === true && decision({}, { maintenant: T0, beebsSuivie: false }).lire === false,
    "lecture d'ENTRETIEN : due pour un compte qui suit des annonces Beebs, jamais pour un autre");
  ok(decision({ dernier_succes: T0 - 23 * H, dernier_essai: T0 - 23 * H }, { maintenant: T0, beebsSuivie: true }).lire === false, "une lecture réussie il y a 23 h : pas d'entretien");

  // 7. Rejeu de de63ca45 (10 → 12/11 : 13 refus 403) : chaque cycle de 2 min pendant 48 h, Beebs refuse toujours.
  let etat = {}, coupee = null, requetes = 0;
  for (let t = T0; t < T0 + 48 * H; t += 2 * MIN) {
    if (t === T0 || (t - T0) % (5 * H) === 0) etat = demande(etat, "disparition", t);   // une disparition toutes les 5 h
    const dd = decision(etat, { maintenant: t, beebsSuivie: true, pauseJusqu: Number(coupee?.jusqu) || 0 });
    etat = dd.etat;
    if (!dd.lire) continue;
    requetes++;
    const ii = issue(etat, { ok: false, bot: true, http: 403, motif: "http_403" }, { maintenant: t, coupeeAvant: coupee });
    etat = ii.etat; if (ii.coupee) coupee = ii.coupee;
  }
  // Attendu, la règle de la messagerie à l'identique (récidive = un refus dans les 24 h du précédent) : T0 (6 h), T0+6 h
  // (récidive : 24 h), T0+30 h (le précédent a 24 h : 6 h), T0+36 h (récidive : 24 h) — 4 requêtes en 48 h (avant : une
  // par disparition, 10 en 48 h, sans aucune pause).
  ok(requetes === 4, `de63ca45 rejoué (refus permanent, 48 h, une disparition toutes les 5 h) : ${requetes} requête(s) — 6 h, 24 h, 6 h, 24 h ; jamais une boucle`, requetes);
  // 8. Rejeu de a99e2876 (12/11 19:25) : la page lue à la disparition ne portait pas encore la commande ; elle paraît
  //    3 h plus tard, sans nouvelle disparition. Une lecture d'entretien la lit dans les 24 h (avant : jamais).
  etat = demande({}, "disparition", T0);
  let lue = null;
  for (let t = T0; t < T0 + 30 * H; t += 2 * MIN) {
    const dd = decision(etat, { maintenant: t, beebsSuivie: true });
    etat = dd.etat;
    if (!dd.lire) continue;
    const commandeParue = t >= T0 + 3 * H;
    if (commandeParue && lue == null) lue = t;
    etat = issue(etat, { ok: true, commandes: commandeParue ? [{ id: "nouvelle" }] : [] }, { maintenant: t }).etat;
  }
  ok(lue != null && lue - T0 <= 24 * H + 2 * MIN, `a99e2876 rejoué : la commande parue après la disparition est lue ${lue == null ? "JAMAIS" : `${Math.round((lue - T0) / H)} h après`}`, lue);
}

// ── C. Le câblage ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("C. Le câblage");
const corps = (nom) => { const f = fonction(BG, nom); return f ?? ""; };
const LIRE = corps("lireVentesBeebsSiDue");
ok(/if \(ventesBeebsALire\) await demanderLectureVentesBeebs\(session, "disparition"\)/.test(BG), "une disparition pose la marque (plus de lecture jetée)");
const iCheck = BG.indexOf("await checkPublishedListings(session).catch((e) =>\n    console.error(\"[background] checkPublishedListings:\", e)");
const iLire = BG.indexOf("await lireVentesBeebsSiDue(session, { beebsSuivie:", iCheck);
ok(iCheck > 0 && iLire > iCheck && iLire - iCheck < 900, "la lecture part à CHAQUE cycle, juste après le veilleur (pas seulement au cycle d'une disparition)");
ok(/beebs\?\.coupee/.test(LIRE) && /lireEtatMessagerie\(\)\)\?\.beebs\?\.coupee/.test(LIRE), "pause anti-robot de la lecture ET pause Beebs de la messagerie respectées");
ok(LIRE.indexOf("executerDansOngletPlateforme(\"beebs\"") > 0 && LIRE.indexOf("issueLectureVentesBeebs(") > LIRE.indexOf("executerDansOngletPlateforme(\"beebs\""),
  "l'heure de la lecture est notée APRÈS la lecture");
ok(/await ecrireEtatVeilleCommandes\(\{ \.\.\.veille, beebs: \{ \.\.\.\(veille\?\.beebs \?\? \{\}\), coupee \} \}\)/.test(corps("poserCoupureVentesBeebs")),
  "la coupure s'écrit dans la seule sous-clé « beebs » de veille_commandes_etat (Vinted et Leboncoin intacts)");
ok(/feature: "ventes_beebs_lecture_echec"/.test(LIRE) && /voie, etape: cmd\?\.etape/.test(LIRE) && /diag: cmd\?\.diag/.test(LIRE),
  "trace d'échec enrichie (voie, étape, forme, adresse finale, diag, essai, pause)");
ok(/if \(platform === "beebs"\) await tracerRefusVentesBeebs\(token, cmd, "messagerie"\);/.test(BG) && /feature: "ventes_beebs_lecture_echec"/.test(corps("tracerRefusVentesBeebs")),
  "la voie messagerie (comptes bêta, Cloud) trace aussi ses refus");
ok(/lectureVentesBeebsReussie\(token, cmd\)/.test(BG), "une lecture réussie par la messagerie fait tomber la marque");
ok(/M\.LECTEURS\.beebs\.commandes, \[\[\], M\.COMMANDES_DETAILS_MAX, null, Number\(d\.etat\.commandes_vues\) > 0\]/.test(LIRE)
  && /if \(cmd\.ecart\) \{[\s\S]*?tracerRefusVentesBeebs\(token, \{ \.\.\.cmd, motif: "ecart_document_sans_commande" \}, voie\)/.test(LIRE),
  "filet d'écart : la lecture dit au lecteur qu'elle attend des commandes (la dernière en portait) ; un écart est tracé");
if (issue) {
  const v = issue({}, { ok: true, commandes: [{}, {}] }, { maintenant: 1 });
  ok(v.etat.commandes_vues === 2 && issue(v.etat, { ok: true }, { maintenant: 2 }).etat.commandes_vues === 2, "le nombre de commandes lues est gardé (rien de lu : inchangé)", v.etat);
}
ok(/ongletBeebsEveille\(\)/.test(LIRE) && /getOrCreateWorkTab\("beebs", "https:\/\/www\.beebs\.app\/"\)/.test(corps("ongletBeebsEveille")),
  "onglet Beebs déchargé ou ailleurs : réveillé sur l'accueil, ici seulement");
ok(/if \(\(platform === "vinted" \|\| platform === "opla" \|\| platform === "depop"\) && tab\.discarded\)/.test(BG), "workTabForFetch inchangé (la veille Beebs ne change pas)");
const section = BG.slice(BG.indexOf("// ── (18/10, lot 4) LES VENTES BEEBS"), BG.indexOf("/** Le drapeau bêta du compte"));
ok(section.length > 0 && !/setInterval\(/.test(section), "aucun setInterval");
// L'orchestrateur Cloud lève la coupure Beebs de la veille (serveur-cloud/src/pausesMessagerie.js, inchangé).
const { expressionLeverCoupures, CLES_ETAT_EXTENSION } = await import(pathToFileURL(join(ROOT, "serveur-cloud/src/pausesMessagerie.js")).href);
const stock = { veille_commandes_etat: { vinted: { prochain: 1 }, beebs: { coupee: { le: "x", jusqu: Date.now() + 3600_000, motif: "ventes_http_403" } } } };
const chrome = { storage: { local: { get: async (cles) => Object.fromEntries(cles.map((k) => [k, stock[k]])), set: async (o) => Object.assign(stock, o) } } };
const levees = await new Function("chrome", `return ${expressionLeverCoupures(["beebs"])};`)(chrome);
ok(CLES_ETAT_EXTENSION.includes("veille_commandes_etat") && !stock.veille_commandes_etat.beebs.coupee && stock.veille_commandes_etat.vinted.prochain === 1
  && JSON.stringify(levees) === JSON.stringify({ veille_commandes_etat: ["beebs"] }), "Cloud : une vérification réussie lève la coupure (orchestrateur inchangé), rien d'autre touché", levees);

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
