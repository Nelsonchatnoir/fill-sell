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
import { R } from './theme';
import { Groupe, Bouton, CadreSensible, BlocSensible } from './ReglagesUI';

export default function SousPageCompte({ c, T }) {
  const { reset, suppression } = c;

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
                  <Bouton ton="creux" onClick={() => suppression.setStep(0)}>{T.annuler}</Bouton>
                </div>
              </div>
            )}
            {suppression.step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: R.negatifTexte }}>{T.supprFinale}</div>
                  <div style={{ fontSize: 13, color: R.texteSecondaire, marginTop: 2, lineHeight: 1.5 }}>{T.supprFinaleTexte}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Bouton ton="danger-plein" onClick={suppression.lancer} enCours={suppression.enCours}>
                    {suppression.enCours ? '…' : T.supprDefinitif}
                  </Bouton>
                  <Bouton ton="creux" onClick={() => suppression.setStep(0)} disabled={suppression.enCours}>{T.annuler}</Bouton>
                </div>
              </div>
            )}
          </BlocSensible>
        </CadreSensible>
      </Groupe>
    </>
  );
}
