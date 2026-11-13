// ═══════════════════════════════════════════════════════════════════════════
// LES MESSAGES ÉCRITS EN FRANÇAIS PAR LE SERVEUR, LUS EN ANGLAIS (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// (Lot « Ouverture du Cloud », phase 3 point 1 — suite, décision de Nico) Le serveur, les fonctions SQL et l'extension
// écrivent en base des phrases en français (cross_post_jobs.error : arrêt à ta demande, republication, retrait, refus
// Beebs « même contenu », compte eBay pas prêt… ; motif d'une vente refusée renvoyé par check-listing-status ;
// erreurs des fonctions eBay ; raisons des fonctions SQL : « Le job a changé entre-temps… »). Elles sont montrées plus
// tard, à une personne dont l'app est peut-être en anglais.
// LA RÈGLE : la base ne change pas (le support lit le texte d'origine) ; la traduction se fait À L'AFFICHAGE, par une
// table de correspondance français → anglais — phrase exacte, ou motif pour les phrases à variables (plateforme,
// numéro, date, heure) — appliquée SEULEMENT quand la langue est l'anglais. En français, `traduireMessageServeur`
// rend le texte reçu lui-même (même chaîne, octet pour octet). Un message inconnu reste tel quel : jamais une
// traduction devinée, jamais un générique à sa place.
// Les valeurs des plateformes citées dans une phrase (nom d'un champ Beebs, libellé d'un bouton Leboncoin, motif
// rendu par eBay) restent celles de la plateforme.
// Branché sur : humanizeJobError et jobErrorSansFaussePromesse (utils/shared.js), le toast (components/Toast.jsx), le
// client des fonctions eBay (utils/ebayCompte.js), la feuille « Créer mes conditions eBay », le refus d'une
// republication (utils/republication.js), l'écran de rattachement, la modale de suppression d'une vente (App.jsx).
// Preuve : scripts/messages-serveur-anglais-selftest.mjs.

