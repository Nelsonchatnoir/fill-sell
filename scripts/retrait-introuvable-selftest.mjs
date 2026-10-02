// Autotest — un retrait introuvable se conclut sur DEUX relevés complets —
// `npm run selftest:retrait-introuvable` (_shared/retrait-introuvable.js).
// Décision de Nico (02/10). Formes et dates RELEVÉES en base le 02/10 :
//   · xxewwer d2e7799e (Beebs, sans numéro, créé le 25/09) : relevés complets
//     30/09 13:04 (40/40) et 01/10 22:29 (41/41), toutes les annonces reliées ;
//   · xxewwer 435df0a2 (créé le 01/10 22:40) : aucun relevé depuis ;
//   · seghirdeborah711 708098ab : relevés 01/10 14:07 (1/1) et 22:11 (0/0) ;
//     la seule annonce (34080027) est reliée à un autre dépôt, et vendue ;
//   · ornellaracano 52c13161 : 34084113 en ligne, reliée à rien ;
//   · nicolas.menar be0395a6 (eBay 377453677328) : EN LIGNE au relevé du 01/10.
import { jugerRetraitIntrouvable, releveComplet, neeApresLeDepot, messageRetraitSansNumeroAToi,
  RETRAIT_SANS_NUMERO_GESTE_MS, RETRAIT_SANS_NUMERO_RELEVE_MS } from "../supabase/functions/_shared/retrait-introuvable.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const R = (at, vus, tot, extra = {}) => ({ status: "done", started_at: at, items_vus: vus, total_entries: tot, erreur: "[défilement] page : …", ...extra });
const retraitBeebs = (id, cree) => ({ id, action: "delete", platform: "beebs", created_at: cree, listing_url: null, platform_listing_id: null });

console.log("\n1. CE QUI EST UN RELEVÉ COMPLET");
ok(releveComplet(R("2026-10-01T20:29:02Z", 41, 41)), "41/41 done");
ok(releveComplet(R("2026-10-01T20:11:59Z", 0, 0)), "0/0 done (compte vide)");
ok(!releveComplet(R("2026-09-29T20:20:58Z", 29, 29, { erreur: "[incomplet] relevé interrompu après la lecture de la liste" })), "« [incomplet] » ne compte pas");
ok(!releveComplet({ status: "expired", started_at: "2026-09-29T20:51:01Z", items_vus: 0, total_entries: null }), "demande jamais réclamée : ne compte pas");
ok(!releveComplet(R("2026-10-01T20:29:02Z", 30, 41)), "30/41 : incomplet");

