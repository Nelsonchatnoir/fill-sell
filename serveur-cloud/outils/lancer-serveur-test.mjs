// LA COMMANDE UNIQUE DU TEST CLOUD — serveur, IP de test, déploiement, contrôles,
// mesure (05/10/2026). Depuis le PC (Git Bash), dans le dépôt, arbre PROPRE :
//
//   node serveur-cloud/outils/lancer-serveur-test.mjs          LE PLAN : tout est LU (jetons, prix, solde,
//                                                              stock France, DNS) — RIEN n'est créé ni acheté
//   node serveur-cloud/outils/lancer-serveur-test.mjs --go     serveur + 1 IP France 30 jours + DNS (si jeton
//                                                              Cloudflare) + déploiement + contrôles + mesure
//
// Options : --type=cx43 --lieu=fsn1 · --plafond-ip=8 (USD : au-delà, on n'achète pas)
//           --commande=<n°> (une IP achetée par Nico dans le tableau de bord, au lieu d'en acheter une)
//           --sans-ip · --sans-mesure · --domaine=<nom> (sinon cloud.fillsell.app si le DNS y pointe, ou <ip>.sslip.io)
//
// Secrets : C:\Users\nicol\fillsell-cloud-proto\secrets.env — lus, JAMAIS affichés ni copiés ailleurs :
//   HCLOUD_TOKEN (obligatoire) · IPROYAL_API_TOKEN (obligatoire, sauf --sans-ip ou --commande seule lecture)
//   CLOUDFLARE_API_TOKEN (facultatif : « Zone › DNS › Modifier », zone fillsell.app SEULE ; ne touche
//   QUE l'enregistrement A cloud.fillsell.app, en gris — sinon le DNS est un geste de Nico).
// Reprise : relancer la MÊME commande. Ce qui existe est repris — le serveur par son nom, l'IP par
// cloud-test-etat.json (à côté de secrets.env, aucun secret dedans) — JAMAIS racheté.
//
// ⛔ Ce que la commande ne fait JAMAIS : appliquer une migration, toucher à la base de prod (les clés
//    Supabase vont au .env du serveur par deployer.sh, sans affichage), activer les achats IPRoyal de
//    l'orchestrateur (IPROYAL_ACHATS_AUTORISES reste à 0), activer les alertes mail (ALERTES_MAIL=0),
//    servir un autre compte que celui de Nico (COMPTES_AUTORISES).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { promises as dnsP } from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const DOSSIER = 'C:\\Users\\nicol\\fillsell-cloud-proto';
const SECRETS = path.join(DOSSIER, 'secrets.env');
const ETAT = path.join(DOSSIER, 'cloud-test-etat.json');
const CLE_SSH = path.join(homedir(), '.ssh', 'fillsell_cloud_ed25519');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const DOMAINE_CLOUD = 'cloud.fillsell.app';
const ZONE = 'fillsell.app';
const CURL = 'curlimages/curl:8.11.1';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const GO = args.go === true;
const TYPE = args.type || 'cx43';
const LIEU = args.lieu || 'fsn1';
const NOM = args.nom || 'fillsell-cloud-1';
const PLAFOND_IP = Number(args['plafond-ip'] ?? 8);

