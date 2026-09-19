// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › MES PLATEFORMES — sessions + compte vendeur eBay (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// AJOUT (le premier des deux du lot) : l'état des sessions, que l'extension
// sonde déjà et qu'il fallait aller chercher dans le Stock. Aucune sonde
// nouvelle, aucune règle nouvelle — `etatSession` (utils/sessionsPlateformes)
// tranche exactement comme pour l'écran de publication.
//
// TROIS ÉTATS ET PAS UN DE PLUS : connecté / pas connecté / jamais vérifié.
// ⛔ « jamais vérifié » ne se maquille pas en « pas connecté » : on n'affirme
//    que ce qui a été mesuré.
//
// OPLA — la permission d'hôte opla.co est OPTIONNELLE et ne s'accorde que dans
// l'extension : `chrome.permissions.request` exige un geste dans une page
// d'extension, une page web ne peut pas la demander. Le bouton « Autoriser »
// dit donc où cliquer ; il ne prétend pas le faire à la place de la personne.
//
// Le compte vendeur eBay reste la section existante, montée telle quelle.
import { useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import EbayCompteSection from '../components/EbayCompteSection';
import OplaCategoriesMemorisees from './OplaCategoriesMemorisees';
import { R } from './theme';
import { Groupe, Carte, Pastille, Bouton, Note } from './ReglagesUI';

// Noms propres, pas du vocabulaire : ils ne se traduisent pas.
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

export default function SousPagePlateformes({ c, T }) {
  const [oplaExplique, setOplaExplique] = useState(false);
  const { etats, chargement } = c.sessions;
  const liste = c.plateformesSession;

  return (
    <>
      <Groupe intitule={T.sessionsTitre}>
        <Carte>
          {liste.map((pf) => {
            const etat = etats?.[pf] ?? null;
            const oplaAAutoriser = pf === 'opla' && etat === null;
            return (
              <div key={pf} className="rg-ligne">
                <PlatformLogo platform={pf} size={26} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: R.ink }}>{NOMS[pf] ?? pf}</span>
                {oplaAAutoriser ? (
                  <Bouton
                    ton="creux"
                    onClick={() => setOplaExplique(true)}
                    style={{ minHeight: 44, padding: '0 16px', fontSize: 13.5, color: R.tealDeep, borderColor: R.mentheBord }}
                  >
                    {T.autoriser}
                  </Bouton>
                ) : chargement && etat === null ? (
                  <Pastille ton="inconnu">…</Pastille>
                ) : (
                  <Pastille ton={etat === 'ok' ? 'ok' : etat === 'ko' ? 'ko' : 'inconnu'}>
                    {etat === 'ok' ? T.connecte : etat === 'ko' ? T.pasConnecte : T.jamaisVerifie}
                  </Pastille>
                )}
              </div>
            );
          })}
        </Carte>
        {oplaExplique && <Note>{T.autoriserOplaComment}</Note>}
        <Note>{T.sessionsNote}</Note>
      </Groupe>

      {/* Les questions de catégorie Opla déjà tranchées — le bloc ne s'affiche
          que s'il y en a. C'est le droit de changer d'avis : sans lui, une
          réponse mémorisée ne serait plus jamais redemandée. */}
      <OplaCategoriesMemorisees c={c} T={T} />

      {/* Compte vendeur eBay — la section existante, montée telle quelle :
          connexion OAuth, checklist vendeur, lieu d'expédition. Ses
          transporteurs ont leur propre entrée dans EXPÉDITION. */}
      <EbayCompteSection lang={c.lang} user={c.user} />
    </>
  );
}
