// Décodage des « mots encodés » d'un en-tête de mail (RFC 2047) : « =?UTF-8?Q?Test_r=C3=A9ception?= » → « Test réception ».
// (05/11 soir, Nico) Le sujet d'un mail de support s'archivait encodé tel que reçu. Module pur (Deno + Node), sans dépendance.
// Q : « _ » = espace, « =XX » = octet ; B : base64. Deux mots encodés séparés seulement par des blancs se collent (RFC 2047 § 6.2).
// Un mot illisible (jeu de caractères inconnu, base64 cassé) reste tel quel : jamais d'exception, jamais de texte perdu.
const MOT = /=\?([^?\s]+)\?([QqBb])\?([^?]*)\?=/g;

function octetsQ(texte) {
  const o = [];
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === "_") o.push(0x20);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(texte.slice(i + 1, i + 3))) { o.push(parseInt(texte.slice(i + 1, i + 3), 16)); i += 2; }
    else o.push(c.charCodeAt(0) & 0xff);
  }
  return new Uint8Array(o);
}

function octetsB(texte) {
  const bin = atob(texte.replace(/\s+/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function decoderMotsMime(valeur) {
  if (valeur == null) return valeur;
  const s = String(valeur);
  if (!s.includes("=?")) return s;
  // Les blancs ENTRE deux mots encodés ne comptent pas.
  const colle = s.replace(/(\?=)\s+(?==\?)/g, "$1");
  return colle.replace(MOT, (entier, jeu, codage, texte) => {
    try {
      const octets = codage.toUpperCase() === "Q" ? octetsQ(texte) : octetsB(texte);
      return new TextDecoder(jeu.toLowerCase().split("*")[0], { fatal: false }).decode(octets);
    } catch {
      return entier;
    }
  });
}
