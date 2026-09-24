// ═══════════════════════════════════════════════════════════════════════════
// PAS DE ROUGE — CONTRÔLE SUR LES VRAIS MESSAGES DU PARC (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Ce contrôle EXÉCUTE le code livré (supabase/functions/_shared/pas-de-rouge.js,
// le fichier même qu'importe update-job-status) sur les messages RÉELLEMENT
// lus en base ce matin — pas sur des exemples réécrits pour l'occasion.
//
// Il vérifie quatre choses, et il échoue bruyamment sinon :
//   1. AUCUNE sortie n'est un échec. Trois statuts, jamais un quatrième.
//   2. AUCUN message ne porte de vocabulaire de développeur — et le motif
//      n'est pas recopié ici : il est LU dans _shared/vocabulaire-developpeur.ts.
//      (Un motif recopié dérive : c'est arrivé le 21/09, 235 formes sur 237
//      requalifiées à tort.)
//   3. Tout « à toi de jouer » porte de quoi jouer : un marqueur que l'app sait
//      transformer en bouton, ou une liste fermée.
//   4. Les messages de connexion commencent par les ANCRES que lisent déjà
//      StockTab (bouton « Me connecter ») et handler-watch (reprise auto). Ces
//      deux regex sont lues dans leurs fichiers, jamais retapées : si l'une
//      bouge, ce contrôle le voit.
//
//   node scripts/pas-de-rouge-selftest.mjs

import { readFileSync } from "node:fs";
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── Le motif de vocabulaire, LU dans son fichier ────────────────────────────
const srcVocab = readFileSync(new URL("../supabase/functions/_shared/vocabulaire-developpeur.ts", import.meta.url), "utf8");
const blocMotifs = /const MOTIFS = \[([\s\S]*?)\n\];/.exec(srcVocab);
if (!blocMotifs) { console.log("✗ MOTIFS introuvable dans vocabulaire-developpeur.ts"); process.exit(1); }
const MOTIFS = blocMotifs[1]
  .split("\n").map((l) => l.trim()).filter((l) => l.startsWith('"'))
  .map((l) => JSON.parse(l.replace(/,\s*$/, "")));
const VOCAB_RE = new RegExp(MOTIFS.join("|"), "i");

// ── Les ancres de connexion, LUES dans leurs fichiers ───────────────────────
function ancres(fichier, nomConst) {
  const src = readFileSync(new URL(fichier, import.meta.url), "utf8");
  const bloc = new RegExp(`const ${nomConst}[^=]*= \\{([\\s\\S]*?)\\n\\s*\\};`).exec(src);
  if (!bloc) throw new Error(`${nomConst} introuvable dans ${fichier}`);
  const out = {};
  for (const m of bloc[1].matchAll(/(\w+):\s*\/(.+?)\/([a-z]*)\s*,/g)) out[m[1]] = new RegExp(m[2], m[3]);
  return out;
}
const ANCRE_APP = ancres("../src/tabs/StockTab.jsx", "MUR_CONNEXION_ANCRE");
const ANCRE_WATCH = ancres("../supabase/functions/handler-watch/index.ts", "MUR_CONNEXION");

