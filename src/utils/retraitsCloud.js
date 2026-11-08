// ═══════════════════════════════════════════════════════════════════════════
// LES RETRAITS BLOQUÉS, DITS À UN CLIENT FILLSELL CLOUD (08/11/2026, U3 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un client Cloud n'a ni Chrome ni ordinateur : c'est FillSell Cloud qui retire ses annonces. Les phrases de
// utils/retraitsBloques.js gardent leur sens, seul le geste change :
//   · « ouvre (ta boutique X) dans Chrome, sur ton ordinateur » → « connecte ta boutique X à FillSell Cloud » ;
//   · « ouvre Chrome sur ton ordinateur » (l'ordinateur muet) → FillSell Cloud la retire dès qu'il reprend ;
//   · « reconnecte-toi à X dans Chrome, sur ton ordinateur » → « reconnecte X à FillSell Cloud » ;
//   · « sur ton ordinateur, X affiche « compte bloqué » » → « dans FillSell Cloud, … ».
// Pur ; rien ne change pour un compte qui n'est pas client Cloud. Testé par selftest:retraits-cloud.

const MAJ = (s, modele) => (modele && modele[0] === modele[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s);

const FR = [
  // Boutique Vinted à ouvrir → la connecter à FillSell Cloud.
  [/([Oo])uvre ((?:ta boutique|tes boutiques|cette boutique|la boutique Vinted qui (?:la|les) porte)[^:—]*?) (?:sur vinted\.fr )?dans Chrome(?:, sur ton ordinateur)?/g,
    (m, o, quoi) => MAJ(`connecte ${quoi} à FillSell Cloud`, o)],
  // L'ordinateur muet → FillSell Cloud reprend seul.
  [/([Oo])uvre Chrome sur ton ordinateur pour que FillSell (les|la) retire/g, (m, o, la) => MAJ(`FillSell Cloud ${la} retirera dès qu'il reprend`, o)],
  [/([Oo])uvre Chrome sur ton ordinateur pour la retirer/g, (m, o) => MAJ("FillSell Cloud la retirera dès qu'il reprend", o)],
  [/([Oo])uvre Chrome sur ton ordinateur[,:] FillSell (\S+) retirera aussitôt/g, (m, o, la) => MAJ(`FillSell Cloud ${la} retirera dès qu'il reprend`, o)],
  [/([Oo])uvre Chrome sur ton ordinateur/g, (m, o) => MAJ('attends que FillSell Cloud reprenne', o)],
  // Reconnexion.
  [/tant que tu ne te reconnectes pas à (.+?) dans Chrome, sur ton ordinateur/g, (m, nom) => `tant que tu ne reconnectes pas ${nom} à FillSell Cloud`],
  [/([Rr])econnecte-toi à (.+?) dans Chrome, sur ton ordinateur/g, (m, r, nom) => MAJ(`reconnecte ${nom} à FillSell Cloud`, r)],
  // Filet : ce qui resterait de « … dans Chrome (, sur ton ordinateur) » (morceaux de phrase composés ailleurs).
  [/ (?:sur vinted\.fr )?dans Chrome(?:, sur ton ordinateur)?/g, () => ' dans FillSell Cloud'],
  // Compte bloqué.
  [/sur ton ordinateur, /g, () => 'dans FillSell Cloud, '],
  [/ sur ton ordinateur/g, () => ' dans FillSell Cloud'],
  [/ depuis ton ordinateur/g, () => ' depuis FillSell Cloud'],
];
const EN = [
  [/([Oo])pen ((?:your shop|your shops|that shop|the Vinted shop that holds (?:it|them))[^:—]*?) (?:on vinted\.fr )?in Chrome(?:, on your computer)?/g,
    (m, o, quoi) => MAJ(`connect ${quoi} to FillSell Cloud`, o)],
  [/([Oo])pen Chrome on your computer so FillSell can remove (them|it)/g, (m, o, la) => MAJ(`FillSell Cloud will remove ${la} as soon as it's back`, o)],
  [/([Oo])pen Chrome on your computer to remove it/g, (m, o) => MAJ("FillSell Cloud will remove it as soon as it's back", o)],
  [/([Oo])pen Chrome on your computer[,:] FillSell will remove (\S+) right away/g, (m, o, la) => MAJ(`FillSell Cloud will remove ${la} as soon as it's back`, o)],
  [/([Oo])pen Chrome on your computer/g, (m, o) => MAJ('wait for FillSell Cloud to be back', o)],
  [/until you sign back in to (.+?) in Chrome, on your computer/g, (m, nom) => `until you reconnect ${nom} to FillSell Cloud`],
  [/([Ss])ign back in to (.+?) in Chrome, on your computer/g, (m, s, nom) => MAJ(`reconnect ${nom} to FillSell Cloud`, s)],
  [/ (?:on vinted\.fr )?in Chrome(?:, on your computer)?/g, () => ' in FillSell Cloud'],
  [/on your computer, /g, () => 'in FillSell Cloud, '],
  [/ on your computer/g, () => ' in FillSell Cloud'],
  [/ from your computer/g, () => ' from FillSell Cloud'],
];

/** La phrase d'un retrait bloqué pour un client Cloud (pur). `cloud` faux → la phrase telle quelle. */
export function retraitPourLeCloud(texte, cloud) {
  if (!cloud || typeof texte !== 'string') return texte;
  return [...FR, ...EN].reduce((t, [de, vers]) => t.replace(de, vers), texte);
}

/** Même chose, en profondeur (un objet de ligne { titre, detail, … } ou une liste). */
export function retraitsPourLeCloud(valeur, cloud) {
  if (!cloud) return valeur;
  if (typeof valeur === 'string') return retraitPourLeCloud(valeur, true);
  if (Array.isArray(valeur)) return valeur.map((v) => retraitsPourLeCloud(v, true));
  if (valeur && typeof valeur === 'object' && Object.getPrototypeOf(valeur) === Object.prototype) {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, retraitsPourLeCloud(v, true)]));
  }
  return valeur;
}
