// L'écran « Me connecter » — le CLIENT (téléphone). Module sans dépendance,
// partagé par l'écran de l'app (MeConnecterCloud.jsx) et par la page autonome
// que sert l'orchestrateur (test sur le compte de Nico) : une seule source.
//
// Il ne montre QU'UNE image : la page de connexion de la plateforme, ouverte
// dans le navigateur Cloud de la personne. Pas de barre d'adresse, pas de
// zoom (touch-action: none, aucun geste à deux doigts rejoué), pas de
// navigation libre (c'est le serveur qui refuse tout le reste).
// Les doigts deviennent des gestes, le clavier du téléphone du texte.
//
// ouvrirConnexion({ url, jeton | ticket, plateforme, conteneur, lang, surEtat })
//   → { fermer(), ecrire(), termine() }
// surEtat(etape, message) : 'demarrage' | 'pret' | 'info' | 'connecte' | 'refuse' |
//   'inactif' | 'non_autorise' | 'expire' | 'erreur' | 'ferme' | 'clavier' (message = true/false)

// ── (01/11, Nico : « la touche effacer ne marche pas dans Écrire ») ─────────────────────────────────────────────────
// Le champ caché qui porte le clavier était VIDE : sur iPhone, effacer dans un champ vide n'émet AUCUN événement —
// rien ne partait (le rejeu, lui, efface : mesuré dans Chromium). Le champ garde désormais un remplissage fixe :
// effacer a toujours quelque chose à effacer, l'événement part, et on l'annule (le champ ne change jamais, iOS ne voit
// jamais ce qui est tapé : ni correction, ni « . » sur deux espaces). Ce qui passerait quand même (composition, saisie
// non annulable) se lit par différence avec le remplissage, puis le champ revient.
export const REMPLISSAGE = '________';
// Effacer un mot, jusqu'au début de la ligne, à droite : les touches du rejeu (connexion.js, TOUCHES).
export const EFFACEMENTS = Object.freeze({
  deleteContentBackward: 'Backspace', deleteContentForward: 'Delete', deleteWordBackward: 'MotPrecedent',
  deleteWordForward: 'MotSuivant', deleteSoftLineBackward: 'LignePrecedente', deleteHardLineBackward: 'LignePrecedente',
});
// Le clavier d'un ordinateur (ou d'un iPad) : flèches, début, fin, échappement — rejoués tels quels.
const TOUCHES_DIRECTES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'Tab']);

/** Ce que le champ a reçu par rapport au remplissage (pure) : { effacer: n, texte }. */
export function ecartRemplissage(valeur, remplissage = REMPLISSAGE) {
  const v = String(valeur ?? '');
  let i = 0;
  while (i < v.length && i < remplissage.length && v[i] === remplissage[i]) i++;
  let j = 0;
  while (j < v.length - i && j < remplissage.length - i && v[v.length - 1 - j] === remplissage[remplissage.length - 1 - j]) j++;
  return { effacer: remplissage.length - i - j, texte: v.slice(i, v.length - j) };
}

/**
 * Le message à envoyer pour un `beforeinput` (pure) : { t:'texte', s } | { t:'touche', cle } | null (rien à envoyer),
 * et `annuler` : faux pour une composition (non annulable, lue à sa fin).
 */
export function messageSaisie(inputType, data, coller = '') {
  if (inputType === 'insertCompositionText') return { annuler: false, message: null };
  if (inputType === 'insertText' || inputType === 'insertReplacementText' || inputType === 'insertFromPaste'
      || inputType === 'insertFromDrop' || inputType === 'insertFromYank') {
    const s = data ?? coller ?? '';
    return { annuler: true, message: s ? { t: 'texte', s } : null };
  }
  if (EFFACEMENTS[inputType]) return { annuler: true, message: { t: 'touche', cle: EFFACEMENTS[inputType] } };
  if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return { annuler: true, message: { t: 'touche', cle: 'Enter' } };
  return { annuler: true, message: null };   // mise en forme, annuler/rétablir… : rien (le champ ne change pas)
}

