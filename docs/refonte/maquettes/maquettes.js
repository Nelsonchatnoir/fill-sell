// ═══════════════════════════════════════════════════════════════════════════
// FillSell — maquettes de la refonte (16/10/2026). Vanilla JS, aucun framework :
// une page, un téléphone, des écrans par ancre (#/...). Tout est faux-réel :
// contenu plausible, cinq plateformes nommées, tutoiement, AUCUN temps estimé.
// Les six mots d'état : En file · En cours · Fait · À toi de jouer · En pause · Arrêtée.
// ═══════════════════════════════════════════════════════════════════════════
const PF = [
  ["vinted", "Vinted", "V"], ["leboncoin", "Leboncoin", "lbc"], ["ebay", "eBay", "e"], ["beebs", "Beebs", "B"], ["depop", "Depop", "D"],
];
const logo = (k, sm = false) => { const p = PF.find((x) => x[0] === k) || [k, k, "?"]; return `<span class="logo ${p[0]}${sm ? " sm" : ""}" aria-hidden="true">${p[2]}</span>`; };
const pastille = (etat, mot) => {
  const MOTS = { fait: "Fait", en_cours: "En cours", en_file: "En file", en_pause: "En pause", a_toi: "À toi de jouer", pas_partie: "À toi de jouer", arretee: "Arrêtée" };
  return `<span class="pastille ${etat}"><i></i>${mot || MOTS[etat]}</span>`;
};
const onglets = (on) => `<nav class="onglets" aria-label="Onglets">
  <span class="${on === "tableau" ? "on" : ""}">▦<br>Tableau</span><span class="${on === "stock" ? "on" : ""}">▤<br>Stock</span>
  <span class="cam">◉</span><span class="${on === "ventes" ? "on" : ""}">◳<br>Ventes</span><span class="${on === "stats" ? "on" : ""}">∿<br>Stats</span></nav>`;
