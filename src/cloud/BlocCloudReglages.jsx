// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › ABONNEMENT — LE BLOC « SANS ORDINATEUR » (04/10/2026, conception)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par reglages/SousPageAbonnement.jsx derrière cloudOfferVisible().
// L'état vient de cloudDuProfil (utils/palier.js), lu par useCloudProfil dans
// une requête À PART : lecture ratée = le bloc n'apparaît pas (jamais un état
// deviné, jamais un bouton qui ment).
//
// Les cinq états, et ce que chacun DIT :
//   · aucun          — ce que fait l'option ; « Essayer 7 jours gratuits »
//                      (ou « Voir les formules » pour un compte gratuit :
//                      l'option s'ajoute à une formule payante) ;
//   · essai          — combien de jours, la DATE et l'HEURE de bascule, le
//                      montant, et « Arrêter l'option » ;
//   · paye           — active, en plus de quelle formule ; « Arrêter
//                      l'option ». ⛔ Pas de prix : même règle que la formule
//                      (SousPageAbonnement), un tarif particulier ne se devine pas ;
//   · suspendu       — la formule payante est arrêtée, l'option ne tourne
//                      plus ; « Voir les formules » ;
//   · essai_termine  — rien n'a été facturé ; proposer de l'ajouter.
// « Arrêter » se confirme en deux temps, comme la résiliation : la phrase dit
// ce qui change (et ce qui ne change pas : la formule) AVANT le geste.
//
// ⛔ Les gestes viennent de l'hôte (`actions`) ; un geste absent = pas de
//    bouton. Aucun n'est inventé ici : arrêter, ajouter, essayer passent par
//    le paiement, que ce bloc ne touche jamais.
import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { R } from '../reglages/theme';
import { Groupe, Carte, Bouton, Note } from '../reglages/ReglagesUI';
import { CLOUD_ESSAI_JOURS, nomDuPalier, palierDesDrapeaux } from '../utils/palier';
import { cloudOfferVisible } from '../config/cloudOffer';
import { textesCloud } from './textes';
import { dateLongue, heureDe, jourDEssai } from './regles';
import { useCloudProfil } from './useCloudProfil';
import { DEGRADE_TEAL } from './theme';

