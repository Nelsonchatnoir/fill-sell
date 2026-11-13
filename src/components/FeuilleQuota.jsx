// ═══════════════════════════════════════════════════════════════════════════
// LA FEUILLE « TES QUOTAS DU MOIS » — OUVERTE PAR LE COMPTEUR DE L'EN-TÊTE (13/11/2026, bloc B1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le compteur (pastille de la grille, ou compteur d'annonces d'avant) n'ouvre plus la fenêtre des offres : il ouvre ce
// DÉTAIL. Téléphone d'abord — une feuille qui monte du bas, lisible d'un coup d'œil :
//   1. en tête : la formule et la date de la remise à zéro ;
//   2. une phrase : ce qui RESTE, jauge par jauge, et jusqu'à quand (« Il te reste 3 annonces, 41 publications et
//      22 remontées jusqu'au 4 décembre. ») ; les jauges illimitées à part, avec le mot ;
//   3. les jauges elles-mêmes : utilisé / total, le reste, la jauge vide en ambre et quand elle revient — c'est
//      ConsommationGrille, LA MÊME que Réglages › Abonnement (une seule source : quotas_etat → jaugesDuCompte) ;
//   4. « Ce qui compte, ce qui ne compte pas » : les définitions de utils/jaugesExplications (celles des carrés) ;
//   5. tout en bas, un LIEN (jamais un bouton plein) : « Besoin de plus ? Voir les offres » — rien chez un Business.
// Sorties : glisser vers le bas (poignée, en-tête, contenu déjà en haut), ✕ de 44 px, toucher dehors, Échap, retour
// Android. Règle des couches (utils/modale.js) : portail sur body, fond figé, montée SEULEMENT ouverte.
// Les phrases : utils/detailQuota.js (textes fr + en dans i18n/translations.js). Verrou : selftest:detail-quota.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFondFige, useEchap, useRetourAndroid } from '../utils/modale';
import { resumeQuota, remiseRetenue, dateRemiseCourte, ORIGINE_DETAIL_QUOTA, ORIGINE_DETAIL_QUOTA_JAUGE } from '../utils/detailQuota';
import { grilleActive } from '../utils/jauges';
import { ConsommationGrille, Groupe, Carte, Jauge, JaugeRepublication } from '../reglages/ReglagesUI';
import { txt } from '../reglages/textes';
import { lireConfigJauges } from '../reglages/quotas';
import { R } from '../reglages/theme';

export const Z_FEUILLE_QUOTA = 9000;   // au-dessus de l'app (en-tête 10, barre 50, Réglages 400), sous la fenêtre des offres (9990)
const SEUIL_FERMETURE = 110;           // px glissés vers le bas
const VITESSE_FERMETURE = 0.6;         // px/ms : un geste vif ferme même court
const STYLE = `
@keyframes fsQuotaMonte{from{transform:translateY(100%)}to{transform:none}}
@keyframes fsQuotaFondu{from{opacity:0}to{opacity:1}}
.fs-quota-fond{animation:fsQuotaFondu .18s ease-out}
.fs-quota-feuille{animation:fsQuotaMonte .28s cubic-bezier(.2,.85,.25,1) both;transition:transform .26s cubic-bezier(.2,.85,.25,1)}
.fs-quota-feuille.fs-quota-glisse{transition:none}
.fs-quota-bouton{appearance:none;-webkit-appearance:none;border:0;margin:0;font:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}
.fs-quota-bouton:focus-visible{outline:2px solid ${R.tealDeep};outline-offset:2px}
@media (prefers-reduced-motion: reduce){.fs-quota-fond,.fs-quota-feuille{animation:none;transition:none}}
`;

/**
 * quotas : quotas_etat (App) · lang · palier : celui de l'app · remiseIso : la remise lue par l'hôte (si quotas_etat ne
 * la rend pas) · offres : false chez un Business · onFermer(sortie) · onOffres(origine, mur|null) · lireConfig : la
 * lecture des volumes des paliers pour le lien d'une jauge vide (null = pas de lien).
 */
