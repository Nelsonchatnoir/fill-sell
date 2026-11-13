// ── 7. LE RÉCAP — LA SEULE ÉTAPE NON PASSABLE, PARCE QU'ELLE EST LA SORTIE ──
// Elle dit l'état RÉEL de ce qui a été fait et de ce qui a été sauté, avec
// l'endroit où le reprendre, et UNE prochaine étape — jamais une promesse,
// jamais un compte à rebours.
//
// (04/11/2026, lot 3 — maquette o-fin) AVEC LA GRILLE À 3 JAUGES, la ligne « Republication auto » sort (c'est une
// fonction du Pro, pas une promesse au Free) et « Ton plan » entre, chiffres lus dans coin_config (c.plan). SUR LA
// VOIE CLOUD, la ligne « FillSell Cloud » (et « Connexions » une fois l'option active) prend la place de celle de
// l'extension. Grille éteinte et Cloud fermé : le récap d'avant, ligne pour ligne.
//
// (13/11/2026, bloc B2 de Nico — verrou scripts/entree-ordre-selftest.mjs) Deux choses de plus, et seulement celles-là :
//   · « Ton plan Free » n'est plus un écran à part : pour un compte Free avec la grille, son contenu ENTIER (PlanFree,
//     EtapeFree.jsx) est rendu ici, sous la prochaine étape, à la place de la ligne « Ton plan » ;
//   · eBay coché et pas relié : la ligne « Compte eBay » porte « Relier eBay ». Le geste FINIT le parcours puis ouvre
//     la page eBay (onTerminer({ ensuite: 'ebay' }) → entree/ebayApres.js) : au retour, la personne est dans l'app.
//     eBay indisponible : on reste ici, la phrase le dit.
import { useState } from 'react';
import { Cloud, Gauge, Plug } from 'lucide-react';
import { NOMS_FORMULES } from '../cloud/textesFormules';
import { E, DEGRADE } from './theme';
import { Scene, Titre, Texte, Carte, BoutonPrimaire, Bande } from './EntreeUI';
import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';
import BandesReleve from '../annonces/BandesReleve';
import { textesAnnonces } from '../annonces/textes';
import { listeJauges } from './regles';
import { PlanFree } from './EtapeFree';

