// Captures à 390 px + contrôles de l'option « Sans ordinateur » (04/10/2026).
// Outil de relecture, jamais livré — même patron que capture-palier-louis.mjs.
//
//   node scripts/apercu/capture-cloud.mjs
//
// Serveur Vite avec le FAUX client Supabase et le drapeau Cloud ouvert POUR
// L'APERÇU (vite-cloud.config.mjs) : aucune requête ne part vers la base, et
// playwright coupe en plus tout appel *.supabase.co et fillsell.app.
// L'horloge de la page est FIGÉE au samedi 10/10/2026, 08:00 heure de Paris :
// les dates d'essai affichées sont donc connues d'avance (fin d'un essai qui
// commence = 17 octobre ; J-5 = 15 octobre 07:00 ; J-1 = 11 octobre 07:30).
//
// Les ASSERTIONS ont été écrites AVANT de regarder la moindre capture. Elles
// prouvent, sur les vrais composants, à 390 px :
//   · les textes exacts (libellé imposé, essai, date de bascule, sortie) ;
//   · le comportement : l'interrupteur change les prix des cartes PAYANTES
//     (jamais la carte Free) et le choix part en 2e argument d'onUpgrade ;
//     sans interrupteur montré, onUpgrade garde UN seul argument ;
//   · aucun nom de plateforme bloquée ni d'Opla dans les zones Cloud, jamais
//     « pépites » ni « plafond » sur la page ;
//   · rien ne déborde à l'horizontale, aucun texte coupé ;
//   · tout texte des zones Cloud passe 4,5:1 sur son fond réel.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'cloud');
const PORT = 5237;
const HORLOGE = new Date('2026-10-10T06:00:00Z'); // 08:00 à Paris (heure d'été)
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/scripts/apercu/cloud.html`;
{
  const fin = Date.now() + 120000;
  while (Date.now() < fin) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => { if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${String(detail).slice(0, 400)}` : ''}`); } };
const a = (texte, motif) => (motif instanceof RegExp ? motif.test(texte) : texte.includes(motif));

// ── Mesures faites DANS la page ─────────────────────────────────────────────
// Contraste : le fond réel d'un texte est recomposé en remontant les ancêtres
// (couleur de fond, puis dégradés par-dessus — chaque couleur d'un dégradé est
// un fond candidat, on garde le PIRE). Seuil 4,5:1 pour tout texte.
const MESURES = () => {
  const parse = (s) => {
    if (!s) return null;
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    const h = s.match(/^#([0-9a-f]{3,8})$/i);
    if (h) {
      let x = h[1];
      if (x.length === 3) x = x.split('').map((c) => c + c).join('');
      return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1];
    }
    return null;
  };
  const mix = (haut, bas) => [0, 1, 2].map((i) => haut[i] * haut[3] + bas[i] * (1 - haut[3]));
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (x, y) => { const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p); return (l1 + 0.05) / (l2 + 0.05); };
  const fonds = (el) => {
    const couches = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      const grads = img && img !== 'none' ? (img.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || []).map(parse).filter(Boolean) : [];
      const col = parse(cs.backgroundColor);
      couches.push({ grads, col });
      if (col && col[3] >= 1 && !grads.length) break;
    }
    let bases = [[255, 255, 255]];
    for (let i = couches.length - 1; i >= 0; i--) {
      const { grads, col } = couches[i];
      if (col && col[3] > 0) bases = bases.map((b) => mix(col, b));
      if (grads.length) bases = grads.flatMap((g) => bases.map((b) => mix(g, b)));
    }
    return bases;
  };
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return false;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const zones = [...document.querySelectorAll('[data-cloud]')];
  const contrastes = [];
  const debords = [];
  const coupes = [];
  const largeur = document.documentElement.clientWidth;
  for (const z of zones) {
    for (const el of [z, ...z.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > largeur + 0.5 || r.left < -0.5)) debords.push(`${el.tagName}.${(el.textContent || '').trim().slice(0, 40)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
      const cs = getComputedStyle(el);
      if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) coupes.push((el.textContent || '').trim().slice(0, 60));
      const texteDirect = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!texteDirect || !visible(el) || el.closest('svg')) continue;
      const couleur = parse(cs.color);
      const pires = fonds(el).map((b) => ratio(couleur[3] < 1 ? mix(couleur, b) : couleur, b));
      const pire = Math.min(...pires);
      contrastes.push({ texte: (el.textContent || '').trim().slice(0, 50), ratio: Math.round(pire * 100) / 100 });
    }
  }
  // Les espaces insécables (« 20 € », « 7 jours ») se lisent comme des espaces.
  const net = (s) => String(s ?? '').replace(/ /g, ' ');
  return {
    zones: zones.map((z) => z.getAttribute('data-cloud')),
    texteZones: net(zones.map((z) => z.innerText).join('\n')),
    texte: net(document.body.innerText),
    deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5,
    debords, coupes,
    contrastesFaibles: contrastes.filter((c) => c.ratio < 4.5),
    nbTextes: contrastes.length,
  };
};