export function ouvrirConnexion({ url, jeton = null, ticket = null, plateforme, conteneur, lang = 'fr', surEtat = () => {} }) {
  const doc = conteneur.ownerDocument;
  const largeur = Math.max(280, Math.min(540, Math.round(conteneur.clientWidth)));
  const hauteur = Math.max(420, Math.min(1000, Math.round(conteneur.clientHeight)));
  const dpr = Math.max(1, Math.min(3, (doc.defaultView?.devicePixelRatio) || 2));

  const toile = doc.createElement('canvas');
  toile.width = Math.round(largeur * dpr);
  toile.height = Math.round(hauteur * dpr);
  Object.assign(toile.style, { width: `${largeur}px`, height: `${hauteur}px`, display: 'block', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', background: '#fff' });
  toile.setAttribute('aria-label', lang === 'en' ? 'Sign-in page' : 'Page de connexion');
  const ctx = toile.getContext('2d');

  // Le champ caché qui porte le clavier du téléphone. Jamais visible, jamais
  // zoomé par iOS (16 px) ; il ne garde que son remplissage fixe (REMPLISSAGE) : on n'en garde rien.
  const champ = doc.createElement('input');
  champ.type = 'text';
  champ.autocomplete = 'off';
  champ.setAttribute('autocapitalize', 'off');
  champ.setAttribute('autocorrect', 'off');
  champ.spellcheck = false;
  Object.assign(champ.style, { position: 'absolute', left: '-1000px', top: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px' });

  conteneur.innerHTML = '';
  conteneur.style.position = conteneur.style.position || 'relative';
  conteneur.appendChild(toile);
  conteneur.appendChild(champ);

  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  let ferme = false;
  const envoyer = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

  ws.addEventListener('open', () => envoyer({ t: 'ouvrir', jeton, ticket, plateforme, largeur, hauteur, dpr, lang }));
  ws.addEventListener('message', async (ev) => {
    if (typeof ev.data === 'string') {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'etat') surEtat(m.etape, m.message ?? '');
      else if (m.t === 'clavier') surEtat('clavier', m.ouvert === true);
      return;
    }
    // Une image : 4 octets de numéro, puis le JPEG. L'accusé de réception règle le débit.
    const blob = new Blob([new Uint8Array(ev.data, 4)], { type: 'image/jpeg' });
    try {
      const img = await createImageBitmap(blob);
      ctx.drawImage(img, 0, 0, toile.width, toile.height);
      img.close?.();
    } catch { /* image abîmée : la suivante viendra */ }
    envoyer({ t: 'ack' });
  });
  ws.addEventListener('close', () => { if (!ferme) { ferme = true; surEtat('ferme', ''); } });

  // ── Les doigts → des gestes (un seul doigt ; deux doigts = rien : jamais de zoom)
  const point = (t) => { const r = toile.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  let dernierEnvoi = 0;
  toile.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const p = point(e.touches[0]);
    envoyer({ t: 'toucher', type: 'debut', ...p });
  }, { passive: false });
  toile.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const maintenant = performance.now();
    if (maintenant - dernierEnvoi < 16) return;
    dernierEnvoi = maintenant;
    envoyer({ t: 'toucher', type: 'deplacer', ...point(e.touches[0]) });
  }, { passive: false });
  toile.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    envoyer({ t: 'toucher', type: 'fin', ...(t ? point(t) : { x: 0, y: 0 }) });
  }, { passive: false });
  // Ordinateur (essai sur le web) : la souris fait le doigt, la molette défile.
  let souris = false;
  toile.addEventListener('mousedown', (e) => { souris = true; envoyer({ t: 'toucher', type: 'debut', ...point(e) }); });
  toile.addEventListener('mousemove', (e) => { if (souris) envoyer({ t: 'toucher', type: 'deplacer', ...point(e) }); });
  doc.addEventListener('mouseup', (e) => { if (souris) { souris = false; envoyer({ t: 'toucher', type: 'fin', ...point(e) }); } });
  toile.addEventListener('wheel', (e) => { e.preventDefault(); envoyer({ t: 'molette', ...point(e), dy: e.deltaY }); }, { passive: false });
  // Pas de geste de zoom (Safari).
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) toile.addEventListener(g, (e) => e.preventDefault(), { passive: false });

  // ── Le clavier du téléphone → du texte et des touches (01/11 : le champ n'est jamais vide, voir REMPLISSAGE)
  const remettre = () => {
    champ.value = REMPLISSAGE;
    // Le curseur au MILIEU : effacer (à gauche) et effacer à droite ont toujours de quoi effacer.
    const milieu = REMPLISSAGE.length / 2;
    try { champ.setSelectionRange(milieu, milieu); } catch { /* champ caché : sans effet */ }
  };
  const rattraper = () => {
    const { effacer, texte } = ecartRemplissage(champ.value);
    if (effacer > 0) envoyer({ t: 'touche', cle: 'Backspace', n: effacer });
    if (texte) envoyer({ t: 'texte', s: texte });
    if (champ.value !== REMPLISSAGE) remettre();
  };
  remettre();
  let compose = false;
  champ.addEventListener('compositionstart', () => { compose = true; });
  champ.addEventListener('compositionend', () => { compose = false; rattraper(); });
  champ.addEventListener('beforeinput', (e) => {
    if (compose || e.isComposing) return;   // composition : lue à sa fin (compositionend)
    const { annuler, message } = messageSaisie(e.inputType, e.data, e.dataTransfer?.getData('text/plain') ?? '');
    if (annuler) e.preventDefault();
    if (message) envoyer(message);
  });
  // Une saisie que le navigateur n'a pas laissé annuler : lue par différence, puis le champ revient.
  champ.addEventListener('input', (e) => { if (!compose && !e.isComposing) rattraper(); });
  champ.addEventListener('focus', remettre);
  champ.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); envoyer({ t: 'touche', cle: 'Enter' }); }
    else if (TOUCHES_DIRECTES.has(e.key)) { e.preventDefault(); envoyer({ t: 'touche', cle: e.key }); }
  });

  return {
    /** Ouvre le clavier du téléphone (à appeler DANS un geste : iOS l'exige). */
    ecrire() { champ.focus({ preventScroll: true }); remettre(); },
    /** « J'ai fini » : le serveur revérifie la connexion tout de suite. */
    termine() { envoyer({ t: 'termine' }); },
    fermer() {
      if (ferme) return;
      ferme = true;
      envoyer({ t: 'fermer' });
      try { ws.close(); } catch { /* déjà fermé */ }
      conteneur.innerHTML = '';
    },
  };
}
