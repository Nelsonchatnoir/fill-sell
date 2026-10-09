#!/usr/bin/env node
// selftest:bascule-opla-depop — la bascule Opla → Depop de minuit, à HORLOGE
// SIMULÉE (09/10/2026 soir, ordre de Nico).
//
// Avant le 10/10/2026 00:00 Paris : l'état d'aujourd'hui. À partir de 00:00 :
// Opla absente partout (seule la synchronisation reste au compte relié), Depop
// présente là où l'extension sait la faire (≥ 0.6.106), rien à la place sinon.
// Trois comptes : relié à Opla, neuf, extension 0.6.105 (+ la bêta de Nico, et
// l'interrupteur à 0). Puis le site en ligne (landing, /extension), puis les
// gardes : retraits Opla jamais concernés, base ouverte au même instant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(RACINE, r), 'utf8');
const { etatBascule, extensionSaitDepop, DEPOP_EXTENSION_MIN } = await import('../src/utils/basculeOplaDepop.js');
const { avecDepop, siteBascule } = await import('../src/utils/siteAvecDepop.js');
const sf = await import('../src/utils/stockFiltres.js');
const sortie = await import('../supabase/functions/_shared/opla-sortie.js');

let echecs = 0;
const dit = (nom, ok) => { console.log(`  ${ok ? 'ok  ' : 'ÉCHEC'} ${nom}`); if (!ok) echecs++; };
const meme = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const VEILLE = Date.parse('2026-10-09T23:59:59+02:00');
const MINUIT = Date.parse('2026-10-10T00:00:00+02:00');
const MATIN = Date.parse('2026-10-10T09:00:00+02:00');
const INTER = 1791583200; // coin_config opla_sortie_le en prod

const COMPTES = {
  'relié à Opla (extension 0.6.106)': { oplaRelie: true, versionsExtension: ['0.6.106'], bandeauVu: false },
  'neuf (aucune extension)': { oplaRelie: false, versionsExtension: [null], bandeauVu: false },
  'extension 0.6.105': { oplaRelie: false, versionsExtension: ['0.6.105'], bandeauVu: false },
};

console.log('A. L\'HORLOGE : la bascule a lieu à 00:00 Paris, pas une seconde avant');
dit('interrupteur de prod = 10/10/2026 00:00 Paris', sortie.debutSortieOpla(INTER) === MINUIT);
dit('23:59:59 : pas de sortie', !etatBascule({ maintenant: VEILLE, interrupteur: INTER }).sortie);
dit('00:00:00 : sortie', etatBascule({ maintenant: MINUIT, interrupteur: INTER }).sortie);
dit('clé absente : même date par défaut', etatBascule({ maintenant: VEILLE }).sortie === false && etatBascule({ maintenant: MINUIT }).sortie === true);
dit('interrupteur 0 : jamais de sortie', !etatBascule({ maintenant: MATIN, interrupteur: 0 }).sortie);
dit(`Depop exige l'extension ≥ ${DEPOP_EXTENSION_MIN}`, extensionSaitDepop('0.6.106') && extensionSaitDepop('0.6.110') && extensionSaitDepop('0.7.0')
  && !extensionSaitDepop('0.6.105') && !extensionSaitDepop(null) && !extensionSaitDepop('') && extensionSaitDepop(null, '0.6.106'));

