// ═══════════════════════════════════════════════════════════════════════════
// BANC « L'ACCESSOIRE D'UN OBJET N'EST JAMAIS L'OBJET » (18/10 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue, SANS IA et en lecture seule, les deux règles du texte touchées —
// l'option d'une liste fermée (_shared/option-du-texte.js) et le mot du titre
// qui choisit la catégorie (detectObjectKeywordDetail → resoudreParMot) — sur
// les annonces du parc et les listes RÉELLES des quatre plateformes, avec le
// code d'AVANT (un worktree au commit d'avant) puis celui d'APRÈS.
//   node --import ./scripts/loader-ext.mjs scripts/bancs/accessoire/banc-accessoire.mjs --racine <dossier> --sortie <f.json>
//   node scripts/bancs/accessoire/banc-accessoire.mjs --comparer avant.json apres.json
// Jeux : A = titres du parc qui disent « housse / taie / house » (toutes les
// tournures) ; T = titres témoins tirés au hasard, sans ces mots (rien ne doit
// bouger) ; V = les cas « vendeurs » du banc zéro friction (valeur choisie par
// la personne sur Leboncoin / Beebs : la vérité). Données brutes : dossier
// temporaire du poste, jamais dans le dépôt ; sortie : identifiants et chiffres.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(ICI, "..", "..", "..");
const TMP = path.join(os.tmpdir(), "fillsell-banc-accessoire");
fs.mkdirSync(TMP, { recursive: true });
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };

if (process.argv.includes("--comparer")) {
  const i = process.argv.indexOf("--comparer");
  const [a, b] = [process.argv[i + 1], process.argv[i + 2]].map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const parJeu = {};
  const changes = [];
  for (const k of new Set([...Object.keys(a.r), ...Object.keys(b.r)])) {
    const jeu = k.split("|")[0];
    const g = (parJeu[jeu] ??= { lectures: 0, changees: 0 });
    g.lectures++;
    if ((a.r[k] ?? null) !== (b.r[k] ?? null)) { g.changees++; changes.push({ k, avant: a.r[k] ?? null, apres: b.r[k] ?? null }); }
  }
  const verite = (x) => { const o = { juste: 0, faux: 0, rien: 0 }; for (const [k, v] of Object.entries(x.v)) o[v === null ? "rien" : v === x.verite[k] ? "juste" : "faux"]++; return o; };
  console.log(JSON.stringify({ par_jeu: parJeu, vendeurs_avant: verite(a), vendeurs_apres: verite(b), changements: changes }, null, 1));
  process.exit(0);
}

const RACINE = path.resolve(arg("racine", DEPOT));
const SORTIE = arg("sortie", path.join(TMP, "resultat.json"));
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { optionDepuisTextes, textesDeLAnnonce, champDeductibleDuTexte } = await imp("supabase/functions/_shared/option-du-texte.js");
const { detectObjectKeywordDetail } = await imp("src/utils/shared.js");
const { resoudreParMot } = await imp("src/utils/categorieParMot.js");
const { estChampTaille, champARecherche } = await imp("src/publication/moteur/listes.js");

