import { messageDecodage } from '../../utils/imageDecode';

// ── Le motif d'un échec du viseur Lens, en mots (29/10, lot B 1.5) ──────────
// lensResult.error est une chaîne : le message d'analyzeLens (`❌ ${e.message}`),
// celui de la reprise (« L'analyse n'est pas allée au bout… »), ou celui d'une
// photo illisible (messageDecodage, posé par handleLensPhoto AVANT toute
// analyse — ce n'est pas un échec d'analyse). La maquette disait « Le souci
// vient de nos serveurs » : on ne le dit que quand c'est AVÉRÉ (type
// 'serveur') — pas sur une connexion coupée ni sur un envoi de photo refusé.
// On nomme la cause quand on la connaît, sinon on rend le message brut, en petit.
export function motifEchec(erreur, lang) {
  const brut = String(erreur ?? '').replace(/^❌\s*/, '').trim();
  if (brut === messageDecodage(lang) || brut === messageDecodage(lang === 'en' ? 'fr' : 'en')) {
    return { type: 'photo', detail: brut };
  }
  if (/ai_unavailable|HTTP 50[23]|overloaded/i.test(brut)) return { type: 'indispo', detail: null };
  if (/load failed|failed to fetch|networkerror|network request failed|timed? ?out/i.test(brut)) {
    return { type: 'connexion', detail: null };
  }
  // Côté serveur, avéré : la ligne lens_scans passée en echec (le texte de la reprise, qui dit déjà tout), une
  // réponse HTTP 5xx sans corps, l'« Internal error » du catch final de lens-analysis.
  if (/n'est pas allée au bout|did not finish|^HTTP 5\d\d$|^Internal error$/i.test(brut)) return { type: 'serveur', detail: null };
  return { type: 'autre', detail: brut || null };
}
