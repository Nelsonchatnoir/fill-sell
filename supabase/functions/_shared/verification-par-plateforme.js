// (20/11/2026, retrait Beebs e59ce552 — même défaut vu le 12/11 sur un autre retrait Beebs) CHAQUE MESSAGE NOMME LA
// PLATEFORME RÉELLE DU JOB, JAMAIS UNE AUTRE. La lecture « annonce en vérification » est propre à chaque plateforme :
// le signal de Vinted (item_alert_type = delayed_publication) et son texte (« Vinted vérifie encore cette annonce… »,
// « …supprime-la toi-même dans l'appli Vinted ») ne valent que pour un job Vinted. Une extension d'avant le 20/11
// envoyait ce texte et ce signal pour un retrait Beebs ; update-job-status les rendait encore plus « Vinted » (date,
// geste dans l'appli Vinted). Ici, pur (selftest:verification-par-plateforme-2011) : on reconnaît le gabarit, on lit la
// plateforme qu'il nomme, et sur un job d'une AUTRE plateforme on rend le message et le signal de la plateforme réelle.

export const NOMS_PLATEFORMES = Object.freeze({
  vinted: 'Vinted', beebs: 'Beebs', leboncoin: 'Leboncoin', depop: 'Depop', ebay: 'eBay', opla: 'Opla',
});

const GABARIT_RE = /^(Vinted|Beebs|Leboncoin|Depop|eBay|Opla) vérifie encore cette annonce/;

/** La plateforme que nomme un message du gabarit « X vérifie encore cette annonce » (clé minuscule), ou null. */
export function plateformeNommeeVerification(texte) {
  const m = GABARIT_RE.exec(String(texte ?? ''));
  if (!m) return null;
  return Object.keys(NOMS_PLATEFORMES).find((k) => NOMS_PLATEFORMES[k] === m[1]) ?? null;
}

/** Le message d'attente d'un retrait pendant la vérification, pour la plateforme réelle du job. */
export function messageVerificationRetrait(plateforme) {
  const p = String(plateforme ?? '').toLowerCase();
  if (p === 'vinted') {
    return "Vinted vérifie encore cette annonce : elle est masquée aux acheteurs, et Vinted refuse de la retirer " +
      "tant que la vérification dure. Le retrait est retenté tout seul et part dès qu'elle se termine — rien à faire de ton côté.";
  }
  if (p === 'beebs') {
    // Le texte du bloc Beebs d'update-job-status (relevé « en vérification »), mot pour mot.
    return "Beebs vérifie encore cette annonce : elle n'est pas encore visible, et Beebs ne permet pas de la retirer " +
      "tant que la vérification dure. Le retrait est retenté tout seul et part dès qu'elle se termine — rien à faire de ton côté.";
  }
  const nom = NOMS_PLATEFORMES[p] ?? 'La plateforme';
  return `${nom} vérifie encore cette annonce et ne permet pas de la retirer tant que la vérification dure. ` +
    "Le retrait est retenté tout seul et part dès qu'elle se termine — rien à faire de ton côté.";
}

/** Le signal de Vinted (page de l'annonce : delayed_publication) — jamais sur un job d'une autre plateforme. */
export const estSignalVinted = (signal) => /delayed_publication/i.test(String(signal ?? ''));

/**
 * Le message (et les champs) d'un job dont le texte nomme une AUTRE plateforme que la sienne (pure). null quand le
 * texte n'est pas du gabarit, ou nomme bien la plateforme du job (rien à corriger). Sinon { message, pf, nommee } :
 * le message de la plateforme réelle ; `pf` = les champs avec le signal de la plateforme réelle quand celui écrit était
 * celui de Vinted (null si rien à changer). Jamais de champs fabriqués : sans `pf` d'entrée, seul le texte change.
 */
export function corrigerVerificationAutrePlateforme({ texte, plateforme, pf = null }) {
  const nommee = plateformeNommeeVerification(texte);
  const reelle = String(plateforme ?? '').toLowerCase();
  if (!nommee || !reelle || nommee === reelle) return null;
  let pfOut = null;
  const att = pf && typeof pf === 'object' ? pf.retrait_en_attente_verification : null;
  if (att && typeof att === 'object' && estSignalVinted(att.signal)) {
    pfOut = { ...pf, retrait_en_attente_verification: { ...att,
      signal: `annonce en vérification chez ${NOMS_PLATEFORMES[reelle] ?? reelle} (lue par l'extension)`,
      signal_corrige: { avant: att.signal, le: new Date().toISOString(), par: 'update-job-status (plateforme réelle du job)' } } };
  }
  return { message: messageVerificationRetrait(reelle), pf: pfOut, nommee };
}
