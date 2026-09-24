// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — « RAYON À CHOISIR » (25/09) : la question posée quand le rayon
// envisagé a été refusé et qu'aucun rayon sûr ne l'a remplacé.
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le composant RÉEL (CarteRayon) dans
// trois états, avec les candidats RÉELS rendus par le rejeu des 33 :
//   1. un rayon trouvé, sans question — la carte d'avant, à l'identique ;
//   2. la question avec candidats (Vinted, « bobine de film ») ;
//   3. la question sans candidat (eBay, « routeur » : notre arbre n'a pas ce
//      rayon) — la recherche reste ouverte.
// Aucun compte, aucune écriture (CLAUDE.md : pas de session en automatisation).
//
//     node scripts/apercu/capture-rayon-a-choisir.mjs
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import CarteRayon from '../../src/components/CarteRayon.jsx';

// Le catalogue de champs ne se lit pas ici : aucune base.
const supabaseFactice = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }), in: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }) }), in: () => ({ eq: async () => ({ data: [] }) }) }),
  }),
};

const CAS = [
  {
    id: 'trouve', titre: '1. Rayon trouvé (inchangé)', platform: 'vinted',
    rayon: { chemin: ['Maison', 'Décoration', 'Décorations murales', 'Peintures'], id: null, choisi: false, incertain: false },
    question: null, suggestions: [],
  },
  {
    id: 'question', titre: '2. Rayon à choisir, candidats en tête', platform: 'vinted',
    rayon: null,
    question: {
      objet: 'bobine de film',
      chemins_refuses: [['Livres et médias', 'Vidéo', 'DVD']],
      candidats: [],
    },
    suggestions: [
      { chemin: ['Loisirs et collections', 'Souvenirs', 'Souvenirs TV et cinéma'], id: 4904 },
      { chemin: ['Livres et médias', 'Vidéo', 'VHS'], id: 3048 },
      { chemin: ['Livres et médias', 'Vidéo', 'Blu-ray'], id: 3044 },
      { chemin: ['Loisirs et collections', 'Souvenirs', 'Autres souvenirs'], id: 4905 },
    ],
  },
  {
    id: 'vide', titre: '3. Rayon à choisir, aucun candidat', platform: 'ebay',
    rayon: null,
    question: { objet: 'routeur', chemins_refuses: [["Téléphonie, mobilité", "Tél. mobiles: accessoires", "Chargeurs, stations d'accueil"]], candidats: [] },
    suggestions: [],
  },
];

function Carte({ cas }) {
  const [choix, setChoix] = useState(null);
  const rayon = choix ? { chemin: choix.chemin, id: choix.id ?? null, choisi: true, incertain: false } : cas.rayon;
  return (
    <section data-cas={cas.id} style={{ margin: '0 0 28px' }}>
      <h2 style={{ font: '700 13px system-ui', margin: '0 0 8px', color: '#10201B' }}>{cas.titre}</h2>
      <CarteRayon
        platform={cas.platform}
        lang="fr"
        rayon={rayon}
        question={choix ? null : cas.question}
        suggestions={cas.suggestions}
        champs={{}}
        configLocale={[]}
        supabase={supabaseFactice}
        onChoisirRayon={(c) => setChoix(c)}
        regle="nouvelle"
      />
      <div data-choix={cas.id} style={{ font: '12px system-ui', color: '#1B6E62' }}>{choix ? `choisi : ${choix.chemin.join(' › ')}` : ''}</div>
    </section>
  );
}

function Apercu() {
  return (
    <div style={{ background: '#EDEAE0', minHeight: '100vh', padding: '16px', boxSizing: 'border-box', fontFamily: 'system-ui' }}>
      {CAS.map((c) => <Carte key={c.id} cas={c} />)}
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
