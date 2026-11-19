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
// (18/11/2026, ordre de Nico — 88 dépôts d'un compte Leboncoin neuf) FillSell
// DEMANDE ici, une fois, le prénom et le nom : rangés dans
// platform_settings.leboncoin.identite_vendeur (platform_settings_fusionner, la
// seule voie) et nulle part ailleurs ; l'extension (PC ou Cloud) les pose
// elle-même dans les cases vides de Leboncoin à chaque dépôt. « Enregistrer et
// essayer » = l'écriture puis l'éclaireur (même geste que « C'est fait »).
// Jamais un nom inventé, jamais pré-rempli d'ailleurs que de ce réglage.
// (19/11/2026 soir, ordre de Nico — Lizzaa) Seule l'extension 0.6.193 ou plus récente (ou le Cloud) sait les poser
// (_shared/lbc-identite-pose.js). Avec une extension plus ancienne, l'écran DIT la vérité : enregistrés, posés dès que
// l'extension est à jour ; il ne lance aucun essai voué à l'échec (handler-watch relance l'éclaireur tout seul dès que le
// poste sait les poser). Verrou : selftest:lbc-identite-pose-1911.
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import EcranPlein from './EcranPlein';
import { S, DEGRADE, OMBRE } from './jetons';
import { nombreFr } from './regles';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { supabase } from '../lib/supabase';
import { archiverErreur } from '../../supabase/functions/_shared/erreurs-archivees.js';
import { champsEclaireur, URL_INFOS_LBC, NOM_PROPRE_MAX, identiteVendeurValide, identiteVendeurDuProfil } from '../../supabase/functions/_shared/lbc-identite.js';
import { compteSaitPoserIdentite } from '../../supabase/functions/_shared/lbc-identite-pose.js';
import { compteCourantEstCloud } from '../cloud/voieCloud';
import { fusionnerReglages } from '../utils/reglagesPlateformes';

const CHAMP = { boxSizing: 'border-box', width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 16, fontFamily: 'inherit', color: S.ink, outline: 'none' };
const LIBELLE = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: S.ink };

