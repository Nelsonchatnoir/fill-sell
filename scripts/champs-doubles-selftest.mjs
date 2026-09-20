// ═══════════════════════════════════════════════════════════════════════════
// ZÉRO CHAMP EN DOUBLE, NULLE PART (2026-09-20, lot B2)
// ═══════════════════════════════════════════════════════════════════════════
// Un champ en double, c'est l'app qui demande une valeur qu'elle a déjà sous
// les yeux. Le premier cas a été trouvé à l'écran : « Univers » apparaissait
// en QUESTION et en DÉJÀ-REMPLI sur le même rayon, parce que le catalogue
// l'appelle `clothing_type` sur Vêtements et `shoes_type` sur Chaussures.
//
// Un cas corrigé ne prouve rien sur les autres. Ce script BALAIE le catalogue
// ENTIER — chaque plateforme, chaque rayon relevé — et cherche, pour chacun,
// si un champ « à compléter » a son jumeau dans « déjà rempli » sous un autre
// nom, ou si un même champ sort deux fois.
//
// Il tourne sur un instantané du catalogue (docs/catalogue-aspects.json,
// régénérable) et sur la VRAIE configuration locale, lue dans le composant :
// pas une recopie, donc pas de dérive silencieuse.
//
//   node scripts/champs-doubles-selftest.mjs
import fs from 'node:fs';
import { classerChamps, lignesDepuisConfigLocale, cleConnue } from '../src/utils/champsDuRayon.js';

// ── La configuration locale, LUE dans le composant ────────────────────────
// On la parse plutôt que de la recopier : une liste recopiée se périme, et
// c'est exactement ce genre de doublon qu'on traque.
function configLocaleDepuisSource() {
  const src = fs.readFileSync('src/components/ListingPreviewScreen.jsx', 'utf8');
  const trad = fs.readFileSync('src/i18n/translations.js', 'utf8');
  const libelle = (expr) => {
    const m = expr.match(/^t\("([^"]+)"\)$/);
    if (!m) return expr.replace(/^"|"$/g, '');
    const t = trad.match(new RegExp(`\\b${m[1]}\\s*:\\s*"([^"]*)"`));
    return t ? t[1] : m[1];
  };
  const bloc = src.slice(src.indexOf('  return {\n    vinted: ['), src.indexOf('\nconst FR_TO_EBAY_CONDITION'));
  const config = {};
  let courante = null;
  for (const ligne of bloc.split('\n')) {
    const pf = ligne.match(/^\s{4}(vinted|opla|leboncoin|beebs|ebay):\s*\[/);
    if (pf) { courante = pf[1]; config[courante] = []; continue; }
    const champ = ligne.match(/\{\s*key:"([^"]+)",\s*label:\s*(t\("[^"]+"\)|"[^"]*")/);
    if (champ && courante) config[courante].push({ key: champ[1], label: libelle(champ[2]) });
  }
  return config;
}

const CATALOGUE = 'docs/catalogue-aspects.json';
if (!fs.existsSync(CATALOGUE)) {
  console.error(`Instantané absent : ${CATALOGUE}\nRégénérer par une lecture de platform_category_aspects.`);
  process.exit(1);
}
const lignes = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const config = configLocaleDepuisSource();

// ── L'article le plus RENSEIGNÉ possible ─────────────────────────────────
// C'est le pire cas pour un doublon : tout ce qu'on sait déjà est rempli,
// donc tout champ encore demandé est forcément suspect.
const PF_COMPLET = {
  etat: 'Très bon état', taille: '38', genre: 'Femme', univers: 'Femme',
  marque: 'Camaïeu', matiere: 'Coton', couleur: 'Bleu', modele: 'X',
  stockage: '128 Go', isbn: '9781234567897', format_colis: 'Moyen colis',
  age: '6 ans - 8 ans', categorie: 'Autre',
};

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

const parRayon = new Map();
for (const l of lignes) {
  const k = `${l.platform}|${l.category_key}`;
  if (!parRayon.has(k)) parRayon.set(k, []);
  parRayon.get(k).push(l);
}

let doublons = 0, rayons = 0;
const detail = [];
for (const [k, rows] of parRayon) {
  const [platform, categorie] = k.split('|');
  rayons++;
  const toutes = [...rows, ...lignesDepuisConfigLocale(config[platform] ?? [])];
  const { questions, connus } = classerChamps(toutes, PF_COMPLET, platform);

  // (a) un même LIBELLÉ des deux côtés = on demande ce qu'on affiche déjà
  const libQ = new Map(questions.map((q) => [norm(q.libelle), q]));
  for (const c of connus) {
    const q = libQ.get(norm(c.libelle));
    if (q) { doublons++; detail.push({ platform, categorie, type: 'question ET déjà-rempli', libelle: c.libelle, cleQuestion: q.cle, cleConnue: c.cle }); }
  }
  // (b) deux fois le même libellé du MÊME côté
  for (const [nom, liste] of [['questions', questions], ['déjà rempli', connus]]) {
    const vus = new Map();
    for (const e of liste) {
      const n = norm(e.libelle);
      if (vus.has(n)) { doublons++; detail.push({ platform, categorie, type: `deux fois dans ${nom}`, libelle: e.libelle, cleQuestion: vus.get(n).cle, cleConnue: e.cle }); }
      else vus.set(n, e);
    }
  }
}

console.log(`Catalogue balayé : ${lignes.length} lignes, ${rayons} rayons, ${new Set(lignes.map((l) => l.platform)).size} plateformes.\n`);
if (detail.length) {
  // Regroupé par cause : une même paire de clés se répète sur des dizaines
  // de rayons, l'afficher une fois suffit à la corriger.
  const parCause = new Map();
  for (const d of detail) {
    const c = `${d.platform} · ${d.libelle} · ${d.cleQuestion} ↔ ${d.cleConnue} · ${d.type}`;
    parCause.set(c, (parCause.get(c) ?? 0) + 1);
  }
  console.log('DOUBLONS TROUVÉS :');
  for (const [c, n] of [...parCause.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} rayon(s)  ${c}`);
  }
} else {
  console.log('Aucun champ en double.');
}

// ── Contrôle de couverture du pont de clés ───────────────────────────────
// Les clés du catalogue qu'on ne sait PAS relier à une notion connue : ce ne
// sont pas toutes des doublons (beaucoup sont des champs propres au rayon,
// légitimes), mais c'est là que les prochains doublons naîtront.
const inconnues = new Map();
for (const l of lignes) {
  if (cleConnue(l.field_key)) continue;
  const c = `${l.platform} · ${l.field_key} · « ${l.field_label} »`;
  inconnues.set(c, (inconnues.get(c) ?? 0) + 1);
}
console.log(`\nClés du catalogue sans notion connue : ${inconnues.size} distinctes.`);
for (const [c, n] of [...inconnues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)} rayon(s)  ${c}`);
}

console.log(`\n${doublons === 0 ? '✅ Zéro champ en double sur tout le catalogue.' : `❌ ${doublons} doublon(s) sur ${rayons} rayons.`}`);
process.exit(doublons === 0 ? 0 : 1);
