// ═══════════════════════════════════════════════════════════════════════════
// LA REVUE EN LOT, POUR LES QUATRE AUTRES PLATEFORMES (2026-09-18, point a)
// ═══════════════════════════════════════════════════════════════════════════
// La revue en lot existante est Vinted-only, et pour une raison de SCHÉMA, pas
// d'oubli : sa file se lit sur des colonnes Vinted de l'article
// (`inventaire.disparu_le`, `vinted_item_id`, `vinted_status`), et sa réponse
// « pas vendue » s'écrit dans `vinted_status = 'closed'`. Rien de tout ça
// n'existe par plateforme.
//
// Pour Leboncoin, Beebs, eBay et Opla, le signal est le DRAPEAU DU JOB
// (`platform_fields.unavailable_since`). Ce bloc liste donc des JOBS, et il
// appelle les DEUX FONCTIONS QUI EXISTENT DÉJÀ et qui servent tous les jours
// (1 272 usages sur 64 comptes, mesuré le 18/09) :
//   · « C'est vendu »        → confirmSaleFromBanner(job)
//   · « Non, je l'ai retirée » → dismissUnavailable(job)
// Aucune sémantique neuve, aucune écriture neuve : c'est le bandeau par
// annonce, présenté en liste. Un bug corrigé là-bas l'est ici du même geste.
//
// ⛔ « JE L'AI RETIRÉE » NE RETIRE RIEN AILLEURS. Décision du 18/09 :
//    retirer d'une plateforme ne dit rien des autres, et armer des retraits
//    sur une affirmation qui ne porte que sur UNE plateforme détruirait des
//    annonces vivantes. `dismissUnavailable` clôt le job de CETTE plateforme
//    et rien d'autre — ce composant ne fait que l'appeler.
// ⛔ LE PRIX GARDE SA RÈGLE : saisie > `detected_price` (prix lu sur la page)
//    > `job.price` (prix de mise en ligne), et refus explicite s'il n'y a
//    rien. C'est confirmSaleFromBanner qui l'applique, pas nous.
//    ⚠️ AUCUN PRÉ-REMPLISSAGE PAR RELEVÉ ICI : `vinted_listing_snapshots` n'a
//    pas d'équivalent sur ces quatre plateformes. On ne va donc pas chercher
//    une « valeur approchante » — le champ part sur le prix connu du job, ou
//    vide, et la personne écrit ce qu'elle a encaissé.
// ⛔ AUCUNE PASSE DE MASSE : pas de « tout marquer », pas de sélection
//    multiple. Une ligne, une réponse. Le lot n'a de sens que sur Vinted, où
//    « pas vendue » s'écrit sur l'article ; ici chaque réponse touche un job
//    et mérite son clic.
const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute: '#8A8578', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62',
};
const LABEL = { leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla', vestiaire: 'Vestiaire' };

export default function RevueAutresPlateformes({
  lang, jobs = [], busyId = null, devise = '€',
  prixDraft = {}, setPrixDraft, achatDraft = {}, setAchatDraft,
  onVendue, onRetiree,
}) {
  if (!jobs.length) return null;
  const fr = lang !== 'en';
  const champ = {
    width: 92, boxSizing: 'border-box', padding: '7px 9px', borderRadius: 9,
    border: `1px solid ${P.border}`, background: '#fff', fontSize: 13,
    color: P.ink, fontFamily: 'inherit',
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: P.mute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        {fr ? `Sur les autres plateformes (${jobs.length})` : `On the other platforms (${jobs.length})`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map((job) => {
          const busy = busyId === job.id;
          const pf = job.platform_fields || {};
          // Le prix que confirmSaleFromBanner prendra par défaut, montré tel
          // quel pour qu'on sache ce qu'on valide. Jamais une approximation :
          // s'il n'y a ni prix détecté ni prix de mise en ligne, le champ est
          // vide et le geste sera refusé tant qu'il le reste.
          const defaut = Number(pf.detected_price ?? job.price) || '';
          return (
            <div key={job.id} style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 14, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 13.5, color: P.ink, lineHeight: 1.45 }}>
                <strong>{job.title || (fr ? 'Article' : 'Item')}</strong>
                <span style={{ color: P.mute2 }}> — {LABEL[job.platform] ?? job.platform}</span>
                {job.listing_url && (
                  <> · <a href={job.listing_url} target="_blank" rel="noreferrer" style={{ color: P.tealDeep, fontWeight: 600 }}>{fr ? 'Voir l’annonce' : 'View listing'}</a></>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 11.5, color: P.mute2 }}>
                  {fr ? 'Vendu' : 'Sold'}{' '}
                  <input inputMode="decimal" style={champ} placeholder={defaut === '' ? devise : String(defaut)}
                    value={prixDraft[job.id] ?? ''} disabled={busy}
                    onChange={(e) => setPrixDraft?.((p) => ({ ...p, [job.id]: e.target.value }))} />
                </label>
                <label style={{ fontSize: 11.5, color: P.mute2 }}>
                  {fr ? 'Acheté' : 'Bought'}{' '}
                  <input inputMode="decimal" style={champ} placeholder={fr ? 'optionnel' : 'optional'}
                    value={achatDraft[job.id] ?? ''} disabled={busy}
                    onChange={(e) => setAchatDraft?.((p) => ({ ...p, [job.id]: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={() => onVendue?.(job)}
                  style={{ padding: '8px 15px', borderRadius: 999, border: 'none', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {busy ? '…' : (fr ? '🎉 Vendue' : '🎉 Sold')}
                </button>
                <button type="button" disabled={busy} onClick={() => onRetiree?.(job)}
                  style={{ padding: '8px 15px', borderRadius: 999, border: `1px solid ${P.border}`, background: P.paper, color: P.ink, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {fr ? 'Je l’ai retirée' : 'I removed it'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: P.mute, lineHeight: 1.5, marginTop: 8 }}>
        {fr ? '« Je l’ai retirée » ne retire rien sur les autres plateformes : la réponse ne vaut que pour celle qui est nommée.'
            : '“I removed it” removes nothing on the other platforms: the answer only applies to the one named.'}
      </div>
    </div>
  );
}