const ECHAPPER = /[.*+?^${}()|[\]\\]/g;
// Un littéral de la table : échappé ; apostrophe droite ou typographique ; espaces souples (le débruitage de
// humanizeJobError retire l'espace avant « ; » ou « . »).
const litteral = (s) => s.replace(ECHAPPER, '\\$&').replace(/['’]/g, "['’]").replace(/ +/g, '\\s*');

// Les variables d'une phrase (groupes nommés, lus par la traduction).
const PLATEFORMES = 'Vinted|Leboncoin|Beebs|eBay|Depop|Opla';
const pf = (nom = 'p') => `(?<${nom}>${PLATEFORMES})`;
const num = (nom = 'n') => `(?<${nom}>\\d+)`;
const date = (nom = 'd') => `(?<${nom}>\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)`;
const heure = (nom = 'h') => `(?<${nom}>\\d{1,2}(?:h\\d{2}|h|:\\d{2}))`;
const texte = (nom = 't') => `(?<${nom}>[^»]+?)`;
const libre = (nom = 'x') => `(?<${nom}>.+?)`;
const ou = (nom, ...choix) => `(?<${nom}>${choix.map(litteral).join('|')})`;
const option = (nom, s) => `(?<${nom}>${litteral(s)})?`;
const brut = (re) => re; // un morceau de motif déjà écrit en expression régulière

/** Un motif ancré : le gabarit est du texte français, ses `${…}` des groupes nommés. */
function m(parties, ...trous) {
  let src = '';
  parties.forEach((p, i) => { src += litteral(p); if (i < trous.length) src += trous[i]; });
  return new RegExp(`^${src}$`);
}

// « 10h05 », « 10h », « 10:05 » → « 10:05 », « 10:00 ».
const heureEn = (h) => {
  const x = String(h ?? '').match(/^(\d{1,2})(?:h(\d{2})?|:(\d{2}))$/);
  return x ? `${x[1]}:${x[2] ?? x[3] ?? '00'}` : String(h ?? '');
};

// Pays d'un site eBay, comme _shared/ebay-hors-france.js les écrit (français → anglais).
const PAYS_EBAY_EN = {
  'Italie': 'Italy', 'Espagne': 'Spain', 'Allemagne': 'Germany', 'Autriche': 'Austria', 'Belgique': 'Belgium',
  'Pays-Bas': 'the Netherlands', 'Irlande': 'Ireland', 'Royaume-Uni': 'the UK', 'États-Unis': 'the US', 'Suisse': 'Switzerland',
  'Pologne': 'Poland', 'Canada': 'Canada', 'Australie': 'Australia', 'Hong Kong': 'Hong Kong', 'Inde': 'India',
  'Malaisie': 'Malaysia', 'Philippines': 'the Philippines', 'Singapour': 'Singapore',
};
// Les étapes déjà faites que liste ebay-account (« déjà fait : … »).
const FAITS_EBAY_EN = { 'conditions de vente activées': 'selling policies turned on', 'paiement': 'payment', 'retours': 'returns', 'livraison': 'shipping' };
const faitsEn = (s) => String(s).split(/\s*,\s*/).map((x) => FAITS_EBAY_EN[x] ?? x).join(', ');

const LIMITES_EN = "This listing doesn't count toward your limits.";
const VENTE_AILLEURS_EN = 'If the item is sold elsewhere, record the sale from its item.';

// ── LA TABLE ─────────────────────────────────────────────────────────────────
// [motif, anglais] — l'anglais est une chaîne, ou une fonction des groupes nommés. L'ordre compte peu : chaque motif
// est ancré sur la phrase entière.
const TABLE = [
  // ── Arrêts et annulations demandés par la personne (utils/annulerFile.js, publication/lot/regles.js,
  //    utils/abandonPlateforme.js, StockTab « Oublier », _shared/republication-retrait.js, _shared/file-pause.js) ──
  [m`Annulée à ta demande — ton annonce est restée en ligne.`, 'Cancelled at your request — your listing stayed online.'],
  [m`Annulée à ta demande — rien n'a été publié.`, 'Cancelled at your request — nothing was listed.'],
  [m`Arrêtée à ta demande — ton annonce est restée en ligne.`, 'Stopped at your request — your listing stayed online.'],
  [m`Arrêtée à ta demande — rien n'a été publié.`, 'Stopped at your request — nothing was listed.'],
  [m`Arrêtée à ta demande : rien à faire.`, 'Stopped at your request: nothing to do.'],
  [m`Arrêté à ta demande — tu as abandonné ${pf()} pour cet article.${option('rien', " Rien n'a été publié, rien n'a été décompté.")} Tu peux le republier là-bas quand tu veux.`,
    (g) => `Stopped at your request — ${g.p} was abandoned for this item.${g.rien ? ' Nothing was published, nothing was charged.' : ''} You can publish it there again at any time.`],
  [m`Oubliée à ta demande — ${pf()} n'a jamais confirmé la mise en ligne de cette annonce. Rien n'est retiré là-bas ; tu peux la republier quand tu veux.`,
    (g) => `Forgotten at your request — ${g.p} never confirmed this listing went live. Nothing is removed there; you can publish it again whenever you want.`],
  [m`Annonce retirée à ta demande : cette republication n'a plus d'objet. Rien n'a été retiré par elle, rien n'a été recréé.`,
    'Listing removed at your request: this repost no longer applies. It removed nothing and recreated nothing.'],
  [m`En pause à ta demande : ta republication repartira quand tu reprendras ta file. Ton annonce est toujours en ligne.`,
    'Paused at your request: your repost goes out again when you resume your queue. Your listing is still online.'],

  // ── Clôtures qui ne sont pas des ventes (republication en cours, retrait ciblé, rattachement défait…) ──
  [m`Annonce en cours de republication (supprimée puis recréée pour remonter dans le fil) — pas une vente`,
    'Listing being reposted (deleted then recreated to move back up the feed) — not a sale'],
  [m`Annonce en cours de republication sur ${pf()} (retirée puis redéposée pour remonter dans le fil) — pas une vente`,
    (g) => `Listing being reposted on ${g.p} (removed then listed again to move back up the feed) — not a sale`],
  [m`Annonce retirée par le vendeur (${ou('quoi', "retrait ciblé depuis l'app", "confirmé dans l'app")}) — pas une vente`,
    (g) => `Listing removed by the seller (${g.quoi.startsWith('retrait') ? 'targeted removal from the app' : 'confirmed in the app'}) — not a sale`],
  [m`Réponse dans l'app : « je l'ai retirée moi-même » — pas une vente`, 'Answer in the app: “I removed it myself” — not a sale'],
  [m`Rattachement fait à la main le ${date()} (support), défait pour être rejugé par le moteur — pas une vente`,
    (g) => `Link made by hand on ${g.d} (support), undone to be judged again by the matching — not a sale`],
  [m`Rattachement défait par l'utilisateur — pas une vente`, 'Link undone by the user — not a sale'],
  [m`Annonce ${pf()} remplacée par une remise en ligne (annonce ${num()}) — pas une vente`,
    (g) => `${g.p} listing replaced by a relisting (listing ${g.n}) — not a sale`],
  [m`Annonce supprimée par eBay (pas par le vendeur) — pas une vente`, 'Listing deleted by eBay (not by the seller) — not a sale'],
  // La phrase que texteSuiviLisible (utils/shared.js) écrit en français est aussi écrite en base : sa version anglaise.
  [m`Annonce ${num('a')} remplacée par une republication (l'article vit désormais sur l'annonce ${num('b')}) : l'ancienne publication est close, ce n'est pas une vente.`,
    (g) => `Listing ${g.a} was replaced by a relisting (the item now lives on listing ${g.b}): the old publication is closed, it is not a sale.`],
  [m`Fiche supprimée du stock, annonce laissée en ligne — aucun retrait demandé`, 'Item deleted from stock, listing left online — no removal requested'],
  [m`Annulé : l'article a été supprimé du stock`, 'Cancelled: the item was deleted from stock'],
  [m`Cet exemplaire a été vendu ; cette publication est arrêtée.`, 'This copy was sold; this listing is stopped.'],
  [m`Cet article a été réuni avec une autre fiche : ce geste n'a plus d'objet. Rien n'a été retiré, ton annonce est intacte.`,
    'This item was merged with another item: this action no longer applies. Nothing was removed, your listing is intact.'],
  [m`Annulé : l'article est vendu ou n'est plus en ligne, il n'y a rien à publier ni à republier.`,
    'Cancelled: the item is sold or no longer online, there is nothing to publish or repost.'],

  // ── Vérifications de l'annonce (veilleur) ──
  // Le brut d'un job vivant (jobErrorSansFaussePromesse) peut porter « nouvelle vérification dans 3 h » : en anglais,
  // aucune heure promise (règle du 16/10), la même phrase que le passage suivant.
  [m`Impossible de vérifier cette annonce sur ${pf()} : sa page n'a pas répondu comme prévu.${brut(`(?<suite>${litteral(" L'annonce n'a pas été touchée ; nouvelle vérification ")}(?:${litteral('à un prochain passage')}|dans\\s*\\d+\\s*h)\\.)?`)}`,
    (g) => `We could not check this listing on ${g.p}: its page did not answer as expected.${g.suite ? ' The listing was not touched; we will check again at a later pass.' : ''}`],

  // ── Doublons et confirmations de dépôt ──
  [m`Ce dépôt n'a pas été mis en ligne par ${pf()} : ton article y est DÉJÀ en ligne sous l'annonce ${num()}, publiée par ton compte FillSell relié — ${brut('\\k<p>')} refuse les doublons. Rien à refaire, rien n'est vendu.`,
    (g) => `${g.p} did not put this listing online: your item is ALREADY live there under listing ${g.n}, published by your linked FillSell account — ${g.p} refuses duplicates. Nothing to redo, nothing is sold.`],
  [m`Ce dépôt n'a jamais été mis en ligne par ${pf()} (refusé à la vérification ou retiré), mais ton article y est en ligne sous l'annonce ${num()} : rien à refaire, rien n'est vendu.`,
    (g) => `${g.p} never put this listing online (refused at review or removed), but your item is live there under listing ${g.n}: nothing to redo, nothing is sold.`],
  [m`Ce dépôt n'a jamais été retrouvé dans tes annonces ${pf()}, mais ton article y est en ligne sous l'annonce ${num()}${brut(`(?: \\(vue au relevé du ${date()} à ${heure()}\\))?`)} : rien à refaire, rien n'est vendu.`,
    (g) => `This listing was never found among your ${g.p} listings, but your item is live there under listing ${g.n}${g.d ? ` (seen in the scan of ${g.d} at ${heureEn(g.h)})` : ''}: nothing to redo, nothing is sold.`],
  [m`Cette annonce ${pf()} n'est plus en ligne ; ton article est en vente sur ${brut('\\k<p>')} sous l'annonce ${num()} de ton compte FillSell relié. Ce n'est pas une vente — rien à refaire.`,
    (g) => `This ${g.p} listing is no longer online; your item is for sale on ${g.p} under listing ${g.n} of your linked FillSell account. This is not a sale — nothing to redo.`],
  [m`Cette annonce ${pf()} n'est plus en ligne ; ton article reste en vente sur ${brut('\\k<p>')} sous l'annonce ${num()} de ton compte FillSell relié (même boutique). Rien à refaire.`,
    (g) => `This ${g.p} listing is no longer online; your item is still for sale on ${g.p} under listing ${g.n} of your linked FillSell account (same shop). Nothing to redo.`],
  [m`Ton article est en ligne sur ${pf()} sous l'annonce ${num()} : rien à refaire, rien n'a été redéposé.`,
    (g) => `Your item is live on ${g.p} under listing ${g.n}: nothing to redo, nothing was listed again.`],
  [m`Publication arrêtée : cet article est déjà en ligne sur cette plateforme.`, 'Listing stopped: this item is already live on this platform.'],
  [m`Publication arrêtée : cet article est vendu.`, 'Listing stopped: this item is sold.'],
  [m`Doublon : un retrait est déjà en cours pour cette annonce.`, 'Duplicate: a removal is already in progress for this listing.'],
  [m`Doublon : une autre publication de cet article sur cette plateforme est déjà en cours.`, 'Duplicate: another listing of this item on this platform is already in progress.'],
  [m`Doublon : une autre publication ${pf()} du même article est déjà en cours.`, (g) => `Duplicate: another ${g.p} listing of the same item is already in progress.`],
  [m`Article vendu — dépôt sans objet.`, 'Item sold — listing no longer needed.'],
  [m`Article déjà en ligne sur ${pf()} — dépôt sans objet.`, (g) => `Item already live on ${g.p} — listing no longer needed.`],
  [m`Publication jamais vue en ligne sur ${pf()} : deux relevés complets de ton compte ne l'ont pas trouvée, et nous n'avons jamais eu son numéro. Cette publication ne compte pas dans tes limites.`,
    (g) => `Listing never seen online on ${g.p}: two full scans of your account did not find it, and we never got its number. ${LIMITES_EN}`],
  [m`Publication non confirmée : ton annonce n'a pas pu être retrouvée en ligne sur ${pf()} — on n'a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi.${option('limites', ' Cette publication ne compte pas dans tes limites.')} ⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur ${brut('\\k<p>')} : si elle y est déjà, republier en créerait une deuxième.`,
    (g) => `Listing not confirmed: your listing could not be found online on ${g.p} — we never managed to get its link, so we can neither track its sale nor remove it for you.${g.limites ? ` ${LIMITES_EN}` : ''} ⚠️ BEFORE REPOSTING, check your listings on ${g.p}: if it's already there, reposting would create a second one.`],

  // ── Annonce plus en ligne, republication sans objet ──
  [m`Cette annonce n'est plus en ligne sur ${pf()} (vendue, retirée ou supprimée depuis sa dernière lecture). FillSell n'a rien retiré. Si tu l'as vendue, marque-la vendue ; sinon remets-la en ligne${option('sur', ' sur ')}${brut('(?:\\k<p>)?')}, puis synchronise${option('dressing', ' ton dressing')}.${option('fin', ' FillSell ne la vérifie plus et ne la republie plus.')}`,
    (g) => `This listing is no longer online on ${g.p} (sold, removed or deleted since it was last read). FillSell removed nothing. If you sold it, mark it sold; otherwise put it back online${g.sur ? ` on ${g.p}` : ''}, then sync${g.dressing ? ' your wardrobe' : ''}.${g.fin ? ' FillSell no longer checks or reposts it.' : ''}`],
  [m`Cette annonce n'est plus en ligne sur ${pf()} — republication ${ou('quoi', 'annulée avant tout geste', 'arrêtée')}, rien n'a été supprimé.`,
    (g) => `This listing is no longer online on ${g.p} — repost ${g.quoi.startsWith('annul') ? 'cancelled before any action' : 'stopped'}, nothing was deleted.`],
  [m`Cette annonce n'est plus en ligne sur ${pf()} : on a vérifié, sa page n'existe plus (vendue, retirée ou supprimée). FillSell n'a rien supprimé et la republication s'arrête là. Si tu l'as vendue, marque-la vendue dans ton stock.`,
    (g) => `This listing is no longer online on ${g.p}: we checked, its page no longer exists (sold, removed or deleted). FillSell deleted nothing and the repost stops here. If you sold it, mark it sold in your stock.`],
  [m`Republication arrêtée : l'annonce n'est plus en ligne sur ${pf()}. Rien n'a été recréé.`, (g) => `Repost stopped: the listing is no longer online on ${g.p}. Nothing was recreated.`],
  [m`Republication annulée : cet article est vendu. Rien n'a été supprimé ni recréé.`, 'Repost cancelled: this item is sold. Nothing was deleted or recreated.'],
  [m`Republication arrêtée : cet article est vendu. Rien n'a été touché sur ${pf()}.`, (g) => `Repost stopped: this item is sold. Nothing was touched on ${g.p}.`],
  [m`Republication sans objet : l'article est vendu. Rien n'a été retiré.`, 'Repost no longer needed: the item is sold. Nothing was removed.'],
  [m`Article vendu le ${date()} : cette republication sur ${pf()} n'a plus d'objet. Rien n'a été retiré ni publié.`,
    (g) => `Item sold on ${g.d}: this repost on ${g.p} no longer applies. Nothing was removed or published.`],
  [m`Ton annonce ${pf()} était déjà remise en ligne (annonce n° ${num()}) : cette republication n'a plus d'objet. Rien n'a été retiré ni recréé.`,
    (g) => `Your ${g.p} listing was already back online (listing no. ${g.n}): this repost no longer applies. Nothing was removed or recreated.`],
  [m`Republication annulée : ton annonce Leboncoin est vendue (la page affiche « Article vendu »). Rien n'a été retiré ; la vente est suivie à part, comme les autres.`,
    'Repost cancelled: your Leboncoin listing is sold (the page shows “Article vendu”). Nothing was removed; the sale is tracked separately, like the others.'],
  [m`Commande Vinted annulée : l'article est revenu dans ton stock. Remets-le en vente d'un appui dans FillSell (carte « Vente annulée »).`,
    'Vinted order cancelled: the item is back in your stock. Put it back on sale in one tap in FillSell (“Sale cancelled” card).'],
  [m`Commande Vinted annulée : l'article est revenu dans ton stock. L'annonce Vinted reste fermée : remets-le en vente quand tu veux.`,
    'Vinted order cancelled: the item is back in your stock. The Vinted listing stays closed: put it back on sale whenever you want.'],

  // ── Retraits ──
  [m`Annonce déjà retirée de ${pf()} : le n° ${num()} n'apparaît dans aucun des deux derniers relevés complets de ${brut('(?<b>@\\S+?)')}. Rien n'a été fait sur ${brut('\\k<p>')}, rien n'est à faire.`,
    (g) => `Listing already removed from ${g.p}: no. ${g.n} appears in neither of the last two full scans of ${g.b}. Nothing was done on ${g.p}, nothing to do.`],
  [m`Rien à retirer : l'annonce n° ${num()} n'apparaît plus sur ton compte ${pf()} (relevés complets du ${date('d1')} à ${heure('h1')} et du ${date('d2')} à ${heure('h2')}). Elle est déjà retirée.`,
    (g) => `Nothing to remove: listing no. ${g.n} no longer appears on your ${g.p} account (full scans of ${g.d1} at ${heureEn(g.h1)} and ${g.d2} at ${heureEn(g.h2)}). It is already removed.`],
  [m`Rien à retirer sur ${pf()} : ton compte n'y affiche aucune annonce qui pourrait être celle-ci (relevés complets du ${date('d1')} à ${heure('h1')} et du ${date('d2')} à ${heure('h2')} — chaque annonce en ligne y est reliée par son numéro à un autre article${brut('(?:, ou (?<quand>n[\'’]y est apparue que bien après ce dépôt|existait déjà avant ce dépôt d[\'’]après son numéro) \\((?<nos>n° \\d+(?:, n° \\d+)*)\\))?')}). Elle n'a jamais été mise en ligne, ou elle est déjà retirée. Cette publication ne compte pas dans tes limites.`,
    (g) => `Nothing to remove on ${g.p}: your account shows no listing there that could be this one (full scans of ${g.d1} at ${heureEn(g.h1)} and ${g.d2} at ${heureEn(g.h2)} — each live listing there is linked by its number to another item${g.nos ? `, or ${g.quand.startsWith('exist') ? 'already existed before this listing, going by its number' : 'only appeared well after this listing'} (${g.nos.replace(/n°/g, 'no.')})` : ''}). It was never put online, or it is already removed. ${LIMITES_EN}`],
  [m`Rien à retirer : tu as indiqué avoir retiré cette annonce toi-même.`, 'Nothing to remove: you said you removed this listing yourself.'],
  [m`Retrait annulé : la vente a été annulée, l'article est de nouveau disponible. Ton annonce${brut(`(?: ${pf()})?`)} reste en ligne.`,
    (g) => `Removal cancelled: the sale was cancelled, the item is available again. Your${g.p ? ` ${g.p}` : ''} listing stays online.`],
  [m`Retrait annulé le ${date()} : cette annonce n'était liée à ton article vendu que par une photo identique — jamais une preuve. Réponds à « Déjà vendu ? » dans l'app : « Oui » la retire, « Non » la laisse en ligne.`,
    (g) => `Removal cancelled on ${g.d}: this listing was only linked to your sold item by an identical photo — never a proof. Answer “Already sold?” in the app: “Yes” removes it, “No” leaves it online.`],
  [m`Retrait inutile : cette annonce est vendue sur ${pf()}, elle n'est plus en vente. Aucune requête envoyée.`,
    (g) => `Removal not needed: this listing is sold on ${g.p}, it is no longer for sale. No request sent.`],
  [m`Retrait inutile : l'article a été vendu sur cette plateforme — l'annonce vendue n'est pas touchée.`,
    'Removal not needed: the item was sold on this platform — the sold listing is not touched.'],
  [m`Beebs garde cette annonce en vérification depuis le ${date()} : elle n'est ni visible ni achetable, et Beebs ne permet pas de la supprimer pendant la vérification. FillSell la retire dès que Beebs la met en ligne — rien à faire.`,
    (g) => `Beebs has kept this listing under review since ${g.d}: it is neither visible nor buyable, and Beebs doesn't allow deleting it during the review. FillSell removes it as soon as Beebs puts it online — nothing to do.`],
  [m`L'annonce n'est pas encore visible sur ${pf()} (${brut('\\k<p>')} l'examine encore) : FillSell la retirera dès qu'elle apparaît. Nouvelle vérification automatique, rien à faire.`,
    (g) => `The listing isn't visible on ${g.p} yet (${g.p} is still reviewing it): FillSell will remove it as soon as it appears. It will be checked again automatically, nothing to do.`],

  // ── Attentes laissées trop longtemps (veilleur) ──
  [m`Cette publication ${pf()} n'a pas pu être traitée de notre côté et elle est restée en attente trop longtemps. On l'arrête ici plutôt que de la laisser sans réponse. Tu peux la relancer depuis la fiche de l'article.`,
    (g) => `This ${g.p} listing could not be processed on our side and stayed waiting too long. We are stopping it here rather than leaving it unanswered. You can relaunch it from the item.`],
  [m`Cette publication attendait une réponse depuis ${ou('duree', 'plus de deux semaines', 'plusieurs jours')} : nous l'avons arrêtée. Relance-la depuis la fiche de l'article quand tu veux.`,
    (g) => `This listing had been waiting for an answer for ${g.duree.startsWith('plusieurs') ? 'several days' : 'over two weeks'}: we stopped it. Relaunch it from the item whenever you want.`],
  [m`Cette republication attendait une réponse depuis plusieurs jours : nous l'avons arrêtée. Elle n'a rien retiré sur ${pf()}. Relance-la depuis la fiche de l'article quand tu veux.`,
    (g) => `This repost had been waiting for an answer for several days: we stopped it. It removed nothing on ${g.p}. Relaunch it from the item whenever you want.`],
  [m`Ce retrait attendait une réponse depuis plusieurs jours : nous l'avons arrêté. Si l'annonce est encore en ligne, retire-la sur la plateforme.`,
    'This removal had been waiting for an answer for several days: we stopped it. If the listing is still online, remove it on the platform.'],

  // ── Pauses, files, attentes ──
  [m`En pause, rien n'a été retiré : l'annonce ${pf()} n° ${num()} n'est plus dans ta liste au dernier relevé. FillSell ne remet pas en ligne une annonce sans savoir si elle a été vendue, retirée ou remise en ligne autrement.`,
    (g) => `Paused, nothing was removed: ${g.p} listing no. ${g.n} is no longer in your list at the last scan. FillSell doesn't put a listing back online without knowing whether it was sold, removed or relisted another way.`],
  [m`En file : ta republication passera à son tour, une à la fois. Ton annonce est toujours en ligne.`, 'Queued: your repost will go out in turn, one at a time. Your listing is still online.'],
  [m`En attente : ton annonce « ${texte()} » a été retirée et n'est pas encore revenue en ligne. Les autres republications attendent sa remise en ligne, pour ne jamais laisser deux annonces hors ligne. Rien n'a été retiré.`,
    (g) => `Waiting: your listing “${g.t}” was removed and is not back online yet. The other reposts wait until it is back online, so that two listings are never offline at once. Nothing was removed.`],
  [m`Republication en pause, rien n'a été retiré : ${pf()} n'a pas rendu cette annonce à la dernière lecture. FillSell attend le prochain relevé de ta boutique ${brut('\\k<p>')} pour savoir si elle est encore en ligne ; si elle l'est, la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».`,
    (g) => `Repost paused, nothing was removed: ${g.p} didn't return this listing at the last read. FillSell is waiting for the next scan of your ${g.p} shop to know whether it is still online; if it is, the repost will start again on its own. To go faster: “Sync”.`],
  [m`Republication automatique ${pf()} en attente de ton créneau : elle repartira à l'ouverture de ton prochain créneau (heure de Paris), si Chrome est ouvert sur ton ordinateur à ce moment-là. Ton annonce est intacte, rien n'a été retiré.`,
    (g) => `Automatic ${g.p} repost waiting for your time slot: it will start again when your next slot opens (Paris time), if Chrome is open on your computer at that moment. Your listing is intact, nothing was removed.`],
  [m`${ou('quoi', 'Republication', 'Retrait')} ${pf()} en attente : nous n'arrivons pas encore à prouver que cette annonce appartient à la boutique ${brut('\\k<p>')} ouverte dans Chrome (ton compte a peut-être plusieurs boutiques) — on ne touche à rien sans cette preuve. Si l'annonce est sur une autre de tes boutiques, connecte Chrome à celle-ci sur ${brut('(?<site>\\S+?)')}.${option('essai', ' Nouvel essai automatique, rien à faire.')}`,
    (g) => `${g.p} ${g.quoi === 'Retrait' ? 'removal' : 'repost'} waiting: we can't yet prove that this listing belongs to the ${g.p} shop open in Chrome (your account may have several shops) — we touch nothing without this proof. If the listing is on another of your shops, connect Chrome to that one on ${g.site}.${g.essai ? ' It will be tried again automatically, nothing to do.' : ''}`],
  [m`Cette annonce appartient à une autre boutique ${pf()} que celle ouverte dans Chrome. Connecte-toi à la boutique qui porte cette annonce, puis relance.`,
    (g) => `This listing belongs to another ${g.p} shop than the one open in Chrome. Sign in to the shop that holds this listing, then relaunch.`],
  [m`En pause : tu as indiqué ne pas vendre sur ${pf()}. Rien ne part sur cette plateforme. Pour la reprendre, réactive-la dans Réglages › Plateformes : cette publication repartira d'elle-même.`,
    (g) => `Paused: you said you don't sell on ${g.p}. Nothing goes out on this platform. To resume it, turn it back on in Settings › Platforms: this listing will start again on its own.`],
  [m`Ta publication est en pause, rien n'a été publié : elle repart toute seule dès que l'extension FillSell de ton ordinateur est à jour. Rien à faire.`,
    "Your listing is paused, nothing was published: it starts again on its own as soon as the FillSell extension on your computer is up to date. Nothing to do."],
  [m`On relit tes annonces ${pf()} avant de redéposer : un essai précédent a peut-être déjà ${ou('quoi', 'mis cette annonce', 'remis ton annonce')} en ligne, et elle ne doit jamais partir en double. Rien à faire de ton côté.`,
    (g) => `We're re-reading your ${g.p} listings before listing again: a previous try may already have put ${g.quoi.startsWith('mis') ? 'this listing' : 'your listing back'} online, and it must never go out twice. Nothing to do on your side.`],
  [m`En cours de lecture de ton annonce d'origine ${pf()} (texte, photos, état) : elle partira avec TON contenu dès que l'extension FillSell de ton ordinateur l'aura lue.`,
    (g) => `Reading your original ${g.p} listing (text, photos, condition): it will go out with YOUR content as soon as the FillSell extension on your computer has read it.`],
  [m`En attente de ta connexion à ${pf()} dans Chrome : la publication repartira toute seule dès que tu seras reconnecté(e).`,
    (g) => `Waiting for you to sign in to ${g.p} in Chrome: the listing will start again on its own as soon as you're signed back in.`],

  // ── Interruptions et nouveaux essais ──
  [m`${ou('quoi', 'La republication', 'La publication')} a été interrompue sur ton ordinateur (onglet fermé, mise en veille ou coupure réseau). Rien n'a été touché : on reprend au prochain passage, tu n'as rien à faire.`,
    (g) => `The ${g.quoi === 'La republication' ? 'repost' : 'listing'} was interrupted on your computer (tab closed, sleep mode or network cut). Nothing was touched: we pick it up again at the next pass, you have nothing to do.`],
  [m`Reprise après interruption : l'ordinateur qui portait cette publication ne s'est plus manifesté depuis une demi-heure. C'est remis en file et ça repartira tout seul dès que Chrome sera ouvert sur ton ordinateur.`,
    'Resumed after an interruption: the computer handling this listing stopped responding for half an hour. It is back in the queue and will start again on its own as soon as Chrome is open on your computer.'],
  [m`L'opération a été interrompue sur ton ordinateur. Elle reprend toute seule, rien à faire de ton côté.`,
    'The operation was interrupted on your computer. It resumes on its own, nothing to do on your side.'],
  [m`L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.`,
    'The operation could not complete on your computer. Relaunch it from the item whenever you like.'],
  [m`La republication n'a pas abouti. Rien n'a été touché, ton annonce est intacte. On ne sait pas encore pourquoi : on refait un essai tout seuls.`,
    "The repost didn't go through. Nothing was touched, your listing is intact. We don't know why yet: we're trying again on our own."],
  [m`${pf()} n'a pas répondu correctement pendant la republication. Ce n'est pas ton annonce : on refait un essai tout seuls.`,
    (g) => `${g.p} didn't answer properly during the repost. It's not your listing: we're trying again on our own.`],
  [m`L'onglet ${pf()} n'a plus répondu pendant la republication.`, (g) => `The ${g.p} tab stopped answering during the repost.`],
  [m`La publication n'a pas abouti après plusieurs essais automatiques${ou('etat', ", et ton annonce n'a pas été touchée.", ". Rien n'a été publié.")} Tu peux la relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous, on regarde avec toi.`,
    (g) => `The listing didn't go through after several automatic tries${g.etat.startsWith(',') ? ", and your listing wasn't touched." : '. Nothing was published.'} You can relaunch it in one click below; if it's still stuck, write to us and we'll look at it with you.`],
  [m`Republication ${pf()} mise en pause AVANT tout retrait : le prix manque dans la copie de ton annonce. Ton annonce est TOUJOURS en ligne, rien n'a été touché. Relance la republication depuis la fiche de l'article.`,
    (g) => `${g.p} repost paused BEFORE any removal: the price is missing from your listing's copy. Your listing is STILL online, nothing was touched. Relaunch the repost from the item.`],
  [m`Republication en pause AVANT toute suppression — ton annonce est intacte sur ${pf()}. ${brut('\\k<p>')} a changé son formulaire de vente : elle repartira toute seule dès que ton extension FillSell se sera mise à jour (c'est automatique). Rien à faire.`,
    (g) => `Repost paused BEFORE any deletion — your listing is intact on ${g.p}. ${g.p} changed its listing form: it will start again on its own as soon as your FillSell extension has updated (it's automatic). Nothing to do.`],

  // ── Connexion, autorisation, vérification anti-robot ──
  [m`Connexion ${pf()} requise : connecte-toi sur ${brut('(?<site>\\S+?)')} dans Chrome, sur ton ordinateur. Ton annonce est intacte, rien n'a été touché ; la republication repartira toute seule dès que tu seras connecté.`,
    (g) => `${g.p} sign-in needed: sign in on ${g.site} in Chrome, on your computer. Your listing is intact, nothing was touched; the repost will start again on its own as soon as you're signed in.`],
  [m`Connexion ${pf()} requise : reconnecte-toi à ${brut('\\k<p>')} dans Chrome, sur ton ordinateur. ${ou('etat', "Rien n'a été publié", 'Ton annonce est intacte')} ; tout repartira tout seul ensuite.`,
    (g) => `${g.p} sign-in needed: sign in to ${g.p} again in Chrome, on your computer. ${g.etat.startsWith('Rien') ? 'Nothing was published' : 'Your listing is intact'}; everything will start again on its own afterwards.`],
  [m`${pf()} attend ton autorisation pour que FillSell y dépose tes annonces. Appuie sur « Autoriser ${brut('\\k<p>')} » : c'est une seule fois, et ${ou('quoi', 'la publication repart toute seule', 'la republication repart toute seule', 'le retrait repart tout seul')}.`,
    (g) => `${g.p} is waiting for your permission for FillSell to post your listings there. Tap “Allow ${g.p}”: it's a one-time step, and the ${g.quoi.startsWith('la publication') ? 'listing' : g.quoi.startsWith('la republication') ? 'repost' : 'removal'} starts again on its own.`],
  [m`${pf()} demande une vérification anti-robot sur ton compte : tes actions ${brut('\\k<p>')} sont en pause, rien n'a été touché. Ouvre ${brut('(?<site>\\S+?)')} dans Chrome : connecte-toi à ton compte si ${brut('\\k<p>')} te le demande, et passe la vérification si elle s'affiche — tout repartira seul. Tes autres plateformes continuent normalement.`,
    (g) => `${g.p} is asking for an anti-robot check on your account: your ${g.p} actions are paused, nothing was touched. Open ${g.site} in Chrome: sign in to your account if ${g.p} asks you to, and pass the check if it shows up — everything will start again on its own. Your other platforms carry on as usual.`],
  [m`${pf()} affiche une vérification anti-robot : la page n'a pas pu être lue et aucun geste n'a été fait.`,
    (g) => `${g.p} is showing an anti-robot check: the page couldn't be read and no action was taken.`],
  [m`${pf()} a affiché une vérification anti-robot au lieu de la page attendue. Rien n'a été ${ou('quoi', 'publié', 'retiré')}, ton annonce est intacte. On réessaie plus tard, au calme — tu peux aussi ouvrir ${brut('\\k<p>')} et passer la vérification, ça ira plus vite.`,
    (g) => `${g.p} showed an anti-robot check instead of the expected page. Nothing was ${g.quoi === 'publié' ? 'published' : 'removed'}, your listing is intact. We'll try again later, quietly — you can also open ${g.p} and pass the check, it'll go faster.`],
  [m`Vinted a restreint ton compte jusqu'au ${date()}${brut('(?: \\(« [^»]* »\\))?')} : d'ici là, il n'accepte ni nouvelle annonce ni modification — de toi comme de FillSell. Rien n'a été touché, ton annonce est intacte. La republication repart toute seule dès la fin de la restriction, sans rien faire de ton côté.`,
    (g) => `Vinted has restricted your account until ${g.d}: until then, it accepts no new listing and no change — from you or from FillSell. Nothing was touched, your listing is intact. The repost starts again on its own as soon as the restriction ends, with nothing to do on your side.`],

  // ── Comptes vendeur et règles des plateformes ──
  [m`Leboncoin n'accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n'a été publié, et tes autres plateformes continuent normalement.`,
    "Leboncoin only accepts addresses in France. Your pickup address is outside France, so FillSell doesn't publish on Leboncoin for your account. Nothing was published, and your other platforms carry on as usual."],
  [m`Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : sans eux, la publication ne peut pas être validée. Complète-les sur leboncoin.fr — les champs Nom et Prénom de l'aperçu resté ouvert, ou les informations de ton compte —, puis relance la publication depuis la fiche de l'article.`,
    "Leboncoin asks for your last name and first name on your seller account (required for its secure transaction): without them, the listing can't be validated. Fill them in on leboncoin.fr — the Nom and Prénom fields of the preview left open, or your account details —, then relaunch the listing from the item."],
  [m`Leboncoin ne propose plus de dépôt gratuit sur ce compte : son dernier écran n'offre que « Valider et payer ». FillSell ne paie jamais à ta place, donc cette annonce n'est pas partie et rien ne t'a été facturé. Tes autres plateformes ne sont pas concernées.`,
    "Leboncoin no longer offers free listing on this account: its last screen only offers “Valider et payer” (confirm and pay). FillSell never pays in your place, so this listing didn't go out and you weren't charged anything. Your other platforms are not affected."],
  [m`Depop demande de terminer ta configuration de vendeur (ajouter un moyen de paiement) avant ta première mise en ligne. Fais-le une seule fois sur depop.com, sur ton ordinateur : tes publications Depop repartiront toutes seules. Rien n'a été publié ni retiré.`,
    'Depop asks you to finish your seller setup (add a payment method) before your first listing. Do it once on depop.com, on your computer: your Depop listings will start again on their own. Nothing was published or removed.'],
  [m`Republication Depop non lancée : Depop n'accepte pas les objets électriques ou électroniques (téléphones). Ton annonce Depop est intacte, rien n'a été retiré.`,
    "Depop repost not started: Depop doesn't accept electrical or electronic items (phones). Your Depop listing is intact, nothing was removed."],
  [m`Beebs n'accepte pas cette marque dans son catalogue. L'article reste en ligne sur les autres plateformes.`,
    "Beebs doesn't accept this brand in its catalogue. The item stays online on the other platforms."],
  [m`Republication Beebs mise en pause AVANT tout retrait : Beebs exige « ${texte()} » pour ce rayon et aucune valeur certaine n'a pu être posée. Ton annonce est TOUJOURS en ligne, rien n'a été touché. Choisis la valeur dans l'app : la republication repartira seule.`,
    (g) => `Beebs repost paused BEFORE any removal: Beebs requires “${g.t}” for this category and no certain value could be set. Your listing is STILL online, nothing was touched. Choose the value in the app: the repost will start again on its own.`],
  // Champs requis vides (content-scripts vinted.js / beebs.js, préfixe et consigne de background.js). Les noms des
  // champs et leurs valeurs sont ceux de la plateforme : gardés tels quels ; la variante Beebs détaillée (« la fiche
  // porte… ») contient des guillemets et n'est pas prise.
  [m`${brut(`(?<pause>${litteral('Republication en pause AVANT toute suppression — ton annonce est intacte sur ')}(?:${PLATEFORMES})\\.\\s*)?`)}${pf('p')} exige des champs encore vides pour cette catégorie : ${brut('(?<champs>[^«»]+?)')}. Compléter ces champs dans l'app (copie ${brut('\\k<p>')}), puis relancer la publication.${option('choix', " Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».")}`,
    (g) => `${g.pause ? `Repost paused BEFORE any deletion — your listing is intact on ${g.p}. ` : ''}${g.p} requires fields that are still empty for this category: ${g.champs.replace(/\(accepte\s*:\s*/g, '(accepts: ')}. Fill these fields in the app (${g.p} copy), then relaunch the listing.${g.choix ? ' The choice is made in the app: the item, “✋ Complete” button.' : ''}`],
  [m`Vinted a refusé ce livre sans ISBN : il ne peut partir sur Vinted qu'avec son numéro ISBN (au dos du livre, sous le code-barres, ou sur la page de copyright). Saisis-le avec « ✋ Compléter » et la publication repart d'elle-même${option('annule', ' — ou annule la publication Vinted de cet article : les autres plateformes ne sont pas touchées. Rien n\'a été mis en ligne sur Vinted')}.`,
    (g) => `Vinted refused this book without an ISBN: it can only go out on Vinted with its ISBN number (on the back of the book, under the barcode, or on the copyright page). Enter it with “✋ Complete” and the listing starts again on its own${g.annule ? ' — or cancel the Vinted listing of this item: the other platforms are not affected. Nothing was put online on Vinted' : ''}.`],
  [m`Cet article est signalé vendu sur ${pf()} : on ne le publie pas ailleurs, pour ne jamais le vendre deux fois. Confirme la vente dans l'app (bandeau « Vendue ? ») ; si elle n'a pas eu lieu, relance ensuite.`,
    (g) => `This item is reported sold on ${g.p}: we don't publish it elsewhere, so it's never sold twice. Confirm the sale in the app (“Sold?” banner); if it didn't happen, relaunch afterwards.`],
  [m`Opla n'est plus pris en charge par FillSell : cette annonce vendue est peut-être encore en ligne sur Opla, retire-la toi-même sur Opla.`,
    'Opla is no longer supported by FillSell: this sold listing may still be online on Opla, remove it yourself on Opla.'],
  [m`Opla n'est plus disponible dans FillSell. ${ou('quoi', "Ton annonce Opla n'a pas été touchée", "Rien n'a été publié sur Opla")}, et cela ne compte pas dans tes limites.`,
    (g) => `Opla is no longer available in FillSell. ${g.quoi.startsWith('Ton') ? 'Your Opla listing was not touched' : 'Nothing was published on Opla'}, and this doesn't count toward your limits.`],

  // ── Refus de Beebs à sa vérification ──
  [m`Beebs a reçu ton annonce (n° ${num()}, en vérification à ${heure('h1')} le ${date('d1')}), puis l'a retirée de sa vérification sans la mettre en ligne${brut(`(?: \\(elle n['’]y était plus à ${heure('h2')} le ${date('d2')}\\))?`)} ; Beebs ne dit pas pourquoi. ${brut(`(?:Tes annonces en ligne, lues en entier à ${heure('h3')} le ${date('d3')}, ne la montrent pas|Le relevé fait à ${heure('h4')} le ${date('d4')}, qui a lu toutes tes annonces en ligne, ne la montre pas)`)} : Beebs n'a jamais mis cette annonce en ligne. Rien n'est en ligne, rien n'est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon).`,
    (g) => `Beebs received your listing (no. ${g.n}, under review at ${heureEn(g.h1)} on ${g.d1}), then took it out of its review without putting it online${g.h2 ? ` (it was no longer there at ${heureEn(g.h2)} on ${g.d2})` : ''}; Beebs doesn't say why. ${g.h3 ? `Your live listings, read in full at ${heureEn(g.h3)} on ${g.d3}, don't show it` : `The scan made at ${heureEn(g.h4)} on ${g.d4}, which read all your live listings, doesn't show it`}: Beebs never put this listing online. Nothing is online, nothing is sold: your item stays in your stock, and this listing doesn't count toward your limits. To offer it again, first change what Beebs may have refused (photos, title, description, category).`],
  [m`Beebs a refusé cette annonce à sa vérification (Beebs ne dit pas pourquoi) : déposée le ${date('d1')} à ${heure('h1')}, elle n'était plus « en cours de vérification » le ${date('d2')} à ${heure('h2')} et, sept jours plus tard, n'était toujours pas en ligne. Rien n'est en ligne, rien n'est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. La reproposer à l'identique serait refusé de même : change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon).`,
    (g) => `Beebs refused this listing at its review (Beebs doesn't say why): posted on ${g.d1} at ${heureEn(g.h1)}, it was no longer “under review” on ${g.d2} at ${heureEn(g.h2)} and, seven days later, still wasn't online. Nothing is online, nothing is sold: your item stays in your stock, and this listing doesn't count toward your limits. Offering it again unchanged would be refused the same way: first change what Beebs may have refused (photos, title, description, category).`],
  [m`Trois jours après le dépôt, cette annonce n'était ni en ligne ni « en vérification » dans tes annonces Beebs aux relevés complets du ${date('d1')} à ${heure('h1')} et du ${date('d2')} à ${heure('h2')}, et Beebs n'a donné aucun motif. Rien n'est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.`,
    (g) => `Three days after posting, this listing was neither online nor “under review” among your Beebs listings in the full scans of ${g.d1} at ${heureEn(g.h1)} and ${g.d2} at ${heureEn(g.h2)}, and Beebs gave no reason. Nothing is sold, your item stays in your stock, and ${LIMITES_EN.charAt(0).toLowerCase()}${LIMITES_EN.slice(1)}`],
  [m`Cette annonce est absente de tes annonces ${pf()} aux relevés complets du ${date('d1')} à ${heure('h1')} et du ${date('d2')} à ${heure('h2')}, et ${brut('\\k<p>')} n'a donné aucun motif. Rien n'est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.`,
    (g) => `This listing is missing from your ${g.p} listings in the full scans of ${g.d1} at ${heureEn(g.h1)} and ${g.d2} at ${heureEn(g.h2)}, and ${g.p} gave no reason. Nothing is sold, your item stays in your stock, and ${LIMITES_EN.charAt(0).toLowerCase()}${LIMITES_EN.slice(1)}`],
  // (13/11, lot du 13/11) Refus Leboncoin dit refus : message_refus_leboncoin (migration 20261113203000) et
  // MESSAGE_JAMAIS_EN_LIGNE_LBC (_shared/depot-lbc-jamais-en-ligne.js, handler-watch).
  [m`Leboncoin a refusé cette annonce juste après son dépôt${brut(`(?: du ${date('d0')} à ${heure('h0')})?`)} : elle n'est jamais apparue dans tes annonces Leboncoin (relevés complets du ${date('d1')} à ${heure('h1')} et du ${date('d2')} à ${heure('h2')}), où Leboncoin ne montre pas une annonce refusée. ${brut(`(?:Elle porte la même photo que ton annonce ${num('a')}(?<v>, vendue, que Leboncoin affiche encore \\(transaction en cours\\)|, déjà en ligne sur Leboncoin) : Leboncoin refuse une annonce semblable à une annonce déjà en ligne\\. )?`)}Son motif est dans le mail « Votre annonce … a été refusée » qu'il t'a envoyé ; corrige ce qu'il dit avant de la relancer, sinon la même annonce serait refusée de même. ${ou('quoi', "Rien n'est vendu", "Ta vente d'avant n'est pas touchée")}, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.`,
    (g) => `Leboncoin refused this listing right after it was posted${g.d0 ? ` on ${g.d0} at ${heureEn(g.h0)}` : ''}: it never appeared among your Leboncoin listings (full scans of ${g.d1} at ${heureEn(g.h1)} and ${g.d2} at ${heureEn(g.h2)}), where Leboncoin doesn't show a refused listing. `
      + (g.a ? `It has the same photo as your listing ${g.a}${/vendue/.test(g.v ?? '') ? ', sold, which Leboncoin still shows (transaction in progress)' : ', already online on Leboncoin'}: Leboncoin refuses a listing similar to one already online. ` : '')
      + `Its reason is in the email “Your listing … was refused” it sent you; fix what it says before relaunching, otherwise the same listing would be refused again. ${g.quoi.startsWith('Rien') ? 'Nothing is sold' : 'Your earlier sale is not touched'}, your item stays in your stock, and ${LIMITES_EN.charAt(0).toLowerCase()}${LIMITES_EN.slice(1)}`],
  [m`Leboncoin a refusé cette annonce : elle n'est jamais apparue dans tes annonces Leboncoin, où Leboncoin ne montre pas une annonce refusée, et sa page est fermée. Son motif est dans le mail « Votre annonce … a été refusée » qu'il t'a envoyé ; corrige ce qu'il dit avant de la relancer, sinon la même annonce serait refusée de même. Rien n'est en vente sur Leboncoin pour cet article ; cette publication ne compte pas dans tes limites.`,
    `Leboncoin refused this listing: it never appeared among your Leboncoin listings, where Leboncoin doesn't show a refused listing, and its page is closed. Its reason is in the email “Your listing … was refused” it sent you; fix what it says before relaunching, otherwise the same listing would be refused again. Nothing is for sale on Leboncoin for this item; ${LIMITES_EN.charAt(0).toLowerCase()}${LIMITES_EN.slice(1)}`],
  // (13/11, 3e réponse de Nico) Leboncoin : mêmes photos qu'une annonce en ligne du compte (_shared/lbc-memes-photos.js)
  // et relance à l'identique d'un refus (utils/relanceRefusLbc.js) — écrits par get-pending-jobs.
  [m`Une annonce avec ces photos est déjà en ligne sur Leboncoin${brut('(?: \\((?<ns>n° \\d+(?:, n° \\d+)*)\\))?')}. Rien n'a été envoyé à Leboncoin, et cette publication ne compte pas dans tes limites.`,
    (g) => `A listing with these photos is already live on Leboncoin${g.ns ? ` (${g.ns.replace(/n° /g, 'no. ')})` : ''}. Nothing was sent to Leboncoin, and this listing doesn't count toward your limits.`],
  [m`Leboncoin a refusé cette annonce, et elle repartirait à l'identique : même titre, même texte, mêmes photos, même prix, même catégorie — Leboncoin la refuserait de même. Rien n'a été envoyé à Leboncoin. Modifie d'abord l'annonce (le motif de Leboncoin est dans son mail « Votre annonce … a été refusée »), puis publie-la de nouveau.`,
    "Leboncoin refused this listing, and it would go out again unchanged: same title, same text, same photos, same price, same category — Leboncoin would refuse it again. Nothing was sent to Leboncoin. Change the listing first (Leboncoin's reason is in its email “Your listing … was refused”), then publish it again."],
  // Refus Beebs « même contenu » (utils/empreinteContenu.js, messageRefusBeebsMemeContenu, écrit par get-pending-jobs).
  [m`Beebs a refusé ${ou('quoi', 'la nouvelle annonce', 'cette annonce')} à sa vérification (Beebs ne dit pas pourquoi), et elle repartirait à l'identique : même titre, même description, mêmes photos, même rayon — Beebs la refuserait de même. Rien n'a été envoyé à Beebs, rien n'est décompté. Change d'abord le texte, les photos ou le rayon, puis relance.`,
    (g) => `Beebs refused ${g.quoi.startsWith('la') ? 'the new listing' : 'this listing'} at its review (Beebs doesn't say why), and it would go out again unchanged: same title, same description, same photos, same category — Beebs would refuse it again. Nothing was sent to Beebs, nothing was counted. Change the text, photos or category first, then relaunch.`],

  // ── eBay : compte vendeur, enchères, site (ebay-api-worker, _shared/ebay-hors-france.js) ──
  [m`Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : il reste à ${ou('quoi', 'finir ton compte vendeur chez eBay (vérification ou inscription vendeur)', 'créer tes conditions de vente chez eBay (paiement, retours, livraison)')}. C'est ici :${brut('(?: \\S+)?')} — rien n'a été envoyé à eBay, et l'annonce partira toute seule dès que ton compte sera prêt.`,
    (g) => `Your eBay account is linked to FillSell, but eBay doesn't let it sell yet: ${g.quoi.startsWith('finir') ? 'your seller account still needs finishing on eBay (verification or seller registration)' : 'your selling policies still need creating on eBay (payment, returns, shipping)'}. Nothing was sent to eBay, and the listing will go out on its own as soon as your account is ready.`],
  [m`Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : il reste à finir sa configuration (paiement, retours, livraison). Rien n'a été envoyé à eBay — l'annonce partira toute seule dès que ton compte sera prêt.`,
    "Your eBay account is linked to FillSell, but eBay doesn't let it sell yet: its setup still needs finishing (payment, returns, shipping). Nothing was sent to eBay — the listing will go out on its own as soon as your account is ready."],
  [m`Ton compte eBay n'est pas encore prêt pour vendre. Connecte-toi à eBay sur ton ordinateur et termine ton inscription vendeur, puis relance la publication.`,
    "Your eBay account isn't ready to sell yet. Sign in to eBay on your computer and finish your seller registration, then relaunch the listing."],
  [m`Ton compte eBay doit d'abord être ouvert à la vente (inscription vendeur eBay) : eBay a renvoyé une de tes publications vers son inscription vendeur. Termine-la une seule fois sur ebay.fr, sur ton ordinateur : tes publications eBay repartiront ensuite toutes seules (ou relance celle-ci quand c'est fait). Rien n'a été publié.`,
    "Your eBay account must first be opened for selling (eBay seller registration): eBay sent one of your listings to its seller registration. Finish it once on ebay.fr, on your computer: your eBay listings will then start again on their own (or relaunch this one once it's done). Nothing was published."],
  [m`Connecte ton compte eBay pour vendre ici : une fois relié, FillSell publie tes annonces eBay depuis ses serveurs, et tu n'as même plus besoin de laisser ton ordinateur allumé. Relie ton compte dans « Réglages › Compte eBay » (ou avec le bouton « Me connecter » ci-dessous) — dès que c'est prêt, cette publication part toute seule.`,
    "Connect your eBay account to sell here: once linked, FillSell publishes your eBay listings from its servers, and you don't even need to leave your computer on. Link your account in “Settings › eBay account” (or with the “Sign in” button below) — as soon as it's ready, this listing goes out on its own."],
  // (09/11, point 2 de Nico) Refus eBay qui vise le COMPTE (_shared/ebay-refus-compte.js).
  [m`eBay bloque la mise en vente sur ton compte : il attend que tu finalises la vérification de ton identité (ou de tes données financières). C'est à faire une seule fois, sur ton compte eBay (ebay.fr ou l'app eBay) : FillSell ne peut pas le faire à ta place, et ça ne vient pas de ton article. Rien n'a été publié. Quand c'est fait, touche « C'est fait, relancer » : FillSell relance cette publication, et tes autres publications eBay repartent dès qu'eBay l'accepte.`,
    "eBay is blocking sales on your account: it is waiting for you to finish verifying your identity (or your financial details). It only needs doing once, on your eBay account (ebay.fr or the eBay app): FillSell can't do it for you, and it isn't caused by your item. Nothing was published. Once it's done, tap “Done, relaunch”: FillSell relaunches this listing, and your other eBay listings start again as soon as eBay accepts it."],
  [m`eBay a bloqué ton compte vendeur (paiement refusé ou solde impayé chez eBay) : rien ne peut être mis en vente tant que ce n'est pas réglé sur ton compte eBay (ebay.fr › Mon eBay › Paiements). FillSell ne peut pas le faire à ta place, et ça ne vient pas de ton article. Rien n'a été publié. Quand c'est réglé, touche « C'est fait, relancer » : FillSell relance cette publication, et tes autres publications eBay repartent dès qu'eBay l'accepte.`,
    "eBay has blocked your seller account (declined payment or unpaid balance with eBay): nothing can be listed until it's sorted on your eBay account (ebay.fr › My eBay › Payments). FillSell can't do it for you, and it isn't caused by your item. Nothing was published. Once it's sorted, tap “Done, relaunch”: FillSell relaunches this listing, and your other eBay listings start again as soon as eBay accepts it."],
  [m`eBay demande une mise à niveau de ton compte vendeur avant d'accepter de nouvelles annonces. Va sur ebay.fr depuis ton ordinateur, suis les étapes qu'eBay affiche, puis relance la publication depuis la fiche de l'article.`,
    'eBay asks you to upgrade your seller account before it accepts new listings. Go to ebay.fr from your computer, follow the steps eBay shows, then relaunch the listing from the item.'],
  [m`Enchère eBay terminée le ${date()} sans acheteur : rien n'a été vendu, l'article reste dans ton stock.`,
    (g) => `eBay auction ended on ${g.d} with no buyer: nothing was sold, the item stays in your stock.`],
  [m`Annonce eBay terminée sans vente (lecture eBay du ${date()} : ${num()} vendu).`, (g) => `eBay listing ended without a sale (eBay read on ${g.d}: ${g.n} sold).`],
  [m`Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le ${date()} à ${heure()} — pas par FillSell, et sans vente. Ce n'est pas un refus d'eBay. ${brut(`(?:${litteral("Ton article reste dans ton stock ; si cet arrêt n'était pas voulu, relance la publication depuis la fiche.")}|${litteral("Ton article y reste en ligne sous l'annonce ")}(?<n>\\d+)${litteral(' (ta fiche du ')}(?<d2>\\d{1,2}\\/\\d{1,2})${litteral(') : rien à refaire.')})`)}`,
    (g) => `This listing was live on eBay, then it was ended there on ${g.d} at ${heureEn(g.h)} — not by FillSell, and without a sale. It is not an eBay refusal. ${g.n ? `Your item is still live there under listing ${g.n} (your item of ${g.d2}): nothing to redo.` : "Your item stays in your stock; if this ending wasn't intended, relaunch the listing from the item."}`],
  [m`Beebs n'a jamais mis cette annonce en ligne : FillSell ne la compte plus comme en ligne. Rien n'a été retiré. Beebs ne nous a jamais donné son numéro, et tes annonces Beebs, relevées en entier le ${date('d1')} à ${heure('h1')} puis le ${date('d2')} à ${heure('h2')}, n'en montrent aucune qui pourrait être elle.`,
    (g) => `Beebs never put this listing online: FillSell no longer counts it as online. Nothing was removed. Beebs never gave us its number, and your Beebs listings, read in full on ${g.d1} at ${heureEn(g.h1)} then on ${g.d2} at ${heureEn(g.h2)}, show none that could be it.`],
  [m`FillSell publie seulement sur eBay France : ton compte eBay${brut('(?: « (?<compte>[^»]+?) »)?')} est sur eBay ${libre('pays')}. Rien n'a été publié.`,
    (g) => `FillSell only publishes on eBay France: your eBay account${g.compte ? ` “${g.compte}”` : ''} is on eBay ${PAYS_EBAY_EN[g.pays] ?? g.pays}. Nothing was published.`],
  // (13/11, décisions D9 et D10 de Nico) L'attente du site eBay et « relie ton eBay » (_shared/ebay-site-attente.js) :
  // les phrases anglaises du module, mot pour mot (scripts/ebay-site-attente-selftest.mjs).
  [m`Ton compte eBay${brut('(?: « (?<compte>[^»]+?) »)?')} est sur eBay ${libre('pays')} : FillSell n'y publie pas encore, et ne publiera jamais sur ebay.fr à sa place. Ton site eBay arrive bientôt, rien n'est perdu : ${ou('quoi', 'cette publication partira toute seule', 'cette republication repartira toute seule')} dès son ouverture.`,
    (g) => `Your eBay account${g.compte ? ` “${g.compte}”` : ''} is on eBay ${PAYS_EBAY_EN[g.pays] ?? g.pays}: FillSell doesn't list there yet, and will never list on ebay.fr in its place. Your eBay site is coming soon, nothing is lost: ${/republication/.test(g.quoi) ? 'this repost will start again on its own' : 'this listing will go out on its own'} as soon as it opens.`],
  [m`Ton compte eBay${brut('(?: « (?<compte>[^»]+?) »)?')} est sur eBay ${libre('pays')} : FillSell ne le publie jamais sur ebay.fr. Relie ton eBay à FillSell (Réglages › Mes plateformes › eBay) : ${ou('quoi', 'cette publication', 'cette republication')} partira sur ton site eBay dès son ouverture. Rien n'est perdu.`,
    (g) => `Your eBay account${g.compte ? ` “${g.compte}”` : ''} is on eBay ${PAYS_EBAY_EN[g.pays] ?? g.pays}: FillSell never lists it on ebay.fr. Connect your eBay to FillSell (Settings › My platforms › eBay): ${/republication/.test(g.quoi) ? 'this repost' : 'this listing'} will go out on your eBay site as soon as it opens. Nothing is lost.`],

  // ── Raisons des fonctions SQL renvoyées à l'exécutant (controler_job_extension, ecrire_statut_job_extension) ──
  [m`Session de ce poste indisponible. Reconnecte FillSell.`, "This computer's session is unavailable. Reconnect FillSell."],
  [m`Job introuvable.`, 'Task not found.'],
  [m`Ce job n’est plus à exécuter. Actualise la file.`, 'This task no longer needs to run. Refresh the queue.'],
  [m`Ce job est réservé à un autre poste. Rien à exécuter ici.`, 'This task is reserved for another computer. Nothing to run here.'],
  [m`Le job a changé entre-temps.${option('file', ' Actualise la file.')}`, (g) => `The task changed in the meantime.${g.file ? ' Refresh the queue.' : ''}`],
  [m`La réservation de ce poste a changé. Actualise la file.`, "This computer's reservation changed. Refresh the queue."],
  [m`Ce job a été arrêté entre-temps.`, 'This task was stopped in the meantime.'],
  [m`En cours de lecture de ton annonce d'origine : elle partira toute seule avec toutes ses photos. Rien à faire.`,
    'Reading your original listing: it will go out on its own with all its photos. Nothing to do.'],
  // Exceptions des fonctions SQL appelées par l'app.
  [m`La fiche a changé ; réessaie.`, 'The item changed; try again.'],
  [m`Identité non prouvée : confirme le rattachement dans tes annonces.`, 'Identity not proven: confirm the link in your listings.'],
  [m`utilisateur non autorisé`, 'user not authorised'],
  [m`Compte non autorisé`, 'Account not authorised'],
  [m`fiche non autorisée`, 'item not authorised'],
  // Rattachement refusé (rapprochement_decider, migration 20261105190000).
  [m`Cette fiche a déjà une annonce ${brut(`(?<pp>(?:${PLATEFORMES})(?: et une annonce (?:${PLATEFORMES}))*)`)} en ligne, et l'autre fiche en ${ou('autre', 'a une autre', "a d'autres")} : deux annonces d'une même plateforme, ce sont deux exemplaires. Rien n'a été regroupé.`,
    (g) => `This item already has a ${g.pp.split(' et une annonce ').join(' listing and a ')} listing online, and the other item has ${g.autre === 'a une autre' ? 'another one' : 'others'}: two listings on the same platform are two copies. Nothing was merged.`],

  // ── Motifs d'une vente refusée (enregistrer_vente_atomique, check-listing-status 409, lu par utils/raisonRefus.js) ──
  [m`Annonce introuvable pour cette vente.`, 'Listing not found for this sale.'],
  [m`Cette annonce appartient à un article de ton stock : sa vente s’enregistre depuis cet article, jamais deux fois.`,
    'This listing belongs to an item in your stock: its sale is recorded from that item, never twice.'],
  [m`La référence de cette confirmation de vente manque.`, 'The reference of this sale confirmation is missing.'],
  [m`La fiche de cet exemplaire doit être confirmée avant d’enregistrer la vente.`, "This copy's item must be confirmed before recording the sale."],
  [m`Cette ancienne vente doit être vérifiée dans tes ventes avant toute nouvelle confirmation. Aucun stock n’a été recompté.`,
    'This old sale must be checked in your sales before any new confirmation. No stock was counted again.'],
  [m`Cette annonce n’est plus à confirmer comme vendue.`, 'This listing no longer needs confirming as sold.'],
  [m`Cette annonce est toujours en ligne sur Vinted (relevé du dressing du ${date()} à ${heure()}) : aucune vente n’est enregistrée.`,
    (g) => `This listing is still online on Vinted (wardrobe scan of ${g.d} at ${heureEn(g.h)}): no sale is recorded.`],
  [m`Cet article est en ligne sur Vinted sous une autre annonce (${num()}) : celle-ci a été remplacée, ce n’est pas une vente.`,
    (g) => `This item is online on Vinted under another listing (${g.n}): this one was replaced, it's not a sale.`],
  [m`Plusieurs exemplaires sont possibles. Confirme la fiche de cette annonce avant d’enregistrer sa vente.`,
    "Several copies are possible. Confirm this listing's item before recording its sale."],
  [m`Cet article est de nouveau en ligne sur Vinted sous une autre annonce (n° ${num()}, vue le ${date()} à ${heure()}) : l’ancienne annonce a été remplacée, ce n’est pas une vente. Si l’article est vendu, enregistre la vente depuis sa fiche en ligne.`,
    (g) => `This item is online again on Vinted under another listing (no. ${g.n}, seen on ${g.d} at ${heureEn(g.h)}): the old listing was replaced, it's not a sale. If the item is sold, record the sale from its live item.`],
  [m`Cette annonce n’est liée à aucun article de ton stock : aucune vente n’est enregistrée ici. Si tu l’as vendu, enregistre la vente depuis l’article.`,
    "This listing isn't linked to any item in your stock: no sale is recorded here. If you sold it, record the sale from the item."],
  [m`C’est une enchère eBay : elle n’est vendue que si eBay le dit (enchère gagnée). Aucune vente n’est enregistrée et aucune autre annonce n’est retirée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.`,
    `It's an eBay auction: it's only sold if eBay says so (auction won). No sale is recorded and no other listing is removed. ${VENTE_AILLEURS_EN}`],
  [m`Cette annonce est toujours en ligne sur eBay (fin prévue le ${date()} à ${heure()}) : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.`,
    (g) => `This listing is still online on eBay (set to end on ${g.d} at ${heureEn(g.h)}): no sale is recorded. ${VENTE_AILLEURS_EN}`],
  [m`eBay montre cette annonce en vente (lue le ${date()} à ${heure()}) : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.`,
    (g) => `eBay shows this listing for sale (read on ${g.d} at ${heureEn(g.h)}): no sale is recorded. ${VENTE_AILLEURS_EN}`],
  [m`Cette annonce a été revue en ligne sur ${pf()} le ${date()} à ${heure()}, après l’alerte : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.`,
    (g) => `This listing was seen online again on ${g.p} on ${g.d} at ${heureEn(g.h)}, after the alert: no sale is recorded. ${VENTE_AILLEURS_EN}`],
  [m`Vérifie le prix, les frais et la quantité vendue.`, 'Check the price, the fees and the quantity sold.'],
  [m`Cet article est déjà vendu : si c’est cette vente-là, touche « Déjà enregistrée » ; rien ne sera compté deux fois.`,
    "This item is already sold: if it's this very sale, tap “Already recorded”; nothing will be counted twice."],
  [m`Ce stock a déjà été vendu ou modifié. Actualise-le avant de confirmer.`, 'This stock was already sold or changed. Refresh it before confirming.'],
  [m`La quantité en stock a changé. Actualise-la avant de confirmer la vente.`, 'The quantity in stock changed. Refresh it before confirming the sale.'],
  [m`Une vente est déjà liée à cette fiche. Vérifie-la dans tes ventes pour éviter de la compter deux fois.`,
    "A sale is already linked to this item. Check it in your sales so it isn't counted twice."],
  [m`Leboncoin affichait déjà « Vendu » sur cette annonce quand FillSell l'a lue pour la première fois${brut(`(?:, le ${date()})?`)} : c'est une vente ancienne, pas une vente d'aujourd'hui. Rien n'est enregistré, rien n'est retiré ailleurs. Si tu viens d'en vendre un exemplaire, enregistre la vente depuis la fiche de l'article.`,
    (g) => `Leboncoin already showed “Vendu” (sold) on this listing when FillSell first read it${g.d ? `, on ${g.d}` : ''}: it's an old sale, not today's. Nothing is recorded, nothing is removed elsewhere. If you just sold a copy, record the sale from the item.`],
  [m`Orchestration impossible`, 'The sale could not be processed'],

  // ── Erreurs des fonctions eBay montrées à l'écran (ebay-account, ebay-oauth-start ; utils/ebayCompte.js) ──
  [m`Non autorisé`, 'Not authorised'],
  [m`Session invalide`, 'Invalid session'],
  [m`Erreur inattendue`, 'Unexpected error'],
  [m`Lecture impossible : ${libre()}`, (g) => `Could not read: ${g.x}`],
  [m`Choisis au moins un mode d'envoi.`, 'Choose at least one shipping method.'],
  [m`eBay accepte au maximum ${num()} modes d'envoi${option('politique', ' dans une même politique')}.`,
    (g) => `eBay accepts at most ${g.n} shipping methods${g.politique ? ' in one policy' : ''}.`],
  [m`Impossible de lire les ${ou('quoi', "modes d'envoi", 'services de livraison')} chez eBay : ${libre()}`,
    (g) => `Could not read the shipping ${g.quoi.startsWith('modes') ? 'methods' : 'services'} on eBay: ${g.x}`],
  [m`eBay ne propose pas (ou plus) le ${ou('quoi', "mode d'envoi", 'service')} « ${texte()} » pour la France.${brut(`(?: (?<valides>Modes valides|Services domestiques valides) selon eBay : ${libre('liste')}\\.)?`)}`,
    (g) => `eBay doesn't (or no longer) offer the shipping ${g.quoi === 'service' ? 'service' : 'method'} “${g.t}” for France.${g.valides ? ` Valid ${g.valides.startsWith('Modes') ? 'methods' : 'domestic services'} according to eBay: ${g.liste}.` : ''}`],
  [m`Indique le prix de « ${texte()} » (0 pour la livraison gratuite).`, (g) => `Enter the price of “${g.t}” (0 for free shipping).`],
  [m`Un mode d'envoi est arrivé sans code.`, 'A shipping method arrived without a code.'],
  [m`Le même mode d'envoi est choisi deux fois.`, 'The same shipping method is chosen twice.'],
  [m`Le prix de « ${texte()} » n'est pas un montant.`, (g) => `The price of “${g.t}” is not an amount.`],
  [m`eBay a refusé le paiement : ${libre()}${brut("(?<attente> — eBay active tes conditions de vente \\(jusqu['’]à 24 h\\) : appuie de nouveau sur « Créer mes conditions eBay » un peu plus tard, tes choix seront proposés de nouveau)?")}`,
    (g) => `eBay refused the payment: ${g.x}${g.attente ? ' — eBay is turning on your selling policies (up to 24 h): tap “Create my eBay policies” again a bit later, your choices will be offered again' : ''}`],
  [m`eBay a refusé ${ou('quoi', "l'activation des conditions de vente", 'les retours', 'la livraison')} : ${libre()}${brut('(?: \\(déjà fait : (?<faits>[^)]+)\\))?')}`,
    (g) => `eBay refused ${{ "l'activation des conditions de vente": 'turning on selling policies', "l’activation des conditions de vente": 'turning on selling policies', 'les retours': 'the returns', 'la livraison': 'the shipping' }[g.quoi] ?? g.quoi}: ${g.x}${g.faits ? ` (already done: ${faitsEn(g.faits)})` : ''}`],
  [m`eBay a refusé l'activation : ${libre()}`, (g) => `eBay refused the activation: ${g.x}`],
  [m`eBay a refusé ${ou('quoi', 'la mise à jour', 'la création')}${option('livraison', ' de la politique de livraison')} : ${libre()}`,
    (g) => `eBay refused the ${g.quoi.startsWith('la mise') ? 'update' : 'creation'}${g.livraison ? ' of the shipping policy' : ''}: ${g.x}`],
  [m`eBay a répondu sans identifiant de politique.`, 'eBay answered without a policy ID.'],
  [m`Type de politique inconnu`, 'Unknown policy type'],
  [m`Identifiant de politique absent`, 'Policy ID missing'],
  [m`eBay n'a pas rendu cette politique : ${libre()}`, (g) => `eBay did not return this policy: ${g.x}`],
  [m`Cette politique n'existe pas (ou plus) sur ton compte eBay.`, "This policy doesn't exist (anymore) on your eBay account."],
  [m`Mode de livraison inconnu : ${libre()}`, (g) => `Unknown shipping method: ${g.x}`],
  [m`Action inconnue : ${libre()}`, (g) => `Unknown action: ${g.x}`],
  [m`Connexion eBay indisponible : identifiants d'application absents des secrets (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET).`,
    'eBay sign-in unavailable: the app credentials are missing on our side.'],
];

/** Le nombre de phrases de la table (rapport du selftest). */
export const NB_MESSAGES_TRADUITS = TABLE.length;

/**
 * Le message du serveur dans la langue de l'app. `lang` ≠ 'en' → le texte reçu, inchangé (même valeur). Anglais : la
 * traduction de la table si la phrase entière y est, sinon le texte reçu, inchangé. Jamais d'exception.
 * @param {unknown} texte
 * @param {string} [lang]
 */
export function traduireMessageServeur(texte, lang = 'fr') {
  if (lang !== 'en' || typeof texte !== 'string') return texte;
  const t = texte.trim();
  if (!t) return texte;
  for (const [re, en] of TABLE) {
    const g = t.match(re);
    if (!g) continue;
    try {
      return typeof en === 'function' ? en(g.groups ?? {}) : en;
    } catch {
      return texte;
    }
  }
  return texte;
}
