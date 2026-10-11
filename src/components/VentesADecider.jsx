// ═══════════════════════════════════════════════════════════════════════════
// « Ventes à confirmer » — la décision ne dépend plus de la notification (11/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Louis (Business, fiches à ~9 997 exemplaires) : le mail « Vendu sur
// Vinted » partait, mais l'app ne montrait rien — sans téléphone enregistré,
// la note restait « sans_appareil » et aucune vente n'était enregistrée ; il
// ne pouvait pas choisir de remettre l'article en vente ou non.
//
// La liste vient de la base (rpc ventes_a_decider, migration 20261011100000) :
// les ventes DÉTECTÉES et annoncées (push ou mail), pas encore enregistrées,
// avec ou sans téléphone. Jamais une vente traitée, jamais un doublon, jamais
// ce que le bandeau « Vendue ? » d'un job porte déjà. Le lien du mail mène ici
// (/app?ventes=a-decider).
//
// ⛔ AUCUN SECOND CIRCUIT. « Remettre en vente » et « Ne pas remettre »
//    passent par le MÊME chemin que la déclaration (check-listing-status →
//    enregistrer_vente_declaree → enregistrer_vente_atomique : reçu
//    ventes_operations, quantité, remises_en_vente) ; seul le paramètre
//    remettre_en_vente change. Une vente décidée quitte la liste et n'y
//    revient jamais (son reçu l'en exclut, la base la classe doublon).
// ⛔ ZÉRO VENTE À CONFIRMER ⇒ RIEN. Pas de bloc vide.
import { useState } from 'react';

const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute: '#8A918C', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62', card: '#FFFFFF',
};
const PLAT = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla', depop: 'Depop', ebay: 'eBay' };

export const ANCRE_VENTES_A_CONFIRMER = 'ventes-a-confirmer';

function quand(iso, fr) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const jour = d.toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit' });
  const heure = d.toLocaleTimeString(fr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  return fr ? `le ${jour} à ${heure}` : `on ${jour} at ${heure}`;
}

/** Prix saisi → nombre > 0, sinon null (jamais 0 par défaut). */
export function prixSaisi(texte) {
  const n = parseFloat(String(texte ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function VentesADecider({ lang, devise = '€', ventes = [], enCours = null, onDecider }) {
  const [prix, setPrix] = useState({});
  if (!Array.isArray(ventes) || ventes.length === 0) return null;
  const fr = lang !== 'en';
  const occupe = enCours != null;
  const bouton = (principal) => ({
    padding: '9px 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
    cursor: occupe ? 'default' : 'pointer', opacity: occupe ? 0.6 : 1,
    ...(principal
      ? { border: 'none', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff' }
      : { border: `1px solid ${P.border}`, background: P.card, color: P.ink }),
  });

  return (
    <div id={ANCRE_VENTES_A_CONFIRMER} style={{
      background: P.paper, border: `1px solid ${P.teal}55`, borderLeft: `4px solid ${P.teal}`,
      borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: P.ink }}>
          {fr ? `Ventes à confirmer (${ventes.length})` : `Sales to confirm (${ventes.length})`}
        </div>
        <div style={{ fontSize: 12.5, color: P.mute2, lineHeight: 1.5, marginTop: 2 }}>
          {fr ? 'Ces ventes ont été vues sur la plateforme. Confirme le prix : dans les deux cas la vente est enregistrée et ton stock baisse d’une unité. « Remettre en vente » republie la même annonce ; « Ne pas remettre » garde le stock sans nouvelle annonce.'
              : 'These sales were seen on the marketplace. Confirm the price: either way the sale is recorded and your stock drops by one. “List again” republishes the same listing; “Don’t list again” keeps the stock without a new listing.'}
        </div>
      </div>

      {ventes.map((v) => {
        const cle = v.cle ?? `${v.plateforme}:${v.annonce_id}`;
        const plat = PLAT[v.plateforme] ?? v.plateforme;
        const reste = Math.max(0, Number(v.quantite ?? 1) - 1);
        const brouillon = prix[cle] ?? (v.prix != null ? String(v.prix) : '');
        const ceLui = enCours === cle;
        const decider = (remettre) => { if (!occupe) onDecider?.(v, remettre, prixSaisi(brouillon)); };
        return (
          <div key={cle} style={{
            background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 14, color: P.ink, lineHeight: 1.5 }}>
              <strong>{fr ? `Vendue sur ${plat}` : `Sold on ${plat}`}</strong>
              {' — '}« {v.titre || (fr ? 'Article' : 'Item')} »
              <div style={{ fontSize: 12.5, color: P.mute2 }}>
                {fr ? `Signalée ${quand(v.detectee_le, fr)}` : `Reported ${quand(v.detectee_le, fr)}`}
                {reste > 0 && (fr ? ` · il t’en restera ${reste.toLocaleString('fr-FR')}` : ` · ${reste.toLocaleString('en-GB')} left after this sale`)}
                {v.listing_url && (
                  <> · <a href={v.listing_url} target="_blank" rel="noreferrer" style={{ color: P.tealDeep, fontWeight: 600 }}>
                    {fr ? 'Voir l’annonce' : 'View listing'}</a></>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: P.mute2, fontWeight: 600 }}>{fr ? 'Prix de vente' : 'Sale price'}</label>
              <input type="text" inputMode="decimal" disabled={occupe} value={brouillon}
                onChange={(e) => setPrix((p) => ({ ...p, [cle]: e.target.value }))}
                style={{ width: 90, padding: '7px 10px', borderRadius: 10, border: `1px solid ${P.border}`, background: P.card, color: P.ink, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }} />
              <span style={{ fontSize: 13, color: P.mute2 }}>{devise}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {reste > 0 ? (
                <>
                  <button type="button" disabled={occupe} onClick={() => decider(true)} style={bouton(true)}>
                    {ceLui ? '…' : (fr ? `Remettre en vente sur ${plat}` : `List again on ${plat}`)}
                  </button>
                  <button type="button" disabled={occupe} onClick={() => decider(false)} style={bouton(false)}>
                    {fr ? 'Ne pas remettre' : 'Don’t list again'}
                  </button>
                </>
              ) : (
                // Dernier exemplaire : rien à remettre, la déclaration d'avant à l'identique.
                <button type="button" disabled={occupe} onClick={() => decider(true)} style={bouton(true)}>
                  {ceLui ? '…' : (fr ? 'Enregistrer la vente' : 'Record the sale')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