function Glyphe() {
  return (
    <span aria-hidden="true" style={{
      width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: R.menthe, border: `1px solid ${R.mentheBord}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Cloud size={19} color={R.tealDeep} strokeWidth={2.1} />
    </span>
  );
}

// Point + mot, jamais une couleur seule (même vocabulaire que Réglages).
const TONS = {
  aucun: { point: R.chevron, encre: R.texteSecondaire },
  essai: { point: R.teal, encre: R.tealDeep },
  paye: { point: R.teal, encre: R.tealDeep },
  suspendu: { point: R.amber, encre: '#8A4B2C' },
  essai_termine: { point: R.chevron, encre: R.texteSecondaire },
};

function EtatPastille({ etat, children }) {
  const t = TONS[etat] ?? TONS.aucun;
  return (
    <span data-zone="etat" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: t.point }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: t.encre }}>{children}</span>
    </span>
  );
}

// La jauge de l'essai : sept segments, un par jour — le jour en cours en teal.
function JaugeEssai({ jour, T }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: CLOUD_ESSAI_JOURS }, (_, i) => (
          <span key={i} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: i < jour ? `linear-gradient(120deg,${R.teal},${R.tealDeep})` : R.border,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: R.texteSecondaire }}>{T.essaiJauge(jour, CLOUD_ESSAI_JOURS)}</span>
    </div>
  );
}

/**
 * cloud    : cloudDuProfil(…) — null pendant la lecture
 * lecture  : 'lecture' | 'ok' (l'hôte ne monte pas le bloc sur un échec)
 * nomPalier: 'Premium' | 'Pro' | 'Business' | null (gratuit)
 * actions  : { essayer?, ajouter?, arreter?, meConnecter?, voirFormules? }
 */
export default function BlocCloudReglages({ lang = 'fr', cloud, lecture = 'ok', nomPalier = null, actions = {}, arretEnCours = false }) {
  const T = textesCloud(lang);
  const [confirmer, setConfirmer] = useState(false);

  if (lecture === 'lecture' || !cloud) {
    return (
      <Groupe intitule={T.groupe}>
        <Carte pad style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Glyphe />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: R.ink }}>{T.nom}</span>
          <span style={{ fontSize: 13, color: R.texteSecondaire }}>{T.etatLecture}</span>
        </Carte>
      </Groupe>
    );
  }

  const { etat } = cloud;
  const libelleEtat = {
    aucun: T.etatAucun, essai: T.etatEssai, paye: T.etatPaye, suspendu: T.etatSuspendu, essai_termine: T.etatTermine,
  }[etat] ?? T.etatAucun;
  const gratuit = !nomPalier;
  const date = dateLongue(cloud.essaiFin, lang);
  const heure = heureDe(cloud.essaiFin, lang);
  const peutArreter = (etat === 'essai' || etat === 'paye' || etat === 'suspendu') && typeof actions.arreter === 'function';

  return (
    <Groupe intitule={T.groupe}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-cloud="reglages" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Glyphe />
            <strong style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: R.ink }}>{T.nom}</strong>
            <EtatPastille etat={etat}>{libelleEtat}</EtatPastille>
          </div>

          {etat === 'aucun' && (
            <>
              <p style={pTexte}>{T.ceQueCaFait}</p>
              {gratuit ? (
                <>
                  <p style={pNote}>{T.gratuitTexte}</p>
                  {actions.voirFormules && <Bouton ton="plein" onClick={actions.voirFormules} style={PLEIN}>{T.voirFormules}</Bouton>}
                </>
              ) : !cloud.essaiPris ? (
                <>
                  {actions.essayer && <Bouton ton="plein" onClick={actions.essayer} style={PLEIN}>{T.aucunCtaEssai}</Bouton>}
                  <p style={pNote}>{T.aucunNoteEssai}</p>
                </>
              ) : (
                <>
                  {actions.ajouter && <Bouton ton="plein" onClick={actions.ajouter} style={PLEIN}>{T.aucunCta}</Bouton>}
                  <p style={pNote}>{T.aucunNote}</p>
                </>
              )}
            </>
          )}

          {etat === 'essai' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span data-zone="reste" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: R.ink }}>{T.essaiReste(cloud.joursRestants)}</span>
                <p style={pTexte}>{T.essaiFin(date, heure, nomPalier)}</p>
              </div>
              <JaugeEssai jour={jourDEssai(cloud) ?? 1} T={T} />
            </>
          )}

          {etat === 'paye' && <p style={pTexte}>{T.payeTexte(nomPalier)}</p>}

          {etat === 'suspendu' && (
            <>
              <p style={pTexte}>{T.suspenduTexte}</p>
              {actions.voirFormules && <Bouton ton="plein" onClick={actions.voirFormules} style={PLEIN}>{T.voirFormules}</Bouton>}
            </>
          )}

          {etat === 'essai_termine' && (
            <>
              <p style={pTexte}>{T.termineTexte(date)}</p>
              <p style={pNote}>{T.termineSuite}</p>
              {!gratuit && actions.ajouter && <Bouton ton="plein" onClick={actions.ajouter} style={PLEIN}>{T.termineCta}</Bouton>}
              {gratuit && actions.voirFormules && <Bouton ton="creux" onClick={actions.voirFormules} style={{ width: '100%' }}>{T.voirFormules}</Bouton>}
            </>
          )}

          {(etat === 'essai' || etat === 'paye') && actions.meConnecter && (
            <Bouton ton="creux" onClick={actions.meConnecter} style={{ width: '100%' }}>{T.meConnecter}</Bouton>
          )}
        </div>
      </Carte>

      {/* « Arrêter l'option » — visible, jamais caché sous un menu, et confirmé
          en deux temps : la phrase dit ce qui change AVANT le geste. */}
      {peutArreter && (!confirmer ? (
        <Bouton ton="danger-creux" onClick={() => setConfirmer(true)} style={{ width: '100%', minHeight: 50 }}>{T.arreter}</Bouton>
      ) : (
        <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-cloud="arret">
            <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{T.arreterTitre}</div>
            <p style={{ ...pTexte, marginTop: 4 }}>{etat === 'essai' ? T.arreterEssai : T.arreterPaye}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Bouton ton="danger-plein" onClick={actions.arreter} enCours={arretEnCours}>{arretEnCours ? '…' : T.arreterConfirmer}</Bouton>
            <Bouton ton="creux" onClick={() => setConfirmer(false)} disabled={arretEnCours}>{T.arreterAnnuler}</Bouton>
          </div>
        </Carte>
      ))}
      {/* La note se tait pendant la confirmation, qui dit déjà la même chose. */}
      {etat === 'essai' && !confirmer && <Note>{T.essaiNote(nomPalier)}</Note>}
    </Groupe>
  );
}

const pTexte = { margin: 0, fontSize: 14, lineHeight: 1.5, color: R.ink };
// Le bouton plein de Réglages, sur la moitié PROFONDE du dégradé : le dégradé
// habituel ne donne que 3,27:1 au blanc (cf. cloud/theme.js, DEGRADE_TEAL).
const PLEIN = { width: '100%', background: DEGRADE_TEAL };
const pNote = { margin: 0, fontSize: 13, lineHeight: 1.5, color: R.texteSecondaire };

/**
 * Le bloc BRANCHÉ : drapeau, lecture à part, palier. Ce que SousPageAbonnement
 * monte — une ligne. `actions` : les gestes que l'hôte sait faire (cf. en-tête).
 */
export function BlocCloudReglagesLu({ c, actions }) {
  const visible = cloudOfferVisible(c?.user?.id);
  const lecture = useCloudProfil(c?.user?.id, { actif: visible });
  if (!visible || lecture.etat === 'echec' || lecture.etat === 'inactif') return null;
  const nomPalier = nomDuPalier(palierDesDrapeaux({ isPremium: c.isPremium, isPro: c.isPro, isBusiness: c.isBusiness }));
  return (
    <BlocCloudReglages
      lang={c.lang}
      cloud={lecture.cloud}
      lecture={lecture.etat}
      nomPalier={nomPalier}
      actions={actions}
    />
  );
}
