// selftest:republication-apercu-gratuit — (15/10, décision de Nico) un compte
// gratuit ENTRE dans l'écran « Republication automatique », voit le tableau
// complet et règle ses créneaux ; seule l'activation mène à l'offre. Rien n'est
// écrit au serveur pour lui (le serveur refuserait : auto_reserve_pro), aucun
// prix ni quota ne change.
//     node --import ./scripts/loader-ext.mjs scripts/republication-apercu-gratuit-selftest.mjs
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const rouges = [];
const verifier = (cond, msg, extrait = '') => { n++; if (!cond) rouges.push(`${msg}${extrait ? `\n    ${String(extrait).slice(0, 400)}` : ''}`); };

// ── 1. Le code : les deux portes ouvrent l'écran, l'écran n'écrit rien en aperçu
const rp = fs.readFileSync(join(ROOT, 'src/components/RepublicationPlanifiee.jsx'), 'utf8');
const reg = fs.readFileSync(join(ROOT, 'src/reglages/ReglagesPage.jsx'), 'utf8');
verifier(/if \(apercu\) return; \/\/ aperçu : rien n'est écrit au serveur/.test(rp), 'aperçu : appliquer() n’appelle jamais regler()');
verifier(/if \(apercu && !actif\) \{[\s\S]{0,200}onOffres\?\.\('republication_planifiee_activer'\);\s*return;/.test(rp), 'aperçu : l’interrupteur ouvre l’offre, sans regler()');
verifier(!/disabled=\{busy \|\| !s\.autorise\}/.test(rp), 'aucun contrôle ne reste figé par « !s.autorise » seul');
verifier(/const ouvrirRepublication = \(\) => \{\s*track\('republication_planifiee', \{ action: 'ouvrir_reglages'/.test(reg), 'Réglages : la ligne ouvre l’écran à tous les paliers');
verifier((reg.match(/onOffres=\{offresRepublication\}/g) ?? []).length === 2, 'Réglages : la liste et l’écran d’une plateforme reçoivent onOffres');

// ── 2. Les écrans, rendus (Vite SSR, portail rendu en place)
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const RP = await vite.ssrLoadModule('/src/components/RepublicationPlanifiee.jsx');
  const H = await vite.ssrLoadModule('/src/stock/Haut.jsx');
  const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  const pfEtat = (palier, autorise) => ({
    platform: 'vinted', palier, autorise, ouverte: true, configure: false, actif: false, reglage: null,
    plafond_palier: 170, annonces_en_ligne: 12, attendu: null, borne: 'eligibles',
    fenetre: { dans_creneau: false, prochain_debut: '2026-10-16T06:00:00Z', prochain_fin: '2026-10-16T08:00:00Z' },
  });
  const ext = { lastSeenAt: new Date().toISOString() };
  const ecranPf = (etat, palierApp, lecture = 'ok') => renderToStaticMarkup(React.createElement(RP.RepublicationPlanifieeReglages, {
    lang: 'fr', platform: 'vinted', session: null, etat, interrupteur: 1, extensionStatus: ext, busy: false, erreur: null,
    regler: async () => { throw new Error('regler() ne doit pas être appelé au rendu'); }, onClose: () => {}, onOuvrirHistorique: () => {},
    palierApp, lecture, onOffres: () => {},
  }));
  // Un bouton (ou input) dont le texte / l'aria contient `motif` : figé ?
  const fige = (html, motif) => {
    const re = new RegExp(`<(button|input)[^>]*>(?:(?!</button>).)*?${motif}`, 's');
    const m = html.match(re);
    if (!m) return null;
    const ouverture = m[0].match(/<(button|input)[^>]*>/g).pop();
    return /\sdisabled(=""|\s|>)/.test(ouverture);
  };

  // Gratuit, chargé : aperçu.
  const g = ecranPf(pfEtat('free', false), 'gratuit');
  const gt = texte(g);
  verifier(/Voir l’offre Pro/.test(gt), 'gratuit : le bandeau d’aperçu propose « Voir l’offre Pro »', gt.slice(0, 300));
  verifier(!/La republication automatique est réservée au plan Pro/.test(gt), 'gratuit : plus le refus rouge');
  verifier(/Aperçu · activation incluse dans le plan Pro/.test(gt), 'gratuit : la ligne d’état dit « Aperçu »');
  for (const libelle of ['Matin · 8h–10h', 'Soir · 19h–22h', 'Personnalisé', 'Les plus anciennes d’abord']) {
    verifier(fige(g, libelle) === false, `gratuit : « ${libelle} » se règle`, fige(g, libelle));
  }
  verifier(/role="switch"[^>]*aria-checked="false"/.test(g) && !/role="switch"[^>]*disabled/.test(g), 'gratuit : l’interrupteur se touche (il mène à l’offre)');

  // Pro chargé : inchangé (pas de bandeau d'aperçu).
  const p = texte(ecranPf(pfEtat('pro', true), 'pro'));
  verifier(!/Voir l’offre Pro/.test(p) && !/Aperçu/.test(p), 'Pro : aucun aperçu, aucun bandeau d’offre');

  // État pas encore lu : tout reste figé, on ne promet rien (comportement d'avant).
  const inconnu = ecranPf(null, 'gratuit', 'en_cours');
  verifier(fige(inconnu, 'Matin · 8h–10h') === true, 'lecture en cours : les créneaux restent figés');
  verifier(!/Voir l’offre Pro/.test(texte(inconnu)), 'lecture en cours : aucun bandeau d’offre');

  // La liste des plateformes, gratuit.
  const etatMulti = { palier: 'free', autorise: false, plafond_palier: 170, interrupteur_global: 1, actives: 0, plateformes: [pfEtat('free', false)] };
  const liste = texte(renderToStaticMarkup(React.createElement(RP.RepublicationPlanifieePlateformes, {
    lang: 'fr', etatMulti, parPlateforme: { vinted: pfEtat('free', false) }, sessions: {}, interrupteur: 1, extensionStatus: ext, busy: false, erreur: null,
    palierApp: 'gratuit', lecture: 'ok', onOffres: () => {},
  })));
  verifier(/Voir l’offre Pro/.test(liste) && /Vinted/.test(liste), 'liste, gratuit : le tableau est là, avec l’offre', liste.slice(0, 300));

  // La ligne du Stock, gratuit : un tap ouvre l'ÉCRAN, plus l'offre.
  const ouvrirReglages = () => {}; const offres = () => {};
  const ligne = H.LigneRepublicationAuto({ lang: 'fr', autorise: false, onOuvrirReglages: ouvrirReglages, onOffres: offres });
  verifier(ligne?.props?.onClick === ouvrirReglages, 'Stock, gratuit : la ligne ouvre l’écran (aperçu), pas l’offre');
} finally {
  await vite.close();
}

if (rouges.length) {
  console.error(`✗ selftest:republication-apercu-gratuit — ${rouges.length} rouge(s) sur ${n}\n  - ${rouges.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ selftest:republication-apercu-gratuit — ${n} vérifications`);
