// ═══════════════════════════════════════════════════════════════════════════
// « ANNONCES PLUS EN LIGNE » — LES QUESTIONS, DANS « À RÉGLER » (12/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ PLUS AUCUN BANDEAU (Nico, 12/10 soir) : ces questions s'empilaient en haut
//    de TOUS les onglets (zone des bandeaux d'App.jsx). Elles vivent ici, dans
//    l'écran ouvert depuis la ligne « Annonces plus en ligne » de « À régler »
//    (StockTab). MÊMES questions, MÊMES saisies, MÊMES gestes qu'avant — App
//    garde ses lectures et ses écritures (confirmSaleFromBanner,
//    dismissUnavailable, reporterAlerte, masquerAlerte, accepterProposition…) ;
//    ce composant ne sait rien faire tout seul.
// Trois formes : « Annonce remplacée ? » (proposition du moteur), « Vendue sur
// X » (preuve positive) et « Annonce plus en ligne — Vendue ? ».
// (15/10, P1-0) « Vendue sur X » a deux sorties de plus, tranchées par la base
// (signal_vente_trancher, App.trancherSignalVente) : « Ce n'est pas vendu »
// (démenti si le relevé voit l'annonce en ligne, sinon relue) et « Déjà
// enregistrée » (article déjà vendu par une vente saisie : même cession). Plus
// jamais une carte sans issue qui revient à chaque rechargement. En tête, la
// file à passer en revue (FileAnnoncesADepiler → la modale de revue) ; au pied,
// les alertes masquées (« Masquer », 17/09), comptées à part, jamais perdues.
// Gabarit des écrans du Stock (src/stock/jetons) : carte blanche, liseré gris,
// icône dans un carré — jamais un bloc coloré.
import { Link2, BadgeEuro, EyeOff } from 'lucide-react';
import FileAnnoncesADepiler from './FileAnnoncesADepiler';
import { S, DEGRADE } from '../stock/jetons';
import { prixAchatConnu } from '../utils/comptabilite';
import { prixParDefautDuBandeau, retireeProposable } from '../utils/prixBandeauVente';

const PLAT = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', vestiaire: 'Vestiaire', opla: 'Opla', depop: 'Depop' };

