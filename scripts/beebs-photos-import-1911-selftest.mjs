// VERROU (19/11/2026 soir, point 3 de Nico — le compte faf5021a, synchro Beebs de 18:45) : UNE FICHE IMPORTÉE RÉCUPÈRE TOUTES LES
// PHOTOS DE SON ANNONCE DANS LE MÊME RELEVÉ.
// Le cas : 16 présentoirs Beebs vus pour la première fois ; la capture (photos, texte) passait APRÈS les fiches à une
// photo et en concurrence avec le budget de 2 min de pages : 24 captures, puis « 72 au prochain relevé » — « Présentoir
// Beige » (1795110460668) et « Présentoir Blanc » (1795110460366) coupés, importés à 18:47:39 avec la seule vignette.
// Le relevé suivant les complète (fiche à une photo en tête, fiche_completer_photos_capture), mais le compte faf5021a n'avait eu
// qu'un relevé Beebs en 3 jours. Maintenant : les NOUVELLES du relevé (vues depuis moins de 30 min, jamais capturées,
// pas encore rattachées) passent juste après les fiches à une photo, avant les modifiées, les jamais-capturées
// anciennes et les périmées, et la boucle les capture même au-delà du budget de temps (au plus 30).
// Rouge sur 555cffd (aucune catégorie « nouvelles »), vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bg = fs.readFileSync(path.join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

const constante = (nom) => bg.match(new RegExp(`^const ${nom} = [^;]+;`, "m"))?.[0] ?? `const ${nom} = undefined;`;
const aides = ["CAPTURE_MAX_PAR_RUN", "CAPTURE_FRAICHEUR_H", "CAPTURE_PERIMEES_PAR_RUN", "CAPTURE_PERIMEES_PLANCHER", "CAPTURE_NOUVELLE_MS",
  "CAPTURE_NOUVELLES_HORS_BUDGET"].map(constante).join("\n");
const ligne = bg.slice(bg.indexOf("const ligneDeListe = "), bg.indexOf("/** Les annonces à (re)capturer"));
let choisir;
try {
  choisir = new Function(`${aides}\n${ligne}\n${extraireFonctionJs(bg, "choisirCapturesARefaire")}\nreturn choisirCapturesARefaire;`)();
} catch (e) { console.log(`  ✗ choisirCapturesARefaire illisible : ${e.message}`); process.exit(1); }

const T = Date.parse("2026-11-19T17:45:30Z");
const iso = (ms) => new Date(ms).toISOString();
const annonce = (id) => ({ listing_id: String(id), url: `https://www.beebs.app/fr/p/${id}`, titre: `Présentoir ${id}`, prix: 5 });
// Le parc de le compte faf5021a au relevé de 18:45 : 6 fiches à une photo (rattachées), 16 présentoirs NOUVEAUX (lignes écrites à
// 18:45:22 juste avant la capture), 100 captures périmées.
const unePhoto = Array.from({ length: 6 }, (_, i) => ({ listing_id: String(100 + i), capture_le: null, inventaire_id: 9000 + i, created_at: iso(T - 30 * 86_400_000) }));
const nouveaux = Array.from({ length: 16 }, (_, i) => ({ listing_id: String(34391100 + i), capture_le: null, inventaire_id: null, created_at: iso(T - 8_000) }));
const perimees = Array.from({ length: 100 }, (_, i) => ({ listing_id: String(500 + i), capture_le: iso(T - 48 * 3_600_000), inventaire_id: 7000 + i,
  created_at: iso(T - 60 * 86_400_000), ligne: { titre: `Présentoir ${500 + i}`, prix: 5 } }));
const connues = [...unePhoto, ...nouveaux, ...perimees];
const annonces = [...perimees, ...unePhoto, ...nouveaux].map((r) => annonce(r.listing_id));   // la page les rend dans cet ordre
const r = choisir(annonces, connues, T);
const ids = r.pris.map((a) => a.listing_id);
const nouveauxIds = nouveaux.map((x) => x.listing_id);
ok(nouveauxIds.every((id) => ids.includes(id)), `les 16 nouvelles sont toutes prises (${nouveauxIds.filter((id) => ids.includes(id)).length}/16)`);
ok(ids.slice(0, 6).every((id) => unePhoto.some((x) => x.listing_id === id)), "les fiches à une photo restent en tête");
ok(ids.slice(6, 22).every((id) => nouveauxIds.includes(id)), "les nouvelles juste après, avant les périmées");
ok(r.horsBudget instanceof Set && nouveauxIds.every((id) => r.horsBudget.has(id)), "les nouvelles sont capturées même au-delà du budget de temps");
ok(r.pris.length <= 30, `le budget de pages ouvertes ne bouge pas (${r.pris.length} ≤ 30)`);
ok(r.nouvelles === 16, "le bilan compte les nouvelles");
// Une annonce ancienne jamais capturée n'est pas une « nouvelle » (pas de passe-droit hors budget).
const vieille = [{ listing_id: "42", capture_le: null, inventaire_id: null, created_at: iso(T - 2 * 3_600_000) }];
const r2 = choisir([annonce(42)], vieille, T);
ok(r2.pris.length === 1 && !(r2.horsBudget?.has?.("42")), "une jamais-capturée vue il y a 2 h : prise, mais dans le budget de temps");
// Déjà rattachée (le moteur l'a importée) : c'est une fiche à une photo, en tête, comme avant.
const r3 = choisir([annonce(43)], [{ listing_id: "43", capture_le: null, inventaire_id: 1, created_at: iso(T - 1000) }], T);
ok(r3.pris.length === 1 && r3.une_photo === 1, "rattachée sans capture : fiche à une photo (inchangé)");
// Plus de 30 nouvelles : au plus 30 hors budget.
const beaucoup = Array.from({ length: 50 }, (_, i) => ({ listing_id: String(1e6 + i), capture_le: null, inventaire_id: null, created_at: iso(T - 1000) }));
const r4 = choisir(beaucoup.map((x) => annonce(x.listing_id)), beaucoup, T);
ok(r4.horsBudget?.size === 30 && r4.pris.length === 30 && r4.restantes === 20, "50 nouvelles : 30 ce relevé (hors budget de temps), 20 au suivant");

// La boucle : l'exemption est bien lue avant le budget de temps, et `created_at` est relu.
const boucle = extraireFonctionJs(bg, "capturerAnnonces");
ok(/select=listing_id,capture_le,inventaire_id,created_at,/.test(boucle), "capturerAnnonces relit created_at des annonces connues");
ok(/Date\.now\(\) - debutCaptures > CAPTURE_BUDGET_MS && !horsBudget\.has\(String\(a\.listing_id\)\)/.test(boucle), "le budget de temps épargne les nouvelles");

console.log(echecs ? `✗ beebs-photos-import-1911 : ${total - echecs}/${total}` : `✓ beebs-photos-import-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