// Une ligne : tuile + libellé + précision + pastille d'état. Les deux tons
// passent 4,5:1 sur leur fond (menthe ou papier).
// (04/11) `retour` : la précision passe à la ligne au lieu d'être coupée (« Ton plan », « Connexions »).
// (13/11) `action` : un bouton à la place de la pastille d'état (« Relier eBay »).
function Ligne({ glyphe, libelle, valeur, fait, mot, delai, retour = false, action = null }) {
  return (
    <div className="en-monte" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${E.ligneDouce}`, animationDelay: delai }}>
      <span aria-hidden="true" style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: fait ? E.menthe : E.chip, color: fait ? E.tealDeep : E.texteSecondaire, fontSize: 12, fontWeight: 700, lineHeight: 1,
      }}>{glyphe}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: E.ink }}>{libelle}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: E.texteSecondaire, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: retour ? 'normal' : 'nowrap' }}>{valeur}</span>
      </span>
      {action ?? (
        <span style={{
          flexShrink: 0, padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: fait ? E.menthe : E.paper, border: `1px solid ${fait ? E.mentheBord : E.border}`,
          color: fait ? E.tealDeep : E.texteSecondaire,
        }}>{mot}</span>
      )}
    </div>
  );
}

export default function EtapeFin({ c, T, pseudo, onTerminer }) {
  const [ebay, setEbay] = useState({ etat: 'idle', erreur: null });
  const noms = c.choix.plateformes.map((p) => LIBELLE_PLATEFORME[p] ?? p);
  // (13/11) Le plan Free se dit EN ENTIER ici (grille, compte Free) ; un plan payant garde sa ligne.
  const planFree = c.plan?.free === true;
  const ebayARelier = c.choix.plateformes.includes('ebay') && !c.ebayRelie;
  const relierEbay = async () => {
    setEbay({ etat: 'en_cours', erreur: null });
    const r = await onTerminer({ ensuite: 'ebay' });
    // Réussi : le parcours est fermé, la page eBay s'ouvre. Raté : on reste ici, et on le dit.
    if (r && r.ok === false) setEbay({ etat: 'echec', erreur: r.erreur ?? null });
  };
  const extFait = c.extensionVue || c.envoi.etat === 'envoye';
  // (04/11, lot 3) La voie Cloud et ses connexions (lues par le contexte, jamais ici).
  const cloudChoisi = c.cloudChoisi === true;
  const cloudPris = c.cloudPris === true;
  const cx = c.cloud?.connexions ?? null;
  const cxLues = cloudPris && cx?.etat === 'ok';
  const aConnecter = cxLues ? cx.lignes.filter((l) => l.etat !== 'connecte').map((l) => l.nom) : [];
  const suite = cloudPris ? (cxLues && !aConnecter.length ? T.finSuiteCloudPret : T.finSuiteCloud)
    : c.envoi.etat === 'envoye' ? T.finSuiteLien : c.surTelephone ? T.finSuiteTel : T.finSuiteOrdi;

  return (
    <Scene cle="fin" pied={<BoutonPrimaire onClick={() => onTerminer()} disabled={ebay.etat === 'en_cours'}>{T.finCta}</BoutonPrimaire>}>
      {/* La coche et ses deux ondes — le seul moment du parcours qui se
          permet une célébration, et elle tient en deux anneaux. */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 18px' }}>
        <div style={{ position: 'relative', width: 70, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 35, border: `1.5px solid ${E.teal}`, animation: 'enOnde 2.8s ease-out infinite' }} />
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 35, border: `1.5px solid ${E.teal}`, animation: 'enOnde 2.8s ease-out infinite', animationDelay: '1.4s' }} />
          <div style={{ width: 70, height: 70, borderRadius: 35, background: DEGRADE, color: '#FFFFFF', fontSize: 28, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 30px -16px rgba(47,158,144,0.9)' }}>✓</div>
        </div>
      </div>

      <Titre centre>{pseudo ? T.finTitreNom(pseudo) : T.finTitre}</Titre>
      <Texte centre style={{ marginBottom: 18 }}>{T.finTexte}</Texte>

      <Carte style={{ padding: '4px 16px', borderRadius: 18 }}>
        <Ligne
          glyphe={String(noms.length)} libelle={T.finPlateformes}
          valeur={noms.length ? noms.join(', ') : T.finPlateformesVide}
          fait={noms.length > 0} mot={noms.length ? T.finPret : T.finVide} delai="0ms"
        />
        {cloudChoisi ? (
          <Ligne
            // (11/11/2026) Sur la voie des formules avec Cloud : « Pro + Cloud · Essai gratuit jusqu'au … ».
            glyphe={<Cloud size={14} strokeWidth={2.4} />} libelle={c.formules?.parcours === true && NOMS_FORMULES[c.formules.choisie] ? NOMS_FORMULES[c.formules.choisie] : T.finCloud}
            valeur={cloudPris ? (c.cloud.essaiFinCourt ? T.finCloudEssai(c.cloud.essaiFinCourt) : T.finCloudActif) : T.finCloudOu}
            fait={cloudPris} mot={cloudPris ? T.finPret : T.finAFaire} delai="70ms" retour
          />
        ) : (
          <Ligne
            glyphe="⌘" libelle={T.finExtension}
            valeur={c.envoi.etat === 'envoye' ? T.finExtEnvoye : T.finExtOu}
            fait={extFait} mot={extFait ? T.finEnvoye : T.finAFaire} delai="70ms"
          />
        )}
        {cxLues && (
          <Ligne
            glyphe={<Plug size={14} strokeWidth={2.4} />} libelle={T.finConnexions}
            valeur={T.finConnexionsValeur(cx.connectees, cx.total, aConnecter.join(', '))}
            fait={!aConnecter.length} mot={aConnecter.length ? T.finAFaire : T.finPret} delai="105ms" retour
          />
        )}
        {c.choix.plateformes.includes('ebay') && (
          <Ligne
            glyphe="e" libelle={T.finEbay}
            valeur={c.ebayRelie ? T.finEbayApi : T.finEbayAvant}
            fait={c.ebayRelie} mot={c.ebayRelie ? T.finRelie : T.finPlusTard} delai="140ms" retour={ebayARelier}
            action={ebayARelier ? (
              <button
                type="button" data-entree="fin-ebay" onClick={relierEbay} disabled={ebay.etat === 'en_cours'} className="en-cta en-focus"
                style={{
                  flexShrink: 0, minHeight: 44, padding: '0 14px', borderRadius: 999, border: `1.5px solid ${E.tealDeep}`,
                  background: E.card, color: E.tealDeep, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                  cursor: ebay.etat === 'en_cours' ? 'default' : 'pointer', opacity: ebay.etat === 'en_cours' ? 0.7 : 1, whiteSpace: 'nowrap',
                }}
              >
                {ebay.etat === 'en_cours' ? T.ebayEnCours : T.finEbayCta}
              </button>
            ) : null}
          />
        )}
        {c.plan && !planFree
          ? (
            <Ligne
              glyphe={<Gauge size={14} strokeWidth={2.4} />} libelle={T.finPlan}
              valeur={T.finPlanValeur(c.plan.nom, listeJauges(c.plan, c.lang))}
              fait={false} mot={c.plan.nom} delai="210ms" retour
            />
          )
          : !c.plan && <Ligne glyphe="↻" libelle={T.finRepub} valeur={T.finRepubOu} fait={false} mot={T.finARegler} delai="210ms" />}
      </Carte>

      {ebay.etat === 'echec' && (
        <div style={{ marginTop: 12 }}>
          <Bande ton="alerte">{T.finEbayEchec}{ebay.erreur ? ` (${ebay.erreur})` : ''}</Bande>
        </div>
      )}

      {/* ── LE MUR DE CONNEXION, DIT AVANT DE SORTIR (2026-09-22) ──────────
          Dernier écran du parcours : c'est la dernière occasion de donner le
          geste avant que la personne n'arrive dans un Stock qu'elle croira
          cassé. Même composant, même détection, même bouton que partout. */}
      <BandesReleve
        lang={c.lang}
        userId={c.user?.id ?? null}
        T={textesAnnonces(c.lang)}
        murs={c.murs}
        reussite={c.murs.length && c.releveVinted != null
          ? textesAnnonces(c.lang).reussiteReleve(LIBELLE_PLATEFORME.vinted ?? 'Vinted', c.releveVinted)
          : null}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '13px 16px', borderRadius: 16, background: E.menthe, border: `1px solid ${E.mentheBord}` }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: E.teal, animation: 'enPouls 2s ease-in-out infinite' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: E.ink }}>{suite}</span>
      </div>

      {/* (13/11) Le plan Free, en entier : ce qu'était l'écran « Ton plan Free », sans un écran de plus. */}
      {planFree && <PlanFree c={c} T={T} recap />}
    </Scene>
  );
}
