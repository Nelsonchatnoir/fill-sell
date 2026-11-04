// (04/11 soir, règle de Nico) LES LECTURES DE FOND LEBONCOIN FAITES COMME LA PAGE LES FAIT.
//
// Constat (essai GPU, enregistrement de fond de cloud-2, 18:58:34 et 20:30:33) : l'appel de compte de la veille des commandes
// (GET api.leboncoin.fr/api/account/v2/members/me/account) est refusé par DataDome 5 fois sur 5 sur le Cloud (01/11 → 04/11,
// cloud-1 et cloud-2), alors que LE MÊME appel fait par la page, 11 à 13 s plus tôt, avec les MÊMES cookies, passe (200).
// La différence (client du site, lu dans le cache HTTP du navigateur de cloud-2, module « S » des chunks Leboncoin) :
//   · la page : Authorization: Bearer <luat>, x-lbc-experiment: base64({version:1, rollout_visitor_id ← cookie
//     cnfdVisitorId, rollout_user_id, experiment_visitor_id, experiment_user_id}), Content-Type: application/json (posé
//     par son client sur toute requête), credentials: "include", Accept par défaut ;
//   · l'extension : authorization: Bearer <luat>, accept: application/json — ni x-lbc-experiment, ni Content-Type.
// La page met aussi la réponse du compte en cache de session (sessionStorage « cache:<adresse> », 300 s) dès qu'elle charge.
//
// LA RÈGLE (une seule transformation, appliquée au PC — chrome-extension/ — ET à la copie Cloud — build-extension-cloud) :
//   · le TYPE DU COMPTE n'est plus jamais redemandé : il est lu dans la réponse que la page a déjà reçue ;
//   · toute autre lecture de fond (transactions, relevé des annonces, messagerie : liste, messages, commandes, achats)
//     part avec la requête du client de la page, dans la page : mêmes en-têtes, calculés comme la page les calcule depuis
//     les mêmes cookies, credentials « include ». Aucune valeur inventée : rien que ce que la page envoie elle-même.
// Les gestes (envoi d'un message, bordereaux) ne sont pas touchés ici.

export const MARQUE = '(04/11 soir, règle de Nico) requête du client de la page Leboncoin';
export const CLE_CACHE_COMPTE = 'cache:https://api.leboncoin.fr/api/account/v2/members/me/account';

/** Les en-têtes de la page (source insérée DANS les fonctions autonomes de l'extension : aucune référence extérieure). */
export const SOURCE_H_PAGE = `const H = (() => { // ${MARQUE}
      const ck = (typeof document === "object" && document && document.cookie) || "";
      const lc = (n) => { const m = ck.match(new RegExp("(^| )" + n + "=([^;]+)")); return m ? m[2] : undefined; };
      const vs = lc("cnfdVisitorId"), ru = lc("rollout_user_id"), ev = lc("experiment_visitor_id"), eu = lc("experiment_user_id");
      const xp = { version: 1, ...(vs && { rollout_visitor_id: vs }), ...(ru && { rollout_user_id: ru }), ...(ev && { experiment_visitor_id: ev }), ...(eu && { experiment_user_id: eu }) };
      return { Authorization: \`Bearer \${tok}\`, "x-lbc-experiment": btoa(JSON.stringify(xp)), "Content-Type": "application/json" };
    })();`;

/** Le type du compte lu dans la page (source insérée, autonome). */
export const SOURCE_TYPE_PAGE = `// ${MARQUE} : le type du compte est lu dans la réponse que la PAGE a déjà reçue (son cache de session), jamais redemandé.
    try { type = JSON.parse(sessionStorage.getItem(${JSON.stringify(CLE_CACHE_COMPTE)}) ?? "null")?.account?.type ?? null; } catch { type = null; }`;

