// ═══════════════════════════════════════════════════════════════════════════
// STOCK — « LEBONCOIN : TON FORFAIT PRO » (17/10, DeadRoz ; 18/10 : la
// personne paie elle-même — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le compte Leboncoin est un compte PRO : hors forfait, Leboncoin n'offre plus
// que « Valider et payer » pour chaque nouvelle annonce. FillSell ne paie
// jamais. UNE carte par compte, ouverte depuis « À régler ».
// Deux parcours, selon l'extension du poste (règle et motifs EXACTS :
// supabase/functions/_shared/lbc-forfait.js) :
//   · (18/10) nouvelle extension : FillSell a PRÉPARÉ le dépôt jusqu'à l'écran
//     « Valider et payer » et laissé l'onglet dans la fenêtre de la personne —
//     elle clique elle-même. Onglet fermé sans paiement → « Préparer à nouveau »
//     (une publication remise en file, le dépôt est refait jusqu'au même écran).
//     Les suivantes se préparent une par une, après chaque paiement. Les
//     republications attendent que le forfait couvre de nouveau les dépôts ;
//   · ancienne extension (mur vu, rien de préparé) : « C'est fait » relance UNE
//     publication (l'éclaireur) ; si Leboncoin l'accepte sans paiement, tout
//     repart (handler-watch).
// Un particulier n'entre jamais ici (son mur payant se règle annonce par annonce).
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE, OMBRE } from './jetons';
import { nombreFr } from './regles';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { supabase } from '../lib/supabase';
import { archiverErreur } from '../../supabase/functions/_shared/erreurs-archivees.js';
import {
  champsEclaireurForfait, champsPreparerDeNouveau, URL_LEBONCOIN, estAttentePaiement, attentePaiementVivante, MOTIF_LBC_PAYANT, motifDiagnostic,
} from '../../supabase/functions/_shared/lbc-forfait.js';

