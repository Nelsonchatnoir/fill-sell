// ═══════════════════════════════════════════════════════════
// « Vente annulée — Remettre en vente ? » (24/10 soir, décision de Nico)
// ═══════════════════════════════════════════════════════════
// Après une vente ANNULÉE (Vinted : commande annulée ; Leboncoin : achat annulé), la fiche revient au stock et la
// remise en vente est PROPOSÉE, jamais automatique : un vendeur annule parfois parce que l'article n'est plus
// disponible, et il peut le remettre en ligne lui-même. UN appui remet l'article en vente sur Vinted ET partout où il
// avait été retiré à cause de cette vente, hors quota (rpc remettre_en_vente_apres_annulation). Avant de republier,
// la base attend un relevé : si le vendeur l'a déjà remis en ligne, l'annonce est rattachée, rien n'est republié
// (migration 20261024234000).
// (07/11, Ornella) « Ne pas remettre en vente » : la proposition de CETTE fiche se ferme (rpc
// ventes_annulees_ne_pas_remettre, motif choix_personne). Le geste passe par le même rappel que « Remettre en vente »
// (onRemettre(v, { remettre: false })) : le Stock le transmet tel quel, sans prop neuve. Une remise fermée par la base
// (vendu ou déjà en ligne sous une autre fiche, plus en stock) dit pourquoi (texteVenteAnnulee).
// ⛔ ZÉRO VENTE ANNULÉE ⇒ RIEN. Pas de bloc vide.
import { useState } from 'react';
import { texteVenteAnnulee } from '../utils/venteAnnulee';

// (07/11, décision de Nico) Le geste « Ne pas remettre en vente » appelle la rpc ventes_annulees_ne_pas_remettre de la
// migration 20261107150000 (feu vert nommé de Nico, preuve solide seulement) : le bouton est montré. Ce fichier ne part
// (commit, OTA) qu'APRÈS l'application de cette migration en prod — jamais avant (le bouton afficherait une erreur).
const NE_PAS_REMETTRE_EN_SERVICE = true;

const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute2: '#5C6560', teal: '#2F9E90', tealDeep: '#1B6E62', card: '#FFFFFF',
};

export default function VentesAnnulees({ lang, ventes = [], enCours = null, onRemettre }) {
  const [geste, setGeste] = useState(null);   // le bouton touché : 'remettre' | 'ne_pas_remettre'
  if (!Array.isArray(ventes) || ventes.length === 0) return null;
  const fr = lang !== 'en';
  const occupe = enCours != null;
  const appui = (v, remettre) => {
    if (occupe) return;
    setGeste(remettre ? 'remettre' : 'ne_pas_remettre');
    if (remettre) onRemettre?.(v);
    else onRemettre?.(v, { remettre: false });
  };
  return (
    <div data-bloc="ventes-annulees" style={{
      background: P.paper, border: `1px solid ${P.teal}55`, borderLeft: `4px solid ${P.teal}`,
      borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {ventes.map((v) => {
        const ceLui = enCours === v.inventaire_id;
        return (
          <div key={v.inventaire_id} style={{
            background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 14, color: P.ink, lineHeight: 1.5 }}>
              <strong>{fr ? 'Vente annulée' : 'Sale cancelled'}</strong>{' — '}« {v.titre || (fr ? 'Article' : 'Item')} »
              <div style={{ fontSize: 12.5, color: P.mute2 }}>{texteVenteAnnulee(v, lang)}</div>
            </div>
            {v.etat === 'proposee' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" disabled={occupe} onClick={() => appui(v, true)} style={{
                  padding: '9px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  cursor: occupe ? 'default' : 'pointer', opacity: occupe ? 0.6 : 1, border: 'none',
                  background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff',
                }}>
                  {ceLui && geste === 'remettre' ? '…' : (fr ? 'Remettre en vente' : 'List again')}
                </button>
                {NE_PAS_REMETTRE_EN_SERVICE && (
                <button type="button" disabled={occupe} onClick={() => appui(v, false)} style={{
                  padding: '9px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
                  cursor: occupe ? 'default' : 'pointer', opacity: occupe ? 0.6 : 1,
                  border: `1px solid ${P.border}`, background: P.card, color: P.mute2,
                }}>
                  {ceLui && geste === 'ne_pas_remettre' ? '…' : (fr ? 'Ne pas remettre en vente' : 'Don’t list again')}
                </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
