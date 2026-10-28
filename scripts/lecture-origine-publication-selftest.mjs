// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE D'ORIGINE JUSTE AVANT LA PUBLICATION (28/10/2026 — Juliette, Petite planète, Cédric GRIZSTYLE)
//   npm run selftest:lecture-origine-publication
// ═══════════════════════════════════════════════════════════════════════════
// Du 25 au 28/10, « Publier » sur une fiche importée de Vinted sans description échouait (usage_logs
// action_app_ratee : lecture_origine_en_attente / _abandonnee / _sans_lecteur) et « rédiger » répondait « Le souci
// vient de nos serveurs ». Causes prouvées en base et dans les journaux (docs/enquetes/lecture-origine-2810/RAPPORT.md) :
//   1. sur un téléphone, l'écran d'attente disait « Ferme, et publie dès qu'elle est lue » et se fermait d'un appui à
//      côté — 16 écrans fermés après 0 à 16 s, alors que l'ordinateur lisait la page 12 s à 2 min plus tard ;
//   2. Microsoft Edge : l'onglet Vinted de travail en veille — 1 072 lectures de 20 s ratées, et ces trois fiches
//      ratées passaient devant la nouvelle à chaque cycle (testé dans lecture-page-publique-selftest) ;
//   3. le lot lisait ses pages Vinted en rafale (15 en 17 s) → 429 de Vinted, toute lecture du poste coupée 6 h ;
//   4. generate-listing : « CPU Time exceeded » (HTTP 546) sur 6 photos retouchées — le décodage base64 ;
//   5. un 401 (session fermée côté serveur) affiché « Le souci vient de nos serveurs ».
// Exécute le code LIVRÉ (règles pures) et lit le câblage dans les composants.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const R = await import("../src/publication/attenteLectureRegles.js");
const T = await import("../src/publication/texteDuVendeur.js");