const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA_IPHONE, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(HORLOGE);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));

  // Agrandit la fenêtre jusqu'à ce qu'AUCUNE zone défilante ne cache de
  // contenu (feuilles à 92vh, corps défilant des Réglages) : la capture montre
  // TOUT l'écran, d'un bloc.
  const deplier = async () => {
    for (let i = 0; i < 6; i++) {
      const manque = await page.evaluate(() => {
        let pire = 0;
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (/(auto|scroll)/.test(cs.overflowY)) pire = Math.max(pire, el.scrollHeight - el.clientHeight);
        }
        return Math.max(pire, document.documentElement.scrollHeight - window.innerHeight);
      });
      if (manque <= 1) return;
      const h = page.viewportSize().height;
      await page.setViewportSize({ width: 390, height: Math.ceil(h + manque / 0.9 + 24) });
      await page.waitForTimeout(150);
    }
  };

  const ouvrir = async (ecran) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?ecran=${ecran}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
    await page.waitForTimeout(700);
  };
  const capturer = async (nom, { cloudSeul = false } = {}) => {
    await page.waitForTimeout(450); // fin des animations d'entrée
    await deplier();
    await page.screenshot({ path: path.join(SORTIE, `${nom}.png`), fullPage: true });
    // Gros plan de la zone Cloud (la capture entière est réduite à la relecture).
    const zone = await page.$('[data-cloud]');
    if (zone) await zone.screenshot({ path: path.join(SORTIE, `${nom}--zone.png`) });
    const m = await page.evaluate(MESURES);
    verifier(!m.deborde, `${nom} : aucun débordement horizontal à 390 px`);
    verifier(m.debords.length === 0, `${nom} : rien ne sort de l'écran dans les zones Cloud`, m.debords.join(' | '));
    verifier(m.coupes.length === 0, `${nom} : aucun texte coupé`, m.coupes.join(' | '));
    verifier(m.nbTextes > 0, `${nom} : une zone Cloud est bien rendue`, m.zones.join(','));
    verifier(m.contrastesFaibles.length === 0, `${nom} : tout texte Cloud passe 4,5:1`, JSON.stringify(m.contrastesFaibles));
    verifier(!/p[ée]pite/i.test(m.texte), `${nom} : jamais « pépites »`);
    verifier(!/plafond/i.test(m.texte), `${nom} : jamais « plafond »`);
    const zoneInterdite = cloudSeul ? m.texte : m.texteZones;
    verifier(!/Beebs/i.test(zoneInterdite), `${nom} : aucune plateforme bloquée nommée${cloudSeul ? ' (écran entier)' : ' (zones Cloud)'}`);
    verifier(!/Opla/i.test(zoneInterdite), `${nom} : Opla jamais citée${cloudSeul ? ' (écran entier)' : ' (zones Cloud)'}`);
    return m;
  };
  const choix = () => page.evaluate(() => window.__dernierChoix ?? null);
  const cliquerTexte = (motif) => page.getByRole('button', { name: motif }).first().click();

  // ════ 1. LA FEUILLE DES FORMULES ════════════════════════════════════════
  // Free, essai proposable — décoché, puis coché.
  await ouvrir('modale-free');
  let m = await capturer('modale-free-decoche');
  verifier(a(m.texte, 'Sans ordinateur · +20 €/mois'), 'modale Free : le libellé imposé « Sans ordinateur · +20 €/mois »', m.texteZones);
  verifier(a(m.texte, /7 jours d.essai gratuits/i), 'modale Free : « 7 jours d’essai gratuits »');
  verifier(a(m.texte, 'Vinted et Leboncoin') && a(m.texte, 'eBay part déjà sans ordinateur'), 'modale Free : ce que ça fait, Vinted et Leboncoin seulement, eBay déjà sans ordinateur');
  verifier(!a(m.texte, '+ 20 €'), 'modale Free décochée : aucune carte ne porte « + 20 € »');
  verifier(await page.getAttribute('[role="switch"]', 'aria-checked') === 'false', 'modale Free : l’interrupteur arrive décoché');
  const ordre = await page.evaluate(() => {
    const tous = [...document.querySelectorAll('body *')];
    const free = tous.find((e) => e.children.length === 0 && e.textContent.trim() === 'Free');
    const inter = document.querySelector('[data-cloud="interrupteur"]');
    const premium = tous.find((e) => e.children.length === 0 && e.textContent.trim() === '12,99 €');
    const avant = (x, y) => Boolean(x && y && (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING));
    return { trouve: [Boolean(free), Boolean(inter), Boolean(premium)], freeAvantInter: avant(free, inter), interAvantPremium: avant(inter, premium) };
  });
  verifier(ordre.freeAvantInter && ordre.interAvantPremium, 'modale Free : l’interrupteur est SOUS la carte Free et AU-DESSUS des cartes payantes', JSON.stringify(ordre));
  await page.click('[role="switch"]');
  m = await capturer('modale-free-coche');
  verifier(await page.getAttribute('[role="switch"]', 'aria-checked') === 'true', 'modale Free : un tap coche l’interrupteur');
  for (const prix of ['12,99 € + 20 €', '29,99 € + 20 €', '59,99 € + 20 €']) verifier(a(m.texte.replace(/\s+/g, ' '), prix), `modale cochée : la carte dit « ${prix} »`, m.texte.slice(0, 600));
  verifier(a(m.texte, /option offerte 7 jours/), 'modale cochée : sous le prix, « option offerte 7 jours »');
  verifier(a(m.texte, '17 octobre') && a(m.texte, /passe à 20 €\/mois/), 'modale cochée : la frise donne la DATE de bascule (17 octobre) et le montant');
  verifier(a(m.texte, /Tu paies ta formule\. L.option : 0 €/), 'modale cochée : ce qui est payé aujourd’hui (la formule) est distinct de l’option offerte');
  verifier(a(m.texte, /Réglages › Abonnement/) && a(m.texte, /prévient la veille/), 'modale cochée : la sortie est nommée (où) et le rappel de la veille promis');
  verifier(a(m.texte, 'Passer Premium + Sans ordinateur') && a(m.texte, 'Passer Pro + Sans ordinateur'), 'modale cochée : les boutons nomment l’option');
  const carteFree = await page.evaluate(() => {
    const d = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Free');
    // La carte = l'ancêtre au rayon de 22 px (FreePlanCard).
    let n = d; while (n && getComputedStyle(n).borderTopLeftRadius !== '22px') n = n.parentElement;
    return n?.innerText ?? '';
  });
  verifier(carteFree.includes('0 €') && !carteFree.includes('+ 20'), 'modale cochée : la carte Free ne bouge pas (l’option ne se prend pas seule)', carteFree);
  await cliquerTexte(/Passer Premium \+ Sans ordinateur/);
  let c = await choix();
  verifier(c?.tier === 'premium' && c?.choix?.cloud === true && c?.nbArgs === 2, 'modale cochée : onUpgrade(\'premium\', { cloud: true })', JSON.stringify(c));
  await page.click('[role="switch"]');
  await cliquerTexte(/^Passer Pro$/);
  c = await choix();
  verifier(c?.tier === 'pro' && c?.choix?.cloud === false && c?.nbArgs === 2, 'modale décochée : onUpgrade(\'pro\', { cloud: false })', JSON.stringify(c));

  // Free, essai déjà pris : « +20 €/mois » sans mention d'essai.
  await ouvrir('modale-free-essai-pris');
  m = await page.evaluate(MESURES);
  verifier(a(m.texte, 'Sans ordinateur · +20 €/mois') && !a(m.texteZones, /essai gratuit/i) && !a(m.texteZones, /7 jours/), 'essai déjà pris : le libellé, sans pastille d’essai', m.texteZones);
  await page.click('[role="switch"]');
  m = await capturer('modale-free-essai-pris');
  verifier(a(m.texte, /Ton essai gratuit a déjà servi/) && a(m.texte, /facturée 20 €\/mois dès aujourd.hui/), 'essai déjà pris, coché : facturée dès aujourd’hui, dit en clair');
  verifier(a(m.texte, '/mois · avec Sans ordinateur') && !a(m.texte, 'option offerte'), 'essai déjà pris : le prix ne promet pas d’essai');

  // Ouverte par la 2e voie : coché d'emblée, titre propre.
  await ouvrir('modale-cloud');
  m = await capturer('modale-cloud');
  verifier(a(m.texte, 'Vends même ordinateur éteint.'), 'ouverte par la 2e voie : le titre « Vends même ordinateur éteint. »');
  verifier(await page.getAttribute('[role="switch"]', 'aria-checked') === 'true', 'ouverte par la 2e voie : l’interrupteur arrive coché');
  verifier(a(m.texte.replace(/\s+/g, ' '), '12,99 € + 20 €'), 'ouverte par la 2e voie : les prix reflètent l’option');

  // Premium : la carte d'ajout à SA formule, pas l'interrupteur des cartes.
  await ouvrir('modale-premium');
  m = await capturer('modale-premium');
  verifier(a(m.texte, 'Ajouter à ta formule Premium') && a(m.texte, 'Essayer 7 jours gratuits'), 'Premium : « Ajouter à ta formule Premium », essai de 7 jours');
  verifier(a(m.texte, /Le 17 octobre|17 octobre — L.option passe/), 'Premium : la date de bascule est écrite', m.texteZones);
  verifier((await page.$$('[role="switch"]')).length === 0, 'Premium avec carte d’ajout : pas d’interrupteur en plus (une seule façon de prendre l’option)');
  verifier(!a(m.texte, '+ 20 €'), 'Premium : les cartes Pro/Business gardent leur prix seul');
  await cliquerTexte(/Essayer 7 jours gratuits/);
  verifier(await page.evaluate(() => window.__ajoutCloud === true), 'Premium : le bouton d’ajout appelle onAjouterCloud (jamais onUpgrade du palier actuel)');
  await cliquerTexte(/^Passer Pro$/);
  c = await choix();
  verifier(c?.tier === 'pro' && c?.nbArgs === 1, 'Premium : passer Pro garde onUpgrade(\'pro\') à UN argument', JSON.stringify(c));

  // Business : au sommet, l'option reste ajoutable.
  await ouvrir('modale-business');
  m = await capturer('modale-business');
  verifier(a(m.texte, 'Ajouter à ta formule Business') && !a(m.texte, 'Tu es déjà au maximum'), 'Business : l’option s’ajoute, pas de « déjà au maximum »');

  // Option déjà active : une ligne, aucun interrupteur, onUpgrade à un argument.
  await ouvrir('modale-deja-actif');
  m = await capturer('modale-deja-actif');
  verifier(a(m.texte, 'Sans ordinateur est déjà actif sur ton compte'), 'option active : la ligne le dit');
  verifier((await page.$$('[role="switch"]')).length === 0, 'option active : aucun interrupteur');
  await cliquerTexte(/^Passer Pro$/);
  c = await choix();
  verifier(c?.nbArgs === 1, 'option active : onUpgrade garde UN argument', JSON.stringify(c));

  // ════ 2. RÉGLAGES › ABONNEMENT ══════════════════════════════════════════
  await ouvrir('reglages-aucun');
  m = await capturer('reglages-aucun', { cloudSeul: true });
  verifier(a(m.texte, 'SANS ORDINATEUR') || a(m.texte, 'Sans ordinateur'), 'Réglages : le groupe « Sans ordinateur »');
  verifier(a(m.texte, 'Pas activée') && a(m.texte, 'Essayer 7 jours gratuits') && a(m.texte, /Puis 20 €\/mois en plus de ta formule/), 'Réglages, aucun : essai proposé, prix ensuite dit');

  await ouvrir('reglages-gratuit');
  m = await capturer('reglages-gratuit', { cloudSeul: true });
  verifier(a(m.texte, 'Premium, Pro ou Business') && a(m.texte, 'Voir les formules') && !a(m.texteZones, 'Essayer 7 jours'), 'Réglages, gratuit : l’option s’ajoute à une formule payante — pas d’essai seul');

  await ouvrir('reglages-essai-j5');
  m = await capturer('reglages-essai-j5', { cloudSeul: true });
  verifier(a(m.texte, 'Essai gratuit') && a(m.texte, 'Encore 5 jours d’essai'.replace('’', "'")), 'Réglages, essai J-5 : « Encore 5 jours d’essai »', m.texteZones);
  verifier(a(m.texte, 'Jour 3 sur 7'), 'Réglages, essai J-5 : la jauge dit « Jour 3 sur 7 »');
  verifier(a(m.texte, /Gratuit jusqu.au 15 octobre à 07:00/) && a(m.texte, /20 €\/mois s.ajoutent à ta formule Premium/), 'Réglages, essai J-5 : date, heure et montant de la bascule', m.texteZones);
  verifier(a(m.texte, 'Arrêter l’option'.replace('’', "'")), 'Réglages, essai : « Arrêter l’option » visible');
  await cliquerTexte(/Arrêter l.option/);
  m = await capturer('reglages-essai-j5-arret', { cloudSeul: true });
  verifier(a(m.texte, /Arrêter l.option Sans ordinateur \?/) && a(m.texte, /Rien ne sera facturé pour l.option/) && a(m.texte, /Ta formule ne change pas/), 'Réglages, arrêt : la confirmation dit ce qui change et ce qui ne change pas');

  await ouvrir('reglages-essai-j1');
  m = await capturer('reglages-essai-j1', { cloudSeul: true });
  verifier(a(m.texte, /Dernier jour d.essai/) && a(m.texte, /11 octobre à 07:30/), 'Réglages, essai J-1 : « Dernier jour d’essai », 11 octobre à 07:30', m.texteZones);

  await ouvrir('reglages-paye');
  m = await capturer('reglages-paye', { cloudSeul: true });
  verifier(a(m.texte, 'Active') && a(m.texte, 'En plus de ta formule Pro') && a(m.texte, 'Connecter Vinted et Leboncoin'), 'Réglages, payé : active, en plus de Pro, renvoi à « Me connecter »');
  verifier(!/\d+ ?€/.test(m.texteZones), 'Réglages, payé : aucun prix affiché (règle de la formule)', m.texteZones);

  await ouvrir('reglages-suspendu');
  m = await capturer('reglages-suspendu', { cloudSeul: true });
  verifier(a(m.texte, 'En pause') && a(m.texte, 'Ta formule payante est arrêtée') && a(m.texte, 'Voir les formules'), 'Réglages, suspendu : en pause, pourquoi, et la porte');

  await ouvrir('reglages-termine');
  m = await capturer('reglages-termine', { cloudSeul: true });
  verifier(a(m.texte, 'Essai terminé') && a(m.texte, /rien n.a été facturé pour elle/) && a(m.texte, 'Ajouter l’option · 20 €/mois'.replace('’', "'")), 'Réglages, essai terminé : rien facturé, proposer de l’ajouter');

  // ════ 3. LA FIN D'ESSAI ═════════════════════════════════════════════════
  await ouvrir('veille');
  m = await capturer('veille', { cloudSeul: true });
  verifier(a(m.texte, 'Demain, l’option passe à 20 €/mois'.replace('’', "'")), 'veille : « Demain, l’option passe à 20 €/mois »', m.texte.slice(0, 300));
  verifier(a(m.texte, /11 octobre à 07:30/) && a(m.texte, /ta formule Premium/), 'veille : date, heure, formule nommée');
  verifier(a(m.texte, /Si tu l.arrêtes, rien n.est facturé pour elle/), 'veille : ce qui se passe si on arrête');
  const tailles = await page.evaluate(() => [...document.querySelectorAll('[data-cloud="veille"] button')].map((b) => ({ t: b.innerText, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })));
  const garder = tailles.find((x) => /Garder/.test(x.t));
  const arreterB = tailles.find((x) => /Arrêter/.test(x.t));
  verifier(garder && arreterB && Math.abs(garder.h - arreterB.h) < 1 && Math.abs(garder.w - arreterB.w) < 1 && arreterB.h >= 44, 'veille : « Garder » et « Arrêter » ont la MÊME taille (≥ 44 px), sans piège', JSON.stringify(tailles));
  await cliquerTexte(/Arrêter l.option/);
  await page.waitForTimeout(200);
  m = await capturer('veille-arretee', { cloudSeul: true });
  verifier(a(m.texte, /C.est arrêté\. Rien ne sera facturé/), 'veille : l’arrêt est confirmé en clair');

  await ouvrir('fin');
  m = await capturer('fin', { cloudSeul: true });
  verifier(a(m.texte, 'Ton essai est terminé') && a(m.texte, /Rien n.a été facturé pour elle/), 'fin : terminé, rien facturé');
  verifier(a(m.texte, /Ce qui s.arrête/i) && a(m.texte, /Ce qui continue/i), 'fin : ce qui s’arrête / ce qui continue');
  verifier(a(m.texte, /eBay, depuis ton téléphone/) && a(m.texte, /L.extension Chrome, gratuite/), 'fin : l’extension et eBay restent possibles');
  verifier(a(m.texte, 'Reprendre l’option · 20 €/mois'.replace('’', "'")) && a(m.texte, /Installer l.extension sur mon ordinateur/), 'fin : reprendre, ou installer l’extension');

  // ════ 4. LA 2e VOIE ══════════════════════════════════════════════════════
  await ouvrir('entree');
  m = await capturer('entree');
  verifier(a(m.texteZones, /Je n.ai pas d.ordinateur/i) && a(m.texteZones, /Sans ordinateur, 7 jours d.essai/), 'entrée : « Je n’ai pas d’ordinateur → Sans ordinateur, 7 jours d’essai »', m.texteZones);
  verifier(a(m.texte, /M.envoyer le lien pour mon ordinateur/), 'entrée : la voie extension reste là');
  const voies = await page.evaluate(() => {
    const prim = [...document.querySelectorAll('button')].find((b) => /M.envoyer le lien/.test(b.innerText));
    const voie = document.querySelector('[data-cloud="voie-rangee"]');
    const s = (b) => (b ? getComputedStyle(b) : null);
    return {
      primDegrade: /gradient/.test(s(prim)?.backgroundImage ?? ''),
      voieSobre: Boolean(voie) && !/gradient/.test(s(voie)?.backgroundImage ?? ''),
      voieApres: Boolean(prim && voie && (prim.compareDocumentPosition(voie) & Node.DOCUMENT_POSITION_FOLLOWING)),
      hauteurVoie: voie?.getBoundingClientRect().height ?? 0,
    };
  });
  verifier(voies.primDegrade && voies.voieSobre && voies.voieApres, 'entrée : l’extension garde le bouton plein, la voie Cloud vient APRÈS, en rangée sobre (n’écrase pas)', JSON.stringify(voies));
  verifier(voies.hauteurVoie >= 44, 'entrée : la rangée fait au moins 44 px de haut (toucher)', JSON.stringify(voies));
  await page.click('[data-cloud="voie-rangee"]');
  const demande = await page.evaluate(() => localStorage.getItem('fs_offre_cloud_demandee'));
  verifier(/"origine":"entree_extension"/.test(demande ?? ''), 'entrée : le tap demande la feuille des formules (origine entree_extension), aucun paiement', demande);

  await ouvrir('mur');
  m = await capturer('mur');
  verifier(a(m.texteZones, /Je n.ai pas d.ordinateur/i) && a(m.texteZones, 'Essayer sans ordinateur'), 'mur : la 2e voie est là');
  verifier(!a(m.texteZones, 'eBay part déjà'), 'mur : la carte ne répète pas eBay (la section eBay juste au-dessus le dit)', m.texteZones);
  verifier(a(m.texte, /pour Vinted et Leboncoin, par l.option Sans ordinateur/) && !a(m.texte, /Vinted, Leboncoin et Beebs demandent l.extension/), 'mur, drapeau levé : la section eBay ne dit plus « l’extension, forcément » pour Vinted et Leboncoin');
  const ordreMur = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [data-cloud="voie"]')];
    return { ext: els.findIndex((e) => /M.envoyer le lien/.test(e.innerText ?? '')), voie: els.findIndex((e) => e.getAttribute?.('data-cloud') === 'voie') };
  });
  verifier(ordreMur.ext >= 0 && ordreMur.voie > ordreMur.ext, 'mur : la voie extension (gratuite) vient AVANT la voie Cloud', JSON.stringify(ordreMur));

  await ouvrir('stock-lien');
  m = await capturer('stock-lien');
  verifier(a(m.texteZones, 'Pas d’ordinateur ? Essaie Sans ordinateur, 7 jours offerts'.replace('’', "'")), 'Stock : la ligne « Pas d’ordinateur ? Essaie Sans ordinateur, 7 jours offerts »', m.texteZones);

  await ouvrir('page-extension');
  m = await capturer('page-extension');
  verifier(a(m.texteZones, /Pas d.ordinateur \?/i) && a(m.texteZones, /Voir l.option dans l.app/),'page /extension sur téléphone : la 2e voie, qui mène à l’app');
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
  await page.getByRole('link', { name: /Voir l.option dans l.app/ }).click();
  const demandePage = await page.evaluate(() => localStorage.getItem('fs_offre_cloud_demandee'));
  verifier(/"origine":"page_extension"/.test(demandePage ?? ''), 'page /extension : la demande est gardée pour l’app (origine page_extension)', demandePage);

  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
} finally {
  await navigateur.close();
  stop();
}
console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `aperçu Sans ordinateur : ${ok} vérifications passées — captures dans screenshots-review/cloud/`);
process.exit(ko ? 1 : 0);
