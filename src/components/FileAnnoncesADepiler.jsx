// ═══════════════════════════════════════════════════════════════════════════
// « N articles attendent ta réponse » — le compteur de la file (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI MANQUAIT, mesuré le 18/09 : la revue en lot existait déjà et son
// bandeau « Passer en revue (N) » aussi — mais il est rendu APRÈS la liste des
// annonces une par une (App.jsx : `unavailableListings.map` à la l.7394, le
// bandeau de revue à la l.7541). Sur un compte à 263 alertes, il faut donc
// franchir 263 cartes avant de trouver le chemin qui les traite toutes.
// Le compteur n'était pas absent : il était enterré sous la file elle-même.
// D'où ce bloc, posé EN TÊTE de la zone des bandeaux.
//
// ⛔ UNE INFORMATION, PAS UNE INJONCTION. Aucun rouge, aucun ambre, aucun
//    « urgent », aucun point d'exclamation. Quelqu'un qui a 263 lignes en
//    retard ne doit pas ouvrir son app sur un mur de culpabilité : un
//    compteur, une phrase qui dit que rien ne s'écrit sans lui, un chemin.
// ⛔ ZÉRO À TRANCHER ⇒ RIEN. Pas de bloc vide, pas de « 0 ».
// ⛔ CE N'EST PAS UN REMPLACEMENT. Le bandeau par annonce reste, et la
//    pastille « plus en ligne » de la carte article aussi : ce sont les
//    chemins de celui qui tombe dessus par hasard. Celui-ci est le second.
const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62',
};

export default function FileAnnoncesADepiler({ lang, nb = 0, onOuvrir }) {
  if (!nb || nb <= 0) return null;
  const fr = lang !== 'en';
  const s = nb > 1;
  return (
    <div style={{
      background: '#fff', border: `1px solid ${P.border}`, borderRadius: 16,
      padding: '14px 16px', marginBottom: 12,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: P.ink, lineHeight: 1.45 }}>
          {fr ? `${nb} article${s ? 's' : ''} attend${s ? 'ent' : ''} ta réponse`
              : `${nb} item${s ? 's' : ''} ${s ? 'are' : 'is'} waiting for your answer`}
        </div>
        <div style={{ fontSize: 12.5, color: P.mute2, lineHeight: 1.5, marginTop: 2 }}>
          {fr ? 'Leur annonce n’est plus en ligne. Vendue, retirée, ou tu ne sais pas — tu réponds article par article, et rien n’est enregistré sans toi.'
              : 'Their listing is no longer online. Sold, removed, or you don’t know — you answer item by item, and nothing is recorded without you.'}
        </div>
      </div>
      <button type="button" onClick={onOuvrir}
        style={{
          padding: '9px 18px', borderRadius: 999, border: 'none', flexShrink: 0,
          background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`,
          color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
        {fr ? `Passer en revue (${nb})` : `Review (${nb})`}
      </button>
    </div>
  );
}