const carte = { marginTop: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 };
const texte = { flex: 1, minWidth: 0, fontSize: 14, lineHeight: '20px', color: S.ink, overflowWrap: 'anywhere' };
const champ = { width: 96, height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink, fontSize: 15, fontWeight: 700, fontFamily: 'inherit' };
const primaire = (busy) => ({ height: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });
const secondaire = (busy) => ({ height: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, color: S.ink2, fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' });
const discret = (busy) => ({ height: 40, padding: '0 12px', borderRadius: 999, border: 'none', background: 'transparent', color: S.ink2, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' });
const lien = { padding: '8px 12px', border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 12, lineHeight: '16px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

function Pastille({ fond, encre, children }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }}>
      {children}
    </span>
  );
}

export default function QuestionsPlusEnLigne({
  lang = 'fr', currency = 'EUR',
  questions = [], montrerMasquees = false, nbMasquees = 0, pfMasquees = [], nbADepiler = 0,
  confirmingSale = null, salePriceDraft = {}, setSalePriceDraft, buyPriceDraft = {}, setBuyPriceDraft,
  ficheDuJob, reportJoursExt = 7, reportMax = 3,
  onOuvrirRevue, onAccepterProposition, onRefuserProposition, onConfirmerVente, onRetiree, onReporter,
  onMasquer, onPrixAchatInconnu, onBasculerMasquees, onReafficherPlateforme,
  onPasVendue = null, onDejaEnregistree = null,
}) {
  const fr = lang === 'fr';
  const devise = currency === 'EUR' ? '€' : currency;
  const visibles = questions.filter((x) => !x.q.masquee || montrerMasquees);
  return (
    <div data-ecran="plus-en-ligne">
      {/* La file à passer en revue (Vinted, et les autres plateformes en
          liste) : la même porte qu'avant vers la modale de revue. */}
      {nbADepiler > 0 && (
        <div style={{ marginTop: 16 }}>
          <FileAnnoncesADepiler lang={lang} nb={nbADepiler} onOuvrir={onOuvrirRevue} />
        </div>
      )}
      {!visibles.length && !nbADepiler && (
        <div style={{ marginTop: 16, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
          {fr ? 'Rien à trancher ici : tes annonces sont toutes là où elles doivent être.' : 'Nothing to decide here: your listings are all where they should be.'}
        </div>
      )}
      {visibles.map(({ job, q }) => {
        const plat = PLAT[job.platform] || job.platform;
        // (25/09) Inactif pendant QUELQUE vente que ce soit — cf. venteEnVolRef.
        const busy = confirmingSale != null;
        const ceBandeau = confirmingSale === job.id;
        const pf = job.platform_fields || {};
        const masquee = q.masquee;
        const proposition = q.proposition;
        if (proposition) {
          return (
            <div key={job.id} data-question="remplacee" style={carte}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Pastille fond={S.menthe} encre={S.tealDeep}><Link2 size={20} strokeWidth={2} aria-hidden="true" /></Pastille>
                <div style={texte}>
                  <strong style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{fr ? 'Annonce remplacée ?' : 'Listing replaced?'}</strong>
                  {fr
                    ? <>« {job.title || 'Article'} » n'est plus à son ancienne adresse sur <strong>{plat}</strong>, mais une annonce au même titre{proposition.prix != null ? ` (${proposition.prix} €)` : ''} est en ligne. C'est la même ?</>
                    : <>“{job.title || 'Item'}” is no longer at its old address on <strong>{plat}</strong>, but a listing with the same title{proposition.prix != null ? ` (€${proposition.prix})` : ''} is online. Is it the same one?</>}
                  {proposition.url && <> <a href={proposition.url} target="_blank" rel="noreferrer" style={{ color: S.tealDeep, fontWeight: 600 }}>{fr ? 'Voir l’annonce' : 'View listing'}</a></>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={() => onAccepterProposition(job, proposition)} style={primaire(busy)}>
                  {ceBandeau ? '…' : (fr ? "Oui, c'est elle" : 'Yes, that’s it')}
                </button>
                <button type="button" disabled={busy} onClick={() => onRefuserProposition(job, proposition)} style={secondaire(busy)}>
                  {fr ? 'Non' : 'No'}
                </button>
              </div>
              <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>
                {fr ? '« Oui » rattache la nouvelle annonce à cet article et lève l’alerte — rien n’est retiré, aucune vente n’est enregistrée.' : '“Yes” links the new listing to this item and clears the alert — nothing is removed, no sale is recorded.'}
              </div>
            </div>
          );
        }
        // Preuve positive de vente (Vinted : is_closed + item_closing_action)
        const vendu = pf.sale_signal === 'sold';
        // Prix pré-rempli : celui lu sur la page si la plateforme l'expose,
        // sinon le prix de mise en ligne — celui d'une REPUBLICATION compris
        // (11/10 : detected_price et price y sont NULL), puis celui de la
        // fiche. Modifiable dans tous les cas ; MÊME règle que l'envoi.
        const prixDefaut = prixParDefautDuBandeau(job, ficheDuJob(job));
        const art = ficheDuJob(job);
        return (
          <div key={job.id} data-question={vendu ? 'vendue' : 'plus-en-ligne'} style={carte}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {vendu
                ? <Pastille fond={S.menthe} encre={S.tealDeep}><BadgeEuro size={20} strokeWidth={2} aria-hidden="true" /></Pastille>
                : <Pastille fond={S.ambreFond} encre={S.ambreEncre}><EyeOff size={20} strokeWidth={2} aria-hidden="true" /></Pastille>}
              <div style={texte}>
                <strong style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{vendu
                  ? (fr ? `Vendue sur ${plat}` : `Sold on ${plat}`)
                  : (fr ? 'Annonce plus en ligne' : 'Listing no longer online')}</strong>
                {vendu
                  ? (fr
                    ? <>« {job.title || 'Article'} » — confirme le prix pour l'enregistrer.</>
                    : <>“{job.title || 'Item'}” — confirm the price to record it.</>)
                  : (fr
                    ? <>« {job.title || 'Article'} » n'est plus en ligne sur <strong>{plat}</strong>. Vendue ?</>
                    : <>“{job.title || 'Item'}” is no longer online on <strong>{plat}</strong>. Sold?</>)}
              </div>
            </div>
            {/* Prix éditable : la vente a pu être négociée (offre acceptée,
                marchandage en remise main propre) — même sur Vinted, qui
                n'expose PAS le montant d'une offre acceptée. C'est ce montant
                qui sera enregistré comme prix_vente. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: S.ink2, fontWeight: 600 }}>{fr ? 'Prix de vente' : 'Sale price'}</label>
              <input type="text" inputMode="decimal" disabled={busy}
                value={salePriceDraft[job.id] ?? (prixDefaut != null ? String(prixDefaut) : '')}
                onChange={(e) => setSalePriceDraft((p) => ({ ...p, [job.id]: e.target.value }))}
                style={champ} />
              <span style={{ fontSize: 13, color: S.ink2 }}>{devise}</span>
            </div>
            {/* PRIX D'ACHAT — demandé ICI, au seul moment où la personne s'en
                souvient et où elle veut répondre. Affiché uniquement si
                l'article est lié à l'inventaire ET que son prix d'achat est
                encore inconnu (les articles importés du dressing Vinted sont
                exactement dans ce cas).
                « Je ne sais plus » est OBLIGATOIRE et pas décoratif : sans
                porte de sortie, les gens inventent un chiffre pour se
                débarrasser de la question, et toutes les stats deviennent du
                bruit indétectable. Marge absente > marge fausse. */}
            {art && !prixAchatConnu(art) && !art.prix_achat_inconnu && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, color: S.ink2, fontWeight: 600 }}>{fr ? "Tu l'avais payé combien ?" : 'What did you pay for it?'}</label>
                <input type="text" inputMode="decimal" disabled={busy}
                  value={buyPriceDraft[job.id] ?? ''}
                  onChange={(e) => setBuyPriceDraft((p) => ({ ...p, [job.id]: e.target.value }))}
                  style={champ} />
                <span style={{ fontSize: 13, color: S.ink2 }}>{devise}</span>
                <button type="button" disabled={busy} onClick={() => onPrixAchatInconnu(job)}
                  style={{ ...secondaire(busy), height: 32, padding: '0 12px', fontSize: 12.5 }}>
                  {fr ? 'Je ne sais plus' : "I don't remember"}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={() => onConfirmerVente(job)} style={primaire(busy)}>
                {ceBandeau ? '…' : (fr ? 'Oui, enregistrer la vente' : 'Yes, record the sale')}
              </button>
              {/* ⛔ (11/10, Rémi) Jamais sous une preuve de vente : « je l'ai
                  retirée » y contredit la plateforme et annulait la vente. */}
              {retireeProposable(job) && (
                <button type="button" disabled={busy} onClick={() => onRetiree(job)} style={secondaire(busy)}>
                  {fr ? "Non, je l'ai retirée" : 'No, I removed it'}
                </button>
              )}
              {/* (15/10) L'article est DÉJÀ vendu (vente saisie) : « Oui » serait
                  refusé (« déjà vendu ») — cette vente-là est déjà comptée. */}
              {vendu && onDejaEnregistree && art?.statut === 'vendu' && (
                <button type="button" disabled={busy} data-sortie="deja-enregistree" onClick={() => onDejaEnregistree(job)}
                  title={fr ? 'Cet article est déjà vendu dans FillSell : l’annonce est classée vendue sur cette vente, rien n’est compté deux fois.' : 'This item is already sold in FillSell: the listing is filed under that sale, nothing is counted twice.'}
                  style={secondaire(busy)}>
                  {fr ? 'Déjà enregistrée' : 'Already recorded'}
                </button>
              )}
              {/* (15/10, Louis) La plateforme peut se tromper (ancienne annonce
                  vendue du même article) : la base relit l'annonce, jamais une
                  vente effacée sur un simple appui. */}
              {vendu && onPasVendue && (
                <button type="button" disabled={busy} data-sortie="pas-vendue" onClick={() => onPasVendue(job)}
                  title={fr ? 'FillSell vérifie l’annonce : si elle est en ligne, l’alerte disparaît ; si la plateforme la montre vendue, on te le dit. Rien n’est enregistré.' : 'FillSell checks the listing: if it is online, the alert goes away; if the platform shows it sold, we tell you. Nothing is recorded.'}
                  style={discret(busy)}>
                  {fr ? "Ce n'est pas vendu" : 'Not sold'}
                </button>
              )}
              {/* LA TROISIÈME SORTIE, visuellement en retrait : ni fond, ni
                  bordure. Elle n'écrit rien — c'est une RESPIRATION, pas une
                  décision. Le titre dit le délai en clair, parce qu'un bouton
                  qui fait disparaître une question sans dire quand elle revient
                  se lit comme un enterrement. */}
              {!vendu && !masquee && (
                <button type="button" disabled={busy} onClick={() => onReporter(job)}
                  title={fr
                    ? `Ne décide rien et n'écrit rien. La question revient après ${reportJoursExt} jours d'utilisation de l'extension /* estimation-ok: une règle de report, pas une attente */ — pas au bout de ${reportJoursExt} jours de calendrier. Après ${reportMax} reports, l'annonce passe dans « à vérifier » et ne s'affiche plus ici.`
                    : `Decides nothing and writes nothing. The question comes back after ${reportJoursExt} days of actually using the extension — not ${reportJoursExt} calendar days. After ${reportMax} deferrals it moves to “to check” and stops showing here.`}
                  style={discret(busy)}>
                  {fr ? 'Je ne sais pas' : "I don't know"}
                </button>
              )}
              {/* « Masquer » (17/09) : gardé tel quel en attendant la décision
                  de Nico (rapport du 12/10 soir) — la question sort du compte de
                  « À régler », la surveillance continue. */}
              {!vendu && (
                <button type="button" disabled={busy} onClick={() => onMasquer(job, !masquee)}
                  title={masquee
                    ? (fr ? 'Réaffiche cette alerte.' : 'Shows this alert again.')
                    : (fr ? "Masque cette alerte sans rien décider : l'annonce reste surveillée, tu pourras la réafficher." : 'Hides this alert without deciding anything: the listing stays monitored, you can show it again.')}
                  style={discret(busy)}>
                  {masquee ? (fr ? 'Réafficher' : 'Show again') : (fr ? 'Masquer' : 'Hide')}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {/* Les masquées : comptées à part, montrées au tap — jamais perdues. Une
          plateforme masquée en entier (réglage du 17/09) se réaffiche ici. */}
      {(nbMasquees > 0 || pfMasquees.length > 0) && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {nbMasquees > 0 && (
            <button type="button" data-masquees="" onClick={onBasculerMasquees} style={lien}>
              {montrerMasquees
                ? (fr ? 'Cacher les alertes masquées' : 'Hide the hidden alerts')
                : (fr ? `${nbMasquees} alerte${nbMasquees > 1 ? 's' : ''} masquée${nbMasquees > 1 ? 's' : ''} · afficher` : `${nbMasquees} hidden alert${nbMasquees > 1 ? 's' : ''} · show`)}
            </button>
          )}
          {pfMasquees.map((p) => (
            <button key={p} type="button" onClick={() => onReafficherPlateforme(p)} style={lien}>
              {fr ? `Alertes ${PLAT[p] ?? p} masquées · réafficher` : `${PLAT[p] ?? p} alerts hidden · show again`}
            </button>
          ))}
          <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, textAlign: 'center' }}>
            {fr
              ? 'Masquer ne coupe rien : la surveillance continue, et une vente se déclare toujours depuis la fiche de l’article.'
              : 'Hiding stops nothing: monitoring continues, and a sale is still recorded from the item card.'}
          </span>
        </div>
      )}
    </div>
  );
}
