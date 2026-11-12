// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › ABONNEMENT — LES FORMULES AVEC CLOUD (11/11/2026, texte 3 validé par Nico, § 8.3 du plan)
// ═══════════════════════════════════════════════════════════════════════════
// Monté par reglages/SousPageAbonnement.jsx ; ne rend RIEN tant que les formules sont fermées pour ce compte
// (`visible` = formulesCloudVendables) — la page d'avant, octet pour octet (verrou formules-cloud-ferme).
//   · abonné sans Cloud : la ligne de sa formule + l'interrupteur « Avec Cloud » → « Ajouter le Cloud à ta formule Pro :
//     Pro + Cloud, {P}/mois. » ; « Essayer 7 jours » (web, essai jamais pris) ou « Ajouter le Cloud » ; ⛔ Business :
//     « Passer à Business + Cloud », payé tout de suite ; la note de l'essai ou du prorata ; sur un autre canal, le dire ;
//   · abonné avec une formule avec Cloud : « Ta formule : Pro + Cloud. » et « Retirer le Cloud » (confirmé en deux
//     temps : « Ta formule redevient Pro le {fin de période}… ») ; iPhone / Android : dans les abonnements de la boutique ;
//   · client du Cloud seul (hérité) : son bloc d'aujourd'hui (BlocCloudReglages), plus une ligne pour passer à une formule ;
//   · compte Free : le Cloud seul ne se vend plus — « Voir les formules avec Cloud ».
// ⛔ Aucun prix de la formule EN COURS (règle Founder de la page) : seuls les prix des formules avec Cloud proposées,
//    ceux du canal. Les gestes viennent de l'hôte (`actions.formule`, `actions.voirFormulesCloud`) ; absents, pas de bouton.
import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { R } from '../reglages/theme';
import { Groupe, Carte, Bouton, Note } from '../reglages/ReglagesUI';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { palierDesDrapeaux } from '../utils/palier';
import { textesFormules, NOMS_FORMULES, NOMS_PALIERS_SEULS } from './textesFormules';
import { cartesFormulesCloud, essaiPermisDuCompte, nomAbonnementsBoutique, canalDuCloudSeul, voieFormulesDuCompte, texteNoteCarte } from './formulesCloud';
import { BasculeCloud } from './OffresAvecCloud';
import { dateLongue, finEssaiSiOnCommence } from './regles';
import { canalDeVente, formulesCloudOuvertes, FORMULE_CLOUD_DU_PALIER, PALIER_DE_FORMULE, PRODUITS_BOUTIQUES } from '../config/cloudOffer';
import { prixOuChargement, prixPret, essaiBoutiqueOffert } from '../lib/prixBoutique';
import { ouvrirLien } from '../messagerie/ouvrir';

const LIEN_APPLE = 'https://apps.apple.com/account/subscriptions';
const lienGoogle = (formule) => `https://play.google.com/store/account/subscriptions?sku=${PRODUITS_BOUTIQUES[formule]?.google ?? ''}&package=app.fillsell.app`;
const pTexte = { margin: 0, fontSize: 14, lineHeight: 1.5, color: R.ink };
const pNote = { margin: 0, fontSize: 13, lineHeight: 1.5, color: R.texteSecondaire };

