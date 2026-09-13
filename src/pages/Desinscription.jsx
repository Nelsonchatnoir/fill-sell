import { useCallback, useEffect, useState } from 'react';
import useSeo from '../lib/seo';

// ============================================================================
// Désinscription des emails marketing — page PUBLIQUE (13/09/2026)
//
// Volontairement hors de RequireAuth : quelqu'un qui ne veut plus de nos mails
// ne doit pas avoir à retrouver son mot de passe pour partir.
//
// Le jeton de l'URL est le seul élément d'identification. Il n'est jamais
// affiché, et l'adresse revient MASQUÉE du serveur — assez pour se reconnaître,
// pas assez pour qu'un jeton intercepté révèle une adresse complète.
//
// ⚠️ La désinscription part d'un POST au chargement, jamais d'un GET.
// Gmail, Outlook et les proxys de confidentialité pré-chargent les liens des
// mails : un GET qui désinscrirait désinscrirait des gens qui n'ont rien
// cliqué. Les pré-chargeurs n'exécutent pas ce POST.
// ============================================================================

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-desinscription`;

const C = {
  fond: '#EFEDE8',
  carte: '#FFFFFF',
  bord: '#E6E3DD',
  vert: '#1D9E75',
  vertFonce: '#17835F',
  titre: '#0D0D0D',
  texte: '#3A3A38',
  gris: '#6B7280',
};

export default function Desinscription() {
  useSeo({ path: '/desinscription', title: 'Désinscription — FillSell', robots: 'noindex' });

  const [etat, setEtat] = useState('chargement'); // chargement | ok | invalide | erreur
  const [desinscrit, setDesinscrit] = useState(false);
  const [emailMasque, setEmailMasque] = useState('');
  const [enCours, setEnCours] = useState(false);

  const jeton = new URLSearchParams(window.location.search).get('t') || '';

  const appeler = useCallback(async (action) => {
    const res = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: jeton, action }),
    });
    const corps = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corps.error || 'erreur');
    return corps;
  }, [jeton]);

  // Au chargement : on désinscrit directement. C'est ce que la personne a
  // demandé en cliquant — lui faire cliquer une seconde fois serait une
  // friction posée devant la porte de sortie.
  useEffect(() => {
    if (!jeton) { setEtat('invalide'); return; }
    let vivant = true;
    (async () => {
      try {
        const r = await appeler('desinscrire');
        if (!vivant) return;
        setEmailMasque(r.email_masque || '');
        setDesinscrit(r.desinscrit === true);
        setEtat('ok');
      } catch (e) {
        if (!vivant) return;
        setEtat(e.message === 'jeton_invalide' ? 'invalide' : 'erreur');
      }
    })();
    return () => { vivant = false; };
  }, [jeton, appeler]);

  async function basculer() {
    if (enCours) return;
    setEnCours(true);
    try {
      const r = await appeler(desinscrit ? 'reinscrire' : 'desinscrire');
      setDesinscrit(r.desinscrit === true);
    } catch {
      setEtat('erreur');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520, background: C.carte, border: `1px solid ${C.bord}`, borderRadius: 18, padding: '38px 32px', boxShadow: '0 18px 44px rgba(23,60,49,0.07)' }}>

        <div style={{ fontFamily: "'Space Grotesk',-apple-system,'Segoe UI',Arial,sans-serif", fontStyle: 'italic', fontWeight: 700, fontSize: 19, color: '#4A5A52', marginBottom: 26 }}>
          FillSell
        </div>

        {etat === 'chargement' && (
          <p style={{ color: C.gris, fontSize: 15, margin: 0 }}>Un instant…</p>
        )}

        {etat === 'invalide' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.titre, margin: '0 0 12px' }}>Ce lien n'est plus valable</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: C.texte, margin: 0 }}>
              Il a peut-être été tronqué par ta messagerie. Écris-nous à{' '}
              <a href="mailto:support@fillsell.app" style={{ color: C.vertFonce }}>support@fillsell.app</a>{' '}
              et on te retire de la liste à la main.
            </p>
          </>
        )}

        {etat === 'erreur' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.titre, margin: '0 0 12px' }}>Ça n'a pas marché</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: C.texte, margin: 0 }}>
              On n'a pas pu enregistrer ta demande. Réessaie dans un instant, ou écris-nous à{' '}
              <a href="mailto:support@fillsell.app" style={{ color: C.vertFonce }}>support@fillsell.app</a> :
              on s'en occupe manuellement.
            </p>
          </>
        )}

        {etat === 'ok' && desinscrit && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: C.vert, display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: C.vertFonce }}>
                C'est fait
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: C.titre, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
              Tu es désinscrit
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: C.texte, margin: '0 0 10px' }}>
              {emailMasque ? <><strong>{emailMasque}</strong> ne recevra plus</> : 'Tu ne recevras plus'}{' '}
              d'emails de relance, de campagne ni d'annonce produit de notre part.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: C.gris, margin: '0 0 26px' }}>
              Les messages liés à ton compte — réponse à une question, sécurité,
              facturation — continuent d'arriver : ils répondent à tes propres
              demandes.
            </p>
            <button onClick={basculer} disabled={enCours} style={{ padding: '13px 24px', background: '#FFFFFF', color: C.vertFonce, border: '1px solid #C9DED6', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Un instant…' : 'Me réabonner'}
            </button>
          </>
        )}

        {etat === 'ok' && !desinscrit && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: C.titre, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
              Tu es réabonné
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: C.texte, margin: '0 0 26px' }}>
              {emailMasque ? <><strong>{emailMasque}</strong> recevra</> : 'Tu recevras'}{' '}
              de nouveau nos emails. Tu peux repartir quand tu veux, ce lien
              reste valable.
            </p>
            <button onClick={basculer} disabled={enCours} style={{ padding: '13px 24px', background: C.vert, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Un instant…' : 'Me désinscrire'}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
