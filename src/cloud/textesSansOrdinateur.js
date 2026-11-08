// ═══════════════════════════════════════════════════════════════════════════
// LES PHRASES « ORDINATEUR / CHROME / EXTENSION », DITES À UN CLIENT FILLSELL CLOUD (08/11/2026, U3 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Messagerie bêta et bordereaux : le geste est fait par l'exécutant (l'extension) — pour un client Cloud, par
// FillSell Cloud. Le sens reste ; le sujet change, et ce qui ne lui parle pas (« Chrome ouvert », « ordinateur
// allumé ») disparaît. Pur ; un compte qui n'est pas client Cloud garde la phrase telle quelle. selftest:retraits-cloud.

const MAJ = (s, modele) => (modele && modele[0] === modele[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s);

const REMPLACEMENTS = [
  // FR — gestes précis d'abord.
  [/ouvre l’extension sur ton ordinateur et autorise Depop/g, () => 'connecte Depop à FillSell Cloud'],
  [/([Oo])uvre (\S+) dans Chrome et connecte-toi/g, (m, o, pf) => MAJ(`reconnecte ${pf} à FillSell Cloud`, o)],
  [/([Cc])onnecte-toi à (\S+) dans Chrome/g, (m, c, pf) => MAJ(`reconnecte ${pf} à FillSell Cloud`, c)],
  [/\s*\(Chrome ouvert, extension active\)/g, () => ''],
  [/\s*\(éteint, ou Chrome fermé\)/g, () => ''],
  [/\s*\(éteint \?\)/g, () => ''],
  [/\s*\(ordinateur allumé\)/g, () => ''],
  [/, ordinateur allumé/g, () => ''],
  [/ quand il est allumé/g, () => ' quand il répond'],
  [/ sur ton ordinateur/g, () => ' dans FillSell Cloud'],
  [/ dans Chrome/g, () => ' dans FillSell Cloud'],
  [/([Tt])on extension FillSell/g, (m, t) => MAJ('FillSell Cloud', t)],
  [/([Tt])on extension/g, (m, t) => MAJ('FillSell Cloud', t)],
  [/\bde ton ordinateur\b/g, () => 'de FillSell Cloud'],
  [/([Tt])on ordinateur/g, (m, t) => MAJ('FillSell Cloud', t)],
  // EN
  [/open the extension on your computer and allow Depop/g, () => 'connect Depop to FillSell Cloud'],
  [/([Oo])pen (\S+) in Chrome and sign in/g, (m, o, pf) => MAJ(`reconnect ${pf} to FillSell Cloud`, o)],
  [/([Ss])ign in to (\S+) in Chrome/g, (m, s, pf) => MAJ(`reconnect ${pf} to FillSell Cloud`, s)],
  [/\s*\(Chrome open, extension (?:active|on)\)/g, () => ''],
  [/\s*\(off, or Chrome closed\)/g, () => ''],
  [/\s*\(computer on\)/g, () => ''],
  [/, computer on/g, () => ''],
  [/ when it's on/g, () => ' when it responds'],
  [/ on your computer/g, () => ' in FillSell Cloud'],
  [/ in Chrome/g, () => ' in FillSell Cloud'],
  [/([Yy])our FillSell extension/g, (m, y) => MAJ('FillSell Cloud', y)],
  [/([Yy])our extension/g, (m, y) => MAJ('FillSell Cloud', y)],
  [/([Yy])our computer’s/g, () => 'FillSell Cloud’s'],
  [/([Yy])our computer's/g, () => "FillSell Cloud's"],
  [/([Yy])our computer/g, (m, y) => MAJ('FillSell Cloud', y)],
];

/** La phrase pour un client Cloud (pur). */
export function phraseSansOrdinateur(texte, cloud) {
  if (!cloud || typeof texte !== 'string') return texte;
  return REMPLACEMENTS.reduce((t, [de, vers]) => t.replace(de, vers), texte);
}

/** En profondeur : une chaîne, une liste, un objet simple ({ ton, texte, titre, aide… }). */
export function sansOrdinateur(valeur, cloud) {
  if (!cloud) return valeur;
  if (typeof valeur === 'string') return phraseSansOrdinateur(valeur, true);
  if (Array.isArray(valeur)) return valeur.map((v) => sansOrdinateur(v, true));
  if (valeur && typeof valeur === 'object' && Object.getPrototypeOf(valeur) === Object.prototype) {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, sansOrdinateur(v, true)]));
  }
  return valeur;
}