// ── LES VINGT LIGNES ROUGES DU 22/09, COPIÉES DE LA BASE ────────────────────
// `brut` = colonne cross_post_jobs.error telle qu'elle était ce matin.
const PARC = [
  { n: 1,  platform: "leboncoin", action: "publish", brut: "Catégorie: panneau des racines introuvable.", attendu: "reprise" },
  { n: 2,  platform: "opla", action: "publish", brut: "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.", attendu: "reprise" },
  { n: 3,  platform: "opla", action: "publish", brut: "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.", attendu: "reprise" },
  { n: 4,  platform: "leboncoin", action: "publish", brut: "Leboncoin ne propose aucune option gratuite pour ce dépôt : son écran « Boostez votre annonce ! » n'affiche que « Valider et payer ».", attendu: "info" },
  { n: 5,  platform: "vinted", action: "republish", brut: "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Les photos ne sont pas arrivées sur Vinted : 0/4 confirmée(s) après 16 s.", attendu: "reprise" },
  { n: 6,  platform: "vinted", action: "republish", brut: "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Les photos ne sont pas arrivées sur Vinted : 0/3 confirmée(s) après 15 s.", attendu: "reprise" },
  { n: 7,  platform: "opla", action: "publish", brut: "Opla : URL présignée refusée pour la photo 1 (HTTP 401)", attendu: "reprise" },
  { n: 8,  platform: "vinted", action: "republish", brut: "Republication en pause AVANT toute suppression : Vinted répond « annonce introuvable » et FillSell n'a pas pu lire quelle boutique est connectée dans Chrome.", attendu: "*" },
  { n: 9,  platform: "vinted", action: "delete", brut: "CHALLENGE Vinted a refusé la suppression : protection anti-robot (HTTP 403, access_denied), ta session est valide.", attendu: "reprise" },
  { n: 10, platform: "opla", action: "publish", brut: "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension.", attendu: "a_toi" },
  { n: 11, platform: "leboncoin", action: "publish", brut: "Leboncoin demande : Univers (« Ce champ est requis »), Produit (la valeur « Autre » n'a pas été reconnue parmi les options Leboncoin).", attendu: "*" },
  { n: 12, platform: "vinted", action: "republish", brut: "Republication en pause AVANT toute suppression : Vinted répond « annonce introuvable » et FillSell n'a pas pu lire quelle boutique est connectée dans Chrome.", attendu: "*" },
  { n: 13, platform: "ebay", action: "publish", brut: "L'état « Neuf sans étiquette » n'existe pas dans la catégorie eBay choisie pour cet article : elle n'est probablement pas la bonne.", attendu: "*" },
  { n: 14, platform: "ebay", action: "publish", brut: "Formulaire eBay non atteint (page actuelle: /lstng/error). categoryId=139971 probablement refusé par /sl/list — vérifier l'id dans src/utils/ebayCategories.js (arbre docs/ebay-categories-raw.txt).", attendu: "*" },
  { n: 15, platform: "opla", action: "publish", brut: "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension.", attendu: "a_toi" },
  { n: 16, platform: "beebs", action: "publish", brut: "Beebs n'a pas de rayon reconnu pour « chaussures clarks wallabee » (le rayon « Mode > Femme > Chaussures (femme) > Baskets (femme) » a été écarté après vérification : il ne correspond pas à l'objet).", attendu: "info" },
  { n: 17, platform: "ebay", action: "publish", brut: "REAUTH VENTE eBay : eBay exige une reconnexion de sécurité pour vendre. Ouvre ebay.fr dans Chrome, clique « Vendre » et reconnecte-toi.", attendu: "a_toi" },
  { n: 18, platform: "ebay", action: "publish", brut: "REAUTH VENTE eBay : eBay exige une reconnexion de sécurité pour vendre. Ouvre ebay.fr dans Chrome, clique « Vendre » et reconnecte-toi.", attendu: "a_toi" },
  { n: 19, platform: "opla", action: "publish", brut: "La taille « 44.5 » n'appartient pas à la grille de « MEN_SNEAKERS » (37 valeurs : 14, 15, 16, 17, 18, 19…). Opla l'accepterait en 200 : on refuse.", attendu: "a_toi",
    pf: { needsUserField: { platform: "opla", field_key: "oplaSizeChoice", field_label: "Taille Opla", input_type: "selection_only", allowed_values: ["40", "41", "42", "43", "44", "45"] } } },
  { n: 20, platform: "opla", action: "publish", brut: "La publication sur Opla attend : l'accès à opla.co a été refusé à l'extension.", attendu: "a_toi" },
  // Motifs supplémentaires du parc, hors des 20 : ils doivent aussi sortir en clair.
  { n: 21, platform: "leboncoin", action: "publish", brut: "update-job-status → HTTP 520", attendu: "reprise" },
  { n: 22, platform: "vinted", action: "republish", brut: "Republication annulée avant toute suppression : Failed to fetch. Ton annonce est intacte.", attendu: "reprise" },
  { n: 23, platform: "ebay", action: "publish", brut: "Cette publication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée.", attendu: "a_toi" },
  { n: 24, platform: "vinted", action: "publish", brut: "Could not establish connection. Receiving end does not exist.", attendu: "reprise" },
  { n: 25, platform: "beebs", action: "publish", brut: "Un imprévu sans signature connue : [object Object] à l'étape 3", attendu: "*" },
];

