// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE D'UNE RÉPONSE (bêta, 16/10/2026 nuit)
// ═══════════════════════════════════════════════════════════════════════════
// SHA-256 (hex) du texte EXACT saisi — la même que la base
// (encode(sha256(convert_to(texte,'UTF8')),'hex')) et que l'extension, qui la
// recalcule juste avant l'envoi : le texte qui part est celui qui a été écrit.
// Sans WebCrypto (contexte non sûr) : null — la base calcule alors la sienne.
export async function empreinteTexte(texte) {
  const subtil = globalThis.crypto?.subtle;
  if (!subtil) return null;
  const octets = new TextEncoder().encode(String(texte ?? ''));
  const h = await subtil.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