function sql(nom, texte) {
  const cache = path.join(TMP, `${nom}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const f = path.join(TMP, `${nom}-${process.pid}.sql`);
  fs.writeFileSync(f, texte);
  try {
    const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", f, "-o", "json"], { cwd: DEPOT, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024 });
    const rows = JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
    fs.writeFileSync(cache, JSON.stringify(rows));
    return rows;
  } finally { fs.unlinkSync(f); }
}
const MOTS = "(housses?|taies?|houses?)";
const A = sql("titres-accessoire", `select min(id) id, titre, left(coalesce(min(description), ''), 500) description from inventaire
  where titre ~* '(^|[^a-z])${MOTS}([^a-z]|$)' group by titre order by min(id) desc limit 4000;`);
const T = sql("titres-temoins", `select id, titre, left(coalesce(description, ''), 500) description from inventaire
  where titre !~* '${MOTS}' and coalesce(description, '') !~* '${MOTS}' and length(titre) > 5 order by md5(id::text) limit 2000;`);
const L = sql("listes", `select platform, category_key, field_key, coalesce(field_label, field_key) label, allowed_values from platform_category_aspects
  where required and platform in ('vinted','leboncoin','beebs') and jsonb_typeof(allowed_values) = 'array' and jsonb_array_length(allowed_values) between 2 and 199
  union all
  select 'ebay', e.category_id::text, a->>'name', a->>'name', a->'allowedValues' from ebay_item_aspects e, jsonb_array_elements(e.aspects) a
  where a->>'name' !~* '(marque|brand|mod[eè]le)' and jsonb_typeof(a->'allowedValues') = 'array' and jsonb_array_length(a->'allowedValues') between 2 and 400
    and exists (select 1 from jsonb_array_elements_text(a->'allowedValues') v
                 where v ~* '(couette|coussin|oreiller|canap|matelas|housse|taie|drap|chaise|fauteuil|rideau|plaid|ordinateur|tablette|t[ée]l[ée]phone|v[ée]lo|guitare|valise|si[eè]ge|voiture|parapluie|poussette)');`);
const ZF = path.join(os.tmpdir(), "fillsell-banc-zero-friction");
const V = fs.existsSync(path.join(ZF, "cas-vendeurs.json")) ? JSON.parse(fs.readFileSync(path.join(ZF, "cas-vendeurs.json"), "utf8")) : [];
const CAT = fs.existsSync(path.join(ZF, "catalogue.json")) ? JSON.parse(fs.readFileSync(path.join(ZF, "catalogue.json"), "utf8")) : [];

// La porte de deduireOptionDuTexte (src/publication/moteur/listes.js), avec l'optionDepuisTextes de la RACINE.
function deduire({ platform, key, label, allowedValues, textes }) {
  if (estChampTaille(platform, key) || champARecherche(platform, key)) return null;
  if (!champDeductibleDuTexte(key, label)) return null;
  const vals = (Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v).trim()).filter(Boolean);
  if (!vals.length || (platform !== "ebay" && vals.length >= 200)) return null;
  return optionDepuisTextes({ options: vals, textes, cle: key, label }).valeur ?? null;
}
const motsDe = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
// Préfiltre : une liste n'est lue que si un VRAI mot (4 lettres ou plus) de ses options est dans l'annonce.
const vrais = (ws) => ws.filter((w) => w.length >= 4).flatMap((w) => [w, w.replace(/[sx]$/, "")]);
const indexListes = L.map((l) => ({ ...l, mots: new Set(vrais((l.allowed_values ?? []).flatMap((v) => motsDe(v)))) }));

const r = {};
const MAX = Number(arg("max", 1e9));
for (const [jeu, rows] of [["A", A], ["T", T]]) {
  let n = 0; const t0 = Date.now();
  for (const row of rows.slice(0, MAX)) {
    if (++n % 100 === 0) console.log(`  ${jeu} ${n}/${Math.min(rows.length, MAX)} (${Math.round((Date.now() - t0) / 1000)} s)`);
    const textes = textesDeLAnnonce({ titre: row.titre, description: row.description, platformFields: {} });
    const mt = new Set(vrais(motsDe(`${row.titre} ${row.description}`).map((w) => (w === "house" ? "housse" : w))));
    const det = detectObjectKeywordDetail(row.titre, row.description);
    r[`${jeu}|mot|${row.id}`] = det?.mot ?? null;
    if (jeu === "A" && det?.mot) {
      for (const pf of ["vinted", "leboncoin", "beebs", "ebay"]) {
        const x = await resoudreParMot(det.mot, pf, {}).catch(() => null);
        r[`${jeu}|categorie:${pf}|${row.id}`] = x?.certitude === "exact" ? (x.chemin ?? []).join(" > ") : null;
      }
    }
    for (const l of indexListes) {
      let commun = false;
      for (const w of mt) if (l.mots.has(w)) { commun = true; break; }
      if (!commun) continue;
      const v = deduire({ platform: l.platform, key: l.field_key, label: l.label, allowedValues: l.allowed_values, textes });
      if (v !== null) r[`${jeu}|${l.platform}:${l.category_key}:${l.field_key}|${row.id}`] = v;
    }
  }
}
// V : la vérité des vendeurs (Leboncoin, Beebs), mêmes champs que le banc zéro friction.
const v = {}; const verite = {};
const catLbc = [...new Set(CAT.filter((x) => x.platform === "leboncoin").map((x) => x.category_key))];
for (const row of V) {
  const cat = row.platform === "leboncoin" ? catLbc.find((k) => k.endsWith(` > ${row.feuille}`)) : row.feuille;
  if (!cat) continue;
  const textes = textesDeLAnnonce({ titre: row.titre, description: row.description, platformFields: {} });
  for (const l of CAT.filter((x) => x.platform === row.platform && x.category_key === cat)) {
    const vrai = row.valeurs?.[l.field_key];
    if (!vrai || !(l.allowed_values ?? []).includes(vrai)) continue;
    const k = `V|${row.platform}:${l.field_key}|${row.id}`;
    v[k] = deduire({ platform: row.platform, key: l.field_key, label: l.field_label ?? l.field_key, allowedValues: l.allowed_values, textes });
    verite[k] = vrai;
  }
}
fs.writeFileSync(SORTIE, JSON.stringify({ racine: RACINE, fait_le: new Date().toISOString(), jeux: { A: A.length, T: T.length, listes: L.length, V: Object.keys(v).length }, r, v, verite }));
console.log(`banc-accessoire : A ${A.length} titres, T ${T.length} témoins, ${L.length} listes, V ${Object.keys(v).length} cas → ${SORTIE}`);