console.log("\n── 1. Trois sorties, jamais une quatrième ──────────────────────");
const sorties = PARC.map((c) => ({ c, s: classerEchec({ platform: c.platform, action: c.action, brut: c.brut, essais: c.essais ?? 0, pf: c.pf ?? {} }) }));
ok(sorties.every(({ s }) => ["reprise", "a_toi", "info"].includes(s.verdict)), `${sorties.length} messages du parc, 0 verdict hors des trois`);
ok(sorties.every(({ s }) => ["pending", "needs_user", "cancelled"].includes(s.statut)), "aucun statut « failed » produit");
const faux = sorties.filter(({ c, s }) => c.attendu !== "*" && s.verdict !== c.attendu);
ok(faux.length === 0, `verdict attendu tenu sur les lignes nommées${faux.length ? ` — écarts : ${faux.map(({ c, s }) => `#${c.n} ${s.verdict}≠${c.attendu}`).join(", ")}` : ""}`);

console.log("\n── 2. Aucun vocabulaire de développeur à l'écran ───────────────");
const sales = sorties.filter(({ s }) => VOCAB_RE.test(s.message));
ok(sales.length === 0, `${sorties.length} messages passés au motif LU dans vocabulaire-developpeur.ts${sales.length ? ` — fautifs : ${sales.map(({ c, s }) => `#${c.n} « ${VOCAB_RE.exec(s.message)[0]} »`).join(", ")}` : ""}`);
const jargons = [/MEN_SNEAKERS/, /\/lstng/, /HTTP \d{3}/, /présignée/i, /panneau des racines/i, /Failed to fetch/i, /\bcategoryId\b/];
const restes = sorties.filter(({ s }) => jargons.some((r) => r.test(s.message)));
ok(restes.length === 0, `aucun des 7 termes cités par Nico ne ressort${restes.length ? ` — ${restes.map(({ c }) => "#" + c.n).join(", ")}` : ""}`);
ok(sorties.every(({ s }) => !/\bvous\b|\bvotre\b/i.test(s.message)), "tutoiement partout");

console.log("\n── 3. Un « à toi de jouer » a toujours de quoi jouer ───────────");
const aToi = sorties.filter(({ s }) => s.verdict === "a_toi");
const muets = aToi.filter(({ s }) => !s.source && !s.champ);
ok(muets.length === 0, `${aToi.length} « à toi » — tous porteurs d'un marqueur ou d'une liste${muets.length ? ` (muets : ${muets.map(({ c }) => "#" + c.n).join(", ")})` : ""}`);
// « appuie sur « Autoriser Opla » » (2026-09-23, message unique Opla) nomme le
// bouton par son libellé exact : c'est le geste, sans décrire l'écran.
ok(aToi.every(({ s }) => /ci-dessous|relancer|relance-la|choisis|appuie sur/i.test(s.message)), "chaque « à toi » nomme le geste et le situe sous le message");
const opla = sorties.filter(({ s }) => s.motif === "opla_acces");
ok(opla.length === 3 && opla.every(({ s }) => s.source === "opla_acces"), "les 3 lignes Opla portent needs_user_source='opla_acces' (bouton « Autoriser Opla »)");
ok(!opla.some(({ s }) => /rien à faire de ton côté/i.test(s.message)), "le message Opla ne promet plus « rien à faire de ton côté » (c'était faux)");

