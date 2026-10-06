// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « LEBONCOIN : TON NOM ET TON PRÉNOM » (06/10 soir, feu vert de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// patrick giry : 35 lignes identiques dans « À régler » (une par article),
// chacune disant « relance la publication depuis la fiche ». Le geste est sur
// le COMPTE Leboncoin (nom et prénom, obligatoires pour la Transaction
// sécurisée), pas sur les articles : UNE carte par compte, ouverte depuis
// « À régler ». « C'est fait » relance UNE publication (l'éclaireur) ; si
// Leboncoin l'accepte, toutes les autres repartent seules (handler-watch).
// Sans geste, l'éclaireur repart aussi toutes les 12 h. Règle et motif EXACT :
// supabase/functions/_shared/lbc-identite.js — aucune autre cause n'entre ici.
import { useState } from 'react';
import { UserRound } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE, OMBRE } from './jetons';
import { nombreFr } from './regles';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { supabase } from '../lib/supabase';
import { archiverErreur } from '../../supabase/functions/_shared/erreurs-archivees.js';
import { champsEclaireur, URL_INFOS_LBC } from '../../supabase/functions/_shared/lbc-identite.js';

export default function EcranIdentiteLbc({ lang = 'fr', attentes = [], titreDe, onRelance, onFermer }) {
  const fr = lang !== 'en';
  const total = attentes.length;
  const [etat, setEtat] = useState(null); // null | 'envoi' | 'parti' | 'erreur'
  const cEstFait = async () => {
    const eclaireur = attentes[0];
    if (!eclaireur || etat === 'envoi') return;
    setEtat('envoi');
    try {
      const pf = champsEclaireur(eclaireur.platform_fields, 'geste', new Date().toISOString());
      pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, eclaireur.error, eclaireur.status, "C'est fait (nom et prénom Leboncoin)");
      const { data, error } = await supabase.from('cross_post_jobs')
        .update({ status: 'pending', error: null, platform_fields: pf })
        .eq('id', eclaireur.id).eq('status', 'needs_user').select('id');
      if (error) throw error;
      setEtat(data?.length ? 'parti' : 'erreur');
      onRelance?.();
    } catch {
      setEtat('erreur');
    }
  };
  return (
    <EcranPlein lang={lang} titre={fr ? 'Leboncoin : ton nom et ton prénom' : 'Leboncoin: your first and last name'} onFermer={onFermer}>
      <div style={{ marginTop: 16 }}>
        <div className="sk-chiffres" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
          {fr
            ? `${nombreFr(total, lang)} annonce${total > 1 ? 's' : ''} Leboncoin en attente`
            : `${total} Leboncoin listing${total > 1 ? 's' : ''} waiting`}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {fr
            ? 'Leboncoin demande ton nom et ton prénom sur ton compte (obligatoires pour la Transaction sécurisée). Complète-les une seule fois dans tes informations personnelles Leboncoin : toutes ces annonces partent ensuite toutes seules, sans rien relancer.'
            : 'Leboncoin needs your first and last name on your account (required for secure payment). Fill them in once in your Leboncoin personal details: all these listings then go out on their own.'}
        </div>
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
            <UserRound size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
            {fr ? '1. Ouvre tes informations personnelles Leboncoin et remplis Nom et Prénom.' : '1. Open your Leboncoin personal details and fill in your names.'}
          </span>
        </div>
        <a href={URL_INFOS_LBC} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 12, padding: '0 16px', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          {fr ? 'Ouvrir mes informations Leboncoin' : 'Open my Leboncoin details'}
        </a>
        <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
          {fr ? '2. Reviens ici :' : '2. Come back here:'}
        </span>
        <button type="button" onClick={cEstFait} disabled={etat === 'envoi' || etat === 'parti' || !total}
          style={{ minHeight: 44, borderRadius: 12, border: 'none', background: etat === 'parti' ? S.disabled : DEGRADE, color: etat === 'parti' ? S.ink2 : '#FFFFFF', boxShadow: etat === 'parti' ? 'none' : OMBRE.primaire, fontSize: 15, fontWeight: 700, cursor: etat === 'envoi' || etat === 'parti' ? 'default' : 'pointer' }}>
          {etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'Essai en cours' : 'Trying now') : (fr ? "C'est fait" : 'Done')}
        </button>
        {etat === 'parti' && (
          <span role="status" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
            {fr
              ? `On essaie une annonce sur ton ordinateur : si Leboncoin l'accepte, ${total > 1 ? `les ${nombreFr(total - 1, lang)} autres partent` : 'elle part'} toutes seules. Sinon, elle revient ici.`
              : 'We try one listing on your computer: if Leboncoin accepts it, the others go out on their own. Otherwise it comes back here.'}
          </span>
        )}
        {etat === 'erreur' && (
          <span role="alert" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.rouge }}>
            {fr ? 'Ça n’a pas pris : réessaie dans un instant.' : 'That did not go through: try again in a moment.'}
          </span>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${S.borderSoft}` }}>
          {attentes.map((j) => (
            <li key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, lineHeight: '18px', color: S.ink }}>
              <PlatformLogo platform="leboncoin" size={16} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {titreDe?.(j) ?? j.title ?? (fr ? 'Article' : 'Item')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </EcranPlein>
  );
}