export default function FeuilleQuota({ quotas, lang = 'fr', palier = null, remiseIso = null, offres = true, onFermer, onOffres, lireConfig = lireConfigJauges }) {
  const id = useId();
  const idTitre = `fs-quota-titre-${id}`;
  const feuilleRef = useRef(null);
  const fondRef = useRef(null);
  const corpsRef = useRef(null);
  const fermerRef = useRef(null);
  const geste = useRef(null);
  const sortieRef = useRef(false);
  const [entree, setEntree] = useState(true);
  const [configJauges, setConfigJauges] = useState(undefined);
  const grille = grilleActive(quotas);
  const r = resumeQuota(quotas, { lang, remiseIso, palier });
  const iso = remiseRetenue(quotas, remiseIso);
  const T = txt(lang);

  // Les volumes des paliers (le lien « 40 par mois en Premium » d'une jauge vide) : une lecture bornée, à l'ouverture.
  useEffect(() => {
    if (!grille || typeof lireConfig !== 'function') return undefined;
    let vivant = true;
    Promise.resolve().then(() => lireConfig()).then((m) => { if (vivant) setConfigJauges(m ?? null); }).catch(() => { if (vivant) setConfigJauges(null); });
    return () => { vivant = false; };
  }, [grille, lireConfig]);

  const fermer = (sortie) => {
    if (sortieRef.current) return;
    sortieRef.current = true;
    const el = feuilleRef.current;
    if (!el) { onFermer?.(sortie); return; }
    el.classList.remove('fs-quota-glisse');
    el.style.transform = 'translateY(100%)';
    if (fondRef.current) fondRef.current.style.opacity = '0';
    window.setTimeout(() => onFermer?.(sortie), 240);
  };
  // Rien à montrer (quotas pas encore lus) : la feuille ne rend rien, et ne fige donc pas le fond.
  useFondFige(r != null);
  useEchap(() => fermer('echap'));
  useRetourAndroid(() => fermer('retour'));

  // Le focus va sur ✕ à l'ouverture, et revient à ce qui a ouvert la feuille à la fermeture.
  useEffect(() => {
    const avant = typeof document !== 'undefined' ? document.activeElement : null;
    fermerRef.current?.focus?.({ preventScroll: true });
    return () => { try { if (avant?.isConnected) avant.focus({ preventScroll: true }); } catch { /* l'ouvreur a pu disparaître */ } };
  }, []);

  // Glisser vers le bas : la poignée et l'en-tête toujours, le contenu seulement déjà remonté en haut.
  const debut = (e, poignee) => {
    if (!poignee && (corpsRef.current?.scrollTop ?? 0) > 0) return;
    if (!poignee && e.target?.closest?.('button, a')) return;
    geste.current = { y0: e.clientY, t0: Date.now(), dy: 0, poignee };
  };
  const bouge = (e) => {
    const g = geste.current; if (!g) return;
    const dy = e.clientY - g.y0;
    if (!g.poignee && dy < 8) return;
    g.dy = Math.max(0, dy);
    const el = feuilleRef.current;
    if (el) { el.classList.add('fs-quota-glisse'); el.style.transform = `translateY(${g.dy}px)`; }
  };
  const lache = () => {
    const g = geste.current; geste.current = null; if (!g) return;
    const el = feuilleRef.current; if (!el) return;
    el.classList.remove('fs-quota-glisse');
    const vitesse = g.dy / Math.max(1, Date.now() - g.t0);
    if (g.dy > SEUIL_FERMETURE || (g.dy > 24 && vitesse > VITESSE_FERMETURE)) fermer('glisse');
    else el.style.transform = '';
  };
  const poignee = { onPointerDown: (e) => debut(e, true), onPointerMove: bouge, onPointerUp: lache, onPointerCancel: lache };

  if (!r || typeof document === 'undefined') return null;

  // Ce que ConsommationGrille lit (le contexte des Réglages) : la même source, la même date, les offres de CE détail.
  const cGrille = {
    quotas, lang, remiseAZero: dateRemiseCourte(iso, lang), remiseIso: iso, configJauges,
    ouvrirOffres: offres ? (_origine, mur) => onOffres?.(ORIGINE_DETAIL_QUOTA_JAUGE, mur ?? null) : null,
  };

  return createPortal(
    <div data-feuille-quota="" style={{ position: 'fixed', inset: 0, zIndex: Z_FEUILLE_QUOTA }}>
      <style>{STYLE}</style>
      <div ref={fondRef} className="fs-quota-fond" data-fond-quota="" aria-hidden="true" onClick={() => fermer('fond')}
        style={{ position: 'absolute', inset: 0, background: 'rgba(16,32,27,0.48)', transition: 'opacity .2s ease' }} />
      <section
        ref={feuilleRef} className="fs-quota-feuille" role="dialog" aria-modal="true" aria-labelledby={idTitre}
        style={{
          ...(entree ? null : { animation: 'none' }),
          position: 'absolute', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 480, boxSizing: 'border-box',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: R.paper, color: R.ink,
          borderRadius: '24px 24px 0 0', boxShadow: '0 -18px 40px -20px rgba(16,32,27,0.5)', fontFamily: "'Space Grotesk', sans-serif",
        }}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget) setEntree(false); }}
      >
        <div data-poignee-quota="" {...poignee} style={{ flex: 'none', padding: '10px 0 4px', display: 'grid', placeItems: 'center', touchAction: 'none', cursor: 'grab' }}>
          <i aria-hidden="true" style={{ display: 'block', width: 40, height: 5, borderRadius: 3, background: 'rgba(16,32,27,0.22)' }} />
        </div>
        <div {...poignee} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '2px 16px 12px 20px', borderBottom: `1px solid ${R.border}`, touchAction: 'none' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={idTitre} style={{ margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: R.ink }}>{r.titre}</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 500, color: R.texteSecondaire }}>{r.sous}</p>
          </div>
          <button ref={fermerRef} type="button" className="fs-quota-bouton" data-fermer-quota="" aria-label={r.fermer} onClick={() => fermer('croix')}
            style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 22, background: R.chip, color: R.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
              <path d="M4 4l10 10M14 4L4 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div ref={corpsRef} onPointerDown={(e) => debut(e, false)} onPointerMove={bouge} onPointerUp={lache} onPointerCancel={lache}
          style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
            padding: '16px 16px calc(14px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 18,
          }}>
          {/* 1-2. Ce qui reste, et quand ça repart — la réponse à « combien il me reste ? », en une phrase. */}
          <div data-quota-resume="" style={{ background: R.menthe, border: `1px solid ${R.mentheBord}`, borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.phrase && <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: R.ink }}>{r.phrase}</p>}
            {r.illimitees && <p style={{ margin: 0, fontSize: r.phrase ? 14 : 16, fontWeight: r.phrase ? 600 : 700, lineHeight: 1.4, color: R.tealDeep }}>{r.illimitees}</p>}
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: R.texteSecondaire }}>{r.repart}</p>
          </div>

          {/* 3. Les jauges : utilisé / total, le reste — la même carte que Réglages › Abonnement. */}
          {grille ? <ConsommationGrille c={cGrille} T={T} variante="page" /> : (
            <Groupe intitule={T.consommation}>
              <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {quotas?.annonces?.plafond != null && (
                  <Jauge libelle={T.annoncesCreees} consomme={quotas.annonces.consommes} plafond={quotas.annonces.plafond} reste={quotas.annonces.restantes}
                    sous={quotas.annonces.restantes != null ? T.restantes(quotas.annonces.restantes, T.motAnnonces) : null} />
                )}
                {quotas?.retouches?.plafond != null && quotas.retouches.plafond > 0 && (
                  <Jauge libelle={T.retouchesIA} consomme={quotas.retouches.consommes} plafond={quotas.retouches.plafond} reste={quotas.retouches.restantes}
                    sous={quotas.retouches.restantes != null ? T.restantes(quotas.retouches.restantes, T.motRetouches) : null} />
                )}
                <JaugeRepublication repub={quotas?.republication} T={T} />
              </Carte>
            </Groupe>
          )}

          {/* 4. Ce qui compte, ce qui ne compte pas — les définitions des carrés des formules (une seule source). */}
          <section data-quota-ce-qui-compte="" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: '0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: R.texteSecondaire }}>{r.ceQuiCompte}</h3>
            <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {r.explications.map((x, k) => (
                <div key={x.cle} data-quota-explication={x.cle} style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: k ? 12 : 0, borderTop: k ? `1px solid ${R.ligneDouce}` : 'none' }}>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: R.ink }}><strong>{x.titre}</strong> — {x.definition}</p>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: R.texteSecondaire }}>{r.neCompteJamais} {x.pas}</p>
                </div>
              ))}
            </Carte>
          </section>

          {/* 5. Tout en bas, sans pousser : un lien, jamais un bouton plein. Rien chez un Business. */}
          {offres && r.offres && (
            <button type="button" className="fs-quota-bouton" data-quota-offres="" onClick={() => { sortieRef.current = true; onOffres?.(ORIGINE_DETAIL_QUOTA, null); }}
              style={{
                alignSelf: 'center', minHeight: 44, padding: '0 8px', background: 'none', color: R.tealDeep, fontSize: 13.5, fontWeight: 600,
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}>
              {r.offresLibelle}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
