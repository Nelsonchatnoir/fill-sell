// ═══════════════════════════════════════════════════════════════════════════
// STOCK › SÉLECTION › « SUPPRIMER » — LA CONFIRMATION D'UN LOT (16/11/2026, point 8 — Marc, thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Rien ne part sans un second geste. À l'ouverture : la lecture du plan de chaque article (le même que pour UN
// article), puis le résumé — combien d'articles, combien d'annonces en ligne seraient retirées et où, les ventes qui
// restent au tableau de bord, les articles laissés de côté — et les MÊMES choix que pour un article. « Annuler » ne
// touche à rien. Pendant le geste : l'avancement ; à la fin : le bilan. Feuille du bas, format téléphone d'abord.
// Règles : ./reglesSuppressionLot.js ; exécution : App.jsx (planifierSuppressionLot, supprimerArticlesEnLot).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { resumeSuppressionLot, choixSuppressionLot, plateformesEnClair, modeDuChoix, phraseBilanSuppressionLot } from './reglesSuppressionLot';

const C = { ink: '#10201B', mute: '#5C6560', border: '#E7E3D8', chip: '#F6F5F1', rouge: '#B42318', fond: '#EDEAE0' };

export default function SuppressionLot({ lang = 'fr', ids = [], planifier, supprimer, onFermer, onFait }) {
  const fr = lang !== 'en';
  const [phase, setPhase] = useState('lecture'); // lecture | confirmer | en_cours | fin | erreur
  const [resume, setResume] = useState(null);
  const [avance, setAvance] = useState({ fait: 0, total: 0 });
  const [bilan, setBilan] = useState(null);
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const entrees = await planifier(ids);
        if (!vivant) return;
        setResume(resumeSuppressionLot(entrees));
        setPhase('confirmer');
      } catch {
        if (vivant) setPhase('erreur');
      }
    })();
    return () => { vivant = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- une lecture à l'ouverture, jamais à chaque rendu

  const lancer = async (choix) => {
    if (phase !== 'confirmer' || !resume?.nArticles) return;
    setPhase('en_cours');
    setAvance({ fait: 0, total: resume.nArticles });
    const b = await supprimer(resume.aSupprimer, modeDuChoix(choix), (fait, total) => setAvance({ fait, total }));
    setBilan(b);
    setPhase('fin');
    if (!b?.occupe) onFait?.(b);
  };

  const n = resume?.nArticles ?? 0;
  const bouton = (danger) => ({ width: '100%', minHeight: 48, padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
    background: danger ? `${C.rouge}0F` : C.chip, border: `1px solid ${danger ? `${C.rouge}66` : C.border}`, color: danger ? C.rouge : C.ink });
  const sous = { fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 };
  const fermable = phase !== 'en_cours';

  return createPortal(
    <div onClick={() => fermable && onFermer?.()} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label={fr ? 'Supprimer les articles sélectionnés' : 'Delete the selected items'} data-suppression-lot=""
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, background: C.fond, borderRadius: '26px 26px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: '18px 16px 22px', boxSizing: 'border-box', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 8 }}>
          {phase === 'fin' ? (fr ? 'Suppression terminée' : 'Deletion done')
            : fr ? `Supprimer ${n || ids.length} article${(n || ids.length) > 1 ? 's' : ''} ?` : `Delete ${n || ids.length} item${(n || ids.length) > 1 ? 's' : ''}?`}
        </div>

        {phase === 'lecture' && (
          <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginBottom: 16 }}>
            {fr ? 'Je vérifie où ces articles sont en ligne…' : 'Checking where these items are listed…'}
          </div>
        )}
        {phase === 'erreur' && (
          <div role="alert" style={{ fontSize: 13, color: C.rouge, lineHeight: 1.5, marginBottom: 16, fontWeight: 600 }}>
            {fr ? 'Je n’ai pas pu vérifier où ces articles sont en ligne : rien n’a été supprimé. Réessaie dans un instant.'
              : 'I could not check where these items are listed: nothing was deleted. Try again in a moment.'}
          </div>
        )}

        {phase === 'confirmer' && resume && (
          <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.55, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{fr ? `Ces ${n} article${n > 1 ? 's' : ''} et ${n > 1 ? 'leur' : 'son'} historique seront supprimés de ton stock.` : `These ${n} item${n > 1 ? 's' : ''} and their history will be deleted from your stock.`}</span>
            {resume.nAnnonces > 0
              ? <span data-annonces-en-ligne="" style={{ color: C.ink, fontWeight: 600 }}>
                {fr ? `${resume.nAnnonces} annonce${resume.nAnnonces > 1 ? 's' : ''} en ligne : ${plateformesEnClair(resume.parPlateforme, lang)}.`
                  : `${resume.nAnnonces} live listing${resume.nAnnonces > 1 ? 's' : ''}: ${plateformesEnClair(resume.parPlateforme, lang)}.`}
              </span>
              : <span>{fr ? 'Aucun n’est en ligne : aucune annonce ne sera retirée.' : 'None is listed: no listing will be removed.'}</span>}
            {resume.nAvecVentes > 0 && (
              <span>{fr ? `${resume.nAvecVentes} ${resume.nAvecVentes > 1 ? 'ont' : 'a'} des ventes enregistrées : elles restent dans ton tableau de bord.`
                : `${resume.nAvecVentes} ${resume.nAvecVentes > 1 ? 'have' : 'has'} recorded sales: they stay in your dashboard.`}</span>
            )}
            {resume.exclus.length > 0 && (
              <span data-laisses-de-cote="">
                {fr ? `Laissé${resume.exclus.length > 1 ? 's' : ''} de côté (${resume.exclus.length}) : ` : `Left aside (${resume.exclus.length}): `}
                {resume.exclus.slice(0, 3).map((x) => `${x.titre} (${x.motif === 'vente_a_confirmer' ? (fr ? 'vente à confirmer d’abord' : 'sale to confirm first') : (fr ? 'vérification impossible' : 'could not check')})`).join(' · ')}
                {resume.exclus.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
        )}

        {phase === 'en_cours' && (
          <div aria-live="polite" style={{ fontSize: 13, color: C.ink, fontWeight: 600, marginBottom: 16 }}>
            {fr ? `Suppression… ${avance.fait}/${avance.total}` : `Deleting… ${avance.fait}/${avance.total}`}
            <div style={{ fontSize: 12, color: C.mute, fontWeight: 400, marginTop: 4 }}>{fr ? 'Garde l’app ouverte jusqu’à la fin.' : 'Keep the app open until it’s done.'}</div>
          </div>
        )}

        {phase === 'fin' && (
          <div aria-live="polite" style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, marginBottom: 16 }}>
            {phraseBilanSuppressionLot(bilan, lang)}
            {(bilan?.echecs?.length ?? 0) > 0 && (
              <div style={{ fontSize: 12, color: C.rouge, marginTop: 6 }}>{bilan.echecs.slice(0, 3).map((e) => e.titre).join(' · ')}{bilan.echecs.length > 3 ? '…' : ''}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phase === 'confirmer' && choixSuppressionLot(resume).map((c) => (
            <button key={c} type="button" data-choix-suppression={c} onClick={() => lancer(c)} style={bouton(c !== 'fiche_seule')}>
              {c === 'avec_retrait' && (fr ? `Retirer aussi ${resume.nAnnonces > 1 ? `les ${resume.nAnnonces} annonces` : 'l’annonce'} et supprimer ${n > 1 ? `les ${n} articles` : 'l’article'}` : `Also remove ${resume.nAnnonces > 1 ? `the ${resume.nAnnonces} listings` : 'the listing'} and delete ${n > 1 ? `the ${n} items` : 'the item'}`)}
              {c === 'fiche_seule' && (fr ? `Supprimer ${n > 1 ? 'les fiches' : 'la fiche'}, laisser les annonces en ligne` : `Delete the item${n > 1 ? 's' : ''}, leave the listings online`)}
              {c === 'simple' && (fr ? `Supprimer ${n > 1 ? `les ${n} articles` : 'l’article'}` : `Delete ${n > 1 ? `the ${n} items` : 'the item'}`)}
              <div style={sous}>
                {c === 'avec_retrait' && (fr ? 'Les retraits partent dans la file, une annonce à la fois, puis les articles sont supprimés' : 'Removals go through the queue, one listing at a time, then the items are deleted')}
                {c === 'fiche_seule' && (fr ? 'Elles réapparaissent dans « Rattacher », prêtes à être rattachées' : 'They reappear under “Match”, ready to be linked')}
                {c === 'simple' && (fr ? 'Aucune plateforme n’est touchée' : 'No platform is touched')}
              </div>
            </button>
          ))}
          {fermable && (
            <button type="button" data-annuler-suppression="" onClick={() => onFermer?.()} style={{ ...bouton(false), textAlign: 'center', fontWeight: 700 }}>
              {phase === 'fin' ? (fr ? 'Fermer' : 'Close') : (fr ? 'Annuler' : 'Cancel')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
