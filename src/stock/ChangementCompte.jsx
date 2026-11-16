// ═══════════════════════════════════════════════════════════════════════════
// « TON ORDINATEUR EST CONNECTÉ À UN AUTRE COMPTE LEBONCOIN » (16/11/2026, point 4 puis point 7 de Nico — ayadi007)
// ═══════════════════════════════════════════════════════════════════════════
// FillSell suit UN compte par plateforme (migration 20261116200000). Quand le dernier relevé complet de l'ordinateur lit
// un autre compte, la base pose la question (compte_plateforme_a_confirmer) ; cet écran la montre :
//   1. le compte lu et l'ancien (« Ton ancien compte n° … : N annonces ») ;
//   2. « Voir ce qui change » → remplacer_compte_plateforme(…, p_simuler = true) : le bilan, rien n'est écrit ;
//   3. « Oui, suivre ce compte » → le même appel, p_simuler = false (le compte vient du relevé, jamais d'une saisie) ;
//      « Non, garder l'ancien » → rien ne change, le geste à faire (reconnecter l'ordinateur).
// Sur le modèle de ConfirmationBoutique.jsx (Vinted). Lecture par demarrerRelecture (10 min, onglet visible), jamais de
// setInterval. Une RPC absente (migration pas encore appliquée) n'est plus redemandée : rien ne s'affiche.
// Textes : src/utils/changementCompte.js (pur). Verrou : scripts/comptes-plateforme-remplacer-selftest.mjs.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, ChevronRight, CircleAlert } from 'lucide-react';
import Feuille from './Feuille';
import { S, DEGRADE, OMBRE } from './jetons';
import { supabase } from '../lib/supabase';
import { demarrerRelecture } from '../utils/relectureBornee';
import {
  bilanChangementCompte, ligneChangementCompte, messageChangementFait, messageGarderAncien, messageRefusChangement,
  questionChangementCompte,
} from '../utils/changementCompte';

/** Les questions ouvertes (une par plateforme), relues sans jamais boucler sur la base. */
function useComptesAConfirmer({ actif = true } = {}) {
  const [questions, setQuestions] = useState([]);
  const relireRef = useRef(null);
  useEffect(() => {
    if (!actif) return undefined;
    let rpcAbsente = false;
    const lire = async () => {
      if (rpcAbsente) return true;
      const { data, error } = await supabase.rpc('compte_plateforme_a_confirmer');
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') { rpcAbsente = true; return true; }
        return false;
      }
      setQuestions(Array.isArray(data) ? data : []);
      return true;
    };
    const relecture = demarrerRelecture(lire, { intervalleMs: 10 * 60_000 });
    relireRef.current = relecture.relireMaintenant;
    return () => { relireRef.current = null; relecture.arreter(); };
  }, [actif]);
  return { questions, relire: () => relireRef.current?.() };
}

async function appelerRemplacement(q, simuler) {
  try {
    const { data, error } = await supabase.rpc('remplacer_compte_plateforme', {
      p_platform: q.platform, p_compte: q.compte_lu, p_simuler: simuler,
    });
    if (error) return { ok: false, motif: 'erreur' };
    return data ?? { ok: false, motif: 'erreur' };
  } catch {
    return { ok: false, motif: 'erreur' };
  }
}

const bouton = { minHeight: 48, padding: '0 16px', borderRadius: 14, fontSize: 15, fontWeight: 700 };

/**
 * La feuille de la question.
 * @param {object} p
 *   p.question une ligne de compte_plateforme_a_confirmer()
 *   p.onFait   () => void — après « Oui » réussi (relire la question et le stock)
 *   p.onFermer () => void
 */
