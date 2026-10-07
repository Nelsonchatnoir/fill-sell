// ═══════════════════════════════════════════════════════════════════════════
// « EST-CE LE MÊME ARTICLE ? » — UNE PAIRE À LA FOIS (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// N'arrivent ici que les paires de fiches PROBABLES : deux fiches du stock qui
// désignent peut-être le même objet (le relevé d'une plateforme ou le dressing
// Vinted a créé la seconde sans reconnaître la première). Ce qui était CERTAIN
// est déjà réuni par le serveur et ne passe jamais par cet écran.
//
// ⛔ UN SEUL GESTE PAR RÉPONSE, UN SEUL CHEMIN D'ÉCRITURE : la RPC
//    inventaire_doublon_decider. « Oui » fusionne (inventaire_fusionner : les
//    annonces en ligne des DEUX fiches restent en ligne et se retrouvent sur
//    la fiche gardée — rien n'est retiré, rien n'est déclaré vendu ; la
//    fusion se défait depuis la fiche). « Non » : la paire n'est plus jamais
//    reproposée.
// ⛔ La fiche gardée est choisie par le serveur (celle créée dans l'app, sinon
//    la plus ancienne ; l'annonce Vinted suit l'objet) : c'est dit, pas caché.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { premierePhoto } from '../components/GalleryPhoto';
import { track } from '../analytics/analytics';
import { deciderDoublon, pairesAffichables, raisonsDoublon, origineFiche, estQuestionDejaVendu, estQuestionCopie, texteQuestionCopie, annonceARetirer, nomPlateforme, rangerDansLeStock } from '../utils/doublons';
import { A, DEGRADE, CSS_ANNONCES } from './theme';

