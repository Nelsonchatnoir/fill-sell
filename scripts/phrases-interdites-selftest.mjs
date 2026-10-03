// Autotest — les phrases que Nico refuse n'atteignent aucun écran
// (03/10, point 19) — npm run selftest:phrases-interdites
//
// « Tu pourras fermer cet écran », « Tu peux fermer, ça continue » : des
// phrases qui font croire que l'app ne sert à rien — c'est là que chaque
// annonce se suit. Et jamais « on publie pour toi ». Le test lit TOUT le code
// des écrans (app, extension, textes serveur) hors commentaires.
import fs from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const INTERDITES = [
  { nom: "« tu peux / pourras fermer » (l'écran, la page, l'app, l'onglet)", re: /\b(?:tu\s+)?(?:peux|pourras|pouvez|pourrez)\s+(?:la\s+|le\s+|les\s+)?fermer\b/i },
  { nom: "« fermer / quitter l'app(lication) »", re: /\b(?:fermer|quitter)\s+l['’]app(?:lication|li)?\b/i },
  { nom: "« you can close »", re: /\byou\s+can\s+(?:now\s+|then\s+)?close\b/i },
  { nom: "« on publie pour toi »", re: /\bon\s+publie\s+pour\s+toi\b/i },
];

function fichiers(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "build", "dist", "android", "ios", ".git"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.(?:js|jsx|ts|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
// Le code SANS ses commentaires (lignes //, blocs /* */ et {/* */} JSX) :
// un commentaire peut citer la phrase interdite pour dire pourquoi elle l'est.
function sansCommentaires(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n").map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");
}

const cibles = [
  ...fichiers(join(ROOT, "src")),
  ...fichiers(join(ROOT, "chrome-extension")),
  join(ROOT, "supabase/functions/_shared/textes-jobs.ts"),
];
const prises = [];
for (const f of cibles) {
  const code = sansCommentaires(fs.readFileSync(f, "utf8").split("\r\n").join("\n"));
  const lignes = code.split("\n");
  lignes.forEach((l, i) => {
    for (const x of INTERDITES) if (x.re.test(l)) prises.push(`${relative(ROOT, f)}:${i + 1} ${x.nom} — ${l.trim().slice(0, 140)}`);
  });
}
ok(cibles.length > 100, `code lu (${cibles.length} fichiers)`);
ok(prises.length === 0, "aucune phrase interdite dans un texte montré", prises.slice(0, 8).join("\n      "));

// Le test lui-même prend bien ce qu'il doit prendre.
ok(INTERDITES[0].re.test("Tu pourras fermer cet écran.") && INTERDITES[0].re.test("Tu peux fermer, ça continue.") && INTERDITES[2].re.test("You can then close this screen."),
  "les phrases du constat du 03/10 sont bien reconnues");
ok(!INTERDITES[0].re.test("Ferme la fenêtre de travail") && !INTERDITES[0].re.test("tu suis chaque annonce ici"), "une phrase normale n'est pas prise");

// Les remplaçantes, au bon endroit.
const lireR = (p) => fs.readFileSync(join(ROOT, p), "utf8");
ok(/et tu suis chaque annonce ici, dans FillSell\./.test(lireR("src/publication/EcranConfirmer.jsx")), "Confirmer : « tu suis chaque annonce ici, dans FillSell »");
ok(/en route — tu suis chacune ici\./.test(lireR("src/publication/EcranSuivi.jsx")), "Suivi : « en route — tu suis chacune ici »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ aucune phrase qui ferait croire que l'app ne sert à rien");