const entete = (n = 5) => `<div class="entete"><span class="q">${n} annonces gratuites ce mois</span><span class="spacer"></span><span class="roue" aria-label="Réglages">⚙</span></div>`;
const prog = (i, n) => `<div class="progression" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? "ok" : k === i ? "ici" : ""}"></i>`).join("")}</div>`;
const pied = (h) => `<div class="ecran-pied">${h}</div>`;

// ── Les écrans ───────────────────────────────────────────────────────────────
const E = {};

// A. ONBOARDING — jusqu'à la première publication
E["onboarding-1"] = {
  titre: "1 · Bienvenue", change: "Un seul écran de promesse, les CINQ plateformes nommées d'entrée (Depop comprise), et une phrase vraie : c'est ton ordinateur qui publie.",
  html: `${prog(0, 8)}<p class="kicker">Bienvenue</p><h1 class="t">Vends partout.<br>Gère tout ici.</h1>
  <p class="x">Une fiche, publiée sur Vinted, Leboncoin, eBay, Beebs et Depop. Les ventes repérées, les autres annonces retirées, les anciennes remontées. Tu pilotes depuis ce téléphone ; ton ordinateur fait le travail.</p>
  <div class="carte" style="padding:16px;display:flex;justify-content:space-between">${PF.map(([k]) => logo(k)).join("")}</div>
  ${pied(`<button class="btn">C'est parti</button>`)}`,
};
E["onboarding-2"] = {
  titre: "2 · Où vends-tu déjà ?", change: "Depop entre dans la liste ; « Je débute » devient une tuile à égalité, en premier, parce que c'est la réponse de 41 comptes sur 456 (30 j).",
  html: `${prog(1, 8)}<p class="kicker">Pour commencer</p><h1 class="t">Où vends-tu déjà ?</h1>
  <p class="x">Coche ce que tu utilises. Tu pourras en ajouter à tout moment.</p>
  <button class="tuile-pf on" style="width:100%;margin-bottom:10px">✦ Je débute, rien en ligne<span class="coche">✓</span></button>
  <div class="tuiles">${PF.map(([k, n]) => `<button class="tuile-pf">${logo(k)}${n}<span class="coche"></span></button>`).join("")}</div>
  ${pied(`<button class="btn">Continuer</button>`)}`,
};
E["onboarding-3"] = {
  titre: "3 · Ton ordinateur fait le travail", change: "L'étape dit qu'elle est OBLIGATOIRE pour publier (plus « Passer » en silence), propose les deux situations réelles, et montre la détection en direct — sans jamais promettre un délai.",
  html: `${prog(2, 8)}<p class="kicker">La marche qui compte</p><h1 class="t">Ton ordinateur fait le travail</h1>
  <p class="x">Une extension Chrome, installée une fois sur ton ordinateur, dépose et relève tes annonces avec tes comptes déjà connectés — jamais tes mots de passe. Sans elle, rien ne part.</p>
  <div class="carte"><div class="ligne"><span class="logo" style="background:var(--menthe);color:var(--teal-deep)">💻</span><div class="txt"><b>Je suis devant mon ordinateur</b><span>Installe-la maintenant depuis le Chrome Web Store. Tu reviens ici, c'est détecté tout seul.</span></div></div>
  <div class="ligne"><span class="logo" style="background:var(--menthe);color:var(--teal-deep)">📱</span><div class="txt"><b>Je suis sur mon téléphone</b><span>On t'envoie le lien par mail. Tes fiches attendront : elles partiront dès que l'extension tourne.</span></div></div></div>
  <div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--ink2)"><span class="pastille en_cours"><i></i></span>Détection automatique — rien à recliquer ici</div>
  ${pied(`<button class="btn">M'envoyer le lien pour mon ordinateur</button><button class="lien">J'installerai plus tard — mes fiches attendront</button>`)}`,
};
E["onboarding-4"] = {
  titre: "4 · Connecte tes plateformes", change: "Un seul écran pour les cinq, avec l'état vrai et LE geste par ligne — au lieu de quatre « pas encore vérifié » dans les Réglages.",
  html: `${prog(3, 8)}<p class="kicker">Tes comptes</p><h1 class="t">Connecte tes plateformes</h1>
  <p class="x">L'extension utilise tes sessions déjà ouvertes dans Chrome. Elle ne connaît aucun mot de passe.</p>
  <div class="carte">
    <div class="ligne">${logo("vinted")}<div class="txt"><b>Vinted</b><span>Boutique @marie_vide — vue dans Chrome</span></div>${pastille("fait", "Connectée")}</div>
    <div class="ligne">${logo("leboncoin")}<div class="txt"><b>Leboncoin</b><span>Connecte-toi sur leboncoin.fr dans Chrome</span></div><button class="btn sec" style="width:auto;min-height:40px;padding:0 12px;font-size:12.5px">Me connecter</button></div>
    <div class="ligne">${logo("ebay")}<div class="txt"><b>eBay</b><span>Relié à FillSell, mais pas encore prêt à vendre chez eBay</span></div><a href="#plateformes-ebay" class="btn sec" style="width:auto;min-height:40px;padding:0 12px;font-size:12.5px;text-decoration:none">Voir</a></div>
    <div class="ligne">${logo("beebs")}<div class="txt"><b>Beebs</b><span>Connecte-toi sur beebs.app dans Chrome</span></div><button class="btn sec" style="width:auto;min-height:40px;padding:0 12px;font-size:12.5px">Me connecter</button></div>
    <div class="ligne">${logo("depop")}<div class="txt"><b>Depop</b><span>Une autorisation dans l'extension, une seule fois</span></div><a href="#plateformes-depop" class="btn sec" style="width:auto;min-height:40px;padding:0 12px;font-size:12.5px;text-decoration:none">Autoriser</a></div>
  </div>
  <p class="x" style="margin-top:12px;font-size:12.5px">Tu peux continuer sans tout connecter : une fiche n'ira que là où tu es connecté.</p>
  ${pied(`<button class="btn">Continuer</button>`)}`,
};
E["onboarding-5"] = {
  titre: "5 · Ta première fiche", change: "On montre le résultat (la fiche écrite) AVANT de demander un geste ; la photo est le seul champ.",
  html: `${prog(4, 8)}<p class="kicker">Ta première fiche</p><h1 class="t">Une photo, et la fiche s'écrit</h1>
  <p class="x">Prends l'article en photo : FillSell reconnaît l'objet, propose un titre, une description et un prix. Tu corriges si tu veux.</p>
  <div class="carte" style="padding:14px"><div style="display:flex;gap:12px"><div class="job" style="margin:0;padding:0;border:0;background:none"><div class="vignette" style="width:84px;height:84px;border-radius:14px"></div></div>
  <div style="flex:1"><div class="skel" style="width:80%;margin:6px 0 8px"></div><div class="skel" style="width:55%;margin-bottom:8px"></div><div class="skel" style="width:40%"></div><p style="margin:10px 0 0;font-size:12px;color:var(--ink2)">Titre, description, prix conseillé</p></div></div></div>
  ${pied(`<button class="btn">📷 Photographier mon premier article</button><button class="lien">Écrire la fiche à la main</button>`)}`,
};
E["onboarding-6"] = {
  titre: "6 · Où l'envoyer ?", change: "Les plateformes NON connectées sont grisées avec leur geste, pas cochables en silence : la fiche ne « partira » que là où ça peut partir.",
  html: `${prog(5, 8)}<p class="kicker">Première publication</p><h1 class="t">Où l'envoyer ?</h1>
  <div class="carte" style="padding:12px;display:flex;gap:12px;align-items:center;margin-bottom:12px"><div class="vignette" style="width:56px;height:56px;border-radius:12px;background:linear-gradient(140deg,#E8E2D4,#F3EFE6)"></div><div><b style="font-size:14px">Veste en jean Levi's, M</b><div style="font-size:12.5px;color:var(--ink2)">38 € · fiche prête</div></div></div>
  <div class="carte">
    <div class="ligne">${logo("vinted")}<div class="txt"><b>Vinted</b><span>Gratuit · 5 publications restantes ce mois</span></div><span class="tuile-pf on coche" style="width:22px;height:22px;padding:0;min-height:0">✓</span></div>
    <div class="ligne" style="opacity:.6">${logo("leboncoin")}<div class="txt"><b>Leboncoin</b><span>Connecte-toi d'abord sur ton ordinateur</span></div><button class="btn sec" style="width:auto;min-height:36px;padding:0 10px;font-size:12px">Me connecter</button></div>
    <div class="ligne" style="opacity:.6">${logo("ebay")}<div class="txt"><b>eBay</b><span>Compte pas encore prêt chez eBay</span></div><a href="#plateformes-ebay" style="font-size:12px;font-weight:700">Voir</a></div>
    <div class="ligne" style="opacity:.6">${logo("beebs")}<div class="txt"><b>Beebs</b><span>Connecte-toi d'abord sur ton ordinateur</span></div></div>
    <div class="ligne" style="opacity:.6">${logo("depop")}<div class="txt"><b>Depop</b><span>Autorise Depop dans l'extension</span></div></div>
  </div>
  ${pied(`<button class="btn">Publier sur Vinted</button>`)}`,
};
E["onboarding-7"] = {
  titre: "7 · C'est en file", change: "Le suivi vit DANS le parcours, avec les six mots : la fiche est « En file », on dit ce que ça veut dire et ce qui la ferait partir.",
  html: `${prog(6, 8)}<p class="kicker">Première publication</p><h1 class="t">C'est en file</h1>
  <div class="job"><div class="vignette" style="background:linear-gradient(140deg,#E8E2D4,#F3EFE6)"></div><div class="txt"><b>Veste en jean Levi's, M</b><small>38 € · Publication sur Vinted</small><p>${pastille("en_file")} — elle part dès que ton ordinateur la prend, à son tour.</p></div></div>
  <div class="carte" style="padding:6px 14px;margin-top:8px">
    <div class="etape fait"><span class="rond">✓</span><div class="txt"><b>Fiche prête</b><span>Titre, prix, photos, rayon.</span></div></div>
    <div class="etape ici"><span class="rond">2</span><div class="txt"><b>En file</b><span>Ton ordinateur la prend quand Chrome est ouvert avec l'extension.</span></div></div>
    <div class="etape"><span class="rond">3</span><div class="txt"><b>En cours</b><span>Dépôt sur Vinted, dans ton Chrome.</span></div></div>
    <div class="etape"><span class="rond">4</span><div class="txt"><b>Fait</b><span>En ligne sur Vinted — tu reçois la fiche avec son lien.</span></div></div>
  </div>
  <div class="bande" style="margin-top:12px">Ton ordinateur est éteint ? Elle attend, rien n'est perdu. Elle part dès que Chrome s'ouvre avec l'extension.</div>
  ${pied(`<button class="btn">Entrer dans FillSell</button>`)}`,
};
E["onboarding-8"] = {
  titre: "8 · Fait", change: "La fin du parcours est la PREMIÈRE PUBLICATION faite, pas un récapitulatif : une coche, le lien, et le geste suivant (une deuxième fiche ou une plateforme de plus).",
  html: `${prog(7, 8)}<div style="text-align:center;padding:26px 0 6px"><span class="coche-ok" style="width:64px;height:64px;font-size:28px;margin:0 auto">✓</span></div>
  <h1 class="t" style="text-align:center">En ligne sur Vinted</h1>
  <p class="x" style="text-align:center">Ta première annonce est partie de ton ordinateur. FillSell la surveille : la vente, la remontée, le retrait ailleurs — tout ça, tout seul.</p>
  <div class="job"><div class="vignette" style="background:linear-gradient(140deg,#E8E2D4,#F3EFE6)"></div><div class="txt"><b>Veste en jean Levi's, M</b><small>38 € · Vinted · <a href="#">voir l'annonce ↗</a></small><p>${pastille("fait")}</p></div></div>
  ${pied(`<button class="btn">Ajouter un deuxième article</button><button class="lien">Connecter Leboncoin, eBay, Beebs ou Depop</button>`)}`,
};

// B. CONNEXION DE CHAQUE PLATEFORME
const ecranPf = (k, n, titre, change, corps, cta) => ({ titre: `${n} — ${titre}`, change, html: `<div class="entete" style="margin-bottom:6px"><span style="font-weight:700">‹ Mes plateformes</span></div>
  <div style="display:flex;align-items:center;gap:12px;margin:8px 0 10px">${logo(k)}<h1 class="t" style="margin:0">${n}</h1></div>${corps}${pied(cta)}` });
E["plateformes-vinted"] = ecranPf("vinted", "Vinted", "Session fermée", "Un seul mot d'état (À toi de jouer), le geste, et ce qui se passera après — jamais « session », « sonde », ni « dans N min ».",
  `<div class="bande ambre">${pastille("a_toi")} — tu n'es pas connectée à Vinted sur ton ordinateur.</div>
  <div class="carte" style="margin-top:12px;padding:4px 14px"><div class="etape fait"><span class="rond">✓</span><div class="txt"><b>Extension installée</b><span>Vue sur ton ordinateur.</span></div></div>
  <div class="etape ici"><span class="rond">2</span><div class="txt"><b>Connecte-toi sur vinted.fr dans Chrome</b><span>Comme d'habitude. FillSell ne voit pas ton mot de passe.</span></div></div>
  <div class="etape"><span class="rond">3</span><div class="txt"><b>Ça repart tout seul</b><span>Tes publications Vinted en pause repartent dès que la boutique est vue.</span></div></div></div>`,
  `<button class="btn">Ouvrir vinted.fr sur mon ordinateur</button><button class="lien">Je ne vends pas sur Vinted</button>`);
E["plateformes-leboncoin"] = ecranPf("leboncoin", "Leboncoin", "Pas connecté", "Même écran que Vinted : l'état, le geste, la suite. Le compte PRO est dit s'il est détecté.",
  `<div class="bande ambre">${pastille("a_toi")} — connecte-toi à Leboncoin sur ton ordinateur.</div>
  <div class="carte" style="margin-top:12px;padding:4px 14px"><div class="etape ici"><span class="rond">1</span><div class="txt"><b>Connecte-toi sur leboncoin.fr dans Chrome</b><span>Ton compte, tes annonces, ton adresse de remise : rien à ressaisir ici.</span></div></div>
  <div class="etape"><span class="rond">2</span><div class="txt"><b>Ça repart tout seul</b><span>Les fiches en pause pour Leboncoin partent dès que la session est vue.</span></div></div></div>`,
  `<button class="btn">Ouvrir leboncoin.fr sur mon ordinateur</button><button class="lien">Je ne vends pas sur Leboncoin</button>`);
E["plateformes-ebay"] = ecranPf("ebay", "eBay", "Relié, mais pas prêt chez eBay", "Le cas des 20 comptes bloqués : on dit CE QU'eBay attend (trois cases), avec le lien direct, et pourquoi FillSell n'enverra rien avant.",
  `<div class="bande ambre">${pastille("a_toi")} — ton compte eBay est relié à FillSell, mais eBay ne le laisse pas encore vendre.</div>
  <p class="x" style="margin:12px 0 8px">Rien n'a été envoyé à eBay. Dès que ces trois points sont faits chez eBay, tes annonces partent toutes seules :</p>
  <div class="carte" style="padding:4px 14px"><div class="etape fait"><span class="rond">✓</span><div class="txt"><b>Inscription vendeur</b><span>Faite.</span></div></div>
  <div class="etape ici"><span class="rond">2</span><div class="txt"><b>Politiques de livraison, paiement, retours</b><span>Chez eBay, une fois : elles s'appliquent à toutes tes annonces.</span></div></div>
  <div class="etape"><span class="rond">3</span><div class="txt"><b>Lieu d'expédition</b><span>Ton code postal, chez eBay.</span></div></div></div>
  <p class="x" style="margin:12px 0 0;font-size:12.5px">Ton compte eBay est sur ebay.fr ✓ (un compte sur un autre site eBay ne peut pas être suivi).</p>`,
  `<button class="btn">Finir chez eBay (Seller Hub)</button><button class="lien">Je reviendrai — mes fiches eBay attendent</button>`);
E["plateformes-beebs"] = ecranPf("beebs", "Beebs", "Pas connectée", "Beebs a sa particularité (vérification humaine des annonces) : on la dit ici, une fois, au lieu de la découvrir sur une pastille.",
  `<div class="bande ambre">${pastille("a_toi")} — connecte-toi à Beebs sur ton ordinateur.</div>
  <div class="carte" style="margin-top:12px;padding:4px 14px"><div class="etape ici"><span class="rond">1</span><div class="txt"><b>Connecte-toi sur beebs.app dans Chrome</b><span>Compte Beebs classique (pas « visiteur »).</span></div></div>
  <div class="etape"><span class="rond">2</span><div class="txt"><b>Bon à savoir</b><span>Beebs vérifie chaque annonce à la main avant de la mettre en ligne : après le dépôt, ta fiche reste « En cours » jusqu'à son feu vert.</span></div></div></div>`,
  `<button class="btn">Ouvrir beebs.app sur mon ordinateur</button><button class="lien">Je ne vends pas sur Beebs</button>`);