const prixLisible = (v, fr) => (v == null || v === '' || !Number.isFinite(Number(v))
  ? null
  : `${Number(v).toLocaleString(fr ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);

const photoDe = (item) => {
  try { return premierePhoto(item?.photos) ?? null; } catch { return null; }
};

function CarteFiche({ item, fr, garde, etiquette }) {
  const url = photoDe(item);
  return (
    <div style={{ flex: 1, minWidth: 0, background: A.card, border: `1px solid ${garde ? A.mentheBord : A.border}`, borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {url
        ? <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', border: `1px solid ${A.border}` }} />
        : <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: A.paper, border: `1px solid ${A.border}` }} />}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: A.ink, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {item?.title || '—'}
      </div>
      <div style={{ fontSize: 11.5, color: A.texteSecondaire, lineHeight: 1.4 }}>
        {[prixLisible(item?.sell, fr), origineFiche(item, fr)].filter(Boolean).join(' · ')}
      </div>
      {garde && (
        <span style={{ alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 999, background: A.menthe, border: `1px solid ${A.mentheBord}`, color: A.tealDeep, fontSize: 10.5, fontWeight: 700 }}>
          {etiquette ?? (fr ? 'Fiche gardée' : 'Kept item')}
        </span>
      )}
    </div>
  );
}

// (07/10, rattachement avant stock) mode « a_verifier » : `paires` (b =
// l'article à vérifier, a = celui auquel il ressemble, cf. pairesAVerifier)
// puis `orphelins` (plus d'article auquel le comparer : « Le mettre dans mon
// stock »). Un article à vérifier n'est PAS dans le stock affiché : chaque
// réponse l'y fait entrer (« non »), ou le réunit à l'autre (« oui »).
export default function EcranDoublons({ lang, items, doublons, onClose, onDecision, mode = null, paires = null, orphelins = null, userId = null }) {
  const fr = lang !== 'en';
  const aVerifier = mode === 'a_verifier';
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);
  const [info, setInfo] = useState(null);
  const [traitees, setTraitees] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = useMemo(
    () => (aVerifier
      ? [...(paires ?? []), ...(orphelins ?? []).map((b) => ({ id: `orphelin:${b.id}`, orphelin: true, b, preuves: null }))]
      : pairesAffichables(doublons, items)).filter((d) => !traitees.has(d.id)),
    [aVerifier, paires, orphelins, doublons, items, traitees],
  );
  const paire = file[0] ?? null;
  const orphelin = !!paire?.orphelin;
  // (2026-09-27) « Déjà vendu ? » : une annonce encore en ligne ressemble à un
  // objet VENDU. « Oui » réunit les deux fiches ET retire l'annonce encore en
  // ligne (le serveur arme le retrait) ; « Non » : deux articles différents.
  // En mode « à vérifier », toute paire dont l'autre article est vendu.
  const dejaVendu = aVerifier ? (!orphelin && paire?.a?.statut === 'vendu') : estQuestionDejaVendu(paire);
  // (06/10) Une COPIE de la fiche vendue, liée par le seul titre : une seule
  // fiche, la question « c'est le même article ? » et l'annonce concernée.
  const copie = !aVerifier && estQuestionCopie(paire);
  // (2026-09-30) L'annonce qu'un « oui » retirera est montrée AVANT le geste :
  // c'est ce geste qui vaut preuve de vente pour CE retrait-là (décision Nico).
  const aRetirer = !dejaVendu ? null
    : (aVerifier
      ? (paire?.preuves?.annonce_id && paire?.preuves?.platform
        ? { id: String(paire.preuves.annonce_id), plateforme: String(paire.preuves.platform), url: typeof paire.preuves.url === 'string' && paire.preuves.url ? paire.preuves.url : null }
        : null)
      : annonceARetirer(paire));
  // La plateforme où l'article à vérifier a été trouvé.
  const trouveeSur = nomPlateforme(paire?.b?.a_verifier?.platform ?? paire?.preuves?.platform ?? paire?.b?.plateforme ?? '');
  // (08/10, Nico) « Annonce en double ? » : deux annonces d'une MÊME plateforme,
  // même photo, même titre — jamais fusionnées d'office (deux exemplaires
  // possibles). « Oui » = la même annonce publiée deux fois (une seule carte,
  // ses deux annonces restent en ligne) ; « Non » = deux exemplaires, deux cartes.
  const enDouble = !orphelin && paire?.motif === 'annonce_en_double';
  const plateformeDouble = nomPlateforme(paire?.preuves?.platform ?? paire?.b?.a_verifier?.platform ?? '');

  const ranger = async () => {
    if (!paire || busy) return;
    setBusy(true); setErreur(null); setInfo(null); setFait(null);
    const r = await rangerDansLeStock(userId, paire.b?.id).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r?.ok) { setErreur(fr ? 'Pas enregistré — réessaie dans un instant.' : 'Not saved — try again in a moment.'); return; }
    track('a_verifier_range', {});
    setFait(fr ? 'Noté : il est dans ton stock.' : "Noted: it's in your stock.");
    setTraitees((v) => new Set([...v, paire.id]));
    onDecision?.();
  };

  const repondre = async (decision) => {
    if (!paire || busy) return;
    setBusy(true); setErreur(null); setInfo(null); setFait(null);
    const r = await deciderDoublon(paire.id, decision, decision === 'oui' && aRetirer ? aRetirer.id : null)
      .catch((e) => ({ ok: false, message: String(e?.message ?? e) }));
    setBusy(false);
    // Le serveur n'a pas pu retirer l'annonce : rien n'a été réuni, la
    // personne la retire elle-même ; le relevé suivant la verra disparaître.
    if (!r?.ok && r?.reason === 'retrait_impossible') {
      const codes = Array.isArray(r?.plateformes) && r.plateformes.length ? r.plateformes : (aRetirer ? [aRetirer.plateforme] : []);
      const noms = codes.map(nomPlateforme).join(fr ? ' et ' : ' and ');
      setInfo(fr
        ? `On ne peut pas retirer cette annonce automatiquement. Retirez-la vous-même sur ${noms || 'la plateforme'}, elle disparaîtra à la prochaine synchronisation.`
        : `We can't remove this listing automatically. Remove it yourself on ${noms || 'the platform'}; it will disappear at the next sync.`);
      track('doublon_decision', { decision, resultat: 'retrait_impossible' });
      setTraitees((v) => new Set([...v, paire.id]));
      return;
    }
    // La copie n'est plus en ligne : il n'y a plus rien à retirer.
    if (!r?.ok && r?.reason === 'sans_objet') {
      setInfo(fr ? "Cette annonce n'est plus en ligne : rien à retirer." : 'This listing is no longer online: nothing to remove.');
      setTraitees((v) => new Set([...v, paire.id]));
      onDecision?.();
      return;
    }
    if (!r?.ok && r?.reason !== 'deja_tranchee') {
      setErreur(fr ? "Réponse non enregistrée — réessaie dans un instant." : 'Answer not saved — try again in a moment.');
      return;
    }
    track('doublon_decision', { decision });
    setFait(copie
      ? (decision === 'oui'
        ? (fr ? `C'est noté : ton annonce ${nomPlateforme(aRetirer?.plateforme)} va être retirée.` : `Noted: your ${nomPlateforme(aRetirer?.plateforme)} listing will be removed.`)
        : (fr ? "Noté : c'est un autre exemplaire. On n'y touche pas et on ne te le redemandera pas." : "Noted: it's another copy. We won't touch it or ask again."))
      : decision === 'oui' && dejaVendu
      ? (fr ? `C'est noté : « ${paire.a?.title ?? ''} » est vendu. Son annonce encore en ligne va être retirée.` : `Noted: “${paire.a?.title ?? ''}” is sold. Its listing still online will be removed.`)
      : decision === 'oui' && enDouble
      ? (fr ? `Une seule carte pour « ${paire.a?.title ?? ''} » : ses deux annonces restent en ligne, rien n'est retiré.` : `One card for “${paire.a?.title ?? ''}”: both listings stay online, nothing is removed.`)
      : decision === 'oui'
      ? (fr ? `Réunies en une seule fiche : « ${paire.a?.title ?? ''} ». Tu peux défaire la fusion depuis la fiche.` : `Merged into one item: “${paire.a?.title ?? ''}”. You can undo it from the item.`)
      : enDouble
      ? (fr ? 'Noté : deux exemplaires, deux cartes. On ne te le redemandera pas.' : "Noted: two copies, two cards. We won't ask again.")
      : aVerifier
      ? (fr ? "Noté : c'est un autre article, il est maintenant dans ton stock." : "Noted: it's another item, it's now in your stock.")
      : (fr ? 'Noté : ce sont deux articles différents. On ne te le redemandera pas.' : "Noted: they're two different items. We won't ask again."));
    setTraitees((v) => new Set([...v, paire.id]));
    onDecision?.();
  };

  const raisons = paire ? raisonsDoublon(paire.preuves, fr) : [];

  return createPortal(
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: A.canvas, borderRadius: '26px 26px 0 0',
          maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)', boxSizing: 'border-box', fontFamily: 'inherit',
        }}>
        <style>{CSS_ANNONCES}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: A.ink }}>
              {dejaVendu ? (fr ? 'Déjà vendu ?' : 'Already sold?')
                : enDouble ? (fr ? 'Annonce en double ?' : 'Duplicate listing?')
                : aVerifier ? (fr ? 'Annonces à vérifier' : 'Listings to check')
                : (fr ? 'Est-ce le même article ?' : 'Is it the same item?')}
            </div>
            {paire && (
              <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire, fontVariantNumeric: 'tabular-nums' }}>
                {fr ? `1 sur ${file.length}` : `1 of ${file.length}`}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={fr ? 'Fermer' : 'Close'} className="rv-focus"
            style={{ border: 'none', background: 'transparent', fontSize: 20, color: A.texteSecondaire, cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44 }}>✕</button>
        </div>

        {fait && (
          <div className="rv-up" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: A.menthe, border: `1px solid ${A.mentheBord}` }}>
            <span aria-hidden="true" style={{ color: A.tealDeep, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, color: A.ink }}>{fait}</span>
          </div>
        )}
        {info && (
          <div role="status" style={{ margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: A.paper, border: `1px solid ${A.border}`, fontSize: 12, lineHeight: 1.45, color: A.ink }}>{info}</div>
        )}
        {erreur && (
          <div style={{ margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: '#FDECEA', border: '1px solid #F3C7C2', fontSize: 12, lineHeight: 1.45, color: A.rougeTexte }}>{erreur}</div>
        )}

        {!paire ? (
          <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 8px 10px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: DEGRADE, color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: A.ink }}>{aVerifier ? (fr ? 'Tout est rangé' : 'All sorted') : (fr ? 'Plus aucune question' : 'No more questions')}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: A.texteSecondaire, maxWidth: 340 }}>
              {aVerifier
                ? (fr ? 'Chaque annonce trouvée sur tes plateformes est dans ton stock, une seule carte par article.' : 'Every listing found on your platforms is in your stock, one card per item.')
                : (fr ? "Chaque objet de ton stock n'a plus qu'une fiche, ou tu nous as dit lesquels sont différents." : 'Every item in your stock has a single entry, or you told us which ones differ.')}
            </div>
            <button type="button" onClick={onClose} className="rv-cta rv-focus"
              style={{ marginTop: 4, minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              {fr ? 'Fermer' : 'Close'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: A.texteSecondaire, lineHeight: 1.5, marginBottom: 12 }}>
              {orphelin
                ? (fr
                  ? `Trouvée sur ${trouveeSur || 'une autre plateforme'} pendant ta synchro. L'article auquel elle ressemblait n'est plus dans ton stock : tu peux l'y ranger.`
                  : `Found on ${trouveeSur || 'another platform'} during your sync. The item it looked like is no longer in your stock: you can file it there.`)
                : enDouble
                ? (fr
                  ? `Deux annonces ${plateformeDouble || 'de la même plateforme'} ont la même photo et le même titre : « ${paire.a?.title ?? ''} ». Est-ce la même annonce publiée deux fois, ou deux exemplaires ? Rien n'est retiré, quelle que soit ta réponse.`
                  : `Two ${plateformeDouble || 'same-platform'} listings share the same photo and title: “${paire.a?.title ?? ''}”. Is it the same listing published twice, or two copies? Nothing is removed either way.`)
                : aVerifier && !dejaVendu
                ? (fr
                  ? `Trouvée sur ${trouveeSur || 'une autre plateforme'} pendant ta synchro, elle ressemble à « ${paire.a?.title ?? ''} », déjà dans ton stock. Si c'est le même objet, on les réunit en une seule carte (ses annonces restent en ligne). Sinon, elle entre dans ton stock. En attendant, ses ventes sont suivies comme d'habitude.`
                  : `Found on ${trouveeSur || 'another platform'} during your sync, it looks like “${paire.a?.title ?? ''}”, already in your stock. If it's the same object, we merge them into one card (its listings stay online). Otherwise, it goes into your stock. Meanwhile, its sales are tracked as usual.`)
                : copie
                ? texteQuestionCopie(paire, fr)
                : dejaVendu
                ? (fr
                  ? `« ${paire.a?.title ?? ''} » est vendu. Une annonce encore en ligne lui ressemble. Si c'est le même objet, on réunit les deux fiches et on retire cette annonce, pour ne pas le vendre deux fois.`
                  : `“${paire.a?.title ?? ''}” is sold. A listing still online looks like it. If it's the same object, we merge the two items and remove that listing, so it isn't sold twice.`)
                : fr
                ? `Ces deux fiches se ressemblent beaucoup${raisons.length ? ` (${raisons.join(', ')})` : ''}. Si c'est le même objet, on les réunit : ses annonces en ligne restent en ligne, rien n'est retiré.`
                : `These two items look alike${raisons.length ? ` (${raisons.join(', ')})` : ''}. If they're the same object, we merge them: its online listings stay online, nothing is removed.`}
            </div>
            <div className="rv-up" style={{ display: 'flex', gap: 10, ...(copie || orphelin ? { maxWidth: 220 } : {}) }}>
              {!orphelin && (
                <CarteFiche item={paire.a} fr={fr} garde
                  etiquette={dejaVendu ? (fr ? 'Vendu' : 'Sold') : enDouble ? (fr ? 'Annonce 1' : 'Listing 1') : aVerifier ? (fr ? 'Dans ton stock' : 'In your stock') : undefined} />
              )}
              {!copie && (
                <CarteFiche item={paire.b} fr={fr} garde={aVerifier}
                  etiquette={enDouble ? (fr ? 'Annonce 2' : 'Listing 2') : aVerifier ? (fr ? `Trouvée sur ${trouveeSur || 'une autre plateforme'}` : `Found on ${trouveeSur || 'another platform'}`) : undefined} />
              )}
            </div>
            {aRetirer && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: A.paper, border: `1px solid ${A.border}`, fontSize: 12, lineHeight: 1.45, color: A.ink }}>
                {fr ? 'Si tu réponds oui, cette annonce sera retirée : ' : 'If you answer yes, this listing will be removed: '}
                <strong>{nomPlateforme(aRetirer.plateforme)}</strong>
                {aRetirer.url && (
                  <>
                    {' — '}
                    <a href={aRetirer.url} target="_blank" rel="noopener noreferrer" style={{ color: A.tealDeep, fontWeight: 600 }}>
                      {fr ? "voir l'annonce" : 'see the listing'}
                    </a>
                  </>
                )}
              </div>
            )}
            {orphelin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <button type="button" disabled={busy} onClick={ranger} className="rv-cta rv-focus"
                  style={{ width: '100%', minHeight: 48, borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {fr ? 'La mettre dans mon stock' : 'Put it in my stock'}
                </button>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button type="button" disabled={busy} onClick={() => repondre('oui')} className="rv-cta rv-focus"
                style={{ width: '100%', minHeight: 48, borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {copie
                  ? (fr ? 'Oui, la retirer' : 'Yes, remove it')
                  : dejaVendu
                  ? (fr ? "Oui, c'est le même — retirer l'annonce" : "Yes, same item — remove the listing")
                  : enDouble
                  ? (fr ? "Oui, c'est la même annonce" : "Yes, it's the same listing")
                  : (fr ? "Oui, c'est le même" : "Yes, it's the same")}
              </button>
              <button type="button" disabled={busy} onClick={() => repondre('non')} className="rv-focus"
                style={{ width: '100%', minHeight: 46, borderRadius: 999, border: `1px solid ${A.border}`, background: A.card, color: A.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                {copie
                  ? (fr ? "Non, c'est un autre exemplaire" : "No, it's another copy")
                  : enDouble
                  ? (fr ? 'Non, deux exemplaires' : 'No, two copies')
                  : aVerifier
                  ? (fr ? "Non, c'est un autre article" : "No, it's another item")
                  : (fr ? 'Non, ce sont deux articles' : "No, they're two items")}
              </button>
              {!copie && (
                <div style={{ fontSize: 11, lineHeight: 1.45, color: A.texteSecondaire, textAlign: 'center' }}>
                  {fr ? 'La fusion se défait depuis la fiche gardée.' : 'A merge can be undone from the kept item.'}
                </div>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