function Tete({ titre }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: R.menthe, border: `1px solid ${R.mentheBord}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Cloud size={19} color={R.tealDeep} strokeWidth={2.1} />
      </span>
      <strong style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: R.ink }}>{titre}</strong>
    </div>
  );
}

/** « Retirer le Cloud » sur le web : la descente de C4 (changer-formule) vers la formule seule, à la fin de la période. */
async function retirerSurLeWeb(vers) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/changer-formule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, apikey: supabaseAnonKey },
    body: JSON.stringify({ action: 'programmer', vers }),
  });
  const json = await res.json().catch(() => null);
  return res.ok && json && !json.error;
}

/**
 * c        : le contexte de la page (user, lang, isPremium/isPro/isBusiness, natif, plateforme)
 * visible  : formulesCloudVendables(c.user.id) — faux : rien
 * lecture  : useCloudReglages(c) ; profil : useProfilFormules(…) ; actions : { formule?, voirFormulesCloud? }
 */
export default function BlocFormulesReglages({ c, visible, lecture, profil, actions = {} }) {
  const lang = c?.lang === 'en' ? 'en' : 'fr';
  const T = textesFormules(lang);
  const [vue, setVue] = useState('sans');
  const [retrait, setRetrait] = useState('repos');   // repos | confirmer | en_cours | fait | echec
  const [arretEssai, setArretEssai] = useState({ etat: 'repos', formuleContinue: false });   // (12/11, 4d)
  if (!visible || profil?.etat !== 'ok') return null;
  const palier = palierDesDrapeaux({ isPremium: c.isPremium, isPro: c.isPro, isBusiness: c.isBusiness });
  const cloud = lecture?.etat === 'ok' ? lecture.cloud : null;
  const canalApp = canalDeVente(c.plateforme);
  const echeance = profil.echeance ? dateLongue(profil.echeance, lang) : null;
  const formule = profil.formuleActuelle;
  // (12/11, 4d) Un essai en cours (formule avec Cloud ou Cloud seul) : les textes disent ce que fait le serveur.
  const enEssai = cloud?.etat === 'essai';
  const essaiFin = enEssai && cloud?.essaiFin ? dateLongue(cloud.essaiFin, lang) : null;

  // ── Une formule avec Cloud est prise : « Ta formule : Pro + Cloud. » et « Retirer le Cloud » ──────────────────────
  if (formule) {
    const palierSeul = NOMS_PALIERS_SEULS[PALIER_DE_FORMULE[formule]];
    const boutique = profil.canalAbonnement === 'apple' || profil.canalAbonnement === 'google' ? profil.canalAbonnement : null;
    const retirer = async () => {
      if (boutique) { ouvrirLien(boutique === 'apple' ? LIEN_APPLE : lienGoogle(formule)); setRetrait('repos'); return; }
      setRetrait('en_cours');
      try { setRetrait((await retirerSurLeWeb(PALIER_DE_FORMULE[formule])) ? 'fait' : 'echec'); } catch { setRetrait('echec'); }
    };
    // (12/11, 4d) PENDANT L'ESSAI, sur le web : « Retirer le Cloud » finissait sur un refus du serveur (409) après un texte
    // faux (« … rien n'est remboursé pour le mois en cours » alors que rien n'a été payé). Le vrai geste est d'ARRÊTER
    // L'ESSAI (cancel-subscription { option: 'cloud' } : tout de suite, rien prélevé pour l'essai) — le serveur dit si une
    // formule payée continue (formule_continue).
    if (enEssai && !boutique && typeof actions.arreter === 'function') {
      const arreter = async () => {
        setArretEssai({ etat: 'en_cours', formuleContinue: false });
        try {
          const r = await actions.arreter({ canal: 'stripe' });
          setArretEssai(r?.ok === false ? { etat: 'echec', formuleContinue: false } : { etat: 'fait', formuleContinue: r?.formule_continue === true });
        } catch { setArretEssai({ etat: 'echec', formuleContinue: false }); }
      };
      return (
        <Groupe intitule={T.groupe}>
          <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div data-formules-reglages="formule_essai" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Tete titre={NOMS_FORMULES[formule]} />
              <p style={{ ...pTexte, fontWeight: 600 }}>{T.taFormule(NOMS_FORMULES[formule])}</p>
              {arretEssai.etat === 'fait' && <p style={pTexte}>{T.arreterEssaiFait(arretEssai.formuleContinue, palierSeul)}</p>}
              {arretEssai.etat === 'echec' && <Note>{T.arreterEssaiEchec}</Note>}
            </div>
          </Carte>
          {arretEssai.etat !== 'fait' && (arretEssai.etat === 'confirmer' || arretEssai.etat === 'en_cours' ? (
            <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p data-formules-reglages="arreter_essai" style={pTexte}>{T.arreterEssaiTexte}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Bouton ton="danger-plein" onClick={arreter} enCours={arretEssai.etat === 'en_cours'}>{arretEssai.etat === 'en_cours' ? '…' : T.arreterEssai}</Bouton>
                <Bouton ton="creux" onClick={() => setArretEssai({ etat: 'repos', formuleContinue: false })} disabled={arretEssai.etat === 'en_cours'}>{T.retirerAnnuler}</Bouton>
              </div>
            </Carte>
          ) : (
            <Bouton ton="danger-creux" onClick={() => setArretEssai({ etat: 'confirmer', formuleContinue: false })} style={{ width: '100%', minHeight: 50 }}>{T.arreterEssai}</Bouton>
          ))}
        </Groupe>
      );
    }
    return (
      <Groupe intitule={T.groupe}>
        <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-formules-reglages="formule" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tete titre={NOMS_FORMULES[formule]} />
            <p style={{ ...pTexte, fontWeight: 600 }}>{T.taFormule(NOMS_FORMULES[formule])}</p>
            {retrait === 'fait' && <p style={pTexte}>{T.retirerFait(palierSeul, echeance)}</p>}
            {retrait === 'echec' && <Note>{T.retirerEchec}</Note>}
          </div>
        </Carte>
        {retrait !== 'fait' && (retrait === 'confirmer' || retrait === 'en_cours' ? (
          <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p data-formules-reglages="retirer" style={pTexte}>{boutique ? T.retirerBoutique(nomAbonnementsBoutique(boutique)) : T.retirerTexte(palierSeul, echeance)}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Bouton ton="danger-plein" onClick={retirer} enCours={retrait === 'en_cours'}>{retrait === 'en_cours' ? '…' : T.retirerConfirmer}</Bouton>
              <Bouton ton="creux" onClick={() => setRetrait('repos')} disabled={retrait === 'en_cours'}>{T.retirerAnnuler}</Bouton>
            </div>
          </Carte>
        ) : (
          <Bouton ton="danger-creux" onClick={() => setRetrait('confirmer')} style={{ width: '100%', minHeight: 50 }}>{T.retirer}</Bouton>
        ))}
      </Groupe>
    );
  }

  // ── Client du Cloud seul (hérité) : son bloc reste ; une ligne pour passer à une formule ───────────────────────────
  if (cloud && (cloud.etat === 'essai' || cloud.etat === 'paye')) {
    // (12/11, 4c) Le Cloud seul facturé par une AUTRE voie que cette app (App Store / Google Play vus sur le web, carte vue
    // sur mobile) : aucun bouton qui finirait sur un refus — on dit où, et « bientôt » si la boutique n'a pas encore les
    // formules (Apple tant qu'il les valide).
    const canalCloud = canalDuCloudSeul(lecture);
    const voieCloud = voieFormulesDuCompte({ canalApp, canalFacture: canalCloud, canalOuvert: formulesCloudOuvertes });
    if (voieCloud !== 'ici') {
      const texte = voieCloud === 'boutique_bientot' ? T.cloudBoutiqueBientot(canalCloud)
        : voieCloud === 'boutique' ? T.cloudBoutique(canalCloud) : T.carteSurMobile;
      return (
        <div data-formules-reglages="herite_autre_canal" data-voie={voieCloud} style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '-4px 0 8px' }}>
          <p style={pNote}>{texte}</p>
        </div>
      );
    }
    return (
      <div data-formules-reglages="herite" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '-4px 0 8px' }}>
        <p style={pNote}>{T.heritePasser(prixOuChargement('pro_cloud', lang), prixOuChargement('premium_cloud', lang))}</p>
        {typeof actions.voirFormulesCloud === 'function' && (
          <Bouton ton="creux" onClick={() => actions.voirFormulesCloud()} style={{ width: '100%' }}>{T.voirFormules}</Bouton>
        )}
      </div>
    );
  }

  // ── Compte Free : le Cloud seul ne se vend plus ────────────────────────────────────────────────────────────────────
  if (palier === 'gratuit') {
    return (
      <Groupe intitule={T.groupe}>
        <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div data-formules-reglages="free" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tete titre="FillSell Cloud" />
            <p style={pTexte}>{T.ligneCommune}</p>
            {typeof actions.voirFormulesCloud === 'function' && (
              <Bouton ton="plein" onClick={() => actions.voirFormulesCloud()} style={{ width: '100%' }}>{T.voirFormules}</Bouton>
            )}
          </div>
        </Carte>
      </Groupe>
    );
  }

  // ── Abonné sans Cloud : la ligne de sa formule + l'interrupteur « Avec Cloud » ─────────────────────────────────────
  const modele = cartesFormulesCloud({
    palier, canalApp, canalAbonnement: profil.canalAbonnement, essaiPermis: essaiPermisDuCompte(lecture),
    essaiBoutique: (f) => essaiBoutiqueOffert(f), founder: profil.founder,
    canalOuvert: formulesCloudOuvertes, canalCloud: canalDuCloudSeul(lecture), essaiEnCours: enEssai,   // (12/11, 4c et 4d)
  });
  const sienne = modele.cartes.find((x) => x.formule === FORMULE_CLOUD_DU_PALIER[palier]) ?? null;
  if (!sienne) return null;
  const f = sienne.formule;
  const nom = NOMS_FORMULES[f];
  const prix = prixOuChargement(f, lang);
  const libelle = sienne.cta === 'essai_abonne' ? T.ctaEssayer7 : f === 'business_cloud' ? T.ctaPasser(nom) : T.ctaAjouter;
  // (12/11, 4c et 4d) Le même texte que la fenêtre d'offres (texteNoteCarte) : canal qui facture, essai en cours.
  const note = texteNoteCarte({ ...sienne, canalFacture: sienne.canalFacture ?? profil.canalAbonnement }, {
    T, palierIci: NOMS_PALIERS_SEULS[palier], echeance, finEssai: dateLongue(finEssaiSiOnCommence(), lang), essaiFin, canalApp, nom, prix,
  });
  return (
    <Groupe intitule={T.groupe}>
      <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div data-formules-reglages="ajout" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Tete titre="FillSell Cloud" />
          <BasculeCloud vue={vue} onChange={setVue} lang={lang} />
          {vue === 'avec' && (
            <>
              <p style={{ ...pTexte, fontWeight: 600 }}>{T.ajouterLigne(NOMS_PALIERS_SEULS[palier], nom, prix)}</p>
              {modele.founder && <p style={{ ...pNote, color: '#8A4B2C' }}>{T.founder}</p>}
              {sienne.achetable && typeof actions.formule === 'function' && (
                <Bouton ton="plein" disabled={!prixPret(f) || sienne.enLecture} onClick={() => actions.formule(f, { essaiAffiche: sienne.essai === true })} style={{ width: '100%' }}>
                  {sienne.enLecture ? '…' : libelle}
                </Bouton>
              )}
              {note && <p style={pNote}>{note}</p>}
            </>
          )}
        </div>
      </Carte>
    </Groupe>
  );
}
