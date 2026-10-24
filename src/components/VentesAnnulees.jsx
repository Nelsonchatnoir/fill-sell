// ═══════════════════════════════════════════════════════════
// « Vente annulée — Remettre en vente ? » (24/10 soir, décision de Nico)
// ═══════════════════════════════════════════════════════════
// Après une vente ANNULÉE (Vinted : commande annulée ; Leboncoin : achat annulé), la fiche revient au stock et la
// remise en vente est PROPOSÉE, jamais automatique : un vendeur annule parfois parce que l'article n'est plus
// disponible, et il peut le remettre en ligne lui-même. UN bouton : un appui remet l'article en vente sur Vinted ET
// partout où il avait été retiré à cause de cette vente, hors quota (rpc remettre_en_vente_apres_annulation). Avant de
// republier, la base attend un relevé : si le vendeur l'a déjà remis en ligne, l'annonce est rattachée, rien n'est
// republié (migration 20261024234000).
// ⛔ ZÉRO VENTE ANNULÉE ⇒ RIEN. Pas de bloc vide.
const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute2: '#5C6560', teal: '#2F9E90', tealDeep: '#1B6E62', card: '#FFFFFF',
};
import { texteVenteAnnulee } from '../utils/venteAnnulee';

export default function VentesAnnulees({ lang, ventes = [], enCours = null, onRemettre }) {
  if (!Array.isArray(ventes) || ventes.length === 0) return null;
  const fr = lang !== 'en';
  const occupe = enCours != null;
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
              <div>
                <button type="button" disabled={occupe} onClick={() => { if (!occupe) onRemettre?.(v); }} style={{
                  padding: '9px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  cursor: occupe ? 'default' : 'pointer', opacity: occupe ? 0.6 : 1, border: 'none',
                  background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff',
                }}>
                  {ceLui ? '…' : (fr ? 'Remettre en vente' : 'List again')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