export default function ChangementCompte({ lang = 'fr', question, onFait, onFermer }) {
  const en = lang === 'en';
  const Q = questionChangementCompte(question, lang);
  const [etape, setEtape] = useState('question'); // question | bilan | fait | garder
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState(null);
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);

  const voir = async () => {
    if (enCours) return;
    setEnCours(true); setErreur(null);
    const r = await appelerRemplacement(question, true);
    setEnCours(false);
    if (!r?.ok) { setErreur(messageRefusChangement(r, lang)); return; }
    setBilan(r); setEtape('bilan');
  };
  const suivre = async () => {
    if (enCours) return;
    setEnCours(true); setErreur(null);
    const r = await appelerRemplacement(question, false);
    setEnCours(false);
    if (!r?.ok) { setErreur(messageRefusChangement(r, lang)); return; }
    setMessage(messageChangementFait(r, lang, question?.platform)); setEtape('fait');
    onFait?.();
  };
  const phrases = bilanChangementCompte(bilan ?? question?.simulation, lang, question?.platform);

  return (
    <Feuille lang={lang} titre={Q.titre} onFermer={onFermer} etiquette={Q.titre}>
      {etape === 'fait' || etape === 'garder' ? (
        <>
          <p role="status" style={{ margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 700, color: S.ink, textAlign: 'center' }}>
            {etape === 'fait' ? message : messageGarderAncien(lang, question?.platform)}
          </p>
          <button type="button" className="sk-btn sk-presse" onClick={onFermer}
            style={{ ...bouton, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink }}>
            OK
          </button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: S.ink, overflowWrap: 'anywhere' }}>{Q.texte}</p>
            {Q.detail && <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2, overflowWrap: 'anywhere' }}>{Q.detail}</p>}
          </div>
          {etape === 'bilan' && phrases.length > 0 && (
            <ul data-bilan="changement-compte" style={{ margin: 0, padding: '12px 16px 12px 32px', borderRadius: 14, background: S.paper, boxShadow: `inset 0 0 0 1px ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {phrases.map((p) => (
                <li key={p} style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink, overflowWrap: 'anywhere' }}>{p}</li>
              ))}
            </ul>
          )}
          {erreur && (
            <p role="alert" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ambreEncre }}>
              <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0 }} />{erreur}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {etape === 'question' ? (
              <button type="button" className="sk-btn sk-presse" onClick={voir} disabled={enCours}
                style={{ ...bouton, border: 'none', background: DEGRADE, color: '#FFFFFF', boxShadow: OMBRE.primaire, opacity: enCours ? 0.7 : 1 }}>
                {enCours ? '…' : Q.voir}
              </button>
            ) : (
              <button type="button" className="sk-btn sk-presse" onClick={suivre} disabled={enCours}
                style={{ ...bouton, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: DEGRADE, color: '#FFFFFF', boxShadow: OMBRE.primaire, opacity: enCours ? 0.7 : 1 }}>
                {!enCours && <Check size={18} strokeWidth={2.4} aria-hidden="true" />}
                {enCours ? '…' : Q.oui}
              </button>
            )}
            <button type="button" className="sk-btn sk-presse" disabled={enCours} onClick={() => setEtape('garder')}
              style={{ ...bouton, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink }}>
              {Q.non}
            </button>
          </div>
          {etape === 'question' && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', fontWeight: 500, color: S.ink2 }}>
              {en ? 'Nothing changes until you confirm.' : 'Rien ne change tant que tu n’as pas confirmé.'}
            </p>
          )}
        </>
      )}
    </Feuille>
  );
}

/**
 * La ligne de « À régler » (même ligne, mêmes polices que les autres) et sa feuille. Se lit elle-même ; ne rend rien
 * tant qu'aucune question n'est ouverte. `onNombre(n)` dit à l'écran combien de lignes elle ajoute.
 */
export function LigneChangementCompte({ lang = 'fr', onNombre }) {
  const { questions, relire } = useComptesAConfirmer();
  const [ouverte, setOuverte] = useState(null);
  const ligne = ligneChangementCompte(questions, lang);
  const n = ligne ? questions.length : 0;
  useEffect(() => { onNombre?.(n); }, [n, onNombre]);
  if (!ligne) return null;
  return (
    <>
      {questions.map((q) => {
        const l = ligneChangementCompte([q], lang);
        return (
          <button key={`compte_change:${q.platform}`} type="button" className="sk-btn sk-presse" data-ligne="compte_change"
            onClick={() => setOuverte(q)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '8px 16px', boxSizing: 'border-box', border: 'none', background: 'transparent', boxShadow: `inset 0 -1px 0 ${S.borderSoft}`, textAlign: 'left', color: S.ink }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
              <ArrowLeftRight size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700, overflowWrap: 'anywhere' }}>{l.titre}</span>
              <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, marginTop: 2, overflowWrap: 'anywhere' }}>{l.detail}</span>
            </span>
            <ChevronRight size={20} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />
          </button>
        );
      })}
      {ouverte && (
        <ChangementCompte lang={lang} question={ouverte} onFermer={() => setOuverte(null)} onFait={() => relire?.()} />
      )}
    </>
  );
}
