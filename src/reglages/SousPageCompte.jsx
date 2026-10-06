// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › MON COMPTE — session et zone sensible (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// DEUX CHANGEMENTS, AUCUN SUR LA LOGIQUE :
//   1. « Se déconnecter » SORT de la zone sensible : ce n'est pas destructeur,
//      et le mettre au même niveau qu'une suppression de compte brouillait les
//      deux gestes.
//   2. Chaque action sensible DIT CE QU'ELLE FAIT AVANT QU'ON LA TOUCHE. En
//      particulier « réinitialiser l'inventaire » dit que les annonces en
//      ligne ne sont PAS retirées — l'écran d'avant ne le disait nulle part,
//      alors que c'est vrai depuis le filet serveur du 16/09 (la RPC
//      supprimer_mon_stock_sans_retrait pose la garde fillsell.sans_retrait
//      dans la même transaction que les deux DELETE).
//
// Les machines à états (resetStep 0→1, deleteStep 0→1→2) et les fonctions
// appelées sont celles d'App.jsx, passées par le contexte : rien n'est
// réécrit ici, ni la RPC, ni l'appel à delete-account, ni la déconnexion en
// scope 'local'.
//
// 06/10 — « Pourquoi tu pars ? » : un bloc FACULTATIF dans l'étape de
// confirmation finale, au-dessus du bouton. Aucun clic de plus, aucune
// question bloquante, aucune offre de rétention : la réponse (ou son absence)
// est passée à `suppression.lancer`, qui l'enregistre sans jamais retenir la
// suppression (src/compte/supprimerCompte.js).
import { useState } from 'react';
import { R } from './theme';
import { Groupe, Bouton, CadreSensible, BlocSensible } from './ReglagesUI';
import { MOTIFS_DEPART, TEXTE_DEPART_MAX } from '../compte/supprimerCompte';

export default function SousPageCompte({ c, T }) {
  const { reset, suppression } = c;
  const [motif, setMotif] = useState(null);
  const [texte, setTexte] = useState('');
  // Annuler efface la réponse : rien ne traîne.
  const annulerSuppression = () => { setMotif(null); setTexte(''); suppression.setStep(0); };

  return (
    <>
      <Groupe intitule={T.session}>
        <Bouton ton="creux" onClick={c.deconnexion} style={{ width: '100%', minHeight: 52, borderRadius: 26 }}>
          {T.seDeconnecter}
        </Bouton>
      </Groupe>

      <Groupe intitule={T.zoneSensible} ton="danger">
        <CadreSensible>
          {/* ── Réinitialiser l'inventaire ─────────────────────────────── */}
          <BlocSensible titre={T.reinitTitre} texte={T.reinitTexte}>
            {reset.step === 0 ? (
              <Bouton ton="danger-creux" onClick={reset.lancer} style={{ alignSelf: 'flex-start' }}>
                {T.reinitBouton}
              </Bouton>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: R.negatifTexte }}>{T.reinitQuestion}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Bouton ton="danger-plein" onClick={reset.lancer}>{T.reinitConfirme}</Bouton>
                  <Bouton ton="creux" onClick={reset.annuler}>{T.annuler}</Bouton>
                </div>
              </div>
            )}
          </BlocSensible>

          {/* ── Supprimer le compte ────────────────────────────────────── */}
          <BlocSensible titre={T.supprTitre} texte={T.supprTexte} dernier>
            {suppression.step === 0 && (
              <Bouton ton="danger-creux" onClick={() => suppression.setStep(1)} style={{ alignSelf: 'flex-start' }}>
                {T.supprBouton}
              </Bouton>
            )}
            {suppression.step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: R.negatifTexte }}>{T.supprEtes}</div>
                  <div style={{ fontSize: 13, color: R.texteSecondaire, marginTop: 2 }}>{T.supprIrreversible}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Bouton ton="danger-plein" onClick={() => suppression.setStep(2)}>{T.continuer}</Bouton>
                  <Bouton ton="creux" onClick={annulerSuppression}>{T.annuler}</Bouton>
                </div>
              </div>
            )}
            {suppression.step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <QuestionDepart T={T} motif={motif} setMotif={setMotif} texte={texte} setTexte={setTexte} bloque={suppression.enCours} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: R.negatifTexte }}>{T.supprFinale}</div>
                  <div style={{ fontSize: 13, color: R.texteSecondaire, marginTop: 2, lineHeight: 1.5 }}>{T.supprFinaleTexte}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Bouton ton="danger-plein" onClick={() => suppression.lancer({ motif, texte })} enCours={suppression.enCours}>
                    {suppression.enCours ? '…' : T.supprDefinitif}
                  </Bouton>
                  <Bouton ton="creux" onClick={annulerSuppression} disabled={suppression.enCours}>{T.annuler}</Bouton>
                </div>
              </div>
            )}
          </BlocSensible>
        </CadreSensible>
      </Groupe>
    </>
  );
}

// ── « Pourquoi tu pars ? » ─────────────────────────────────────────────────
// Choix unique, qu'un second toucher désélectionne (la réponse reste
// facultative jusqu'au bout) ; champ libre toujours visible.
function QuestionDepart({ T, motif, setMotif, texte, setTexte, bloque }) {
  return (
    <div data-question-depart style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14, borderBottom: `1px solid ${R.dangerDoux}` }}>
      <div>
        <div id="depart-titre" style={{ fontSize: 13.5, fontWeight: 700, color: R.ink }}>
          {T.departTitre} <span style={{ fontWeight: 500, color: R.texteSecondaire }}>({T.departFacultatif})</span>
        </div>
        <div style={{ fontSize: 13, color: R.texteSecondaire, marginTop: 2, lineHeight: 1.5 }}>{T.departTexte}</div>
      </div>
      <div role="radiogroup" aria-labelledby="depart-titre" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MOTIFS_DEPART.map((m) => {
          const choisi = motif === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={choisi}
              disabled={bloque}
              className="rg-focus"
              data-motif={m}
              onClick={() => setMotif(choisi ? null : m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 12px',
                borderRadius: 12, textAlign: 'left', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.35,
                cursor: bloque ? 'not-allowed' : 'pointer', color: R.ink,
                border: `1px solid ${choisi ? R.teal : R.border}`,
                background: choisi ? R.menthe : R.card,
              }}
            >
              <span aria-hidden="true" style={{
                width: 18, height: 18, borderRadius: 9, flexShrink: 0, boxSizing: 'border-box',
                border: `2px solid ${choisi ? R.teal : R.chevron}`,
                background: choisi ? `radial-gradient(circle, ${R.teal} 0 4px, transparent 5px)` : 'transparent',
              }} />
              <span>{T.departMotifs[m]}</span>
            </button>
          );
        })}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{T.departPlus}</span>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={TEXTE_DEPART_MAX}
          placeholder={T.departPlusAide}
          disabled={bloque}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 76, padding: '10px 14px', borderRadius: 12,
            border: `1px solid ${R.border}`, background: R.paper, fontFamily: 'inherit', fontSize: 15,
            color: R.ink, resize: 'vertical', outline: 'none',
          }}
        />
      </label>
    </div>
  );
}