export default function EcranForfaitLbc({ lang = 'fr', attentes = [], adressage = false, titreDe, onRelance, onFermer }) {
  const fr = lang !== 'en';
  const total = attentes.length;
  const maintenant = Date.now();
  // (18/10) Le dépôt prêt sur « Valider et payer » (nouvelle extension), vivant ou non.
  const pretes = attentes.filter((j) => estAttentePaiement(j));
  const prete = pretes.find((j) => attentePaiementVivante(j, maintenant)) ?? null;
  const preteClose = prete ? null : (pretes[0] ?? null);
  const nouveauParcours = pretes.length > 0 || attentes.some((j) => motifDiagnostic(j) === 'lbc_valider_et_payer');
  const republications = attentes.filter((j) => String(j?.action ?? 'publish') === 'republish');
  const publications = attentes.filter((j) => String(j?.action ?? 'publish') === 'publish');
  // Ancienne extension : l'éclaireur est la plus ancienne PUBLICATION au mur (les attentes arrivent triées).
  const eclaireur = nouveauParcours ? null : (attentes.find((j) => String(j?.action ?? 'publish') === 'publish' && motifDiagnostic(j) === MOTIF_LBC_PAYANT) ?? null);
  const [etat, setEtat] = useState(null); // null | 'envoi' | 'parti' | 'erreur'
  const relancer = async (job, champs, note) => {
    if (!job || etat === 'envoi') return;
    setEtat('envoi');
    try {
      const pf = champs(job.platform_fields, new Date().toISOString());
      pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, job.status, note);
      const { data, error } = await supabase.from('cross_post_jobs')
        .update({ status: 'pending', error: null, platform_fields: pf })
        .eq('id', job.id).eq('status', 'needs_user').select('id');
      if (error) throw error;
      setEtat(data?.length ? 'parti' : 'erreur');
      onRelance?.();
    } catch {
      setEtat('erreur');
    }
  };
  const cEstFait = () => relancer(eclaireur, (pf, iso) => champsEclaireurForfait(pf, 'geste', iso), "C'est fait (forfait pro Leboncoin)");
  const preparerDeNouveau = () => relancer(preteClose ?? publications[0] ?? null, champsPreparerDeNouveau, 'Préparer à nouveau (dépôt Leboncoin à payer par la personne)');
  const bouton = (libelle, onClick, disabled) => (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ minHeight: 44, borderRadius: 12, border: 'none', background: disabled ? S.disabled : DEGRADE, color: disabled ? S.ink2 : '#FFFFFF', boxShadow: disabled ? 'none' : OMBRE.primaire, fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}>
      {libelle}
    </button>
  );
  const lien = (libelle) => (
    <a href={URL_LEBONCOIN} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 12, padding: '0 16px', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
      {libelle}
    </a>
  );
  const note = (texte, role = 'status') => (
    <span role={role} style={{ fontSize: 13, lineHeight: '20px', fontWeight: role === 'alert' ? 600 : 500, color: role === 'alert' ? S.rouge : S.ink2 }}>{texte}</span>
  );
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
            ? 'Ton compte Leboncoin est un compte pro : hors forfait, Leboncoin fait payer chaque nouvelle annonce, et son dernier écran n’offre plus que « Valider et payer ». FillSell ne paie jamais à ta place.'
            : 'Your Leboncoin account is a pro account: outside your plan, Leboncoin charges for every new listing, and its last screen only offers “Valider et payer”. FillSell never pays for you.'}
        </div>
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
            <Wallet size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
            {nouveauParcours
              ? (prete
                ? (fr
                  ? `« ${titreDe?.(prete) ?? prete.title ?? 'Ton annonce'} » est prête sur Leboncoin : dans l’onglet Leboncoin ouvert sur ton ordinateur, clique « Valider et payer ». C’est toi qui paies, jamais FillSell.`
                  : `“${titreDe?.(prete) ?? prete.title ?? 'Your listing'}” is ready on Leboncoin: in the Leboncoin tab open on your computer, click “Valider et payer”. You pay, never FillSell.`)
                : preteClose
                  ? (fr
                    ? `L’onglet de « ${titreDe?.(preteClose) ?? preteClose.title ?? 'ton annonce'} » a été fermé sans paiement. Pour la préparer de nouveau jusqu’à « Valider et payer », appuie ci-dessous : FillSell refait le dépôt sur ton ordinateur et te laisse l’onglet.`
                    : `The tab for “${titreDe?.(preteClose) ?? preteClose.title ?? 'your listing'}” was closed without payment. To prepare it again up to “Valider et payer”, tap below: FillSell redoes the listing on your computer and leaves you the tab.`)
                  : (fr
                    ? 'FillSell prépare chaque annonce jusqu’à « Valider et payer » et te laisse l’onglet sur ton ordinateur : tu paies toi-même. Les suivantes se préparent une par une, après chaque paiement.'
                    : 'FillSell prepares each listing up to “Valider et payer” and leaves you the tab on your computer: you pay yourself. The next ones are prepared one at a time, after each payment.'))
              : (fr ? '1. Dans ton espace pro Leboncoin, vérifie ton forfait d’annonces.' : '1. In your Leboncoin pro space, check your listings plan.')}
            {adressage && (fr
              ? ' Leboncoin te demande aussi de mettre à jour ta ligne d’adressage : fais-le dans ton espace Leboncoin.'
              : ' Leboncoin also asks you to update your address line: do it in your Leboncoin space.')}
          </span>
        </div>
        {nouveauParcours ? (
          <>
            {preteClose && bouton(etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'En préparation' : 'Preparing') : (fr ? 'Préparer à nouveau' : 'Prepare again'),
              preparerDeNouveau, etat === 'envoi' || etat === 'parti')}
            {!prete && !preteClose && publications.length > 0 && bouton(etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'En préparation' : 'Preparing') : (fr ? 'Préparer la prochaine' : 'Prepare the next one'),
              preparerDeNouveau, etat === 'envoi' || etat === 'parti')}
            {lien(fr ? 'Ouvrir Leboncoin' : 'Open Leboncoin')}
            {etat === 'parti' && note(fr
              ? 'FillSell refait le dépôt sur ton ordinateur et te laisse l’onglet sur « Valider et payer ».'
              : 'FillSell redoes the listing on your computer and leaves you the tab on “Valider et payer”.')}
            {republications.length > 0 && note(fr
              ? `${nombreFr(republications.length, lang)} republication${republications.length > 1 ? 's' : ''} attend${republications.length > 1 ? 'ent' : ''} que ton forfait couvre de nouveau les dépôts : un redépôt payant retirerait ton annonce en ligne.`
              : `${republications.length} republication${republications.length > 1 ? 's' : ''} wait${republications.length > 1 ? '' : 's'} for your plan to cover listings again: a paid redeposit would take your listing offline.`)}
          </>
        ) : (
          <>
            {lien(fr ? 'Ouvrir Leboncoin' : 'Open Leboncoin')}
            <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
              {fr ? '2. Reviens ici :' : '2. Come back here:'}
            </span>
            {bouton(etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'Essai en cours' : 'Trying now') : (fr ? "C'est fait" : 'Done'),
              cEstFait, etat === 'envoi' || etat === 'parti' || !eclaireur)}
            {!eclaireur && note(fr
              ? 'Ce sont des republications : elles repartent toutes seules dès qu’une publication Leboncoin passe sans paiement.'
              : 'These are republications: they go out on their own as soon as a Leboncoin publication goes through without payment.')}
            {etat === 'parti' && note(fr
              ? (total > 1
                ? `On essaie une annonce sur ton ordinateur : si Leboncoin l'accepte sans paiement, les ${nombreFr(total - 1, lang)} autres partent toutes seules. Sinon, elle revient ici.`
                : "On essaie ton annonce sur ton ordinateur : si Leboncoin l'accepte sans paiement, elle est en ligne. Sinon, elle revient ici.")
              : 'We try one listing on your computer: if Leboncoin accepts it without payment, the others go out on their own. Otherwise it comes back here.')}
          </>
        )}
        {etat === 'erreur' && note(fr ? 'Ça n’a pas pris : réessaie dans un instant.' : 'That did not go through: try again in a moment.', 'alert')}
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${S.borderSoft}` }}>
          {attentes.map((j) => (
            <li key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, lineHeight: '18px', color: S.ink }}>
              <PlatformLogo platform="leboncoin" size={16} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {titreDe?.(j) ?? j.title ?? (fr ? 'Article' : 'Item')}
              </span>
              {estAttentePaiement(j) && (
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: S.ambreEncre }}>
                  {attentePaiementVivante(j, maintenant) ? (fr ? 'prête, à payer' : 'ready, to pay') : (fr ? 'onglet fermé' : 'tab closed')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </EcranPlein>
  );
}