E["plateformes-depop"] = ecranPf("depop", "Depop", "Autorisation à donner", "Le cas Depop : une permission Chrome, pas une connexion. On explique POURQUOI (Depop n'a pas d'API), le geste se fait dans l'extension.",
  `<div class="bande ambre">${pastille("a_toi")} — Depop attend ton autorisation dans l'extension.</div>
  <p class="x" style="margin:12px 0 8px">Depop ne propose pas de connexion automatique : FillSell travaille sur depop.com comme toi, dans ton Chrome. Chrome demande ton accord, une seule fois.</p>
  <div class="carte" style="padding:4px 14px"><div class="etape ici"><span class="rond">1</span><div class="txt"><b>Appuie sur « Autoriser Depop »</b><span>La fenêtre FillSell s'ouvre sur ton ordinateur ; Chrome te demande l'accord pour depop.com.</span></div></div>
  <div class="etape"><span class="rond">2</span><div class="txt"><b>Connecte-toi sur depop.com</b><span>Si ce n'est pas déjà fait, dans le même Chrome.</span></div></div>
  <div class="etape"><span class="rond">3</span><div class="txt"><b>Ça repart tout seul</b><span>Tes fiches Depop en pause partent dès l'accord donné.</span></div></div></div>`,
  `<button class="btn">Autoriser Depop</button><button class="lien">Je ne vends pas sur Depop</button>`);

