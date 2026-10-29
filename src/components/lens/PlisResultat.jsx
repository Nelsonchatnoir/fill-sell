import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import AnalyseMarche from '../AnalyseMarche';

// ═══════════════════════════════════════════════════════════════════════════
// LES PLIS DE L'ÉCRAN DE RÉSULTAT (29/10, lot B 1.5)
// ═══════════════════════════════════════════════════════════════════════════
// « Détail du marché » et « Tes photos du scan », repliés par défaut (maquette
// LensResultat) : la reconnaissance de l'objet, le prix et les actions passent
// devant, le reste attend qu'on le demande — la règle du 15/09, inchangée.

export function Pli({ titre, info, children, ouvertParDefaut = false }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  return (
    <div className="lns-pli">
      <button type="button" className="lns-pli-bouton" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <span className="lns-pli-titre">{titre}</span>
        {info && <span className="lns-pli-info">{info}</span>}
        <ChevronDown className="lns-pli-chevron" size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {ouvert && <div className="lns-pli-corps">{children}</div>}
    </div>
  );
}

// Le contenu du pli « Détail du marché » : LE composant partagé avec le
// stepper (AnalyseMarche, section "details" — annonces comparables, fourchette,
// vitesse, plateformes, conseils, note du modèle), jamais une copie.
// AnalyseMarche porte son propre pliant, fermé par défaut et sans prop pour
// l'ouvrir : notre pli l'ouvre d'un clic au montage, puis son bouton est masqué
// (il ferait doublon avec l'en-tête du pli). Si ce clic ne prend pas, son
// bouton reste visible — jamais un pli vide. (Une prop `ouvert` côté
// AnalyseMarche supprimerait ce détour : fichier hors du périmètre du lot.)
export function DetailMarche({ result, prixAchat, lang, currency }) {
  const ref = useRef(null);
  // Avant la peinture : le pliant s'ouvre sans qu'on voie jamais son bouton fermé.
  useLayoutEffect(() => {
    const bouton = ref.current?.querySelector('button[aria-expanded="false"]');
    if (bouton) bouton.click();
  }, []);
  return (
    <div ref={ref} className="lns-marche">
      <AnalyseMarche
        result={result}
        prixAchat={prixAchat}
        lang={lang}
        currency={currency}
        variant="verdict"
        section="details"
        masquerNotes={result.identification_incertaine === true}
        masquerDescription
      />
    </div>
  );
}
