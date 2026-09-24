// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › MES PLATEFORMES — UN ÉTAT VRAI, UNE ACTION (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// AVANT (18/09) : trois états calculés ici à partir de la sonde de l'extension
// (connecté / pas connecté / jamais vérifié). Le 23/09, Marine Rocher lisait
// eBay « connecté » sans avoir de compte eBay, et Opla « pas connecté » alors
// que son relevé Opla venait de lire 57 annonces : la sonde eBay teste une
// page publique, et un 401 Opla n'est pas une session fermée.
//
// DEPUIS : le SERVEUR tranche (utils/veritePlateformes ← plateformes_verite),
// le fait le plus récent et le plus précis gagne, et chaque ligne porte UNE
// phrase et UN geste :
//   · Connecté ✓ ................ rien à faire ;
//   · Connecte-toi à X ........... le bouton ouvre la page sur l'ordinateur ;
//   · Relie ton compte eBay ...... l'API, juste en dessous (recommandé) ;
//   · Autorise FillSell sur Opla . le geste existe dans l'extension ;
//   · Pas encore vérifié ......... on n'affirme rien ;
//   · « Je ne vends pas sur X » .. la plateforme sort du chemin, réversible.
// Pas de « session », pas de « sonde », pas de « vérifier » à l'écran.
// Repli : si la vérité serveur n'est pas lisible, l'ancien calcul local reste
// affiché — jamais un écran vide.
import { useCallback } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import EbayCompteSection from '../components/EbayCompteSection';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import OplaCategoriesMemorisees from './OplaCategoriesMemorisees';
import { MOTIFS } from '../utils/connexionPlateformes';
import { ETATS, etatOplaAffiche } from '../utils/veritePlateformes';
import { useOplaAcces } from '../utils/oplaAcces';
import { ilYA } from '../annonces/etatReleve';
import { R } from './theme';
import { Groupe, Carte, Pastille, Note } from './ReglagesUI';

// Noms propres, pas du vocabulaire : ils ne se traduisent pas.
const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };
const ANCRE_EBAY = 'reglages-compte-ebay';

// L'état d'AVANT (ok / ko / null) traduit dans le vocabulaire de la vérité,
// pour le repli seulement.
function depuisAncienEtat(etat) {
  if (etat === 'ok') return { etat: ETATS.CONNECTEE };
  if (etat === 'ko') return { etat: ETATS.A_CONNECTER, action: 'connexion' };
  return { etat: ETATS.INCONNUE };
}