// C. ÉTATS VIDES
E["vide-stock"] = {
  titre: "Stock vide", change: "Huit blocs → trois : ce que la page fera, LE geste (photographier), et l'état des plateformes en une ligne. Le reste (filtres, cartes/liste, republication Pro) n'apparaît qu'avec un premier article.",
  html: `${entete()}<h1 class="t">Mon stock</h1>
  <div class="vide"><div class="ico">📦</div><b>Ton stock est vide</b><span>Ici vivront tes articles : où ils sont en ligne, ce qui les attend, ce qu'ils t'ont rapporté. Une fiche = une photo.</span><button class="btn">📷 Ajouter mon premier article</button><button class="lien">Importer mes annonces déjà en ligne</button></div>
  <div class="carte" style="margin-top:12px"><div class="ligne"><div class="txt"><b style="font-size:13px">Plateformes</b><span>Vinted connectée · Leboncoin, Beebs à connecter · eBay à finir · Depop à autoriser</span></div><a href="#onboarding-4" style="font-size:12.5px;font-weight:700;text-decoration:none">Voir</a></div></div>
  ${onglets("stock")}`,
};
E["vide-ventes"] = {
  titre: "Ventes vides", change: "Une phrase, un geste, zéro offre payante sur un écran où rien n'a encore été vendu.",
  html: `${entete()}<h1 class="t">Ventes</h1>
  <div class="vide"><div class="ico">🎉</div><b>Aucune vente pour l'instant</b><span>Dès qu'un article part sur Vinted, Leboncoin, eBay, Beebs ou Depop, il apparaît ici avec ta marge — et FillSell te propose de retirer les autres annonces d'un tap.</span><button class="btn sec">Voir mon stock</button></div>
  <div class="groupe">Ce qui se passe à chaque vente</div>
  <div class="carte"><div class="ligne"><span class="coche-ok">1</span><div class="txt"><b>On repère la vente</b><span>Sur les cinq plateformes.</span></div></div><div class="ligne"><span class="coche-ok">2</span><div class="txt"><b>Tu confirmes, on retire le reste</b><span>Un tap, et seulement si tu confirmes.</span></div></div><div class="ligne"><span class="coche-ok">3</span><div class="txt"><b>Ta marge se calcule</b><span>Prix de vente moins achat et frais.</span></div></div></div>
  ${onglets("ventes")}`,
};
E["vide-tableau"] = {
  titre: "Tableau vide", change: "Un seul appel à l'action (le même que le Stock), pas deux blocs concurrents ; les compteurs à zéro sont dits en une ligne, pas en six.",
  html: `${entete()}<h1 class="t">Bonjour Marie</h1>
  <p class="x">Ton tableau se remplit avec tes ventes : profit, stock, annonces en ligne. Pour l'instant, tout est à zéro — c'est normal.</p>
  <div class="vide"><div class="ico">📷</div><b>Commence par un article</b><span>Une photo suffit : la fiche s'écrit, tu choisis où l'envoyer.</span><button class="btn">Ajouter mon premier article</button></div>
  ${onglets("tableau")}`,
};
E["vide-stats"] = {
  titre: "Stats vides", change: "Des tirets « -- » → une phrase qui dit ce que la page montrera et à partir de quand (la première vente, pas une durée).",
  html: `${entete()}<h1 class="t">Stats</h1>
  <div class="vide"><div class="ico">📈</div><b>Tes stats arrivent avec ta première vente</b><span>Profit, revenu, meilleures plateformes, délai de vente par article : tout se calcule tout seul à partir de tes ventes enregistrées.</span><button class="btn sec">Voir mon stock</button></div>
  ${onglets("stats")}`,
};
E["vide-lens"] = {
  titre: "Lens (créer)", change: "La promesse « Scanne, on gère le reste » reste, mais l'écran dit la vérité juste dessous : ce qui part, et d'où (ton ordinateur).",
  html: `${entete()}<div style="text-align:center;padding:10px 0 4px"><h1 class="t">Scanne.<br>On écrit la fiche.</h1><p class="x">Une photo suffit : titre, description et prix pour chacune de tes plateformes.</p>
  <div style="width:150px;height:150px;border-radius:50%;margin:10px auto;background:var(--degrade);display:grid;place-items:center;color:#fff;font-size:44px;box-shadow:0 20px 40px -20px rgba(27,110,98,.8)">📷</div>
  <p class="x" style="font-size:12.5px">Touche pour scanner un article</p></div>
  <div class="bande">Ce que tu prépares ici attend dans ton compte : ton ordinateur le publie dès que Chrome est ouvert avec l'extension.</div>
  ${onglets("lens")}`,
};
E["vide-reglages-plateformes"] = {
  titre: "Réglages › Plateformes", change: "Plus de « pas encore vérifié » ×4 : chaque ligne porte son état vrai parmi quatre mots (Connectée · À connecter · À finir · À autoriser) et son geste.",
  html: `<div class="entete" style="margin-bottom:6px"><span style="font-weight:700">‹ Réglages</span></div><h1 class="t">Mes plateformes</h1>
  <div class="carte">
    <div class="ligne">${logo("vinted")}<div class="txt"><b>Vinted</b><span>@marie_vide · vue dans Chrome</span></div>${pastille("fait", "Connectée")}</div>
    <div class="ligne">${logo("leboncoin")}<div class="txt"><b>Leboncoin</b><span>Connecte-toi sur ton ordinateur</span></div>${pastille("a_toi", "À connecter")}</div>
    <div class="ligne">${logo("ebay")}<div class="txt"><b>eBay</b><span>Relié · politiques à finir chez eBay</span></div>${pastille("a_toi", "À finir")}</div>
    <div class="ligne">${logo("beebs")}<div class="txt"><b>Beebs</b><span>Connecte-toi sur ton ordinateur</span></div>${pastille("a_toi", "À connecter")}</div>
    <div class="ligne">${logo("depop")}<div class="txt"><b>Depop</b><span>Une autorisation dans l'extension</span></div>${pastille("a_toi", "À autoriser")}</div>
  </div>
  <p class="x" style="margin-top:12px;font-size:12.5px">Ces états viennent de l'extension sur ton ordinateur. Touche une ligne pour voir le geste.</p>`,
};
E["vide-recherche"] = {
  titre: "Recherche sans résultat", change: "Un « Aucun article » devient une phrase qui propose le geste utile (élargir, ou créer).",
  html: `${entete()}<h1 class="t">Mon stock</h1><div class="carte" style="padding:10px 14px;margin-bottom:12px;color:var(--ink2);font-size:13.5px">🔍 veste cuir</div>
  <div class="vide"><div class="ico">🔍</div><b>Rien pour « veste cuir »</b><span>Aucun de tes 12 articles ne porte ces mots. Essaie un mot seul, ou crée l'article.</span><button class="btn sec">Effacer la recherche</button><button class="lien">Créer « veste cuir »</button></div>
  ${onglets("stock")}`,
};
E["vide-popup"] = {
  titre: "Popup de l'extension, à l'installation", change: "Cinq « Vérifier » → une seule phrase et un seul geste. Les plateformes n'apparaissent qu'une fois vues ; Depop est dite avec son pourquoi.",
  html: `<p class="kicker">Ordinateur · Chrome</p><h1 class="t" style="font-size:20px">Le popup, juste installé</h1>
  <div class="popup"><div class="tete">FillSell <span class="pill">Connectée · Marie</span></div><div class="corps">
    <div class="vide" style="padding:18px 14px"><div class="ico" style="width:44px;height:44px;font-size:20px">✓</div><b style="font-size:14px">C'est bon, ton ordinateur est prêt</b><span style="font-size:12.5px">Tout se pilote depuis l'app. Ici tu verras ce qui part, et ce qui attend un geste.</span></div>
    <div class="carte"><div class="ligne" style="min-height:48px">${logo("vinted", true)}<div class="txt"><b style="font-size:13px">Vinted</b><span>@marie_vide</span></div>${pastille("fait", "Connectée")}</div>
    <div class="ligne" style="min-height:48px">${logo("depop", true)}<div class="txt"><b style="font-size:13px">Depop</b><span>Une autorisation, une fois</span></div><button class="btn sec" style="width:auto;min-height:34px;padding:0 10px;font-size:12px">Autoriser</button></div></div>
    <div style="font-size:12px;color:var(--ink2)">Leboncoin, eBay, Beebs : dès que tu t'y connectes dans ce Chrome, elles apparaissent ici.</div>
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2)"><span class="pastille en_file"><i></i>0 en file</span><span style="flex:1"></span><button class="btn sec" style="width:auto;min-height:34px;padding:0 10px;font-size:12px">Ouvrir l'appli</button></div>
  </div></div>`,
};
E["vide-file"] = {
  titre: "Ta file, vide", change: "La feuille « Ta file » vide dit ce qu'elle montrera, avec les quatre groupes nommés d'avance.",
  html: `<div class="entete" style="margin-bottom:6px"><span style="font-weight:700">Ta file</span><span class="spacer"></span><span>✕</span></div>
  <div class="vide"><div class="ico">🧵</div><b>Rien en cours ni en file</b><span>Chaque publication, republication ou retrait passe ici, dans l'ordre réel de départ : En cours · En file · En pause (avec la raison) · À toi de jouer. Ce qui est fait n'y reste pas.</span></div>`,
};

