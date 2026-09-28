// Extrait le texte d'une déclaration `function NOM(` (ou `async function NOM(`)
// d'un fichier JS, source LISIBLE OU MINIFIÉE (le minifieur de l'extension
// garde les noms de niveau supérieur, cf. minify-extension.mjs).
//
// Pourquoi pas un simple comptage d'accolades : un gabarit comme
// `"item":\\{"id":${x}` ou une classe de regex `[^{}]` fausse le compte. Ce
// lecteur saute commentaires, chaînes, gabarits (avec ${…} imbriqués, eux-mêmes
// lus comme du code) et littéraux de regex avant de compter.
export function extraireFonctionJs(source, nom) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${nom.replace(/\$/g, "\\$")}\\s*\\(`, "g");
  const m = re.exec(source);
  if (!m) throw new Error(`fonction ${nom} introuvable`);
  // Fin des paramètres : ils peuvent porter des accolades (déstructuration).
  const finParams = finDeGroupe(source, m.index + m[0].length, "(", ")");
  const ouvre = source.indexOf("{", finParams + 1);
  const ferme = finDeGroupe(source, ouvre + 1, "{", "}");
  return source.slice(m.index, ferme + 1);
}

const MOTS_AVANT_REGEX = new Set([
  "return", "typeof", "case", "in", "of", "void", "delete", "instanceof", "new", "else", "do", "yield", "await", "throw",
]);
const regexPeutSuivre = (c) => /[(,=:[!&|?{};+\-*%<>~^]/.test(c);

// i = juste APRÈS le caractère ouvrant ; rend l'index du fermant qui ramène la
// profondeur à zéro.
function finDeGroupe(source, i, ouvrant, fermant) {
  const n = source.length;
  let prof = 1;
  let dernier = ouvrant;
  for (; i < n; i++) {
    const c = source[i];
    const s = source[i + 1];
    if (c === "/" && s === "/") { i = source.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && s === "*") { i = source.indexOf("*/", i + 2) + 1; continue; }
    if (c === '"' || c === "'") {
      for (i++; i < n && source[i] !== c; i++) if (source[i] === "\\") i++;
      dernier = "a"; continue;
    }
    if (c === "`") { i = finDeGabarit(source, i); dernier = "a"; continue; }
    if (c === "/" && regexPeutSuivre(dernier)) {
      let classe = false;
      for (i++; i < n; i++) {
        const d = source[i];
        if (d === "\\") { i++; continue; }
        if (d === "[") classe = true;
        else if (d === "]") classe = false;
        else if (d === "/" && !classe) break;
      }
      dernier = "a"; continue;
    }
    if (/\s/.test(c)) continue;
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j++;
      dernier = MOTS_AVANT_REGEX.has(source.slice(i, j)) ? "(" : "a";
      i = j - 1;
      continue;
    }
    if (c === ouvrant) prof++;
    else if (c === fermant) { prof--; if (prof === 0) return i; }
    dernier = /[0-9.]/.test(c) ? "a" : c;
  }
  throw new Error(`groupe ${ouvrant}${fermant} non refermé`);
}

// i est sur le « ` » ouvrant ; rend l'index du « ` » fermant.
function finDeGabarit(source, i) {
  for (i++; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") { i++; continue; }
    if (c === "`") return i;
    if (c === "$" && source[i + 1] === "{") i = finDeGroupe(source, i + 2, "{", "}");
  }
  throw new Error("gabarit non refermé");
}