console.log("\n── 4. Les ancres de connexion, partagées mot pour mot ──────────");
for (const [pf, quoi] of [["ebay", "reauth_ebay"], ["vinted", "connexion"], ["leboncoin", "connexion"], ["beebs", "connexion"]]) {
  const s = classerEchec({
    platform: pf, action: "publish", essais: 0, pf: {},
    brut: pf === "ebay" ? "REAUTH VENTE eBay : reconnexion exigée" : `Connexion ${{ vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs" }[pf]} requise : session perdue`,
  });
  ok(s.motif === quoi && ANCRE_APP[pf].test(s.message) && ANCRE_WATCH[pf].test(s.message),
    `${pf} : le message est reconnu par StockTab (bouton) ET par handler-watch (reprise auto)`);
}
// Le mur arbitré par le serveur sur un 404 indéterminé porte la même ancre.
const murVinted = "Connexion Vinted requise : ton annonce est toujours en ligne, mais le navigateur n'est plus connecté à la boutique qui la porte.";
ok(ANCRE_APP.vinted.test(murVinted) && ANCRE_WATCH.vinted.test(murVinted),
  "le texte écrit par l'arbitrage 404 du serveur porte l'ancre Vinted");

console.log("\n── 5. Ce qui reprend tout seul a une échéance ──────────────────");
const reprises = sorties.filter(({ s }) => s.verdict === "reprise");
ok(reprises.every(({ s }) => s.statut === "pending" && s.dansMinutes > 0), `${reprises.length} reprises, toutes en pending avec un délai`);
ok(reprises.every(({ s }) => !/relance|à toi|complète/i.test(s.message) || /on refait|on reprend|on recommence|on réessaie/i.test(s.message)),
  "une reprise ne demande jamais un geste : elle annonce qu'on s'en charge");
const infos = sorties.filter(({ s }) => s.verdict === "info");
ok(infos.every(({ s }) => s.statut === "cancelled"), `${infos.length} informations neutres, toutes avec le job clos`);
ok(infos.every(({ s }) => !/échec|erreur|impossible de/i.test(s.message)), "une information neutre ne parle jamais d'échec");