// D. ATTENTES
E["attentes-file"] = {
  titre: "Ta file (pleine)", change: "Quatre groupes, six mots, zéro heure : chaque ligne dit son état et sa raison en une phrase. L'ordre est celui où ça partira vraiment.",
  html: `<div class="entete" style="margin-bottom:2px"><span style="font-weight:700">Ta file</span><span class="spacer"></span><span>✕</span></div><p class="x" style="font-size:12.5px;margin-bottom:6px">2 en cours ou en file · 2 en pause · 1 à toi de jouer</p>
  <div class="groupe">En cours</div>
  <div class="job" style="border-color:rgba(47,158,144,.45)"><div class="vignette" style="background:linear-gradient(140deg,#E8E2D4,#F3EFE6)"></div><div class="txt"><b>Veste en jean Levi's, M</b><small>38 € · Publication sur Leboncoin</small><p>${pastille("en_cours")} — dépôt sur Leboncoin, dans ton Chrome.</p></div></div>
  <div class="groupe">En file · 1</div>
  <div class="job"><div class="vignette" style="background:linear-gradient(140deg,#E1E7DE,#F0F3EC)"></div><div class="txt"><b>Poussette Yoyo</b><small>240 € · Publication sur Vinted</small><p>${pastille("en_file")} — elle partira à son tour.</p></div></div>
  <div class="groupe">En pause · 2</div>
  <div class="job"><div class="vignette" style="background:linear-gradient(140deg,#DCE3E9,#EDF1F4)"></div><div class="txt"><b>Console Switch + 2 jeux</b><small>185 € · Republication sur Vinted</small><p>${pastille("en_pause")} (limite du jour) — ton annonce est intacte, elle repart toute seule.</p></div></div>
  <div class="job"><div class="vignette" style="background:linear-gradient(140deg,#E8E2D4,#F3EFE6)"></div><div class="txt"><b>Lot de 6 bodies 3 mois</b><small>12 € · Publication sur Beebs</small><p>${pastille("en_pause")} — nouvel essai automatique, rien à faire.</p></div></div>
  <div class="groupe">À toi de jouer · 1</div>
  <div class="job" style="border-color:var(--ambre-bord)"><div class="vignette" style="background:linear-gradient(140deg,#F3E4D8,#FBF2EA)"></div><div class="txt"><b>Casque Sony WH-1000XM4</b><small>160 € · Publication sur eBay</small><p class="a_toi">${pastille("a_toi")} — eBay demande le rayon : choisis-le.</p><div style="margin-top:8px"><button class="btn sec" style="min-height:40px;font-size:13px">Répondre</button></div></div></div>`,
};
E["attentes-job"] = {
  titre: "Suivi d'un job", change: "Plus de pourcentage qui glisse : les étapes réelles, celle où on en est qui respire, et l'état en un mot. « Depuis » (passé) est permis ; aucune heure à venir.",
  html: `<div class="entete" style="margin-bottom:6px"><span style="font-weight:700">‹ Mon stock</span></div>
  <div class="job" style="padding:12px"><div class="vignette" style="width:56px;height:56px;background:linear-gradient(140deg,#DCE3E9,#EDF1F4)"></div><div class="txt"><b style="font-size:15px">Console Switch + 2 jeux</b><small>185 € · Republication sur Leboncoin</small><p>${pastille("en_cours")} — hors ligne le temps de la remise en ligne</p></div></div>
  <div class="carte" style="padding:6px 14px;margin-top:10px">
    <div class="etape fait"><span class="rond">✓</span><div class="txt"><b>Copie complète de ton annonce</b><span>Photos, texte, prix : en sécurité chez nous.</span></div></div>
    <div class="etape fait"><span class="rond">✓</span><div class="txt"><b>Ancienne annonce retirée</b><span>Depuis 14:02.</span></div></div>
    <div class="etape ici"><span class="rond">3</span><div class="txt"><b>Remise en ligne sur Leboncoin</b><span>Dans ton Chrome. Les gestes sont espacés, comme le ferait une vraie personne.</span></div></div>
    <div class="etape"><span class="rond">4</span><div class="txt"><b>Fait</b><span>De retour en tête sur Leboncoin.</span></div></div>
  </div>
  <div class="bande" style="margin-top:12px">Rien à faire de ton côté. Si Chrome se ferme, elle reprend là où elle en est à la prochaine ouverture.</div>
  ${pied(`<button class="btn sec">Toute la file</button>`)}`,
};
E["attentes-synchro"] = {
  titre: "Synchroniser (en cours)", change: "Plus « Environ 3 min » : les plateformes une à une, avec leur état réel, et ce qui se passe derrière (le rangement).",
  html: `${entete()}<h1 class="t">Mon stock</h1>
  <div class="carte" style="padding:14px"><div style="display:flex;align-items:center;gap:10px"><b style="font-size:14px">Synchronisation</b><span class="spacer" style="flex:1"></span><span style="font-size:12px;color:var(--ink2)">2 plateformes sur 5</span></div>
  <div style="height:6px;border-radius:999px;background:var(--chip);margin:10px 0;overflow:hidden;position:relative"><span style="position:absolute;inset:0;background:var(--degrade);transform-origin:left;transform:scaleX(.4)"></span></div>
  <div class="ligne" style="padding:8px 0;min-height:40px">${logo("vinted", true)}<div class="txt"><b style="font-size:13px">Vinted</b></div>${pastille("fait", "41 annonces")}</div>
  <div class="ligne" style="padding:8px 0;min-height:40px">${logo("leboncoin", true)}<div class="txt"><b style="font-size:13px">Leboncoin</b></div>${pastille("fait", "12 annonces")}</div>
  <div class="ligne" style="padding:8px 0;min-height:40px;background:var(--menthe);margin:0 -14px;padding:8px 14px">${logo("ebay", true)}<div class="txt"><b style="font-size:13px">eBay</b></div>${pastille("en_cours", "lecture · 6 sur 20")}</div>
  <div class="ligne" style="padding:8px 0;min-height:40px">${logo("beebs", true)}<div class="txt"><b style="font-size:13px">Beebs</b></div>${pastille("en_file")}</div>
  <div class="ligne" style="padding:8px 0;min-height:40px">${logo("depop", true)}<div class="txt"><b style="font-size:13px">Depop</b></div>${pastille("a_toi", "À autoriser")}</div>
  <p style="margin:10px 0 0;font-size:12px;color:var(--ink2)">Ton ordinateur lit tes annonces ; chaque annonce est comparée à ton stock pour ne rien créer en double.</p></div>
  ${onglets("stock")}`,
};

