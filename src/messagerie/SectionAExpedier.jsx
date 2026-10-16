// ═══════════════════════════════════════════════════════════════════════════
// « À EXPÉDIER » — BÊTA (16/10/2026) : la commande, la photo, le pseudo, le
// numéro de commande, le bouton « Bordereau » (INACTIF tant que le parcours
// n'est pas validé sur une vraie commande). Lecture seule.
// Pas de design final : Claude fera les maquettes à partir du rapport.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Package, Lock } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { S } from '../stock/jetons';
import { boutonBordereau, commandesAExpedier, dateCourte, libelleEtatCommande, montantTexte, nomPlateforme } from './vue';

const COLONNES = 'id,platform,commande_ref,etat,etat_plateforme,bordereau,acheteur_pseudo,titre,photo_url,montant,devise,annonce_ref,inventaire_id,transporteur,a_expedier_avant,vendue_le';

export function SectionAExpedier({ supabase, lang = 'fr', photosParInventaire = null, compact = false }) {
  const fr = lang !== 'en';
  const [commandes, setCommandes] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase.from('plateforme_commandes').select(COLONNES)
        .in('etat', ['a_confirmer', 'a_expedier']).order('vendue_le', { ascending: true }).limit(50);
      if (!vivant) return;
      if (error) { setErreur(true); setCommandes([]); return; }
      setCommandes(commandesAExpedier(data ?? []));
    })();
    return () => { vivant = false; };
  }, [supabase]);

  if (commandes === null) return null;
  return (
    <section aria-label={fr ? 'À expédier' : 'To ship'} style={{ background: '#FFFFFF', border: `1px solid ${S.border}`, borderRadius: 16, padding: compact ? 12 : 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Package size={18} strokeWidth={2} aria-hidden="true" color={S.tealDeep} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: S.ink }}>{fr ? 'À expédier' : 'To ship'}</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: S.ambreEncre, background: S.ambreFond, border: `1px solid ${S.ambreBord}`, borderRadius: 999, padding: '1px 8px' }}>{fr ? 'bêta' : 'beta'}</span>
      </div>
      {erreur && <p style={{ margin: 0, fontSize: 13, color: S.ink2 }}>{fr ? 'Lecture impossible pour le moment.' : 'Cannot read right now.'}</p>}
      {!erreur && commandes.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: S.ink2 }}>{fr ? 'Aucune commande à expédier.' : 'Nothing to ship.'}</p>
      )}
      {commandes.map((c) => {
        const b = boutonBordereau(c, lang);
        const photo = (c.inventaire_id && photosParInventaire?.[c.inventaire_id]) || c.photo_url || null;
        return (
          <article key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: `1px solid ${S.borderSoft}`, paddingTop: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: S.paper, flexShrink: 0 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: c.etat === 'a_confirmer' ? S.ambreEncre : S.tealDeep }}>
                <PlatformLogo platform={c.platform} size={14} />
                <span>{nomPlateforme(c.platform)} · {libelleEtatCommande(c.etat, lang)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.ink, overflowWrap: 'anywhere' }}>{c.titre ?? (fr ? 'Article' : 'Item')}</div>
              <div style={{ fontSize: 12, color: S.ink2 }}>
                {[c.acheteur_pseudo ? `@${c.acheteur_pseudo}` : null, `${fr ? 'Commande' : 'Order'} ${c.commande_ref}`, montantTexte(c.montant, c.devise), c.vendue_le ? dateCourte(c.vendue_le, lang) : null].filter(Boolean).join(' · ')}
              </div>
              {c.a_expedier_avant && <div style={{ fontSize: 12, fontWeight: 600, color: S.ink }}>{fr ? 'À déposer avant le' : 'Ship before'} {dateCourte(c.a_expedier_avant, lang)}</div>}
              <div style={{ fontSize: 12, color: S.ink2 }}>{b.aide}</div>
            </div>
            <button type="button" disabled title={b.titre} aria-label={`${b.libelle} — ${b.titre}`}
              style={{ minHeight: 40, padding: '0 12px', borderRadius: 10, border: `1px solid ${S.border}`, background: S.disabled, color: S.chevron, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'not-allowed', flexShrink: 0 }}>
              <Lock size={14} strokeWidth={2.2} aria-hidden="true" />{b.libelle}
            </button>
          </article>
        );
      })}
    </section>
  );
}

export default SectionAExpedier;