function LienDiscret({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer',
        fontSize: 13, color: R.texteSecondaire, textDecoration: 'underline', textUnderlineOffset: 3,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function SousPagePlateformes({ c, T }) {
  const { etats } = c.sessions;
  const verite = c.verite?.verite ?? null;
  const chargement = c.verite ? c.verite.chargement : c.sessions.chargement;
  const enCours = c.verite?.enCours ?? null;
  const liste = c.plateformesSession;
  const userId = c.user?.id ?? null;
  const fr = c.lang !== 'en';
  const extensionJamaisVue = verite ? !verite.extension_vue_le : false;
  // L'AUTORISATION Opla (24/09) : le verdict du SERVEUR, le même que le
  // stepper et l'écran de suivi (utils/oplaAcces). Il corrige l'état de
  // session d'Opla — un refus connu → « à autoriser », un accès prouvé → jamais
  // « à autoriser » ; sans aucune preuve, le bouton reste (garde-fou).
  const { verdict: verdictOpla, relire: relireOpla } = useOplaAcces({ userId, actif: (liste ?? []).includes('opla') });

  const relire = useCallback(() => {
    c.verite?.relire?.();
    c.sessions?.relire?.();
    relireOpla();
  }, [c.verite, c.sessions, relireOpla]);

  const ecarter = useCallback((pf, valeur) => {
    if (!c.verite?.ecarter) return;
    c.verite.ecarter(pf, valeur);
  }, [c.verite]);

  const allerAuCompteEbay = useCallback(() => {
    document.getElementById(ANCRE_EBAY)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <Groupe intitule={T.sessionsTitre}>
        <Carte>
          {liste.map((pf) => {
            const nom = NOMS[pf] ?? pf;
            const v = verite?.plateformes?.[pf] ?? depuisAncienEtat(etats?.[pf] ?? null);
            const etat = pf === 'opla' ? etatOplaAffiche(v.etat, verdictOpla) : v.etat;
            // Opla sans AUCUNE preuve d'accès, et pas écartée : le bouton reste.
            const oplaSansPreuve = pf === 'opla' && verdictOpla === 'inconnu' && etat !== ETATS.ECARTEE && etat !== ETATS.A_AUTORISER;
            const quand = v.depuis ? ilYA(v.depuis, fr) : null;
            const ton = etat === ETATS.CONNECTEE ? 'ok'
              : (etat === ETATS.A_CONNECTER || etat === ETATS.A_AUTORISER) ? 'ko' : 'inconnu';
            const libelle = etat === ETATS.CONNECTEE ? T.veriteConnecte
              : etat === ETATS.A_CONNECTER ? T.pasConnecte
              : etat === ETATS.A_AUTORISER ? T.veriteAAutoriser
              : etat === ETATS.ECARTEE ? T.veriteEcartee
              : T.veritePasVerifie;
            const grisee = etat === ETATS.ECARTEE;

            return (
              <div key={pf} style={{ borderBottom: `1px solid ${R.ligneDouce}`, opacity: grisee ? 0.55 : 1 }}>
                <div className="rg-ligne" style={{ borderBottom: 'none' }}>
                  <PlatformLogo platform={pf} size={26} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: R.ink }}>{nom}</span>
                    {etat === ETATS.CONNECTEE && quand && (
                      <span style={{ fontSize: 12, color: R.texteSecondaire }}>{T.veriteDepuis(quand)}</span>
                    )}
                  </span>
                  {chargement && !verite && etat === ETATS.INCONNUE ? (
                    <Pastille ton="inconnu">…</Pastille>
                  ) : (
                    <Pastille ton={ton}>{libelle}</Pastille>
                  )}
                </div>

                {/* ── UNE PHRASE, UN GESTE ─────────────────────────────────── */}
                {etat === ETATS.A_CONNECTER && pf !== 'ebay' && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 14, color: R.ink }}>{T.veriteConnecteToi(nom)}</span>
                    <BoutonMeConnecter userId={userId} platform={pf} motif={MOTIFS.CONNEXION} lang={c.lang} onOuverte={relire} />
                  </div>
                )}
                {etat === ETATS.A_CONNECTER && pf === 'ebay' && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 14, color: R.ink }}>{T.veriteRelieEbay}</span>
                    <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.veriteRelieEbayComment}</span>
                    <button
                      type="button"
                      onClick={allerAuCompteEbay}
                      style={{
                        alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 999, border: 'none',
                        background: R.teal, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {T.veriteRelieEbayBouton}
                    </button>
                    <BoutonMeConnecter
                      userId={userId}
                      platform={pf}
                      motif={v.mur === 'reauth' ? MOTIFS.REAUTH_EBAY : v.mur === 'upgrade' ? MOTIFS.VENDEUR_EBAY : MOTIFS.CONNEXION}
                      lang={c.lang}
                      onOuverte={relire}
                    />
                  </div>
                )}
                {etat === ETATS.A_AUTORISER && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 14, color: R.ink }}>{T.veriteAutoriseOpla}</span>
                    <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.veriteAutoriseOplaComment}</span>
                    <BoutonMeConnecter userId={userId} platform={pf} motif={MOTIFS.AUTORISER_OPLA} lang={c.lang} onOuverte={relire} />
                  </div>
                )}
                {oplaSansPreuve && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.veriteOplaSansPreuve}</span>
                    <BoutonMeConnecter userId={userId} platform={pf} motif={MOTIFS.AUTORISER_OPLA} lang={c.lang} onOuverte={relire} />
                  </div>
                )}
                {etat === ETATS.INCONNUE && extensionJamaisVue && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.veriteExtensionJamaisVue}</span>
                  </div>
                )}

                {/* ── « JE NE VENDS PAS SUR X » — réversible, ne supprime rien ── */}
                {c.verite && etat !== ETATS.CONNECTEE && (
                  <div style={{ padding: '0 16px 12px' }}>
                    {etat === ETATS.ECARTEE ? (
                      <LienDiscret disabled={enCours === pf} onClick={() => ecarter(pf, false)}>{T.veriteFinalementSi}</LienDiscret>
                    ) : (
                      <LienDiscret disabled={enCours === pf} onClick={() => ecarter(pf, true)}>{T.veriteJeNeVendsPas(nom)}</LienDiscret>
                    )}
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
          connexion OAuth, checklist vendeur, lieu d'expédition. C'est ELLE
          que « Relie ton compte eBay » désigne, d'où l'ancre. */}
      <div id={ANCRE_EBAY}>
        <EbayCompteSection lang={c.lang} user={c.user} />
      </div>
    </>
  );
}
