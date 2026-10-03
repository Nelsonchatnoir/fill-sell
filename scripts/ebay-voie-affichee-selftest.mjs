// Autotest — eBay : l'écran dit la VRAIE voie (nos serveurs ou ton
// ordinateur), et la vraie durée (03/10, point 17)
//   npm run selftest:ebay-voie-affichee
//
// Depuis le 27/09, le trigger cross_post_jobs_voie_ebay route en 'api' toute
// publication d'un compte relié, PRÊT OU NON. L'app gardait le miroir du 07/09
// (politiques + checklist) : à un compte relié mais pas « fini », le suivi
// écrivait « Dans la file — Chrome la prend à son tour », « En cours dans
// Chrome », et comptait 238 s (extension) au lieu de 78 s (nos serveurs) —
// 6 comptes, 72 jobs eBay par nos serveurs sur 14 jours. Et l'écran de suivi
// ne lisait même pas la colonne `voie` du job.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { ebayVoieApiDuCompte, ebayCompteUtilisable } = await imp("src/utils/ebayCompte.js");
const { etapesJob } = await imp("src/utils/barresJobs.js");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LE MIROIR SUIT LE TRIGGER D'AUJOURD'HUI");
const trig = lire("supabase/migrations/20261001064500_ebay_retrait_annonce_importee_voie_extension.sql");
ok(/Relié = API, PRÊT OU NON/.test(trig) && /SELECT \(a\.revoked_at IS NULL\)\s+INTO v_ok/.test(trig) && /IF COALESCE\(v_ok, false\) THEN NEW\.voie := 'api'; END IF;/.test(trig),
  "trigger (dernière définition du dépôt = prod relue le 03/10) : relié et non révoqué ⇒ 'api'");
// Compte RÉEL de jocabroc8 (relié, politiques non retenues), vue publique d'ebay-account.
const relieNonPret = { connecte: true, a_reconnecter: false, motif_reconnexion: null, ebay_user_id: "x", politiques: { fulfillment: null, payment: null, return: null }, seller_state: { bloque_par_etat_ebay: false } };
ok(ebayVoieApiDuCompte(relieNonPret) === true && ebayCompteUtilisable(relieNonPret) === false,
  "relié mais pas prêt : la voie est 'api' (nos serveurs) — la préparation est une autre question");
ok(ebayVoieApiDuCompte({ ...relieNonPret, connecte: false, a_reconnecter: true, motif_reconnexion: "refresh_expire" }) === true,
  "jeton de renouvellement expiré ≠ révoqué : le trigger route quand même en 'api'");
ok(ebayVoieApiDuCompte({ ...relieNonPret, connecte: false, a_reconnecter: true, motif_reconnexion: "revoque" }) === false, "révoqué : extension");
ok(ebayVoieApiDuCompte({ connecte: false, a_reconnecter: false, motif_reconnexion: null }) === false, "jamais relié : extension");
ok(ebayVoieApiDuCompte(null) === null, "pas encore lu : on ne conclut pas");
const app = lire("src/App.jsx");
ok(/voieApiReelle:ebayVoieApi&&ebayCompteEtatLu&&ebayVoieApiDuCompte\(ebayCompteEtat\)===true,/.test(app), "l'app calcule sa voie réelle avec ce miroir");

console.log("\n2. LE SUIVI LIT LA VOIE DU JOB");
const suivi = lire("src/publication/EcranSuivi.jsx");
ok(/\.select\("id, platform, status, action, created_at, error, listing_url, platform_fields, voie"\)/.test(suivi), "la colonne voie est lue");
ok((suivi.match(/const parApi = p === "ebay" && \(e\.job\?\.voie \? e\.job\.voie === "api" : m\.ebayVoieApiReelle\);/g) ?? []).length === 2,
  "textes ET barre : la voie du job d'abord, le miroir seulement avant sa création");
const api = etapesJob({ platform: "ebay", action: "publish", voie: "api" }, "fr");
const ext = etapesJob({ platform: "ebay", action: "publish", voie: "extension" }, "fr");
ok(api[0].texte === "Dans la file de nos serveurs…" && api[1].texte === "Publication sur eBay depuis nos serveurs…" && api[1].duree === 78,
  "par nos serveurs : « nos serveurs », 78 s");
ok(/ordinateur/.test(ext[0].texte) && ext[1].duree === 238, "par l'extension : « ton ordinateur », 238 s");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ eBay : la voie et la durée affichées sont celles du job");