// ── 1. L'attente tient, puis a ses issues ───────────────────────────────────
console.log("1. Avec un lecteur : l'attente tient 3 min, puis les issues s'ajoutent (la relecture continue)");
{
  const poste = { disponible: true, ou: "poste", raison: null, version: "0.6.148", vuLe: "2026-10-27T19:46:30.000Z", allume: true };
  ok(R.lecteurEnRetard(poste, 60_000) === poste && R.issuesSansLecteur(R.lecteurEnRetard(poste, 179_000)).length === 0,
    "moins de 3 min : le lecteur reste disponible, aucune issue d'écriture (règle du 25/10)");
  const retard = R.lecteurEnRetard(poste, R.ATTENTE_LECTEUR_MAX_MS);
  ok(retard.disponible === false && retard.raison === "lecture_en_retard" && retard.ou === "poste" && retard.vuLe === poste.vuLe,
    "3 min sans lecture : en retard (raison lecture_en_retard), l'ordinateur et son heure gardés");
  ok(R.issuesSansLecteur(retard).map((x) => x.cle).join(",") === "ecrire,rediger,attendre", "les trois issues du « sans lecteur » : écrire, faire rédiger, attendre");
  const maintenant = Date.parse("2026-10-27T19:50:30.000Z");
  const ph = R.phraseSansLecteur(retard, { maintenant });
  ok(/ton ordinateur ne l'a pas encore lue \(vu pour la dernière fois à 20:46\)\./.test(ph), "la phrase vraie, heure de Paris", ph);
  ok(!/éteint|mettre à jour/.test(ph), "jamais « éteint » ni « mettre à jour » pour un ordinateur vu il y a 4 min", ph);
  ok(/n'a pas encore pu la lire/.test(R.phraseSansLecteur(R.lecteurEnRetard({ disponible: true, ou: "ici", version: "0.6.148" }, 200_000), { maintenant })),
    "sur l'ordinateur lui-même : « l'extension de cet ordinateur n'a pas encore pu la lire »");
  ok(/^La lecture continue : dès qu'elle aboutit, l'écran de publication s'ouvre tout seul\.$/.test(R.texteAttenteSansLecteur(retard, { contexte: "stepper" }))
    && /l'article se prépare\.$/.test(R.texteAttenteSansLecteur(retard, { contexte: "lot" })), "« attendre » en retard : la lecture continue, l'écran s'ouvre seul");
  const inconnu = R.lecteurEnRetard(null, 200_000);
  ok(inconnu?.disponible === false && R.issuesSansLecteur(inconnu).length === 3, "lecteur inconnu (profil illisible) : 3 min sans lecture, les issues aussi");
  const sans = { disponible: false, ou: null, raison: "ordinateur_eteint", vuLe: "2026-10-28T00:50:10.383Z" };
  ok(R.lecteurEnRetard(sans, 999_999) === sans, "sans lecteur : rien ne change (la phrase d'avant)");
  const fr = R.texteAttenteParOrdinateur("fr");
  ok(/Ton ordinateur \(son extension FillSell\) lit ta description Vinted/.test(fr) && /garde cet écran ouvert/.test(fr) && !/\bFerme\b/.test(fr),
    "téléphone : l'ordinateur lit, garder l'écran ouvert — jamais « Ferme »", fr);
}

// ── 2. Le câblage de l'écran (stepper) et du lot ────────────────────────────
console.log("2. Câblage : écran d'attente (stepper), lot, Stock");
{
  const e = lire("src/publication/AttenteLectureOrigine.jsx");
  ok(/const lecteurVu = mode === "attente" \? lecteurEnRetard\(lecteur, Math\.max\(0, horloge - debutAttente\)\) : lecteur;/.test(e)
    && /const sansLecteur = lecteurVu\?\.disponible === false;/.test(e), "écran : le lecteur vu après l'attente (en retard → les issues)");
  ok(/texteAttenteSansLecteur\(lecteurVu, \{ lang, contexte: "stepper" \}\)/.test(e) && /phraseSansLecteur\(lecteurVu, \{ lang, maintenant: horloge \}\)/.test(e),
    "écran : la phrase et l'attente disent la lecture en retard");
  ok(/onClick=\{mode === "choix" \? fermer : undefined\}/.test(e), "un appui à côté ne ferme que l'écran des choix (jamais une attente ni une saisie)");
  ok(/setMode\(issuesSansLecteur\(lecteur\)\.length \? "choix" : "attente"\)/.test(e), "« Retour » d'une saisie venue d'une lecture en retard : retour à l'attente, jamais un écran vide");
  ok(/ou: lecteur\?\.ou \?\? null, en_retard: lecteurVu\?\.enRetard === true/.test(e), "l'abandon dit qui lisait et si la lecture était en retard");
  ok(!/Ferme, et publie dès qu'elle est lue\."\)/.test(e) && /texteAttenteParOrdinateur\(lang\)/.test(e), "plus jamais « Ferme, et publie dès qu'elle est lue »");
  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(/const lecteur = plateformeOrigine\(item\) === "vinted" \? lecteurEnRetard\(sansLecteur\?\.lecteur \?\? null, ecoule\) : null;/.test(lot)
    && /const lecteurLigne = lecteurEnRetard\(sansLecteur\?\.lecteur \?\? null, ecouleOrigine\);/.test(lot), "lot : la même lecture en retard, sur la ligne et sa pastille");
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/lecteur: lecteur\?\.ou \?\? null, lecteur_vu_le: lecteur\?\.vuLe \?\? null, lecteur_version: lecteur\?\.version \?\? null/.test(stock),
    "Stock : « vinted_sans_extension » parle du téléphone — la trace dit quel ordinateur lit et quand il a été vu");
}

// ── 3. Jamais une rafale de pages Vinted ────────────────────────────────────
console.log("3. Pages publiques Vinted demandées par l'app : 3 d'affilée, puis une toutes les 8 à 20 s");
{
  let etat = { dernier: null, enRafale: 0 };
  const t0 = 1_000_000;
  const departs = [];
  for (let i = 0; i < 24; i++) {   // le lot de Cédric : 24 pages demandées ensemble
    const r = T.prochainDepartLectureVinted(etat, t0, { alea: () => 0 });
    etat = r.etat;
    departs.push(t0 + r.attenteMs);
  }
  ok(departs.slice(0, 3).every((d) => d === t0), "les 3 premières partent tout de suite", departs.slice(0, 4).map((d) => d - t0).join(","));
  ok(departs.slice(3).every((d, i) => d - departs[i + 2] >= 8000), "chaque suivante 8 s au moins après la précédente", departs.slice(2, 6).map((d) => d - t0).join(","));
  const max20s = Math.max(...departs.map((d) => departs.filter((x) => x >= d && x < d + 20_000).length));
  ok(max20s <= 5, "jamais plus de 5 pages en 20 s (Cédric : 15 en 17 s, puis le 429)", String(max20s));
  const apresRepos = T.prochainDepartLectureVinted(etat, departs[23] + 61_000, { alea: () => 0 });
  ok(apresRepos.attenteMs === 0 && apresRepos.etat.enRafale === 1, "après 60 s sans lecture, la rafale se recharge (un clic isolé n'attend jamais)");
  const unClic = T.prochainDepartLectureVinted({ dernier: null, enRafale: 0 }, t0);
  ok(unClic.attenteMs === 0, "le stepper (une page) : aucune attente");
  const haut = T.prochainDepartLectureVinted({ dernier: t0, enRafale: 3 }, t0, { alea: () => 1 });
  ok(haut.attenteMs === 20_000, "l'écart reste dans 8 à 20 s (RYTHME_LECTURE_VINTED_MS)", String(haut.attenteMs));
  const src = lire("src/publication/texteDuVendeur.js");
  const i = src.indexOf("export async function lireDetailVintedParExtension");
  const corps = src.slice(i, src.indexOf("\n}\n", i));
  ok(/await attendreCreneau\(\);\s*const p = await lireAnnoncePubliqueParExtension/.test(corps), "la page publique attend son créneau AVANT de partir (stepper, lot, Stock : un seul créneau)");
  // Exécuté : lireDetailVintedParExtension réserve son créneau avant la page publique.
  let creneaux = 0;
  globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, postMessage() {} };
  const r = await T.lireDetailVintedParExtension("1", 5, { sonder: async () => ({ vivant: true, version: "0.6.148" }), attendreCreneau: async () => { creneaux++; } }).catch((x) => ({ erreur: String(x) }));
  ok(creneaux === 1, "exécuté : un créneau réservé par page publique", JSON.stringify(r));
}

// ── 4. La rédaction : le CPU et la session ──────────────────────────────────
console.log("4. generer_annonce : plus de « CPU Time exceeded », un 401 dit de se reconnecter");
{
  const gl = lire("supabase/functions/generate-listing/index.ts");
  ok(!/Uint8Array\.from\(atob\(b64\)/.test(gl) && /const bin = atob\(b64\);\n\s*const bytes = new Uint8Array\(bin\.length\);\n\s*for \(let k = 0; k < bin\.length; k\+\+\) bytes\[k\] = bin\.charCodeAt\(k\);/.test(gl),
    "generate-listing : l'image retouchée se décode en boucle simple");
  // Les mêmes octets, pour une fraction du calcul (mesuré : 661 ms → 24 ms pour 5 images de 1024 px).
  const brut = new Uint8Array(1_500_000); for (let k = 0; k < brut.length; k++) brut[k] = (k * 2654435761) >>> 24;
  const b64 = Buffer.from(brut).toString("base64");
  const t1 = performance.now(); const a = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const da = performance.now() - t1;
  const t2 = performance.now(); const bin = atob(b64); const b = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k); const db = performance.now() - t2;
  ok(a.length === b.length && a.every((v, k) => v === b[k]) && b.every((v, k) => v === brut[k]), "exécuté : les octets décodés sont identiques");
  ok(db * 4 < da, `exécuté : au moins 4 fois moins de calcul (${Math.round(da)} ms → ${Math.round(db)} ms pour une image)`);
  const lp = lire("src/components/ListingPreviewScreen.jsx");
  ok(/if \(reponse\?\.error && reponse\.error\.context\?\.status === 401\) \{\s*const r = await supabase\.auth\.refreshSession\(\)[^\n]*\n\s*if \(!r\?\.error && r\?\.data\?\.session\) reponse = await appelerRedaction\(\);/.test(lp),
    "401 : la session est rafraîchie et la rédaction relancée UNE fois");
  ok(/if \(httpRedaction === 401\) \{[\s\S]{0,200}Ta session a expiré : reconnecte-toi\. Rien n'a été décompté\./.test(lp), "401 qui reste : « Ta session a expiré : reconnecte-toi » — jamais « nos serveurs »");
  ok(/eServeur\.http = httpRedaction;/.test(lp) && /details: e\?\.http \? \{ http: e\.http \} : undefined/.test(lp), "le code HTTP part avec le signal (un 546 ne se cache plus derrière « nos serveurs »)");
}

// ── 5. L'extension 0.6.149 ───────────────────────────────────────────────────
console.log("5. Extension : la version qui porte le réveil de l'onglet et l'ordre des lectures");
{
  const man = JSON.parse(lire("chrome-extension/manifest.json"));
  const [a, b, c] = String(man.version).split(".").map(Number);
  ok(a > 0 || b > 6 || (b === 6 && c >= 149), "manifest ≥ 0.6.149", man.version);
  const bg = lire("chrome-extension/background.js");
  ok(/const vinted = ordreLecturesOrigine\(liste\);/.test(bg) && /noterEchecLectureOrigine\(l\.inventaire_id\);/.test(bg), "les lectures demandées : la plus récente d'abord, une ratée se repose");
  ok(/if \(etat\?\.frozen === true\) return null;/.test(bg) && /const ouvert = await getOrCreateWorkTab\("vinted", url\)/.test(bg), "un onglet gelé se réveille par un vrai chargement, puis une relecture");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} lecture-origine-publication : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
