// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay : quand TOUTES les publications attendent le compte vendeur, l'une repart seule » (06/11, Nico, point 5)
//   node scripts/ebay-eclaireur-attente-selftest.mjs
//
// LE CAS : ayadi007 (cfdfda6f), 10 publications eBay en needs_user `ebay_compte_vendeur_inactif` (paiements eBay à
// terminer), dernier mur vu 06/11 11:23:48Z, AUCUNE en file. L'éclaireur de get-pending-jobs (decisionVendeurEbay) ne se
// choisit que parmi les dépôts EN FILE : rien ne repartait jamais, même le compte prêt (parc du 06/11 : 4 comptes,
// 25 tâches, depuis le 28/10). LA RÈGLE (handler-watch, patron Depop) : la plus ancienne repart seule au barème
// (60, 180, 360, 720, 1440 min), jamais deux à la fois, jamais si un dépôt eBay est déjà en file ; une publication eBay
// faite après le mur relâche tout.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  eclaireurVendeurEbayEnAttente, champsEclaireurEnAttenteVendeurEbay, estEclaireurEbayFrais, decisionVendeurEbay, attendVendeurEbay,
} from "../supabase/functions/_shared/vendeur-ebay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const T = (iso) => Date.parse(iso);
const PAIEMENTS = "https://ebaypayonboardingweb.ebay.com/account-status-error/";
const vue = (id, cree, derniere) => ({ id, platform: "ebay", action: "publish", status: "needs_user", voie: "extension", created_at: cree,
  platform_fields: { needs_user_source: "ebay_compte_vendeur_inactif", compte_vendeur_inactif: { mur: "paiements", tab_url: PAIEMENTS, derniere, depuis: derniere } } });
const retenue = (id, cree, le) => ({ id, platform: "ebay", action: "publish", status: "needs_user", voie: "extension", created_at: cree,
  platform_fields: { needs_user_source: "ebay_compte_vendeur_inactif", compte_vendeur_inactif: { retenue_le: le } } });
// Les tâches d'ayadi007 (extrait réel du 06/11, ordre de création).
const attente = [
  vue("20023afa", "2026-11-06T10:16:00Z", "2026-11-06T11:12:54Z"),
  vue("3a70e36b", "2026-11-06T10:55:00Z", "2026-11-06T11:04:55Z"),
  retenue("4e384082", "2026-11-06T10:58:00Z", "2026-11-06T11:05:08Z"),
  vue("ae49521b", "2026-11-06T11:05:00Z", "2026-11-06T11:23:48Z"),
  retenue("55a3319c", "2026-11-06T11:19:00Z", "2026-11-06T11:22:21Z"),
];

