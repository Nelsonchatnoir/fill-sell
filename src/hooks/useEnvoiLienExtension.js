// ── « M'envoyer le lien » : UN SEUL comportement, partout ────────────────────
// Lot 3, 2026-08-09. Avant ce hook, le même bouton faisait deux choses selon
// l'écran : envoi serveur en un tap dans l'onboarding, `mailto:` pré-rempli à
// compléter à la main partout ailleurs (ExtensionPitchScreen, montée depuis six
// endroits : App, StockTab ×2, LensTab ×2, ListingPreviewScreen).
//
// Tout ce qui fait le comportement vit ICI — envoi, adresse affichée, verrou de
// renvoi, persistance — pour qu'aucun écran ne puisse en réinventer une
// variante. Les écrans ne décident que de la mise en page.
//
// L'adresse rendue est celle que le SERVEUR rapporte (lue sur le JWT) : on
// n'affiche jamais « envoyé à … » sur une valeur locale, qui pourrait viser une
// autre boîte que celle réellement servie.
import { useEffect, useState } from 'react';
import { envoyerLienExtension } from '../utils/extensionLink';

// Cache d'affichage, local par appareil — « ce téléphone-ci a demandé le lien ».
// Le fait réel vit côté serveur (email_logs 'extension_link').
export const LIEN_ENVOYE_KEY = 'fs_extension_link_sent';
// Verrou du « Renvoyer », aligné sur le limiteur de la fonction.
export const RENVOI_LOCK_MS = 60_000;
// Au-delà, la confirmation n'est plus un état d'écran mais un souvenir : on
// repart sur un bouton d'envoi net. Sans ça, un utilisateur qui revient trois
// semaines plus tard lit « Lien envoyé à … » comme si ça venait de se produire.
const FENETRE_AFFICHAGE_MS = 24 * 60 * 60 * 1000;

const VIDE = { etat: 'idle', email: null, envoyeA: 0, raison: null, retryDans: null };

const lireInitial = () => {
  try {
    const o = JSON.parse(localStorage.getItem(LIEN_ENVOYE_KEY) || 'null');
    if (!o?.email || !o?.envoyeA) return VIDE;
    if (Date.now() - o.envoyeA > FENETRE_AFFICHAGE_MS) return VIDE;
    return { etat: 'envoye', email: o.email, envoyeA: o.envoyeA, raison: null };
  } catch { return VIDE; }
};

export function useEnvoiLienExtension(lang, emailDeSecours = null) {
  const [envoi, setEnvoi] = useState(lireInitial);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const debloqueA = envoi.etat === 'envoye' && envoi.envoyeA ? envoi.envoyeA + RENVOI_LOCK_MS : 0;
  const secondesRestantes = Math.max(0, Math.ceil((debloqueA - maintenant) / 1000));

  // Décompte : ne tourne que tant qu'il reste du temps, s'arrête à échéance.
  // Aucun setState synchrone ici — l'horloge est recalée dans `envoyer` (un
  // gestionnaire d'événement), et à froid la valeur initiale du premier rendu
  // est déjà bonne.
  useEffect(() => {
    if (!debloqueA || debloqueA <= Date.now()) return;
    const id = setInterval(() => {
      const n = Date.now();
      setMaintenant(n);
      if (n >= debloqueA) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [debloqueA]);

  // UN TAP = l'e-mail part à l'adresse du compte. (01/10) « Lien envoyé » ne
  // s'affiche QUE si le serveur dit qu'il est parti : du 25/09 au 01/10, un
  // « throttle » (rien d'envoyé) s'affichait comme une confirmation. Une
  // « rafale » (un lien parti il y a peu : 1 toutes les 10 min, 3 par 24 h) se dit telle quelle.
  // Rend le résultat serveur ({ ok, reason, email… }) pour que l'appelant
  // puisse JOURNALISER un envoi réellement parti (usage_logs install_extension
  // · mail_envoye, 05/09) — l'état React n'est pas relisible dans le même tour.
  // `r.ok` seul vaut « parti ».
  const envoyer = async () => {
    if (envoi.etat === 'en_cours') return { ok: false, reason: 'en_cours' };
    setEnvoi((v) => ({ ...v, etat: 'en_cours', raison: null }));
    const r = await envoyerLienExtension(lang === 'en' ? 'en' : 'fr');
    if (r.ok) {
      const email = r.email || emailDeSecours || null;
      const envoyeA = Date.now();
      setEnvoi({ etat: 'envoye', email, envoyeA, raison: null, retryDans: null });
      setMaintenant(Date.now());   // recale l'horloge du décompte
      try { localStorage.setItem(LIEN_ENVOYE_KEY, JSON.stringify({ email, envoyeA })); }
      catch { /* cache d'affichage seul */ }
      return r;
    }
    // Rien n'est parti : on le dit, et le bouton reste actif. L'adresse d'un
    // envoi précédent réussi est conservée pour distinguer « le renvoi a
    // échoué » d'un premier envoi raté.
    setEnvoi((v) => ({ etat: 'echec', email: r.email || v.email, envoyeA: 0, raison: r.reason, retryDans: r.retryDans ?? null }));
    return r;
  };

  return { envoi, secondesRestantes, envoyer };
}

// Le texte de l'échec vit ici aussi : deux écrans qui disent la même panne avec
// deux formulations différentes, c'est déjà deux comportements.
export function messageEchecLien(raison, fr, dejaEnvoye = false, retryDans = null) {
  // (04/10) Un lien est parti il y a peu (le serveur en envoie un toutes les
  // 10 minutes et trois par 24 h au plus) : rien n'est reparti. Le délai vient
  // du serveur ; on le dit en minutes ou en heures, jamais en secondes.
  if (raison === 'rafale') {
    const s = Number(retryDans) > 0 ? Math.ceil(Number(retryDans)) : 600;
    const min = Math.max(1, Math.ceil(s / 60));
    const quand = min >= 90
      ? (fr ? `dans ${Math.round(min / 60)} h` : `in ${Math.round(min / 60)}h`)
      : (fr ? `dans ${min} min` : `in ${min} min`);
    return fr
      ? `Le lien t'a déjà été envoyé il y a peu : regarde ta boîte mail (et les indésirables) — il peut mettre quelques minutes à arriver. Tu pourras en redemander un ${quand}.`
      : `The link was already sent to you a moment ago: check your inbox (and spam) — it can take a few minutes to arrive. You can ask for another one ${quand}.`;
  }
  if (raison === 'no_email') {
    return fr
      ? "Aucune adresse e-mail n'est rattachée à ton compte : on ne peut pas t'envoyer le lien. Ouvre fillsell.app/extension depuis ton ordinateur."
      : "No email address is attached to your account, so we can't send the link. Open fillsell.app/extension from your computer.";
  }
  return fr
    ? `${dejaEnvoye ? "Le renvoi n'a pas pu partir." : "L'e-mail n'a pas pu partir."} Rien n'a été envoyé — réessaie.`
    : `${dejaEnvoye ? "The resend couldn't go out." : "The email couldn't be sent."} Nothing was sent — try again.`;
}