console.log('B. AVANT 00:00 — l\'état d\'aujourd\'hui');
for (const [nom, c] of Object.entries(COMPTES)) {
  const e = etatBascule({ maintenant: VEILLE, interrupteur: INTER, depopAutoriseServeur: false, ...c });
  dit(`${nom} : Opla proposée, Depop absente, bandeau Opla affiché`, e.oplaProposee && e.oplaSuivie && !e.depopVisible && e.bandeauOpla);
  dit(`${nom} : plateformes du compte = les quatre + Opla`, meme(sf.plateformesDuCompte(e.plateformesOuvertes), ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla']));
}
{
  const nico = etatBascule({ maintenant: VEILLE, interrupteur: INTER, depopAutoriseServeur: true, versionsExtension: ['0.6.106'], oplaRelie: true, bandeauVu: true });
  dit('bêta de Nico (0.6.106) : Depop déjà là, Opla encore là', nico.depopVisible && nico.oplaProposee && meme(sf.plateformesDuCompte(nico.plateformesOuvertes), ['vinted', 'leboncoin', 'beebs', 'ebay', 'opla', 'depop']));
  const nico105 = etatBascule({ maintenant: VEILLE, interrupteur: INTER, depopAutoriseServeur: true, versionsExtension: ['0.6.105'] });
  dit('bêta avec une extension 0.6.105 : Depop masquée', !nico105.depopVisible);
}

console.log('C. À PARTIR DE 00:00 — Opla absente, Depop à sa place (si l\'extension sait)');
for (const instant of [MINUIT, MATIN]) {
  const h = instant === MINUIT ? '00:00' : '09:00';
  const relie = etatBascule({ maintenant: instant, interrupteur: INTER, ...COMPTES['relié à Opla (extension 0.6.106)'] });
  dit(`${h} relié : Opla jamais proposée, synchronisation gardée`, !relie.oplaProposee && relie.oplaSuivie);
  dit(`${h} relié : Depop présente, bandeau Opla éteint`, relie.depopVisible && !relie.bandeauOpla);
  dit(`${h} relié : publication / republication = les quatre + Depop, sans Opla`, meme(sf.plateformesDuCompte(relie.plateformesOuvertes), ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop']));
  dit(`${h} relié : relevé = + Opla (synchronisation seule)`, sf.plateformesDeReleve(relie.plateformesOuvertes, true).includes('opla'));
  const neuf = etatBascule({ maintenant: instant, interrupteur: INTER, ...COMPTES['neuf (aucune extension)'] });
  dit(`${h} neuf : ni Opla ni Depop, ni bandeau`, !neuf.oplaProposee && !neuf.oplaSuivie && !neuf.depopVisible && !neuf.bandeauOpla);
  dit(`${h} neuf : plateformes = les quatre, relevé sans Opla`, meme(sf.plateformesDuCompte(neuf.plateformesOuvertes), ['vinted', 'leboncoin', 'beebs', 'ebay'])
    && !sf.plateformesDeReleve(neuf.plateformesOuvertes, false).includes('opla'));
  const v105 = etatBascule({ maintenant: instant, interrupteur: INTER, ...COMPTES['extension 0.6.105'] });
  dit(`${h} extension 0.6.105 : Opla absente, Depop absente, rien à la place`, !v105.oplaProposee && !v105.depopVisible && !v105.bandeauOpla
    && meme(sf.plateformesDuCompte(v105.plateformesOuvertes), ['vinted', 'leboncoin', 'beebs', 'ebay']));
}
{
  const coupe = etatBascule({ maintenant: MATIN, interrupteur: 0, versionsExtension: ['0.6.106'], oplaRelie: false, bandeauVu: false });
  dit('interrupteur 0 : Opla reste, Depop seulement pour la bêta, bandeau sans objet', coupe.oplaProposee && !coupe.depopVisible && !coupe.bandeauOpla);
}

console.log('D. LE SITE EN LIGNE — textes et logos à 00:00');
dit('site : 23:59:59 avant, 00:00 après', !siteBascule(VEILLE, INTER) && siteBascule(MINUIT, INTER) && siteBascule(MINUIT, null) && !siteBascule(MATIN, 0));
const landing = lire('src/pages/LandingPage.jsx');
const extension = lire('src/pages/ExtensionPage.jsx');
// Chaque chaîne du site qui énumère des plateformes (« …Beebs… » hors libellé seul)
const litteraux = (src) => [...src.matchAll(/"((?:[^"\\\r\n]|\\.)*)"/g)].map((m) => m[1]);
const chaines = [...litteraux(landing), ...litteraux(extension)].filter((x) => x.includes('Beebs') && x !== 'Beebs');
dit(`${chaines.length} textes du site énumèrent les plateformes`, chaines.length >= 20);
const sansDepop = chaines.filter((x) => !avecDepop(x).includes('Depop'));
dit('après 00:00 : chacun nomme Depop', sansDepop.length === 0);
if (sansDepop.length) console.log('     sans Depop :', sansDepop.map((x) => x.slice(0, 70)));
dit('aucun texte du site ne nomme Opla (avant comme après)', ![...litteraux(landing), ...litteraux(extension)].some((x) => /opla/i.test(x) || /opla/i.test(avecDepop(x))));
dit('avant 00:00 : textes inchangés (le site d\'aujourd\'hui)', landing.includes('return depop ? avecDepop(texte) : texte;'));
dit('landing : interrupteur lu avec les quotas (coin_config opla_sortie_le)', landing.includes(`'opla_sortie_le']);`) && landing.includes('useSiteBascule(interrupteurOpla)'));
const logosDepop = (landing.match(/\{depop && <PlatformLogo platform="depop"/g) ?? []).length;
const lignesDepop = (landing.match(/\{depop && \(/g) ?? []).length;
dit(`landing : ${logosDepop} rangées de logos + ${lignesDepop} lignes Depop, seulement après 00:00`, logosDepop >= 9 && lignesDepop === 2 && !/platform="depop"(?![^\n]*depop &&)/.test(landing.replace(/\{depop && <PlatformLogo platform="depop" size=\{\d+\} \/>\}/g, '').replace(/\{depop && \([\s\S]*?\)\}/g, '')));
dit('/extension : titre, description et textes passent par la bascule', (extension.match(/\bd\("/g) ?? []).length >= 6 && extension.includes('useSiteBascule(null)'));
const legal = lire('src/pages/Legal.jsx');
dit('/legal : Depop nommée à partir du 10/10 (non-affiliation, republication, accès optionnel, retraits)',
  legal.includes('Beebs, Depop à partir du 10 octobre 2026 et') && legal.includes('Vinted, Leboncoin, Beebs ou Depop consiste')
  && legal.includes('« Autoriser Depop »') && legal.includes('(Vinted, Leboncoin, eBay, Beebs, Depop, Opla)'));
dit('logo Depop des mails présent (public/email/logo-depop.png)', fs.existsSync(path.join(RACINE, 'public/email/logo-depop.png')));

console.log('E. LES GARDES — aucune annonce Opla retirée par la bascule, retraits jamais bloqués');
dit('un retrait Opla n\'est jamais une « publication Opla »', !sortie.estPublicationOpla({ platform: 'opla', action: 'delete', status: 'pending' }));
dit('un retrait Opla en attente n\'est jamais clos par la sortie', !sortie.oplaACloreJob({ platform: 'opla', action: 'delete', status: 'pending' })
  && !sortie.oplaACloreJob({ platform: 'opla', action: 'delete', status: 'needs_user' }));
dit('une publication / republication Opla en attente est close (rien publié, rien retiré)', sortie.oplaACloreJob({ platform: 'opla', action: 'publish', status: 'pending' })
  && sortie.oplaACloreJob({ platform: 'opla', action: 'republish', status: 'needs_user' }) && !sortie.oplaACloreJob({ platform: 'opla', action: 'republish', status: 'published' }));
const clos = sortie.clotureOpla({ platform: 'opla', action: 'republish', status: 'pending', platform_fields: {} }, { maintenant: MINUIT });
dit('clôture : statut cancelled, message vrai (« Ton annonce Opla n\'a pas été touchée »)', clos.status === 'cancelled' && /n'a pas été touchée/.test(clos.error));
const hook = lire('src/hooks/useSortieOpla.js');
dit('bandeau de prévention : règle unique (éteint à la bascule)', hook.includes('etatBascule({ maintenant, interrupteur: valeurInterrupteur, oplaRelie: relie, bandeauVu }).bandeauOpla'));
const app = lire('src/App.jsx');
dit('app : Depop par etatBascule, à la même horloge que la sortie d\'Opla', app.includes('maintenant:sortieOpla.maintenant,') && app.includes('interrupteur:sortieOpla.interrupteur,'));
const ventes = lire('src/tabs/VentesTab.jsx');
dit('ventes : l\'état vide ne nomme plus Opla après la bascule', ventes.includes(`oplaFermee?'Vinted, Leboncoin, eBay ou Beebs'`) && app.includes('oplaFermee={oplaFermee}'));
const mig = lire('supabase/migrations/20261009230000_bascule_opla_depop_minuit.sql');
dit('base : depop_autorise ouverte au même interrupteur (0 = fermée, absente = 10/10 00:00)', mig.includes("WHERE c.key = 'opla_sortie_le'") && mig.includes('now() >= to_timestamp(1791583200)') && mig.includes('WHEN c.value = 0 THEN false'));
dit('base : republication automatique Depop ouverte (pf_depop = 1, liste planifiée, espacement 900 s)', mig.includes("('republish_planifiee_pf_depop', 1, now())")
  && mig.includes("'opla', 'depop']::text[]") && mig.includes("('republish_espacement_min_depop_sec', 900, now())"));
dit('base : aucun mail, aucune notification, aucun retrait dans la migration', !/envoyer|net\.http|push|armer_retrait|cross_post_jobs/i.test(mig.replace(/^--.*$/gm, '')));

if (echecs) { console.log(`\n[selftest:bascule-opla-depop] ${echecs} ÉCHEC(S)`); process.exit(1); }
console.log('\n[selftest:bascule-opla-depop] OK — avant 00:00 l\'état d\'aujourd\'hui ; à 00:00 Opla absente (synchronisation seule au compte relié), Depop à sa place là où l\'extension sait la faire, rien sinon.');
