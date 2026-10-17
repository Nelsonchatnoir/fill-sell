// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « LEBONCOIN : TON FORFAIT PRO » (17/10, DeadRoz)
// ═══════════════════════════════════════════════════════════════════════════
// Le compte Leboncoin est un compte PRO : hors forfait, Leboncoin n'offre plus
// que « Valider et payer » pour chaque nouvelle annonce. FillSell ne paie
// jamais : les publications Leboncoin du compte attendent — UNE carte par
// compte, ouverte depuis « À régler », au lieu de vingt lignes identiques.
// « C'est fait » relance UNE publication (l'éclaireur, jamais une
// republication : elle retirerait l'annonce en ligne avant de buter) ; si
// Leboncoin l'accepte sans paiement, toutes les autres repartent seules
// (handler-watch). Sans geste, l'éclaireur repart aussi de lui-même. Règle et
// motif EXACT : supabase/functions/_shared/lbc-forfait.js — un particulier
// n'entre jamais ici (son mur payant se règle annonce par annonce).
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE, OMBRE } from './jetons';
import { nombreFr } from './regles';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { supabase } from '../lib/supabase';
import { archiverErreur } from '../../supabase/functions/_shared/erreurs-archivees.js';
import { champsEclaireurForfait, URL_LEBONCOIN } from '../../supabase/functions/_shared/lbc-forfait.js';

export default function EcranForfaitLbc({ lang = 'fr', attentes = [], adressage = false, titreDe, onRelance, onFermer }) {
  const fr = lang !== 'en';
  const total = attentes.length;
  // L'éclaireur est la plus ancienne PUBLICATION (les attentes arrivent triées).
  const eclaireur = attentes.find((j) => String(j?.action ?? 'publish') === 'publish') ?? null;
  const [etat, setEtat] = useState(null); // null | 'envoi' | 'parti' | 'erreur'
  const cEstFait = async () => {
    if (!eclaireur || etat === 'envoi') return;
    setEtat('envoi');
    try {
      const pf = champsEclaireurForfait(eclaireur.platform_fields, 'geste', new Date().toISOString());
      pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, eclaireur.error, eclaireur.status, "C'est fait (forfait pro Leboncoin)");
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
    <EcranPlein lang={lang} titre={fr ? 'Leboncoin : ton forfait pro' : 'Leboncoin: your pro plan'} onFermer={onFermer}>
      <div style={{ marginTop: 16 }}>
        <div className="sk-chiffres" style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
          {fr
            ? `${nombreFr(total, lang)} annonce${total > 1 ? 's' : ''} Leboncoin en attente`
            : `${total} Leboncoin listing${total > 1 ? 's' : ''} waiting`}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {fr
            ? 'Ton compte Leboncoin est un compte pro : hors forfait, Leboncoin fait payer chaque nouvelle annonce, et son dernier écran n’offre plus que « Valider et payer ». FillSell ne paie jamais à ta place : rien n’a été mis en ligne, et FillSell n’envoie plus rien sur ce mur.'
            : 'Your Leboncoin account is a pro account: outside your plan, Leboncoin charges for every new listing, and its last screen only offers “Valider et payer”. FillSell never pays for you: nothing was put online, and FillSell sends nothing more into this wall.'}
        </div>
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
            <Wallet size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
            {fr ? '1. Dans ton espace pro Leboncoin, vérifie ton forfait d’annonces.' : '1. In your Leboncoin pro space, check your listings plan.'}
            {adressage && (fr
              ? ' Leboncoin te demande aussi de mettre à jour ta ligne d’adressage : fais-le au même endroit.'
              : ' Leboncoin also asks you to update your address line: do it in the same place.')}
          </span>
        </div>
        <a href={URL_LEBONCOIN} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 12, padding: '0 16px', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          {fr ? 'Ouvrir Leboncoin' : 'Open Leboncoin'}
        </a>
        <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
          {fr ? '2. Reviens ici :' : '2. Come back here:'}
        </span>
        <button type="button" onClick={cEstFait} disabled={etat === 'envoi' || etat === 'parti' || !eclaireur}
          style={{ minHeight: 44, borderRadius: 12, border: 'none', background: etat === 'parti' || !eclaireur ? S.disabled : DEGRADE, color: etat === 'parti' || !eclaireur ? S.ink2 : '#FFFFFF', boxShadow: etat === 'parti' || !eclaireur ? 'none' : OMBRE.primaire, fontSize: 15, fontWeight: 700, cursor: etat === 'envoi' || etat === 'parti' || !eclaireur ? 'default' : 'pointer' }}>
          {etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'Essai en cours' : 'Trying now') : (fr ? "C'est fait" : 'Done')}
        </button>
        {!eclaireur && (
          <span role="status" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
            {fr
              ? 'Ce sont des republications : elles repartent toutes seules dès qu’une publication Leboncoin passe sans paiement.'
              : 'These are republications: they go out on their own as soon as a Leboncoin publication goes through without payment.'}
          </span>
        )}
        {etat === 'parti' && (
          <span role="status" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
            {fr
              ? (total > 1
                ? `On essaie une annonce sur ton ordinateur : si Leboncoin l'accepte sans paiement, les ${nombreFr(total - 1, lang)} autres partent toutes seules. Sinon, elle revient ici.`
                : "On essaie ton annonce sur ton ordinateur : si Leboncoin l'accepte sans paiement, elle est en ligne. Sinon, elle revient ici.")
              : 'We try one listing on your computer: if Leboncoin accepts it without payment, the others go out on their own. Otherwise it comes back here.'}
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
