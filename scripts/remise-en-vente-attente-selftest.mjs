// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Leboncoin : la remise en vente attend que l'annonce vendue soit hors ligne » (06/11, Nico, règle A)
//   node scripts/remise-en-vente-attente-selftest.mjs
// LE CAS : Louis, 7 remises Leboncoin déposées à 07:22-07:29 alors que les annonces vendues (transaction « Achat en
// cours ») étaient encore actives — refusées par Leboncoin (« annonce identique déjà en ligne »).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { remiseAAttendre, annonceVendueDeLaRemise, annonceVendueEncoreEnLigne, PLATEFORMES_REMISE_APRES_DISPARITION, decisionRearmementRemise, champsRearmementRemise, REARMEMENTS_MAX,
  etatAnnonceVendue, ETAT_VENDUE, ETATS_RETENUS, CLE_ATTENTE_VENDUE, marqueAttenteVendue, releveAttenteADemander, RELEVE_ATTENTE_MIN, messageToujoursEnVente, BORNE_ATTENTE_VENDUE_MS, decisionRetraitVendueClose } from "../supabase/functions/_shared/remise-en-vente-attente.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const remise = (o = {}) => ({ platform: "leboncoin", action: "publish", status: "pending",
  platform_fields: { remise_en_vente: { annonce_vendue: "3297400164", vente: "annonce:leboncoin:3297400164", restant: 9996 } }, ...o });

console.log("1. Qui attend");
ok("une remise Leboncoin (numéro de l'annonce vendue connu)", remiseAAttendre(remise()) && annonceVendueDeLaRemise(remise()) === "3297400164");
ok("une publication Leboncoin ordinaire : jamais", !remiseAAttendre({ platform: "leboncoin", action: "publish", platform_fields: {} }));
ok("une remise Vinted, Beebs, eBay, Depop : jamais (seul Leboncoin refuse un dépôt identique)",
  ["vinted", "beebs", "ebay", "depop"].every((p) => !remiseAAttendre(remise({ platform: p }))) && JSON.stringify(PLATEFORMES_REMISE_APRES_DISPARITION) === '["leboncoin"]');
ok("une remise sans numéro d'annonce vendue : jamais retenue (rien à surveiller)", !remiseAAttendre(remise({ platform_fields: { remise_en_vente: { vente: "x" } } })));

