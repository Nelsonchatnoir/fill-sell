// Autotest — eBay « mise à niveau du compte vendeur » (/fpa/upgrade) : le vrai
// motif, jamais « la cause est de notre côté » (03/10, point 14, f2rhrt5zc6)
//   npm run selftest:ebay-mise-a-niveau
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const { murMiseANiveauEbay, requalificationMiseANiveauEbay, miseANiveauVendeurEbay, SOURCE_COMPTE_VENDEUR_EBAY } =
  await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/ebay-mise-a-niveau.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Le job RÉEL 618164ab (f2rhrt5zc6), tel qu'en base le 03/10 à 13:30 (champs utiles).
const BRUT = "eBay demande une mise à niveau de ton compte vendeur avant de pouvoir déposer une annonce (/fpa/upgrade). Ouvre ebay.fr dans Chrome, suis les étapes de mise à niveau qu'eBay affiche, puis relance la publication depuis la fiche de l'article.";
const GENERIQUE = "La publication de cet article sur eBay n'a pas abouti, et la cause est de notre côté. Elle est enregistrée. Tu peux relancer depuis la fiche de l'article ; si ça se reproduit, écris-nous.";
const reel = () => ({
  id: "618164ab-e775-4faa-a73c-83dcc1573054", platform: "ebay", action: "publish", status: "needs_user", error: GENERIQUE,
  platform_fields: {
    processing_since: "2026-10-02T17:43:01.330Z",
    last_diagnostic: JSON.stringify({ quoi: "prevol_upgrade_vendeur", detail: "GET /sl/list redirigé vers /fpa/upgrade AVANT toute tentative de dépôt", at: "2026-10-02T17:43:42.181Z" }),
    error_technique: { at: "2026-10-02T17:43:42.624Z", brut: BRUT, pose_par: "update-job-status (requalification affichage G1/G4)" },
    needs_user_source: "ebay_connexion_requise",
    ebay_connexion_requise: { depuis: "2026-10-02T17:21:41.394Z", observations: 1 },
    erreurs_archivees: [{ le: "2026-10-02T17:42:15.337Z", par: "relance_manuelle", erreur: "Connecte ton compte eBay pour vendre ici…", statut: "needs_user" }],
    relances_manuelles: 1,
  },
});

console.log("\n1. LE CAS RÉEL : LE MUR EST RECONNU, LE MAUVAIS TEXTE ET LE MAUVAIS BOUTON PARTENT");
const j = reel();
ok(murMiseANiveauEbay(j), "signé par le diagnostic du pré-vol (et le brut conservé) de l'essai en cours");
const p = requalificationMiseANiveauEbay(j, "2026-10-03T12:00:00.000Z", "selftest");
ok(p && p.status === "needs_user", "needs_user (aucune reprise à l'aveugle)");
ok(p?.error === miseANiveauVendeurEbay("publish") && /mise à niveau de ton compte vendeur/.test(p.error) && /ebay\.fr/.test(p.error),
  "message vrai : eBay demande la mise à niveau, où aller, puis relancer");
ok(!/notre côté|chez nous|\/fpa|upgrade/i.test(p?.error ?? ""), "ni « notre côté », ni route", p?.error);
ok(p?.platform_fields?.needs_user_source === SOURCE_COMPTE_VENDEUR_EBAY, "marqueur de la famille « compte eBay pas prêt » (plus le bouton « Me connecter »)");
ok(!("ebay_connexion_requise" in (p?.platform_fields ?? {})), "le marqueur de l'AUTRE mur (REAUTH d'un essai précédent) est levé");
ok(p?.platform_fields?.compte_vendeur_inactif?.mur === "mise_a_niveau", "le mur est nommé (mesurable en base)");
const arch = p?.platform_fields?.erreurs_archivees ?? [];
ok(arch.length === 2 && arch[1].erreur === GENERIQUE, "le texte d'avant est archivé, rien n'est perdu");
ok(requalificationMiseANiveauEbay({ ...j, ...p }, "2026-10-03T12:03:00.000Z", "selftest") === null, "second passage : rien à réécrire (idempotent)");

