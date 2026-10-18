// ═══════════════════════════════════════════════════════════════════════════
// BANC SANS IA — « LONGUEUR DE LA ROBE » ET « PLATEFORME » (18/10, eBay ÷ 5)
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/bancs/zero-friction/banc-ebay-robe-plateforme.mjs [--reprendre]
// Lecture seule, aucun appel IA. VÉRITÉ = la valeur choisie par un humain et
// acceptée en ligne :
//   · A — de VRAIES annonces eBay France (API Browse) relevées par le banc IA
//     (banc-ia.mjs, fichier du poste <tmp>/fillsell-banc-zero-friction/
//     annonces-ebay.json) : 40 robes (63861), 40 jeux (139973). Absent → la
//     partie A est sautée (la relancer demande banc-ia.mjs, hors lecture seule) ;
//   · B — les annonces eBay PUBLIÉES par FillSell (banc-ebay-parc.sql).
// Règles éprouvées (celles de l'écran, mêmes modules) :
//   · Longueur de la robe : moteur/aspectsEbayAuto.longueurDeLaRobeDuTexte
//     (titre → description → feuille Vinted ; longue → Longue, mi-longue → Midi,
//     jamais courte) ;
//   · Plateforme d'un jeu : utils/jeuxVideo.plateformeEbayDuJeu(familleJeuVideo).
// Lecture : juste / faux / rien (rien = la question reste, jamais un faux posé).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ICI = path.join(RACINE, "scripts", "bancs", "zero-friction");
const TMP = path.join(os.tmpdir(), "fillsell-rejeu-ebay");
fs.mkdirSync(TMP, { recursive: true });
const REPRENDRE = process.argv.includes("--reprendre");
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { longueurDeLaRobeDuTexte } = await imp("src/publication/moteur/aspectsEbayAuto.js");
const { familleJeuVideo, plateformeEbayDuJeu } = await imp("src/utils/jeuxVideo.js");

function sql(fichier) {
  const cache = path.join(TMP, `${path.basename(fichier, ".sql")}.json`);
  if (REPRENDRE && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", fichier, "-o", "json"], { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 256 * 1024 * 1024 });
  const rows = JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
  fs.writeFileSync(cache, JSON.stringify(rows));
  return rows;
}
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Une même longueur s'écrit de plusieurs façons chez les vendeurs (« Maxi » / « Longue », « Court » / « Mini »).
const famille = (v) => { const x = norm(v); if (/maxi|long/.test(x)) return "longue"; if (/mini|court/.test(x)) return "courte"; if (/midi|mi-?long/.test(x)) return "midi"; if (/genou/.test(x)) return "genou"; if (/asym/.test(x)) return "asymetrique"; return x; };
const LISTE_ROBE = ["Au genou", "Midi", "Asymétrique"]; // la liste eBay de 63861 (FREE_TEXT)
const feuille = (c) => (Array.isArray(c) && c.length ? String(c[c.length - 1]) : "");

const bilan = {};
const note = (cle, verdict, ex) => { bilan[cle] ??= { juste: 0, faux: 0, rien: 0, faux_exemples: [] }; bilan[cle][verdict]++; if (verdict === "faux" && bilan[cle].faux_exemples.length < 6) bilan[cle].faux_exemples.push(ex); };
function robe(source, titre, description, chemin, verite) {
  const d = longueurDeLaRobeDuTexte({ allowedValues: LISTE_ROBE, mode: "FREE_TEXT",
    textes: [{ source: "titre", texte: titre }, { source: "description", texte: description }, { source: "categorie_vinted", texte: feuille(chemin) }] });
  if (!d) return note(`${source} · Longueur de la robe`, "rien");
  note(`${source} · Longueur de la robe`, famille(d.valeur) === famille(verite) ? "juste" : "faux", [String(titre).slice(0, 50), d.valeur, verite]);
}
function plateforme(source, titre, description, verite) {
  const d = plateformeEbayDuJeu(familleJeuVideo(titre, description), titre);
  if (!d) return note(`${source} · Plateforme`, "rien");
  // « ps1 » tapé par un vendeur = « Sony PlayStation 1 » : même console, juste.
  const meme = norm(d) === norm(verite) || norm(verite).replace(/\s/g, "") === norm(d).replace(/^sony playstation /, "ps").replace(/\s/g, "");
  note(`${source} · Plateforme`, meme ? "juste" : "faux", [String(titre).slice(0, 50), d, verite]);
}

// A — vraies annonces eBay France
const fA = path.join(os.tmpdir(), "fillsell-banc-zero-friction", "annonces-ebay.json");
if (fs.existsSync(fA)) {
  const A = JSON.parse(fs.readFileSync(fA, "utf8"));
  const val = (x, n) => (x.aspects ?? []).find((a) => a.name === n)?.value ?? null;
  for (const x of A["63861"] ?? []) { const v = val(x, "Longueur de la robe"); if (v) robe("A eBay", x.titre, x.description, null, v); }
  for (const x of A["139973"] ?? []) { const v = val(x, "Plateforme"); if (v && !/,/.test(v)) plateforme("A eBay", x.titre, x.description, v); }
} else console.warn(`(partie A sautée : ${fA} absent — il vient de banc-ia.mjs)`);
// B — annonces publiées par FillSell
for (const r of sql(path.join(ICI, "banc-ebay-parc.sql"))) {
  if (r.champ === "Longueur de la robe") robe("B FillSell", r.titre, r.description, r.chemin_vinted, r.valeur);
  else plateforme("B FillSell", r.titre, r.description, r.valeur);
}
console.table(Object.fromEntries(Object.entries(bilan).map(([k, b]) => [k, { juste: b.juste, faux: b.faux, rien: b.rien, precision: b.juste + b.faux ? `${Math.round((100 * b.juste) / (b.juste + b.faux))} %` : "—" }])));
for (const [k, b] of Object.entries(bilan)) for (const ex of b.faux_exemples) console.log(`  faux ${k} : ${JSON.stringify(ex)}`);
const dest = path.join(RACINE, "docs", "enquetes", "zero-friction-1810", "banc-ebay-robe-plateforme.json");
fs.writeFileSync(dest, `${JSON.stringify({ banc: "règles sans IA — Longueur de la robe, Plateforme (eBay ÷ 5)", fait_le: new Date().toISOString(),
  verite: "valeur choisie par un humain et acceptée en ligne (A : annonces eBay France ; B : annonces publiées par FillSell)",
  bilan: Object.fromEntries(Object.entries(bilan).map(([k, b]) => [k, { juste: b.juste, faux: b.faux, rien: b.rien }])) }, null, 1)}\n`);
console.log(`→ ${path.relative(RACINE, dest)}`);
