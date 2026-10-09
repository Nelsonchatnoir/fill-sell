// Dimensions d'une image lues dans son en-tête (09/10/2026) — sans sharp.
//
// Pourquoi pas sharp : c'est un module NATIF. Le générateur tourne sur Vercel
// à chaque déploiement ; un module natif absent ou cassé y ferait tomber le
// build de l'app entière (revue A M5). Lire largeur et hauteur ne demande que
// quelques octets d'en-tête : PNG (IHDR), JPEG (marqueur SOFn), WebP (VP8,
// VP8L, VP8X), GIF. `width`/`height` ne s'écrivent jamais à la main (revue C M7).

export function dimensionsImage(octets) {
  const b = Buffer.from(octets);
  // PNG : signature 8 octets, puis le bloc IHDR (largeur, hauteur en big-endian).
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20), format: 'png' };
  }
  // GIF : « GIF87a » / « GIF89a », largeur et hauteur en little-endian.
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') {
    return { largeur: b.readUInt16LE(6), hauteur: b.readUInt16LE(8), format: 'gif' };
  }
  // WebP : « RIFF….WEBP » puis VP8 / VP8L / VP8X.
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const bloc = b.toString('ascii', 12, 16);
    if (bloc === 'VP8 ') return { largeur: b.readUInt16LE(26) & 0x3fff, hauteur: b.readUInt16LE(28) & 0x3fff, format: 'webp' };
    if (bloc === 'VP8L') {
      const v = b.readUInt32LE(21);
      return { largeur: (v & 0x3fff) + 1, hauteur: ((v >> 14) & 0x3fff) + 1, format: 'webp' };
    }
    if (bloc === 'VP8X') {
      return { largeur: 1 + b.readUIntLE(24, 3), hauteur: 1 + b.readUIntLE(27, 3), format: 'webp' };
    }
    return null;
  }
  // JPEG : on parcourt les segments jusqu'au premier SOFn (hors DHT, JPG, DAC).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marqueur = b[i + 1];
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
        return { largeur: b.readUInt16BE(i + 7), hauteur: b.readUInt16BE(i + 5), format: 'jpeg' };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  return null;
}
