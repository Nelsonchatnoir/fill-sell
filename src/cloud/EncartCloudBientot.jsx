// ═══════════════════════════════════════════════════════════════════════════
// « BIENTÔT : FILLSELL CLOUD » — L'ENCART D'ANNONCE DANS LA FEUILLE DES OFFRES (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ À RETIRER À LA SORTIE DU CLOUD : passer ENCART_CLOUD_BIENTOT à false (ou
//    supprimer ce fichier, son import et `{encartCloud}` dans
//    components/ConversionModal.jsx). Rien d'autre ne le lit.
//
// Purement INFORMATIF (demande de Nico du 06/10) :
//   · aucun bouton, aucun lien, aucun prix, aucune date, aucune liste
//     d'attente — un bloc de texte non cliquable, qui ne prend aucun geste ;
//   · placé SOUS les cartes des formules, jamais au-dessus : il n'éloigne
//     aucun bouton d'abonnement, il ne change rien au parcours d'achat ;
//   · la fonction est dite « à venir » (pastille « Bientôt ») : rien ne peut
//     laisser croire qu'elle est disponible (règles Apple et Google) ;
//   · il ne dit rien contre l'extension, qui reste ce qui marche aujourd'hui.
// Mêmes jetons que les cartes des formules (palette C, police, arrondi 22,
// bordure 1 px, fond paper). La feuille n'a pas de thème sombre : l'encart la
// suit, clair partout.
//
// MASQUÉ :
//   · pour un compte qui a (ou a eu) l'option : son état se lit par la VRAIE
//     lecture (useCloudProfil, requête à part, une fois à l'ouverture) — tant
//     qu'elle n'a pas répondu, ou si elle échoue, rien n'est montré (jamais un
//     état deviné) ;
//   · pour un compte qui voit déjà la vraie offre (témoins de
//     config/cloudOffer.js) : l'interrupteur de l'option est au-dessus des
//     cartes, « Bientôt » le contredirait.
import { Cloud } from 'lucide-react';
import { C, MENTHE, POLICE } from './theme';
import { useCloudProfil } from './useCloudProfil';
import { cloudConnexionVisible } from '../config/cloudOffer';

// L'interrupteur UNIQUE de l'encart. (Exporté avec les textes et la décision
// pure pour les tests : un seul fichier à retirer — le rafraîchissement à
// chaud de ce fichier en dev recharge la page, sans effet en production.)
export const ENCART_CLOUD_BIENTOT = true;

const TEXTES = {
  fr: {
    titre: 'FillSell Cloud',
    pastille: 'Bientôt',
    // Espace insécable avant « : » (jamais de deux-points seul en début de ligne).
    ligne: "Plus besoin d'ordinateur ni d'extension : tes annonces publiées et remises en avant, même PC éteint.",
  },
  en: {
    titre: 'FillSell Cloud',
    pastille: 'Coming soon',
    ligne: 'No computer or extension needed: your listings published and bumped, even with your PC off.',
  },
};
// eslint-disable-next-line react-refresh/only-export-components
export const textesEncartCloud = (lang) => (lang === 'en' ? TEXTES.en : TEXTES.fr);

/**
 * La décision, pure. `lecture` = ce que rend useCloudProfil.
 * Montré seulement si l'interrupteur est levé, que le compte ne voit pas la
 * vraie offre, et que son état est LU et vierge (jamais d'option, jamais
 * d'essai).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function encartCloudVisible({ interrupteur = ENCART_CLOUD_BIENTOT, offreOuverte = false, lecture = null } = {}) {
  if (!interrupteur || offreOuverte) return false;
  if (lecture?.etat !== 'ok' || !lecture.cloud) return false;
  return lecture.cloud.etat === 'aucun' && !lecture.cloud.essaiPris;
}

// Le bloc lui-même, sans aucune lecture (rendu par le composant, et par les tests).
export function EncartCloudBientotVue({ lang = 'fr' }) {
  const T = textesEncartCloud(lang);
  return (
    <section
      data-encart-cloud-bientot
      aria-label={`${T.titre} — ${T.pastille}`}
      style={{
        marginTop: 12, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 22,
        padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12, fontFamily: POLICE,
      }}
    >
      <span aria-hidden="true" style={{
        width: 30, height: 30, borderRadius: 10, flexShrink: 0, marginTop: 1,
        background: MENTHE, border: '1px solid rgba(47,158,144,0.28)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Cloud size={16} color={C.tealDeep} strokeWidth={2.2} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px' }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink }}>{T.titre}</span>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: C.tealDeep,
            background: MENTHE, border: '1px solid rgba(47,158,144,0.28)', borderRadius: 999, padding: '2px 8px',
          }}>
            {T.pastille}
          </span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: C.mute2 }}>{T.ligne}</p>
      </div>
    </section>
  );
}

export default function EncartCloudBientot({ lang = 'fr', userId = null }) {
  const offreOuverte = cloudConnexionVisible(userId);
  const lecture = useCloudProfil(userId, { actif: Boolean(ENCART_CLOUD_BIENTOT && !offreOuverte && userId) });
  if (!encartCloudVisible({ offreOuverte, lecture })) return null;
  return <EncartCloudBientotVue lang={lang} />;
}