// ── les secrets, lus sans jamais être affichés ────────────────────────────────
const secrets = Object.fromEntries(readFileSync(SECRETS, 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const HCLOUD = secrets.HCLOUD_TOKEN || '';
const IPROYAL = secrets.IPROYAL_API_TOKEN || '';
const CLOUDFLARE = secrets.CLOUDFLARE_API_TOKEN || '';

const etat = existsSync(ETAT) ? JSON.parse(readFileSync(ETAT, 'utf8')) : {};
const noterEtat = () => writeFileSync(ETAT, `${JSON.stringify(etat, null, 2)}\n`);
const titre = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const arret = (message) => { const e = new Error(message); e.arret = true; throw e; };

async function json(url, { methode = 'GET', entetes = {}, corps } = {}) {
  const r = await fetch(url, {
    method: methode, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...entetes },
    body: corps == null ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(30_000),
  });
  const d = await r.json().catch(() => null);
  return { ok: r.ok, statut: r.status, d };
}
const hz = (chemin, o = {}) => json(`https://api.hetzner.cloud/v1${chemin}`, { ...o, entetes: { Authorization: `Bearer ${HCLOUD}` } });
const ipr = (chemin, o = {}) => json(`https://apid.iproyal.com/v1/reseller${chemin}`, { ...o, entetes: { 'X-Access-Token': IPROYAL } });
const cf = (chemin, o = {}) => json(`https://api.cloudflare.com/client/v4${chemin}`, { ...o, entetes: { Authorization: `Bearer ${CLOUDFLARE}` } });
const donnees = (r) => r?.d?.data ?? r?.d;

// Git Bash, jamais le bash de WSL (C:\Windows\System32\bash.exe).
const BASH = process.platform === 'win32' && existsSync('C:\\Program Files\\Git\\bin\\bash.exe') ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
function lancer(cmd, a, { entree, montrer = true, cwd = RACINE, delaiMs = 30 * 60_000 } = {}) {
  const r = spawnSync(cmd, a, { cwd, input: entree, encoding: 'utf8', timeout: delaiMs, stdio: [entree == null ? 'inherit' : 'pipe', montrer ? 'inherit' : 'pipe', montrer ? 'inherit' : 'pipe'] });
  return { code: r.status, sortie: r.stdout ?? '', erreur: r.stderr ?? '' };
}
const ssh = (ip, commande, o = {}) => lancer('ssh', ['-i', CLE_SSH, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `root@${ip}`, commande], o);

// ═══ 1. LE PLAN (lectures seulement) ═══════════════════════════════════════════
const plan = { problemes: [] };
titre('Dépôt');
{
  const sha = lancer('git', ['rev-parse', '--short=12', 'HEAD'], { montrer: false }).sortie.trim();
  const sale = lancer('git', ['status', '--porcelain', '--', 'serveur-cloud', 'supabase/functions/_shared/cloud-pool.js', 'src/cloud/connexion', 'chrome-extension', 'scripts/cloud'], { montrer: false }).sortie.trim();
  console.log(`  commit ${sha} (${lancer('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { montrer: false }).sortie.trim()})${sale ? ' — ⛔ fichiers non commités' : ', arbre propre'}`);
  if (sale) plan.problemes.push('arbre sale dans serveur-cloud/ ou ses sources (deployer.sh refuserait)');
  plan.sha = sha;
}

titre('Hetzner');
if (!HCLOUD) plan.problemes.push('HCLOUD_TOKEN absent de secrets.env');
else {
  const s = await hz(`/servers?name=${encodeURIComponent(NOM)}`);
  if (!s.ok) plan.problemes.push(`Hetzner refuse le jeton (HTTP ${s.statut})`);
  else {
    plan.serveur = s.d.servers[0] ?? null;
    const tous = await hz('/servers?per_page=50');
    console.log(`  jeton valide · ${tous.d?.servers?.length ?? '?'} serveur(s) dans le projet · « ${NOM} » : ${plan.serveur ? `EXISTE (${plan.serveur.public_net.ipv4.ip}, ${plan.serveur.server_type.name}) — repris` : 'à créer'}`);
    const p = (await hz('/pricing')).d?.pricing;
    const t = p?.server_types?.find((x) => x.name === TYPE)?.prices?.find((x) => x.location === LIEU);
    const ip4 = p?.primary_ips?.find((x) => x.type === 'ipv4')?.prices?.find((x) => x.location === LIEU);
    if (!t) plan.problemes.push(`type ${TYPE} introuvable à ${LIEU}`);
    else {
      plan.coutServeur = { ht: Number(t.price_monthly.net), ttc: Number(t.price_monthly.gross), heureTtc: Number(t.price_hourly.gross) };
      plan.coutIpv4 = ip4 ? { ht: Number(ip4.price_monthly.net), ttc: Number(ip4.price_monthly.gross) } : null;
      console.log(`  ${TYPE} à ${LIEU} : ${plan.coutServeur.ht.toFixed(2)} € HT = ${plan.coutServeur.ttc.toFixed(2)} € TTC / mois (${plan.coutServeur.heureTtc.toFixed(4)} € TTC / heure, facturé à l'heure)`);
      if (plan.coutIpv4) console.log(`  IPv4 du serveur : ${plan.coutIpv4.ht.toFixed(2)} € HT = ${plan.coutIpv4.ttc.toFixed(2)} € TTC / mois`);
    }
  }
}

titre('IPRoyal (IP de test : France, 30 jours, 1 seule)');
if (args['sans-ip']) console.log('  --sans-ip : aucune IP');
else if (etat.ip_test?.commande || args.commande) {
  const n = args.commande ?? etat.ip_test.commande;
  console.log(`  commande ${n} ${etat.ip_test?.commande ? 'déjà notée dans cloud-test-etat.json' : 'donnée par --commande'} — REPRISE, rien n'est acheté`);
  plan.commandeExistante = String(n);
} else if (!IPROYAL) plan.problemes.push('IPROYAL_API_TOKEN absent de secrets.env (ou --sans-ip / --commande=<n°>)');
else {
  const solde = await ipr('/balance');
  if (!solde.ok) plan.problemes.push(`IPRoyal refuse le jeton (HTTP ${solde.statut})`);
  else {
    plan.solde = Number(typeof donnees(solde) === 'object' ? donnees(solde)?.balance : donnees(solde));
    const produits = donnees(await ipr('/products')) ?? [];
    const produit = produits.find((p) => /static residential|isp/i.test(p.name));
    const offre = produit?.plans?.find((x) => /30\s*days?/i.test(x.name)) ?? null;
    const aplatir = (ls) => (ls ?? []).flatMap((l) => [l, ...aplatir(l.child_locations)]);
    const france = aplatir(produit?.locations).find((l) => /^france$/i.test(String(l.name).trim()));
    if (!produit || !offre || !france) plan.problemes.push(`catalogue IPRoyal illisible (produit ${produit?.name ?? '?'}, offre 30 j ${offre ? 'ok' : '?'}, France ${france ? 'ok' : '?'})`);
    else {
      plan.achat = { product_id: produit.id, product_plan_id: offre.id, product_location_id: france.id, quantity: 1, auto_extend: false };
      const prix = await ipr(`/orders/calculate-pricing?product_id=${produit.id}&product_plan_id=${offre.id}&product_location_id=${france.id}&quantity=1`);
      const pd = donnees(prix) ?? {};
      plan.prixIp = Number(pd.total ?? pd.total_price ?? pd.price ?? pd.amount ?? NaN);
      console.log(`  jeton valide · solde ${Number.isFinite(plan.solde) ? `${plan.solde.toFixed(2)} $` : 'illisible'} · ${produit.name} › ${offre.name} › France : ${france.out_of_stock ? 'ÉPUISÉE' : `${france.available_proxies_count ?? '?'} IP en stock`}`);
      console.log(`  prix d'UNE IP 30 jours : ${Number.isFinite(plan.prixIp) ? `${plan.prixIp.toFixed(2)} $` : `illisible (${JSON.stringify(pd).slice(0, 160)})`} · achat minimum : ${offre.min_quantity ?? '?'}`);
      if (france.out_of_stock) plan.problemes.push('France épuisée chez IPRoyal');
      if ((offre.min_quantity ?? 1) > 1) plan.problemes.push(`IPRoyal impose ${offre.min_quantity} IP minimum par commande : acheter 1 IP dans le tableau de bord, puis --commande=<n°>`);
      if (!Number.isFinite(plan.prixIp)) plan.problemes.push('prix IPRoyal illisible : on n’achète pas à l’aveugle');
      else if (plan.prixIp > PLAFOND_IP) plan.problemes.push(`prix ${plan.prixIp} $ au-dessus du plafond ${PLAFOND_IP} $ (--plafond-ip)`);
      if (Number.isFinite(plan.solde) && Number.isFinite(plan.prixIp) && plan.solde < plan.prixIp) plan.problemes.push(`solde IPRoyal ${plan.solde} $ < ${plan.prixIp} $ : recharger le solde`);
      // (05/10) Les « questions » d'ISP Dedicated sont des OPTIONS (exigences en texte libre, accès
      // multi-appareils, IP neuves au renouvellement) : aucune ne se dit obligatoire, et la commande du
      // prototype (#83578416) est partie sans réponse (questions_answers: []). On n'y répond pas ;
      // seule une question marquée obligatoire arrête l'achat.
      const questions = [...(produit.questions ?? []), ...(offre.questions ?? [])];
      if (questions.length) console.log(`  options de commande laissées vides : ${questions.map((q) => String(q.text).replace(/:\s*$/, '')).join(' · ')}`);
      if (questions.some((q) => q.required === true || q.is_required === true)) plan.problemes.push('IPRoyal exige une réponse à la commande : acheter dans le tableau de bord, puis --commande=<n°>');
    }
  }
}

titre('DNS');
{
  const r = await dnsP.resolve4(DOMAINE_CLOUD).catch(() => []);
  const ipServeur = plan.serveur?.public_net?.ipv4?.ip ?? etat.serveur?.ip ?? null;
  plan.dnsPret = Boolean(ipServeur && r.includes(ipServeur));
  console.log(`  ${DOMAINE_CLOUD} → ${r.length ? r.join(', ') : 'aucun enregistrement'}${plan.dnsPret ? ' (= le serveur)' : ''}`);
  if (CLOUDFLARE) {
    const v = await cf('/user/tokens/verify');
    const z = v.ok ? (await cf(`/zones?name=${ZONE}`)).d?.result?.[0] : null;
    plan.zone = z?.id ?? null;
    console.log(`  jeton Cloudflare : ${v.ok ? 'valide' : `REFUSÉ (HTTP ${v.statut})`} · zone ${ZONE} : ${plan.zone ? 'accessible' : 'INACCESSIBLE'}`);
    if (!v.ok || !plan.zone) plan.problemes.push('jeton Cloudflare inutilisable (le retirer de secrets.env, ou le refaire : Zone › DNS › Modifier, zone fillsell.app)');
  } else console.log('  pas de jeton Cloudflare : le DNS sera le geste de Nico (A « cloud » → IP du serveur, nuage GRIS) ; en attendant, <ip>.sslip.io');
}

titre('Coût du test');
if (plan.coutServeur) {
  const mois = plan.coutServeur.ttc + (plan.coutIpv4?.ttc ?? 0);
  console.log(`  serveur + IPv4 : ${mois.toFixed(2)} € TTC / mois (≈ ${(mois / 30).toFixed(2)} € par jour, à l'heure) ; supprimé = plus rien`);
}
if (Number.isFinite(plan.prixIp)) console.log(`  IP IPRoyal : ${plan.prixIp.toFixed(2)} $ pour 30 jours, sans renouvellement automatique`);
console.log('  Cloudflare : 0 €');

if (plan.problemes.length) {
  titre('⛔ À régler avant --go');
  for (const p of plan.problemes) console.log(`  · ${p}`);
}
if (!GO) {
  console.log(`\n(PLAN) Rien n'a été créé ni acheté.${plan.problemes.length ? '' : ' Tout est prêt : relancer avec --go (sur le GO de Nico).'}`);
  process.exitCode = plan.problemes.length ? 1 : 0;
} else if (plan.problemes.length) {
  console.log('\n--go REFUSÉ : rien n\'a été créé ni acheté.');
  process.exitCode = 1;
} else {
  try { await executer(); } catch (e) {
    console.log(`\n⛔ ARRÊT : ${e.message}`);
    console.log(`   L'état est noté dans ${ETAT} : relancer la même commande reprend là où ça s'est arrêté, sans rien racheter.`);
    process.exitCode = 1;
  }
}

// ═══ 2. L'EXÉCUTION (--go) ═════════════════════════════════════════════════════
async function executer() {
  // 2.1 Le serveur (creer-serveur.mjs : clé SSH, pare-feu Hetzner, Ubuntu 24.04 + cloud-init) — repris s'il existe.
  titre('Serveur');
  if (!plan.serveur) {
    const r = lancer(process.execPath, [path.join(ICI, 'creer-serveur.mjs'), '--go', `--type=${TYPE}`, `--lieu=${LIEU}`, `--nom=${NOM}`]);
    if (r.code !== 0) arret('création du serveur refusée par Hetzner (voir ci-dessus)');
  }
  const s = (await hz(`/servers?name=${encodeURIComponent(NOM)}`)).d?.servers?.[0];
  if (!s) arret('serveur introuvable après création');
  const ip = s.public_net.ipv4.ip;
  etat.serveur = { id: s.id, nom: NOM, ip, type: s.server_type.name, lieu: s.datacenter?.location?.name, cree_le: s.created };
  noterEtat();
  console.log(`  ${NOM} : ${ip} (${etat.serveur.type}, ${etat.serveur.lieu})`);

  // 2.2 L'IP de test : achetée UNE fois (notée avant même la réponse complète), sinon reprise.
  let commande = null;
  if (!args['sans-ip']) {
    titre('IP de test');
    if (!plan.commandeExistante) {
      const r = await ipr('/orders', { methode: 'POST', corps: plan.achat });
      const o = donnees(r);
      if (!r.ok || !o?.id) arret(`commande IPRoyal refusée (HTTP ${r.statut} ${String(r.d?.message ?? '').slice(0, 160)}) — rien n'est noté, rien n'a été pris`);
      etat.ip_test = { commande: String(o.id), achetee_le: new Date().toISOString(), prix_usd: plan.prixIp };
      noterEtat();
      console.log(`  commande ${o.id} passée (1 IP France, 30 jours, sans renouvellement automatique)`);
    }
    const n = plan.commandeExistante ?? etat.ip_test.commande;
    for (let i = 0; i < 45 && !commande; i++) {
      const c = donnees(await ipr(`/orders/${encodeURIComponent(n)}`));
      const proxies = c?.proxy_data?.proxies ?? [];
      if (proxies.length === 1) commande = c;
      else if (proxies.length > 1) arret(`la commande ${n} porte ${proxies.length} IP (règle : une commande = une IP)`);
      else { if (i === 0) console.log(`  commande ${n} : en préparation chez IPRoyal (${c?.status ?? '?'})…`); await pause(20_000); }
    }
    if (!commande) arret(`la commande ${n} n'a toujours pas d'IP après 15 min`);
    const p = commande.proxy_data.proxies[0];
    etat.ip_test = { ...(etat.ip_test ?? {}), commande: String(n), ip: p.ip, port: Number(p.port ?? commande.proxy_data?.ports?.http ?? 12323), expire_le: commande.expire_date ?? null };
    noterEtat();
    console.log(`  IP ${p.ip}, échéance ${etat.ip_test.expire_le ?? '?'} (identifiants jamais affichés)`);
  }
  const urlProxy = commande ? (() => {
    const p = commande.proxy_data.proxies[0];
    return `http://${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@${p.ip}:${p.port ?? commande.proxy_data?.ports?.http ?? 12323}`;
  })() : null;

  // 2.3 Le DNS : par le jeton Cloudflare (A cloud.fillsell.app, gris), sinon déjà posé par Nico, sinon sslip.io.
  titre('DNS');
  let domaine = args.domaine || null;
  if (!domaine && CLOUDFLARE && plan.zone) {
    const ex = (await cf(`/zones/${plan.zone}/dns_records?name=${DOMAINE_CLOUD}`)).d?.result ?? [];
    if (ex.some((r) => r.type !== 'A')) arret(`${DOMAINE_CLOUD} porte déjà un enregistrement ${ex.map((r) => r.type).join(', ')} : on n'y touche pas`);
    const a = ex.find((r) => r.type === 'A');
    if (a && a.content !== ip && !args['forcer-dns']) arret(`${DOMAINE_CLOUD} pointe déjà vers ${a.content} (pas ce serveur) : --forcer-dns pour le remplacer`);
    const corps = { type: 'A', name: DOMAINE_CLOUD, content: ip, ttl: 60, proxied: false, comment: 'FillSell Cloud (serveur de test)' };
    const w = a ? await cf(`/zones/${plan.zone}/dns_records/${a.id}`, { methode: 'PUT', corps }) : await cf(`/zones/${plan.zone}/dns_records`, { methode: 'POST', corps });
    if (!w.ok) arret(`Cloudflare refuse l'enregistrement (HTTP ${w.statut})`);
    console.log(`  ${DOMAINE_CLOUD} → ${ip} (nuage gris) ${a ? 'mis à jour' : 'créé'}`);
    domaine = DOMAINE_CLOUD;
  } else if (!domaine && plan.dnsPret) domaine = DOMAINE_CLOUD;
  if (domaine === DOMAINE_CLOUD) {
    const resolveur = new dnsP.Resolver(); resolveur.setServers(['1.1.1.1', '8.8.8.8']);
    let vu = false;
    for (let i = 0; i < 40 && !vu; i++) { vu = (await resolveur.resolve4(DOMAINE_CLOUD).catch(() => [])).includes(ip); if (!vu) await pause(15_000); }
    if (!vu) { console.log(`  ${DOMAINE_CLOUD} ne pointe pas encore vers ${ip} : déploiement sur sslip.io, relancer plus tard`); domaine = null; }
  }
  domaine ??= `${ip.replace(/\./g, '-')}.sslip.io`;
  console.log(`  domaine du déploiement : ${domaine}`);

  // 2.4 SSH, puis cloud-init fini.
  titre('Serveur prêt ?');
  let joignable = false;
  for (let i = 0; i < 40 && !joignable; i++) { joignable = ssh(ip, 'true', { montrer: false, delaiMs: 20_000 }).code === 0; if (!joignable) await pause(15_000); }
  if (!joignable) arret(`SSH muet sur ${ip} après 10 min`);
  const ci = ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; cloud-init status', { montrer: false, delaiMs: 25 * 60_000 });
  console.log(`  SSH ok · cloud-init : ${ci.sortie.trim() || ci.erreur.trim()}`);
  if (!/status: done/.test(ci.sortie)) arret('cloud-init pas fini (ou en erreur) : `ssh root@<ip> cloud-init status --long`');

  // 2.5 La copie Cloud de l'extension (commit courant), puis le déploiement.
  titre('Déploiement');
  if (lancer(process.execPath, [path.join(RACINE, 'scripts', 'cloud', 'build-extension-cloud.mjs')]).code !== 0) arret('copie Cloud de l’extension refusée');
  if (lancer(BASH, [path.join('serveur-cloud', 'outils', 'deployer.sh'), ip, domaine]).code !== 0) arret('deployer.sh a échoué (voir ci-dessus)');

  // 2.6 Le jeton IPRoyal au .env du serveur (lectures d'échéances), par l'entrée standard ; achats et alertes restent COUPÉS.
  if (IPROYAL) {
    if (!/^[A-Za-z0-9._-]+$/.test(IPROYAL)) arret('IPROYAL_API_TOKEN : caractères inattendus, posé à la main');
    const r = ssh(ip, "read -r T; E=/srv/fillsell-cloud/.env; sed -i \"s|^IPROYAL_API_TOKEN=.*|IPROYAL_API_TOKEN=$T|; s|^IPROYAL_ACHATS_AUTORISES=.*|IPROYAL_ACHATS_AUTORISES=0|; s|^ALERTES_MAIL=.*|ALERTES_MAIL=0|; s|^COMPTES_AUTORISES=.*|COMPTES_AUTORISES=" + NICO + "|\" $E && grep -c '^IPROYAL_API_TOKEN=.' $E", { entree: `${IPROYAL}\n`, montrer: false });
    if (r.code !== 0) arret('jeton IPRoyal non posé sur le serveur');
    ssh(ip, `cd /srv/fillsell-cloud/deploiement && VERSION_ORCHESTRATEUR=${plan.sha} DOMAINE=${domaine} docker compose up -d --force-recreate orchestrateur >/dev/null 2>&1`, { montrer: false });
    console.log('  jeton IPRoyal posé (lecture seule : achats 0, alertes mail 0, compte de Nico seul)');
  }

  // 2.7 Les contrôles.
  titre('Contrôles');
  const verdicts = [];
  const v = (ok, quoi) => { verdicts.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${quoi}`); };
  let sante = null;
  for (let i = 0; i < 18 && !sante; i++) {
    const r = await fetch(`https://${domaine}/sante`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (r?.ok) sante = await r.text(); else await pause(10_000);
  }
  v(Boolean(sante), `https://${domaine}/sante répond${sante ? ` (${sante.slice(0, 80)})` : ''}`);
  const distant = ssh(ip, [
    'set -u; read -r P || true',
    'cd /srv/fillsell-cloud/deploiement',
    'echo "compose:$(docker compose ps --format \'{{.Service}}={{.State}}\' | tr \'\\n\' \' \')"',
    'iptables -S FILLSELL-NAV >/dev/null 2>&1 && echo "pare_feu:present" || echo "pare_feu:absent"',
    `echo "sans_proxy:$(docker run --rm --network fillsell-cloud ${CURL} -s -m 8 -o /dev/null -w '%{http_code}' https://www.vinted.fr 2>/dev/null || true)"`,
    `[ -n "$P" ] && echo "avec_proxy:$(docker run --rm --network fillsell-cloud ${CURL} -s -m 25 -x "$P" https://ipinfo.io/json 2>/dev/null | jq -c '{ip,country,city}' 2>/dev/null)" || echo "avec_proxy:"`,
    'echo "ram:$(free -m | awk \'/^Mem:/{print $2" "$7}\')"',
  ].join('\n'), { entree: `${urlProxy ?? ''}\n`, montrer: false, delaiMs: 5 * 60_000 });
  const lu = Object.fromEntries(distant.sortie.split('\n').map((l) => l.match(/^([a-z_]+):(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  v(/orchestrateur=running/.test(lu.compose ?? '') && /caddy=running/.test(lu.compose ?? ''), `conteneurs : ${lu.compose ?? '?'}`);
  v(lu.pare_feu === 'present', 'pare-feu des navigateurs (FILLSELL-NAV) en place');
  v(['000', ''].includes(lu.sans_proxy ?? ''), `un navigateur SANS proxy ne joint pas Vinted (code ${lu.sans_proxy || 'aucun'})`);
  if (urlProxy) {
    let sortie = null; try { sortie = JSON.parse(lu.avec_proxy || 'null'); } catch { sortie = null; }
    v(sortie?.ip === etat.ip_test.ip && sortie?.country === 'FR', `par l'IP de test, on sort de ${sortie?.ip ?? '?'} (${sortie?.country ?? '?'}, ${sortie?.city ?? '?'})`);
  }
  console.log(`  RAM de l'hôte (totale, disponible, Mo) : ${lu.ram ?? '?'}`);

  // 2.8 La mesure d'un navigateur allumé (RAM) → NAVIGATEURS_MAX.
  if (urlProxy && !args['sans-mesure']) {
    titre('Mesure d’un navigateur');
    const m = ssh(ip, 'cd /srv/fillsell-cloud/deploiement && docker compose exec -T orchestrateur node outils/mesurer-navigateur.mjs', { entree: `${urlProxy}\n`, montrer: false, delaiMs: 6 * 60_000 });
    let mesure = null; try { mesure = JSON.parse(m.sortie.trim().split('\n').pop()); } catch { mesure = null; }
    if (mesure) {
      etat.mesure = { ...mesure, le: new Date().toISOString() }; noterEtat();
      console.log(`  pic ${mesure.pic_mo} Mo, moyenne ${mesure.moyenne_mo} Mo (limite ${mesure.limite_conteneur}) · hôte ${mesure.ram_hote_mo} Mo → NAVIGATEURS_MAX proposé : ${mesure.navigateurs_max_propose} · profil détruit : ${mesure.profil_detruit ? 'oui' : 'NON'}`);
      v(mesure.profil_detruit === true, 'le navigateur de mesure et son profil sont détruits');
    } else v(false, `mesure illisible (${(m.erreur || m.sortie).slice(-200)})`);
  }

  etat.deploye = { sha: plan.sha, domaine, le: new Date().toISOString(), controles_ok: verdicts.every(Boolean) };
  noterEtat();
  titre(verdicts.every(Boolean) ? 'PRÊT' : 'DÉPLOYÉ, MAIS UN CONTRÔLE EST ROUGE');
  console.log(`  Serveur ${ip} · ${domaine} · commit ${plan.sha}${etat.ip_test?.ip ? ` · IP de test ${etat.ip_test.ip} (commande ${etat.ip_test.commande})` : ''}`);
  console.log('  Ensuite (docs/cloud/test-complet.md), sur le GO de Nico seulement :');
  console.log('    1. migrations 20261004233000 puis 20261005120000 (+ le sel des empreintes au vault) ;');
  console.log(`    2. sur le serveur : docker compose exec orchestrateur node outils/ip.mjs ajouter ${etat.ip_test?.commande ?? '<commande>'} ;`);
  console.log('    3. Nico en option offerte (réparation), session posée au coffre, « Me connecter » depuis son iPhone.');
  process.exitCode = verdicts.every(Boolean) ? 0 : 1;
}