function patcheur(src, nomFichier) {
  const appliques = [];
  const patch = (nom, ancre, remplacement) => {
    const n = src.split(ancre).length - 1;
    if (n !== 1) throw new Error(`${nomFichier} — « ${nom} » : ancre trouvée ${n} fois (attendu 1) :\n  ${ancre.split('\n')[0]}`);
    src = src.replace(ancre, () => remplacement);
    appliques.push(`${nomFichier} : ${nom}`);
  };
  return { patch, fin: () => ({ src, appliques }) };
}

/** background.js : ventes, veille des commandes, relevé des annonces. Déjà transformé (MARQUE) → rendu tel quel. */
export function patcherBackgroundLeboncoin(bg) {
  if (bg.includes(MARQUE)) return { src: bg, appliques: [], deja: true };
  const { patch, fin } = patcheur(bg, 'background.js');
  // ── Ventes (lireVentesLeboncoin) ──
  patch('ventes : en-têtes de la page',
    '    const H = { authorization: `Bearer ${tok}`, accept: "application/json" };\n    // 🚨 LE COMPTE PRO D\'ABORD.',
    `    ${SOURCE_H_PAGE}\n    // 🚨 LE COMPTE PRO D'ABORD.`);
  patch('ventes : type du compte lu dans la page',
    '    let type = null;\n    try {\n      const r = await fetch("https://api.leboncoin.fr/api/account/v2/members/me/account", { headers: H });\n'
    + '      if (r.status === 200) type = (await r.json())?.account?.type ?? null;\n      else return { ok: false, motif: `compte_http_${r.status}` };\n'
    + '    } catch { return { ok: false, motif: "compte_illisible" }; }\n',
    `    let type = null;\n    ${SOURCE_TYPE_PAGE}\n    if (!type) return { ok: false, motif: "compte_absent_de_la_page" };\n`);
  patch('ventes : transactions avec les cookies de la page',
    '        const r = await fetch(u, { headers: H });\n        if (r.status !== 200) { motif = `http_${r.status}`; break; }',
    '        const r = await fetch(u, { headers: H, credentials: "include" });\n        if (r.status !== 200) { motif = `http_${r.status}`; break; }');
  // ── Veille des commandes (lireCommandesRecentes) ──
  patch('veille : en-têtes de la page',
    '    const H = { authorization: `Bearer ${tok}`, accept: "application/json" };\n    // Même règle que lireVentesLeboncoin',
    `    ${SOURCE_H_PAGE}\n    // Même règle que lireVentesLeboncoin`);
  patch('veille : type du compte lu dans la page',
    '      requetes++;\n      const ra = await fetch("https://api.leboncoin.fr/api/account/v2/members/me/account", { headers: H }).catch(() => null);\n'
    + '      if (!ra) return { ok: false, motif: "reseau", requetes };\n'
    + '      if (ra.status !== 200) return { ok: false, http: ra.status, motif: `compte_http_${ra.status}`, requetes };\n'
    + '      type = (await ra.json().catch(() => null))?.account?.type ?? "inconnu";\n',
    `      ${SOURCE_TYPE_PAGE.replace('\n    try', '\n      try')}\n      if (!type) return { ok: false, motif: "compte_absent_de_la_page", requetes };\n`);
  patch('veille : transactions avec les cookies de la page',
    '    const r = await fetch(u, { headers: H }).catch(() => null);\n    if (!r) return { ok: false, motif: "reseau", requetes, typeCompte: type };',
    '    const r = await fetch(u, { headers: H, credentials: "include" }).catch(() => null);\n    if (!r) return { ok: false, motif: "reseau", requetes, typeCompte: type };');
  // ── Relevé des annonces (POST dashboard/v1/search : la page fait ce même appel en chargeant « mes annonces ») ──
  patch('relevé : en-têtes de la page',
    '    let offset = 0;\n    for (; pages < pagesMax;) {',
    `    ${SOURCE_H_PAGE}\n    let offset = 0;\n    for (; pages < pagesMax;) {`);
  patch('relevé : requête de la page',
    '          headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },',
    '          headers: H, credentials: "include",');
  return fin();
}