console.log("\n2. SANS NUMÉRO — XXEWWER, DEBORAH, ORNELLA");
const annoncesXx = Array.from({ length: 41 }, (_, i) => ({ listing_id: String(34013018 + i), job_id: `job-${i}`, inventaire_id: 1789717 + i, vu_le: "2026-10-01T20:29:30Z", statut_plateforme: "en_ligne" }));
const vXx = jugerRetraitIntrouvable(retraitBeebs("d2e7799e", "2026-09-25T17:02:03Z"), {
  releves: [R("2026-10-01T20:29:02Z", 41, 41), R("2026-09-30T11:04:17Z", 40, 40), R("2026-09-29T11:04:24Z", 40, 40)],
  annonces: annoncesXx, depotId: "89f4c4b9-f92b-4052-aaab-44501dcd6308",
});
ok(vXx?.verdict === "deja_retire" && vXx.releves.length === 2, "xxewwer d2e7799e : deux relevés complets, tout est relié → rien à retirer", JSON.stringify(vXx));
ok(/Rien à retirer sur Beebs/.test(vXx.message) && /ne compte pas dans tes limites/.test(vXx.message) && !/titre/.test(vXx.message.replace("titre", "")), "message vrai : relevés datés, quota rendu");
const vXx2 = jugerRetraitIntrouvable(retraitBeebs("435df0a2", "2026-10-01T20:40:08Z"), {
  releves: [R("2026-10-01T20:29:02Z", 41, 41), R("2026-09-30T11:04:17Z", 40, 40)], annonces: annoncesXx,
});
ok(vXx2?.verdict === "attente" && /0\/2 à ce jour/.test(vXx2.message), "xxewwer 435df0a2 : aucun relevé depuis sa création → attente, 0/2");
ok(/jamais par son titre/.test(vXx2.message) && /Chrome soit ouvert/.test(vXx2.message), "attente : message vrai, pas d'attente sans motif");
const vDeb = jugerRetraitIntrouvable(retraitBeebs("708098ab", "2026-09-30T21:45:09Z"), {
  releves: [R("2026-10-01T20:11:59Z", 0, 0), R("2026-10-01T12:07:50Z", 1, 1), R("2026-09-30T20:26:14Z", 1, 1)],
  annonces: [{ listing_id: "34080027", job_id: "a61f644d-64bf-46c6-ab5c-d557ee45d2be", inventaire_id: null, vu_le: "2026-10-01T12:08:05Z", retiree_le: "2026-10-01T12:14:00Z", statut_plateforme: "vendue" }],
  depotId: "54b26927-0000-0000-0000-000000000000",
});
ok(vDeb?.verdict === "deja_retire", "Deborah : relevés 1/1 puis 0/0, la seule annonce est reliée ailleurs et vendue → rien à retirer", JSON.stringify(vDeb));
const vOrn = jugerRetraitIntrouvable(retraitBeebs("52c13161", "2026-09-30T20:25:16Z"), {
  releves: [R("2026-10-02T07:15:24Z", 29, 29), R("2026-10-01T17:33:17Z", 29, 29)],
  annonces: [
    { listing_id: "34066073", job_id: "j1", inventaire_id: 1, vu_le: "2026-10-02T07:15:40Z", statut_plateforme: "en_ligne" },
    { listing_id: "34084113", job_id: null, inventaire_id: null, vu_le: "2026-10-02T07:15:40Z", statut_plateforme: "en_ligne" },
  ],
});
ok(vOrn?.verdict === "non_reliee" && vOrn.nonReliees?.[0] === "34084113", "Ornella : une annonce libre (34084113) → on ne conclut rien, on la nomme");
ok(/n° 34084113/.test(vOrn.message) && /jamais une annonce sur son seul titre/.test(vOrn.message), "message vrai, par numéro");
const vRetard = jugerRetraitIntrouvable(retraitBeebs("x", "2026-09-30T20:25:16Z"), {
  releves: [{ status: "failed", started_at: "2026-10-02T08:00:00Z", items_vus: 0, total_entries: null, erreur: "[incomplet]" }, R("2026-10-02T07:15:24Z", 29, 29), R("2026-10-01T17:33:17Z", 29, 29)],
  annonces: [],
});
ok(vRetard?.verdict === "attente", "le dernier relevé a échoué : ils ne sont plus consécutifs → on attend le suivant");
const vEnLigne = jugerRetraitIntrouvable(retraitBeebs("y", "2026-09-30T20:25:16Z"), {
  releves: [R("2026-10-02T07:15:24Z", 29, 29), R("2026-10-01T17:33:17Z", 29, 29)],
  annonces: [{ listing_id: "34099999", job_id: "depot-y", inventaire_id: 5, vu_le: "2026-10-02T07:15:40Z", statut_plateforme: "en_ligne" }],
  depotId: "depot-y",
});
ok(vEnLigne === null, "le dépôt est en ligne par son numéro : rien à conclure (le lien viendra)");

console.log("\n3. AVEC UN NUMÉRO — DOUDOU NALA (eBay)");
const doudou = { id: "be0395a6", action: "delete", platform: "ebay", created_at: "2026-09-27T18:27:25Z", platform_listing_id: "377453677328", listing_url: "https://www.ebay.fr/itm/377453677328" };
const relevesEbay = [R("2026-10-01T20:12:52Z", 6, 6), R("2026-09-30T20:13:14Z", 3, 3)];
ok(jugerRetraitIntrouvable(doudou, { releves: relevesEbay, annonces: [{ listing_id: "377453677328", job_id: "3d15b872", inventaire_id: 1790843261111, vu_le: "2026-10-01T20:12:59Z", statut_plateforme: "en_ligne" }] }) === null,
  "en ligne au relevé du 01/10 → rien n'est conclu (la question « Déjà vendu ? » décide)");
const absente = jugerRetraitIntrouvable(doudou, { releves: relevesEbay, annonces: [{ listing_id: "377453677328", vu_le: "2026-09-29T20:00:00Z", statut_plateforme: "en_ligne" }] });
ok(absente?.verdict === "deja_retire" && absente.numero === "377453677328" && /n° 377453677328/.test(absente.message), "absente des deux relevés → déjà retirée, par son numéro");
ok(jugerRetraitIntrouvable({ ...doudou, platform: "vinted" }, { releves: relevesEbay, annonces: [] }) === null, "Vinted : hors de cette règle (son propre circuit)");

