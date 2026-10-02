// ── « Vendu sur » + ce qui va se passer — la fenêtre « Vendre » (02/10 soir) ──
// Point 8 (demande de XEWER) : la fenêtre du bouton « Vendre » enregistre une
// VRAIE vente, distincte d'une suppression. Ce composant porte les deux
// morceaux qui en dépendent de l'article :
//   · le CHOIX de la plateforme : ses plateformes réelles d'abord (annonces en
//     ligne, pastille verte), puis « Ailleurs / en main propre » ; les autres
//     plateformes restent atteignables derrière « Autre plateforme… » (annonce
//     postée hors FillSell), jamais mises en avant ;
//   · le VERDICT : ce que la base va faire, en clair (utils/venteModale.js,
//     verdictVente) — annonce vendue gardée, autres retirées tout de suite, ou
//     « il restera N exemplaires : aucune annonce n'est retirée ».
// Aucune présélection : le lieu de la vente décide de ce qui est retiré, c'est
// la personne qui le dit (règle du 26/09).
import { useState } from 'react';
import { useAnnoncesEncoreEnLigne } from './annoncesEnLigneArticle';
import { choixPlateformesVente, verdictVente, libellePlateformeVente } from '../utils/venteModale';
import { V } from './voice/tokens';

// `enLigneConnu` : réservé aux aperçus sans session (scripts/apercu) — la
// fenêtre réelle lit toujours les annonces de l'article.
export default function ChoixVenteModale({ item, plateforme, onPlateforme, quantiteVendue = 1, lang = 'fr', oplaVisible = true, couleurs = {}, enLigneConnu = undefined }) {
  const lues = useAnnoncesEncoreEnLigne(enLigneConnu === undefined ? item : null);
  const enLigne = enLigneConnu === undefined ? lues : enLigneConnu;
  const fr = lang !== 'en';
  const teal = couleurs.teal ?? '#1B6E62';
  const texte = couleurs.text ?? '#10201B';
  const sub = couleurs.sub ?? '#6B7A75';
  const rouge = couleurs.red ?? '#C0392B';
  const { principales, autres, lu } = choixPlateformesVente({ enLigne, oplaVisible, plateformeActuelle: plateforme });
  // « Autre plateforme… » s'ouvre seule si la personne en a déjà choisi une,
  // ou si l'article n'a AUCUNE annonce en ligne connue (rien à proposer d'autre).
  const choisieDansAutres = autres.includes(plateforme);
  const [autresOuvertes, setAutresOuvertes] = useState(false);
  const montrerAutres = autresOuvertes || choisieDansAutres || (lu && principales.length === 0);
  const verdict = verdictVente({ plateforme, enLigne, quantiteStock: item?.quantite ?? 1, quantiteVendue, lang });

  const puce = (code, { enLigneSur = false } = {}) => {
    const actif = plateforme === code;
    return (
      <button key={code} type="button" data-plateforme-vente={code} onClick={() => onPlateforme(code)}
        style={{
          padding: '7px 12px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          border: `1.5px solid ${actif ? teal : 'rgba(0,0,0,0.12)'}`, background: actif ? teal : '#fff', color: actif ? '#fff' : texte,
        }}>
        {enLigneSur && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: actif ? '#fff' : '#2F9E90', flex: '0 0 auto' }} />}
        {libellePlateformeVente(code, lang)}
      </button>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: sub, marginBottom: 6 }}>
        🏪 {fr ? 'Vendu sur' : 'Sold on'} <span style={{ color: rouge }}>*</span>
      </div>
      {!lu && (
        <div style={{ fontSize: 11.5, color: sub, marginBottom: 6 }}>{fr ? 'Lecture de tes annonces…' : 'Reading your listings…'}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {principales.map((p) => puce(p.code, { enLigneSur: true }))}
        {puce('ailleurs')}
        {!montrerAutres && autres.length > 0 && (
          <button type="button" onClick={() => setAutresOuvertes(true)}
            style={{ padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: '1.5px dashed rgba(0,0,0,0.18)', background: 'transparent', color: sub }}>
            {fr ? 'Autre plateforme…' : 'Other platform…'}
          </button>
        )}
      </div>
      {montrerAutres && autres.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {autres.map((c) => puce(c))}
        </div>
      )}
      {lu && principales.length > 0 && (
        <div style={{ fontSize: 11, color: sub, marginTop: 6 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#2F9E90', marginRight: 5 }} />
          {fr ? 'en ligne aujourd’hui' : 'live today'}
        </div>
      )}
      {lu && (
        <div data-verdict-vente={verdict.ton} style={{
          marginTop: 12, borderRadius: 14, padding: '11px 13px', fontSize: 12.5, lineHeight: 1.45, fontWeight: 500,
          display: 'flex', flexDirection: 'column', gap: 4,
          ...(verdict.ton === 'retrait'
            ? { background: V.amberSoft, border: '1px solid rgba(232,149,109,0.38)', color: V.amberInk }
            : { background: '#F4F7F6', border: '1px solid rgba(0,0,0,0.06)', color: texte }),
        }}>
          {verdict.lignes.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
