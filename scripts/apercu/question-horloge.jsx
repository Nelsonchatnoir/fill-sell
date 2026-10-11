/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — l'« Horloge puzzle en bois » de Louis (job 16f1721d, A3, 12/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte la VRAIE modale « Compléter »
// (NeedsUserModal, StockTab.jsx) sur la ligne RÉELLE du job (relue en base le
// 11/10 21:00) — et, à côté, la question de dernier recours du moteur A3
// (_shared/rayon-refuse-moteur.js) sur le même job. Aucun compte, aucune
// écriture : la validation n'est jamais cliquée.
//
//     ?vue=avant   (la question telle qu'elle était posée à Louis)
//     ?vue=apres   (la question de dernier recours, si le moteur doutait)
//     node scripts/apercu/capture-question-horloge.mjs
import { createRoot } from 'react-dom/client';
import { NeedsUserModal } from '../../src/tabs/StockTab.jsx';
import { champManquant } from '../../src/utils/stockFiltres.js';
import { needsUserOuvrable } from '../../src/utils/shared.js';
import { rayonRefuseDuJob, feuillesCandidates, questionRayonRefuse, messageRayonAChoisir, CLE_REPONSE_RAYON } from '../../supabase/functions/_shared/rayon-refuse-moteur.js';

const VIVANTS = ['Figurines et accessoires', 'Loisirs créatifs', 'Activités et jouets pour bébé', 'Jeux de construction', 'Poupées, poupons et accessoires', 'Déguisements et jeux de rôle', 'Jeux éducatifs', 'Jeux et jouets électroniques', 'Jeux/jouets musicaux et instruments', 'Jeux de cirque, fidgets et gadgets', 'Jeux de sport et de plein air', 'Peluches', 'Voitures, trains et autres véhicules'];
const avant = {
  id: '16f1721d-34a6-42dd-8fe9-3e760269d29f', platform: 'vinted', action: 'republish', status: 'needs_user',
  title: 'Horloge puzzle en bois', inventaire_id: 1789889101354007,
  error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Le catalogue Vinted demande une sous-catégorie plus précise sous « Jeux et jouets ». Choisis-la parmi celles que Vinted propose — ton annonce partira ensuite toute seule. Relevé sur ton annonce — Catégorie Vinted : Enfants › Jeux et jouets. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».",
  platform_fields: {
    capture_id: '13093', republish_step: 'captured', needs_user_source: 'prevol_negatif', champs_a_completer: ['Catégorie Vinted'],
    needsUserBoucle: { categoryLevelChoice: { n: 2, valeur: null } },
    needsUserField: { target: { key: 'categoryLevelChoice', root: null }, platform: 'vinted', field_key: 'categoryLevelChoice', input_type: 'selection_only', field_label: 'Catégorie Vinted', allowed_values: VIVANTS },
    republish_snapshot: { categoryPath: ['Enfants', 'Jeux et jouets'], catalog_id: 1499, titre: 'Horloge puzzle en bois' },
  },
};
// Le doute (l'IA répond null) : la question de dernier recours, des FEUILLES.
const plan = rayonRefuseDuJob(avant);
const feuilles = feuillesCandidates({ plateforme: 'vinted', base: plan.base, enfantsVivants: plan.enfantsVivants });
const apres = {
  ...avant,
  error: messageRayonAChoisir('vinted', plan.base),
  platform_fields: {
    ...avant.platform_fields, needs_user_source: 'champ_a_choisir', champs_a_completer: ['Catégorie Vinted'],
    needsUserField: questionRayonRefuse({ plateforme: 'vinted', base: plan.base, feuilles, cleChamp: CLE_REPONSE_RAYON }),
    rayon_moteur: { plateforme: 'vinted', base: plan.base, essais: 1, doute: true, motif: 'ia_sans_choix' },
  },
};
const job = new URLSearchParams(location.search).get('vue') === 'apres' ? apres : avant;

function Apercu() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12 }}>
      <div data-surface="liste" style={{ background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 13 }}>
        <b>Liste « à compléter » :</b> <span data-libelle="liste">Vinted : il manque {champManquant(job)}</span>
        {' · '}<span data-ouvrable={String(needsUserOuvrable(job))}>bouton « Compléter » {needsUserOuvrable(job) ? 'présent' : 'ABSENT'}</span>
      </div>
      <div data-surface="message" style={{ background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, fontSize: 13 }}>{job.error}</div>
      <NeedsUserModal job={job} lang="fr" onClose={() => {}} onDone={() => {}} />
    </div>
  );
}

createRoot(document.getElementById('apercu')).render(<Apercu />);