console.log("\n4. NÉE APRÈS LE DÉPÔT — ORNELLA, RELEVÉS RÉELS DU 02/10 (point 1)");
// Robes déposées le 20/09 (e643e13d publié 17:32:01Z, bcc3b32a 09:20:17Z) ;
// 34084113 vue pour la première fois au relevé du 01/10 17:33Z ; relevés
// complets avant elle : 30/09 07:30Z et 18:12Z (29/29) ; 29/09 20:20Z incomplet.
const relevesOrn = [
  R("2026-10-02T07:15:24Z", 29, 29), R("2026-10-01T17:33:17Z", 29, 29), R("2026-09-30T18:12:10Z", 29, 29),
  R("2026-09-30T07:30:05Z", 29, 29), { status: "expired", started_at: "2026-09-29T20:51:01Z", items_vus: 0, total_entries: null },
  R("2026-09-29T20:20:58Z", 29, 29, { erreur: "[incomplet] relevé interrompu" }), R("2026-09-29T05:48:00Z", 29, 29),
];
const annoncesOrn = [
  { listing_id: "34066073", job_id: "j1", inventaire_id: 1, vu_le: "2026-10-02T07:15:40Z", statut_plateforme: "en_ligne", created_at: "2026-09-28T13:39:00Z" },
  { listing_id: "34084113", job_id: null, inventaire_id: null, vu_le: "2026-10-02T07:15:40Z", statut_plateforme: "en_ligne", created_at: "2026-10-01T17:33:25Z" },
];
const robe = jugerRetraitIntrouvable(retraitBeebs("52c13161", "2026-09-30T20:25:16Z"), {
  releves: relevesOrn, annonces: annoncesOrn, depotId: "e643e13d-2165-4c04-a418-8f6f791df996", depotLe: "2026-09-20T17:32:01Z",
});
ok(robe?.verdict === "deja_retire" && robe.neesApresDepot?.[0] === "34084113",
  "robe PROMOD (déposée le 20/09) : 34084113 apparue le 01/10 après 2 relevés complets sans elle → pas la robe, rien à retirer", JSON.stringify(robe));
ok(/apparue que bien après ce dépôt \(n° 34084113\)/.test(robe.message) && /ne compte pas dans tes limites/.test(robe.message), "message vrai : l'annonce écartée est nommée");
const mango = jugerRetraitIntrouvable(retraitBeebs("d4c69bcc", "2026-10-01T15:10:09Z"), {
  releves: relevesOrn, annonces: annoncesOrn, depotId: "bcc3b32a-d90c-48f1-a094-2725874c27ff", depotLe: "2026-09-20T09:20:17Z",
});
ok(mango?.verdict === "deja_retire", "robe Mango (déposée le 20/09) : même preuve, même conclusion", JSON.stringify(mango));
// Le pull Zara déposé le 30/09 18:35Z : un seul relevé complet entre son dépôt
// et 34084113 ? Aucun (30/09 18:12Z est AVANT le dépôt) → jamais écartée.
const pull = jugerRetraitIntrouvable(retraitBeebs("pull", "2026-10-02T10:00:00Z"), {
  releves: [R("2026-10-02T12:00:00Z", 29, 29), R("2026-10-02T11:00:00Z", 29, 29), ...relevesOrn],
  annonces: annoncesOrn.map((a) => ({ ...a, vu_le: "2026-10-02T12:00:30Z" })), depotId: "dba189b3-96ae-4a47-acc3-fd45ab2ddae8", depotLe: "2026-09-30T18:35:43Z",
});
ok(pull?.verdict === "non_reliee" && pull.nonReliees?.[0] === "34084113", "pull Zara (déposé le 30/09) : 34084113 PEUT être lui → jamais écartée, on ne conclut rien");
ok(!neeApresLeDepot({ created_at: "2026-10-01T17:33:25Z" }, { releves: [R("2026-09-30T18:12:10Z", 29, 29)], depotLe: "2026-09-20T17:32:01Z" }),
  "un seul relevé complet sans elle : pas une preuve");
ok(!neeApresLeDepot({ created_at: "2026-10-01T17:33:25Z" }, {
  releves: [R("2026-09-30T18:12:10Z", 29, 29, { erreur: "[incomplet] x" }), R("2026-09-30T07:30:05Z", 20, 29)], depotLe: "2026-09-20T17:32:01Z" }),
  "relevés incomplets : ne comptent pas");
ok(!neeApresLeDepot({ created_at: "2026-10-01T17:33:25Z" }, { releves: relevesOrn, depotLe: null }), "heure du dépôt inconnue : jamais écartée");

console.log("\n5. ATTENTE BORNÉE — LE MESSAGE À LA PERSONNE");
ok(RETRAIT_SANS_NUMERO_GESTE_MS === 48 * 3600_000 && RETRAIT_SANS_NUMERO_RELEVE_MS === 6 * 3600_000, "48 h puis needs_user ; relevé redemandé toutes les 6 h");
const mNr = messageRetraitSansNumeroAToi({ platform: "beebs", title: "Robe noire plissée PROMOD" }, { verdict: "non_reliee", nonReliees: ["34084113"] });
ok(/« Robe noire plissée PROMOD »/.test(mNr) && /n° 34084113/.test(mNr) && /retire-la toi-même sur Beebs/.test(mNr) && /seul titre/.test(mNr),
  "annonce non reliée : nommée par son numéro, le geste, jamais par le titre", mNr);
const mAt = messageRetraitSansNumeroAToi({ platform: "beebs", title: "Wii Sports" }, { verdict: "attente" });
ok(/n'ont pas pu être relues en entier/.test(mAt) && /se conclura tout seul/.test(mAt), "relevés manquants : dit ce qui manque et l'issue", mAt);

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ retraits introuvables : deux relevés complets, par numéro, message vrai");