console.log("\n2. JAMAIS SUR UNE TRACE D'UN ESSAI PRÉCÉDENT");
const ancien = reel();
ancien.platform_fields.processing_since = "2026-10-05T09:00:00.000Z"; // un nouvel essai, après la mise à niveau
ancien.error = "Publication eBay NON aboutie : eBay a refusé le prix.";
ok(!murMiseANiveauEbay(ancien), "diagnostic et brut d'AVANT l'essai en cours ne comptent pas");
ok(requalificationMiseANiveauEbay(ancien, "2026-10-05T09:05:00.000Z", "selftest") === null, "aucune requalification d'une autre panne");
ok(murMiseANiveauEbay({ error: BRUT, platform_fields: {} }), "le texte de l'arrêt lui-même (anciennes extensions) suffit");
ok(requalificationMiseANiveauEbay({ ...reel(), platform: "vinted" }, "x", "selftest") === null, "eBay seulement");
ok(requalificationMiseANiveauEbay({ ...reel(), status: "pending" }, "x", "selftest") === null, "jamais un job vivant");

console.log("\n3. LES DEUX POINTS DE PASSAGE APPLIQUENT LA MÊME RÈGLE");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/import \{ murMiseANiveauEbay, miseANiveauVendeurEbay \} from "\.\.\/_shared\/ebay-mise-a-niveau\.js";/.test(ujs), "update-job-status importe la règle");
ok(/const miseANiveau = !pageInscription &&\s+murMiseANiveauEbay\(\{ error: body\.error, platform_fields: pfBody \?\? pfBase \}\);/.test(ujs),
  "au verdict : reconnue avec la page d'inscription (famille compte vendeur)");
ok(ujs.indexOf("murMiseANiveauEbay({") < ujs.indexOf("porteDuVocabulaireDeDeveloppeur(brut)"), "… AVANT le filet anti-jargon (G5)");
ok(/const nettoye = sansIncisesTechniques\(brut\);\s+if \(nettoye\) \{\s+clair = nettoye;/.test(ujs), "G5 retire l'incise technique avant de jeter un message");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/requalificationMiseANiveauEbay\(j, new Date\(\)\.toISOString\(\), "handler-watch"\)/.test(hw), "le veilleur répare les jobs déjà arrêtés");
const textes = lire("supabase/functions/_shared/textes-jobs.ts");
ok(/export const SOURCE_EBAY_COMPTE_VENDEUR_INACTIF = "ebay_compte_vendeur_inactif";/.test(textes) && SOURCE_COMPTE_VENDEUR_EBAY === "ebay_compte_vendeur_inactif",
  "le marqueur est le même des deux côtés");
const fuite = textes.slice(textes.indexOf("export function fuiteDeDeveloppeur"), textes.indexOf("export function fuiteDeDeveloppeur") + 1400);
ok(!/notre côté|chez nous/.test(fuite.replace(/\/\/.*$/gm, "")), "le texte générique n'accuse plus personne");

console.log("\n4. L'EXTENSION ET L'APP");
const bg = lire("chrome-extension/background.js");
const iUp = bg.indexOf('if (stepUp === "upgrade")');
const blocUp = bg.slice(iUp, iUp + 2000);
ok(iUp > 0 && !/\(\/fpa\/upgrade\)/.test(blocUp.split("const msg =")[1]?.split(";")[0] ?? "x"), "0.6.90 : plus de route dans le texte");
ok(/needs_user_source: "ebay_compte_vendeur_inactif"/.test(blocUp), "0.6.90 : le motif est nommé dès l'extension");
const st = lire("src/tabs/StockTab.jsx");
ok(/const MURS_LEVES_A_LA_RELANCE = \[[^\]]*'ebay_connexion_requise'[^\]]*'ebay_compte_vendeur_inactif'/.test(st) &&
   /if \(MURS_LEVES_A_LA_RELANCE\.includes\(String\(pf\.needs_user_source \?\? ''\)\)\) \{\s+delete pf\.needs_user_source;\s+delete pf\.ebay_connexion_requise;/.test(st),
  "la relance lève tous les murs que le serveur repose (plus de marqueur collé)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ mise à niveau eBay : le vrai motif, le bon geste, partout");