/** content-scripts/leboncoin.js : le type du compte au mur « pro » de la publication — lu dans la page d'abord. */
export function patcherContentLeboncoin(c) {
  if (c.includes(MARQUE)) return { src: c, appliques: [], deja: true };
  const { patch, fin } = patcheur(c, 'content-scripts/leboncoin.js');
  patch('publication : type du compte lu dans la page',
    '  const lireTypeCompteLbc = async () => {\n    try {\n      const tok = localStorage.getItem("luat");\n      if (!tok) return null;\n'
    + '      const r = await fetch("https://api.leboncoin.fr/api/account/v2/members/me/account",\n'
    + '        { headers: { authorization: `Bearer ${tok}`, accept: "application/json" } });\n'
    + '      if (r.status !== 200) return null;\n      const t = (await r.json())?.account?.type;\n',
    `  const lireTypeCompteLbc = async () => {\n    try {\n      // ${MARQUE} : la réponse que la page a déjà reçue (son cache de session), jamais redemandée.\n`
    + `      const t = JSON.parse(sessionStorage.getItem(${JSON.stringify(CLE_CACHE_COMPTE)}) ?? "null")?.account?.type;\n`);
  return fin();
}

/** messagerie.js : les lecteurs de fond Leboncoin (liste, messages, commandes, achats). Déjà transformé → tel quel. */
export function patcherMessagerieLeboncoin(m) {
  if (m.includes(MARQUE)) return { src: m, appliques: [], deja: true };
  const { patch, fin } = patcheur(m, 'messagerie.js');
  patch('messagerie : liste des conversations',
    '    const r = await fetch("https://api.leboncoin.fr/api/messaging-items-api/v3/conversations", {\n'
    + '      headers: { authorization: `Bearer ${tok}`, accept: "application/json" },',
    `    ${SOURCE_H_PAGE}\n    const r = await fetch("https://api.leboncoin.fr/api/messaging-items-api/v3/conversations", {\n`
    + '      headers: H, credentials: "include",');
  patch('messagerie : messages d\'une conversation (en-têtes)',
    '  async function lecteurDetailsLeboncoin(moi, refs) {\n    const tok = localStorage.getItem("luat");\n',
    `  async function lecteurDetailsLeboncoin(moi, refs) {\n    const tok = localStorage.getItem("luat");\n    ${SOURCE_H_PAGE}\n`);
  patch('messagerie : messages d\'une conversation (requête)',
    '        headers: { authorization: `Bearer ${tok}`, accept: "application/hal+json" },',
    '        headers: { ...H, accept: "application/hal+json" }, credentials: "include",');
  patch('messagerie : commandes (en-têtes)',
    '    if (!tok) return { ok: false, motif: "jeton_absent", requetes: 0 };\n    const H = { authorization: `Bearer ${tok}`, accept: "application/json" };\n    let requetes = 1;',
    `    if (!tok) return { ok: false, motif: "jeton_absent", requetes: 0 };\n    ${SOURCE_H_PAGE}\n    let requetes = 1;`);
  patch('messagerie : commandes (transactions)',
    '    const r = await fetch(u, { headers: H }).catch(() => null);\n    if (!r) return { ok: false, motif: "reseau", requetes };',
    '    const r = await fetch(u, { headers: H, credentials: "include" }).catch(() => null);\n    if (!r) return { ok: false, motif: "reseau", requetes };');
  patch('messagerie : commandes (détail d\'un achat)',
    '      const rd = await fetch(`https://api.leboncoin.fr/api/consumergoods/purchase/v2/purchases/${encodeURIComponent(c.purchase_id)}`, { headers: H }).catch(() => null);',
    '      const rd = await fetch(`https://api.leboncoin.fr/api/consumergoods/purchase/v2/purchases/${encodeURIComponent(c.purchase_id)}`, { headers: H, credentials: "include" }).catch(() => null);');
  return fin();
}