console.log("2. Quand l'annonce vendue est-elle encore en ligne ?");
ok("relevée en ligne, sous transaction (Leboncoin la garde « active ») : oui", annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", disparu_le: null }));
ok("relevée disparue : non (la remise part)", !annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", disparu_le: "2026-11-07T08:00:00Z" }));
ok("retirée : non", !annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", retiree_le: "2026-11-07T08:00:00Z" }));
ok("aucune ligne au relevé : non (rien ne prouve qu'elle est là)", !annonceVendueEncoreEnLigne(null));

console.log("3. Branchement (get-pending-jobs) — (07/11 nuit) décider, sortir de la file, PUIS écrire");
const gpj = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8").replace(/\r\n/g, "\n");
const bloc = gpj.slice(gpj.indexOf("let heldRemisesLbc = 0;"), gpj.indexOf("let heldSerie = 0;"));
const iSortie = bloc.indexOf("if (sortis.size) out = out.filter((j) => !sortis.has(String(j.id)));");
ok("les remises retenues ET les remises à fermer sortent de la file AVANT toute écriture (une écriture ratée ne sert jamais un doublon)",
  iSortie > 0 && iSortie < bloc.indexOf(".update(") && /const sortis = new Set\(\[\.\.\.retenuesR, \.\.\.aFermer\.map/.test(bloc));
ok("chaque écriture est un compare-and-set sur « pending »", (bloc.match(/\.update\(/g) ?? []).length === 3
  && (bloc.match(/\.eq\("status", "pending"\)/g) ?? []).length === 3);
ok("la raison n'est écrite que si elle change (marqueAttenteVendue non nul)", /const marque = marqueAttenteVendue\(pfJ, \{/.test(bloc) && /if \(marque\) \{/.test(bloc));
ok("lecture ratée → rien de retenu (inchangé)", /— rien de retenu`\);/.test(bloc) && /if \(lignesV\) \{/.test(bloc));
ok("relevé demandé : lecture seule (serveur:verif_redepot), borné par releveAttenteADemander, jamais s'il y en a un en file",
  /releveAttenteADemander\(\{/.test(bloc) && /declencheur: "serveur:verif_redepot"/.test(bloc) && /r\.status === "queued" \|\| r\.status === "running"/.test(bloc));
ok("la règle A passe AVANT la série (une remise retenue n'est pas servie par la série)",
  gpj.indexOf("let heldRemisesLbc = 0;") > 0 && gpj.indexOf("let heldRemisesLbc = 0;") < gpj.indexOf("let heldSerie = 0;"));

console.log("4. (07/11, option A) Une remise close pendant que sa vendue est affichée revient en attente");
const T0 = Date.parse("2026-11-07T14:00:00Z");
const close = (o = {}) => remise({ status: "cancelled", created_at: "2026-11-06T06:20:00Z", platform_listing_id: "3303702852",
  error: "Ce dépôt n'a jamais été retrouvé … rien n'est vendu.", ...o,
  platform_fields: { remise_en_vente: { annonce_vendue: "3297400164" }, lbc_depot: { sans_adsubmit: { id: "3303702852" } },
    depot_jamais_en_ligne: { issue: "article_en_ligne_ailleurs", identifiants: ["3303702852"] }, serie_un_par_un: { serie: "s", rang: 1 }, ...(o.platform_fields ?? {}) } });
const f = { vendueEncoreAffichee: true, depotVu: false, autreAnnonceVivante: false, maintenant: T0 };
ok("rang 1 de Louis (cancelled à tort) : remis en attente", decisionRearmementRemise(close(), f).rearmer);
ok("rejugé « failed » : remis en attente", decisionRearmementRemise(close({ status: "failed" }), f).rearmer);
ok("rang 4 (published 11:25, jamais vu, 410) : remis en attente après 2 h, pas avant",
  decisionRearmementRemise(close({ status: "published", published_at: "2026-11-07T10:25:28Z" }), f).rearmer
  && !decisionRearmementRemise(close({ status: "published", published_at: "2026-11-07T13:30:00Z" }), f).rearmer);
ok("vendue disparue : rien (la règle B juge le refus)", !decisionRearmementRemise(close(), { ...f, vendueEncoreAffichee: false }).rearmer);
ok("dépôt vu en ligne : rien", !decisionRearmementRemise(close(), { ...f, depotVu: true }).rearmer
  && !decisionRearmementRemise(close({ vu_en_ligne_le: "2026-11-07T09:00:00Z" }), f).rearmer);
ok("une autre annonce NON vendue de la fiche en ligne : rien (jamais de doublon)", !decisionRearmementRemise(close(), { ...f, autreAnnonceVivante: true }).rearmer);
ok("arrêtée par la personne : rien", !decisionRearmementRemise(close({ error: "Annulée à ta demande." }), f).rearmer);
ok("plus de 14 jours : rien", !decisionRearmementRemise(close({ created_at: "2026-10-20T06:20:00Z" }), f).rearmer);
ok("publication ordinaire ou autre plateforme : rien", !decisionRearmementRemise({ ...close(), platform_fields: {} }, f).rearmer
  && !decisionRearmementRemise(close({ platform: "vinted" }), f).rearmer);
const pfR = champsRearmementRemise(close().platform_fields, close(), "2026-11-07T14:00:00.000Z");
ok("le dépôt refusé est archivé, la tâche redevient neuve, la série gardée", pfR.depots_desactives_regle_a?.[0]?.numero === "3303702852"
  && !("lbc_depot" in pfR) && !("depot_jamais_en_ligne" in pfR) && pfR.serie_un_par_un?.rang === 1 && pfR.remise_en_vente?.annonce_vendue === "3297400164"
  && pfR.remise_regle_a?.rearmements === 1 && remiseAAttendre({ platform: "leboncoin", action: "publish", platform_fields: pfR }));
let pfX = close().platform_fields;
for (let i = 0; i < REARMEMENTS_MAX; i++) pfX = champsRearmementRemise(pfX, close(), "2026-11-07T14:00:00Z");
ok("jamais plus de 3 fois", !decisionRearmementRemise(close({ platform_fields: pfX }), f).rearmer);
const HW = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8");
ok("branchement handler-watch : statut relu à l'écriture, un passage par quart d'heure",
  /decisionRearmementRemise\(j, \{/.test(HW) && /\.eq\("id", j\.id\)\.eq\("status", j\.status\)/.test(HW) && /getUTCMinutes\(\) % 15 < 3/.test(HW));

console.log("5. (07/11 nuit, Louis) Ce que l'annonce vendue est — sur les 9 lignes RÉELLES lues le 07/11 (relevé de 17:42)");
{
  const R = { created_at: "2026-11-06T06:20:00Z" };
  const R2 = { created_at: "2026-11-06T18:20:00Z" };
  const lu = "2026-11-07T16:42:00Z";
  const L = (tx, o = {}) => ({ statut_plateforme: "en_ligne", transaction_plateforme: tx, transaction_lue_le: lu, disparu_le: null, retiree_le: null, ignoree_le: null, ...o });
  const reels = [
    ["Noir et Rouge 3297400164", L("pending"), R, ETAT_VENDUE.VENTE_EN_COURS],
    ["Adaptateurs Orange 3298491503", L("sold"), R, ETAT_VENDUE.VENDUE_AFFICHEE],
    ["Blanc et Vert Pomme 3295743872", L("pending"), R, ETAT_VENDUE.VENTE_EN_COURS],
    ["Bleu et Bleu Ciel 3295398035", L("pending"), R, ETAT_VENDUE.VENTE_EN_COURS],
    ["Noir 3297440551 (supprimée par Louis, relevée disparue le 06/11 22:01)", L("pending", { disparu_le: "2026-11-06T21:01:00Z", transaction_lue_le: "2026-11-06T09:19:00Z" }), R, ETAT_VENDUE.HORS_LIGNE],
    ["Blanc 3280443604", L("sold"), R2, ETAT_VENDUE.VENDUE_AFFICHEE],
    ["Noir et Gris 3297299585", L("sold"), R2, ETAT_VENDUE.VENDUE_AFFICHEE],
    ["Zombicide Jaune 3298021777", L("pending"), R, ETAT_VENDUE.VENTE_EN_COURS],
    ["Zombicide Orange 3297234692", L("pending"), R, ETAT_VENDUE.VENTE_EN_COURS],
  ];
  for (const [nom, ligne, job, attendu] of reels) ok(`${nom} → ${attendu}`, etatAnnonceVendue(ligne, job) === attendu, etatAnnonceVendue(ligne, job));
  ok("8 retenues, 1 servie (le 3e) : exactement ce que montraient les pages publiques à 22:19-22:21",
    reels.filter(([, l, j]) => ETATS_RETENUS.includes(etatAnnonceVendue(l, j))).length === 8);
  ok("aucune ligne relevée → inconnue → servie (inchangé)", etatAnnonceVendue(null, R) === ETAT_VENDUE.INCONNUE && !ETATS_RETENUS.includes(ETAT_VENDUE.INCONNUE));
  ok("retirée ou ignorée → hors ligne", etatAnnonceVendue(L("sold", { retiree_le: lu }), R) === ETAT_VENDUE.HORS_LIGNE
    && etatAnnonceVendue(L("sold", { ignoree_le: lu }), R) === ETAT_VENDUE.HORS_LIGNE);
  ok("affichée SANS transaction, lue APRÈS la remise → toujours en vente (achetable : jamais de remise, jamais de doublon)",
    etatAnnonceVendue(L("aucune"), R) === ETAT_VENDUE.TOUJOURS_EN_VENTE && !ETATS_RETENUS.includes(ETAT_VENDUE.TOUJOURS_EN_VENTE));
  ok("affichée sans transaction mais lue AVANT la remise → à relire (retenue, jamais close sur une lecture périmée)",
    etatAnnonceVendue(L("aucune", { transaction_lue_le: "2026-11-06T05:00:00Z" }), R) === ETAT_VENDUE.A_RELIRE
    && etatAnnonceVendue(L(null, { transaction_lue_le: null }), R) === ETAT_VENDUE.A_RELIRE);
  ok("un état de transaction inconnu (ni pending, ni aucune) → vendue affichée (retenue, jamais servie)", etatAnnonceVendue(L("refunded"), R) === ETAT_VENDUE.VENDUE_AFFICHEE);
  const m1 = marqueAttenteVendue({}, { etat: ETAT_VENDUE.VENTE_EN_COURS, annonce: "3297400164", ligne: L("pending"), maintenant: "2026-11-07T22:00:00Z" });
  ok("raison posée : annonce, état, transaction, depuis", m1?.annonce_vendue === "3297400164" && m1.etat === "vente_en_cours" && m1.transaction === "pending" && m1.depuis === "2026-11-07T22:00:00Z");
  ok("même état, même transaction : rien à réécrire (aucune ligne inchangée réécrite)",
    marqueAttenteVendue({ [CLE_ATTENTE_VENDUE]: m1 }, { etat: ETAT_VENDUE.VENTE_EN_COURS, annonce: "3297400164", ligne: L("pending"), maintenant: "2026-11-08T09:00:00Z" }) === null);
  const m2 = marqueAttenteVendue({ [CLE_ATTENTE_VENDUE]: m1 }, { etat: ETAT_VENDUE.VENDUE_AFFICHEE, annonce: "3297400164", ligne: L("sold"), maintenant: "2026-11-08T09:00:00Z" });
  ok("la vente se termine (pending → sold) : réécrite, « depuis » GARDÉ (la borne court depuis la première retenue)", m2?.etat === "vendue_affichee" && m2.depuis === "2026-11-07T22:00:00Z");
  ok("relevé : demandé sans relevé connu, ou 60 min après le dernier ; jamais s'il y en a un en file",
    releveAttenteADemander({ dernierReleveMs: null }) && RELEVE_ATTENTE_MIN === 60
    && !releveAttenteADemander({ dernierReleveMs: T0 - 59 * 60_000, maintenant: T0 }) && releveAttenteADemander({ dernierReleveMs: T0 - 60 * 60_000, maintenant: T0 })
    && !releveAttenteADemander({ dernierReleveMs: null, releveEnFile: true }));
  ok("le message de la remise close nomme l'annonce et dit qu'aucun doublon n'est parti", /3297400164/.test(messageToujoursEnVente("3297400164")) && /jamais de doublon/.test(messageToujoursEnVente("1")));
  ok("la raison n'est jamais recopiée dans une remise suivante (préfixe « attente_ », filtré par remise_en_vente_champs)", /^attente_/.test(CLE_ATTENTE_VENDUE));
  const pfRe = champsRearmementRemise({ remise_en_vente: { annonce_vendue: "3297400164" }, [CLE_ATTENTE_VENDUE]: m1 }, {}, "2026-11-08T00:00:00Z");
  ok("une remise remise en attente (règle A) repart sans raison périmée", !(CLE_ATTENTE_VENDUE in pfRe));
  ok("la borne est de 48 h et vaut la copie d'etat-job.js", BORNE_ATTENTE_VENDUE_MS === 48 * 3600_000);
}

console.log("6. (07/11 nuit, Nico) Une fois la vente close, FillSell retire l'annonce vendue, puis la remise part");
{
  const N = Date.parse("2026-11-07T22:00:00Z");
  const rem = (o = {}) => ({ platform: "leboncoin", action: "publish", status: "pending", created_at: "2026-11-06T18:20:00Z",
    platform_fields: { remise_en_vente: { annonce_vendue: "3280443604" } }, ...o });
  const lig = (o = {}) => ({ listing_id: "3280443604", statut_plateforme: "en_ligne", transaction_plateforme: "sold",
    transaction_lue_le: "2026-11-07T16:42:00Z", disparu_le: null, retiree_le: null, ignoree_le: null, ...o });
  const dec = (o) => decisionRetraitVendueClose({ maintenant: N, ...o });
  ok("Blanc 3280443604 (vente close « sold », lue au relevé de 17:42) : retrait armé", dec({ remise: rem(), ligne: lig() }).armer);
  ok("⛔ achat en cours (« pending ») : JAMAIS", !dec({ remise: rem(), ligne: lig({ transaction_plateforme: "pending" }) }).armer
    && dec({ remise: rem(), ligne: lig({ transaction_plateforme: "pending" }) }).motif === "achat_en_cours");
  ok("transaction inconnue ou absente : jamais (seule « sold » ferme une vente)", !dec({ remise: rem(), ligne: lig({ transaction_plateforme: "aucune" }) }).armer
    && !dec({ remise: rem(), ligne: lig({ transaction_plateforme: null }) }).armer && !dec({ remise: rem(), ligne: lig({ transaction_plateforme: "refunded" }) }).armer);
  ok("lecture de plus de 24 h : jamais (relire d'abord)", !dec({ remise: rem(), ligne: lig({ transaction_lue_le: "2026-11-06T21:00:00Z" }) }).armer
    && !dec({ remise: rem(), ligne: lig({ transaction_lue_le: null }) }).armer);
  ok("déjà disparue ou retirée : rien à retirer (la remise part seule)", !dec({ remise: rem(), ligne: lig({ disparu_le: "2026-11-07T21:00:00Z" }) }).armer
    && !dec({ remise: rem(), ligne: lig({ retiree_le: "2026-11-07T21:00:00Z" }) }).armer);
  ok("un retrait déjà ouvert sur cette annonce : rien de plus", !dec({ remise: rem(), ligne: lig(), retraitOuvert: true }).armer);
  ok("jamais une autre annonce que celle de la remise", !dec({ remise: rem(), ligne: lig({ listing_id: "3297299585" }) }).armer);
  ok("remise plus en attente, ou pas une remise Leboncoin : rien", !dec({ remise: rem({ status: "published" }), ligne: lig() }).armer
    && !dec({ remise: rem({ platform: "vinted" }), ligne: lig() }).armer && !dec({ remise: rem({ platform_fields: {} }), ligne: lig() }).armer);
  ok("aucune ligne relevée : rien", !dec({ remise: rem(), ligne: null }).armer);
  const HW2 = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8").replace(/\r\n/g, "\n");
  ok("handler-watch : interrupteur RETIRER_VENDUES_CLOSES ALLUMÉ (feu vert nommé de Nico du 08/11)", /const RETIRER_VENDUES_CLOSES = true;/.test(HW2));
  const blocV = HW2.slice(HW2.indexOf("let vendusRetires = 0;"), HW2.indexOf("let vendusRetires = 0;") + 5000);
  ok("handler-watch : décide par decisionRetraitVendueClose, arme UNE tâche « delete » par numéro et lien, 20 au plus, un passage par quart d'heure",
    /if \(RETIRER_VENDUES_CLOSES && /.test(blocV) && /decisionRetraitVendueClose\(\{ remise: r, ligne, retraitOuvert/.test(blocV)
    && /action: "delete"/.test(blocV) && /platform_listing_id: String\(ligne\.listing_id\)\.trim\(\)/.test(blocV) && /vendusRetires >= 20/.test(blocV));
}

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