// ── L'index et la navigation ─────────────────────────────────────────────────
const GROUPES = [
  ["Onboarding — de l'inscription à la première publication", ["onboarding-1", "onboarding-2", "onboarding-3", "onboarding-4", "onboarding-5", "onboarding-6", "onboarding-7", "onboarding-8"]],
  ["Connexion de chaque plateforme", ["plateformes-vinted", "plateformes-leboncoin", "plateformes-ebay", "plateformes-beebs", "plateformes-depop"]],
  ["États vides", ["vide-tableau", "vide-stock", "vide-ventes", "vide-stats", "vide-lens", "vide-reglages-plateformes", "vide-recherche", "vide-popup", "vide-file"]],
  ["Attentes", ["attentes-file", "attentes-job", "attentes-synchro"]],
];
const ORDRE = GROUPES.flatMap((g) => g[1]);
const app = document.getElementById("app");

function rendreIndex() {
  document.title = "Maquettes FillSell";
  app.innerHTML = `<main class="accueil"><h1>Maquettes de la refonte</h1>
  <p class="sous">Nuit du 15 au 16 octobre 2026 — onboarding, connexion des plateformes, états vides, attentes. Chaque écran est cliquable, pensé téléphone d'abord, avec les six mots d'état (En file · En cours · Fait · À toi de jouer · En pause · Arrêtée) et aucun temps estimé. Sous chaque écran : ce qui change par rapport à aujourd'hui, et pourquoi.</p>
  ${GROUPES.map(([titre, cles]) => `<h2>${titre}</h2><div class="grille">${cles.map((c, i) => `<a class="tuile" href="#${c}"><span class="num">${i + 1} / ${cles.length}</span><b>${E[c].titre}</b><span>${E[c].change}</span></a>`).join("")}</div>`).join("")}
  </main>`;
}
function rendreEcran(cle) {
  const e = E[cle];
  if (!e) { location.hash = "#"; return; }
  const i = ORDRE.indexOf(cle);
  const prec = i > 0 ? ORDRE[i - 1] : null, suiv = i < ORDRE.length - 1 ? ORDRE[i + 1] : null;
  document.title = `${e.titre} · Maquettes FillSell`;
  app.innerHTML = `<div class="scene"><div class="barre-haut"><a href="#">‹ Toutes les maquettes</a><span class="spacer"></span><span>${i + 1} / ${ORDRE.length}</span></div>
  <div class="tel"><div class="ecran" key="${cle}">${e.html}</div></div>
  <div class="change"><b>Ce qui change :</b> ${e.change}</div>
  <div class="nav-ecran">${prec ? `<a href="#${prec}">‹ Précédent</a>` : `<span style="flex:1"></span>`}${suiv ? `<a href="#${suiv}">Suivant ›</a>` : `<a href="#">Fin · retour à la liste</a>`}</div></div>`;
  window.scrollTo(0, 0);
}
function router() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) rendreIndex(); else rendreEcran(h);
}
window.addEventListener("hashchange", router);
router();
