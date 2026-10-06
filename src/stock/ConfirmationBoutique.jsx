// ═══════════════════════════════════════════════════════════════════════════
// « SYNCHRONISER » REFUSÉ PARCE QU'UNE BOUTIQUE VINTED EST À CONFIRMER (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Le cul-de-sac du 20/09 → 06/10 : la question « C'est ta boutique ? » vivait
// dans la ligne Vinted, montée CACHÉE (display:none) depuis 9acb19d, et depuis
// e4c6454 tout appui sur « Synchroniser » était refusé tant qu'elle attendait.
// 130 refus pour 5 comptes en 30 jours, zéro confirmation.
//
// Cette feuille s'ouvre AU MOMENT du refus, quel que soit le bouton (bloc,
// pastille, carte du point à régler — mobile comme web), par un portail : elle
// s'affiche même si la ligne qui la porte est cachée. Deux choix, rien d'autre :
//   a) « Ajouter @x à mes boutiques » → la boutique est écrite PAR CE CLIC
//      (jamais en silence), puis la synchro part tout de suite ;
//   b) « Ce n'est pas ma boutique » → « Connecte-toi à ta boutique Vinted sur
//      ton ordinateur », point.
// Aucune limite de boutiques par palier n'existe dans le code ni en base
// (06/10) : l'ajout n'est donc jamais refusé ici.
import { useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import Feuille from './Feuille';
import { S, DEGRADE, OMBRE } from './jetons';

const TEXTES_CONFIRMATION_BOUTIQUE = {
  fr: {
    titre: 'Boutique Vinted',
    detectee: (b) => (b ? `Ton ordinateur est connecté à la boutique @${b}, que FillSell ne suit pas encore.` : 'Ton ordinateur est connecté à une boutique Vinted que FillSell ne suit pas encore.'),
    suivies: (l) => `FillSell suit ${l}.`,
    ajouter: (b) => (b ? `Ajouter @${b} à mes boutiques` : 'Ajouter cette boutique à mes boutiques'),
    ajout: 'Ajout…',
    pasLaMienne: 'Ce n’est pas ma boutique',
    connecteToi: 'Connecte-toi à ta boutique Vinted sur ton ordinateur',
    ok: 'OK',
    erreur: 'L’ajout n’a pas pu être enregistré. Réessaie dans un instant.',
    et: 'et',
  },
  en: {
    titre: 'Vinted shop',
    detectee: (b) => (b ? `Your computer is signed in to the shop @${b}, which FillSell doesn't follow yet.` : "Your computer is signed in to a Vinted shop FillSell doesn't follow yet."),
    suivies: (l) => `FillSell follows ${l}.`,
    ajouter: (b) => (b ? `Add @${b} to my shops` : 'Add this shop to my shops'),
    ajout: 'Adding…',
    pasLaMienne: "It's not my shop",
    connecteToi: 'Sign in to your Vinted shop on your computer',
    ok: 'OK',
    erreur: "The shop couldn't be saved. Try again in a moment.",
    et: 'and',
  },
};

function liste(noms, et) {
  const l = noms.filter(Boolean).map((n) => `@${n}`);
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} ${et} ${l[l.length - 1]}`;
}

/**
 * @param {object} p
 *   p.boutique   { login, userId } — la boutique vue par le relevé refusé
 *   p.suivies    pseudos des boutiques déjà suivies
 *   p.onAjouter  async () => ({ ok, erreur? }) — écrit la boutique et relance
 *   p.onPasLaMienne () => void — journalise le refus
 *   p.onFermer   () => void
 *   p.rappel     la personne a déjà dit « pas la mienne » et Chrome est
 *                toujours sur cette boutique : la phrase est redite en tête
 */
export default function ConfirmationBoutique({ lang = 'fr', boutique, suivies = [], onAjouter, onPasLaMienne, onFermer, rappel = false }) {
  const T = TEXTES_CONFIRMATION_BOUTIQUE[lang === 'en' ? 'en' : 'fr'];
  const [etape, setEtape] = useState('choix');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const login = boutique?.login ? String(boutique.login) : null;
  const dejaSuivies = liste(suivies, T.et);

  const ajouter = async () => {
    if (enCours) return;
    setEnCours(true); setErreur(null);
    let r;
    try { r = await onAjouter?.(); } catch (e) { r = { ok: false, erreur: String(e?.message ?? e) }; }
    setEnCours(false);
    if (!r?.ok) setErreur(T.erreur);
  };

  return (
    <Feuille lang={lang} titre={T.titre} onFermer={onFermer} etiquette={T.titre}>
      {etape === 'pas_la_mienne' ? (
        <>
          <p role="status" style={{ margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 700, color: S.ink, textAlign: 'center' }}>{T.connecteToi}</p>
          <button type="button" className="sk-btn sk-presse" onClick={onFermer}
            style={{ height: 48, borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink, fontSize: 15, fontWeight: 700 }}>
            {T.ok}
          </button>
        </>
      ) : (
        <>
          {rappel && (
            <p role="status" style={{ margin: 0, padding: '12px 16px', borderRadius: 14, background: S.ambreFond, color: S.ambreEncre, fontSize: 14, lineHeight: '20px', fontWeight: 700 }}>
              {T.connecteToi}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: S.ink }}>{T.detectee(login)}</p>
            {dejaSuivies && <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>{T.suivies(dejaSuivies)}</p>}
          </div>
          {erreur && (
            <p role="alert" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ambreEncre }}>
              <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />{erreur}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="sk-btn sk-presse" onClick={ajouter} disabled={enCours || !boutique?.userId}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '0 16px', borderRadius: 14, border: 'none', background: DEGRADE, color: '#FFFFFF', fontSize: 15, fontWeight: 700, boxShadow: OMBRE.primaire, opacity: enCours ? 0.7 : 1 }}>
              {!enCours && <Check size={18} strokeWidth={2.4} aria-hidden="true" />}
              {enCours ? T.ajout : T.ajouter(login)}
            </button>
            <button type="button" className="sk-btn sk-presse" disabled={enCours}
              onClick={() => { onPasLaMienne?.(); setEtape('pas_la_mienne'); }}
              style={{ minHeight: 48, padding: '0 16px', borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink, fontSize: 15, fontWeight: 700 }}>
              {T.pasLaMienne}
            </button>
          </div>
        </>
      )}
    </Feuille>
  );
}