console.log("1. Toutes en attente, aucune en file : la plus ancienne repart au barème");
ok("toutes attendent le geste", attente.every((j) => attendVendeurEbay(j)));
ok("12:20Z (57 min après le dernier mur) : pas encore", eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T12:20:00Z")) === null);
const e1 = eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T12:24:00Z"));
ok("12:24Z (60 min passées) : la plus ancienne (20023afa)", e1?.id === "20023afa", JSON.stringify(e1?.id));

console.log("2. Jamais deux à la fois, jamais à côté d'un dépôt en file");
const enFile = { id: "neuf", platform: "ebay", action: "publish", status: "pending", voie: "extension", created_at: "2026-11-06T12:00:00Z", platform_fields: {} };
ok("un dépôt eBay en file : rien (get-pending-jobs choisit)", eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T13:00:00Z"), [enFile]) === null);
ok("un éclaireur en cours (processing) : rien", eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T13:00:00Z"), [{ ...enFile, status: "processing" }]) === null);
ok("un dépôt par l'API en file ne compte pas (son propre circuit)", eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T13:00:00Z"), [{ ...enFile, voie: "api" }])?.id === "20023afa");
ok("un compte qui vend (publication eBay après le mur) : pas d'éclaireur (la preuve relâche tout)",
  eclaireurVendeurEbayEnAttente(attente, T("2026-11-06T13:00:00Z"), [{ ...enFile, status: "published", published_at: "2026-11-06T12:50:00Z" }]) === null);

console.log("3. L'éclaireur relancé : servi par get-pending-jobs, le barème avance");
const pf = champsEclaireurEnAttenteVendeurEbay(e1.platform_fields, "2026-11-06T12:24:00.000Z", "handler-watch (barème)");
const servi = { ...e1, status: "pending", error: null, platform_fields: pf };
ok("plus de needs_user_source, le mur gardé, n = 1", !("needs_user_source" in pf) && pf.compte_vendeur_inactif?.tab_url === PAIEMENTS && pf.vendeur_ebay?.n === 1);
ok("frais pour get-pending-jobs : servi malgré le mur", estEclaireurEbayFrais(servi, T("2026-11-06T12:30:00Z"))
  && decisionVendeurEbay([servi], [...attente.slice(1), servi], T("2026-11-06T12:30:00Z")).servir?.id === "20023afa");
// Revenu au même mur à 12:31 : le suivant attend 180 min après l'éclaireur.
const remure = { ...servi, status: "needs_user", platform_fields: { ...pf, needs_user_source: "ebay_compte_vendeur_inactif",
  compte_vendeur_inactif: { ...pf.compte_vendeur_inactif, derniere: "2026-11-06T12:31:00Z" } } };
const apres = [remure, ...attente.slice(1)];
ok("revenu au mur : rien avant 180 min (15:30Z)", eclaireurVendeurEbayEnAttente(apres, T("2026-11-06T15:30:00Z")) === null);
ok("après 180 min (15:32Z) : un nouvel éclaireur", eclaireurVendeurEbayEnAttente(apres, T("2026-11-06T15:32:00Z")) != null);

console.log("3 bis. Un éclaireur qu'un AUTRE mur a garé garde la mémoire du barème (9bcc16d0, 06/11 13:54-14:09)");
// L'éclaireur 0e1f1c2a, servi, garé en « Connecte ton compte eBay » (REAUTH) : il n'attend plus CE geste, mais sa trace compte.
const gare = { ...servi, status: "needs_user", platform_fields: { ...pf, needs_user_source: "ebay_connexion_requise" } };
ok("3 min après : aucun autre éclaireur (le barème lit sa trace, n = 1)", eclaireurVendeurEbayEnAttente(attente.slice(1), T("2026-11-06T12:27:00Z"), [gare]) === null);
ok("180 min après l'éclaireur : le suivant", eclaireurVendeurEbayEnAttente(attente.slice(1), T("2026-11-06T15:25:00Z"), [gare]) != null);

console.log("4. Branchement (handler-watch)");
const hw = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8");
const bloc = hw.slice(hw.indexOf("── eBay : LE COMPTE N'EST PAS ENCORE OUVERT À LA VENTE"), hw.indexOf("── UN ARRÊT « ONGLET MUET »"));
ok("lit les attentes de source EXACTE, 30 j, bornées", bloc.includes('.eq("platform_fields->>needs_user_source", SOURCE_VENDEUR_EBAY)') && /\.limit\(500\)/.test(bloc) && /\.slice\(0, 10\)/.test(bloc));
ok("relance l'éclaireur en compare-and-swap sur needs_user, poste vu dans les 30 min",
  /eclaireurVendeurEbayEnAttente\(enAttente/.test(bloc) && /now - vu > 30 \* 60_000/.test(bloc) && /\.eq\("id", String\(ecl\.id\)\)\.eq\("status", "needs_user"\)/.test(bloc));
ok("la preuve relâche tout (champsRepriseVendeurEbay)", /compteEbayVendDepuis\(autresU/.test(bloc) && /champsRepriseVendeurEbay\(/.test(bloc));
const lectureAutres = bloc.slice(bloc.indexOf("const { data: autresE }"), bloc.indexOf(".limit(1000);"));
ok("les autres jobs du compte sont lus TOUS statuts (la mémoire du barème)", lectureAutres.length > 0 && !/\.in\("status"/.test(lectureAutres));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