console.log("\n── 6bis. LA SONDE DE SESSIONS TRANCHE, DANS LES DEUX SENS ──────");
// (2026-09-23.) Deux faux messages le même jour, opposés et de même famille :
// on affirmait sans mesurer. Ces cas figent la règle : quand la sonde a vu,
// c'est elle qui parle ; quand elle n'a rien vu, rien ne change.
{
  // (a) meminiandmove, 23/09 : ses publications Opla tournaient en reprise
  //     pendant que la sonde disait 401 ; on en avait conclu « à autoriser ».
  //     Le 24/09, MESURÉ sur quinze comptes (Nico : poste autorisé, relevé
  //     réussi la veille ; xxewwer : relevé réussi 21:21, 401 à 21:39 ;
  //     nadegemarcelin78, van-breugel.sandra…), le 401 du service worker ne
  //     prouve RIEN : ni permission manquante, ni session fermée. Il ne classe
  //     donc rien — l'échec se juge sur son motif brut, comme sans sonde.
  //     Seule la PAGE prouve une session fermée (b'), seul le marqueur du
  //     poste prouve une permission manquante (règle 1).
  const oplaSonde401 = classerEchec({
    platform: "opla", action: "publish", essais: 2, pf: {},
    brut: "Could not establish connection. Receiving end does not exist.",
    sessions: { opla: false, http: { opla: 401 } },
  });
  ok(oplaSonde401.verdict === "reprise" && oplaSonde401.statut === "pending" && !oplaSonde401.source,
    "Opla sonde 401 → ne prouve rien : reprise espacée sur le motif brut, ni « Autoriser Opla » ni « Me connecter » (règle du 24/09)");
  ok(!/Autoriser Opla|Me connecter/.test(oplaSonde401.message),
    "le message ne demande aucun geste que la sonde ne peut pas justifier");
  // (b') la page de connexion VUE par l'onglet — le seul signal qui prouve.
  const oplaPageVue = classerEchec({
    platform: "opla", action: "publish", essais: 2, pf: {},
    brut: "Could not establish connection. Receiving end does not exist.",
    sessions: { opla: false, http: { opla: "login_redirect_observee" } },
  });
  ok(oplaPageVue.verdict === "a_toi" && oplaPageVue.source === "connexion" && /^Connexion Opla requise/.test(oplaPageVue.message),
    "Opla page de connexion VUE par l'onglet → « Me connecter » (connexion), jamais « Autoriser Opla »");

  // (b) van-breugel.sandra : « connecte-toi sur vinted.fr » avec http.vinted
  //     = 200 relevé deux minutes plus tôt.
  const vintedVivant = classerEchec({
    platform: "vinted", action: "republish", essais: 0, pf: {},
    brut: "session Vinted refusée (HTTP 403)",
    sessions: { vinted: true, http: { vinted: 200 } },
  });
  ok(vintedVivant.verdict === "reprise" && vintedVivant.statut === "pending",
    "Vinted sonde 200 → reprise, jamais « connecte-toi » à quelqu'un de connecté");
  ok(vintedVivant.dansMinutes >= 45,
    "la reprise est ESPACÉE : re-tenter tout de suite re-tape la porte qui vient de se fermer");
  ok(!/connecte-toi|me connecter/i.test(vintedVivant.message),
    "aucun geste de connexion demandé quand la connexion est bonne");

  // (c) Une session RÉELLEMENT perdue garde son message, intact.
  const vintedMort = classerEchec({
    platform: "vinted", action: "republish", essais: 0, pf: {},
    brut: "session Vinted refusée (HTTP 401)",
    sessions: { vinted: false, http: { vinted: 401 } },
  });
  ok(vintedMort.verdict === "a_toi" && vintedMort.source === "connexion"
     && ANCRE_APP.vinted.test(vintedMort.message) && ANCRE_WATCH.vinted.test(vintedMort.message),
    "sonde déconnectée → « Connexion Vinted requise », ancres intactes (bouton + reprise auto)");

  // (d) SANS sonde, et avec une sonde INDÉTERMINÉE (null), rien ne change :
  //     ne rien savoir n'autorise rien, dans aucun des deux sens.
  const avant = classerEchec({ platform: "vinted", action: "republish", essais: 0, pf: {}, brut: "session Vinted refusée (HTTP 401)" });
  const indetermine = classerEchec({ platform: "vinted", action: "republish", essais: 0, pf: {}, brut: "session Vinted refusée (HTTP 401)", sessions: { vinted: null, http: { vinted: null } } });
  ok(avant.verdict === "a_toi" && indetermine.verdict === "a_toi" && avant.message === indetermine.message,
    "sonde absente ou indéterminée → comportement d'avant, mot pour mot");
  const oplaSansSonde = classerEchec({ platform: "opla", action: "publish", essais: 2, pf: {}, brut: "Could not establish connection." });
  ok(oplaSansSonde.verdict === "reprise", "sans sonde, Opla reste une reprise (on n'invente pas un geste)");
}

console.log("\n── 6. Un motif inconnu ne vire jamais au rouge ─────────────────");
for (const essais of [0, 1, 2, 3, 9]) {
  const s = classerEchec({ platform: "vinted", action: "publish", brut: "quelque chose que personne n'a nommé", essais, pf: {} });
  ok(["reprise", "a_toi"].includes(s.verdict) && s.statut !== "failed",
    `essais=${essais} → ${s.verdict}/${s.statut}${s.verdict === "a_toi" ? " (bouton Relancer)" : ""}`);
}

console.log("\n── 7. Vinted rayon « neuf seulement » : jamais clos (24/09, correctif du matin retiré) ──");
{
  // Un casque d'occasion se vend sur Vinted : c'est le RAYON qui était mauvais.
  // L'ancienne phrase (extensions ≤ 0.6.65) ne clôt plus aucun job.
  const brut = "Vinted n'accepte que des articles neufs dans ce rayon (Neuf avec étiquette). Ton article est « Bon état » : il ne peut pas y être publié. C'est une règle de Vinted, pas une information à compléter. Tes autres plateformes ne sont pas concernées.";
  const s = classerEchec({ platform: "vinted", action: "publish", brut, essais: 0, pf: {} });
  ok(s.motif !== "vinted_neuf_seulement" && s.statut !== "cancelled", "l'ancienne phrase ne clôt plus rien");
}

console.log(ko === 0 ? "\n✅ PAS DE ROUGE : tout est vert.\n" : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
