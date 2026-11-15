// (15/11/2026, point 1 du lot (2) de Nico) DEPOP, PLATEFORME PROPOSÉE DANS LES MAILS : la seule différence admise.
//
// Depop est entrée dans les plateformes PROPOSÉES des mails (_shared/plateformes.ts, SLUGS_PLATEFORMES_PROPOSEES ;
// verrou : selftest:mails-plateformes-completes). Les verrous qui comparent un mail, À L'OCTET, au rendu d'un gabarit
// plus ancien (mails-cloud-sans-ordinateur → 3cac01f, deja-vendu-mail → 72d0135, ventes-prix-inconnu → 3145ec7)
// n'admettent que CETTE différence. retirerDepopProposee(html) la retire, exactement, et rien d'autre :
//   · le pied de carte de tous les mails : « … &middot; Beebs &middot; Depop » → « … &middot; Beebs » ;
//   · la phrase du mail de bienvenue : « eBay, Beebs et Depop » → « eBay et Beebs » (EN : « and ») ;
//   · le bandeau de logos : la cellule de Depop (après Beebs), et les deux classes posées pour le téléphone
//     (fs-logo-cell, fs-logo) ;
//   · la règle du téléphone qui ramène ces logos à 44 px (CSS_LOGOS_TELEPHONE, dans le <style> de chaque mail).
// Elle rend aussi le compte de chaque retrait (n), pour qu'un verrou vérifie que l'insertion était bien là.

/** Les lignes ajoutées au bloc « @media only screen and (max-width:620px) » du gabarit, juste après .fs-hide-sm. */
export const CSS_LOGOS_TELEPHONE =
  "    /* (15/11/2026) Le bandeau des logos de plateformes : 44 px sur téléphone, pour qu'il tienne (logosPlateformes). */\n" +
  "    .fs-logo-cell { padding-left:4px !important; padding-right:4px !important; }\n" +
  "    .fs-logo { width:44px !important; height:44px !important; border-radius:10px !important; }\n";

const CELLULE_DEPOP =
  /<td valign="middle" class="fs-logo-cell" style="padding:0 7px 0 7px;"><img src="https:\/\/fillsell\.app\/email\/logo-depop\.png" width="52" height="52" alt="Depop" class="fs-logo" style="[^"]*"><\/td>/g;

export function retirerDepopProposee(html) {
  let h = String(html);
  const n = { css: 0, pied: 0, phrase: 0, cellule: 0, classes: 0 };
  const remplacer = (cle, de, vers) => {
    const morceaux = h.split(de);
    n[cle] += morceaux.length - 1;
    h = morceaux.join(vers);
  };
  remplacer("css", CSS_LOGOS_TELEPHONE, "");
  remplacer("pied", "Beebs &middot; Depop", "Beebs");
  remplacer("phrase", "eBay, Beebs et Depop", "eBay et Beebs");
  remplacer("phrase", "eBay, Beebs and Depop", "eBay and Beebs");
  n.cellule = (h.match(CELLULE_DEPOP) ?? []).length;
  h = h.replace(CELLULE_DEPOP, "");
  remplacer("classes", ' class="fs-logo-cell"', "");
  remplacer("classes", ' class="fs-logo"', "");
  return { html: h, n };
}