export default function EcranIdentiteLbc({ lang = 'fr', attentes = [], titreDe, onRelance, onFermer }) {
  const fr = lang !== 'en';
  // (15/11, point 2 de Nico) Compte FillSell Cloud : l'essai part de son Cloud, jamais « sur ton ordinateur ».
  const cloud = compteCourantEstCloud();
  const total = attentes.length;
  const [etat, setEtat] = useState(null); // null | 'envoi' | 'parti' | 'erreur'
  // (18/11) Le prénom et le nom donnés une fois dans FillSell (lus de son propre réglage à l'ouverture).
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [invalide, setInvalide] = useState(false);
  // (19/11 soir) Le poste du compte sait-il poser le nom et le prénom ? null = pas encore lu (le texte d'avant).
  const [saitPoser, setSaitPoser] = useState(null);
  const ancienneExtension = !cloud && saitPoser === false;
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s?.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase.from('profiles').select('platform_settings, extension_build, cloud_voie').eq('id', uid).maybeSingle();
        const connue = identiteVendeurDuProfil(data?.platform_settings);
        if (vivant && connue) { setPrenom(connue.prenom); setNom(connue.nom); }
        if (vivant) setSaitPoser(compteSaitPoserIdentite(data));
      } catch { /* lecture ratée : champs vides, la personne les donne */ }
    })();
    return () => { vivant = false; };
  }, []);
  // Leboncoin a refusé ceux que FillSell a posés (last_diagnostic.identite.posee, extension 0.6.193 ou plus).
  const refusee = attentes.some((j) => j?.platform_fields?.last_diagnostic?.identite?.posee === true);
  const enregistrerEtEssayer = async () => {
    if (etat === 'envoi') return;
    const id = identiteVendeurValide({ nom, prenom });
    if (!id) { setInvalide(true); return; }
    setInvalide(false);
    setEtat('envoi');
    try {
      const { error } = await fusionnerReglages(['leboncoin', 'identite_vendeur'], { nom: id.nom, prenom: id.prenom, enregistre_le: new Date().toISOString() });
      if (error) throw error;
      setPrenom(id.prenom); setNom(id.nom);
    } catch {
      setEtat('erreur');
      return;
    }
    if (!attentes.length) { setEtat('parti'); return; }
    // Extension trop ancienne pour les poser : enregistrés, aucun essai voué à l'échec (handler-watch relance seul).
    if (ancienneExtension) { setEtat('enregistre'); return; }
    await cEstFait(true);
  };
  const cEstFait = async (dejaEnCours = false) => {
    const eclaireur = attentes[0];
    if (!eclaireur || (etat === 'envoi' && !dejaEnCours)) return;
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
          {ancienneExtension
            ? (fr
              ? 'Leboncoin demande ton nom et ton prénom (obligatoires pour la Transaction sécurisée). Donne-les une seule fois ici. Ta version de l’extension FillSell ne sait pas encore les poser : dès qu’elle sera à jour (Chrome l’installe tout seul), FillSell les posera lui-même et toutes ces annonces repartiront seules.'
              : 'Leboncoin needs your first and last name (required for secure payment). Enter them once here. Your version of the FillSell extension cannot fill them in yet: as soon as it is updated (Chrome installs it on its own), FillSell fills them in itself and all these listings go out again on their own.')
            : (fr
              ? 'Leboncoin demande ton nom et ton prénom (obligatoires pour la Transaction sécurisée). Donne-les une seule fois ici : FillSell les posera lui-même à chaque dépôt, et toutes ces annonces partiront ensuite toutes seules.'
              : 'Leboncoin needs your first and last name (required for secure payment). Enter them once here: FillSell fills them in itself at every listing, and all these listings then go out on their own.')}
        </div>
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={LIBELLE}>
          {fr ? 'Prénom' : 'First name'}
          <input value={prenom} onChange={(e) => { setPrenom(e.target.value.slice(0, NOM_PROPRE_MAX)); setInvalide(false); }}
            autoComplete="given-name" autoCapitalize="words" maxLength={NOM_PROPRE_MAX} style={CHAMP} />
        </label>
        <label style={LIBELLE}>
          {fr ? 'Nom' : 'Last name'}
          <input value={nom} onChange={(e) => { setNom(e.target.value.slice(0, NOM_PROPRE_MAX)); setInvalide(false); }}
            autoComplete="family-name" autoCapitalize="words" maxLength={NOM_PROPRE_MAX} style={CHAMP} />
        </label>
        <span style={{ fontSize: 12.5, lineHeight: '18px', fontWeight: 500, color: S.ink2 }}>
          {fr
            ? 'Tels qu’ils figurent sur ta pièce d’identité. Ils ne servent qu’à Leboncoin, pour la Transaction sécurisée ; tu peux les changer ici à tout moment.'
            : 'As they appear on your ID. They are only used for Leboncoin’s secure payment; you can change them here at any time.'}
        </span>
        {refusee && (
          <span role="alert" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ambreEncre }}>
            {fr ? 'Leboncoin n’a pas accepté le nom et le prénom posés : vérifie-les, puis réessaie.' : 'Leboncoin did not accept the names that were filled in: check them, then try again.'}
          </span>
        )}
        {invalide && (
          <span role="alert" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.rouge }}>
            {fr ? 'Écris ton prénom et ton nom en lettres (sans chiffres).' : 'Type your first and last name in letters (no digits).'}
          </span>
        )}
        <button type="button" onClick={enregistrerEtEssayer} disabled={etat === 'envoi' || etat === 'parti'}
          style={{ minHeight: 44, borderRadius: 12, border: 'none', background: etat === 'parti' ? S.disabled : DEGRADE, color: etat === 'parti' ? S.ink2 : '#FFFFFF', boxShadow: etat === 'parti' ? 'none' : OMBRE.primaire, fontSize: 15, fontWeight: 700, cursor: etat === 'envoi' || etat === 'parti' ? 'default' : 'pointer' }}>
          {etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'Essai en cours' : 'Trying now') : ancienneExtension ? (fr ? 'Enregistrer' : 'Save') : (fr ? 'Enregistrer et essayer' : 'Save and try')}
        </button>
        {etat === 'enregistre' && (
          <span role="status" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
            {fr
              ? 'Enregistrés. Tes annonces Leboncoin repartiront seules dès que ton extension FillSell sera à jour : tu n’as rien d’autre à faire.'
              : 'Saved. Your Leboncoin listings will go out again on their own as soon as your FillSell extension is updated: nothing else to do.'}
          </span>
        )}
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.ambreFond, color: S.ambreEncre }}>
            <UserRound size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
            {fr ? 'Tu préfères les remplir toi-même ? Ouvre tes informations personnelles Leboncoin et remplis Nom et Prénom.' : 'Prefer to fill them in yourself? Open your Leboncoin personal details and fill in your names.'}
          </span>
        </div>
        <a href={URL_INFOS_LBC} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 12, padding: '0 16px', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          {fr ? 'Ouvrir mes informations Leboncoin' : 'Open my Leboncoin details'}
        </a>
        <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>
          {fr ? 'Puis reviens ici :' : 'Then come back here:'}
        </span>
        <button type="button" onClick={() => cEstFait()} disabled={etat === 'envoi' || etat === 'parti' || !total}
          style={{ minHeight: 44, borderRadius: 12, border: 'none', background: etat === 'parti' ? S.disabled : '#FFFFFF', color: etat === 'parti' ? S.ink2 : S.ink, boxShadow: `inset 0 0 0 1px ${S.border}`, fontSize: 15, fontWeight: 700, cursor: etat === 'envoi' || etat === 'parti' ? 'default' : 'pointer' }}>
          {etat === 'envoi' ? (fr ? 'Un instant…' : 'One moment…') : etat === 'parti' ? (fr ? 'Essai en cours' : 'Trying now') : (fr ? "C'est fait" : 'Done')}
        </button>
        {etat === 'parti' && (
          <span role="status" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
            {fr
              ? `On essaie une annonce ${cloud ? 'depuis ton FillSell Cloud' : 'sur ton ordinateur'} : si Leboncoin l'accepte, ${total > 1 ? `les ${nombreFr(total - 1, lang)} autres partent` : 'elle part'} toutes seules. Sinon, elle revient ici.`
              : `We try one listing ${cloud ? 'from your FillSell Cloud' : 'on your computer'}: if Leboncoin accepts it, the others go out on their own. Otherwise it comes back here.`}
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
