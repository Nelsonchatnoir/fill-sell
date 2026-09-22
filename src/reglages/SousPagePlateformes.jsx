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
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import EbayCompteSection from '../components/EbayCompteSection';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import OplaCategoriesMemorisees from './OplaCategoriesMemorisees';
import { MOTIFS } from '../utils/connexionPlateformes';
import { R } from './theme';
import { Groupe, Carte, Pastille, Note } from './ReglagesUI';

// Noms propres, pas du vocabulaire : ils ne se traduisent pas.
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

export default function SousPagePlateformes({ c, T }) {
  const { etats, chargement, relire } = c.sessions;
  const liste = c.plateformesSession;
  const userId = c.user?.id ?? null;

  return (
    <>
      <Groupe intitule={T.sessionsTitre}>
        <Carte>
          {liste.map((pf) => {
            const etat = etats?.[pf] ?? null;
            // ⛔ LE BOUTON NE S'AFFICHE QUE SUR UNE CERTITUDE. 'ko' est un
            //    relevé — jamais un 401, jamais un 403, jamais un null (cf.
            //    utils/sessionsPlateformes). « Jamais vérifié » n'ouvre aucun
            //    bouton : on ne demande pas de se reconnecter à quelqu'un dont
            //    on ne sait rien, c'est exactement le faux positif à éviter.
            const aConnecter = etat === 'ko';
            // Opla garde son cas à part : son mur n'est pas une session, c'est
            // la permission d'hôte opla.co, et elle ne s'accorde que dans
            // l'extension (chrome.permissions.request exige un geste sur une
            // page d'extension). Le bouton ouvre donc le popup, où le geste
            // existe depuis le 16/09 — il ne prétend pas le faire à sa place.
            const oplaAAutoriser = pf === 'opla' && etat === null;
            return (
              <div key={pf} style={{ borderBottom: `1px solid ${R.ligneDouce}` }}>
                <div className="rg-ligne" style={{ borderBottom: 'none' }}>
                  <PlatformLogo platform={pf} size={26} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: R.ink }}>{NOMS[pf] ?? pf}</span>
                  {chargement && etat === null && !oplaAAutoriser ? (
                    <Pastille ton="inconnu">…</Pastille>
                  ) : (
                    <Pastille ton={etat === 'ok' ? 'ok' : etat === 'ko' ? 'ko' : 'inconnu'}>
                      {etat === 'ok' ? T.connecte : etat === 'ko' ? T.pasConnecte : T.jamaisVerifie}
                    </Pastille>
                  )}
                </div>
                {(aConnecter || oplaAAutoriser) && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <BoutonMeConnecter
                      userId={userId}
                      platform={pf}
                      motif={oplaAAutoriser ? MOTIFS.AUTORISER_OPLA : MOTIFS.CONNEXION}
                      lang={c.lang}
                      // Au retour, l'écran relit les sessions : la pastille
                      // doit suivre sans que la personne recharge.
                      onOuverte={relire}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Carte>
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
