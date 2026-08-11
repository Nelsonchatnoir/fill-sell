// Service worker (Manifest V3).
// Toutes les 30 min : lit le JWT depuis chrome.storage.local, appelle
// get-pending-jobs, dispatche chaque job vers le content script de sa
// plateforme, puis remonte le résultat via update-job-status.

importScripts("config.js");

// Marqueur de version du service worker. Motif (2026-07-09) : un second
// worktree (fill-and-sell-chrome-extension, branche feat/chrome-extension) a
// été chargé par erreur comme extension unpacked pendant des heures — beebs y
// est encore `implemented: false` et eBay n'y a pas d'entryUrl. Les symptômes
// ("Handler beebs pas encore implémenté", eBay qui s'ouvre direct sur /sl/list)
// contredisaient le code du dépôt principal sans qu'on puisse le voir.
// Ce log, imprimé au démarrage du SW, dit quelle COPIE tourne réellement :
// vérifier `version` et `build` avant de diagnostiquer quoi que ce soit.
// Format daté depuis le 2026-07-12 (les libellés de features ne permettaient
// pas de distinguer deux versions du même jour). À METTRE À JOUR à chaque
// modification de ce fichier.
const FILLSELL_BUILD =
  "2026-08-03-sync-dressing-vinted (l'extension sait lire le dressing Vinted de l'utilisateur : GET /api/v2/wardrobe/{id}/items page par page, pauses variables, reprise sur curseur, upsert anti-doublon garanti par la base. Les articles importés arrivent SANS prix d'achat — jamais 0 — et entrent dans le cycle de détection de vente via un cross_post_jobs 'published')";

// ── BUILD_ID AUTOMATIQUE (2026-07-18) ─────────────────────────────────────────
// FILLSELL_BUILD ci-dessus est une DESCRIPTION codée en dur que personne ne pense
// à mettre à jour : elle est restée figée à "2026-07-17…" pendant des jours de
// fixes, faisant croire à un code périmé chargé. FILLSELL_BUILD_ID, lui, est
// remplacé par build-extension.mjs (horodatage + hash git) à CHAQUE build : il
// change forcément d'un build à l'autre.
//   · dossier build/extension/ chargé  → id daté+hash (ex. 2026-07-18T…+e252620)
//   · dossier chrome-extension/ source → jeton non remplacé → "SOURCE non-buildé"
// Vérif immédiate dans la console du service worker : taper  FILLSELL_BUILD_ID.
const FILLSELL_BUILD_ID = "__FILLSELL_BUILD_ID__";
const FILLSELL_BUILD_LABEL = FILLSELL_BUILD_ID.startsWith("__FILLSELL_BUILD")
  ? "SOURCE non-buildé (dossier chrome-extension/ chargé tel quel)"
  : FILLSELL_BUILD_ID;
// Exposé sur self pour une vérif en UNE ligne dans la console du SW.
self.FILLSELL_BUILD_ID = FILLSELL_BUILD_ID;
console.log(
  `[background.js] BUILD_ID = ${FILLSELL_BUILD_LABEL} — v${chrome.runtime.getManifest().version}\n` +
  `[background.js] build (desc) ${FILLSELL_BUILD}`
);

const ALARM_NAME = "fillsell-poll-jobs";
const SYNC_DRESSING_ALARM = "fillsell-sync-dressing";

// Ré-armements "action utilisateur requise" (needsUser) autorisés avant de
// basculer le job en failed : évite qu'un job attendant une info jamais
// fournie (ex: adresse Leboncoin) ne rouvre un onglet à chaque cron sans fin.
const MAX_NEEDS_USER_RETRIES = 2;

// Erreurs qui ne disent RIEN sur le job lui-même, seulement sur l'instant où il
// est passé : elles doivent être ré-armées (bornées), jamais enterrées en
// `failed`. Deux familles, apprises en réel :
//   · canal de message coupé — l'onglet a navigué/rechargé, ou l'extension a
//     été rechargée en plein remplissage (2026-07-06, puis 2026-07-19) ;
//   · page trop lente à charger — waitForTabComplete / waitForEbayDraftForm
//     (2026-07-22, job eBay 244b0ec4 : le Patagonia est parti sur Beebs, Vinted
//     et Leboncoin, et seul eBay est tombé, définitivement, sur un timeout).
// ⚠️ N'ajouter ici QUE des erreurs d'infrastructure. Un refus de la plateforme,
// un champ obligatoire vide ou une catégorie non résolue sont des verdicts :
// les ré-armer ferait rouvrir un onglet à chaque cron pour rien (risque
// DataDome documenté plus bas), et masquerait le vrai problème à l'utilisateur.
const TRANSIENT_JOB_ERROR_RE =
  /message channel closed|Receiving end does not exist|No tab with id|pas fini de charger|pas fini de s'ouvrir|Onglet de travail fermé pendant/i;

// ── Dispatch par plateforme ────────────────────────────────────────────────────
// `implemented: false` → le job est loggé et laissé en pending (le content
// script n'existe pas encore). Passer à true quand le script est prêt.
const PLATFORM_HANDLERS = {
  vinted: {
    implemented: true,
    newListingUrl: "https://www.vinted.fr/items/new",
  },
  leboncoin: {
    implemented: true,
    newListingUrl: "https://www.leboncoin.fr/deposer-une-annonce",
  },
  beebs: {
    implemented: true,
    // URL directe confirmée en session réelle (2026-07-08, connecté) : ouvre
    // le formulaire "Mettre un article en vente" vierge, sans redirection de
    // login tant qu'une session est active (cf. content-scripts/beebs.js).
    newListingUrl: "https://www.beebs.app/fr/listing",
  },
  ebay: {
    implemented: true,
    // Point d'entrée : la home, PAS l'URL de dépôt (changement 2026-07-09).
    // Ouvrir un onglet neuf directement sur /sl/list?mode=AddItem... est un
    // marqueur d'automatisation net : aucun humain n'arrive sur le formulaire
    // de vente sans referrer, sans avoir chargé une seule page du site. On
    // passe donc par ebay.fr → clic réel sur "Vendre" → navigation interne
    // vers l'URL de dépôt (voir ebayNavigateToSellForm).
    entryUrl: "https://www.ebay.fr/",
    // eBay n'a pas de wizard à piloter : l'URL directe /sl/list avec le
    // categoryId (posé par l'app via ebayCategories.js) + titre + conditionId
    // ouvre le formulaire final pré-rempli (relevé en session réelle
    // 2026-07-07). D'où une URL PAR JOB — newListingUrl est une fonction,
    // résolue dans processJob. conditionId : famille seulement (neuf → 1000,
    // sinon 3000 = Occasion / Occasion - Très bon état selon la catégorie) ;
    // la granularité fine des états vêtements viendra dans un lot ultérieur.
    newListingUrl: (job) => {
      const fields = job.platform_fields ?? {};
      // Garde dure : sans categoryId, /sl/list ouvre l'outil de mise en vente
      // sans catégorie et eBay affiche SA PROPRE page d'erreur
      // (reason=pageLoadListing:Error:MISSING_CATEGORY_PRODUCT_ITEM_ID).
      // precheckJob() attrape déjà ce cas avant toute navigation ; ce throw
      // garantit qu'aucun autre chemin ne peut construire une URL invalide.
      if (!fields.ebayCategoryId) {
        throw new Error("URL eBay impossible à construire : platform_fields.ebayCategoryId absent.");
      }
      const params = new URLSearchParams({ mode: "AddItem" });
      params.set("categoryId", String(fields.ebayCategoryId));
      if (job.title) params.set("title", String(job.title).slice(0, 80));
      params.set("condition", /neuf/i.test(fields.etat ?? "") ? "1000" : "3000");
      return `https://www.ebay.fr/sl/list?${params}`;
    },
  },
};

// ── Pré-check : un job non mappé n'ouvre AUCUN onglet ──────────────────────────
// Bug du 2026-07-09 : processJob naviguait l'onglet de travail AVANT d'envoyer
// FILL_LISTING, donc avant que le content script ne puisse refuser le job. Pour
// un article de mode dont le genre ne résout aucun rayon, l'app ne pose pas de
// categoryId → l'URL eBay partait sans `categoryId` → l'utilisateur voyait la
// page d'erreur d'eBay ("L'outil de mise en vente ne fonctionne pas pour le
// moment", MISSING_CATEGORY_PRODUCT_ITEM_ID) pendant que la console affichait,
// pour LE MÊME job, le "Genre requis" du content script. Un job sans catégorie
// résolue ne doit provoquer ni onglet, ni navigation, ni page d'erreur.
//
// Les gardes équivalentes des content scripts sont CONSERVÉES (défense en
// profondeur : elles portent les messages détaillés et couvrent l'injection
// manuelle d'un job en dry-run piloté).
const CATEGORY_FIELD = {
  vinted: "categoryPath",
  leboncoin: "lbcCategoryPath",
  beebs: "beebsCategoryPath",
  ebay: "ebayCategoryId",
};

// ── Produits INTERDITS par Leboncoin — cosmétiques consommables (2026-08-11) ──
// MIROIR de estCosmetiqueInterditeLbc (src/utils/lbcCategories.js), qui porte la
// démonstration complète : Leboncoin interdit la VENTE des parfums, maquillages,
// crèmes et soins ; ce n'est pas un problème de catégorie, et les 4 seuls jobs
// LBC jamais partis en Divers > Autres (tous cosmétiques) ont tous échoué.
//
// ⚠️ CE MIROIR EST VOLONTAIREMENT PLUS ÉTROIT QUE L'APP, sur deux points :
//  1. il ne voit ni l'icône ni le TYPE de l'article — get-pending-jobs ne
//     transmet que title/description (cf. son .select()). La 3e branche de la
//     règle (« typé Beauté ») est donc INAPPLICABLE ici : un « Anti-Cernes »
//     sans mot-clé passera cette garde. C'est assumé — la garde de l'app, elle,
//     l'attrape AVANT le débit, et le doute doit toujours profiter au dépôt.
//  2. le veto (trousse, flacon vide, pinceau, Airwrap…) est repris À
//     L'IDENTIQUE : c'est lui qui empêche de bloquer à tort, jamais l'inverse.
//  3. « crème » NU est absent de cette liste alors qu'il est présent côté app.
//     Là-bas l'icône objet fait barrage (une « Casquette beige/crème » part sur
//     🧢, une « Robe crème » sur 👗) ; ici il n'y a pas d'icône, et « crème »
//     est d'abord une COULEUR. Sans cette restriction, la casquette Volcom
//     beige/crème — RÉELLEMENT publiée sur Leboncoin le 21/07, URL à l'appui —
//     serait refusée. Seules les formes contextualisées sont retenues.
// La vraie garde est côté app (aucune Pépite engagée). Celle-ci est le filet
// des jobs DÉJÀ en file au moment de la mise à jour, et des versions d'app
// antérieures — dans ces cas le job part en 'failed' et le trigger
// cross_post_job_settle_reservation rend la Pépite (release).
const LBC_COSMETIQUE_CONSOMMABLE =
  /(?<![\p{L}\p{N}])parfums?(?![\p{L}\p{N}])|eaux?.?de.?(?:toilette|parfum|cologne)|(?<![\p{L}\p{N}])colognes?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])maquillages?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])mascaras?(?![\p{L}\p{N}])|rouges?.?[àa].?l[èe]vres?|(?<![\p{L}\p{N}])lipsticks?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])fards?(?![\p{L}\p{N}])|fonds?.?de.?teint|anti.?cernes?|vernis.?(?:[àa].?)?(?:ongles?|semi.?permanents?|gels?)|(?<![\p{L}\p{N}])manucures?(?![\p{L}\p{N}])|cr[èe]mes?.?(?:hydratantes?|nourrissantes?|solaires?|de.?jour|de.?nuit|visages?|corps|mains?|anti.?[âa]ges?|anti.?rides?|teintées?)|(?<![\p{L}\p{N}])s[ée]rums?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])lotions?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])shampo(?:o)?ings?(?![\p{L}\p{N}])|gels?.?douche|(?<![\p{L}\p{N}])d[ée]odorants?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])gommages?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])d[ée]maquillants?(?![\p{L}\p{N}])|masques?.?(?:pour.?)?(?:les?.?)?(?:visages?|corps|cheveux|capillaires?|hydratants?|de.?nuit|en.?tissu|en.?feuilles?|l[èe]vres?)|huiles?.?(?:pour.?)?(?:les?.?)?(?:visages?|corps|cheveux|barbe|d[ée]maquillante)|soins?.?(?:de.?)?(?:la.?)?(?:peau|visage|corps|anti.?[âa]ges?|anti.?rides?|anti.?rougeurs?)|(?<![\p{L}\p{N}])skincare(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])sunscreens?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])moisturi[sz]ers?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])cleansers?(?![\p{L}\p{N}])|lips?.?(?:balms?|masks?|oils?|glosses?|sticks?)/iu;
const LBC_NON_CONSOMMABLE =
  /(?<![\p{L}\p{N}])trousses?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])vanity|beauty.?case|(?:coffrets?|bo[îi]tes?|caisses?).?de.?rangement|(?<![\p{L}\p{N}])rangements?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])organi[sz]e(?:u)?rs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])pr[ée]sentoirs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])distributeurs?(?![\p{L}\p{N}])|porte.?(?:pinceaux?|maquillage|parfums?|savons?)|(?<![\p{L}\p{N}])[ée]tuis?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])pochettes?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])sacoches?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])mallettes?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])valises?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])vides?(?![\p{L}\p{N}])|de.?collection|(?<![\p{L}\p{N}])collector(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])factices?(?![\p{L}\p{N}])|sans.?produit|(?<![\p{L}\p{N}])pinceaux?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])brosses?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])peignes?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])[ée]ponges?(?![\p{L}\p{N}])|beauty.?blender|(?<![\p{L}\p{N}])houppettes?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])applicateurs?(?![\p{L}\p{N}])|limes?.?[àa].?ongles?|coupe.?ongles?|(?<![\p{L}\p{N}])ciseaux(?![\p{L}\p{N}])|pinces?.?[àa].?[ée]piler|recourbe.?cils|(?<![\p{L}\p{N}])miroirs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])bigoudis(?![\p{L}\p{N}])|serre.?t[êe]tes?|gants?.?de.?toilette|(?<![\p{L}\p{N}])appareils?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])lisseurs?(?![\p{L}\p{N}])|s[èe]che.?cheveux|(?<![\p{L}\p{N}])tondeuses?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])rasoirs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])[ée]pilateurs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])airwrap(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])dyson(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])babyliss(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])ghd(?![\p{L}\p{N}])|masques?.?led|luminoth[ée]rapie|(?<![\p{L}\p{N}])st[ée]rilisateurs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])diffuseurs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])brumisateurs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])vaporisateurs?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])nettoyeurs?(?![\p{L}\p{N}])|tire.?laits?|breast.?pumps?|pompes?.?mammaires?|parfums?.?d.?(?:ambiance|int[ée]rieur)|parfums?.?(?:de|pour).?(?:la.?)?(?:maison|linge|voiture)|(?<![\p{L}\p{N}])d[ée]sodorisants?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])encens(?![\p{L}\p{N}])|br[ûu]le.?parfums?|(?<![\p{L}\p{N}])bougies?(?![\p{L}\p{N}])|masques?.?(?:chirurgi|ffp\d|de.?ski|de.?plong[ée]e|de.?carnaval|de.?d[ée]guisement|[àa].?gaz|de.?soudure|de.?protection|anti.?poussi[èe]re)|savons?.?(?:de.?marseille|noirs?|vaisselle|m[ée]nagers?|d[ée]tachants?)/iu;

// Le TITRE seul, jamais la description : celle d'un vêtement dit « crème » pour
// une couleur, celle d'un parfum dit « boîte d'origine » — la lire produit des
// faux verdicts dans les deux sens (mesuré sur les 4 881 lignes de la base).
function lbcProduitInterdit(job) {
  if (job.platform !== "leboncoin") return false;
  const titre = String(job.title ?? "");
  if (LBC_NON_CONSOMMABLE.test(titre)) return false;
  return LBC_COSMETIQUE_CONSOMMABLE.test(titre);
}

function precheckJob(job) {
  // AVANT la catégorie : une catégorie parfaitement résolue ne sauve pas un
  // produit que la plateforme refuse de vendre. Divers > Autres se remplit
  // sans erreur, l'annonce part, et c'est la MODÉRATION qui la refuse ensuite
  // — hors de portée de l'extension.
  // Le test sur `action` est REDONDANT aujourd'hui (processJob route les delete
  // vers processDeleteJob avant d'arriver ici) : il est là pour qu'un retrait
  // d'annonce déjà en ligne ne puisse jamais être bloqué par cette garde, même
  // si l'ordre des branches changeait.
  if (job.action !== "delete" && lbcProduitInterdit(job)) {
    return (
      "Leboncoin interdit la vente de cosmétiques et parfums (crèmes, soins, " +
      "maquillage) : l'annonce serait refusée par leur modération, quelle que " +
      "soit la catégorie choisie. Publier cet article sur Vinted, eBay ou " +
      "Beebs. Aucun onglet n'a été ouvert."
    );
  }
  const key = CATEGORY_FIELD[job.platform];
  if (!key) return null;
  const fields = job.platform_fields ?? {};
  const value = fields[key];
  const resolved = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (resolved) return null;

  const genreRequired =
    fields.vintedGenreRequired || fields.ebayGenreRequired || fields.beebsGenreRequired;
  if (genreRequired) {
    return (
      `Catégorie ${job.platform} non résolue pour cet article de mode (genre = ` +
      `${JSON.stringify(fields.genre ?? null)}). Choisir un genre correspondant à un rayon ` +
      `réel de la plateforme dans les champs ${job.platform} de l'app, puis régénérer le job. ` +
      "Aucun onglet n'a été ouvert."
    );
  }
  return (
    `platform_fields.${key} absent — article non mappé vers le catalogue ${job.platform} ` +
    "(icône hors périmètre du mapping, ou job antérieur au mapping). Régénérer l'annonce " +
    "depuis l'app, ou compléter le mapping côté src/utils/. Aucun onglet n'a été ouvert."
  );
}

// ── Alarme 30 min ──────────────────────────────────────────────────────────────

// .catch obligatoire : scheduleAlarm est devenue asynchrone (elle interroge
// chrome.alarms.get avant de créer). Un rejet non capturé dans un listener de
// service worker n'a personne pour l'attraper.
const planifierAlarmes = () => scheduleAlarm().catch((e) =>
  console.error("[background] planification des alarmes:", e?.message ?? e));
chrome.runtime.onInstalled.addListener(planifierAlarmes);
chrome.runtime.onStartup.addListener(planifierAlarmes);

// ⚠️ chrome.alarms.create sur un nom EXISTANT ne « met pas à jour » l'alarme :
// il la REMPLACE et redémarre son cycle à zéro, delayInMinutes compris. Or
// scheduleAlarm() est appelé sur onInstalled ET onStartup — donc à CHAQUE
// rechargement d'une extension unpacked et à chaque démarrage de Chrome.
// Conséquence mesurée le 05/08 : la sync « une fois par jour » repartait
// 10 minutes après chaque rechargement. Relevé réel des runs 'cron' —
// 21:38, 22:59, 11:10, 11:44 — soit 80 min, 12 h, 34 min d'écart : ce
// n'étaient pas des périodes, c'étaient les rechargements de la matinée.
// Pour un utilisateur, ça veut dire une sync 10 min après CHAQUE démarrage de
// Chrome, en plus des 24 h. Quelqu'un qui éteint son PC le midi en fait deux
// par jour sans le savoir.
// Parade : ne (re)créer une alarme que si elle est ABSENTE ou si sa période a
// changé. Le test sur la période est ce qui permet à une future version de
// modifier la cadence — sans lui, l'alarme d'origine survivrait pour toujours.
async function creerAlarmeSiBesoin(nom, options) {
  try {
    const existante = await chrome.alarms.get(nom);
    if (existante && existante.periodInMinutes === options.periodInMinutes) return false;
  } catch {
    // API indisponible : on retombe sur la création inconditionnelle, jamais
    // sur l'absence d'alarme (mieux vaut une cadence trop courte que rien).
  }
  chrome.alarms.create(nom, options);
  return true;
}

async function scheduleAlarm() {
  await creerAlarmeSiBesoin(ALARM_NAME, {
    periodInMinutes: FILLSELL_CONFIG.POLL_INTERVAL_MINUTES,
    delayInMinutes: 1,
  });
  // Sync du dressing : UNE FOIS PAR JOUR, et c'est un choix, pas une valeur par
  // défaut. Les vues et favoris d'une annonce bougent de quelques unités par
  // jour : à 5 minutes, on ferait 288 relevés quotidiens pour la même
  // information, et on présenterait à DataDome un profil que personne d'humain
  // ne produit. Le bouton manuel reste disponible à tout moment pour qui veut
  // un rafraîchissement immédiat.
  // ⚠️ La sync des MESSAGES, elle, aura besoin des 5 minutes : ce sera une
  // alarme SÉPARÉE (kind='messages' côté vinted_sync_runs), surtout pas un
  // raccourcissement de celle-ci.
  await creerAlarmeSiBesoin(SYNC_DRESSING_ALARM, {
    periodInMinutes: 24 * 60,
    delayInMinutes: 10, // pas au démarrage : on laisse la publication passer d'abord
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) pollAndProcessJobs();
  if (alarm.name === SYNC_DRESSING_ALARM) {
    syncDressingVinted({ declencheur: "cron" }).catch((e) =>
      console.error("[sync-dressing][cron]", e?.message ?? e));
  }
});

// ── Messages (auth content script + popup) ────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Preuve de commit du prix Vinted (2026-07-13) — demandes émises par le
  // content script vinted.js PENDANT le remplissage (cf. readVintedPriceState).
  const senderTabId = _sender?.tab?.id;
  if (msg?.type === "VINTED_PRICE_STATE" && senderTabId != null) {
    readVintedPriceState(senderTabId).then(sendResponse);
    return true;
  }
  if (msg?.type === "VINTED_COMMIT_PRICE" && senderTabId != null) {
    commitVintedPrice(senderTabId, String(msg.value ?? "")).then(sendResponse);
    return true;
  }
  // Clic React direct (fibers, monde MAIN) — demandé par vinted.js deleteListing
  // quand simulateFullClick ne déclenche pas la modale de confirmation dans la
  // fenêtre cachée (⚠️ non vérifié, cf. vintedFiberClick).
  if (msg?.type === "VINTED_FIBER_CLICK" && senderTabId != null && typeof msg.selector === "string") {
    vintedFiberClick(senderTabId, msg.selector).then(sendResponse);
    return true;
  }
  // Captures STRUCTURÉES de la sonde réseau (succès par preuve serveur —
  // cf. waitForPublishOutcome côté content script, cas de la modale
  // show_item_verification_modal qui masque la redirection).
  if (msg?.type === "VINTED_PROBE_CAPTURES" && senderTabId != null) {
    readProbeCaptures(senderTabId).then(sendResponse);
    return true;
  }
  // Capture relayée en direct par la sonde (via le content script) : elle est
  // stockée ICI pour survivre à la redirection qui détruit la page.
  // (VINTED_PROBE_CAPTURE : nom historique, la sonde est désormais générique —
  // eBay relaie sous FILLSELL_PROBE_CAPTURE, même traitement.)
  if ((msg?.type === "VINTED_PROBE_CAPTURE" || msg?.type === "FILLSELL_PROBE_CAPTURE") && senderTabId != null) {
    recordProbeCapture(senderTabId, msg.capture ?? {});
    sendResponse({ ok: true });
    return; // réponse synchrone
  }
  // ⚠️ POINT CRITIQUE (2026-07-20, révisé 2026-08-01) : une fois que
  // l'extension a SA session VALIDE, celle-ci reste maîtresse — le token de
  // l'app ne doit jamais la remplacer, sinon l'extension refait tourner la
  // famille de refresh de l'app (la course qu'on a supprimée). MAIS la simple
  // POSSESSION d'un access_token propre ne suffit plus comme critère : une
  // session propre MORTE (refresh révoqué, token expiré) faisait refuser
  // toute session fraîche envoyée par l'app — l'utilisateur n'avait AUCUNE
  // porte de sortie (vécu 2026-08-01 : « FILLSELL_SESSION ignoré » en boucle
  // pendant que chaque poll échouait en « Token invalide ou expiré »).
  // La FRAÎCHEUR prime sur la possession : cf. acceptRelayedSession.
  if (msg?.type === "FILLSELL_SESSION" && msg.session?.access_token) {
    acceptRelayedSession(msg.session).then(sendResponse);
    return true;
  }
  if (msg?.type === "POLL_NOW") {
    pollAndProcessJobs();
    sendResponse({ ok: true });
  }
  // Source de vérité UNIQUE du "suis-je connecté" pour le popup (fix
  // 2026-07-11) : session VALIDÉE (refresh si expiration proche, storage
  // purgé si le refresh est mort) au lieu d'une relecture brute du storage
  // qui ne vérifiait que la présence d'un access_token — deux
  // implémentations qui divergeaient.
  if (msg?.type === "GET_VALID_SESSION") {
    getValidSession().then(
      (session) => sendResponse({ session }),
      (e) => {
        console.error("[background] GET_VALID_SESSION:", e);
        sendResponse({ session: null });
      }
    );
    return true; // réponse asynchrone
  }
  // Publication ciblée depuis le popup : publie UNIQUEMENT les jobs demandés
  // (plateformes cochées de l'annonce affichée), en réutilisant processJob.
  // Le poll automatique (POLL_NOW) reste inchangé.
  if (msg?.type === "PUBLISH_NOW") {
    publishSelected(Array.isArray(msg.jobIds) ? msg.jobIds : []).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ ok: false, reason: "error", error: String(e?.message ?? e) })
    );
    return true; // réponse asynchrone
  }
  // Sync du dressing Vinted, déclenchée depuis le site (relais fillsell-auth.js)
  // ou par l'alarme quotidienne. Réponse IMMÉDIATE : la sync dure des minutes,
  // le site suit sa progression dans `vinted_sync_runs` (il la lit déjà pour la
  // barre de progression), pas par la réponse de ce message.
  if (msg?.type === "SYNC_DRESSING") {
    syncDressingVinted({ declencheur: msg.declencheur === "cron" ? "cron" : "bouton" })
      .catch((e) => console.error("[sync-dressing]", e?.message ?? e));
    sendResponse({ ok: true, demarre: true });
  }
  // Détail d'UN article Vinted (2026-08-03 soir), demandé depuis le site au
  // clic « Publier » (relais fillsell-auth.js). Contrairement à la sync, la
  // réponse REVIENT par ce canal : un seul article, rien à suivre en base.
  // À L'UNITÉ, SUR ACTION HUMAINE UNIQUEMENT — jamais de lot ni de cron (cadre
  // du bandeau ⛔ de lirePageDressing, content-scripts/vinted.js).
  if (msg?.type === "FETCH_VINTED_ITEM") {
    fetchVintedItemDetail(msg.vintedItemId).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ success: false, error: String(e?.message ?? e) })
    );
    return true; // réponse asynchrone
  }
  // É1 republication (2026-08-05) : capture COMPLÈTE d'une annonce en ligne —
  // payload natif + résolutions id→libellé + verdict. Lecture SEULE, à
  // l'unité, sur action humaine (relais fillsell-auth.js), jamais de lot ni de
  // cron — même cadre que FETCH_VINTED_ITEM. Aucune suppression ici.
  if (msg?.type === "CAPTURE_VINTED_ITEM") {
    captureVintedItem(msg.vintedItemId).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ success: false, error: String(e?.message ?? e) })
    );
    return true; // réponse asynchrone
  }
  // Sonde d'état d'UNE annonce Vinted (2026-08-10), demandée par le site quand
  // l'utilisateur ouvre la modale de suppression d'un article encore en ligne.
  // LECTURE SEULE, à l'unité, sur action humaine — aucun drapeau, aucune vente,
  // aucune écriture. Cf. probeVintedListing pour le cadre complet.
  if (msg?.type === "PROBE_VINTED_LISTING") {
    probeVintedListing(msg.listingUrl).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ success: false, error: String(e?.message ?? e) })
    );
    return true; // réponse asynchrone
  }
});

// Événement de progression poussé vers le popup (ignoré s'il est fermé).
function emitProgress(payload) {
  chrome.runtime.sendMessage({ type: "FILLSELL_PROGRESS", ...payload }).catch(() => {});
}

// ── Résultats récents pour le popup (Sujet 5, 2026-07-11) ─────────────────────
// Le poll de fond termine des jobs SANS que le popup le sache : une fois
// dry_run_completed/published, le job sort de get-pending-jobs et le popup
// retombait sur "Non incluse" (FILLSELL_PROGRESS n'est émis que par le flux
// PUBLISH_NOW, jamais par pollAndProcessJobs). On persiste 30 min de
// résultats terminés ; le popup les lit à l'ouverture, et son
// storage.onChanged le re-render même déjà ouvert. annonceKey reprend la
// même formule que firstAnnonce côté popup (inv:<id> / title:<titre|jobId>).
const RECENT_RESULTS_TTL_MS = 30 * 60 * 1000;
async function recordRecentResult(job, status, error = null) {
  try {
    const KEY = FILLSELL_CONFIG.STORAGE_KEYS.RECENT_RESULTS;
    const store = await chrome.storage.local.get(KEY);
    const now = Date.now();
    const entries = Object.fromEntries(
      Object.entries(store[KEY] ?? {}).filter(([, r]) => now - (r.ts ?? 0) < RECENT_RESULTS_TTL_MS)
    );
    entries[job.id] = {
      platform: job.platform,
      status,
      // error : sur un job échoué/needsUser, le popup rouvert affiche « Échec »
      // (ou « À reconnecter ») avec ce message, au lieu de « Non incluse » —
      // un job terminé en échec sort de get-pending-jobs et redevenait invisible.
      error: error ? String(error).slice(0, 300) : null,
      title: job.title ?? "",
      inventaire_id: job.inventaire_id ?? null,
      // action (É5 popup, 2026-08-05) : le popup distingue un résultat de
      // REPUBLICATION d'un résultat de publication — sans ça, un republish
      // échoué s'affichait « Échec » sur la ligne Vinted du flux de dépôt.
      action: job.action ?? "publish",
      annonceKey: job.inventaire_id != null ? `inv:${job.inventaire_id}` : `title:${job.title || job.id}`,
      ts: now,
    };
    await chrome.storage.local.set({ [KEY]: entries });
  } catch (e) {
    console.warn("[background] recordRecentResult:", e);
  }
}

// Orchestration de la publication ciblée. Réutilise getValidSession (refresh),
// get-pending-jobs et processJob — aucune mécanique de remplissage réécrite.
function publishSelected(jobIds) {
  return withJobFlowLock("publish-now", () => publishSelectedUnlocked(jobIds));
}

async function publishSelectedUnlocked(jobIds) {
  const session = await getValidSession();
  if (!session) return { ok: false, reason: "no_session" };

  let jobs;
  try {
    ({ jobs } = await callEdgeFunction("get-pending-jobs", session.access_token, {
      build: FILLSELL_BUILD_ID,
      version: chrome.runtime.getManifest().version,
    }));
  } catch (e) {
    // 401 : même invalidation que le poll — et « no_session » plutôt que
    // « fetch_failed » pour que le popup affiche « Se connecter », pas « Échec ».
    if (e?.status === 401) {
      await invalidateRejectedSession(session).catch(() => {});
      return { ok: false, reason: "no_session" };
    }
    return { ok: false, reason: "fetch_failed", error: String(e?.message ?? e) };
  }

  const byId = new Map((jobs || []).map((j) => [String(j.id), j]));
  const targets = jobIds.map((id) => byId.get(String(id))).filter(Boolean);
  if (!targets.length) return { ok: false, reason: "no_matching_jobs" };

  // Même garde anti-rafale qu'un cycle de poll (cf. retryInTempTab).
  tempTabUsedThisPoll = false;

  // « En attente… » émis aussi côté background (2026-07-18) : même mécanique
  // d'événements que le flux poll — une seule source de vérité. Le popup pose
  // déjà cet état localement au clic (feedback instantané) ; l'événement le
  // confirme. (Popup ROUVERT en plein lot : les événements passés sont perdus,
  // c'est rowState qui re-dérive « En attente… » depuis batchRunning.)
  for (const j of targets) emitProgress({ jobId: j.id, platform: j.platform, phase: "queued" });

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const job = targets[i];
    emitProgress({ jobId: job.id, platform: job.platform, phase: "processing" });
    let outcome;
    try {
      outcome = await processJob(job, session.access_token);
    } catch (e) {
      outcome = { status: "failed", error: String(e?.message ?? e) };
    }
    outcome = outcome || { status: "unknown" };
    emitProgress({
      jobId: job.id,
      platform: job.platform,
      phase: outcome.status,
      error: outcome.error,
      listingUrl: outcome.listingUrl,
    });
    // Persiste aussi les ÉCHECS (les succès le sont déjà dans processJob) : sans
    // ça, un popup rouvert après un échec retombait sur « Non incluse » (le job
    // échoué sort de get-pending-jobs). Cf. recordRecentResult.
    if (["failed", "needsUser", "retry"].includes(outcome.status)) {
      await recordRecentResult(job, outcome.status, outcome.error).catch(() => {});
    }
    results.push({ jobId: job.id, platform: job.platform, ...outcome });
    // Pause + jitter entre deux jobs, comme le poll.
    if (i < targets.length - 1) await sleep(jobDelayMs());
  }
  return { ok: true, results };
}

// ── Session ────────────────────────────────────────────────────────────────────

// ── Bootstrap de la session PROPRE de l'extension (2026-07-20) ───────────────
// Voir supabase/functions/extension-session pour le pourquoi complet. En deux
// phrases : l'extension recopiait le refresh token de l'app et le faisait
// tourner en parallèle d'elle ; Supabase fait tourner un refresh token à chaque
// usage, donc celui des deux qui présentait un token déjà tourné déclenchait la
// détection de réutilisation et la RÉVOCATION DE TOUTE LA FAMILLE. Les deux
// tombaient ensemble, en silence (constaté le 2026-07-20 : famille révoquée à
// 11:57:49, dernier job traité à 11:56).
// On ne peut pas détacher une session existante — grant_type=refresh_token
// reste par construction dans la même famille. On en fait donc créer une NEUVE
// côté serveur, à partir du JWT relayé, sans jamais manipuler de mot de passe.
const BOOTSTRAP_RETRY_MS = 30 * 60 * 1000;

async function bootstrapOwnSession(relayedAccessToken) {
  const { SESSION_OWN, BOOTSTRAP_LAST_FAIL } = FILLSELL_CONFIG.STORAGE_KEYS;
  try {
    const { hashed_token } = await callEdgeFunction("extension-session", relayedAccessToken, {});
    if (!hashed_token) throw new Error("hashed_token absent");
    // Échange contre une session NEUVE. Le refresh token qui en sort n'a
    // jamais transité par l'app : famille distincte dès la première seconde.
    // ⚠️ `token_hash` et NON `token` (fix 2026-07-21) : admin/generate_link
    // renvoie un token DÉJÀ HASHÉ (properties.hashed_token). GoTrue le vérifie
    // via le champ `token_hash` (sans email). Passé sous `token`, il est traité
    // comme un OTP brut → /verify échoue systématiquement → bootstrap KO →
    // l'extension retombait sur la session RELAYÉE (partagée avec l'app) → la
    // rotation concurrente des refresh tokens révoquait la famille → l'extension
    // se déconnectait toutes les ~30-60 min (constaté sur 4 révocations le
    // 2026-07-21, extension-session rappelée en boucle toutes les 30 min = retry
    // d'échec). Avec token_hash le bootstrap réussit UNE fois et SESSION_OWN vit.
    const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: "magiclink", token_hash: hashed_token }),
    });
    if (!res.ok) throw new Error(`verify → HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.access_token || !data?.refresh_token) throw new Error("session incomplète");
    const own = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      email: data.user?.email ?? null,
    };
    await chrome.storage.local.set({ [SESSION_OWN]: own });
    await chrome.storage.local.remove(BOOTSTRAP_LAST_FAIL);
    console.log("[background] Session propre de l'extension obtenue — indépendante de l'app web");
    return own;
  } catch (e) {
    // Échec non bloquant : on continue sur la session relayée (comportement
    // d'avant) et on retentera plus tard. Sans cette borne, un bootstrap
    // impossible relancerait un appel toutes les 2 min.
    await chrome.storage.local.set({ [BOOTSTRAP_LAST_FAIL]: Date.now() });
    // 401 d'extension-session = le token RELAYÉ lui-même est mort (2026-08-01).
    // Le garder ferait échouer chaque poll avec ce même token pour toujours :
    // purge — le pont en renverra un frais à la prochaine visite de fillsell.app.
    if (e?.status === 401) {
      await chrome.storage.local.remove(FILLSELL_CONFIG.STORAGE_KEYS.SESSION);
    }
    console.warn("[background] Bootstrap de session propre échoué :", String(e?.message ?? e));
    return null;
  }
}

// Session fraîche relayée par le pont fillsell-auth.js (2026-08-01).
// Règles : la copie relayée est TOUJOURS stockée (elle n'est jamais UTILISÉE
// tant que la session propre vit — getValidSession l'ignore) : c'est le point
// de reprise quand la session propre meurt. L'ancien verrou la gelait au jour
// du premier bootstrap, si bien qu'à la mort de la session propre on retombait
// sur un token vieux de plusieurs jours, mort lui aussi — impasse totale.
async function acceptRelayedSession(relayed) {
  const { SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL } = FILLSELL_CONFIG.STORAGE_KEYS;
  await chrome.storage.local.set({ [SESSION]: relayed });

  const store = await chrome.storage.local.get(SESSION_OWN);
  const own = store[SESSION_OWN];
  if (own?.access_token) {
    // Critère de VIE, pas de possession : refreshIfNeeded rafraîchit si
    // l'expiration est proche et PURGE SESSION_OWN si le refresh est mort.
    const vivante = await refreshIfNeeded(own, SESSION_OWN);
    if (vivante) {
      console.log("[background] FILLSELL_SESSION : session propre valide conservée — copie relayée mise à jour en secours");
      return { ok: true, ignored: true };
    }
    console.warn("[background] Session propre morte — la session fraîche de l'app prend la main");
  }

  // Pas de session propre vivante : re-bootstrap IMMÉDIAT sur le token frais,
  // sans attendre le prochain poll ni purger le délai anti-rafale à la main.
  await chrome.storage.local.remove(BOOTSTRAP_LAST_FAIL);
  const own2 = await bootstrapOwnSession(relayed.access_token);
  return { ok: true, bootstrapped: Boolean(own2) };
}

// storage_key voyage avec la session retournée (jamais persisté tel quel) :
// il dit à invalidateRejectedSession QUELLE clé purger quand le serveur
// rejette le token malgré une validation locale positive (2026-08-01).
async function getValidSession() {
  const { SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL } = FILLSELL_CONFIG.STORAGE_KEYS;
  const store = await chrome.storage.local.get([SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL]);

  // Régime normal : la session PROPRE fait foi, seule, tant qu'elle vit.
  if (store[SESSION_OWN]?.access_token) {
    const own = await refreshIfNeeded(store[SESSION_OWN], SESSION_OWN);
    if (own) return { ...own, storage_key: SESSION_OWN };
    // Session propre morte (refresh révoqué → purgée par refreshIfNeeded) :
    // on retombe TOUT DE SUITE sur la copie relayée si elle est encore là,
    // au lieu de rendre null et de bloquer le poll (2026-08-01).
  }

  // Pas de session propre → install neuve, install d'avant ce correctif, ou
  // session propre qui vient de mourir. Le token relayé sert à bootstrapper,
  // et de dépannage en attendant que le bootstrap passe.
  const session = store[SESSION];
  if (!session?.access_token) return null;

  // ⚠️ JAMAIS de refreshSession sur la copie relayée (fix 2026-08-01) : son
  // refresh_token appartient à la famille de l'APP web — le consommer ici
  // vole la rotation à l'app, GoTrue détecte la réutilisation et révoque
  // l'app ET l'extension d'un coup (mécanique de l'incident du 2026-07-20).
  // Expirée → purge sèche ; le pont renverra une copie fraîche à la
  // prochaine visite de fillsell.app.
  if (session.expires_at && session.expires_at * 1000 - Date.now() < 60 * 1000) {
    await chrome.storage.local.remove(SESSION);
    console.warn("[background] Copie relayée expirée — purgée. Ouvrir fillsell.app connecté pour re-fournir une session.");
    return null;
  }

  const dernierEchec = store[BOOTSTRAP_LAST_FAIL] ?? 0;
  if (Date.now() - dernierEchec > BOOTSTRAP_RETRY_MS) {
    const own = await bootstrapOwnSession(session.access_token);
    if (own) return { ...own, storage_key: SESSION_OWN };
  }
  // Bootstrap indisponible : on reste sur le token relayé (non expiré) plutôt
  // que de bloquer l'utilisateur.
  return { ...session, storage_key: SESSION };
}

// Un seul refresh EN VOL par clé de storage (2026-08-01) : le popup
// (GET_VALID_SESSION), le poll (alarme) et le pont (acceptRelayedSession)
// peuvent appeler refreshIfNeeded en même temps. Deux rotations concurrentes
// du MÊME refresh token font détecter une réutilisation par GoTrue au-delà de
// sa fenêtre de grâce → révocation de toute la famille — la session propre
// meurt sans raison visible. Tous les appelants partagent la même promesse.
const refreshEnVol = new Map();
function refreshSessionOnce(storageKey, refreshToken) {
  if (!refreshEnVol.has(storageKey)) {
    const p = refreshSession(refreshToken).finally(() => refreshEnVol.delete(storageKey));
    refreshEnVol.set(storageKey, p);
  }
  return refreshEnVol.get(storageKey);
}

// Refresh maison, inchangé dans sa logique — paramétré par la clé de storage
// pour servir les deux sessions sans dupliquer le code.
async function refreshIfNeeded(session, storageKey) {
  if (!session?.access_token) return null;

  // Refresh si le token expire dans moins de 5 min
  const expiresSoon = session.expires_at && session.expires_at * 1000 - Date.now() < 5 * 60 * 1000;
  if (expiresSoon && session.refresh_token) {
    const refreshed = await refreshSessionOnce(storageKey, session.refresh_token);
    if (refreshed) {
      session = { ...session, ...refreshed };
      await chrome.storage.local.set({ [storageKey]: session });
    } else {
      // Refresh mort : PURGE du storage, pas seulement retour null (fix
      // 2026-07-11). Sinon l'access_token périmé reste stocké et tout
      // lecteur du storage (popup.load) croit à une session valide sur sa
      // simple présence — "Connecté" affiché, poll bloqué en silence,
      // reconnexion impossible (le clic compte ne fait rien tant que
      // state.session est truthy). Le storage.onChanged du popup re-render
      // en "Se connecter" tout seul.
      await chrome.storage.local.remove(storageKey);
      console.warn(`[background] Refresh du token échoué (${storageKey}) — session purgée, reconnexion nécessaire`);
      return null;
    }
  }
  return session;
}

async function refreshSession(refreshToken) {
  try {
    const res = await fetch(
      `${FILLSELL_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };
  } catch (e) {
    console.error("[background] refreshSession:", e);
    return null;
  }
}

// Le serveur vient de rejeter (401) un access token que la validation LOCALE
// (expires_at) jugeait encore bon : session révoquée côté serveur, l'horloge
// locale ment. Sans ce traitement, le poll rejouait le même token mort toutes
// les 2 min pour toujours, le popup affichait « Connecté », et la garde
// FILLSELL_SESSION refusait toute session fraîche (impasse du 2026-08-01).
// On force un refresh ; s'il échoue, on PURGE la clé — le popup passe
// « Se connecter » (storage.onChanged) et le pont reprend la main à la
// prochaine visite de fillsell.app. La copie relayée n'est jamais refreshée
// (refresh_token de la famille de l'app) : purge directe.
async function invalidateRejectedSession(session) {
  const { SESSION_OWN } = FILLSELL_CONFIG.STORAGE_KEYS;
  const key = session?.storage_key;
  if (!key) return;
  if (key === SESSION_OWN && session.refresh_token) {
    const refreshed = await refreshSessionOnce(SESSION_OWN, session.refresh_token);
    if (refreshed) {
      const { storage_key, ...sansTag } = session;
      await chrome.storage.local.set({ [SESSION_OWN]: { ...sansTag, ...refreshed } });
      console.warn("[background] Token rejeté par le serveur — refresh forcé réussi, le prochain poll repart");
      return;
    }
  }
  await chrome.storage.local.remove(key);
  console.warn(`[background] Token rejeté par le serveur et non rafraîchissable — ${key} purgé, reconnexion via fillsell.app`);
}

// ── Edge functions ─────────────────────────────────────────────────────────────

async function callEdgeFunction(name, accessToken, body) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `${name} → HTTP ${res.status}`);
    // Le statut voyage avec l'erreur : un 401 déclenche l'invalidation de la
    // session côté appelant (cf. invalidateRejectedSession, 2026-08-01).
    err.status = res.status;
    throw err;
  }
  return data;
}

// Caractères de contrôle retirés de tout texte destiné à la base (2026-07-13,
// job c1cd4ff1) : un U+0000 dans `error` fait REJETER le PATCH entier par
// Postgres (« unsupported Unicode escape sequence ») — le job garde alors
// l'erreur Postgres au lieu de la vraie, et une annonce publiée peut finir
// "failed". La sonde assainit déjà à la capture (extraitSain) ; ceci est la
// ceinture GLOBALE, quel que soit le chemin qui compose le message.
function texteSain(s) {
  return String(s ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "�");
}

function updateJobStatus(accessToken, jobId, status, extra = {}) {
  const safe = { ...extra };
  if (typeof safe.error === "string") safe.error = texteSain(safe.error);
  return callEdgeFunction("update-job-status", accessToken, {
    job_id: jobId,
    status,
    // Estampille de version (handler-watch, 2026-07-16) : quel build de
    // l'extension a traité ce job — enrichit le diagnostic d'alerte. Écrit
    // dans la colonne DÉDIÉE cross_post_jobs.handler_build, jamais dans
    // platform_fields (qu'update-job-status écrase en entier).
    handler_build: `${FILLSELL_BUILD_LABEL} · v${chrome.runtime.getManifest().version}`,
    ...safe,
  });
}

// Statut RÉEL du job en base, ici et maintenant. Le job qu'on manipule en
// mémoire a été lu au début du cycle : entre-temps, l'utilisateur (ou nous) a pu
// l'annuler, et une écriture aveugle le ferait revenir d'entre les morts.
async function jobStatusNow(accessToken, jobId) {
  try {
    const rows = await restRequest(`cross_post_jobs?id=eq.${jobId}&select=status`, accessToken);
    return rows?.[0]?.status ?? null;
  } catch (e) {
    console.warn(`[background] Lecture du statut de ${jobId} impossible :`, String(e?.message ?? e));
    return null; // dans le doute, on laisse l'appelant faire comme avant
  }
}

// ── Boucle principale ──────────────────────────────────────────────────────────

// ── Verrou de flux de jobs (2026-07-12) ────────────────────────────────────────
// pollAndProcessJobs (alarme 30 min — RÉ-ARMÉE À +1 MIN à chaque rechargement
// de l'extension via onInstalled — ou POLL_NOW) et publishSelected
// (PUBLISH_NOW du popup) partagent les MÊMES onglets de travail persistants.
// Sans verrou, les deux flux se chevauchent : le second discard/re-navigue
// l'onglet pendant que le premier remplit → RELOAD de page en plein
// remplissage. Vécu en direct le 2026-07-12 : Publier cliqué dans le popup
// peu après un rechargement d'extension, l'alarme à +1 min a repris le même
// job pending et re-navigué l'onglet eBay au moment du Titre/Marque.
// On sérialise : un seul flux de jobs à la fois, le suivant attend son tour.
let jobFlowTail = Promise.resolve();
let jobFlowBusyLabel = null;
function withJobFlowLock(label, fn) {
  if (jobFlowBusyLabel) {
    console.log(`[background] ${label} : flux "${jobFlowBusyLabel}" en cours — mise en file (onglets de travail partagés)`);
  }
  const run = jobFlowTail.then(async () => {
    jobFlowBusyLabel = label;
    try {
      return await fn();
    } finally {
      jobFlowBusyLabel = null;
    }
  });
  jobFlowTail = run.catch(() => {});
  return run;
}

// Commande de sync mise en file depuis le mobile, rapportée par le poll.
// Variable de module et non valeur de retour : pollAndProcessJobsUnlocked a
// une dizaine de sorties anticipées, toutes devraient la propager.
let commandeSyncEnAttente = null;

function pollAndProcessJobs() {
  const p = withJobFlowLock("poll", pollAndProcessJobsUnlocked);
  // ⚠️ La commande de sync distante s'exécute APRÈS libération du verrou.
  // syncDressingVinted en réclame un à son tour : l'appeler depuis l'intérieur
  // du poll serait un auto-blocage (jobFlowTail attendrait la sync, qui
  // attendrait la fin du poll). Fire-and-forget : la sync dure des minutes et
  // rend compte dans vinted_sync_runs, le poll n'a pas à l'attendre.
  return p.finally(() => {
    const cmd = commandeSyncEnAttente;
    commandeSyncEnAttente = null;
    if (!cmd) return;
    traiterCommandeSyncDistante(cmd).catch((e) =>
      console.error("[sync-dressing][distant]", e?.message ?? e));
  });
}

// ── Reprise des jobs orphelins bloqués en 'processing' (2026-07-12) ───────────
// TROU IDENTIFIÉ À L'AUDIT : processJob passe le job en 'processing' AVANT
// d'ouvrir l'onglet et de remplir. Si le service worker meurt en cours de route
// — Manifest V3 le tue à l'inactivité et RIEN ne le maintient en vie ici — ou si
// le PC s'éteint / le réseau tombe, le job reste 'processing' POUR TOUJOURS :
// get-pending-jobs ne sélectionne que 'pending', donc plus rien ne le reprend,
// il ne repart jamais et n'apparaît jamais en échec. Job perdu, en silence.
// Le risque a AUGMENTÉ avec les pauses eBay (fieldSettle ~5 s par champ) : plus
// un job dure, plus la fenêtre de mort du worker est grande.
//
// Seuil GÉNÉREUX : une publication eBay complète (photos + 7 champs à ~5 s +
// attentes de 20 s + description + gardes) prend plusieurs minutes. 15 minutes
// laissent largement finir un job légitime — on ne veut surtout pas interrompre
// un remplissage en cours.
// Borne de reprise : un job qui meurt systématiquement au même endroit ne doit
// pas reboucler à l'infini (réouverture d'onglets → DataDome, incident vécu).
const STALE_PROCESSING_MS = 15 * 60 * 1000;
const MAX_STALE_RECOVERIES = 2;

async function recoverStaleProcessingJobs(session) {
  let jobs;
  try {
    jobs = await restRequest(
      "cross_post_jobs?select=id,platform,action,title,inventaire_id,created_at,platform_fields&status=eq.processing",
      session.access_token
    );
  } catch (e) {
    console.error("[background] Lecture des jobs 'processing':", String(e?.message ?? e));
    return;
  }
  if (!jobs?.length) return;

  const now = Date.now();
  for (const job of jobs) {
    const pf = job.platform_fields ?? {};
    // processing_since est posé au passage en 'processing'. Les jobs d'AVANT ce
    // correctif ne l'ont pas : on retombe sur created_at (majorant sûr — le job
    // ne peut pas avoir commencé avant d'exister).
    const since = Date.parse(pf.processing_since ?? job.created_at ?? "");
    if (!Number.isFinite(since) || now - since < STALE_PROCESSING_MS) continue;

    const minutes = Math.round((now - since) / 60000);
    const recoveries = (pf.stale_recoveries ?? 0) + 1;
    const cleaned = { ...pf, stale_recoveries: recoveries };
    delete cleaned.processing_since;

    // ── Filet anti-DOUBLON sur reprise stale (2026-07-19) ─────────────────────
    // TROU IDENTIFIÉ À L'INVESTIGATION : si le worker meurt APRÈS que la
    // plateforme a accepté le dépôt mais AVANT l'écriture du statut, le
    // ré-armement en pending ci-dessous re-déposait l'annonce de zéro → DEUX
    // annonces réelles pour le même article. Les filets existants (sonde canal
    // coupé, « Mes annonces » LBC, Hub vendeur eBay) ne tournent que dans le
    // processJob d'un worker VIVANT — jamais ici. On demande donc à la
    // plateforme, AVANT tout ré-armement (et avant l'abandon en failed : un
    // job épuisé dont l'annonce existe est un succès, pas un échec) : une
    // annonce à NOTRE titre existe-t-elle déjà ? Oui → published direct avec
    // son URL, AUCUNE re-soumission. Non (ou invérifiable : pas de titre,
    // onglet disparu, page de liste muette) → pending normal, comme avant.
    // Jobs delete exclus : re-supprimer une annonce déjà supprimée est
    // inoffensif (« introuvable » géré), et « published » y serait un
    // contresens.
    if (job.action !== "delete") {
      const existing = await staleJobExistingListingUrl(job).catch((e) => {
        console.warn(`[background] Filet anti-doublon (job ${job.id}) :`, String(e?.message ?? e));
        return null;
      });
      // ── Garde de PROPRIÉTÉ de l'URL (2026-07-20) ────────────────────────
      // Le filet identifie l'annonce par le TITRE (findListingLinkInPage,
      // requireTitle:true) — c'est la seule preuve disponible sur une page de
      // liste. Or un titre n'identifie pas un article : mesuré sur le stock
      // réel, 36 % des articles ont un homonyme, et l'inventaire contient
      // 45 « robe », 16 « veste », 11 « chemise ». Sur homonymie, ce filet
      // s'attribuait l'URL de l'annonce d'un AUTRE article : le job passait
      // 'published' sans qu'aucune annonce n'existe pour lui, et il entrait
      // dans le scan de vente pointé sur l'annonce d'autrui — classe
      // « listing_url croisée », celle où un retrait cross-plateforme
      // supprime la MAUVAISE annonce.
      // On ne cherche pas à mieux identifier l'annonce côté page (le prix y
      // est trop peu discriminant — 5 prix distincts pour 22 jobs — et
      // inventaire_id n'existe PAS sur les pages des plateformes). On vérifie
      // la propriété côté BASE, où inventaire_id existe vraiment.
      const volee = existing
        ? await urlPossedeeParUnAutreArticle(session.access_token, job, existing).catch((e) => {
            console.warn(`[background] Vérification de propriété d'URL (job ${job.id}) :`, String(e?.message ?? e));
            // Vérification impossible = doute. Le doute profite au
            // ré-armement, comme partout dans ce filet : un ré-armement
            // inutile coûte une republication différée, un vol d'URL coûte la
            // suppression d'une annonce valide.
            return { id: "(vérification indisponible)" };
          })
        : null;
      if (existing && volee) {
        console.warn(
          `[background] Job ${job.id} (${job.platform}) : l'annonce ${existing} appartient DÉJÀ à un autre ` +
          `article (job ${volee.id}) — filet anti-doublon refusé, ré-armement normal. ` +
          "Titres homonymes : le titre seul ne prouve pas qu'il s'agit de notre annonce."
        );
      }
      if (existing && !volee) {
        // Même garde que rearmBounded : ne jamais réécrire par-dessus une
        // annulation intervenue entre la lecture et cette écriture.
        const actuel = await jobStatusNow(session.access_token, job.id);
        if (actuel && actuel !== "processing") {
          console.warn(
            `[background] Job ${job.id} : statut devenu "${actuel}" pendant la vérification anti-doublon — écriture abandonnée`
          );
          continue;
        }
        const done = { ...pf };
        delete done.processing_since;
        console.log(
          `[background] Job ${job.id} (${job.platform}) bloqué en 'processing' ${minutes} min MAIS l'annonce ` +
          `EXISTE déjà côté plateforme (${existing}) — published direct, aucune re-soumission (doublon évité)`
        );
        await updateJobStatus(session.access_token, job.id, "published", {
          error: null,
          listing_url: existing,
          platform_fields: done,
        }).catch((e) => console.error("[background] published anti-doublon:", String(e?.message ?? e)));
        await recordRecentResult(job, "published").catch(() => {});
        continue;
      }
    }

    if (recoveries > MAX_STALE_RECOVERIES) {
      const msg =
        `Job resté bloqué en cours de traitement (${minutes} min) après ` +
        `${MAX_STALE_RECOVERIES} reprises — abandonné pour éviter une boucle. ` +
        "Cause probable : interruption répétée (navigateur fermé, veille, réseau). " +
        "Régénérer l'annonce depuis l'app pour retenter.";
      console.error(`[background] Job ${job.id} (${job.platform}) : ${msg}`);
      await updateJobStatus(session.access_token, job.id, "failed", {
        error: msg,
        platform_fields: cleaned,
      }).catch((e) => console.error("[background] abandon job bloqué:", String(e?.message ?? e)));
      continue;
    }

    console.warn(
      `[background] Job ${job.id} (${job.platform}, ${job.action}) bloqué en 'processing' depuis ` +
      `${minutes} min → repassé en pending (reprise ${recoveries}/${MAX_STALE_RECOVERIES})`
    );
    await updateJobStatus(session.access_token, job.id, "pending", {
      error: `Reprise après interruption (bloqué ${minutes} min en cours de traitement)`,
      platform_fields: cleaned,
    }).catch((e) => console.error("[background] reprise job bloqué:", String(e?.message ?? e)));
  }
}

// ── Une listing_url appartient-elle DÉJÀ à un autre article ? (2026-07-20) ───
// Rend le job propriétaire concurrent, ou null si l'URL est libre / déjà à nous.
// IDENTITÉ D'ARTICLE, dans cet ordre :
//   · inventaire_id des DEUX côtés → comparaison d'id, la plus fiable ;
//   · sinon → titre EXACT. inventaire_id est nullable et l'est réellement :
//     ListingPreviewScreen.jsx:4038 écrit `addToStock ? currentInvId : null`,
//     donc un article publié sans être ajouté au stock n'en a pas. Dans ce cas
//     on retombe sur le titre — c'est la faiblesse d'origine, MAIS le sens du
//     repli s'inverse : ici on REFUSE en cas de doute au lieu de s'attribuer
//     l'URL.
// PARTAGE LÉGITIME PRÉSERVÉ : publish + delete (et republication) du MÊME
// article partagent normalement une URL — même inventaire_id, ou même titre :
// ils ne sont jamais vus comme « un autre article ». Relevé en base au moment
// d'écrire cette garde : 12 URL partagées par plusieurs jobs, 11 sont
// exactement ce cas ; la 12e (ebay.fr/itm/800372232491, 2 inventaires et
// 2 titres distincts) est l'incident de croisement d'id eBay du 19/07, déjà
// fermé par 5d9d308 — c'est précisément ce que cette garde refuserait.
async function urlPossedeeParUnAutreArticle(accessToken, job, url) {
  const rows = await restRequest(
    "cross_post_jobs?select=id,inventaire_id,title" +
      `&listing_url=eq.${encodeURIComponent(url)}`,
    accessToken
  );
  const memeArticle = (r) =>
    r.inventaire_id != null && job.inventaire_id != null
      ? String(r.inventaire_id) === String(job.inventaire_id)
      : String(r.title ?? "").trim() === String(job.title ?? "").trim();
  return (rows ?? []).find((r) => r.id !== job.id && !memeArticle(r)) ?? null;
}

// ── Filet anti-doublon : l'annonce d'un job stale existe-t-elle déjà ? ────────
// N'écrit RIEN : rend l'URL de l'annonce si une preuve TITRE-OBLIGATOIRE est
// trouvée, null sinon (le doute profite au ré-armement, comme avant). Réutilise
// les filets existants, aucun nouveau détecteur :
//   - LBC / eBay / Beebs : les pages de liste du compte déjà cataloguées par
//     recoverMissingListingUrls (LISTING_URL_RECOVERY_PAGES), lues par
//     findListingLinkInPage en requireTitle:true — la règle « jamais l'URL
//     d'une autre annonce » (leçon listing_url croisée) s'applique telle quelle.
//   - Vinted : pas de page de liste cataloguée. Deux preuves possibles SI
//     l'onglet de travail a survécu à l'interruption (window.__fsCaptures et la
//     page survivent à la mort du service worker tant que l'onglet n'a pas
//     re-navigué) : la réponse serveur de la sonde, ou un lien à notre titre
//     dans la page courante (profil vendeur post-redirection).
// Appelé SOUS withJobFlowLock (via recoverStaleProcessingJobs, début de poll) :
// les navigations d'onglet de travail ne croisent jamais un remplissage.
async function staleJobExistingListingUrl(job) {
  const title = job.title ?? "";
  const pattern = LISTING_URL_PATTERNS[job.platform];
  // Sans titre, aucune vérification n'est SÛRE (le match par titre est la seule
  // garde anti-annonce-croisée) : on ne devine pas, ré-armement comme avant.
  if (!title.trim() || !pattern) return null;

  if (job.platform === "vinted") {
    const tabId = await findExistingWorkTabId("vinted");
    if (tabId == null) return null; // onglet mort avec l'interruption : invérifiable
    // Preuve 1 : réponse serveur captée par la sonde. Garde anti-croisée : la
    // réponse doit porter NOTRE titre — si l'interruption a frappé AVANT la
    // purge clearProbeCaptures du job, les captures encore en page sont celles
    // du job PRÉCÉDENT, et son annonce ne doit jamais devenir la nôtre.
    const fromProbe = await vintedUploadSucceededForTitle(tabId, title).catch(() => null);
    if (fromProbe) return fromProbe;
    // Preuve 2 : un lien /items/ portant notre titre dans la page courante
    // (après publication, Vinted redirige vers le profil vendeur, qui liste
    // les annonces avec leur titre).
    const { url } = await findListingLinkInPage(tabId, pattern.source, title, { requireTitle: true });
    return url ? url.replace(WORK_TAB_FRAGMENT, "") : null;
  }

  for (const pageUrl of LISTING_URL_RECOVERY_PAGES[job.platform] ?? []) {
    let tabId;
    try {
      tabId = await getOrCreateWorkTab(job.platform, pageUrl);
    } catch (e) {
      console.warn(`[background] Filet anti-doublon (${job.platform}) : onglet indisponible — ${String(e?.message ?? e)}`);
      return null;
    }
    // SPA : les cartes arrivent après le HTML — mêmes attentes que
    // ebayConfirmViaActiveListings, bornées.
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      await sleep(1500);
      const { url } = await findListingLinkInPage(tabId, pattern.source, title, { requireTitle: true });
      if (url) return url.replace(WORK_TAB_FRAGMENT, "");
    }
  }
  return null;
}

// Étapes 1-2 de getOrCreateWorkTab SANS création ni navigation : on veut juste
// savoir si l'onglet de travail d'une plateforme a survécu, et le lire tel quel
// (le filet Vinted repose sur l'état laissé par le job interrompu — le naviguer
// détruirait précisément la preuve qu'on cherche).
async function findExistingWorkTabId(platform) {
  const key = workTabKey(platform);
  const store = await chrome.storage.session.get(key);
  if (store[key] != null) {
    const tab = await chrome.tabs.get(store[key]).catch(() => null);
    if (tab) return tab.id;
  }
  const host = PLATFORM_HOSTS[platform];
  if (!host) return null;
  const cands = await chrome.tabs.query({ url: `*://*.${host}/*` }).catch(() => []);
  return (cands ?? []).find((t) => (t.url || "").includes(WORK_TAB_FRAGMENT))?.id ?? null;
}

// vintedUploadSucceeded + exigence du TITRE dans la réponse serveur. Même
// lecture (HTTP 200 + code:0 + item.id, cf. vintedUploadSucceeded), plus la
// normalisation de findListingLinkInPage (lettres/chiffres seuls — insensible
// aux emoji retirés par sanitizeJob et à la ponctuation). Un titre accentué
// échappé en \uXXXX dans le JSON ne matchera pas : faux négatif assumé (le job
// repart en pending, comme avant ce filet) — jamais de faux positif.
async function vintedUploadSucceededForTitle(tabId, title) {
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const wanted = norm(title);
  if (!wanted) return null;
  const { captures } = await readProbeCaptures(tabId);
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    if (Number(c?.status) !== 200) continue;
    if (!/item_upload\/items/i.test(String(c?.url ?? ""))) continue;
    // Marqueur pré-troncature : comparaison EXACTE de titre à titre, au lieu
    // d'un « includes » sur un extrait de 250 caractères où le titre pouvait
    // ne pas tenir. Cf. vintedUploadSucceeded pour le pourquoi.
    if (c?.succesVinted?.id && norm(c.succesVinted.titre) === wanted) {
      return `https://www.vinted.fr/items/${c.succesVinted.id}`;
    }
    const body = String(c?.reponse ?? "");
    const id = body.match(/"item"\s*:\s*\{\s*"id"\s*:\s*(\d+)/);
    if (id && /"code"\s*:\s*0\b/.test(body) && norm(body).includes(wanted)) {
      return `https://www.vinted.fr/items/${id[1]}`;
    }
  }
  return null;
}

// ── Nettoyage périodique des onglets de travail orphelins (2026-07-18) ────────
// Le fix 0c8ac66 empêche la prolifération FUTURE (tabs.remove qui échouait en
// silence sur un beforeunload), mais ne ferme PAS les orphelins DÉJÀ accumulés
// (onglets #fillsell-worker laissés par un replaceWorkTab d'avant le fix), ni un
// éventuel cas résiduel non couvert. Invariant visé : AU PLUS UN onglet de
// travail par plateforme.
//
// Orphelin = onglet portant notre fragment mais qui n'est PLUS l'onglet mémorisé
// (storage.session fillsell_work_tab_<platform>) de sa plateforme — donc plus
// référencé par aucun flux. Les onglets temporaires (#fillsell-temp) ne matchent
// pas #fillsell-worker : exclus d'office.
//
// ⚠️ APPELÉ SOUS withJobFlowLock (fin de pollAndProcessJobsUnlocked) : jamais en
// concurrence d'une création/navigation/remplacement d'onglet de travail. Sans
// ce verrou, on risquerait de fermer un onglet fraîchement créé AVANT que
// getOrCreateWorkTab n'ait mémorisé son id → job cassé. C'est pour ça qu'on tourne
// APRÈS la boucle de jobs (les ids mémorisés sont alors à jour pour ce cycle).
async function cleanupOrphanWorkTabs() {
  try {
    const platforms = Object.keys(PLATFORM_HANDLERS);

    // Ids mémorisés (l'onglet "actif" de chaque plateforme) — à ne JAMAIS fermer.
    const store = await chrome.storage.session.get(platforms.map(workTabKey));
    const memorizedFor = (platform) => store[workTabKey(platform)] ?? null;

    let closed = 0;
    for (const platform of platforms) {
      const host = PLATFORM_HOSTS[platform];
      if (!host) continue;
      // Même requête que getOrCreateWorkTab (permission d'hôte déjà couverte).
      const cands = await chrome.tabs.query({ url: `*://*.${host}/*` }).catch(() => []);
      const marked = (cands ?? []).filter((t) => (t.url || "").includes(WORK_TAB_FRAGMENT));
      // Cas normal : 0 ou 1 onglet de travail → rien à faire, aucun bruit.
      if (marked.length <= 1) continue;

      // DÉRIVE : plus d'un onglet de travail pour cette plateforme. On garde
      // l'onglet mémorisé s'il est là, sinon le plus récemment ouvert (id le
      // plus élevé) — pour rester adoptable par un futur job, comme le fait le
      // repli de getOrCreateWorkTab quand le storage a été vidé (redémarrage).
      const memId = memorizedFor(platform);
      const keeper =
        marked.find((t) => t.id === memId)?.id ??
        marked.reduce((a, b) => (a.id > b.id ? a : b)).id;
      const orphans = marked.filter((t) => t.id !== keeper);
      console.warn(
        `[background] Nettoyage onglets : ${platform} a ${marked.length} onglets de travail (DÉRIVE, ` +
        `normal = 1) — onglet ${keeper} gardé, ${orphans.length} orphelin(s) à fermer`
      );

      for (const t of orphans) {
        // Même parade que replaceWorkTab : neutraliser beforeunload AVANT la
        // fermeture, sinon un formulaire dirty bloque tabs.remove (le bug d'origine).
        await neutralizeBeforeUnload(t.id);
        const ok = await chrome.tabs.remove(t.id).then(() => true).catch(() => false);
        if (ok) {
          closed++;
          console.log(`[background] Nettoyage onglets : onglet ${t.id} (${platform}) fermé — orphelin nettoyé`);
        } else {
          console.warn(
            `[background] Nettoyage onglets : onglet ${t.id} (${platform}) NON fermé ` +
            "(dialogue beforeunload bloquant ?) — à débloquer à la main, il sera re-tenté au prochain cycle"
          );
        }
      }
    }
    if (closed) console.log(`[background] Nettoyage onglets : ${closed} orphelin(s) fermé(s) au total`);
  } catch (e) {
    console.warn("[background] cleanupOrphanWorkTabs (non bloquant) :", String(e?.message ?? e));
  }
}

async function pollAndProcessJobsUnlocked() {
  const session = await getValidSession();
  if (!session) {
    console.log("[background] Pas de session valide, poll ignoré");
    return;
  }

  await chrome.storage.local.set({
    [FILLSELL_CONFIG.STORAGE_KEYS.LAST_POLL]: new Date().toISOString(),
  });

  // AVANT de lire la file : repêcher les jobs orphelins d'un cycle précédent
  // (service worker tué en plein remplissage, PC éteint…). Sans ça, ils restent
  // 'processing' à vie et get-pending-jobs ne les verra jamais.
  await recoverStaleProcessingJobs(session).catch((e) =>
    console.error("[background] recoverStaleProcessingJobs:", e)
  );

  // Sondes de session plateformes (throttlées ~10 min) : fire-and-forget,
  // le poll n'attend pas et un échec de sonde n'affecte jamais les jobs.
  // console.error, pas warn : un échec ici veut dire que la détection de
  // connexion aux plateformes n'est JAMAIS remontée en base (vécu : 403
  // silencieux pendant que l'onboarding attendait extension_sessions).
  reportPlatformSessions(session.access_token).catch((e) =>
    console.error(
      "[background] reportPlatformSessions : ÉCHEC — profiles.extension_sessions non écrit, " +
      "l'app ne verra pas l'état de connexion aux plateformes :",
      String(e?.message ?? e)
    )
  );

  let jobs;
  try {
    // build : télémétrie de version (profiles.extension_build via
    // get-pending-jobs) — sert au ciblage du mail « mise à jour extension ».
    // version : PAS de la télémétrie. C'est elle qui autorise le serveur à
    // nous confier une commande de sync mise en file depuis le mobile — une
    // extension qui ne l'envoie pas n'en reçoit jamais, et ne peut donc pas
    // avaler une demande qu'elle ne sait pas exécuter (leçon du 03/08 : une
    // 0.4.x entretient le heartbeat tout en ignorant la commande de sync).
    const rep = await callEdgeFunction("get-pending-jobs", session.access_token, {
      build: FILLSELL_BUILD_ID,
      version: chrome.runtime.getManifest().version,
    });
    jobs = rep.jobs;
    commandeSyncEnAttente = rep.sync_command ?? null;
  } catch (e) {
    console.error("[background] get-pending-jobs:", e);
    if (e?.status === 401) await invalidateRejectedSession(session).catch(() => {});
    return;
  }

  console.log(`[background] ${jobs.length} job(s) pending`);

  // Nouveau cycle : ré-arme le droit à UN onglet temporaire (cf. retryInTempTab).
  tempTabUsedThisPoll = false;

  // Progression live vers le popup (2026-07-18) : le flux POLL n'émettait
  // AUCUN FILLSELL_PROGRESS (réservé à PUBLISH_NOW) — un popup ouvert pendant
  // une publication lancée par le poll montrait des lignes « prêtes » (coche
  // de sélection statique), sans « En attente… » ni « Publication… » (vécu
  // sur un job Leboncoin le 2026-07-18). Mêmes événements que
  // publishSelectedUnlocked, même consommateur côté popup — qui filtre par
  // jobId pour ne peindre que l'annonce affichée (les jobs d'une autre
  // annonce ou les jobs delete sont ignorés là-bas).
  // ── Ordre de traitement (2026-08-07, lot seandemet ; 3 rangs le 2026-08-09) ─
  // RANG 0 — recréations DUES : elles passent AVANT tout, la plus ANCIENNEMENT
  // supprimée d'abord, parce qu'elles ont le plus à perdre (l'annonce est déjà
  // hors ligne sur Vinted, elle ne vend plus tant qu'on ne l'a pas recréée).
  // Sans ce départage, les 8 jobs d'un lot ont le même created_at à la seconde
  // près — l'ordre était arbitraire, et la première recréation aboutie du lot
  // réel a été celle du job supprimé le plus RÉCEMMENT, pendant que le plus
  // ancien attendait depuis 19 minutes.
  //
  // RANG 1 — publish et delete (2026-08-09). La file est un FIFO global sur
  // created_at (get-pending-jobs) et ne connaissait que deux rangs : une
  // publication lancée pendant une file de republications attendait derrière
  // TOUTES celles qui la précédaient. Avec un lot de 100 republications à
  // 8-20 s de pause chacune (JOB_DELAY_MS + jitter), plus 2 à 5 min entre
  // suppression et recréation d'un même article, l'attente se comptait en
  // heures pour un geste que l'utilisateur vient de faire et qu'il regarde.
  // Un delete est logé au même rang : il retire une annonce VENDUE, et le
  // laisser traîner, c'est risquer une double vente.
  //
  // RANG 2 — le reste, c'est-à-dire les republications pas encore supprimées.
  // Les rétrograder est sans danger : l'annonce est toujours EN LIGNE, elle
  // continue de vendre, et rien n'est perdu à la recréer plus tard. C'est
  // précisément ce qui rend l'arbitrage évident — le rang 0 est urgent parce
  // que l'annonce est hors ligne, le rang 2 ne l'est pas parce qu'elle ne
  // l'est pas.
  //
  // Le rythme humain n'est PAS touché : JOB_DELAY_MS, REPUBLISH_ESPACEMENT_MS
  // et next_action_after s'appliquent exactement comme avant. On change l'ORDRE
  // de passage, jamais la cadence.
  // Tri STABLE (index d'origine en départage) : à rang égal, l'ordre de la
  // file est conservé, donc created_at ASC tel que rendu par le serveur.
  const prioriteRepub = (j) => {
    if (j.action === "republish" && j.platform_fields?.republish_step === "deleted") return 0;
    if (j.action === "publish" || j.action === "delete") return 1;
    return 2;
  };
  jobs = jobs
    .map((j, i) => [j, i])
    .sort((a, b) => {
      const pa = prioriteRepub(a[0]), pb = prioriteRepub(b[0]);
      if (pa !== pb) return pa - pb;
      if (pa === 0) {
        const da = Date.parse(a[0].platform_fields?.deleted_at ?? "") || 0;
        const db = Date.parse(b[0].platform_fields?.deleted_at ?? "") || 0;
        if (da !== db) return da - db;
      }
      return a[1] - b[1];
    })
    .map(([j]) => j);

  for (const j of jobs) emitProgress({ jobId: j.id, platform: j.platform, phase: "queued" });

  // Séquentiel : un onglet de publication à la fois, avec une pause entre
  // chaque job (FILLSELL_CONFIG.JOB_DELAY_MS) pour ne pas enchaîner les
  // onglets trop vite.
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    emitProgress({ jobId: job.id, platform: job.platform, phase: "processing" });
    const outcome = await processJob(job, session.access_token);
    // Même persistance des échecs que le flux popup (cf. recordRecentResult) :
    // un job échoué en poll de fond doit aussi s'afficher « Échec » au popup.
    if (outcome && ["failed", "needsUser", "retry"].includes(outcome.status)) {
      await recordRecentResult(job, outcome.status, outcome.error).catch(() => {});
    }
    emitProgress({
      jobId: job.id,
      platform: job.platform,
      phase: outcome?.status ?? "unknown",
      error: outcome?.error,
      listingUrl: outcome?.listingUrl,
    });
    if (i < jobs.length - 1) await sleep(jobDelayMs());
  }

  // Re-capture différée des listing_url manquants (2026-07-12) : LBC/Beebs
  // n'affichent l'annonce dans "Mes annonces" qu'après modération/indexation —
  // l'aller-retour fait dans la foulée du dépôt peut revenir bredouille.
  await recoverMissingListingUrls(session).catch((e) =>
    console.error("[background] recoverMissingListingUrls:", e)
  );

  // Détection de vente (Phase A2, 2026-07-11) : après les jobs du cycle, on
  // vérifie une tranche des annonces published — depuis le NAVIGATEUR du
  // vendeur (cookies + IP + UA réels via fetch credentials:'include'), là où
  // le scraping serveur de l'ancienne check-listing-status se faisait bloquer.
  await checkPublishedListings(session).catch((e) =>
    console.error("[background] checkPublishedListings:", e)
  );

  // Republication AUTOMATIQUE (É6, Pro uniquement — 2026-08-05) : au plus UN
  // article par cycle, mêmes délais humains et mêmes gardes que le manuel.
  await maybeAutoRepublish(session).catch((e) =>
    console.error("[background] maybeAutoRepublish:", e)
  );

  // Fin de cycle : fermer les onglets de travail orphelins (dérive d'avant le
  // fix beforeunload, ou cas résiduel). Sous le verrou de flux, après la boucle
  // de jobs → les ids mémorisés sont à jour, aucun onglet actif n'est fermé.
  await cleanupOrphanWorkTabs().catch((e) =>
    console.error("[background] cleanupOrphanWorkTabs:", e)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));

// Plancher + jitter : deux ouvertures d'onglet ne doivent jamais être
// espacées d'exactement la même durée (cf. FILLSELL_CONFIG).
const jobDelayMs = () =>
  FILLSELL_CONFIG.JOB_DELAY_MS + randInt(0, FILLSELL_CONFIG.JOB_DELAY_JITTER_MS);

// Emoji dans le TITRE (2026-07-12) : generate-listing en produit ("Xiaomi Redmi
// Note 10 5G 128Go Gris Graphite 📱✨", "New Balance 9060 … 🔥") et plusieurs
// plateformes refusent les caractères spéciaux dans ce champ. On nettoie ICI,
// au point d'entrée commun aux 4 handlers : le correctif protège Vinted,
// Leboncoin, eBay et Beebs d'un coup, sans redéployer generate-listing (le
// prompt reste à corriger en amont — voir rapport, en attente du go de Nico).
// La DESCRIPTION n'est PAS touchée : les emoji y sont acceptés et voulus.
function stripEmoji(text) {
  return String(text ?? "")
    // Couverture par PROPRIÉTÉ Unicode (bug réel Casio 2026-07-19) : ⌚ U+231A
    // (bloc Misc. Technical 2300-23FF) échappait aux plages listées — le titre
    // partait avec un ⌚ final et Vinted répondait 400 « Le titre contient trop
    // de symboles d'affilée » (sonde, code 9), déclenché même par UN SEUL
    // symbole. \p{Extended_Pictographic} couvre tout emoji présent et futur
    // (⌚ ⏱ 💧 🖤 ™…) ; les plages explicites restent pour les symboles non
    // pictographiques (flèches, géométrique 25A0-25FF…) ; FE00-FE0F = TOUS les
    // sélecteurs de variante (seul FE0F avant), 200D = ZWJ. « | » (ASCII) et la
    // ponctuation normale ne matchent aucune classe : le séparateur
    // marque/description reste intact.
    .replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeJob(job) {
  const title = stripEmoji(job.title);
  if (title === job.title) return job;
  console.log(`[background] Titre nettoyé (emoji retirés) : "${job.title}" → "${title}"`);
  return { ...job, title };
}

async function processJob(rawJob, accessToken) {
  const job = sanitizeJob(rawJob);
  const handler = PLATFORM_HANDLERS[job.platform];
  if (!handler) {
    console.warn(`[background] Plateforme inconnue "${job.platform}", job ${job.id} laissé en pending`);
    return { status: "skipped", error: `Plateforme inconnue "${job.platform}"` };
  }
  if (!handler.implemented) {
    console.log(`[background] Handler ${job.platform} pas encore implémenté, job ${job.id} laissé en pending`);
    return { status: "skipped", error: `Handler ${job.platform} pas encore implémenté` };
  }

  // Jobs de SUPPRESSION (Phase B, 2026-07-11) : même file, pipeline dédié —
  // pas de pré-check catégorie ni de formulaire de dépôt à ouvrir.
  if (job.action === "delete") return processDeleteJob(job, accessToken);

  // Jobs de REPUBLICATION (É2, 2026-08-05) : machine à étapes persistée en
  // base — voir processRepublishJob et son drapeau REPUBLISH_DRY_RUN.
  if (job.action === "republish") return processRepublishJob(job, accessToken);

  console.log(`[background] Job ${job.id} → ${job.platform}`);

  // Hissé hors du try : sur canal coupé, le catch doit pouvoir interroger la
  // sonde de CET onglet pour savoir si l'annonce a été créée malgré tout.
  let tabId = null;

  try {
    // AVANT tout : catégorie résolue ? Sinon échec sec, sans ouvrir d'onglet
    // ni naviguer (voir precheckJob).
    const blocker = precheckJob(job);
    if (blocker) {
      console.warn(`[background] Job ${job.id} refusé avant navigation — ${blocker}`);
      await updateJobStatus(accessToken, job.id, "failed", { error: blocker });
      return { status: "failed", error: blocker };
    }

    // processing_since : horodatage du DÉBUT de traitement, lu par
    // recoverStaleProcessingJobs pour repêcher un job dont le worker est mort en
    // route. Sans lui, la reprise se baserait sur created_at — qui peut être bien
    // plus ancien que le début réel du traitement (job resté en file).
    // Muté sur la COPIE MÉMOIRE aussi (2026-07-30) : update-job-status écrase
    // platform_fields en entier, et les écritures suivantes (relevé fenêtre
    // ci-dessous, extras de fin) repartent de job.platform_fields — sans cette
    // fusion, elles effaceraient processing_since en base.
    job.platform_fields = { ...(job.platform_fields ?? {}), processing_since: new Date().toISOString() };
    await updateJobStatus(accessToken, job.id, "processing", { platform_fields: job.platform_fields });

    // Onglet de travail UNIQUE, réutilisé de job en job — jamais un onglet
    // neuf par job (voir getOrCreateWorkTab : DataDome a suspendu la session
    // quand les tests accumulaient un onglet Vinted par requête).
    // newListingUrl peut être une fonction (eBay : URL par job, construite
    // avec le categoryId du mapping) ou une chaîne fixe (Vinted, LBC).
    const listingUrl = typeof handler.newListingUrl === "function"
      ? handler.newListingUrl(job)
      : handler.newListingUrl;

    // entryUrl (eBay) : l'onglet de travail atterrit d'abord sur la home du
    // site, puis rejoint le formulaire par une navigation interne — jamais
    // d'ouverture d'onglet directement sur l'URL de dépôt.
    // (workTabId est déclaré HORS du try : le catch en a besoin pour demander à
    // la sonde si l'annonce a malgré tout été créée — cf. canal coupé.)
    tabId = await getOrCreateWorkTab(job.platform, handler.entryUrl ?? listingUrl);

    // ── Observation fenêtre de travail (2026-07-30, mesure DataDome) ─────────
    // État RÉEL fenêtre/onglet au démarrage du job, persisté tout de suite :
    // si le job meurt en route, l'état de départ est déjà sur la ligne.
    // Observation SEULE — voir releverEtatFenetreTravail. Jamais bloquant.
    stampEtatFenetre(job, "at_start", await releverEtatFenetreTravail(job.platform));
    if (job.platform_fields?.work_window_state) {
      await updateJobStatus(accessToken, job.id, "processing", { platform_fields: job.platform_fields })
        .catch((e) => console.warn(`[background] Job ${job.id} : relevé fenêtre non persisté —`, String(e?.message ?? e)));
    }

    if (handler.entryUrl) await navigateHomeToForm(tabId, listingUrl);

    // ⚠️ eBay : onglet PEINT pendant le remplissage (2026-07-12, non encore
    // validé en run réel — voir rapport). Les aspects obligatoires (Marque,
    // Couleur) ne "prennent" pas dans un onglet caché : les commits React y
    // sont différés par le throttling de Chrome, la chip est cliquée mais
    // jamais enregistrée (échec RÉPÉTÉ : « aspect obligatoire vide : Marque »
    // ce soir sur les New Balance, et 3× ce matin sur le Patagonia — malgré
    // les 2 poses et les relectures à 8 s déjà en place). Un onglet peint n'est
    // pas throttlé : c'est exactement la parade qui a débloqué la SUPPRESSION
    // Vinted (cause 0×0 élucidée le 2026-07-12). Le reste des plateformes
    // continue de tourner en arrière-plan, sans voler le focus.
    const release = job.platform === "ebay" ? await paintTab(tabId) : null;

    // Sonde réseau Vinted : installée AVANT le remplissage (elle doit être en
    // place quand le clic Publier part), lue seulement si Vinted refuse.
    // Sonde réseau (Vinted ET eBay depuis le 2026-07-13) : installée AVANT le
    // remplissage — elle doit être en place quand le clic Publier part. Les
    // captures du job PRÉCÉDENT sont purgées d'abord : l'onglet de travail est
    // le même d'un job à l'autre, et une vieille preuve de succès ferait passer
    // le job courant pour publié (doublon garanti).
    // ── eBay : ne JAMAIS remplir puis cliquer sur un onglet figé (2026-08-10)
    // Job 71942bc2 : le brouillon 5214269358621 a bien été créé, le formulaire
    // rempli, et le clic « Mettre en vente » n'a produit AUCUNE requête — la
    // sonde n'a capté que de la télémétrie. Juste avant, la console montrait
    // « neutralizeBeforeUnload : injection sans réponse après 3 s — renderer
    // figé, dialogue beforeunload natif probablement DÉJÀ ouvert ».
    // On teste donc que l'onglet RÉPOND avant de lui confier le dépôt. Rien
    // n'est encore rempli à ce stade : une reprise ici ne peut pas doubler quoi
    // que ce soit. eBay seul — c'est son formulaire /lstng qui pose le
    // beforeunload bloquant, et on ne touche pas aux 3 autres.
    if (job.platform === "ebay") {
      // ── beforeunload neutralisé À LA SOURCE (2026-08-10) ──────────────────
      // eBay installe son dialogue « modifications non enregistrées » sur
      // /lstng dès que le formulaire devient SALE. Jusqu'ici on ne le
      // neutralisait qu'avant une navigation — trop tard : à ce moment le
      // dialogue peut déjà être ouvert, le renderer figé, et l'injection qui
      // devrait le désamorcer ne s'exécute plus (poule/œuf constaté sur le job
      // 71942bc2). Ici, navigateHomeToForm vient de rendre la main sur la vraie
      // page de dépôt et FILL_LISTING n'est pas encore parti : la page est
      // ENCORE SAINE, aucun dialogue n'est possible, l'injection passe.
      // eBay SEUL. Les 8 appels existants de neutralizeBeforeUnload ne sont pas
      // touchés — celui-ci s'ajoute, il n'en remplace aucun.
      const neutralise = await neutralizeBeforeUnload(tabId);
      // ⚠️ CE N'EST PAS `neutralise` QUI DÉCIDE DE JETER L'ONGLET, et c'est
      // volontaire : neutralizeBeforeUnload rend false sur un simple timeout de
      // 3 s, ce qu'une page saine mais momentanément lente peut produire. Le
      // seul juge est tabRepond — une preuve POSITIVE de vie (jeton injecté,
      // jeton relu). Neutralisation ratée + onglet vivant → on continue, on ne
      // jette rien.
      const vivant = await tabRepond(tabId);
      if (!vivant) {
        if (release) await release().catch(() => {});
        return await reprendreSurOngletNeuf(
          accessToken, job, tabId,
          "Onglet de travail eBay figé AVANT le dépôt (renderer muet — dialogue beforeunload resté ouvert ?) : rien n'a été rempli ni soumis",
        );
      }
      if (!neutralise) {
        console.warn(
          `[background] Job ${job.id} : beforeunload NON neutralisé à l'arrivée sur le formulaire, ` +
          "mais l'onglet répond — on continue (aucun onglet valide n'est jeté sur ce seul signal).",
        );
      }
    }

    clearProbeCaptures(tabId);
    await installNetworkProbe(tabId, job.platform);

    // Le content script est déclaré dans le manifest pour ce domaine (il est
    // ré-injecté à chaque navigation/reload de l'onglet de travail) ;
    // on lui envoie le job et on attend le résultat du remplissage.
    let result;
    try {
      result = await sendMessageToTab(tabId, { type: "FILL_LISTING", job });
    } finally {
      // L'utilisateur retrouve son onglet même si le remplissage a jeté.
      if (release) await release().catch(() => {});
    }

    // Brouillon LBC bloquant sur l'onglet persistant : tentative unique dans
    // un onglet temporaire dédié à CE job (voir retryInTempTab — exception
    // bornée, l'onglet persistant et son brouillon ne sont jamais touchés).
    if (result?.draftBlocked) {
      result = await retryInTempTab(job, handler, result);
    }

    // Garde de session eBay : le content script a SIGNALÉ, la sonde tranche
    // (voir arbitrerSessionEbay). Placé AVANT le bloc diagnostic ci-dessous —
    // c'est lui qui fait partir { url, signal, sonde, http } en base, quelle
    // que soit l'issue.
    if (result?.sessionSuspecte && job.platform === "ebay") {
      result = await arbitrerSessionEbay(result);
    }

    // Annexe technique séparée du message utilisateur (2026-08-06) : un dump
    // DOM ou une liste d'options n'a plus JAMAIS sa place dans
    // cross_post_jobs.error — l'app l'affiche tel quel (modale « En attente
    // de toi », vécu sur le job 68420b37). Le détail vit dans
    // platform_fields.last_diagnostic. Mutation de la COPIE MÉMOIRE (même
    // règle que processing_since) : toutes les écritures terminales —
    // rearmBounded, markNeedsUser, failed sec, completionExtras — repartent
    // de job.platform_fields, la valeur part donc en base avec le verdict.
    // Placée APRÈS retryInTempTab : c'est le résultat FINAL qui fait foi.
    // Depuis le 2026-08-11 le canal accepte AUSSI un objet (arbitrerSessionEbay
    // y range { url, signal, sonde, http }) : String() en aurait fait un
    // « [object Object] », c.-à-d. exactement le silence qu'on corrige. La
    // colonne est jsonb ; ->>'last_diagnostic' reste lisible dans les deux cas.
    if (result?.diagnostic) {
      job.platform_fields = {
        ...(job.platform_fields ?? {}),
        last_diagnostic: typeof result.diagnostic === "object" && result.diagnostic !== null
          ? result.diagnostic
          : String(result.diagnostic).slice(0, 2000),
      };
    }

    // Warnings PERSISTÉS (2026-08-08) : platform_fields.warnings =
    // [{code, message, at}] — même mécanique de copie mémoire que
    // last_diagnostic ci-dessus, donc portés par TOUTES les écritures
    // terminales, jobs RÉUSSIS compris (via completionExtras). Sans ça, le
    // repli « Sans marque » sur une vraie marque publiait une annonce
    // dégradée en published propre, sans aucun signal en base ni dans
    // l'app. Les handlers poussent des chaînes (historique) ou des objets
    // {code, message, …} (structuré, ex. brand_fallback_no_brand) — tout
    // est normalisé ici. Un run SANS warning efface ceux d'une tentative
    // précédente : le verdict affiché est celui de la DERNIÈRE tentative.
    {
      const bruts = Array.isArray(result?.warnings) ? result.warnings : [];
      const at = new Date().toISOString();
      const pf = { ...(job.platform_fields ?? {}) };
      if (bruts.length) {
        pf.warnings = bruts.map((w) => (typeof w === "string"
          ? { code: "generic", message: w.slice(0, 500), at }
          : { ...w, code: String(w?.code ?? "generic"), message: String(w?.message ?? "").slice(0, 500), at }));
      } else {
        delete pf.warnings;
      }
      job.platform_fields = pf;
    }

    // Découverte réactive (chantier champs obligatoires, 2026-07-16) : les
    // requis observés pendant CE remplissage partent au catalogue cumulatif,
    // quel que soit le verdict du job — fire-and-forget, jamais bloquant.
    if (result?.discoveredRequired?.length || result?.serverRequired?.length) {
      persistDiscoveredAspects(accessToken, job, [
        ...(result.discoveredRequired ?? []),
        ...(result.serverRequired ?? []).map((f) => ({ ...f, required: true, source: "server_400" })),
      ]).catch(() => {});
    }

    if (result?.dryRun) {
      // Dry-run réussi → statut TERMINAL, PAS de ré-armement en pending.
      // Sinon le job repartait à chaque cron de 30 min (get-pending-jobs le
      // resélectionnait), rouvrant des onglets en boucle → suspension
      // DataDome (incident vécu). Pour re-tester, régénérer le job depuis
      // l'app. L'onglet de travail reste ouvert pour inspection jusqu'au
      // prochain job.
      console.log(`[background] Job ${job.id} : DRY_RUN réussi → dry_run_completed (terminal, plus de boucle)`);
      await updateJobStatus(accessToken, job.id, "dry_run_completed", completionExtras(job, result));
      await recordRecentResult(job, "dry_run_completed");
      return { status: "dry_run_completed", unfilled: result.unfilledRequired ?? [] };
    } else if (result?.needsUser) {
      // Dépôt LBC sans signal lisible (2026-07-19, job 0591781d) : AVANT de
      // ré-armer — un re-dépôt aveugle créerait un DOUBLON si le dépôt avait
      // en réalité abouti sans que le content script lise la confirmation —
      // on vérifie « Mes annonces » par TITRE (captureFromMyListings passe
      // requireTitle:true : jamais l'URL d'une autre annonce, leçon
      // listing_url croisée). Trouvée → publié AVEC URL (même filet que
      // ebayConfirmViaActiveListings) ; absente → le needsUser était juste.
      if (job.platform === "leboncoin" && result.depositUnconfirmed && job.title && tabId != null) {
        const url = await captureFromMyListings(
          tabId, "leboncoin", LISTING_URL_PATTERNS.leboncoin, MY_LISTINGS_URL.leboncoin, job.title
        ).catch(() => null);
        if (url) {
          console.log(`[background] Job ${job.id} : dépôt LBC confirmé a posteriori par Mes annonces — ${url}`);
          await updateJobStatus(accessToken, job.id, "published", {
            ...completionExtras(job, result),
            listing_url: url,
          });
          await recordRecentResult(job, "published");
          return { status: "published", listingUrl: url };
        }
      }
      // ── Tri (a)/(b) du socle needs_user (2026-07-19) ────────────────────────
      // (a) Le handler a identifié UN champ précis à trancher (needsUserField
      //     posé par lui, jamais deviné ici) → statut PERSISTÉ 'needs_user' :
      //     le job attend la décision de l'utilisateur dans l'app (badge
      //     « À compléter » du Stock), AUCUNE re-tentative automatique —
      //     get-pending-jobs ne distribue que 'pending'.
      // (b) Tout le reste (connexion, adresse, brouillon LBC, écran inconnu,
      //     page changée…) : comportement HISTORIQUE inchangé — ré-armement
      //     borné (MAX_NEEDS_USER_RETRIES) puis 'failed'.
      if (result.needsUserField?.field_key && result.needsUserField?.field_label) {
        await markNeedsUser(accessToken, job, result);
        return { status: "needsUser", error: result.error };
      }
      // Action utilisateur requise (adresse Leboncoin absente, brouillon LBC
      // à terminer, connexion). Ré-armement BORNÉ (voir rearmBounded).
      // « Connexion X requise » = le handler a VU la page de login après une
      // navigation réelle : signal sûr, répercuté dans extension_sessions
      // (noterSessionDeconnectee) — c'est désormais la SEULE source d'un
      // false pour Vinted (le 401 de la sonde est ambigu, cf. sonde).
      // ⚠️ eBay : PLUS JAMAIS sur le seul verdict du handler (2026-08-11).
      // C'est cette ligne qui faisait le vrai dégât : un soupçon de page
      // écrasait le relevé de la sonde (ebay:false + http
      // 'login_redirect_observee', hors throttle), et le bandeau de l'app
      // annonçait « non connecté » à quelqu'un qui l'était — pendant que la
      // sonde, elle, disait 200 neuf minutes plus tard. Seul un arbitrage
      // CONFIRMÉ par la sonde (sessionConfirmee) écrit désormais pour eBay.
      // Les autres plateformes sont inchangées : leur garde d'entrée reste le
      // signal sûr, et Beebs est un chantier séparé (7 échecs du même message,
      // mais sa sonde rend null par conception — aucun arbitre disponible).
      const verdictSessionEcrivable = job.platform === "ebay"
        ? result?.sessionConfirmee === true
        : true;
      if (verdictSessionEcrivable && /^Connexion\s+\S+\s+requise/i.test(String(result.error ?? ""))) {
        noterSessionDeconnectee(accessToken, job.platform).catch((e) =>
          console.warn("[background] noterSessionDeconnectee (non bloquant) :", String(e?.message ?? e)));
      }
      await rearmBounded(accessToken, job, result.error);
      return { status: "needsUser", error: result.error };
    } else if (result?.success) {
      // Ré-authentification post-clic (2026-07-11, constaté en réel sur eBay) :
      // le clic "Mettre en vente avec les frais affichés" a redirigé l'onglet
      // vers signin.ebay.fr (clé d'accès / passkey). Le content script, lui,
      // avait déjà répondu success — l'annonce n'existe pourtant PAS. La
      // navigation détruit son contexte, donc SEUL le background peut voir
      // l'écran de reconnexion. Traité comme un needsUser standard (même
      // mécanique que l'adresse LBC manquante) : ré-armement borné, message
      // clair, et le prochain poll retentera une fois l'utilisateur reconnecté.
      const reauth = await detectReauth(tabId, job.platform);
      if (reauth) {
        console.warn(`[background] Job ${job.id} : ${reauth}`);
        await rearmBounded(accessToken, job, reauth);
        return { status: "needsUser", error: reauth };
      }

      // Vérification de SOUMISSION (2026-07-12, vécu en LIVE réel sur eBay) :
      // le content script répond success juste après le clic, mais la
      // validation eBay peut refuser SUR PLACE (« Vous devez ajouter une
      // description », formulaire jamais soumis) — le job partait quand même
      // en "published" fantôme. Seul le background peut trancher : il survit
      // à la redirection (succès) comme à l'absence de redirection (refus).
      if (job.platform === "ebay") {
        const verdict = await verifyEbaySubmission(tabId, 20_000, job, accessToken);
        // ── PREUVE DE SORTIE PERSISTÉE (2026-08-10) ───────────────────────────
        // Jusqu'ici, `published` s'écrivait sans que rien ne dise LAQUELLE des
        // sorties de verifyEbaySubmission avait servi. Sur le job 56c15a53 il a
        // fallu un dépôt eBay réel pour éliminer les hypothèses, et on n'a
        // toujours pas pu trancher. Clés purement OBSERVATIONNELLES : elles ne
        // changent aucune décision, elles rendent la prochaine enquête lisible
        // en une requête. Mutation de la COPIE MÉMOIRE (même règle que
        // processing_since / last_diagnostic) : toutes les écritures terminales
        // repartent de job.platform_fields, la valeur part donc en base avec le
        // verdict, y compris sur les jobs RÉUSSIS.
        //   publish_proof.exit : 'notice_url' | 'notice_no_url' |
        //     'server_response' | 'hub_title' | 'tab_gone' | 'path_left_lstng' |
        //     'form_refused' | 'timeout_unconfirmed'
        if (verdict.proof) {
          job.platform_fields = {
            ...(job.platform_fields ?? {}),
            publish_proof: {
              exit: verdict.proof,
              at: new Date().toISOString(),
              // path_au_clic : où l'onglet était AU CLIC — la seule valeur qui
              // dise quelque chose du dépôt. final_path reste le chemin au
              // VERDICT (utile, mais pollué par nos propres navigations : sur
              // la branche timeout il vaut /sh/lst/active, le Hub où l'on vient
              // d'aller chercher la confirmation).
              path_au_clic: verdict.state?.path_au_clic ?? null,
              final_path: verdict.state?.path ?? null,
              overlay_present: verdict.state?.overlay_present ?? null,
              bot_shield_after_submit: verdict.state?.bot_shield_after_submit ?? null,
              listing_url_capturee: Boolean(verdict.listingUrl),
            },
          };
        }
        // ── Sortie « formulaire quitté » : TERMINALE, jamais ré-armée ─────────
        // MESURÉ : un succès eBay ne quitte pas /lstng (cf. verifyEbaySubmission).
        // Quitter /lstng signe donc un captcha, une page de connexion ou une
        // page d'erreur — pas une annonce. On ferme le job en `failed` :
        //   · PAS `published` — c'était le mensonge, aucune annonce n'existe ;
        //   · PAS `pending` — get-pending-jobs ne distribue que pending/
        //     processing/needs_user : ré-armer, c'est re-déposer, donc risquer
        //     le second dépôt payant. Vérifié : aucun chemin de relance
        //     automatique ne lit `failed` (get-pending-jobs, recoverStale…
        //     `status=eq.processing`, recoverMissingListingUrls et
        //     checkPublishedListings `status=eq.published`, handler-watch lit
        //     `failed` pour ALERTER seulement, email-tunnel `status=eq.pending`).
        // La Pépite est rendue par le release sur job terminal en échec : aucun
        // code de remboursement ici.
        if (verdict.fatal) {
          const msgFatal =
            "Publication eBay NON aboutie : l'onglet a quitté le formulaire " +
            `(${verdict.state?.path ?? "page inconnue"}) sans que l'annonce soit confirmée` +
            (verdict.state?.bot_shield_after_submit ? " — eBay a servi une vérification anti-robot" : "") +
            ". Aucune annonce n'a été créée. Vérifier « Vendre > Annonces actives » sur eBay " +
            "AVANT de relancer, pour ne pas déposer deux fois.";
          console.warn(`[background] Job ${job.id} : ${msgFatal}`);
          await updateJobStatus(accessToken, job.id, "failed", {
            error: msgFatal,
            platform_fields: job.platform_fields,
          });
          await recordRecentResult(job, "failed", msgFatal).catch(() => {});
          return { status: "failed", error: msgFatal };
        }
        // ── La soumission n'a jamais quitté le navigateur (2026-08-10) ───────
        // Aucune requête vers /lstng/api/listing_draft/{id}/publish dans les
        // captures : le clic n'a rien produit. C'est une PREUVE POSITIVE
        // d'absence de dépôt — donc la seule situation où reprendre est à la
        // fois sûr et utile. On repart sur un onglet neuf SANS consommer de
        // tentative : la cause est notre onglet, pas eBay.
        if (verdict.proof === "submit_never_sent") {
          if (verdict.diagnostic) {
            job.platform_fields = {
              ...(job.platform_fields ?? {}),
              last_diagnostic: String(verdict.diagnostic).slice(0, 2000),
            };
          }
          return await reprendreSurOngletNeuf(
            accessToken, job, tabId,
            "Le clic « Mettre en vente » n'a produit AUCUNE requête de publication (soumission jamais partie) : aucune annonce n'a été créée",
          );
        }
        if (verdict.error) {
          console.warn(`[background] Job ${job.id} : ${verdict.error}${verdict.diagnostic ?? ""}`);
          // Annexe sonde/popup → last_diagnostic (rearmBounded repart de
          // job.platform_fields), le message utilisateur reste court.
          if (verdict.diagnostic) {
            job.platform_fields = {
              ...(job.platform_fields ?? {}),
              last_diagnostic: String(verdict.diagnostic).slice(0, 2000),
            };
          }
          await rearmBounded(accessToken, job, verdict.error);
          return { status: "needsUser", error: verdict.error };
        }
        // Numéro d'annonce déjà extrait de la preuve (modale ou réponse
        // serveur) : c'est le listing_url, inutile de repasser par la capture.
        if (verdict.listingUrl && !result.listingUrl) result.listingUrl = verdict.listingUrl;
      }

      // ── PUBLICATION ET CAPTURE D'URL SONT DÉCOUPLÉES (règle Nico, 2026-07-13)
      // Un job est PUBLIÉ dès que la plateforme a confirmé le dépôt. Le
      // listing_url est un ENRICHISSEMENT : on le prend s'il est là tout de
      // suite, sinon il est vide — ce n'est ni une erreur, ni un échec, et
      // recoverMissingListingUrls (à chaque cycle de poll, jusqu'à 48 h) le
      // récupérera. Aucun job ne doit plus rester incomplet parce qu'une
      // plateforme met du temps à indexer son annonce.
      //
      // Sources, de la moins chère à la plus chère :
      //   1. le content script (redirection observée sur place) ;
      //   2. la RÉPONSE SERVEUR captée par la sonde (Vinted et eBay) — gratuite
      //      et immédiate, elle porte le numéro d'annonce ;
      //   3. le repli page/aller-retour "Mes annonces" (captureListingUrl), qui
      //      coûte une navigation… et qui est INUTILE sur les plateformes à
      //      modération : l'annonce n'y figure pas encore.
      let listingUrl = result.listingUrl ?? null;
      if (!listingUrl && job.platform === "vinted") listingUrl = await vintedUploadSucceeded(tabId).catch(() => null);
      if (!listingUrl && job.platform === "ebay") listingUrl = await ebayUploadSucceeded(tabId, accessToken).catch(() => null);

      // Beebs : dépôt CONFIRMÉ mais annonce en MODÉRATION (« il sera mis en
      // ligne dès qu'il aura été vérifié par notre équipe ») — elle n'est PAS
      // dans « Mes annonces » à cet instant. L'aller-retour ne pouvait donc que
      // revenir bredouille, en coûtant plusieurs minutes au job (7 min sur le
      // job 16f10f4a). On ne le tente même plus : le job est publié, l'URL
      // viendra plus tard, par la re-capture différée.
      if (!listingUrl && !PLATFORMS_WITH_DEFERRED_URL.has(job.platform)) {
        listingUrl = await captureListingUrl(tabId, job.platform, job);
      }
      if (!listingUrl) {
        console.log(
          `[background] Job ${job.id} (${job.platform}) : publié, listing_url différé ` +
          "(modération/indexation en cours) — recoverMissingListingUrls le récupérera."
        );
      }
      console.log(`[background] Job ${job.id} publié : ${listingUrl ?? "(URL non récupérée)"}`);
      await updateJobStatus(accessToken, job.id, "published", {
        ...completionExtras(job, result),
        listing_url: listingUrl ?? undefined,
      });
      await recordRecentResult(job, "published");
      // L'onglet n'est PAS fermé : il sert au job suivant, comme un humain
      // qui garde son onglet Vinted ouvert entre deux dépôts.
      return { status: "published", listingUrl };
    } else {
      // Vinted a refusé : on joint à l'erreur ce que la SONDE a vu passer sur le
      // réseau (prix réellement envoyé + réponse du serveur). C'est ce message
      // qui doit trancher, au prochain run, entre « la saisie ne part pas » et
      // « Vinted attend autre chose ».
      const base = result?.error || "Le content script n'a pas retourné de résultat";
      const probe = job.platform === "vinted" ? await readVintedProbe(tabId) : "";
      // Requis révélés par le REFUS serveur (400 parsé par la sonde) : portés
      // par platform_fields.server_required_fields en plus du message — c'est
      // ce que l'app lit pour proposer la saisie manuelle avec le libellé
      // EXACT au lieu d'un échec opaque (chantier champs obligatoires).
      if (result?.serverRequired?.length) {
        // Le relevé reste posé quoi qu'il arrive : c'est lui qui alimente le
        // catalogue (source server_400) et qui documente le refus en base.
        job.platform_fields = {
          ...(job.platform_fields ?? {}),
          server_required_fields: result.serverRequired,
        };
        // ── UN REFUS SERVEUR NOMMÉ DEVIENT UN needs_user (2026-08-10) ────────
        // Mesuré en base : 4 jobs ont porté server_required_fields, TOUS en
        // `failed` — le refus 400 de Vinted n'alimentait donc jamais le
        // mini-éditeur, alors qu'il nomme le champ exact (job db33a92f :
        // field="color", « Le champ Couleur doit être renseigné », après un
        // premier needs_user déjà résolu sur la taille).
        // Trois gardes, dans cet ordre :
        //   1. VINTED SEUL. serverRequired est aussi produit par leboncoin.js ;
        //      son chemin reste EXACTEMENT celui d'aujourd'hui.
        //   2. CHAMP RÉELLEMENT RÉSOLUBLE. Un 400 sur title/description/price/
        //      photos/catalog_id/package_size_id ne se corrige pas en
        //      choisissant une valeur dans une modale — l'y envoyer bloquerait
        //      la Pépite sur un champ sans issue. Ceux-là restent `failed`,
        //      remboursés comme aujourd'hui. Tout le reste est un code
        //      d'attribut : soit ponté vers un champ dédié (_bridge de
        //      vinted.js : brand, model, condition, material, size, sim_lock,
        //      internal_memory_capacity), soit `color` (ponté vers fields.colors),
        //      soit consommé par la boucle générique vintedAspects — c'est
        //      précisément ce que le 400 sert à DÉCOUVRIR, on ne ferme donc pas
        //      la porte aux codes inconnus.
        //   3. PLAFOND EXISTANT, inchangé : needsUserAttempts < 2. Atteint →
        //      `failed`, donc réservation soldée et Pépite rendue, comme avant.
        // Aucun risque de second dépôt : ce chemin n'est atteint QUE sur un 400
        // de validation lu dans la réponse de /api/v2/item_upload/items
        // (readServerValidationErrors n'accepte que status >= 400) — Vinted dit
        // lui-même que l'annonce n'a pas été créée.
        const NON_RESOLUBLES = new Set(["title", "description", "price", "photos", "catalog_id", "package_size_id"]);
        const champ = job.platform === "vinted"
          ? result.serverRequired.find((f) => f?.key && !NON_RESOLUBLES.has(String(f.key)))
          : null;
        const tentatives = Number(job.platform_fields?.needsUserAttempts ?? 0);
        if (champ && tentatives < MAX_NEEDS_USER_RETRIES) {
          job.platform_fields = { ...job.platform_fields, needsUserAttempts: tentatives + 1 };
          await markNeedsUser(accessToken, job, {
            error: base + probe,
            needsUserField: {
              field_key: champ.key,
              field_label: champ.label || champ.key,
              // Cible d'écriture du mini-éditeur : vintedAspects.<code serveur>.
              // C'est le canal que vinted.js relit (pont dédié, cas `color`, ou
              // boucle générique) — la modale de l'app n'a rien à apprendre.
              target: { root: "vintedAspects", key: champ.key },
            },
          });
          return { status: "needsUser", error: base };
        }
        await updateJobStatus(accessToken, job.id, "failed", {
          error: base + probe,
          platform_fields: job.platform_fields,
        });
        return { status: "failed", error: base };
      }
      throw new Error(base + probe);
    }
  } catch (e) {
    const msg = String(e?.message ?? e);
    // Canal de message coupé en plein remplissage (navigation/reload de
    // l'onglet, rechargement de l'extension pendant un test) : transitoire,
    // pas un verdict sur le job — ré-armement borné plutôt que failed sec
    // (cas réel du 2026-07-06 : "message channel closed before a response").
    // « No tab with id » AJOUTÉ le 2026-07-19 (job eBay bloqué dans le popup) :
    // c'est l'erreur de chrome.tabs.sendMessage/tabs.* quand l'ONGLET même a
    // été fermé en plein job (fenêtre de travail fermée, rechargement
    // d'extension) — même nature transitoire que le canal coupé, elle partait
    // pourtant en failed sec avec l'erreur Chrome brute.
    // TIMEOUTS DE CHARGEMENT AJOUTÉS le 2026-07-22 — c'est LA cause du
    // Patagonia perdu sur eBay (job 244b0ec4) : « Timeout: la page de dépôt
    // n'a pas fini de charger » tombait ici, ne matchait rien, et partait en
    // `failed` SEC ligne du dessous. Une page qui met plus longtemps que prévu
    // à charger est pourtant l'archétype du transitoire — Beebs, Vinted et
    // Leboncoin ont publié le même article dans la minute. Zéro re-tentative
    // pour un aléa réseau, c'est un cross-post amputé sans recours, alors que
    // le prochain cron aurait très probablement réussi. Même traitement que le
    // canal coupé : ré-armement BORNÉ (MAX_NEEDS_USER_RETRIES), jamais infini.
    if (TRANSIENT_JOB_ERROR_RE.test(msg)) {
      // ⚠️ D'ABORD : le canal coupé peut être la SIGNATURE D'UN SUCCÈS.
      // Vinted REDIRIGE après une publication réussie — la redirection détruit
      // le content script AVANT qu'il ne réponde, et le job partait en retry
      // puis en "failed" alors que l'annonce était EN LIGNE (job ba84ebb0,
      // 2026-07-13 : New Balance 125 € publiée, job failed). Ne jamais conclure
      // à l'échec sans avoir demandé au serveur ce qu'il a répondu : les
      // captures de la sonde sont relayées au background et SURVIVENT à la
      // mort de la page.
      const publishedUrl = job.platform === "vinted" && tabId != null
        ? await vintedUploadSucceeded(tabId).catch(() => null)
        : null;
      if (publishedUrl) {
        console.log(
          `[background] Job ${job.id} : canal coupé PAR LA REDIRECTION de succès — ` +
          `l'annonce EXISTE (${publishedUrl}), publication confirmée par la réponse serveur`
        );
        await updateJobStatus(accessToken, job.id, "published", {
          error: null,
          listing_url: publishedUrl,
        });
        await recordRecentResult(job, "published");
        return { status: "published", listingUrl: publishedUrl };
      }

      console.warn(`[background] Job ${job.id} : incident transitoire (canal coupé ou page trop lente) — ${msg}`);
      await rearmBounded(accessToken, job, `Publication interrompue, nouvelle tentative au prochain cycle : ${msg}`)
        .catch((err) => console.error("[background] update-job-status failed:", err));
      return { status: "retry", error: msg };
    }
    console.error(`[background] Job ${job.id} en échec:`, e);
    // Observation fenêtre (2026-07-30) : re-relevé sur le failed sec aussi —
    // platform_fields joint pour porter work_window_state.at_end en base.
    stampEtatFenetre(job, "at_end", await releverEtatFenetreTravail(job.platform));
    await updateJobStatus(accessToken, job.id, "failed", { error: msg, platform_fields: job.platform_fields })
      .catch((err) => console.error("[background] update-job-status failed:", err));
    return { status: "failed", error: msg };
  }
}

// ── Incomplétude visible depuis la DB (fix du 2026-07-09) ─────────────────────
// Un job ne doit JAMAIS se déclarer réussi en silence alors qu'un champ que le
// handler considère OBLIGATOIRE est resté vide. C'était le cas : un dry-run
// Beebs Figurines remontait dry_run_completed / error:null pendant qu'Âge et
// Matière affichaient "Sélectionner une valeur" en rouge sur la page — seule
// une inspection visuelle pouvait le voir.
//
// Le statut reste inchangé (dry_run_completed / published : le remplissage a
// bien eu lieu), mais :
//   - `error` porte un préfixe explicite, cherchable en base ;
//   - `platform_fields.unfilled_required_fields` porte la liste brute, pour
//     filtrer/agréger sans parser du texte.
// Les handlers ne remontent ici que des champs déjà marqués obligatoires dans
// leur propre code (Beebs : libellé sans "(facultatif)" ; Leboncoin : univers
// et Produit*). Vinted et eBay renvoient toujours une liste vide — leur seul
// champ requis, le genre, est bloqué en amont par precheckJob.
const UNFILLED_PREFIX = "COMPLÉTÉ AVEC CHAMPS MANQUANTS";

// Un warning est une chaîne (historique) ou un objet {code, message, …}.
const warningMessage = (w) => (typeof w === "string" ? w : String(w?.message ?? ""));

function completionExtras(job, result) {
  const unfilled = result.unfilledRequired ?? [];
  const warnings = result.warnings ?? [];
  const parts = [];
  if (unfilled.length) parts.push(`${UNFILLED_PREFIX} : ${unfilled.join(", ")}`);
  if (warnings.length) parts.push(`Warnings: ${warnings.map(warningMessage).join(" | ")}`);

  const extras = { error: parts.length ? parts.join(". ") : null };
  if (unfilled.length) {
    console.warn(`[background] Job ${job.id} : ${UNFILLED_PREFIX} : ${unfilled.join(", ")}`);
  }
  // platform_fields TOUJOURS joint (2026-08-08 — il ne l'était qu'avec des
  // unfilled) : la copie mémoire porte désormais warnings/last_diagnostic
  // posés en amont, et un run propre doit aussi pouvoir EFFACER les warnings
  // d'une tentative précédente. Fusion sur la copie mémoire, jamais
  // d'écrasement des autres clés (mapping catégorie, needsUserAttempts…).
  extras.platform_fields = {
    ...(job.platform_fields ?? {}),
    ...(unfilled.length ? { unfilled_required_fields: unfilled } : {}),
  };
  return extras;
}

// Ré-armement BORNÉ d'un job en pending : au plus MAX_NEEDS_USER_RETRIES
// passages, sinon le job bouclerait indéfiniment (rouvrant un onglet +
// remplissant le formulaire à chaque cron) si la cause ne disparaît jamais —
// même risque DataDome que le dry-run en boucle. Compteur porté par
// platform_fields.needsUserAttempts (partagé needsUser / erreurs transitoires).
// ── Reprise sur onglet neuf, SANS consommer de tentative (2026-08-10) ───────
// Un onglet de travail figé n'est pas un refus de la plateforme : c'est notre
// outil qui est cassé, pas le dépôt qui est mauvais. Le faire décompter sur
// needsUserAttempts, c'est brûler le budget d'un job parfaitement valide — le
// 71942bc2 est mort comme ça (needsUserAttempts=2, alors que la soumission
// n'avait jamais quitté le navigateur).
// Compteur SÉPARÉ et borné : `frozenTabRetries`. Sans borne, un onglet qui gèle
// systématiquement bouclerait à l'infini ; needsUserAttempts, lui, n'est pas
// touché.
// ⚠️ À N'APPELER QUE SUR PREUVE POSITIVE qu'AUCUNE soumission n'est partie
// (onglet muet AVANT le remplissage, ou aucune requête publish captée). C'est
// cette preuve, et elle seule, qui écarte le risque de second dépôt payant.
const MAX_FROZEN_TAB_RETRIES = 2;
async function reprendreSurOngletNeuf(accessToken, job, tabId, motif) {
  const actuel = await jobStatusNow(accessToken, job.id);
  if (actuel && actuel !== "processing" && actuel !== "pending") {
    console.warn(`[background] Job ${job.id} : statut devenu "${actuel}" — reprise onglet ABANDONNÉE.`);
    return { status: "needsUser", error: motif };
  }
  const reprises = Number(job.platform_fields?.frozenTabRetries ?? 0) + 1;
  const pf = { ...(job.platform_fields ?? {}), frozenTabRetries: reprises };
  // L'onglet mort part quoi qu'il arrive : le laisser, c'est le retrouver au
  // job suivant. replaceWorkTab neutralise puis ferme, et mémorise le neuf.
  if (tabId != null) {
    try {
      const cible = (PLATFORM_HANDLERS[job.platform]?.entryUrl ?? "https://www.ebay.fr/") + WORK_TAB_FRAGMENT;
      const neuf = await replaceWorkTab(tabId, cible);
      await chrome.storage.session.set({ [workTabKey(job.platform)]: neuf });
      console.log(`[background] Job ${job.id} : onglet ${tabId} remplacé par ${neuf} (${motif})`);
    } catch (e) {
      console.warn(`[background] Job ${job.id} : remplacement d'onglet impossible — ${String(e?.message ?? e)}`);
    }
  }
  if (reprises > MAX_FROZEN_TAB_RETRIES) {
    const msg = `${motif} — ${reprises - 1} reprises sur onglet neuf n'ont rien changé, job arrêté. Aucune annonce n'a été créée.`;
    console.warn(`[background] Job ${job.id} : ${msg}`);
    await updateJobStatus(accessToken, job.id, "failed", { error: msg, platform_fields: pf });
    await recordRecentResult(job, "failed", msg).catch(() => {});
    return { status: "failed", error: msg };
  }
  console.warn(`[background] Job ${job.id} : reprise ${reprises}/${MAX_FROZEN_TAB_RETRIES} sur onglet neuf — ${motif}`);
  await updateJobStatus(accessToken, job.id, "pending", { error: motif, platform_fields: pf });
  return { status: "retry", error: motif };
}

async function rearmBounded(accessToken, job, errorMsg) {
  // ⚠️ NE JAMAIS RESSUSCITER UN JOB ANNULÉ (2026-07-13, vécu). Un job de
  // suppression Beebs annulé À LA MAIN (il visait la mauvaise annonce !) avait
  // déjà été happé par le cycle en cours : son échec a déclenché ce ré-armement,
  // qui a réécrit status='pending' par-dessus le 'cancelled' — le job est
  // reparti comme si de rien n'était, en route pour supprimer la mauvaise
  // annonce. Une annulation doit être DÉFINITIVE : on relit le statut réel avant
  // d'écrire quoi que ce soit.
  const actuel = await jobStatusNow(accessToken, job.id);
  if (actuel && actuel !== "processing" && actuel !== "pending") {
    console.warn(
      `[background] Job ${job.id} : statut devenu "${actuel}" pendant le traitement — ` +
      `ré-armement ABANDONNÉ (on ne réécrit pas par-dessus). Cause de l'échec : ${errorMsg}`
    );
    return;
  }

  // Observation fenêtre (2026-07-30) : re-relevé au moment où le job échoue ou
  // repart en needsUser — croisable en SQL avec at_start. Jamais bloquant.
  stampEtatFenetre(job, "at_end", await releverEtatFenetreTravail(job.platform));

  const attempts = (job.platform_fields?.needsUserAttempts ?? 0) + 1;
  if (attempts >= MAX_NEEDS_USER_RETRIES) {
    console.warn(`[background] Job ${job.id} : cause toujours présente après ${attempts} tentatives → failed (sort de la boucle) — ${errorMsg}`);
    // platform_fields joint depuis le 2026-07-30 : porte le relevé fenêtre
    // (work_window_state.at_end) sur la ligne failed, comme la branche pending.
    await updateJobStatus(accessToken, job.id, "failed", {
      error: errorMsg,
      platform_fields: { ...(job.platform_fields ?? {}), needsUserAttempts: attempts },
    });
  } else {
    console.warn(`[background] Job ${job.id} : ré-armement (tentative ${attempts}/${MAX_NEEDS_USER_RETRIES}) — ${errorMsg}`);
    await updateJobStatus(accessToken, job.id, "pending", {
      error: errorMsg,
      platform_fields: { ...(job.platform_fields ?? {}), needsUserAttempts: attempts },
    });
  }
}

// ── Statut PERSISTÉ 'needs_user' (socle 2026-07-19) ────────────────────────────
// Un handler a identifié UN champ obligatoire précis que seul l'utilisateur
// peut trancher (result.needsUserField = { field_key, field_label,
// allowed_values?, target? }). Le job passe en 'needs_user' : il SORT de la
// file (get-pending-jobs ne distribue que 'pending') et attend le mini-éditeur
// du Stock. Enrichissement : si le handler n'a pas pu joindre la liste des
// valeurs possibles (dropdown jamais ouvert), on la récupère du catalogue
// cumulatif platform_category_aspects (allowed_values apprises lors de jobs
// précédents) — best-effort, jamais bloquant. `target` dit à l'app OÙ écrire
// la valeur dans platform_fields ({ root: "<canal aspects>"|null, key }) —
// c'est le handler qui le sait, l'app ne devine rien.
async function markNeedsUser(accessToken, job, result) {
  // Même garde que rearmBounded : ne JAMAIS réécrire par-dessus un statut
  // devenu terminal/annulé pendant le traitement (leçon du job Beebs annulé
  // à la main, 2026-07-13).
  const actuel = await jobStatusNow(accessToken, job.id);
  if (actuel && actuel !== "processing" && actuel !== "pending") {
    console.warn(
      `[background] Job ${job.id} : statut devenu "${actuel}" pendant le traitement — ` +
      `needs_user ABANDONNÉ (on ne réécrit pas par-dessus). Cause : ${result.error}`
    );
    return;
  }

  // Observation fenêtre (2026-07-30) : re-relevé au passage en needs_user —
  // l'écriture ci-dessous repart de job.platform_fields et l'emporte.
  stampEtatFenetre(job, "at_end", await releverEtatFenetreTravail(job.platform));

  const f = result.needsUserField;
  let allowed = Array.isArray(f.allowed_values) && f.allowed_values.length ? f.allowed_values : null;
  if (!allowed) {
    try {
      const rows = await restRequest(
        `platform_category_aspects?platform=eq.${encodeURIComponent(job.platform)}` +
        `&category_key=eq.${encodeURIComponent(categoryKeyOf(job).slice(0, 300))}` +
        `&field_key=eq.${encodeURIComponent(String(f.field_key).slice(0, 120))}` +
        "&select=allowed_values",
        accessToken
      );
      const av = rows?.[0]?.allowed_values;
      if (Array.isArray(av) && av.length) allowed = av;
    } catch (e) {
      console.warn("[background] markNeedsUser : lecture catalogue en échec (non bloquant) :", String(e?.message ?? e));
    }
  }

  console.warn(`[background] Job ${job.id} : champ à trancher « ${f.field_label} » → needs_user (attend l'utilisateur, aucune re-tentative)`);
  await updateJobStatus(accessToken, job.id, "needs_user", {
    error: result.error,
    platform_fields: {
      ...(job.platform_fields ?? {}),
      needsUserField: {
        platform: job.platform,
        field_key: String(f.field_key).slice(0, 120),
        field_label: String(f.field_label).slice(0, 200),
        ...(f.target && f.target.key ? { target: { root: f.target.root ?? null, key: String(f.target.key).slice(0, 200) } } : {}),
        ...(allowed ? { allowed_values: allowed.slice(0, 200).map((v) => String(v)) } : {}),
      },
    },
  });
}

// ── Exception brouillon Leboncoin : onglet temporaire par job ──────────────────
// Cas fréquent en pratique : chaque dry-run LBC laisse NOTRE propre brouillon
// à l'aperçu (on remplit le wizard sans jamais publier), donc tout job LBC
// suivant trouve l'onglet persistant bloqué — et un utilisateur peut aussi
// avoir son propre brouillon manuel en cours. Plutôt qu'un needsUser
// systématique, on traite CE job dans un onglet temporaire : si le brouillon
// vit dans l'état de l'onglet (sessionStorage), l'onglet neuf repart de zéro.
//
// EXCEPTION bornée, pas une stratégie (règles anti-DataDome permanentes,
// l'onglet persistant getOrCreateWorkTab reste la norme) :
//   - au plus UN onglet temporaire par cycle de poll (jamais en rafale sur
//     plusieurs jobs : les suivants repartent en needsUser → prochain cron),
//   - jamais à moins de JOB_DELAY_MS du précédent (même délai que les autres
//     opérations sensibles, persisté en storage.session pour survivre aux
//     redémarrages du service worker),
//   - l'onglet temporaire est TOUJOURS fermé une fois le job terminé
//     (dry-run, publication ou erreur) — rien ne traîne à côté du persistant,
//   - le brouillon de l'onglet persistant n'est jamais touché,
//   - si le brouillon réapparaît dans l'onglet neuf (brouillon de compte,
//     pas d'onglet), on rend la main : un autre onglet n'y changerait rien.
let tempTabUsedThisPoll = false;
const TEMP_TAB_LAST_KEY = "fillsell_temp_tab_last_at";

async function retryInTempTab(job, handler, originalResult) {
  if (tempTabUsedThisPoll) {
    console.log(`[background] Job ${job.id} : brouillon bloquant, mais l'onglet temporaire de ce cycle a déjà servi → needsUser (prochain cron)`);
    return originalResult;
  }
  const store = await chrome.storage.session.get(TEMP_TAB_LAST_KEY);
  if (Date.now() - (store[TEMP_TAB_LAST_KEY] ?? 0) < FILLSELL_CONFIG.JOB_DELAY_MS) {
    console.log(`[background] Job ${job.id} : dernier onglet temporaire trop récent → needsUser (prochain cron)`);
    return originalResult;
  }
  tempTabUsedThisPoll = true;
  await chrome.storage.session.set({ [TEMP_TAB_LAST_KEY]: Date.now() });

  console.log(`[background] Job ${job.id} : brouillon sur l'onglet persistant → onglet temporaire dédié`);
  let tab = null;
  try {
    // Fragment distinct de #fillsell-worker : cet onglet ne sera jamais
    // adopté comme onglet de travail persistant. (typeof : newListingUrl
    // peut être une fonction — cf. eBay — même si seul LBC pose draftBlocked.)
    const tempUrl = typeof handler.newListingUrl === "function"
      ? handler.newListingUrl(job)
      : handler.newListingUrl;
    tab = await createWorkTabInWorkWindow(tempUrl + TEMP_TAB_FRAGMENT);
    // Identité déclarée AVANT toute navigation du site : si la SPA réécrit
    // l'URL (fragment perdu), l'onglet reste reconnu comme à nous.
    await chrome.storage.session.set({ [TEMP_TAB_ID_KEY]: tab.id }).catch(() => {});
    await waitForTabComplete(tab.id, tempUrl + TEMP_TAB_FRAGMENT);
    const result = await sendMessageToTab(tab.id, { type: "FILL_LISTING", job });
    if (result?.draftBlocked) {
      return {
        ...result,
        error:
          (result.error || "") +
          " Le brouillon persiste même dans un onglet neuf : c'est un brouillon " +
          "de compte, le publier ou le supprimer sur leboncoin.fr.",
      };
    }
    return result;
  } catch (e) {
    console.error(`[background] Onglet temporaire job ${job.id}:`, e);
    return originalResult;
  } finally {
    // Fermeture SYSTÉMATIQUE (dry-run compris — contrairement à l'onglet
    // persistant qui reste ouvert pour inspection). Le formulaire LBC rempli
    // arme beforeunload : on le neutralise avant de fermer, sinon le dialogue
    // natif bloque la fermeture et l'onglet temporaire traîne.
    if (tab) {
      await neutralizeBeforeUnload(tab.id);
      await chrome.tabs.remove(tab.id).catch(() => {});
      await chrome.storage.session.remove(TEMP_TAB_ID_KEY).catch(() => {});
    }
  }
}

// ── Entrée par la home puis navigation interne (eBay) ──────────────────────────
// Un onglet qui s'ouvre froid sur /sl/list?mode=AddItem (aucun referrer, aucune
// page du site chargée avant) est un signal d'automatisation. On reproduit le
// trajet d'un vendeur : la home est déjà chargée (getOrCreateWorkTab), on la
// "lit" quelques secondes, on demande au content script de cliquer réellement
// le lien "Vendre", puis on rejoint l'URL de dépôt par une navigation interne.
//
// Jamais bloquant : le lien "Vendre" introuvable, un content script muet ou
// une navigation ratée n'échouent PAS le job — on retombe sur la navigation
// directe vers l'URL de dépôt (comportement d'avant le 2026-07-09), le
// remplissage lui-même est identique dans les deux cas.
async function navigateHomeToForm(tabId, listingUrl) {
  await sleep(randInt(1500, 4000)); // temps de "lecture" de la home

  try {
    const res = await sendMessageToTab(tabId, { type: "GO_TO_SELL" }, 15_000);
    if (res?.clicked) {
      // Le content script répond AVANT de cliquer (la navigation détruit le
      // canal de message) : on attend ici le chargement de la page de vente.
      await waitForTabComplete(tabId).catch(() => {});
      await sleep(randInt(1200, 3000));
    } else {
      console.warn(`[background] Entrée par la home : clic "Vendre" non effectué (${res?.reason ?? "sans raison"}) — navigation directe`);
    }
  } catch (e) {
    console.warn("[background] Entrée par la home : content script injoignable —", String(e?.message ?? e));
  }

  // Navigation interne vers le formulaire (depuis une page du site, avec
  // referrer) plutôt qu'une ouverture d'onglet froide.
  // ⚠️ BUDGET 60 s ET NON 30 (2026-07-22, job 244b0ec4 « Timeout: la page de
  // dépôt n'a pas fini de charger », Patagonia perdu sur eBay seul — les 3
  // autres plateformes ont publié). eBay est la SEULE des quatre dont l'URL de
  // dépôt n'ouvre pas un formulaire : /sl/list est un SAS qui crée le brouillon
  // CÔTÉ SERVEUR, puis navigue vers /lstng?draftId=… (mesuré en direct le
  // 2026-07-22 : deux documents, ~5 s rien que pour le second, dans un onglet
  // RENDU). Notre onglet, lui, vit dans une fenêtre minimisée jamais rendue, où
  // Chrome bride les timers : le sas peut largement dépasser 30 s. Le défaut de
  // waitForTabComplete reste 30 s pour les trois autres plateformes.
  const loaded = waitForTabComplete(tabId, listingUrl + WORK_TAB_FRAGMENT, 60_000);
  await neutralizeBeforeUnload(tabId);
  // URL d'AVANT la navigation : elle sert de garde-fou à waitForEbayDraftForm,
  // qui ne doit jamais prendre la page de départ pour la page d'arrivée.
  const urlAvant = (await chrome.tabs.get(tabId).catch(() => null))?.url ?? "";
  await chrome.tabs.update(tabId, { url: listingUrl + WORK_TAB_FRAGMENT });
  await loaded;

  // …et waitForTabComplete rend la main sur le PREMIER "complete" de l'onglet
  // (il est permissif à dessein : eBay redirige, exiger l'URL cible ferait
  // expirer tous les jobs eBay — cf. commentaire de tête). Ce premier
  // "complete", sur eBay, c'est celui du SAS /sl/list, pas celui du formulaire.
  // Ça ne tenait jusqu'ici que par chance, les 2 s de succeed() + les 2,5-4 s de
  // paintTab couvrant la seconde navigation ; dès qu'eBay traîne, FILL_LISTING
  // part sur une page en train d'être détruite — exactement la signature du
  // 2026-07-12 (0/25 photos, titre vide). On attend donc explicitement la vraie
  // page de dépôt.
  await waitForEbayDraftForm(tabId, urlAvant);
}

// eBay uniquement : le sas /sl/list a-t-il fini par livrer /lstng?draftId=… ?
// Jamais de verdict optimiste — on ne rend la main que sur la vraie page, ou on
// jette une erreur RETENTABLE (cf. TRANSIENT_JOB_ERROR_RE : le job est ré-armé,
// pas enterré, un brouillon lent n'est pas un job perdu).
const EBAY_DRAFT_FORM_RE = /^https:\/\/[^/]*\bebay\.[a-z.]+\/lstng\b/i;
const EBAY_PRELIST_RE = /^https:\/\/[^/]*\bebay\.[a-z.]+\/sl\/list\b/i;

async function waitForEbayDraftForm(tabId, urlAvant = "", timeoutMs = 45_000) {
  const sansFragment = (u) => String(u || "").split("#")[0];
  const depart = sansFragment(urlAvant);
  const deadline = Date.now() + timeoutMs;
  let lastUrl = "";
  let precedente = null;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw new Error("Onglet de travail fermé pendant l'ouverture du formulaire eBay");
    lastUrl = tab.url || "";
    if (tab.status === "complete" && EBAY_DRAFT_FORM_RE.test(lastUrl)) {
      console.log(`[background] eBay : formulaire de dépôt ouvert (${lastUrl})`);
      return;
    }
    // Sortie de secours : eBay a envoyé ailleurs que le sas ET que le
    // formulaire (page d'erreur MISSING_CATEGORY…, signin, interstitiel). Ce
    // n'est pas à cette fonction d'en juger — les gardes du content script et
    // detectReauth le font déjà, avec de bien meilleurs messages.
    // DEUX verrous, sinon cette sortie devient un faux positif : (1) jamais la
    // page de DÉPART — le "complete" qui a débloqué waitForTabComplete peut
    // être celui d'une navigation interne d'eBay antérieure à notre update, et
    // rendre la main là-dessus enverrait FILL_LISTING sur le hub de vente ;
    // (2) URL STABLE sur deux relevés — une page traversée au vol pendant la
    // chaîne de redirections n'est pas une destination.
    const stable = precedente !== null && precedente === lastUrl;
    if (
      tab.status === "complete" &&
      !EBAY_PRELIST_RE.test(lastUrl) &&
      sansFragment(lastUrl) !== depart &&
      stable
    ) {
      console.warn(`[background] eBay : page inattendue après /sl/list — ${lastUrl} (on laisse le content script trancher)`);
      return;
    }
    precedente = lastUrl;
    await sleep(700);
  }
  throw new Error(
    "eBay : le formulaire de dépôt n'a pas fini de s'ouvrir — le brouillon est resté " +
    `en création sur /sl/list (dernière URL vue : ${lastUrl || "inconnue"})`
  );
}

// ── Onglet de travail dédié ────────────────────────────────────────────────────
// Un SEUL onglet par plateforme, créé par l'extension et réutilisé de job en
// job. Historique : quand chaque job ouvrait son propre onglet, les sessions
// de test ont accumulé jusqu'à ~30 onglets Vinted simultanés et DataDome a
// suspendu le compte ("activité inhabituelle ou automatisée", 403 sur
// item_upload/items). Un humain a UN onglet Vinted et poste ses annonces
// dedans à la suite — on reproduit exactement ça.
//
// Identification de NOTRE onglet (et jamais celui d'un utilisateur qui
// navigue sur Vinted à côté) :
//   1. ID mémorisé dans chrome.storage.session (survit aux redémarrages du
//      service worker MV3, pas à ceux du navigateur — voulu)
//   2. repli : fragment #fillsell-worker dans l'URL, marqueur posé par nos
//      propres navigations, retrouvable via tabs.query si le storage a été
//      vidé alors que l'onglet vit encore
//   3. sinon : création d'un onglet neuf (une seule fois), gardé ensuite.
// Les onglets Vinted ouverts manuellement par l'utilisateur ne portent ni
// l'ID ni le fragment : ils ne sont jamais adoptés, jamais navigués.
const WORK_TAB_FRAGMENT = "#fillsell-worker";
// Fragment des onglets TEMPORAIRES (retryInTempTab) : distinct pour ne jamais
// être adopté comme onglet persistant, mais À NOUS quand même — la
// classification des fenêtres doit le compter « marqué » (2026-07-30 soir).
const TEMP_TAB_FRAGMENT = "#fillsell-temp";
// Id de l'onglet temporaire pendant sa (courte) vie — même rôle d'identité que
// les clés par plateforme : reconnaître nos onglets sans dépendre de l'URL.
const TEMP_TAB_ID_KEY = "fillsell_temp_tab_id";
const workTabKey = (platform) => `fillsell_work_tab_${platform}`;

// ── Fenêtre de travail DÉDIÉE (2026-07-13) ────────────────────────────────────
// CONTRAINTE PRODUIT NON NÉGOCIABLE (Nico) : une fois l'annonce publiée depuis
// l'app, tout le reste (cross-post, suppression, republication) est automatique
// et INVISIBLE. Rien ne doit apparaître, passer au premier plan ni voler le
// focus de la fenêtre de l'utilisateur — jamais, même brièvement, même pendant
// une suppression.
//
// Ce que faisait l'ancienne architecture, et qui violait ça : les onglets de
// travail vivaient dans LA fenêtre de l'utilisateur, et paintTab les activait
// (tabs.update active:true) en ramenant la fenêtre au premier plan
// (windows.update focused:true) — pour toute publication eBay et toute
// suppression. Un onglet qui s'active, c'est aussi l'onglet de l'utilisateur
// qui disparaît sous ses yeux.
//
// Parade : une fenêtre Chrome À NOUS, créée focused:false et immédiatement
// minimisée, qui héberge TOUS les onglets de travail des 4 plateformes et des
// suppressions. Toute activation d'onglet se fait DANS cette fenêtre : elle est
// alors sans effet visible pour l'utilisateur (sa fenêtre garde le focus, son
// onglet reste affiché). Elle est recréée à la demande si l'utilisateur la
// ferme, et jamais ramenée au premier plan par nous.
//
// ⚠️ Conséquence assumée et documentée (mesurée le 2026-07-13) : une fenêtre non
// rendue ne reçoit AUCUN événement d'entrée (souris comme clavier, y compris
// CDP) et son rendu React peut être différé. C'est le prix de l'invisibilité, et
// c'est le bon compromis : Vinted n'en a plus besoin (le prix se commite
// désormais par appel direct des props React, cf. commitVintedPrice) ; eBay
// s'appuie sur ses relectures/re-poses déjà en place, quitte à être plus lent,
// et échoue proprement en needsUser plutôt que d'imposer quoi que ce soit à
// l'écran.
const WORK_WINDOW_KEY = "fillsell_work_window";

// ⚠️ UNE SEULE FENÊTRE, TOUJOURS (durci le 2026-07-13 — des fenêtres minimisées
// s'accumulaient). La v1 ne savait retrouver sa fenêtre QUE par l'id mémorisé en
// storage.session. Deux trous, tous deux réalistes :
//   1. l'id se perd (redémarrage du navigateur, storage.session vidé) alors que
//      la fenêtre, elle, existe toujours → on en créait une DE PLUS, et ainsi de
//      suite à chaque perte de mémoire ;
//   2. deux appels concurrents (une publication et une vérification d'état qui
//      démarrent ensemble) passaient tous les deux le test « pas de fenêtre »
//      avant que le premier n'ait écrit son id → DEUX fenêtres créées d'un coup.
// Parade : on ne se fie plus à la mémoire seule — on ADOPTE toute fenêtre qui
// contient déjà un onglet de travail à nous (fragment #fillsell-worker), on
// SÉRIALISE les créations (une seule à la fois), et on CONSOLIDE : si plusieurs
// fenêtres de travail traînent, on rapatrie leurs onglets dans la première et on
// ferme les surnuméraires. L'invariant « une seule fenêtre » est ainsi rétabli
// même après un état déjà dégradé.
//
// ⚠️ CLIQUET D'ADOPTION (2026-07-30, constaté sur le Mac d'Ornella) : la v2
// adoptait toute fenêtre contenant AU MOINS UN onglet marqué. Or le repli de
// createWorkTabInWorkWindow peut égarer un onglet marqué dans la fenêtre de
// l'UTILISATEUR ; au redémarrage suivant (storage.session vidé), c'est SA
// fenêtre qui était adoptée — définitivement, puisque moveTabToWorkWindow
// concluait ensuite « déjà au bon endroit », et la consolidation FERMAIT la
// vraie fenêtre dédiée. Pire : consolidateWorkWindows faisait windows.remove
// sur toute fenêtre « en trop » contenant un onglet marqué — fenêtre
// utilisateur comprise, onglets personnels fermés avec.
// Règles depuis le 2026-07-30 :
//   · on n'adopte une fenêtre QUE si elle ne contient AUCUN onglet utilisateur
//     (onglets marqués + neutres uniquement) ;
//   · on ne FERME une fenêtre que sous la même condition — sinon on déplace
//     ses onglets marqués et on la laisse INTACTE ;
//   · au démarrage de chaque job, si la fenêtre résolue contient des onglets
//     utilisateur (cliquet hérité), on l'abandonne : id oublié, fenêtre dédiée
//     neuve, onglets marqués rapatriés ;
//   · chaque anomalie (repli, adoption, consolidation, minimisation ignorée)
//     est JOURNALISÉE EN BASE via platform_fields.work_window_state.events —
//     la console du service worker est éphémère, on ne savait jamais quel
//     chemin s'était déclenché.
let workWindowInFlight = null;

// Classification des onglets d'une fenêtre. « Marqué » = à NOUS, reconnu par
// IDENTITÉ d'abord (id présent dans nos clés storage.session : onglet de
// travail de chaque plateforme, onglet temporaire), par fragment ensuite
// (#fillsell-worker / #fillsell-temp). « Neutre » = about:blank / nouvel
// onglet. Un onglet sans URL commitée (pendingUrl seulement) est classé sur ce
// qu'on en sait.
//
// ⚠️ POURQUOI L'IDENTITÉ PRIME (2026-07-30 soir, prolifération constatée sur
// le poste de Nico, rejouée via le journal en base) : le fragment ne survit
// PAS au travail. Après publication, l'onglet atterrit sur la page de
// confirmation de la plateforme (URL réécrite par la SPA, sans fragment) ;
// ebayConfirmViaActiveListings navigue vers le Hub vendeur sans fragment ; un
// challenge DataDome réécrit aussi l'URL. L'onglet de travail légitime passait
// donc pour un onglet UTILISATEUR au job suivant → resolveWorkWindow
// « réparait » un cliquet imaginaire à CHAQUE job : id oublié, fenêtre neuve,
// et l'ancienne — réduite à son about:blank une fois l'onglet rapatrié —
// jamais fermée faute d'onglet marqué. Cinq fenêtres créées en cinq minutes
// (cliquet_repare → fenetre_creee en cascade, 21:56 → 22:00).
function compterOngletsFenetre(w, idsConnus = new Set()) {
  let marques = 0, neutres = 0, utilisateur = 0;
  const details = [];
  for (const t of w.tabs ?? []) {
    const url = t.url || t.pendingUrl || "";
    const connu = idsConnus.has(t.id);
    const frag = url.includes(WORK_TAB_FRAGMENT) || url.includes(TEMP_TAB_FRAGMENT);
    let classe;
    if (connu || frag) { marques++; classe = "marque"; }
    else if (url === "" || url === "about:blank" || url.startsWith("chrome://newtab")) { neutres++; classe = "neutre"; }
    else { utilisateur++; classe = "user"; }
    // Détail par onglet pour le journal (hostname seul, jamais l'URL entière) :
    // sans lui, impossible de rejouer POURQUOI une fenêtre a été classée
    // utilisateur (l'incident du 30/07 n'était diagnosticable qu'aux comptes).
    let host;
    try { host = url ? new URL(url).hostname || url.slice(0, 40) : "(vide)"; } catch { host = url.slice(0, 40); }
    details.push({ h: host, c: classe, ...(connu ? { id: 1 } : {}), ...(frag ? { f: 1 } : {}) });
  }
  return { marques, neutres, utilisateur, details: details.slice(0, 8) };
}

// Ids de tous nos onglets d'après nos propres clés storage.session — la source
// d'identité de compterOngletsFenetre. Perdu au redémarrage du navigateur
// (storage.session), comme les ids d'onglets eux-mêmes : cohérent.
async function idsOngletsTravailConnus() {
  const keys = [...Object.keys(PLATFORM_HANDLERS).map(workTabKey), TEMP_TAB_ID_KEY];
  const store = await chrome.storage.session.get(keys).catch(() => ({}));
  return new Set(keys.map((k) => store[k]).filter((v) => v != null));
}

// Registre des fenêtres créées PAR NOUS cette session. Deux usages :
//   1. consolidation : une fenêtre du registre réduite à des onglets neutres
//      (l'about:blank restant après rapatriement de son onglet de travail)
//      peut être fermée — une fenêtre inconnue sans onglet marqué reste
//      intouchable (chrome://newtab est « neutre », fenêtre utilisateur
//      possible) ;
//   2. plafond dur : jamais plus de MAX_FENETRES_TRAVAIL fenêtres à nous
//      vivantes — aucun défaut de classification ne doit plus jamais pouvoir
//      en produire cinq (2026-07-30).
const WORK_WINDOWS_CREATED_KEY = "fillsell_work_windows_created";
const MAX_FENETRES_TRAVAIL = 2;
async function memoriserFenetreCreee(windowId) {
  try {
    const store = await chrome.storage.session.get(WORK_WINDOWS_CREATED_KEY);
    const list = Array.isArray(store[WORK_WINDOWS_CREATED_KEY]) ? store[WORK_WINDOWS_CREATED_KEY] : [];
    list.push(windowId);
    await chrome.storage.session.set({ [WORK_WINDOWS_CREATED_KEY]: list.slice(-6) });
  } catch { /* best-effort */ }
}
async function fenetresCreeesVivantes() {
  try {
    const store = await chrome.storage.session.get(WORK_WINDOWS_CREATED_KEY);
    const list = Array.isArray(store[WORK_WINDOWS_CREATED_KEY]) ? store[WORK_WINDOWS_CREATED_KEY] : [];
    const alive = [];
    for (const id of list) {
      if (await chrome.windows.get(id).catch(() => null)) alive.push(id);
    }
    return alive; // ordre de création conservé
  } catch {
    return [];
  }
}

// ── Journal des événements fenêtre de travail (2026-07-30) ───────────────────
// Tampon en storage.session (survit aux redémarrages du service worker MV3),
// drainé dans platform_fields.work_window_state.events au prochain relevé
// (at_start/at_end d'un job) — donc PERSISTÉ EN BASE, requêtable :
//   platform_fields->'work_window_state'->'at_start'->'events'
// Jamais bloquant : un échec de journalisation ne doit pas coûter un job.
const WORK_WINDOW_EVENTS_KEY = "fillsell_work_window_events";
async function journaliserEvenementFenetre(type, detail = {}) {
  console.warn(`[background] fenêtre de travail — ${type}`, JSON.stringify(detail));
  try {
    const store = await chrome.storage.session.get(WORK_WINDOW_EVENTS_KEY);
    const events = Array.isArray(store[WORK_WINDOW_EVENTS_KEY]) ? store[WORK_WINDOW_EVENTS_KEY] : [];
    events.push({ at: new Date().toISOString(), type, ...detail });
    await chrome.storage.session.set({ [WORK_WINDOW_EVENTS_KEY]: events.slice(-30) });
  } catch { /* best-effort */ }
}

async function drainerEvenementsFenetre() {
  try {
    const store = await chrome.storage.session.get(WORK_WINDOW_EVENTS_KEY);
    const events = store[WORK_WINDOW_EVENTS_KEY];
    if (!Array.isArray(events) || !events.length) return null;
    await chrome.storage.session.remove(WORK_WINDOW_EVENTS_KEY);
    return events.slice(-20);
  } catch {
    return null;
  }
}

function getOrCreateWorkWindow() {
  if (!workWindowInFlight) {
    workWindowInFlight = resolveWorkWindow().finally(() => { workWindowInFlight = null; });
  }
  return workWindowInFlight;
}

async function resolveWorkWindow() {
  const idsConnus = await idsOngletsTravailConnus();
  const store = await chrome.storage.session.get(WORK_WINDOW_KEY);
  const known = store[WORK_WINDOW_KEY];
  if (known != null) {
    const win = await chrome.windows.get(known, { populate: true }).catch(() => null);
    if (win) {
      const { marques, utilisateur, details } = compterOngletsFenetre(win, idsConnus);
      if (utilisateur === 0) {
        await consolidateWorkWindows(win.id, idsConnus);
        return win.id;
      }
      // RÉPARATION DU CLIQUET (2026-07-30) : l'id mémorisé pointe une fenêtre
      // qui contient des onglets UTILISATEUR — une fenêtre adoptée à tort par
      // une version antérieure (ou dans laquelle l'utilisateur navigue). On
      // l'abandonne : id oublié, fenêtre dédiée neuve créée ci-dessous, et la
      // consolidation post-création rapatrie les onglets marqués. La fenêtre
      // de l'utilisateur n'est PAS touchée (ses onglets restent). Depuis le
      // 2026-07-30 soir, un onglet à nous qui a perdu son fragment (page de
      // confirmation post-publication) est reconnu par son ID : ce chemin ne
      // se déclenche plus que sur de VRAIS onglets étrangers.
      await chrome.storage.session.remove(WORK_WINDOW_KEY);
      await journaliserEvenementFenetre("cliquet_repare", {
        window_id: win.id, user_tabs: utilisateur, marked_tabs: marques, tabs: details,
      });
    }
  }

  // Mémoire perdue : la fenêtre existe peut-être encore. On la reconnaît à ses
  // onglets de travail (identité ou fragment — le porte-page
  // about:blank#fillsell-worker suffit : une fenêtre fraîche pas encore
  // peuplée est adoptable, elle n'est plus invisible) — jamais à une fenêtre
  // de l'utilisateur, qui n'en porte pas.
  const adoptee = await findExistingWorkWindow(idsConnus);
  if (adoptee != null) {
    await chrome.storage.session.set({ [WORK_WINDOW_KEY]: adoptee });
    console.log(`[background] Fenêtre de travail ${adoptee} RETROUVÉE (id oublié) — réutilisée, aucune création`);
    await journaliserEvenementFenetre("fenetre_adoptee", { window_id: adoptee });
    await consolidateWorkWindows(adoptee, idsConnus);
    return adoptee;
  }

  // PLAFOND DUR (2026-07-30 soir) : si MAX_FENETRES_TRAVAIL fenêtres créées
  // par nous vivent encore, on n'en crée JAMAIS une de plus — on reprend la
  // plus récente (créée par nous : ce n'est jamais la fenêtre personnelle de
  // l'utilisateur, même si un défaut de classification l'a fait abandonner) et
  // on journalise. Aucun défaut de classification ne doit plus jamais pouvoir
  // produire cinq fenêtres.
  const creees = await fenetresCreeesVivantes();
  if (creees.length >= MAX_FENETRES_TRAVAIL) {
    const reprise = creees[creees.length - 1];
    await chrome.storage.session.set({ [WORK_WINDOW_KEY]: reprise });
    await journaliserEvenementFenetre("plafond_fenetres_atteint", {
      alive: creees, reused: reprise,
    });
    await consolidateWorkWindows(reprise, idsConnus);
    return reprise;
  }

  // Porte-page about:blank#fillsell-worker : la fenêtre naît silencieuse ET
  // MARQUÉE (le fragment sur about:blank ne navigue jamais, il survit à tout —
  // y compris à une restauration de session). Sans lui, une fenêtre créée puis
  // pas encore peuplée était invisible pour findExistingWorkWindow, et une
  // fenêtre vidée de son onglet de travail restait ouverte à jamais.
  // focused:false dès la création — on ne prend JAMAIS le focus, même le temps
  // d'un battement.
  const win = await chrome.windows.create({
    url: "about:blank" + WORK_TAB_FRAGMENT,
    focused: false,
    state: "minimized",
  });
  await memoriserFenetreCreee(win.id);
  // Ceinture et bretelles : certaines plateformes ignorent `state` à la
  // création (fenêtre créée normale puis minimisée juste après). Sans focus.
  await chrome.windows.update(win.id, { state: "minimized", focused: false }).catch(() => {});
  await chrome.storage.session.set({ [WORK_WINDOW_KEY]: win.id });
  // Vérité terrain (2026-07-30) : windows.create peut RÉSOUDRE en ignorant
  // state:"minimized" (comportement dépendant de la plateforme, rapporté sur
  // les trackers Chromium) et l'update de rattrapage ci-dessus avale son
  // échec — deux chemins muets. On relit donc l'état RÉEL et on journalise
  // s'il n'est pas celui demandé. Observation seule : pas de re-tentative en
  // boucle ici, l'état par job est déjà relevé par releverEtatFenetreTravail.
  const etatReel = await chrome.windows.get(win.id).catch(() => null);
  if (etatReel && etatReel.state !== "minimized") {
    await journaliserEvenementFenetre("fenetre_creee_non_minimisee", {
      window_id: win.id, state: etatReel.state, focused: etatReel.focused,
    });
  } else {
    await journaliserEvenementFenetre("fenetre_creee", { window_id: win.id });
  }
  console.log(`[background] Fenêtre de travail dédiée ${win.id} CRÉÉE (minimisée, jamais focus)`);
  // Rapatrie les onglets marqués égarés (repli d'un job précédent, fenêtre
  // utilisateur refusée à l'adoption) dans la fenêtre neuve.
  await consolidateWorkWindows(win.id, idsConnus);
  return win.id;
}

// Une fenêtre n'est « à nous » que si elle ne contient AUCUN onglet
// utilisateur : uniquement des onglets marqués (identité ou fragment) et
// neutres (about:blank). Un onglet marqué égaré dans la fenêtre de
// l'utilisateur ne la fait plus adopter (cliquet du 2026-07-30) — il sera
// rapatrié par la consolidation qui suit la création d'une fenêtre dédiée
// neuve.
async function findExistingWorkWindow(idsConnus = new Set()) {
  const fenetres = await chrome.windows.getAll({ populate: true }).catch(() => []);
  for (const w of fenetres) {
    const { marques, utilisateur, details } = compterOngletsFenetre(w, idsConnus);
    if (!marques) continue;
    if (utilisateur > 0) {
      await journaliserEvenementFenetre("adoption_refusee_fenetre_utilisateur", {
        window_id: w.id, user_tabs: utilisateur, marked_tabs: marques, tabs: details,
      });
      continue;
    }
    return w.id;
  }
  return null;
}

// Répare un état déjà dégradé : des onglets marqués vivent hors de la fenêtre
// gardée. On les rapatrie, et on ne ferme une fenêtre vidée QUE si elle
// n'appartient pas à l'utilisateur (aucun onglet non marqué/neutre) — l'ancien
// windows.remove inconditionnel fermait la fenêtre de l'utilisateur avec tous
// ses onglets personnels si un seul onglet marqué s'y était égaré (bug grave,
// 2026-07-30). Idempotent et silencieux quand tout va bien.
async function consolidateWorkWindows(gardee, idsConnus = new Set()) {
  const fenetres = await chrome.windows.getAll({ populate: true }).catch(() => []);
  const creees = new Set(await fenetresCreeesVivantes());
  for (const w of fenetres) {
    if (w.id === gardee) continue;
    const { marques, utilisateur } = compterOngletsFenetre(w, idsConnus);
    // Fenêtre sans aucun onglet marqué : consolidée SEULEMENT si c'est nous
    // qui l'avons créée (registre de session) — cas de la fenêtre réduite à
    // son about:blank nu d'avant le porte-page marqué. Une fenêtre inconnue
    // sans onglet marqué reste intouchable (chrome://newtab est « neutre »,
    // fenêtre utilisateur fraîche possible).
    if (!marques && !creees.has(w.id)) continue;
    for (const t of w.tabs ?? []) {
      const url = t.url || t.pendingUrl || "";
      const estANous = idsConnus.has(t.id) || url.includes(WORK_TAB_FRAGMENT) || url.includes(TEMP_TAB_FRAGMENT);
      const estPortePage = url.startsWith("about:blank");
      if (estANous && !estPortePage) {
        await chrome.tabs.move(t.id, { windowId: gardee, index: -1 }).catch(() => {});
      } else if (estPortePage && (estANous || creees.has(w.id))) {
        // Un porte-page ne se déplace pas (la fenêtre gardée a le sien) : il
        // se ferme — et s'il était le dernier onglet, Chrome ferme la fenêtre.
        await chrome.tabs.remove(t.id).catch(() => {});
      }
    }
    // Fenêtre utilisateur : onglets marqués déplacés, fenêtre laissée INTACTE.
    // Fenêtre de travail surnuméraire (que des onglets marqués/neutres) :
    // fermée — Chrome l'a peut-être déjà fermée seul si son dernier onglet
    // vient d'être déplacé/fermé, d'où le .catch.
    const fermer = utilisateur === 0;
    if (fermer) await chrome.windows.remove(w.id).catch(() => {});
    await journaliserEvenementFenetre("consolidation", {
      kept: gardee, window_id: w.id, moved: marques, closed: fermer, user_tabs: utilisateur,
    });
  }
}

// Crée un onglet DANS la fenêtre de travail. Repli explicite : si la fenêtre
// dédiée est indisponible (API refusée, fenêtre fermée pendant la course), on
// crée l'onglet là où on peut, mais TOUJOURS en arrière-plan — jamais de vol de
// focus, au pire un onglet inactif de plus chez l'utilisateur.
async function createWorkTabInWorkWindow(url) {
  try {
    const windowId = await getOrCreateWorkWindow();
    return await chrome.tabs.create({ url, active: false, windowId });
  } catch (e) {
    // Ce repli plante un onglet MARQUÉ dans la fenêtre courante de
    // l'utilisateur — c'est l'amorce du cliquet d'adoption (2026-07-30).
    // L'adoption stricte + la consolidation le rapatrieront, mais sans le
    // motif EXACT de l'échec en base, impossible de savoir pourquoi il se
    // déclenche (jamais visible en console de service worker éphémère).
    await journaliserEvenementFenetre("repli_fenetre_courante", {
      error: String(e?.message ?? e),
    });
    return chrome.tabs.create({ url, active: false });
  }
}

// Rapatrie un onglet de travail déjà existant (adopté par son fragment, ou
// hérité d'une version antérieure de l'extension) dans la fenêtre dédiée —
// sinon il resterait chez l'utilisateur et toute activation le lui volerait.
// index:-1 = à la fin ; l'onglet reste inactif.
async function moveTabToWorkWindow(tabId) {
  try {
    const [tab, windowId] = await Promise.all([chrome.tabs.get(tabId), getOrCreateWorkWindow()]);
    if (tab.windowId === windowId) return tabId;
    const moved = await chrome.tabs.move(tabId, { windowId, index: -1 });
    const movedTab = Array.isArray(moved) ? moved[0] : moved;
    console.log(`[background] Onglet de travail ${tabId} rapatrié dans la fenêtre dédiée ${windowId}`);
    return movedTab?.id ?? tabId;
  } catch (e) {
    console.warn(`[background] Rapatriement de l'onglet ${tabId} impossible :`, String(e?.message ?? e));
    return tabId;
  }
}

// ── Observation : état RÉEL de la fenêtre de travail, par job (2026-07-30) ───
// Hypothèse à MESURER, pas à corriger : une fenêtre de travail restaurée /
// affichée au premier plan (constatée sur macOS, en plein écran) changerait le
// comportement observable par DataDome par rapport à la fenêtre minimisée
// prévue par le code. On relève donc l'état réel (windows.get : state,
// focused ; tabs.get : active) au DÉBUT de chaque job, et à nouveau quand un
// job se termine en échec ou en needsUser (rearmBounded / markNeedsUser /
// failed sec — y compris le motif CHALLENGE DATADOME). Persisté dans
// platform_fields.work_window_state, requêtable en SQL :
//   platform_fields->'work_window_state'->'at_start'->>'window_state'
//   platform_fields->'work_window_state'->'at_end'->>'window_focused'
// ⚠️ Observation SEULE : aucune re-minimisation forcée, aucun avertissement,
// aucun blocage si la fenêtre est visible — le comportement ne change en rien.
async function releverEtatFenetreTravail(platform) {
  let releve = null;
  try {
    const store = await chrome.storage.session.get([WORK_WINDOW_KEY, workTabKey(platform)]).catch(() => ({}));
    const dedicatedId = store[WORK_WINDOW_KEY] ?? null;
    const tabId = store[workTabKey(platform)] ?? null;
    const tab = tabId != null ? await chrome.tabs.get(tabId).catch(() => null) : null;
    // Fenêtre RÉELLE de l'onglet en priorité (repli « fenêtre courante » de
    // createWorkTabInWorkWindow : l'onglet peut vivre hors fenêtre dédiée).
    const winId = tab?.windowId ?? dedicatedId;
    const win = winId != null ? await chrome.windows.get(winId).catch(() => null) : null;
    if (win || tab) {
      releve = {
        at: new Date().toISOString(),
        window_id: win?.id ?? null,
        window_state: win?.state ?? null, // "minimized" attendu ; "normal"/"fullscreen" = fenêtre visible
        window_focused: win?.focused ?? null,
        tab_active: tab?.active ?? null,
        tab_in_dedicated_window: tab && dedicatedId != null ? tab.windowId === dedicatedId : null,
      };
    }
  } catch (e) {
    console.warn("[background] releverEtatFenetreTravail :", String(e?.message ?? e));
  }
  // Journal des événements fenêtre (repli, adoption, consolidation, cliquet,
  // minimisation ignorée) accumulé depuis le dernier relevé : embarqué MÊME
  // sans relevé — c'est précisément quand la fenêtre est introuvable que le
  // journal explique pourquoi. SQL :
  //   platform_fields->'work_window_state'->'at_start'->'events'
  const events = await drainerEvenementsFenetre();
  if (!releve && !events) return null;
  return { ...(releve ?? { at: new Date().toISOString() }), ...(events ? { events } : {}) };
}

// Pose le relevé sur la COPIE MÉMOIRE du job
// (platform_fields.work_window_state.<phase>) : update-job-status écrase
// platform_fields en entier, donc toute écriture ultérieure qui repart de
// job.platform_fields emporte le relevé. Jamais bloquant (relevé null = rien).
function stampEtatFenetre(job, phase, releve) {
  if (!releve) return;
  job.platform_fields = {
    ...(job.platform_fields ?? {}),
    work_window_state: { ...(job.platform_fields?.work_window_state ?? {}), [phase]: releve },
  };
}

async function getOrCreateWorkTab(platform, url) {
  const key = workTabKey(platform);
  const target = url + WORK_TAB_FRAGMENT;

  // 1. Onglet mémorisé encore vivant → le réutiliser. navigateWorkTab peut
  // retourner un AUTRE id (discard/remplacement anti-beforeunload) : on
  // re-mémorise systématiquement l'id effectif.
  const store = await chrome.storage.session.get(key);
  if (store[key] != null) {
    const tab = await chrome.tabs.get(store[key]).catch(() => null);
    if (tab) {
      // Rapatriement AVANT navigation : un onglet hérité (version antérieure de
      // l'extension, ou fenêtre dédiée fermée par l'utilisateur) vit peut-être
      // encore dans la fenêtre de l'utilisateur — l'y laisser, c'est risquer de
      // la lui voler à la première activation.
      const inWorkWindow = await moveTabToWorkWindow(tab.id);
      const effectiveId = await navigateWorkTab(inWorkWindow, target);
      await chrome.storage.session.set({ [key]: effectiveId });
      return effectiveId;
    }
  }

  // 2. Storage perdu mais notre onglet marqué existe peut-être encore
  const host = new URL(url).hostname.split(".").slice(-2).join(".");
  const candidates = await chrome.tabs.query({ url: `*://*.${host}/*` }).catch(() => []);
  const marked = candidates.find((t) => (t.url || "").includes(WORK_TAB_FRAGMENT));
  if (marked) {
    const inWorkWindow = await moveTabToWorkWindow(marked.id);
    const effectiveId = await navigateWorkTab(inWorkWindow, target);
    await chrome.storage.session.set({ [key]: effectiveId });
    return effectiveId;
  }

  // 3. Aucun onglet à nous : en créer UN dans la fenêtre de travail dédiée,
  //    mémorisé pour les jobs suivants.
  const tab = await createWorkTabInWorkWindow(target);
  await chrome.storage.session.set({ [key]: tab.id });
  await waitForTabComplete(tab.id, target);
  return tab.id;
}

// Hosts couverts par host_permissions (manifest.json) — À GARDER SYNCHRONE avec
// le manifest. Sert UNIQUEMENT au diagnostic de neutralizeBeforeUnload :
// distinguer un host réellement hors manifest (permission manquante, à ajouter)
// d'une page sans document scriptable sur un host couvert (onglet déchargé,
// page d'erreur chrome-error:// après un échec réseau) — les deux produisent le
// MÊME message générique Chrome (« must request permission »).
const MANIFEST_HOSTS_RE =
  /^https:\/\/([a-z0-9-]+\.)*(vinted\.(fr|com)|leboncoin\.fr|ebay\.(fr|com)|beebs\.app|fillsell\.app|tojihnuawsoohlolangc\.supabase\.co)(\/|$)/i;

// Neutralise tout handler beforeunload de la page AVANT une navigation ou une
// fermeture PROGRAMMATIQUE de l'onglet de travail (les 4 plateformes passent par
// ici). Sans ça, une page de dépôt/édition aux modifications non enregistrées
// (Vinted en tête) arme window.onbeforeunload, et chrome.tabs.update({url})
// COMME chrome.tabs.remove() déclenchent la popup native « Quitter le site ? » —
// un dialogue HORS DOM qu'aucun event ni fiber simulé ne peut cliquer. L'onglet
// gèle, le job tourne dans le vide jusqu'à l'abandon, et l'onglet resté bloqué
// n'étant jamais fermé, replaceWorkTab en crée un DE PLUS à chaque passage
// (prolifération observée le 2026-07-17). ⚠️ Le vieux postulat « tabs.remove ne
// déclenche jamais beforeunload » (répété dans les commentaires de replaceWorkTab)
// est FAUX : Chrome honore beforeunload sur une fermeture programmatique.
//
// world MAIN OBLIGATOIRE : window.onbeforeunload appartient à la page, un content
// script ISOLATED ne peut pas l'écraser. On neutralise JUSTE AVANT la navigation
// (pas au chargement) car le site RÉ-arme le handler à chaque édition de champ —
// un neutraliseur posé une fois serait réécrit ensuite.
//
// Retourne true si la suite (update/remove) ne risque AUCUN dialogue : soit la
// neutralisation s'est exécutée, soit il n'y a rien à neutraliser (onglet
// déchargé, fermé, page d'erreur — pas de document = pas de handlers). false =
// vrai risque de dialogue : renderer figé (dialogue probablement DÉJÀ ouvert)
// ou host réellement hors manifest.
async function neutralizeBeforeUnload(tabId) {
  // État réel AVANT d'injecter (fix 2026-07-18). Un onglet DÉCHARGÉ — le chemin
  // NORMAL de navigateWorkTab après un tabs.discard réussi — n'a plus ni
  // renderer ni document : ses handlers beforeunload sont morts avec la page,
  // rien à neutraliser, aucun dialogue possible. Injecter quand même faisait
  // échouer executeScript avec l'erreur générique de Chrome « Cannot access
  // contents of the page. Extension manifest must request permission... » —
  // qui signale une CIBLE NON SCRIPTABLE (onglet déchargé, page d'erreur
  // chrome-error://), PAS une permission manquante : les hosts des 4
  // plateformes sont tous couverts (audit host_permissions du 2026-07-18).
  // L'ancien log recopiait ce message en l'attribuant à un « dialogue déjà
  // ouvert » : faux diagnostic (même famille que le postulat tabs.remove).
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return true;            // onglet déjà fermé : rien à neutraliser
  if (tab.discarded) return true;   // page déchargée : pas de handlers possibles

  try {
    const inject = chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        try { window.onbeforeunload = null; } catch {}
        // Les handlers addEventListener('beforeunload') du site n'ont pas de
        // référence retirable : un écouteur en CAPTURE qui stoppe la propagation
        // immédiate neutralise ceux ajoutés en bubble (cas courant, React), et
        // on efface returnValue par sûreté.
        try {
          window.addEventListener("beforeunload", (e) => {
            e.stopImmediatePropagation();
            delete e.returnValue;
          }, true);
        } catch {}
      },
    });
    // Un dialogue beforeunload DÉJÀ ouvert bloque le renderer : l'injection ne
    // reviendrait jamais. On borne l'attente pour distinguer ce cas d'un succès.
    let timer;
    const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), 3000); });
    try { await Promise.race([inject, guard]); } finally { clearTimeout(timer); }
    return true;
  } catch (e) {
    // Diagnostic par CAUSE — toujours avec l'URL réelle de l'onglet, pour ne
    // plus jamais avoir à deviner le host après coup.
    const msg = String(e?.message ?? e);
    const url = tab.url || "(url inconnue)";
    if (/cannot access|must request permission/i.test(msg)) {
      if (MANIFEST_HOSTS_RE.test(url)) {
        // Host couvert mais document non scriptable : l'onglet vient d'être
        // déchargé (course avec tabs.get) ou affiche une page d'erreur Chrome
        // (échec réseau). Pas de document = pas de handler = pas de dialogue.
        console.log(
          `[background] neutralizeBeforeUnload(${tabId}) : rien à neutraliser — document non scriptable ` +
          `(onglet déchargé ou page d'erreur Chrome) sur ${url}`
        );
        return true;
      }
      console.warn(
        `[background] neutralizeBeforeUnload(${tabId}) : PERMISSION MANQUANTE — ${url} n'est pas couvert ` +
        `par host_permissions du manifest. Si cet host est légitime, l'ajouter au manifest. (${msg})`
      );
      return false;
    }
    if (msg.includes("timeout")) {
      console.warn(
        `[background] neutralizeBeforeUnload(${tabId}) : injection sans réponse après 3 s sur ${url} — ` +
        "renderer figé, dialogue beforeunload natif probablement DÉJÀ ouvert (à fermer à la main)"
      );
      return false;
    }
    console.warn(`[background] neutralizeBeforeUnload(${tabId}) : échec sur ${url} — ${msg}`);
    return false;
  }
}

// Amène l'onglet de travail sur la page de dépôt avec un formulaire VIERGE.
// Retourne l'ID de l'onglet à utiliser (peut différer de tabId : discard ou
// remplacement — le caller met à jour son stockage).
//
// beforeunload : l'hypothèse d'origine ("le remplissage synthétique n'arme
// pas la popup") était fausse en pratique — le dry-run laisse le formulaire
// REMPLI pour inspection, l'utilisateur interagit avec l'onglet (activation
// utilisateur réelle), et la navigation suivante déclenche la popup native
// "Actualiser le site ?" qu'aucune API ne peut cliquer (cas réel Vinted du
// 2026-07-06, préexistant aux fixes du jour : cette navigation date de la
// création de l'onglet de travail). Parade en deux temps :
//   1. onglet non actif (cas normal, il est créé active:false) :
//      chrome.tabs.discard décharge la page SANS exécuter les handlers
//      beforeunload, et la navigation repart d'une page morte — aucun
//      dialogue possible. NB: discard peut réattribuer un nouvel ID.
//   2. onglet actif (l'utilisateur le regarde, discard refusé par Chrome) :
//      on le REMPLACE — création du nouvel onglet de travail (inactif) puis
//      fermeture de l'ancien via tabs.remove, qui ne déclenche pas la popup
//      beforeunload. Toujours UN SEUL onglet persistant à l'arrivée, un seul
//      chargement de page de dépôt par job — jamais de blocage manuel.
//   3. la navigation ne "prend" pas (cas Beebs du 2026-07-09) : quand un
//      dialogue beforeunload est DÉJÀ ouvert sur l'onglet ("Quitter le site ?"
//      laissé par un test précédent), chrome.tabs.discard échoue et
//      chrome.tabs.update ne navigue pas — waitForTabComplete expirait au bout
//      de 30 s, le job partait en failed et AUCUN onglet ne s'ouvrait. On
//      remplace alors l'onglet (même parade que le cas 2 : tabs.remove ne
//      déclenche pas beforeunload), au lieu de laisser mourir le job.
async function navigateWorkTab(tabId, target) {
  // Onglet mort ENTRE la validation de getOrCreateWorkTab et ici (fenêtre de
  // travail fermée / extension rechargée pendant la séquence — plusieurs
  // await s'intercalent, et moveTabToWorkWindow rend l'id INCHANGÉ sur échec) :
  // l'ancien chrome.tabs.get NU jetait l'erreur Chrome brute « No tab with
  // id: … » qui remontait telle quelle au job (cas réel 2026-07-19, job eBay
  // bloqué dans le popup après les rechargements d'extension de la journée).
  // On repart sur un onglet NEUF au lieu de planter — générique 4 plateformes.
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    console.warn(`[background] navigateWorkTab : onglet ${tabId} disparu — création d'un onglet de travail neuf`);
    const fresh = await createWorkTabInWorkWindow(target);
    await waitForTabComplete(fresh.id, target);
    return fresh.id;
  }

  if (!tab.active) {
    let effectiveId = tabId;
    try {
      const discarded = await chrome.tabs.discard(tabId);
      if (discarded?.id != null) effectiveId = discarded.id;
    } catch {
      // Déjà déchargé ou discard indisponible : l'état RÉEL est vérifié
      // juste en dessous, on ne suppose plus rien.
    }
    // 4. (2026-07-12) discard peut échouer SANS lever, même inactif — cas
    //    identifié : DevTools attachés à l'onglet de travail (précisément
    //    quand on observe un run en direct). Naviguer un onglet NON déchargé
    //    dont le formulaire porte des modifications non sauvegardées (les
    //    specifics prennent réellement depuis les fixes LIVE) déclenche le
    //    dialogue beforeunload → page gelée, timeout 30 s, remplacement
    //    tardif et dialogue orphelin (vécu au run du 2026-07-12 midi). On
    //    vérifie l'état réel : pas déchargé → remplacement IMMÉDIAT, aucun
    //    dialogue possible, pas de gel.
    const check = await chrome.tabs.get(effectiveId).catch(() => null);
    if (!check || !check.discarded) {
      if (check) {
        console.log(
          `[background] Onglet de travail ${effectiveId} non déchargé après discard ` +
          "(DevTools attachés ?) — remplacement direct pour éviter le dialogue beforeunload"
        );
      }
      return replaceWorkTab(effectiveId, target);
    }
    try {
      // Écouteur attaché AVANT de déclencher la navigation : un chargement
      // rapide pourrait sinon émettre son "complete" avant qu'on ne l'attende.
      const loaded = waitForTabComplete(effectiveId, target);
      // Ceinture : si l'onglet n'était en fait PAS déchargé (chrome.tabs.discard
      // ment parfois — cf. cas DevTools), naviguer une page aux modifs non
      // enregistrées déclencherait le dialogue. On neutralise beforeunload avant.
      await neutralizeBeforeUnload(effectiveId);
      await chrome.tabs.update(effectiveId, { url: target });
      await loaded;
      return effectiveId;
    } catch (e) {
      console.warn(
        `[background] Onglet de travail ${effectiveId} bloqué (dialogue beforeunload resté ouvert ?) : ` +
        `${String(e?.message ?? e)} — remplacement par un onglet neuf`
      );
      return replaceWorkTab(effectiveId, target);
    }
  }

  // Onglet ACTIF. Le test « actif » protège la page que l'UTILISATEUR regarde —
  // or dans la fenêtre de travail DÉDIÉE, un onglet est TOUJOURS actif (toute
  // fenêtre Chrome a un onglet actif), sans que personne ne le regarde : la
  // fenêtre est minimisée. L'ancien remplacement systématique churnait donc un
  // onglet NEUF à chaque navigation de l'onglet actif de la fenêtre de travail
  // (vécu 2026-07-23 : « nouvel onglet Hub vendeur eBay à chaque check » —
  // recoverMissingListingUrls repasse par ici à chaque poll ; et chaque échec
  // de fermeture sur un dialogue transformait le churn en vraie prolifération).
  // Dans NOTRE fenêtre : navigation EN PLACE (beforeunload neutralisé, discard
  // impossible sur un onglet actif) ; le remplacement reste le repli au blocage.
  const winStore = await chrome.storage.session.get(WORK_WINDOW_KEY).catch(() => ({}));
  if (tab.windowId === winStore[WORK_WINDOW_KEY]) {
    try {
      // ⚠️ RELANCE VERS UNE URL IDENTIQUE (2026-07-26) : les URLs de dépôt sont
      // CONSTANTES (Beebs /fr/listing en tête) — au 2e job ou à la reprise d'un
      // échec, target == URL déjà chargée. Deux mécanismes se combinaient alors
      // pour SAUTER le rechargement : tabs.update vers la même URL peut ne pas
      // naviguer, et le rattrapage de waitForTabComplete voit « déjà complete
      // sur la cible » → résolution immédiate. Le content script repartait sur
      // le DOM RÉSIDUEL de la tentative précédente : photos EMPILÉES sur les
      // anciennes (fillListingForm ne remet rien à zéro), panneau catégorie
      // resté ouvert que le clic d'ouverture REFERMAIT (bascule — parité des
      // échecs Beebs du 25-26/07). Un reload EXPLICITE, attendu par l'événement
      // SEUL (expectUrl null ⇒ pas de rattrapage possible), garantit une page
      // neuve à chaque job. Le fragment #fillsell-worker survit au reload.
      const memePage = String(tab.url || "").split("#")[0] === String(target).split("#")[0];
      const loaded = memePage ? waitForTabComplete(tabId) : waitForTabComplete(tabId, target);
      await neutralizeBeforeUnload(tabId);
      if (memePage) {
        console.log(`[background] Onglet ${tabId} déjà sur la cible — reload explicite (jamais de formulaire résiduel)`);
        await chrome.tabs.reload(tabId);
      } else {
        await chrome.tabs.update(tabId, { url: target });
      }
      await loaded;
      return tabId;
    } catch (e) {
      console.warn(
        `[background] Onglet de travail actif ${tabId} (fenêtre dédiée) non navigable : ` +
        `${String(e?.message ?? e)} — remplacement par un onglet neuf`
      );
      return replaceWorkTab(tabId, target);
    }
  }

  // Actif CHEZ L'UTILISATEUR (onglet hérité dont le rapatriement a échoué) :
  // on ne navigue jamais une page qu'il regarde — remplacement, comme avant.
  return replaceWorkTab(tabId, target);
}

// Crée le nouvel onglet de travail (inactif) PUIS ferme l'ancien.
// ⚠️ CORRIGÉ le 2026-07-18 : contrairement à ce qu'affirmait l'ancien commentaire,
// chrome.tabs.remove() DÉCLENCHE bel et bien la popup beforeunload d'une page aux
// modifications non enregistrées. C'était la source n°1 de la prolifération : le
// remove restait bloqué par le dialogue (ou échouait, .catch avalant l'erreur),
// l'ancien onglet SURVIVAIT, et on repartait avec un onglet de plus à chaque
// passage. On neutralise donc beforeunload AVANT de fermer, et on VÉRIFIE la
// fermeture — un échec est loggé comme état « bloqué » distinct, jamais avalé.
async function replaceWorkTab(oldTabId, target) {
  const fresh = await createWorkTabInWorkWindow(target);
  await waitForTabComplete(fresh.id, target);
  const neutralized = await neutralizeBeforeUnload(oldTabId);
  const removed = await chrome.tabs.remove(oldTabId).then(() => true).catch(() => false);
  if (!removed) {
    console.warn(
      `[background] replaceWorkTab : ancien onglet ${oldTabId} NON fermé — ` +
      `dialogue beforeunload bloquant probable (neutralisation ${neutralized ? "exécutée mais insuffisante" : "impossible — cause exacte loggée par neutralizeBeforeUnload juste au-dessus"}). ` +
      "À débloquer à la main ; le nouvel onglet prend le relais, pas de perte de job."
    );
  }
  return fresh.id;
}

// ── Helpers onglets ────────────────────────────────────────────────────────────

// ⚠️ RACE CORRIGÉE le 2026-07-12 (cause n°1 des échecs du run du soir) : cette
// fonction n'écoutait QUE l'événement onUpdated "complete". Si la page finissait
// de charger AVANT que l'écouteur ne soit attaché — cas courant : onglet restauré
// après discard, page en cache, navigation instantanée — l'événement était déjà
// passé et PERSONNE ne le rattrapait. On attendait alors 30 s dans le vide, puis :
//   · dans navigateWorkTab → "Onglet bloqué (dialogue beforeunload resté ouvert ?)"
//     — message TROMPEUR : il n'y avait aucun dialogue, juste un événement manqué ;
//   · puis replaceWorkTab → nouvel onglet → MÊME race → "Timeout: la page de dépôt
//     n'a pas fini de charger" → job failed.
// C'est ce qui explique les timeouts Vinted/Leboncoin/Beebs de ce soir sur des
// pages qui, elles, s'étaient chargées normalement.
// Parade : on lit l'ÉTAT RÉEL de l'onglet en plus d'écouter l'événement — et on
// vérifie que l'URL est bien la cible, pour ne pas conclure "chargé" sur la page
// PRÉCÉDENTE (encore "complete" pendant les premiers ms d'un tabs.update).
// ⚠️⚠️ RÉGRESSION eBay DU 2026-07-12, CORRIGÉE ICI — ma propre faute, pas la
// peinture de l'onglet. La 1re version de ce rattrapage acceptait l'onglet comme
// "déjà chargé" si son URL contenait simplement WORK_TAB_FRAGMENT. Or l'onglet de
// travail porte CE fragment en permanence (getOrCreateWorkTab le colle à l'URL
// d'entrée). Conséquence, sur le SEUL chemin qui navigue home → formulaire —
// navigateHomeToForm, donc eBay et lui seul :
//   waitForTabComplete(tab, urlDuFormulaire) était appelé alors que l'onglet
//   était encore sur la HOME eBay (déjà "complete", fragment présent) → le
//   rattrapage concluait "chargé" IMMÉDIATEMENT → on renvoyait la main avant même
//   que tabs.update ne lance la navigation → FILL_LISTING partait sur une page en
//   train d'être détruite → 0/25 photos, titre vide, formulaire quasi intact.
// D'où : rattrapage STRICT (l'URL doit être la cible, au fragment près), et
// écoute de l'événement laissée PERMISSIVE — indispensable car eBay REDIRIGE
// (/sl/list?… → /lstng?draftId=…) : l'URL finale n'est jamais l'URL demandée, et
// exiger l'égalité sur l'événement ferait expirer tous les jobs eBay.
function waitForTabComplete(tabId, expectUrl = null, timeoutMs = 30_000) {
  // Utilisé UNIQUEMENT par le rattrapage d'état (jamais par l'écouteur).
  const isAlreadyOnTarget = (url) => {
    if (!expectUrl) return false; // sans cible, on ne peut RIEN affirmer : on attend l'événement
    const strip = (u) => String(u || "").split("#")[0];
    return strip(url) === strip(expectUrl);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Petit délai pour laisser l'app JS de la plateforme s'initialiser
      // (et le content script du manifest s'injecter à document_idle).
      setTimeout(resolve, 2000);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(
      () => fail(new Error("Timeout: la page de dépôt n'a pas fini de charger")),
      timeoutMs
    );

    // PERMISSIF à dessein (cf. commentaire de tête) : eBay redirige vers une URL
    // différente de celle demandée. La navigation est déclenchée juste après
    // l'attachement de cet écouteur, donc le prochain "complete" est le nôtre.
    function onUpdated(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      succeed();
    }
    function onRemoved(removedTabId) {
      if (removedTabId === tabId) fail(new Error("Onglet de travail fermé pendant le chargement"));
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    // Rattrapage de la race : l'onglet est peut-être DÉJÀ chargé SUR LA CIBLE.
    // STRICT (isAlreadyOnTarget) : sans cible explicite, ou sur une autre URL, on
    // ne conclut RIEN et on attend l'événement — c'est ce laxisme qui avait cassé
    // eBay (on validait la home au lieu du formulaire).
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (!tab) return;
        if (tab.status === "complete" && !tab.discarded && isAlreadyOnTarget(tab.url)) succeed();
      })
      .catch(() => {
        /* onglet disparu : onRemoved (ou le timeout) tranchera */
      });
  });
}

// ── Ré-authentification interceptée après le clic de publication ───────────────
// Une plateforme peut exiger une reconnexion AU MOMENT de l'action engageante,
// même avec une session valide au remplissage : constaté en réel le 2026-07-11
// sur eBay, où « Mettre en vente avec les frais affichés » a redirigé vers
// signin.ebay.fr → « Se connecter avec une clé d'accès » (passkey). C'est
// INFRANCHISSABLE par automatisation, et c'est très bien ainsi : on ne cherche
// pas à contourner, on le signale à l'utilisateur.
// La détection doit vivre ICI : la redirection détruit le contexte du content
// script, qui a déjà répondu success sans savoir que l'annonce n'a pas été
// créée. Sans cette garde, le job partait en "published" fantôme.
// ⚠️ NOTÉ POUR PLUS TARD, PAS TRAITÉ ICI (2026-08-11) : ces motifs couvrent
// .fr ET .com, mais content-scripts/ebay.js n'est DÉCLARÉ que sur
// https://*.ebay.fr/* (manifest.json) alors que host_permissions couvre
// ebay.com. Un onglet de travail qui finirait sur ebay.com n'exécuterait aucune
// garde — le symptôme serait « Receiving end does not exist » (transitoire),
// pas « Connexion eBay requise ». Autre bug, autre lot.
const REAUTH_HOSTS = {
  ebay: /(^|\.)signin\.ebay\.(fr|com)$/i,
  vinted: /(^|\.)vinted\.(fr|com)$/i, // sous-chemin /auth uniquement, cf. ci-dessous
  leboncoin: /(^|\.)auth\.leboncoin\.fr$/i,
  beebs: /(^|\.)beebs\.app$/i,        // sous-chemins d'auth uniquement, cf. REAUTH_PATHS
};
const REAUTH_PATHS = {
  vinted: /\/(auth|login|member\/signup_login)/i,
  // /auth borné (2026-08-06) : la VRAIE page de connexion Beebs est
  // /fr/auth?from=…&step=sign-in (relevée en prod dans les échecs delete des
  // 03 et 05/08) — les trois libellés historiques ne matchaient rien de réel.
  beebs: /\/(login|signin|connexion)|\/auth(\/|$)/i,
};

// Polling court : la redirection de ré-authentification peut arriver une
// poignée de secondes après le clic (le handler ne rend la main qu'après son
// propre sleep, mais la plateforme peut être plus lente). Une seule lecture de
// l'URL laisserait passer le cas.
async function detectReauth(tabId, platform, timeoutMs = 6000) {
  const hostRe = REAUTH_HOSTS[platform];
  if (!hostRe) return null;
  const pathRe = REAUTH_PATHS[platform];

  const listingRe = LISTING_URL_PATTERNS[platform];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) {
      // Sortie immédiate quand l'onglet est déjà sur l'annonce créée : pas de
      // ré-authentification possible, inutile d'attendre le timeout (sinon on
      // ajouterait ces secondes à CHAQUE publication réussie).
      if (listingRe?.test(tab.url)) return null;

      let host = "", path = "";
      try {
        const u = new URL(tab.url);
        host = u.hostname;
        path = u.pathname;
      } catch { /* URL interne (chrome://) : rien à conclure */ }

      // Pour les plateformes dont le login vit sur le domaine principal, le
      // host seul ne prouve rien — il faut aussi le chemin.
      if (host && hostRe.test(host) && (!pathRe || pathRe.test(path))) {
        const label = platform.charAt(0).toUpperCase() + platform.slice(1);
        return (
          `Reconnexion ${label} requise : la plateforme a demandé une ré-authentification ` +
          `(${host}${path}) au moment de la publication — l'annonce n'a PAS été créée. ` +
          `Se reconnecter sur ${label} dans Chrome (l'onglet de travail est resté ouvert) ; ` +
          "le job repartira automatiquement au prochain passage."
        );
      }
    }
    await sleep(1000);
  }
  return null;
}

// ── Vérification de soumission eBay (2026-07-12) ───────────────────────────────
// Le clic « Mettre en vente avec les frais affichés » peut être REFUSÉ sur
// place par la validation du formulaire (vécu en LIVE réel : « Vous devez
// ajouter une description » — l'onglet reste sur /lstng, rien n'est soumis),
// pendant que le content script a déjà répondu success. Signal de succès RÉEL
// exigé : l'onglet QUITTE le formulaire (redirection vers la confirmation ou
// l'annonce). Tant qu'il y reste, on lit les bandeaux d'erreur visibles pour
// remonter le message exact d'eBay ; à l'échéance sans redirection ni bandeau,
// on refuse quand même le "published" — aucun signal de succès ≠ succès.
// Retourne { error, listingUrl } : error non-null = refus/non confirmé ;
// listingUrl non-null = numéro d'annonce extrait de la preuve (modale ou
// réponse serveur), à prendre comme listing_url sans repasser par la capture.
async function verifyEbaySubmission(tabId, timeoutMs = 20_000, job = null, accessToken = null) {
  const deadline = Date.now() + timeoutMs;
  // ── Chemin AU MOMENT DU CLIC (2026-08-10) ─────────────────────────────────
  // On entre ici juste après le retour du content script, donc à quelques
  // secondes du clic et AVANT toute navigation de notre fait. C'est le seul
  // instant où l'on observe où l'onglet était vraiment quand la soumission a
  // (ou n'a pas) eu lieu.
  // `final_path`, lui, est relevé au VERDICT — et dans la branche timeout il
  // arrive APRÈS que ebayConfirmViaActiveListings a navigué vers le Hub : il
  // disait donc /sh/lst/active, ce qui n'a jamais été le lieu du clic (job
  // 71942bc2). Les deux clés coexistent désormais ; les lignes ANTÉRIEURES au
  // 10/08 n'ont que final_path, avec la sémantique « au verdict ».
  let pathAuClic = null;
  try {
    const t0 = await chrome.tabs.get(tabId).catch(() => null);
    if (t0?.url) pathAuClic = new URL(t0.url).pathname;
  } catch { /* URL interne : on laisse null */ }
  const etatAvec = async () => ({ ...(await readEbayPostSubmitState(tabId)), path_au_clic: pathAuClic });
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    // Onglet disparu : impossible d'observer quoi que ce soit — on n'invente
    // pas un refus (captureListingUrl rendra listing_url null, c'est tout).
    if (!tab) return { error: null, listingUrl: null, proof: "tab_gone", state: null };
    let path = "";
    try {
      path = new URL(tab.url || "").pathname;
    } catch { /* URL interne (chrome://) : on continue d'attendre */ }
    // ⚠️ « FORMULAIRE QUITTÉ » N'EST PLUS UNE PREUVE DE SUCCÈS (2026-08-10).
    // MESURÉ sur un dépôt réel (annonce 800486036114, cat. 21205) : quand eBay
    // publie, il NE NAVIGUE PAS — il reste sur /lstng et ouvre
    // div.diy--sidepane.success-overlay, qui porte le lien /itm/. Quitter
    // /lstng ne peut donc signer qu'autre chose : captcha /splashui/, page de
    // connexion, page d'erreur. Ce chemin rendait `published` sans URL et sans
    // annonce (job 56c15a53, 10/08).
    // Verdict TERMINAL, jamais un ré-armement : `fatal` court-circuite
    // rearmBounded côté appelant — un job re-mis en pending re-déposerait, et
    // un second dépôt payant est précisément ce qu'on refuse. La Pépite est
    // rendue par le release sur job terminal en échec, rien à écrire ici.
    if (path && !/\/lstng/.test(path)) {
      return {
        error: null,
        listingUrl: null,
        proof: "path_left_lstng",
        fatal: true,
        state: await etatAvec(),
      };
    }

    // ⚠️⚠️ LE SUCCÈS SE LIT AVANT L'ERREUR (2026-07-12) — bug le plus dangereux
    // trouvé jusqu'ici. readVisibleEbayErrors ratisse tout .page-notice /
    // [role=alert] / [class*=error] VISIBLE et appelle ça une erreur. Or eBay
    // affiche sa CONFIRMATION DE PUBLICATION dans une .page-notice. Résultat, le
    // 2026-07-12 : l'annonce itm/800330102796 était BEL ET BIEN EN LIGNE, et le
    // job est parti en "failed" avec l'erreur « Votre annonce est désormais
    // publiée sur le site » — puis a été RÉ-ARMÉ (rearmBounded) et retraité : à
    // un clic près, on créait un DOUBLON. On ne lit donc plus les erreurs sans
    // avoir d'abord cherché la preuve du contraire.
    const success = await readEbaySuccessNotice(tabId);
    if (success) {
      console.log(
        `[background] eBay : publication CONFIRMÉE par la page (« ${success.text} »` +
        `${success.listingUrl ? ` — ${success.listingUrl}` : ""})`
      );
      // Bandeau : rien à fermer (best-effort sans effet). Modale : on la ferme
      // pour laisser l'onglet de travail propre pour le job suivant.
      await closeEbayPostPublishPopup(tabId);
      // Garde anti-croisement sur l'URL SEULEMENT (pas sur la preuve : le
      // bandeau de succès reste un succès) : la modale post-publication porte
      // aussi des liens « Vendre un objet similaire »/cross-promo — un /itm/
      // déjà connu en base n'est pas l'annonce créée, on laisse l'URL en
      // différé (recoverMissingListingUrls / hub par titre la rattraperont).
      let successUrl = success.listingUrl;
      const sm = String(successUrl ?? "").match(/\/itm\/(\d{9,})/);
      if (sm && await ebayIdAlreadyKnown(accessToken, sm[1])) successUrl = null;
      return {
        error: null,
        listingUrl: successUrl,
        // Distinguer les deux est le nerf de l'enquête : `notice_no_url` = la
        // modale a bien été lue mais aucun /itm/ n'en est sorti (markup changé,
        // ou id écarté par la garde anti-croisement) — c'est ce cas-là qui
        // fabrique un published sans URL alors que l'annonce EXISTE.
        proof: successUrl ? "notice_url" : "notice_no_url",
        state: await etatAvec(),
      };
    }

    // 2e PREUVE (2026-07-13) : la RÉPONSE SERVEUR. eBay publie en affichant une
    // POPUP et en restant sur /lstng — la redirection attendue n'arrive jamais,
    // et si la popup n'est pas lue (onglet non rendu, markup inconnu), on
    // déclarait « non confirmée » une annonce EN LIGNE (job 63cfc7f7, annonce
    // 800332793676). Le réseau, lui, ne ment pas. Même parade que Vinted.
    const served = await ebayUploadSucceeded(tabId, accessToken);
    if (served) {
      console.log(`[background] eBay : publication CONFIRMÉE par la réponse serveur (${served})`);
      await closeEbayPostPublishPopup(tabId);
      return { error: null, listingUrl: served, proof: "server_response", state: await etatAvec() };
    }

    const errors = await readVisibleEbayErrors(tabId);
    if (errors.length) {
      return {
        error:
          "Publication eBay REFUSÉE par la validation du formulaire : " +
          `« ${errors.join(" | ")} » — l'onglet de travail est resté sur le formulaire, ` +
          "le job repartira au prochain passage.",
        listingUrl: null,
        proof: "form_refused",
        state: await etatAvec(),
      };
    }
    await sleep(1000);
  }

  // ── 3e PREUVE : LES ANNONCES ACTIVES DU VENDEUR (2026-07-16, faux négatif réel)
  // Les deux sondes ci-dessus (bandeau + réponse serveur) sont FRAGILES : le
  // bandeau dépend d'un markup qui change et d'un onglet rendu à temps, la
  // réponse serveur d'un endpoint capté par la sonde. Le 2026-07-16, l'annonce
  // itm/800354759898 (Switch OLED) était BEL ET BIEN EN LIGNE alors que les
  // deux ont raté → job « non confirmée », re-armé : au prochain poll il
  // recréait un DOUBLON (le 3e cas du genre après 800330102796 et 800332793676).
  // La source de vérité qui, elle, ne ment pas : le Hub vendeur /sh/lst/active
  // liste l'annonce avec son TITRE EXACT et son lien /itm/. On l'interroge en
  // DERNIER RECOURS, avant de déclarer l'échec — exactement ce que fait déjà
  // captureListingUrl pour l'URL, mais ici comme PREUVE de publication.
  // ⚠️ requireTitle:true impératif (page de LISTE) : ne jamais ramener l'URL
  // d'une autre annonce (danger listing_url croisée, cf. findListingLinkInPage).
  if (job?.title) {
    const viaListings = await ebayConfirmViaActiveListings(tabId, job.title).catch(() => null);
    if (viaListings) {
      console.log(`[background] eBay : publication CONFIRMÉE par les annonces actives (${viaListings})`);
      return { error: null, listingUrl: viaListings, proof: "hub_title", state: await etatAvec() };
    }
  }

  // Sonde + markup de popup en annexe `diagnostic`, plus dans `error`
  // (2026-08-06) : cross_post_jobs.error est affiché tel quel à l'utilisateur —
  // le caller range l'annexe dans platform_fields.last_diagnostic.
  return {
    error:
      `Publication eBay non confirmée : l'onglet est resté sur le formulaire (/lstng) ` +
      `${Math.round(timeoutMs / 1000)} s après le clic, sans redirection, sans bandeau de succès ` +
      "ni d'erreur, sans réponse serveur portant un numéro d'annonce, ET absente des annonces " +
      "actives du vendeur — job NON marqué publié, il repartira au prochain passage.",
    diagnostic: await readEbayFailureDiagnostics(tabId),
    listingUrl: null,
    // ── submit_never_sent vs timeout_unconfirmed (2026-08-10) ────────────────
    // Les deux étaient confondus, alors qu'ils appellent des conduites
    // OPPOSÉES. Si aucune requête de publication n'a quitté le navigateur, le
    // clic n'a rien produit du tout : reprendre est sans danger, et c'est même
    // la seule chose à faire. Si elle est partie sans qu'on sache ce qu'elle a
    // donné, reprendre risque le doublon.
    proof: (await ebaySubmitRequestSeen(tabId)) ? "timeout_unconfirmed" : "submit_never_sent",
    state: await etatAvec(),
  };
}

// Dernier recours de confirmation eBay : l'annonce figure-t-elle dans le Hub
// vendeur (/sh/lst/active) avec NOTRE titre exact ? Navigue l'onglet de travail
// vers la liste, attend le rendu, cherche le lien /itm/ porté par une carte au
// titre correspondant (requireTitle:true — jamais l'URL d'une autre annonce).
// Retourne l'URL /itm/ ou null. À n'appeler qu'APRÈS l'échec des sondes bandeau
// et réponse serveur : il coûte une navigation et n'a de sens que si l'annonce
// a pu être créée sans qu'on l'ait vu.
async function ebayConfirmViaActiveListings(tabId, title) {
  const listUrl = MY_LISTINGS_URL.ebay;
  const pattern = LISTING_URL_PATTERNS.ebay;
  if (!listUrl || !pattern) return null;
  try {
    // L'onglet est encore sur le formulaire /lstng NON publié (aux modifs non
    // enregistrées) : neutraliser beforeunload avant de le quitter.
    await neutralizeBeforeUnload(tabId);
    await chrome.tabs.update(tabId, { url: listUrl });
  } catch { return null; }
  // Laisse le Hub vendeur se charger (SPA : les cartes arrivent après le HTML).
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const { url } = await findListingLinkInPage(tabId, pattern.source, title, { requireTitle: true });
    if (url) return url.replace(WORK_TAB_FRAGMENT, "");
  }
  return null;
}

// Diagnostic joint au message « non confirmée » (2026-07-13, job 5e3ee1e2) :
// jusqu'ici cette branche ne disait RIEN de ce que la sonde avait vu —
// impossible de distinguer depuis les logs « 0 capture » (soumission jamais
// partie, ou partie hors fetch/XHR du top frame) de « captures qui ne matchent
// pas le motif » (id au-delà de la troncature, clé de réponse inconnue). Même
// philosophie que readVintedProbe côté Vinted : PUR LOGGING, ne change aucune
// décision publish/fail. On joint aussi le markup d'une éventuelle popup
// visible non reconnue comme succès — c'est la donnée qui manquait pour
// relever le markup réel de la modale de confirmation.
async function readEbayFailureDiagnostics(tabId) {
  let sonde;
  try {
    const { captures } = await readProbeCaptures(tabId);
    sonde = captures.length
      ? `${captures.length} capture(s) non-GET : ` +
        captures
          .slice(-5)
          .map(
            (c) =>
              `${String(c?.url ?? "?")} → HTTP ${c?.status}` +
              (c?.annonceId ? ` · id candidat ${c.annonceId}` : "") +
              ` · corps: ` +
              // texteSain : des captures posées par une sonde ANTÉRIEURE au
              // fix (corps binaires bruts) peuvent encore vivre côté
              // background — on n'embarque jamais leurs octets de contrôle.
              texteSain(String(c?.reponse ?? "")).replace(/\s+/g, " ").slice(0, 120)
          )
          .join(" ; ")
      : "AUCUNE capture — la soumission n'est jamais partie, ou est partie hors fetch/XHR du top frame";
  } catch (e) {
    sonde = `illisible (${String(e?.message ?? e)})`;
  }

  let popup = "";
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(estVisibleSansLayout)],
      func: (helperSrc) => {
        const estVisible = new Function(`return (${helperSrc})`)();
        const dialog = Array.from(
          document.querySelectorAll('[role="dialog"], [class*="lightbox" i], [class*="modal" i]')
        ).find(estVisible);
        return dialog ? dialog.outerHTML.replace(/\s+/g, " ").slice(0, 400) : null;
      },
    });
    if (res?.result) popup = ` · popup visible NON reconnue comme succès, markup : ${res.result}`;
  } catch { /* pur logging : jamais bloquant */ }

  return ` [sonde réseau : ${sonde}${popup}]`;
}

// ── État de l'onglet AU MOMENT DU VERDICT (2026-08-10) ──────────────────────
// Trois relevés, en UNE injection, purement observationnels : ils ne décident
// de RIEN, ils expliquent après coup.
//   · path    : le chemin réel — c'est lui qui distingue « resté sur /lstng »
//               de « parti ailleurs », et il manquait à chaque enquête ;
//   · overlay : la modale de succès est-elle présente dans le DOM ? MESURÉ le
//               2026-08-10 sur un dépôt réel (annonce 800486036114) : le succès
//               eBay est un div.diy--sidepane.success-overlay qui contient le
//               lien /itm/, et l'onglet NE QUITTE JAMAIS /lstng ;
//   · botShield : copie EXACTE des deux marqueurs décisifs de
//               estPageBotShieldEbay (ebay.js) — path /splashui/ et formulaire
//               captcha maison. Duplication par copie assumée (ADR-03) : le
//               prédicat vit dans le content script, qui est mort ou hors sujet
//               une fois la page changée. Jusqu'ici il n'était évalué QU'À
//               L'ENTRÉE de fillListingForm : si eBay servait un challenge
//               APRÈS le clic, plus personne ne regardait.
// Best-effort INTÉGRAL : toute erreur rend des nulls, jamais d'exception — ce
// lecteur ne doit pouvoir casser aucune publication.
// ── L'onglet RÉPOND-IL ? (2026-08-10, job 71942bc2) ─────────────────────────
// Un renderer figé — typiquement un dialogue beforeunload natif resté ouvert sur
// /lstng — accepte encore chrome.tabs.get (l'onglet EXISTE) mais n'exécute plus
// rien. Le formulaire se remplit alors dans le vide et le clic « Mettre en
// vente » ne part jamais : mesuré sur 71942bc2, où la sonde n'a capté que de la
// télémétrie (9 non-GET, aucun POST de publication) alors que le brouillon
// 5214269358621 avait bien été créé.
// Test minimal : une injection triviale dont on ATTEND la réponse, bornée. On ne
// se contente pas de « pas d'exception » — un renderer figé ne rejette pas, il
// ne répond simplement jamais.
async function tabRepond(tabId, timeoutMs = 3000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.discarded) return false;
  try {
    const jeton = `fs-${Date.now()}`;
    const inject = chrome.scripting.executeScript({
      target: { tabId },
      args: [jeton],
      func: (j) => j,
    });
    let timer;
    const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); });
    let res;
    try { [res] = await Promise.race([inject, guard]); } finally { clearTimeout(timer); }
    return res?.result === jeton;
  } catch (e) {
    console.warn(`[background] tabRepond(${tabId}) : onglet muet — ${String(e?.message ?? e)}`);
    return false;
  }
}

// ── La soumission a-t-elle SEULEMENT quitté le navigateur ? (2026-08-10) ─────
// eBay soumet par POST /lstng/api/listing_draft/{draftId}/publish (relevé en
// direct sur un dépôt réel, annonce 800486036114). Si la sonde n'a capté AUCUNE
// requête vers cet endpoint, aucune annonce n'a pu être créée — c'est une
// certitude, pas une présomption, et c'est ce qui autorise une reprise sans
// risque de doublon. À distinguer d'un « non confirmé » où la soumission est
// peut-être partie et où reprendre serait dangereux.
async function ebaySubmitRequestSeen(tabId) {
  try {
    const { captures } = await readProbeCaptures(tabId);
    return captures.some((c) => /\/lstng\/api\/listing_draft\/[^/]+\/publish/i.test(String(c?.url ?? "")));
  } catch {
    // Sonde illisible : on ne PRÉTEND pas que rien n'est parti. Dans le doute,
    // on répond « vue » — le job restera sur le chemin prudent (pas de reprise).
    return true;
  }
}

async function readEbayPostSubmitState(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    let path = null;
    if (tab?.url) { try { path = new URL(tab.url).pathname; } catch { /* URL interne */ } }
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        overlay: Boolean(document.querySelector('[class*="success-overlay" i], [class*="sidepane" i]')),
        botShield:
          location.pathname.includes("/splashui/") ||
          Boolean(document.querySelector('#captcha_form, form[action*="captcha_submit"], .target-icaptcha-slot')),
      }),
    });
    return {
      path,
      overlay_present: res?.result?.overlay ?? null,
      bot_shield_after_submit: res?.result?.botShield ?? null,
    };
  } catch {
    return { path: null, overlay_present: null, bot_shield_after_submit: null };
  }
}

// Popup post-publication eBay (« Votre annonce est désormais publiée sur le
// site ») : fermée en best-effort pour laisser l'onglet de travail propre — le
// succès est déjà acquis, il n'est conditionné à rien de visuel.
async function closeEbayPostPublishPopup(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(estVisibleSansLayout)],
      func: (helperSrc) => {
        const estVisible = new Function(`return (${helperSrc})`)();
        const dialog = Array.from(document.querySelectorAll('[role="dialog"], [class*="lightbox" i], [class*="modal" i]'))
          .find(estVisible);
        if (!dialog) return;
        const closer =
          dialog.querySelector('button[aria-label*="ermer" i], button[aria-label*="lose" i], button.lightbox-dialog__close') ??
          Array.from(dialog.querySelectorAll("button")).find((b) =>
            /^(fermer|close|ok|termin[eé]|continuer)$/i.test((b.textContent || "").trim())
          );
        closer?.click();
      },
    });
  } catch { /* best-effort assumé */ }
}

// Bandeaux d'erreur visibles du formulaire eBay. Sélecteurs volontairement
// larges (le markup exact des notices n'a pas été relevé) mais bornés par la
// visibilité et la taille du texte : 8-250 caractères — filtre les conteneurs
// géants (un [class*="error"] parent de tout le formulaire) et les miettes.
// Un faux positif ici part en needsUser, jamais en published : sens sûr.
// ── Sonde réseau Vinted (2026-07-12) ──────────────────────────────────────────
// Le refus « Le champ prix doit être supérieur ou égal à 1.0 » nous fait tourner
// en rond : sur la VRAIE page, le champ affiche « 95,00 € » et le masque le
// formate quelle que soit la méthode de saisie testée — et Vinted refuse quand
// même. Impossible de trancher sans voir ce qui part RÉELLEMENT sur le réseau.
//
// ⚠️ La sonde DOIT vivre dans le monde MAIN : un content script s'exécute dans un
// monde ISOLÉ, où window.fetch n'est PAS celui de la page — la patcher là n'aurait
// rien observé du tout. D'où l'injection via chrome.scripting (world: "MAIN").
//
// Purement OBSERVATIONNEL : on n'intercepte pas, on ne bloque pas, on ne rejoue
// rien. Aucune publication n'est déclenchée par cette sonde — le garde-fou
// DRY_RUN du projet reste entièrement intact.
// ── SONDE GÉNÉRIQUE (2026-07-13) ──────────────────────────────────────────────
// Généralisée de Vinted à eBay : même leçon, même parade. Une plateforme peut
// PUBLIER sans rediriger (Vinted : modale de vérification ; eBay : popup
// « Votre annonce est désormais publiée sur le site » et l'onglet reste sur
// /lstng). Se fier à la navigation, c'est déclarer « non confirmé » une annonce
// bel et bien en ligne — vécu deux fois (jobs 32a47b4e, puis 63cfc7f7 : annonce
// eBay 800332793676 publiée, job laissé en pending). La RÉPONSE SERVEUR, elle,
// ne ment pas : on l'observe, et on en fait la 2e preuve de succès.
const PROBE_ENDPOINTS = {
  // Vinted : endpoint connu et vérifié (réponse {"item":{"id":…},"code":0}).
  // ⚠️⚠️ `photos` — L'ENDPOINT D'UPLOAD, RELEVÉ EN DIRECT LE 2026-08-09 ⚠️⚠️
  // La 0.5.3 avait inscrit `images` sur la foi d'une lecture des bundles JS de
  // /items/new. C'ÉTAIT FAUX, et ça a coûté l'annonce de Gabin (job 9a8eaad8) :
  // l'upload réel est un POST XHR sur /api/v2/photos, mesuré sur la vraie page
  // avec une sonde posée à la main — 3 fichiers injectés, 3 POST
  // /api/v2/photos → 200, réponse {"id":…,"temp_uuid":…,"url":"https://
  // images1.vinted.net/…"}. ZÉRO requête sur /api/v2/images, qui n'existe pas
  // dans ce flux.
  // Conséquence de l'erreur : countImageUploadCaptures() rendait 0 EN TOUTES
  // CIRCONSTANCES, donc ensurePhotosLanded ne pouvait JAMAIS obtenir sa preuve
  // et levait à tous les coups — sur la publication comme sur la recréation.
  // Ce n'était pas une course : c'était déterministe, et invisible tant que
  // personne ne publiait sur un build ≥ 0.5.3.
  // `images` est CONSERVÉ : il ne coûte rien et couvre un renommage inverse.
  // Aucun risque de faux succès de publication : succesVintedOf exige
  // "item":{"id"} (la réponse photos porte un "id" NU, à la racine), et les
  // deux prédicats de succès filtrent sur item_upload/items.
  vinted: String.raw`\/api\/v2\/(?:items|item_upload|images|photos)`,
  // eBay : l'endpoint de soumission n'a jamais été relevé (aucun run n'avait
  // publié jusqu'ici). On capture donc TOUTE requête non-GET du domaine et on
  // cherche un numéro d'annonce dans la réponse — c'est ce que fait
  // ebayUploadSucceeded, qui exige aussi un HTTP 2xx. Le jour où l'endpoint
  // exact apparaît dans les logs, on resserrera ce motif.
  ebay: String.raw`ebay\.(?:fr|com)`,
};

// ⚠️ ANGLES MORTS ASSUMÉS de la sonde (2026-07-13, relevés lors du job
// 5e3ee1e2 — notés pour référence future, PAS élargis tant que le besoin réel
// n'apparaît pas, la preuve DOM par modale couvrant le cas rencontré) :
//   • TOP FRAME uniquement (executeScript sans allFrames) : une soumission
//     partie d'une iframe n'est pas vue ;
//   • fetch/XHR de la PAGE uniquement : navigator.sendBeacon, les web workers
//     et le service worker de la plateforme échappent aux hooks ;
//   • un POST de formulaire pleine page (navigation document) n'est pas une
//     requête fetch/XHR : invisible aussi.

async function installNetworkProbe(tabId, platform) {
  const endpointSource = PROBE_ENDPOINTS[platform];
  if (!endpointSource) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [endpointSource],
      func: (endpointSrc) => {
        if (window.__fsProbeInstalled) return;
        window.__fsProbeInstalled = true;
        window.__fsCaptures = [];
        const ENDPOINT = new RegExp(endpointSrc, "i");
        const priceOf = (body) => {
          if (typeof body !== "string") return null;
          try {
            const j = JSON.parse(body);
            const item = j.item ?? j;
            if (item && Object.prototype.hasOwnProperty.call(item, "price")) return JSON.stringify(item.price);
          } catch { /* pas du JSON */ }
          const m = body.match(/"price"\s*:\s*("[^"]*"|[\d.]+|null)/i);
          return m ? m[1] : null;
        };
        // ⚠️ Numéro d'annonce cherché sur le corps COMPLET, AVANT troncature
        // (2026-07-13, job 5e3ee1e2) : la réponse de publication peut être un
        // gros JSON où l'id apparaît bien au-delà des 250 chars conservés —
        // tronquer d'abord détruisait la preuve. Le candidat matché voyage
        // dans la capture (annonceId), à côté de l'extrait tronqué des logs.
        const annonceIdOf = (txt) => {
          const s = String(txt ?? "");
          const m =
            s.match(/"(?:listingId|itemId|item_id|listing_id)"\s*:\s*"?(\d{9,})/i) ??
            s.match(/\/itm\/(\d{9,})/);
          return m ? m[1] : null;
        };
        // ⚠️⚠️ SUCCÈS VINTED — CALCULÉ SUR LE CORPS COMPLET, comme annonceId, et
        // pour la MÊME raison portée à sa conséquence (2026-08-05).
        // La preuve de succès Vinted est « "item":{"id":N} ET "code":0 ». Or
        // MESURÉ sur une réponse réelle : le corps fait 12 714 caractères et
        // « "code":0 » est à la position 12 705 — le TOUT DERNIER champ. La
        // capture n'en conserve que 250. Le marqueur était donc TOUJOURS coupé,
        // et les deux prédicats (vintedUploadSucceeded / …ForTitle) rendaient
        // null quoi qu'il arrive : le rattrapage « canal coupé = signature d'un
        // succès » n'a JAMAIS pu fonctionner pour Vinted, ni à la publication
        // normale (censée corrigée le 13/07) ni à la recréation. Deux annonces
        // recréées et perdues le 05/08 par ce seul défaut.
        // `annonceId` ne sauvait rien : son motif ne connaît pas la forme
        // "item":{"id": de Vinted et vaut null ici.
        // On extrait donc AVANT troncature, et on garde aussi le TITRE — il
        // permet une comparaison exacte au lieu d'un « includes » sur un blob.
        const succesVintedOf = (txt) => {
          const s = String(txt ?? "");
          const id = s.match(/"item"\s*:\s*\{\s*"id"\s*:\s*(\d+)/)?.[1] ?? null;
          if (!id || !/"code"\s*:\s*0\b/.test(s)) return null;
          const titre = s.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
          let titreLisible = null;
          if (titre != null) { try { titreLisible = JSON.parse(`"${titre}"`); } catch { titreLisible = titre; } }
          return { id, titre: titreLisible };
        };
        // ⚠️ RELAIS IMMÉDIAT (2026-07-13) : window.__fsCaptures vit dans la PAGE
        // et MEURT avec elle. Or Vinted REDIRIGE après une publication réussie —
        // au moment où on voudrait lire la preuve, la page (et la capture) n'existe
        // déjà plus (job ba84ebb0 : annonce en ligne, job en "failed"). Chaque
        // capture est donc poussée DANS L'INSTANT vers le content script
        // (postMessage : seul canal entre monde MAIN et monde isolé), qui la relaie
        // au background, qui la garde. La preuve survit ainsi à la navigation.
        const relay = (cap) => {
          window.__fsCaptures.push(cap);
          try {
            window.postMessage({ __fillsellProbe: true, capture: cap }, window.location.origin);
          } catch { /* la sonde ne doit JAMAIS casser la publication */ }
        };
        // ⚠️ CORPS BINAIRES ASSAINIS (2026-07-13, job c1cd4ff1). Le motif eBay
        // capture TOUTE requête non-GET du domaine (assumé) — y compris les
        // pixels de tracking (collectsysteminfo, collectbehaviorinfo) dont la
        // réponse est un GIF ("GIF89a" + octets bruts, dont des U+0000).
        // Embarqué tel quel dans un message d'erreur, un U+0000 est REJETÉ par
        // Postgres (« unsupported Unicode escape sequence ») : le PATCH du job
        // plante, et le catch-all marque le job failed avec l'erreur Postgres —
        // une annonce PUBLIÉE (800335907526) est passée en failed comme ça.
        // Un corps visiblement binaire n'est pas conservé (l'URL et le statut
        // suffisent au diagnostic) ; le reste est nettoyé de ses caractères de
        // contrôle avant tout stockage.
        const extraitSain = (txt) => {
          const s = String(txt ?? "");
          if (/^GIF8|^\x89PNG|^\xFF\xD8/.test(s) || /[\x00-\x08\x0E-\x1F]/.test(s.slice(0, 64))) {
            return `(corps binaire, ${s.length} octets — non conservé)`;
          }
          return s.slice(0, 250).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "\uFFFD");
        };
        // \u2500\u2500 Extraits STRUCTUR\u00C9S (chantier champs obligatoires, 2026-07-16) \u2500\u2500
        // Deux payloads d\u00E9passent les 250 chars de l'extrait g\u00E9n\u00E9rique et
        // portent la v\u00E9rit\u00E9 des REQUIS :
        //   1. POST /api/v2/item_upload/attributes (Vinted) : la config des
        //      champs dynamiques de la cat\u00E9gorie \u2014 required, titre humain,
        //      options. Relev\u00E9 R\u00C9EL du 2026-07-16 sur T\u00E9l\u00E9phones portables :
        //      internal_memory_capacity/condition/sim_lock required=true.
        //   2. tout refus >= 400 : le tableau errors[{field,value}] (forme
        //      v\u00E9rifi\u00E9e en base sur les jobs f69e319c/7b67d67f du 13/07) \u2014
        //      c'est LUI qui r\u00E9v\u00E8le les requis invisibles c\u00F4t\u00E9 DOM (model).
        // Parse best-effort : pas du JSON attendu \u2192 extraits g\u00E9n\u00E9riques seuls.
        const structuredExtras = (url, status, txt) => {
          const extras = {};
          try {
            if (/item_upload\/attributes/i.test(String(url)) && !/suggestions/i.test(String(url))) {
              const j = JSON.parse(String(txt));
              if (Array.isArray(j?.attributes)) {
                extras.attrsConfig = j.attributes.map((a) => ({
                  code: String(a?.code ?? ""),
                  title: a?.configuration?.title ?? null,
                  required: a?.configuration?.required === true,
                  display: a?.configuration?.display_type ?? null,
                  options: (a?.configuration?.options ?? [])
                    .flatMap((g) => (g?.type === "group" ? g.options ?? [] : [g]))
                    .map((o) => o?.title)
                    .filter(Boolean)
                    .slice(0, 60),
                })).filter((a) => a.code);
              }
            }
            if (Number(status) >= 400) {
              const j = JSON.parse(String(txt));
              if (Array.isArray(j?.errors)) {
                extras.validationErrors = j.errors
                  .filter((e) => e && (e.field || e.value))
                  .slice(0, 20)
                  .map((e) => ({
                    field: String(e.field ?? "").slice(0, 80),
                    value: String(e.value ?? "").slice(0, 200),
                  }));
              }
            }
          } catch { /* pas du JSON : extraits g\u00E9n\u00E9riques seulement */ }
          return extras;
        };
        const origFetch = window.fetch;
        window.fetch = async function (input, init) {
          const url = typeof input === "string" ? input : input?.url ?? "";
          const res = await origFetch.apply(this, arguments);
          try {
            if (ENDPOINT.test(url) && String(init?.method ?? "GET").toUpperCase() !== "GET") {
              const txt = await res.clone().text().catch(() => "");
              relay({
                url, status: res.status,
                prix: priceOf(init?.body),
                annonceId: annonceIdOf(txt),
                succesVinted: succesVintedOf(txt),
                reponse: extraitSain(txt),
                ...structuredExtras(url, res.status, txt),
              });
            }
          } catch { /* la sonde ne doit JAMAIS casser la publication */ }
          return res;
        };
        const oOpen = XMLHttpRequest.prototype.open;
        const oSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__m = m; return oOpen.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (body) {
          try {
            if (ENDPOINT.test(this.__u ?? "") && String(this.__m).toUpperCase() !== "GET") {
              this.addEventListener("load", () => {
                // responseText jette sur les responseType non-texte : on ne
                // laisse pas la sonde planter pour un blob de tracking.
                let corps = "";
                try { corps = this.responseText ?? ""; } catch { corps = "(responseType non texte)"; }
                relay({
                  url: this.__u, status: this.status,
                  prix: priceOf(typeof body === "string" ? body : null),
                  annonceId: annonceIdOf(corps),
                  succesVinted: succesVintedOf(corps),
                  reponse: extraitSain(corps),
                  ...structuredExtras(this.__u, this.status, corps),
                });
              });
            }
          } catch { /* idem */ }
          return oSend.apply(this, arguments);
        };
      },
    });
  } catch (e) {
    console.warn(`[background] Sonde réseau ${platform} non installée :`, String(e?.message ?? e));
  }
}

// ⚠️ GARDE ANTI-CROISEMENT (2026-07-19, cas RÉEL cap Volcom / Medik8). La sonde
// eBay capture TOUT le non-GET du domaine, et le motif accepte N'IMPORTE QUEL
// id à 9+ chiffres dans la réponse : à 20:08, la republication de la casquette
// Volcom (job fbccc13f) a été « confirmée par la réponse serveur » avec l'id
// 800372232491 — l'annonce MEDIK8 publiée 30 min plus tôt, dont l'id traînait
// dans une réponse eBay (hub, cross-promo, notification…). Le job cap est parti
// published avec l'URL du Medik8, et le retrait ciblé de la casquette a ouvert
// le dialogue de fin d'annonce DU MEDIK8 — seule la garde du titre (ebay.js)
// a empêché de supprimer la mauvaise annonce.
// Principe : un id qui appartient DÉJÀ à un listing_url en base ne peut PAS
// être l'annonce qu'on vient de créer — c'est l'écho d'une annonce existante.
// REST scopé utilisateur (RLS). En cas de doute (REST en échec, pas de token),
// on REJETTE : une preuve sonde perdue se rattrape (bandeau, hub par titre —
// preuves 1 et 3), un listing_url croisé fait supprimer la mauvaise annonce.
async function ebayIdAlreadyKnown(accessToken, id) {
  if (!accessToken) return true;
  try {
    const rows = await restRequest(
      `cross_post_jobs?select=id&listing_url=like.*${id}*&limit=1`,
      accessToken
    );
    if ((rows ?? []).length) {
      console.warn(
        `[background] eBay : id candidat ${id} DÉJÀ porté par un listing_url en base — ` +
        "écho d'une annonce existante, pas une création : capture ignorée (garde anti-croisement)"
      );
      return true;
    }
    return false;
  } catch (e) {
    console.warn(
      `[background] ebayIdAlreadyKnown(${id}) : vérification impossible (${String(e?.message ?? e)}) — ` +
      "id rejeté par prudence (jamais de listing_url non vérifié)"
    );
    return true;
  }
}

// L'annonce eBay a-t-elle RÉELLEMENT été créée ? Même principe que
// vintedUploadSucceeded : la réponse serveur tranche, pas la navigation. eBay
// publie en affichant une POPUP et en restant sur /lstng — la seule redirection
// attendue n'arrive jamais (job 63cfc7f7 : annonce 800332793676 en ligne, job
// laissé en pending « non confirmée »). On exige un HTTP 2xx ET un numéro
// d'annonce (9 chiffres ou plus) dans la réponse — qui ne soit pas déjà celui
// d'une annonce connue (garde anti-croisement ci-dessus). Retourne l'URL, ou null.
async function ebayUploadSucceeded(tabId, accessToken) {
  const { captures } = await readProbeCaptures(tabId);
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    const status = Number(c?.status);
    if (!(status >= 200 && status < 300)) continue;
    // annonceId : extrait par la sonde sur le corps COMPLET de la réponse,
    // AVANT troncature (2026-07-13, job 5e3ee1e2 — un id au-delà des 250 chars
    // conservés était détruit à la capture, preuve perdue).
    if (/^\d{9,}$/.test(String(c?.annonceId ?? ""))) {
      if (await ebayIdAlreadyKnown(accessToken, c.annonceId)) continue;
      return `https://www.ebay.fr/itm/${c.annonceId}`;
    }
    // Repli : captures posées par une sonde antérieure (sans annonceId) — le
    // motif ne peut alors chercher que dans l'extrait tronqué.
    const body = String(c?.reponse ?? "");
    const m =
      body.match(/"(?:listingId|itemId|item_id|listing_id)"\s*:\s*"?(\d{9,})/i) ??
      body.match(/\/itm\/(\d{9,})/);
    if (m) {
      if (await ebayIdAlreadyKnown(accessToken, m[1])) continue;
      return `https://www.ebay.fr/itm/${m[1]}`;
    }
  }
  return null;
}

// ── Preuve de commit du prix Vinted (2026-07-13) ───────────────────────────────
// Le champ prix peut AFFICHER un montant jamais commité dans l'état React que le
// formulaire sérialise (price: null à la soumission — prouvé par la sonde, puis
// reproduit en session pilotée par lecture des fibers ; catégorie hors de cause,
// T-shirts et Baskets se comportent pareil ; le mode défaillant est lié à l'état
// focus/peinture du document, même famille que le throttling React de l'onglet
// caché documenté sur eBay). Le content script vit dans un monde ISOLÉ qui ne
// voit pas les fibers React : il demande la lecture ici (monde MAIN), et une
// peinture temporaire de l'onglet quand la repose l'exige — même mécanique
// paintTab que la suppression, rendue à l'utilisateur dès la fin de la pose.
async function readVintedPriceState(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const el = document.querySelector('#price, [data-testid="price-input--input"]');
        if (!el) return { found: false, readable: false };
        const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
        if (!key) return { found: true, readable: false, dom: String(el.value ?? "") };
        // On remonte les fibers et on renvoie TOUS les niveaux porteurs d'une
        // prop `value` (relevé réel du 2026-07-13 : niveaux bas = affichage
        // formaté "95,00 €", niveau formulaire = valeur BRUTE "95"). ⚠️ Ne pas
        // résumer au "plus haut" : après la repose peinte du job c7e10631, ce
        // raccourci a pris un niveau d'affichage pour le formulaire (faux
        // positif → price: null envoyé quand même). C'est le content script
        // qui exige un niveau BRUT au bon montant.
        let fiber = el[key];
        const levels = [];
        for (let depth = 0; fiber && depth < 8; depth++, fiber = fiber.return) {
          const v = fiber.memoizedProps && typeof fiber.memoizedProps === "object"
            ? fiber.memoizedProps.value
            : undefined;
          if (typeof v === "string" || typeof v === "number") levels.push(String(v));
        }
        return {
          found: true,
          readable: levels.length > 0,
          dom: String(el.value ?? ""),
          committed: levels.length ? levels[levels.length - 1] : null,
          levels,
        };
      },
    });
    return res?.result ?? { found: false, readable: false };
  } catch (e) {
    return { found: false, readable: false, error: String(e?.message ?? e) };
  }
}

// ── Commit du prix par appel DIRECT des props React (v3, 2026-07-13) ──────────
// HISTORIQUE des deux impasses, toutes deux prouvées en réel :
//   · v1 « repose avec onglet peint » : paintTab ne produit aucun événement
//     d'entrée, le mode commits-perdus persistait (job c7e10631, price: null).
//   · v2 « clic trusted chrome.debugger » : a bien commité (job 32a47b4e,
//     prix 125 envoyé) MAIS bandeau « débogage en cours » global et non
//     supprimable sans flag de lancement — invendable en production, et les
//     Input.dispatchMouseEvent ne sont de toute façon PAS délivrés à une
//     fenêtre non rendue (mesuré : 0 événement, souris comme clavier).
// v3 — LE canal propre, prouvé en session pilotée dans les conditions exactes
// de l'échec (onglet caché, hasFocus=false, zéro CDP) : le composant prix
// (premier ancêtre fiber de #price dont les props portent onChange + currency/
// locale) tient l'affichage dans son état interne mais sa prop `value` reste
// undefined — le formulaire n'a rien reçu. Appeler DIRECTEMENT son
// props.onChange("95") committe au niveau formulaire (prop value = "95",
// signature exacte du mode sain). Sans événement, sans focus, sans rendu,
// sans permission supplémentaire : Chrome par défaut, n'importe quel poste.
async function commitVintedPrice(tabId, value) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [value],
      func: (raw) => {
        const el = document.querySelector('#price, [data-testid="price-input--input"]');
        if (!el) return { ok: false, reason: "champ prix introuvable" };
        const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
        if (!key) return { ok: false, reason: "fibers React introuvables sur #price" };
        // Localisateur robuste (pas de profondeur codée en dur) : le composant
        // prix est le premier ancêtre dont les props exposent onChange ET un
        // marqueur monétaire (currency/locale) — relevé réel du 2026-07-13.
        let fiber = el[key];
        for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
          const p = fiber.memoizedProps;
          if (
            p && typeof p === "object" && typeof p.onChange === "function" &&
            ("currency" in p || "locale" in p)
          ) {
            try {
              p.onChange(String(raw));
              return { ok: true, depth };
            } catch (e) {
              return { ok: false, reason: `onChange a jeté : ${String(e?.message ?? e)}` };
            }
          }
        }
        return { ok: false, reason: "composant prix (onChange+currency/locale) introuvable dans les 12 niveaux" };
      },
    });
    return res?.result ?? { ok: false, reason: "executeScript sans résultat" };
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

// ── Clic React DIRECT par fibers/props, monde MAIN ────────────────────────────
// MÊME canal que commitVintedPrice : dans la fenêtre de travail minimisée, les
// events synthétiques ne déclenchent pas les handlers React. On appelle donc
// DIRECTEMENT le onClick React du bouton (mise à jour d'état, sans event ni rendu).
//
// ⚠️ CAUSE ÉLUCIDÉE le 2026-07-18 (observation en direct, en tant que PROPRIÉTAIRE
// de l'annonce) : la suppression Vinted échouait (« Modale de confirmation
// introuvable / ni disparition ni modale ») non pas parce que le clic n'aboutit
// pas, mais parce que le bouton "Supprimer" (item-delete-button) est HYDRATÉ
// PARESSEUSEMENT — son onClick React n'existe QUE lorsque la colonne d'actions
// owner entre dans le VIEWPORT (intersection). Sur 5 s sans scroller : 0×0, aucun
// onClick. Après un vrai scroll : 361×36 + __reactProps$.onClick, et l'appeler
// supprime bien l'annonce. L'extension cliquait AVANT hydratation → onClick absent.
// Parade (ci-dessous) : ATTENDRE l'hydratation en amenant la zone dans le viewport
// (scroll par paliers), poller l'onClick, puis l'appeler. Un élément déjà hydraté
// (bouton de confirmation d'une modale fraîche) est pris au 1er tour, sans scroll.
async function vintedFiberClick(tabId, selector) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [selector],
      func: async (sel) => {
        const diagOf = () => {
          const el = document.querySelector(sel);
          const r = el ? el.getBoundingClientRect() : null;
          return {
            rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
            offsetParent: !!(el && el.offsetParent),
            visibilityState: document.visibilityState,
          };
        };

        // Récupère le onClick React de l'élément : sac de props (__reactProps$)
        // puis remontée des fibers (onClick/onClickCapture, 20 niveaux).
        const getHandler = (el) => {
          if (!el) return null;
          const pk = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
          if (pk) {
            const p = el[pk] || {};
            for (const h of ["onClick", "onClickCapture", "onPointerDown"]) {
              if (typeof p[h] === "function") return { fn: p[h], source: `props.${h}` };
            }
          }
          const fk = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
          if (fk) {
            let f = el[fk];
            for (let d = 0; f && d < 20; d++, f = f.return) {
              const p = f.memoizedProps;
              if (p && typeof p === "object") {
                for (const h of ["onClick", "onClickCapture"]) {
                  if (typeof p[h] === "function") return { fn: p[h], source: `fiber.${h}@${d}` };
                }
              }
            }
          }
          return null;
        };
        const call = (fn, source) => {
          const ev = {
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
            persist() {}, currentTarget: document.querySelector(sel), target: document.querySelector(sel),
            nativeEvent: {}, type: "click", bubbles: true, isTrusted: false,
          };
          try { fn(ev); return { ok: true, source, arg: "event", diag: diagOf() }; }
          catch (e1) {
            try { fn(); return { ok: true, source, arg: "none", diag: diagOf() }; }
            catch (e2) { return { ok: false, reason: `onClick (${source}) a jeté : ${String(e2?.message ?? e2)}`, diag: diagOf() }; }
          }
        };

        // ⚠️ CAUSE RACINE (prouvée en direct le 2026-07-18, propriétaire) : le
        // bouton "Supprimer" (item-delete-button) est HYDRATÉ PARESSEUSEMENT — il
        // n'a son onClick React QUE lorsque la colonne d'actions owner entre dans
        // le VIEWPORT (intersection au scroll). L'extension cliquait avant → onClick
        // absent → rien. On ATTEND donc l'hydratation, en amenant la zone dans le
        // viewport (scroll) pour la déclencher, puis on appelle l'onClick.
        // Un élément déjà hydraté (bouton de confirmation d'une modale fraîche)
        // est trouvé au 1er tour, sans scroll.
        const deadline = Date.now() + 12000;
        let tick = 0;
        while (Date.now() < deadline) {
          const el = document.querySelector(sel);
          if (el) {
            const h = getHandler(el);
            if (h) return call(h.fn, h.source);
            // Pas encore hydraté : provoquer l'intersection. scrollIntoView est un
            // no-op sur un élément 0×0, donc on scrolle AUSSI la fenêtre par paliers.
            try { el.scrollIntoView({ block: "center" }); } catch {}
            const max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
            window.scrollTo(0, (tick * 400) % (max + 400));
            tick++;
          }
          await new Promise((r) => setTimeout(r, 300));
        }

        const el = document.querySelector(sel);
        const pk = !!(el && Object.keys(el).some((k) => k.startsWith("__reactProps$")));
        const fk = !!(el && Object.keys(el).some((k) => k.startsWith("__reactFiber$")));
        return {
          ok: false,
          reason: `aucun onClick React après 12 s d'attente d'hydratation sur ${sel} (reactProps:${pk}, reactFiber:${fk})`,
          diag: diagOf(),
        };
      },
    });
    return res?.result ?? { ok: false, reason: "executeScript sans résultat" };
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

// Captures relayées par la sonde, gardées CÔTÉ BACKGROUND (2026-07-13), pour
// TOUTES les plateformes sondées. Indispensable : la page — donc
// window.__fsCaptures — meurt à la redirection post-publication, exactement
// quand on a besoin de la preuve. Ici, elles survivent à la navigation, à la
// mort du content script, et au job lui-même.
const probeCapturesByTab = new Map();

function recordProbeCapture(tabId, capture) {
  const list = probeCapturesByTab.get(tabId) ?? [];
  list.push(capture);
  // On ne garde que les dernières : un onglet de travail sert des dizaines de
  // jobs sans jamais être fermé. (eBay capture TOUT le non-GET du domaine :
  // la fenêtre est plus large que sur Vinted, d'où les 30.)
  probeCapturesByTab.set(tabId, list.slice(-30));
}

// Captures brutes de la sonde (objets, pas le résumé texte de readVintedProbe).
// Union des deux sources : celles relayées (survivent à tout) et celles encore
// présentes dans la page (au cas où le relais n'aurait pas eu le temps).
async function readProbeCaptures(tabId) {
  let inPage = [];
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => window.__fsCaptures ?? [],
    });
    inPage = res?.result ?? [];
  } catch { /* page morte/naviguée : les captures relayées suffisent */ }
  const relayed = probeCapturesByTab.get(tabId) ?? [];
  const seen = new Set();
  const captures = [...relayed, ...inPage].filter((c) => {
    const k = `${c?.url}|${c?.status}|${c?.reponse}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { captures };
}

// Vide les captures d'un onglet AVANT un nouveau job : sans ça, la preuve de
// succès du job PRÉCÉDENT (même onglet de travail, jamais fermé) ferait passer
// le job courant pour publié. Erreur qu'on ne peut pas se permettre : elle
// créerait des doublons et des listing_url croisés.
function clearProbeCaptures(tabId) {
  probeCapturesByTab.delete(tabId);
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => { window.__fsCaptures = []; },
    })
    .catch(() => {});
}

// L'annonce Vinted a-t-elle RÉELLEMENT été créée ? Lecture de la réponse
// serveur : HTTP 200 + code:0 + item.id ⇒ oui, quoi qu'ait fait la page ensuite
// (redirection qui tue le content script, modale de vérification, timeout…).
// Retourne l'URL de l'annonce, ou null.
// ⚠️ LIT `succesVinted`, calculé sur le corps COMPLET par la sonde — PAS
// `reponse`, qui est tronqué à 250 caractères et où « "code":0 » (position
// ~12 700 d'une réponse Vinted) ne figure JAMAIS. C'est ce détail qui rendait
// ce prédicat toujours null et qui a laissé passer deux annonces recréées le
// 05/08. Le repli sur l'extrait tronqué reste, pour les captures posées par une
// sonde antérieure au correctif : il n'aboutira pas sur Vinted, mais il ne
// coûte rien et ne ment pas.
async function vintedUploadSucceeded(tabId) {
  const { captures } = await readProbeCaptures(tabId);
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    if (Number(c?.status) !== 200) continue;
    if (!/item_upload\/items/i.test(String(c?.url ?? ""))) continue;
    if (c?.succesVinted?.id) return `https://www.vinted.fr/items/${c.succesVinted.id}`;
    const body = String(c?.reponse ?? "");
    const id = body.match(/"item"\s*:\s*\{\s*"id"\s*:\s*(\d+)/);
    if (id && /"code"\s*:\s*0\b/.test(body)) return `https://www.vinted.fr/items/${id[1]}`;
  }
  return null;
}

// Résumé lisible de ce que Vinted a REÇU, à joindre à l'erreur du job.
async function readVintedProbe(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => window.__fsCaptures ?? [],
    });
    // Les uploads de photos (/api/v2/photos) sont dans la sonde depuis la
    // 0.5.5 : ce sont des requêtes de la page, PAS des soumissions. Les
    // compter ici ferait disparaître le verdict « rien n'est parti », qui est
    // le plus utile des deux.
    const caps = (res?.result ?? []).filter((c) => !/\/api\/v2\/(?:photos|images)\b/i.test(String(c?.url ?? "")));
    if (!caps.length) {
      return (
        " [sonde réseau : AUCUNE requête de publication n'est partie — Vinted a bloqué la " +
        "soumission côté client, le formulaire n'a jamais été envoyé au serveur.]"
      );
    }
    const c = caps[caps.length - 1];
    return (
      ` [sonde réseau : ${c.url} → HTTP ${c.status} · prix ENVOYÉ = ${c.prix ?? "ABSENT du corps"}` +
      ` · réponse : ${String(c.reponse).replace(/\s+/g, " ")}]`
    );
  } catch (e) {
    return ` [sonde réseau indisponible : ${String(e?.message ?? e)}]`;
  }
}

// Notice de SUCCÈS d'eBay après « Mettre en vente » (2026-07-12). eBay la rend
// dans une .page-notice — le même conteneur que ses erreurs, d'où la confusion
// qui a marqué "failed" une annonce réellement publiée. Texte relevé en réel :
// « Votre annonce est désormais publiée sur le site ».
// On cherche la formulation, pas le conteneur : c'est le seul discriminant fiable.
// ⚠️ VISIBILITÉ SANS LAYOUT (2026-07-13, fenêtre de travail dédiée) : ne jamais
// filtrer par getClientRects()/offsetParent ici. Un onglet non rendu n'a AUCUN
// layout — tous les rects valent 0, y compris pour les bandeaux réellement
// affichés. Ces deux lectures deviendraient aveugles : plus jamais de
// confirmation de publication reconnue, plus jamais d'erreur détectée. Le style
// CALCULÉ, lui, reste disponible sans layout : c'est le seul critère de
// visibilité utilisable dans une fenêtre minimisée. innerText dépend AUSSI du
// layout (vide sans rendu) → textContent.
function estVisibleSansLayout(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    // ⚠️ PAS DE TEST SUR L'ATTRIBUT hidden (2026-07-13, prouvé sur le dialogue
    // eBay « Mettre fin à l'annonce » OUVERT à l'écran — job d4fd6671) : eBay
    // LAISSE hidden sur la RACINE de ses dialogues (lightbox-dialog) et
    // l'écrase en CSS (aria-hidden="false", display:flex). Le seul effet réel
    // de hidden est display:none via la feuille UA : si le display calculé
    // n'est pas none, la page l'a écrasé volontairement, donc l'élément EST
    // affiché. Le test display ci-dessous couvre déjà les VRAIS hidden — et la
    // lecture de la confirmation de publication en MODALE (f03bd3f) passe par
    // ICI : même piège, même conteneur lightbox-dialog (cf. le faux négatif
    // « publication non confirmée » du job 5e3ee1e2, contourné à la main).
    if (n.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(n);
    // ⚠️ PAS DE TEST SUR L'OPACITÉ (2026-07-13, prouvé sur la vraie page Beebs).
    // Les animations CSS NE TOURNENT PAS dans une fenêtre non rendue : un élément
    // qui s'ouvre avec une animation « fade-in » reste bloqué sur la 1re keyframe,
    // donc opacity: 0 — POUR TOUJOURS. Mesuré sur le dialogue « Supprimer mon
    // annonce » : data-state="open", display:grid, visibility:visible… et
    // opacity:"0". Le rejeter, c'est se rendre aveugle exactement comme avec
    // getClientRects — c'est ce qui donnait « Dialogue introuvable » alors que le
    // clic avait parfaitement ouvert la modale.
    // display:none / visibility:hidden / aria-hidden restent : ceux-là
    // sont posés explicitement et ne dépendent d'aucune animation.
    if (st.display === "none" || st.visibility === "hidden") return false;
  }
  return true;
}

// ⚠️ LA CONFIRMATION PEUT ARRIVER EN MODALE (2026-07-13, job 5e3ee1e2) : eBay a
// affiché « Votre annonce est désormais publiée sur le site » dans une POPUP
// (item 800334919061 dedans), pas dans un bandeau — les sélecteurs ci-dessous
// ne scannaient que des bandeaux, la modale est restée invisible pour ce
// lecteur pendant les 20 s de verifyEbaySubmission, et le job d'une annonce EN
// LIGNE est parti en « non confirmée » (retry = risque de doublon). On scanne
// donc AUSSI les conteneurs de popup — la même famille de sélecteurs que
// closeEbayPostPublishPopup, qui savait déjà les trouver pour les fermer.
// Retourne { text, listingUrl } (listingUrl si un numéro d'annonce est présent
// dans la modale : href /itm/… prioritaire, sinon nombre de 9+ chiffres du
// texte), ou null.
async function readEbaySuccessNotice(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      // La fonction injectée ne capture AUCUNE portée : le helper de visibilité
      // est passé en source et reconstruit dans la page.
      args: [String(estVisibleSansLayout)],
      func: (helperSrc) => {
        const estVisible = new Function(`return (${helperSrc})`)();
        const RE = /annonce est (?:désormais )?(?:en ligne|publiée)|votre annonce a été (?:publiée|mise en vente)|listing is now live|your listing (?:was|has been) (?:published|posted)/i;
        const containers = document.querySelectorAll(
          '[role="alert"], .page-notice, .inline-notice, [class*="notice" i], [class*="success" i], ' +
          '[role="dialog"], [class*="lightbox" i], [class*="modal" i]'
        );
        for (const el of containers) {
          if (!estVisible(el)) continue;
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!t || !RE.test(t)) continue;
          let id = null;
          for (const a of el.querySelectorAll('a[href*="/itm/"]')) {
            const m = String(a.getAttribute("href") || "").match(/\/itm\/(\d{9,})/);
            if (m) { id = m[1]; break; }
          }
          if (!id) id = (t.match(/\b(\d{9,})\b/) || [])[1] ?? null;
          return { text: t.slice(0, 160), listingUrl: id ? `https://www.ebay.fr/itm/${id}` : null };
        }
        return null;
      },
    });
    return res?.result ?? null;
  } catch (e) {
    console.warn("[background] readEbaySuccessNotice :", String(e?.message ?? e));
    return null; // dans le doute, on ne PRÉTEND pas au succès
  }
}

async function readVisibleEbayErrors(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [String(estVisibleSansLayout)], // cf. readEbaySuccessNotice : pas de layout en fenêtre minimisée
      func: (helperSrc) => {
        const estVisible = new Function(`return (${helperSrc})`)();
        const texts = [];
        const seen = new Set();
        const sel = '[role="alert"], .page-notice, .inline-notice, [class*="error" i]';
        for (const el of document.querySelectorAll(sel)) {
          if (!estVisible(el)) continue;
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length < 8 || t.length > 250 || seen.has(t)) continue;
          seen.add(t);
          texts.push(t);
        }
        return texts.slice(0, 3);
      },
    });
    return res?.result ?? [];
  } catch (e) {
    console.warn("[background] readVisibleEbayErrors :", String(e?.message ?? e));
    return [];
  }
}

// ── A1 : capture de l'URL de l'annonce créée (publication LIVE) ────────────────
// Ce que fait RÉELLEMENT chaque plateforme après le clic de publication
// (constaté en publication réelle le 2026-07-11, plus de suppositions) :
//   vinted    → REDIRIGE vers /member/{userId} (le profil, pas l'annonce !).
//               L'URL de l'annonce (/items/{id}-{slug}) n'apparaît QUE dans la
//               liste du dressing → surveillance de l'URL puis repli "liens de
//               la page", qui la trouve là.
//   leboncoin → /deposer-une-annonce/confirmation : "Nous avons bien reçu votre
//               annonce !" — AUCUN lien vers l'annonce (pas de "Voir mon
//               annonce"). L'URL /ad/{categorie}/{id} n'existe que dans
//               "Mes annonces" → aller-retour obligatoire (captureFromMyListings).
//   beebs     → /fr/listing/success : "Votre article a bien été ajouté…" — aucun
//               lien non plus, ET l'annonce part en modération avant d'être en
//               ligne. Même aller-retour, sur /my-adverts/creating.
//               ⚠️ Le format d'URL produit Beebs reste NON OBSERVÉ (l'annonce de
//               test n'était pas sortie de modération) : le pattern ci-dessous
//               est encore une supposition, à confirmer.
//   ebay      → non observé : le clic a déclenché une ré-authentification
//               passkey (cf. detectReauth), l'annonce n'a jamais été créée.
const LISTING_URL_PATTERNS = {
  vinted: /https:\/\/www\.vinted\.(?:fr|com)\/items\/\d+[^#\s"']*/i,
  leboncoin: /https:\/\/www\.leboncoin\.fr\/ad\/[^#\s"']+\/\d+[^#\s"']*/i,
  ebay: /https:\/\/www\.ebay\.(?:fr|com)\/itm\/[^#\s"']*\d{9,}[^#\s"']*/i,
  beebs: /https:\/\/www\.beebs\.app\/[^#\s"']*(?:produit|product|annonce|item|p\/)[^#\s"']+/i,
};

// Page "Mes annonces" par plateforme (2026-07-11) : Leboncoin et Beebs NE
// redirigent PAS vers l'annonce créée — leur dépôt finit sur une page de
// confirmation générique ("Nous avons bien reçu votre annonce !" /
// "Votre article a bien été ajouté…"), sans le moindre lien vers l'annonce.
// Constaté en publication réelle. Le SEUL endroit où l'URL existe est la liste
// des annonces du compte : on y fait un aller-retour, on repère l'annonce par
// son TITRE (exact), et on revient. Vinted et eBay, eux, redirigent
// directement — pas d'aller-retour pour eux.
// Plateformes dont l'annonce n'est PAS consultable au moment du dépôt : leur
// listing_url est DIFFÉRÉ par nature, et le chercher tout de suite est du temps
// perdu (une navigation, plusieurs minutes) pour un résultat garanti vide.
// Beebs annonce lui-même la modération : « il sera mis en ligne dès qu'il aura
// été vérifié par notre équipe ». Le job est publié quand même ; la re-capture
// différée fera le reste.
const PLATFORMS_WITH_DEFERRED_URL = new Set(["beebs"]);

const MY_LISTINGS_URL = {
  leboncoin: "https://www.leboncoin.fr/compte/part/mes-annonces",
  // Beebs : conservé pour la RE-CAPTURE DIFFÉRÉE uniquement (jamais appelé au
  // moment du dépôt — cf. PLATFORMS_WITH_DEFERRED_URL).
  beebs: "https://www.beebs.app/fr/account/my-adverts/creating",
  // eBay (ajouté le 2026-07-13) : le commentaire ci-dessus disait « eBay
  // redirige directement, pas d'aller-retour » — c'était une SUPPOSITION, eBay
  // n'ayant jamais publié en réel à l'époque (ré-auth passkey). Maintenant qu'il
  // publie : la page d'après-publication n'expose PAS d'URL /itm/ exploitable
  // (job f89341ab : annonce 800332688748 bel et bien en ligne, listing_url vide,
  // « aucune URL capturée »). VÉRIFIÉ sur le Hub vendeur : /sh/lst/active porte
  // le lien https://www.ebay.fr/itm/800332688748 avec le TITRE exact de
  // l'annonce — exactement ce dont findListingLinkInPage a besoin.
  ebay: "https://www.ebay.fr/sh/lst/active",
};

async function captureListingUrl(tabId, platform, job = null, timeoutMs = 25_000) {
  const pattern = LISTING_URL_PATTERNS[platform];
  if (!pattern) return null;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return null;
    const m = (tab.url || "").match(pattern);
    if (m) return m[0].replace(WORK_TAB_FRAGMENT, "");
    await sleep(1000);
  }

  // Repli 1 : la page où l'on a atterri contient le lien de l'annonce —
  // profil Vinted (qui liste TOUTES les annonces : le titre est indispensable
  // pour ne pas ramener la mauvaise) ou vraie page de confirmation.
  const { url: fromLinks } = await findListingLinkInPage(tabId, pattern.source, job?.title ?? null);
  if (fromLinks) return fromLinks;

  // Repli 2 (LBC/Beebs) : aller-retour par "Mes annonces". L'onglet de travail
  // est navigué puis RENDU à la page où il était — un vendeur qui va vérifier
  // son annonce fait exactement ce trajet.
  const myListings = MY_LISTINGS_URL[platform];
  if (!myListings) {
    console.warn(`[background] captureListingUrl(${platform}) : aucune URL capturée — listing_url restera vide`);
    return null;
  }
  return captureFromMyListings(tabId, platform, pattern, myListings, job?.title ?? null);
}

// Cherche le lien de NOTRE annonce dans la page courante.
// ⚠️ Le titre n'est PAS optionnel dans les faits : après une publication
// Vinted, l'onglet atterrit sur le PROFIL du vendeur, qui liste toutes ses
// annonces (86 sur le compte de test). Prendre "le premier lien qui matche le
// pattern" y ramènerait l'URL d'un AUTRE article — et on l'écrirait dans
// listing_url, donc la détection de vente surveillerait le mauvais article et
// le retrait cross-plateforme supprimerait la mauvaise annonce.
//
// ⚠️⚠️ CE DANGER S'EST RÉALISÉ (2026-07-13, constaté en base). Le repli
// « lien unique » ci-dessous contournait la garde qu'on venait d'écrire : sur
// « Mes annonces » Beebs, UNE SEULE annonce était listée à ce moment-là (le
// T-shirt Patagonia — la New Balance était encore en modération). unique === 1,
// donc on a rendu l'URL du Patagonia… pour le job New Balance. Résultat en base :
// un job Beebs « 9060 Noir » portant l'URL de l'annonce du T-shirt. Une vente du
// Patagonia aurait été comptée sur la New Balance, et un retrait cross-plateforme
// aurait SUPPRIMÉ LA MAUVAISE ANNONCE.
// Règle désormais : sur une page de LISTE (Mes annonces, profil vendeur…), le
// match par TITRE est OBLIGATOIRE — requireTitle:true. Le repli « lien unique »
// ne vaut QUE sur une vraie page de confirmation, où l'unique lien est
// forcément celui de l'annonce qu'on vient de déposer.
//
// ⚠️⚠️⚠️ ET ÇA N'A PAS SUFFI (2026-07-22, reproduit en direct sur le Hub eBay).
// requireTitle:true était bien actif, et la mauvaise URL sortait quand même :
// ce n'est pas le repli « lien unique » qui déraillait, c'est LE TEST DU TITRE
// LUI-MÊME, faussé par un périmètre trop large. Le scope venait de
//   el.closest("article, li, [class*='item'], [class*='card']")
// et `[class*='card']` attrape le <div class="card-old"> d'eBay, qui enveloppe
// TOUT LE TABLEAU du Hub vendeur. Résultat mesuré : pour les 10 ancres /itm/ de
// la page, le « hay » faisait 5 700 caractères — la page entière. Les mots du
// titre cherché s'y trouvent forcément (ils sont dans SA ligne à elle), donc le
// test passait pour TOUTES les ancres et on rendait la PREMIÈRE, c'est-à-dire
// la plus vieille annonce du vendeur.
// Dégâts constatés en base : 5 jobs eBay, 3 articles différents (G-Shock,
// casquette Volcom, Patagonia), TOUS avec la même URL 800378950306 — une montre
// CasiOak que FillSell n'a jamais publiée. 100 % des URLs eBay jamais
// enregistrées étaient fausses. Les deux jobs de suppression ont donc visé
// cette annonce-là ; seule la garde du titre d'ebay.js (le dialogue de fin
// d'annonce doit NOMMER l'article du job) a empêché de supprimer la mauvaise.
// PARADE : le périmètre n'est plus DEVINÉ par des sélecteurs (ils changent, et
// une seule classe trop générique casse tout en silence) mais DÉDUIT de la page
// — on remonte depuis le lien tant que l'ancêtre ne contient qu'une annonce.
// Plus une garde explicite : un scope multi-annonces est REJETÉ, jamais utilisé
// pour valider un titre.
// Retourne { url, diag } — url = lien de NOTRE annonce (ou null), diag = ce que
// la page contenait vraiment (nombre d'ancres, liens conformes au pattern,
// échantillon de chemins). Le diag existe parce qu'un échec Beebs était
// INDIAGNOSTICABLE (2026-07-13, job f834e5a5 : listing_url jamais capturée
// malgré des cycles de re-capture) : impossible de savoir si c'est le pattern
// d'URL (toujours une supposition pour Beebs) qui ne matche aucun lien, ou le
// titre qui ne matche aucune carte. Le log du caller nomme désormais la cause.
async function findListingLinkInPage(tabId, patternSource, title = null, { requireTitle = false } = {}) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (src, wanted, titreObligatoire) => {
        const re = new RegExp(src, "i");
        const ancres = Array.from(document.querySelectorAll("a[href]"));
        const matches = [];
        for (const a of ancres) {
          const m = a.href.match(re);
          if (m) matches.push({ url: m[0], el: a });
        }
        const diag = {
          ancres: ancres.length,
          conformesAuPattern: matches.length,
          chemins: [...new Set(
            ancres.map((a) => { try { return new URL(a.href).pathname; } catch { return null; } }).filter(Boolean)
          )].slice(0, 12),
        };
        // Annonces DISTINCTES contenues dans un élément — la mesure qui sert à
        // la fois à trouver le périmètre d'une carte et à le refuser.
        const annoncesDe = (n) => new Set(
          Array.from(n.querySelectorAll ? n.querySelectorAll("a[href]") : [])
            .map((a) => (a.href.match(re) || [])[0])
            .filter(Boolean)
        );
        const done = (url) => ({ url, diag });
        if (!matches.length) return done(null);

        if (wanted) {
          // Normalisation insensible aux EMOJI et à la ponctuation (2026-07-13) :
          // un titre « T-shirt Patagonia P-6 Logo noir 🔥 » doit matcher une
          // carte qui l'affiche sans l'emoji ou avec une ponctuation remaniée.
          // Ne garder que lettres et chiffres reste DISCRIMINANT (deux annonces
          // se distinguent par leurs mots, pas par leurs emoji) : la garde
          // anti-« mauvaise annonce » ne s'affaiblit pas.
          const norm = (s) => (s || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
          const target = norm(wanted);
          // MOTS DANS L'ORDRE, pas sous-chaîne contiguë (2026-07-20, job
          // e1ad45fc). AVANT : hay.includes(target) — une recherche de
          // sous-chaîne CONTIGUË. Un seul mot inséré au milieu du titre réel la
          // fait échouer, même quand tous les mots cherchés sont là, dans
          // l'ordre. Cas prouvé en live sur « Mes annonces » LBC :
          //   job     « Casquette Volcom Stone beige »
          //   annonce « Casquette Volcom Stone Logo Beige »   ← « Logo » inséré
          //   includes() = false → listing_url resté NULL → bandeau « Lien
          //   d'annonce introuvable » dans le Stock, alors que l'annonce était
          //   bien en ligne et le lien bien présent dans la page.
          // MAINTENANT : tous les mots du titre du job doivent apparaître dans
          // la carte, DANS LE MÊME ORDRE RELATIF, les mots intercalés étant
          // ignorés. La garde anti-« mauvaise annonce » NE s'affaiblit PAS :
          //   · TOUS les mots restent exigés (aucun n'est optionnel) ;
          //   · l'ORDRE reste exigé (« veste rouge » ne matche pas « rouge veste ») ;
          //   · le périmètre reste la CARTE (cf. carteDe ci-dessous), pas la page ;
          //   · requireTitle:true est inchangé — pas de titre reconnu, rien rendu.
          // Bord gauche (?<![\p{L}\p{N}]) et PAS de bord droit : c'est
          // volontaire. Le textContent des cartes LBC colle les mots entre eux
          // (relevé réel : « …stone logo beigecasquette volcom… »), un bord
          // droit ferait rater « beige ». Le bord gauche suffit à empêcher un
          // mot cherché de matcher la FIN d'un autre mot. Pas d'échappement
          // regex nécessaire : norm() ne laisse que lettres et chiffres.
          const mots = target.split(" ").filter(Boolean);
          const ordre = mots.length
            ? new RegExp(mots.map((m) => `(?<![\\p{L}\\p{N}])${m}`).join("[\\s\\S]*?"), "u")
            : null;
          // Périmètre de LA carte, DÉDUIT de la page (2026-07-22) au lieu d'être
          // deviné par une liste de sélecteurs — cf. commentaire de tête : le
          // `[class*='card']` attrapait le <div class="card-old"> du Hub eBay,
          // qui enveloppe TOUT le tableau. On remonte depuis le lien tant que
          // l'ancêtre ne contient qu'UNE SEULE annonce ; le dernier ancêtre
          // mono-annonce EST la carte, quel que soit le markup de la plateforme
          // (et il n'y a plus de sélecteur à maintenir quand elles changent).
          const carteDe = (ancre) => {
            let scope = ancre;
            for (let n = ancre.parentElement, d = 0; n && d < 15; n = n.parentElement, d++) {
              if (annoncesDe(n).size > 1) break;
              scope = n;
            }
            return scope;
          };
          // DÉPARTAGE PAR COMPACITÉ (2026-07-22) — le périmètre corrigé ne
          // suffit pas. Mesuré sur le Hub : le vendeur avait DEUX G-Shock aux
          // titres composés des MÊMES mots dans un ordre différent…
          //   job / annonce A : « …Digital Display Shock Resistant Resin Bracelet »
          //   annonce B       : « …Digital Display Resin Bracelet Shock Resistant »
          // …et le titre d'une carte y est répété (lien + libellé
          // « Afficher l'historique du trafic »). Les mots-dans-l'ordre peuvent
          // donc être satisfaits EN SAUTANT d'une copie du titre à l'autre :
          // B passait le test, et comme on rendait la PREMIÈRE carte trouvée,
          // c'est B qui sortait — encore la mauvaise annonce.
          // Parade : on ne rend plus la première carte qui matche, on garde la
          // PLUS COMPACTE — la longueur du texte réellement couvert par le
          // match. Un titre exact couvre exactement sa longueur (72 caractères
          // mesurés pour A) ; un match qui doit sauter d'une copie à l'autre en
          // couvre bien plus (155 pour B). Et si les deux meilleures sont à
          // ÉGALITÉ, on ne devine pas : rien n'est rendu (l'ambiguïté est
          // tracée dans diag, et la re-capture différée retentera).
          const parUrl = new Map();
          for (const { url, el } of matches) {
            const scope = carteDe(el);
            // Garde explicite (ceinture) : un périmètre qui contient plusieurs
            // annonces DIFFÉRENTES ne prouve rien sur le titre — le titre
            // cherché peut y figurer à cause d'une AUTRE carte. On le rejette
            // au lieu de rendre le premier lien de la page. C'est exactement ce
            // qui a collé l'URL de la CasiOak sur 3 articles de suite.
            if (annoncesDe(scope).size > 1) continue;
            const hay = norm((el.getAttribute("title") || "") + " " + el.textContent + " " + scope.textContent);
            const trouve = ordre ? ordre.exec(hay) : null;
            if (!trouve) continue;
            const etendue = trouve[0].length;
            if (!parUrl.has(url) || parUrl.get(url) > etendue) parUrl.set(url, etendue);
          }
          const classement = [...parUrl.entries()].sort((a, b) => a[1] - b[1]);
          diag.candidatsTitre = classement.slice(0, 4).map(([u, e]) => ({ url: u, etendue: e }));
          if (classement.length === 1) return done(classement[0][0]);
          if (classement.length > 1) {
            if (classement[0][1] < classement[1][1]) return done(classement[0][0]);
            diag.ambiguite = "plusieurs annonces matchent le titre avec la même compacité — rien rendu";
            return done(null);
          }
        }
        // Page de liste : pas de titre reconnu = on ne rend RIEN. Mieux vaut un
        // listing_url vide (que la re-capture différée retentera) qu'une URL qui
        // appartient à un autre article.
        if (titreObligatoire) return done(null);
        // Page de confirmation : un lien unique est sans ambiguïté ;
        // plusieurs → on refuse de deviner.
        const unique = [...new Set(matches.map((m) => m.url))];
        return done(unique.length === 1 ? unique[0] : null);
      },
      args: [patternSource, title, requireTitle],
    });
    return res?.result ?? { url: null, diag: null };
  } catch (e) {
    console.warn("[background] findListingLinkInPage :", String(e?.message ?? e));
    return { url: null, diag: null };
  }
}

async function captureFromMyListings(tabId, platform, pattern, myListingsUrl, title) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const backTo = tab?.url ?? null;
  try {
    console.log(`[background] captureListingUrl(${platform}) : aller-retour par "Mes annonces"`);
    // 8-15 s : constaté en LIVE réel (2026-07-12), 1,5-3,5 s ne suffisaient
    // pas — l'annonce venait d'être déposée mais n'était pas encore indexée
    // dans "Mes annonces" (LBC comme Beebs). Si elle n'y est toujours pas
    // (modération plus longue), recoverMissingListingUrls re-cherchera aux
    // cycles de poll suivants.
    await sleep(randInt(8000, 15000));
    const loaded = waitForTabComplete(tabId);
    await neutralizeBeforeUnload(tabId);
    await chrome.tabs.update(tabId, { url: myListingsUrl + WORK_TAB_FRAGMENT });
    await loaded;
    await sleep(randInt(1200, 2500)); // rendu de la liste

    // requireTitle : page de LISTE — jamais de repli « lien unique » ici (c'est
    // ce repli qui a collé l'URL du T-shirt Patagonia sur le job New Balance).
    const { url } = await findListingLinkInPage(tabId, pattern.source, title, { requireTitle: true });
    if (url) {
      console.log(`[background] captureListingUrl(${platform}) : URL trouvée dans Mes annonces — ${url}`);
      return url;
    }
    // Log volontairement NEUTRE (2026-07-13) : un listing_url pas encore
    // disponible n'est PAS une anomalie — le job est publié, l'annonce est
    // déposée, et la re-capture différée s'en charge. On ne crie plus au loup.
    console.log(
      `[background] captureListingUrl(${platform}) : annonce pas encore listée dans Mes annonces ` +
      "(indexation en cours) — listing_url différé, re-tentative aux prochains cycles de poll."
    );
    return null;
  } catch (e) {
    console.warn(`[background] captureFromMyListings(${platform}) :`, String(e?.message ?? e));
    return null;
  } finally {
    // Rendre l'onglet de travail à sa page d'origine (page de confirmation) :
    // le job suivant le renaviguera de toute façon, mais on ne le laisse pas
    // planté sur la liste des annonces du vendeur.
    if (backTo) {
      const back = waitForTabComplete(tabId).catch(() => {});
      await neutralizeBeforeUnload(tabId);
      await chrome.tabs.update(tabId, { url: backTo }).catch(() => {});
      await back;
    }
  }
}

// ── A2 : détection de vente sur les annonces published ─────────────────────────
// Détecteurs HTML portés TELS QUELS de check-listing-status v4 (qui ne les
// exécutera plus jamais : v5 = orchestrateur DB pur). Différence : le fetch
// part du navigateur du vendeur — cookies de session, IP résidentielle et
// User-Agent réels (le SW ne peut pas forger l'UA, tant mieux).
// Cadence : au plus SALE_CHECK_MAX_PER_CYCLE annonces par cycle de poll
// (30 min), chacune au plus toutes les SALE_CHECK_MIN_INTERVAL_MS, avec une
// pause jitter entre deux fetches — un humain qui re-regarde ses annonces,
// pas une rafale.
const SALE_CHECK_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 h entre deux vérifs
const SALE_CHECK_MAX_PER_CYCLE = 8;
// Lectures indéterminées consécutives au-delà desquelles on cesse d'insister :
// le job est marqué non vérifiable (message explicite en base) et n'est plus
// retenté qu'une fois par jour. Aucune conclusion n'est jamais inventée.
const MAX_UNKNOWN_CHECKS = 4;
const UNKNOWN_RETRY_MS = 24 * 60 * 60 * 1000;

// ── Délai de grâce après publication (2026-07-12) ─────────────────────────────
// SALE_CHECK_MIN_INTERVAL_MS n'espaçait que deux vérifications SUCCESSIVES : une
// annonce fraîchement publiée (last_checked_at null) partait en tête de file et
// était vérifiée IMMÉDIATEMENT. Or une annonce n'est pas encore consultable
// publiquement dans les minutes qui suivent son dépôt — elle serait lue comme
// "unavailable" et un bandeau « Vendue ? » s'afficherait sur une annonce qui
// vient d'être mise en ligne.
// ⚠️ UNIFORME SUR LES 4 PLATEFORMES depuis le 2026-07-13 (décision Nico — a
// remplacé les fenêtres par plateforme beebs 24 h · leboncoin 6 h · ebay 2 h ·
// vinted 2 h, calées sur des observations ponctuelles, ET les 20 min « TEMP
// TEST » du 2026-07-12). Réduit 4 h → 2 h le 2026-07-19 (décision Nico,
// launch) : 2 h couvrent toujours la modération/propagation CDN observées, et
// une vraie vente devient détectable deux fois plus tôt. La garde reste doublée
// par SALE_CHECK_MIN_INTERVAL_MS (2 h entre deux lectures d'une même annonce)
// et par la règle « unknown ne conclut jamais rien ».
const PUBLISH_GRACE_MS = {
  beebs: 2 * 60 * 60 * 1000,
  leboncoin: 2 * 60 * 60 * 1000,
  ebay: 2 * 60 * 60 * 1000,
  vinted: 2 * 60 * 60 * 1000,
};
const PUBLISH_GRACE_DEFAULT_MS = 2 * 60 * 60 * 1000;

// ── Détection d'état d'une annonce — RÉÉCRITE le 2026-07-12 ───────────────────
// Les détecteurs précédents (portés d'un scraping serveur qui n'a JAMAIS tourné
// avec succès) étaient FAUX DANS LES DEUX SENS. Vérifié sur du vrai HTML :
//   · une annonce Vinted RÉELLEMENT VENDUE ne déclenchait AUCUN motif → "active"
//     (les motifs cherchaient "can_buy":false alors que le HTML porte du JSON
//     ÉCHAPPÉ : \"can_buy\":false — ils ne pouvaient matcher NULLE PART) ;
//   · une annonce SUPPRIMÉE (404/410) était déclarée "sold" par une guillotine
//     en amont → toute annonce retirée à la main fabriquait une VENTE FANTÔME
//     (ligne dans ventes, inventaire passé en vendu, frères annulés, email).
//
// TROIS ÉTATS désormais, et une règle absolue : UNE DISPARITION N'EST JAMAIS
// UNE VENTE. Le doute ne s'écrit pas en base, il se demande à l'utilisateur.
//   "active"      → toujours en ligne, rien à faire
//   "sold"        → PREUVE POSITIVE de vente → orchestration automatique
//   "unavailable" → plus en ligne, cause inconnue (supprimée, masquée,
//                   expirée, vendue sans trace…) → AUCUNE écriture comptable,
//                   drapeau + bandeau de confirmation dans l'app
//   "unknown"     → on n'a rien pu conclure (bot-shield, champs absents) →
//                   on ne touche à rien, on réessaiera
//
// ⚠️ can_buy vaut false AUSSI sur ses PROPRES annonces actives (on n'achète pas
// chez soi) : ce champ ne doit JAMAIS servir de signal de vente.

// Toutes les positions de l'id de NOTRE annonce dans la page (jamais au milieu
// d'un nombre plus long). Zéro position = la page ne parle pas de notre
// annonce : aucune lecture de champ ne doit aboutir.
function adAnchors(html, adId) {
  if (!adId) return [];
  const re = new RegExp("(?<![0-9])" + adId + "(?![0-9])", "g");
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m.index);
  return out;
}

// Parmi toutes les occurrences d'un motif GLOBAL, celle la plus proche d'une
// ancre (= d'une occurrence de l'id de notre annonce). Les items recommandés
// portent leurs champs près de LEURS ids — pas du nôtre.
function nearestMatch(html, globalRe, anchors) {
  let best = null;
  let bestDist = Infinity;
  let m;
  while ((m = globalRe.exec(html))) {
    let d = Infinity;
    for (const a of anchors) d = Math.min(d, Math.abs(a - m.index));
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

// Lecture d'un champ JSON SCOPÉE À L'ANNONCE (durcie 2026-07-13). L'ancien
// jsonField prenait la PREMIÈRE occurrence de la clé dans TOUT le HTML : ça ne
// tenait que parce que l'objet de l'item courant précède les recommandations
// dans le JSON — de la chance, pas une garantie (cf. le libellé i18n LBC et le
// "sold":"Vendu" Beebs, deux pièges du même moule). On choisit désormais
// l'occurrence la plus proche d'une occurrence de l'id de l'annonce, et on ne
// rend RIEN si l'id est absent de la page.
// Les pages embarquent leur JSON dans du HTML : les guillemets y sont échappés
// (\"champ\":valeur). On accepte les deux formes — c'est précisément ce qui
// manquait et qui rendait tous les anciens motifs inopérants.
function jsonFieldForAd(html, key, adId) {
  const anchors = adAnchors(html, adId);
  if (!anchors.length) return null;
  const re = new RegExp('\\\\?"' + key + '\\\\?":\\s*(\\\\?"[^"\\\\]*\\\\?"|true|false|null|\\d+)', "g");
  const m = nearestMatch(html, re, anchors);
  if (!m) return null;
  return m[1].replace(/\\/g, "").replace(/^"|"$/g, "");
}

// VINTED — signal VÉRIFIÉ en session réelle (annonce vendue 8758429057 vs
// annonce active 9350977566) :
//   vendue : \"is_closed\":true,  \"item_closing_action\":\"sold\"
//   active : \"is_closed\":false, \"item_closing_action\":null
// (is_reserved et is_hidden sont des booléens SÉPARÉS : masqué/réservé ≠ vendu)
function detectVintedState(html, finalUrl, adId) {
  if (/\/not-found|\/404/.test(finalUrl)) return "unavailable";
  const closed = jsonFieldForAd(html, "is_closed", adId);
  if (closed === null) return "unknown"; // page inattendue ou id absent : ne rien conclure
  if (closed !== "true") return "active";
  return jsonFieldForAd(html, "item_closing_action", adId) === "sold" ? "sold" : "unavailable";
}

// Prix affiché sur la page de l'annonce — plus à jour que job.price si le
// vendeur a changé son prix depuis la publication.
// ⚠️ VÉRIFIÉ sur une annonce réellement vendue : Vinted n'expose AUCUN prix de
// TRANSACTION distinct du prix demandé. Champs présents :
//     \"price\":{\"amount\":\"24.5\"}       → prix demandé
//     \"originalAskingAmount\":\"24.5\"     → idem
//     \"totalAmount\":\"26.43\"             → ce que paie l'ACHETEUR (frais de
//                                            protection inclus) — SURTOUT PAS la
//                                            recette du vendeur, à ne jamais
//                                            utiliser comme prix de vente
//     \"offerValue\":$undefined            → une offre acceptée n'est PAS exposée
// Donc : une vente négociée sera enregistrée au prix demandé. L'utilisateur
// corrige dans l'app (le prix de vente y est éditable). C'est la meilleure
// donnée publiquement disponible, et on ne devine pas le reste.
function vintedListedPrice(html, adId) {
  const anchors = adAnchors(html, adId);
  if (!anchors.length) return null;
  const m = nearestMatch(html, /\\?"price\\?":\s*\{\s*\\?"amount\\?":\s*\\?"([\d.]+)\\?"/g, anchors);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Identifiant numérique de l'annonce, extrait de listing_url. C'est LUI qui
// scope les lectures de page à NOTRE annonce — jamais « la première chaîne qui
// matche quelque part dans le document ».
function extractListingId(url, platform) {
  const patterns = {
    vinted: /\/items\/(\d+)/,
    leboncoin: /\/ad\/[^/]+\/(\d+)/,
    ebay: /\/itm\/[^?#]*?(\d{9,})/,
    // ⚠️ Format d'URL produit Beebs toujours NON OBSERVÉ : on suppose un long
    // nombre dans le chemin. À confirmer dès la première URL réelle capturée.
    beebs: /(\d{6,})/,
  };
  const m = String(url ?? "").match(patterns[platform] ?? /(\d{6,})/);
  return m ? m[1] : null;
}

// LEBONCOIN — RÉÉCRIT le 2026-07-13 après un FAUX POSITIF SYSTÉMATIQUE prouvé
// en réel (job 1a3893ae, annonce 3232382692 EN LIGNE, HTTP 200, titre présent) :
// l'ancienne détection html.includes("a été supprimée") matchait un LIBELLÉ de
// traduction i18n embarqué dans le JSON Next.js de TOUTES les pages d'annonces,
// actives comprises — "components/quickreply" →
//     "notified-seller-410":{"text":"Cette annonce a été supprimée."}
// Chaque annonce LBC active était donc marquée "unavailable" à chaque cycle.
// C'est le piège exact du "sold":"Vendu" de Beebs (documenté plus bas)… répété
// sur l'autre plateforme.
//
// Désormais : PREUVE POSITIVE dans les DEUX sens, scopée (2026-07-19, relevé
// réel en session navigateur — fetch same-origin depuis un onglet leboncoin.fr,
// même chemin que fetchListingHtml — sur 3 annonces disparues (2098765432
// ancienne supprimée, 9999999999 jamais existé, 2345678901 autre catégorie) et
// 1 active (3235576759, casquette Volcom) :
//   · MORTE  : HTTP 410 + <title>Annonce introuvable</title> +
//              <h1>Cette annonce est désactivée</h1> + AUCUN JSON d'annonce
//              (ni list_id, ni subject) — mêmes marqueurs pour supprimée,
//              expirée et jamais-existé ;
//   · ACTIVE : HTTP 200 + \"list_id\":<id> présent (+ ad_status \"active\").
//   ⚠️ le <link rel=canonical> de la page MORTE écho l'URL DEMANDÉE : l'ancienne
//   « preuve » canonique déclarait ACTIVE une annonce disparue qui serait servie
//   en 200 (soft-404) — retirée, c'était un faux-actif prouvé.
//   ⚠️ les chaînes i18n « a été supprimée » / « n'est plus disponible » vivent
//   dans le bundle JSON de TOUTES les pages, actives comprises (piège 2026-07-13
//   re-confirmé au relevé) : on ne lit JAMAIS le texte du document — uniquement
//   des balises UNIQUES par nature (<title>, <h1>), hors bundle.
//   · id trouvé dans le JSON de la page ("list_id")               → active
//   · HTTP 404/410 (géré en amont dans checkListingState)         → unavailable
//   · HTTP 200 mais <title>/<h1> de la page morte                 → unavailable
//   · HTTP 200, ni id ni marqueur de page morte                   → unknown
// Rappel inchangé : LBC n'expose AUCUN statut « vendu » public — une annonce
// vendue est simplement RETIRÉE, réponse identique à une suppression manuelle
// (410 + mêmes marqueurs). D'où "unavailable" (bandeau « Plus en ligne —
// vendue ? », l'utilisateur tranche) et jamais "sold" : la preuve de vente ne
// peut venir que de la page vendeur (mes-transactions).
function detectLeboncoinState(html, adId) {
  if (!adId) return "unknown";
  // \"list_id\":3232382692 — JSON échappé ou non, valeur quotée ou non
  const idField = new RegExp('\\\\?"(?:list_id|listId)\\\\?":\\s*\\\\?"?' + adId + '(?![0-9])');
  if (idField.test(html)) return "active";
  // Preuve positive de DISPARITION — le filet pour une page morte servie en
  // HTTP 200 (le 410 nominal est déjà tranché en amont). Balises uniques
  // relevées en réel, jamais le texte brut du document.
  const title = (html.match(/<title[^>]*>\s*([^<]{0,200})/i) || [])[1] ?? "";
  const h1 = (html.match(/<h1[^>]*>\s*([^<]{0,200})/i) || [])[1] ?? "";
  if (/annonce\s+introuvable/i.test(title) || /annonce\s+est\s+d[ée]sactiv[ée]e/i.test(h1)) {
    return "unavailable";
  }
  return "unknown";
}

// EBAY — relevé réel sur notre annonce TERMINÉE SANS VENTE (800328233923) :
//   "listingStatus":"ENDED"  (EN MAJUSCULES — l'ancien code cherchait "Ended")
// ⚠️ La page contient les mots « Vendu » et un prix de vente… qui appartiennent
// aux annonces RECOMMANDÉES en bas de page : toute détection par texte brut est
// un faux positif garanti. On ne lit que le champ JSON.
// La valeur d'une annonce réellement VENDUE n'a PAS pu être observée (aucune
// vente eBay sur le compte) : tant qu'on ne l'a pas relevée, eBay ne conclut
// JAMAIS "sold" tout seul → "unavailable" → bandeau.
function detectEbayState(html, finalUrl, adId) {
  if (!/\/itm\//.test(finalUrl)) return "unavailable";
  const st = (jsonFieldForAd(html, "listingStatus", adId) || "").toUpperCase();
  if (!st) return "unknown";
  if (st === "ACTIVE") return "active";
  return "unavailable"; // ENDED, COMPLETED… : terminée ≠ vendue (à confirmer)
}

// BEEBS — relevé réel : active → \"status\":\"AVAILABLE\" ; supprimée → 404.
// ⚠️ La chaîne \"sold\":\"Vendu\" est un LIBELLÉ de traduction présent sur TOUTES
// les pages (y compris actives) : piège de l'ancien motif "sold":true.
// Valeur du champ status pour une vente réelle : NON OBSERVÉE → jamais "sold".
// ⚠️ "status" est la clé la plus générique des quatre : l'ancrage sur l'id est
// ici VITAL. Tant que le format d'URL produit Beebs n'est pas observé (donc
// tant qu'extractListingId n'a pas d'id fiable), ce détecteur rendra "unknown"
// — c'est voulu : mieux vaut aucun verdict qu'un verdict lu sur le mauvais objet.
function detectBeebsState(html, adId) {
  const st = (jsonFieldForAd(html, "status", adId) || "").toUpperCase();
  if (!st) return "unknown";
  return st === "AVAILABLE" ? "active" : "unavailable";
}

// Retourne { state, price } — price = prix lu SUR LA PAGE (null si inconnu),
// utilisé comme prix de vente à l'auto-confirmation quand il est disponible.
// ⚠️ LE FETCH DOIT PARTIR D'UN VRAI ONGLET, PAS DU SERVICE WORKER (2026-07-13).
// PREUVE (job 9051246f, bloqué en « unknown » cycle après cycle) : leboncoin.fr
// répond HTTP 403 + page captcha DataDome à toute requête qui ne vient pas d'un
// navigateur réel — mesuré sur l'URL de l'annonce, avec ET sans User-Agent
// Chrome. Or checkListingState faisait `if (!res.ok) return "unknown"` : le job
// ne pouvait JAMAIS conclure, et repartait à chaque cycle. Une boucle infinie,
// par construction, pas un accident.
// Un fetch émis depuis le service worker n'a ni l'empreinte TLS, ni les en-têtes
// Sec-Fetch-*, ni le contexte de page d'un vrai navigateur — DataDome le voit
// immédiatement. Depuis un ONGLET ouvert sur le domaine, la même requête est une
// requête same-origin ordinaire, avec les cookies (dont le cookie datadome de
// l'utilisateur) et l'empreinte du navigateur : elle passe.
// On lit donc la page DEPUIS l'onglet de travail de la plateforme (celui-là même
// qui publie et supprime), et on ne retombe sur le fetch du service worker que
// si aucun onglet n'est disponible.
async function fetchListingHtml(url, platform) {
  const tabId = await workTabForFetch(platform).catch(() => null);
  if (tabId != null) {
    try {
      const inject = chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [url],
        func: async (cible) => {
          try {
            const r = await fetch(cible, { credentials: "include", redirect: "follow" });
            const txt = await r.text();
            return { ok: r.ok, status: r.status, finalUrl: r.url, html: txt.slice(0, 3_000_000) };
          } catch (e) {
            return { erreur: String(e?.message ?? e) };
          }
        },
      });
      // ⚠️ ÉTAT « BLOQUÉ » DISTINCT (2026-07-18) : si un dialogue beforeunload
      // natif est resté ouvert sur l'onglet de travail, le renderer est figé et
      // cet executeScript ne reviendrait JAMAIS — le job de vérification partait
      // alors en boucle d'« indéterminé » puis « non vérifiable 24 h », un
      // verdict TROMPEUR (l'annonce n'a rien d'illisible, c'est l'onglet qui est
      // bloqué). On borne l'attente et on NOMME la cause au lieu de la confondre
      // avec un bot-shield. Les neutralisations en amont doivent empêcher que ça
      // arrive ; ce garde est le filet.
      let timer;
      const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("BLOCKED_TAB")), 20_000); });
      let res;
      try { [res] = await Promise.race([inject, guard]); } finally { clearTimeout(timer); }
      const r = res?.result;
      if (r && !r.erreur) return r;
      console.warn(`[background] lecture via onglet (${platform}) : ${r?.erreur ?? "sans résultat"} — repli service worker`);
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg.includes("BLOCKED_TAB")) {
        console.warn(
          `[background] lecture via onglet (${platform}) : onglet de travail FIGÉ (dialogue beforeunload natif ` +
          "resté ouvert ?) — état BLOQUÉ, distinct d'une page illisible. À débloquer à la main. Repli service worker."
        );
      } else {
        console.warn(`[background] lecture via onglet (${platform}) impossible :`, msg);
      }
    }
  }
  // Repli : historique, et bloqué par DataDome sur Leboncoin (403). Conservé
  // pour les plateformes qui l'acceptent, jamais comme voie principale.
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  const html = res.ok ? await res.text() : "";
  return { ok: res.ok, status: res.status, finalUrl: res.url, html };
}

// Onglet utilisable pour lire une page de la plateforme : le nôtre s'il est déjà
// sur le bon domaine (cas normal — il y publie), sinon on en ouvre un dans la
// FENÊTRE DE TRAVAIL DÉDIÉE (invisible, jamais de focus volé).
async function workTabForFetch(platform) {
  const host = PLATFORM_HOSTS[platform];
  if (!host) return null;

  const store = await chrome.storage.session.get(workTabKey(platform));
  const known = store[workTabKey(platform)];
  if (known != null) {
    const tab = await chrome.tabs.get(known).catch(() => null);
    // eBay navigue de lui-même entre .fr et .com (Hub vendeur, redirections
    // login) : un onglet sur ebay.com est tout aussi exploitable qu'un .fr —
    // sans ça, chaque vérification renaviguait l'onglet vers la home (2026-07-23).
    const hosts = platform === "ebay" ? [host, "ebay.com"] : [host];
    const hn = new URL(tab?.url || "https://x.invalid").hostname;
    if (tab && hosts.some((h) => hn === h || hn.endsWith(`.${h}`))) return tab.id;
  }
  // Pas d'onglet exploitable : on en ouvre un sur la HOME de la plateforme (page
  // anodine, aucun formulaire touché), qui servira aussi aux vérifications
  // suivantes.
  return getOrCreateWorkTab(platform, `https://www.${host}/`);
}

const PLATFORM_HOSTS = {
  leboncoin: "leboncoin.fr",
  vinted: "vinted.fr",
  ebay: "ebay.fr",
  beebs: "beebs.app",
};

// Page de vérification anti-bot (DataDome & co) : courte, sans le contenu de
// l'annonce, et porteuse de ses marqueurs. Motifs relevés en réel sur la réponse
// 403 de leboncoin.fr (2026-07-13) : « datadome », « geo.captcha ».
function estPageBotShield(html) {
  const debut = String(html ?? "").slice(0, 4000);
  return /datadome|geo\.captcha|captcha-delivery|\bAre you a human\b|Vérification que vous n/i.test(debut);
}

// ── Leboncoin : la MORT D'UNE ANNONCE EST DÉFINITIVE (2026-07-21) ────────────
// Relevé réel sur l'annonce 3236601202 (job a1e4cf68, supprimée le matin même,
// compte vendeur à « En ligne (0) ») : 5 lectures d'affilée de la MÊME URL, à
// quelques secondes d'intervalle, ont rendu 200, 410, 200, 410, 200.
//   · 410 → <title>Annonce introuvable</title> + <h1>Cette annonce est
//     désactivée</h1> (441 780 o) — l'état RÉEL ;
//   · 200 → la page COMPLÈTE de l'annonce (556 177 o) avec
//     "ad":{"list_id":3236601202,…,"status":"active"} — une copie PÉRIMÉE,
//     servie par l'origine (x-cache: Miss from cloudfront, donc pas un cache
//     navigateur : cache:"no-store" la renvoie aussi), STRICTEMENT
//     indiscernable d'une annonce vivante.
// Conséquence : une lecture unique tombait une fois sur deux sur la copie
// périmée et déclarait « active » une annonce supprimée — d'où le job delete
// qui brûlait ses 2 ré-armements sur un faux « TOUJOURS en ligne », et le scan
// de vente qui laissait des annonces mortes en 'published'.
//
// Une suppression Leboncoin est IRRÉVERSIBLE : une annonce ne redevient jamais
// vivante sous la même URL. Un seul 404/410 observé vaut donc preuve
// définitive, et prime sur n'importe quel nombre de 200. On l'applique dans les
// deux sens du temps :
//   · dans le check courant : plusieurs tirs, le premier « morte » l'emporte ;
//   · entre les checks : l'URL morte est MÉMORISÉE, et toute lecture ultérieure
//     conclut « unavailable » sans même interroger la plateforme.
const LBC_DEAD_KEY = "lbc_urls_mortes";
const LBC_CHECK_TIRS = 3;
// Purge : au-delà, l'entrée n'a plus d'utilité (le job est tranché depuis
// longtemps) et on évite que le stockage enfle indéfiniment.
const LBC_DEAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function lbcUrlsMortes() {
  try {
    const store = await chrome.storage.local.get(LBC_DEAD_KEY);
    return store[LBC_DEAD_KEY] ?? {};
  } catch {
    return {};
  }
}

async function lbcUrlDejaMorte(url) {
  const connues = await lbcUrlsMortes();
  const vu = connues[String(url)];
  return Number.isFinite(vu) && Date.now() - vu < LBC_DEAD_TTL_MS;
}

async function memoriserLbcMorte(url) {
  try {
    const connues = await lbcUrlsMortes();
    const maintenant = Date.now();
    for (const [u, t] of Object.entries(connues)) {
      if (!Number.isFinite(t) || maintenant - t >= LBC_DEAD_TTL_MS) delete connues[u];
    }
    connues[String(url)] = maintenant;
    await chrome.storage.local.set({ [LBC_DEAD_KEY]: connues });
  } catch (e) {
    // Mémoire de confort : son échec ne doit jamais faire échouer un check.
    console.warn("[background] mémorisation URL morte (non bloquant) :", String(e?.message ?? e));
  }
}

// Retourne { state, price } — price = prix lu SUR LA PAGE (null si inconnu).
// Leboncoin : plusieurs tirs, et « morte » l'emporte (cf. bloc ci-dessus). Les
// autres plateformes n'ont jamais montré ce va-et-vient — lecture unique,
// comportement inchangé.
async function checkListingState(url, platform) {
  if (platform !== "leboncoin") return lireEtatAnnonce(url, platform);

  if (await lbcUrlDejaMorte(url)) {
    console.log(`[background] leboncoin : ${url} déjà observée MORTE (410/404) — état définitif "unavailable", aucune relecture`);
    return { state: "unavailable", price: null };
  }

  let vuActive = false;
  for (let tir = 1; tir <= LBC_CHECK_TIRS; tir++) {
    if (tir > 1) await sleep(randInt(700, 1600));
    const res = await lireEtatAnnonce(url, platform);
    if (res.state === "unavailable" || res.state === "sold") {
      console.log(`[background] leboncoin : annonce MORTE constatée au tir ${tir}/${LBC_CHECK_TIRS} — verdict définitif (mémorisé)`);
      await memoriserLbcMorte(url);
      return res;
    }
    if (res.state === "active") vuActive = true;
    console.log(`[background] leboncoin : tir ${tir}/${LBC_CHECK_TIRS} → ${res.state}`);
  }

  // Aucun 410/404 en LBC_CHECK_TIRS lectures. Un "active" vient d'une preuve
  // POSITIVE (list_id présent) : on le retient. Si aucun tir n'a rien pu lire,
  // ça reste "unknown" — surtout pas "active" par défaut.
  return { state: vuActive ? "active" : "unknown", price: null };
}

// Une lecture, une conclusion (l'ancien checkListingState, inchangé).
async function lireEtatAnnonce(url, platform) {
  try {
    const res = await fetchListingHtml(url, platform);
    // 404/410 : l'annonce n'est plus là. Ce n'est PAS une vente — c'était la
    // guillotine qui fabriquait les ventes fantômes.
    if (res.status === 404 || res.status === 410) return { state: "unavailable", price: null };
    if (!res.ok) {
      console.warn(`[background] ${platform} : HTTP ${res.status} sur la page de l'annonce (bot-shield ?) — aucune conclusion`);
      return { state: "unknown", price: null };
    }
    const { html, finalUrl } = res;
    // ⚠️ Une page de bot-shield peut arriver en HTTP 200 (DataDome sert parfois
    // son captcha avec un statut normal). Les détecteurs à preuve positive
    // rendraient "unknown" dessus (l'id n'y figure pas), mais on garde ce garde
    // explicite : le log nomme la cause réelle (anti-bot) au lieu d'un
    // "unknown" muet, et aucun détecteur futur ne pourra conclure sur une page
    // qu'on n'a pas vraiment reçue.
    if (estPageBotShield(html)) {
      console.warn(`[background] ${platform} : page de vérification anti-bot reçue (HTTP ${res.status}) — aucune conclusion`);
      return { state: "unknown", price: null };
    }
    // L'id vient de listing_url (la source de vérité), pas de finalUrl : une
    // redirection ne doit jamais changer QUELLE annonce on cherche dans la page.
    const adId = extractListingId(url, platform);
    switch (platform) {
      case "leboncoin": return { state: detectLeboncoinState(html, adId), price: null };
      case "vinted":    return { state: detectVintedState(html, finalUrl, adId), price: vintedListedPrice(html, adId) };
      case "ebay":      return { state: detectEbayState(html, finalUrl, adId), price: null };
      case "beebs":     return { state: detectBeebsState(html, adId), price: null };
      default:          return { state: "unknown", price: null };
    }
  } catch (e) {
    console.warn(`[background] checkListingState(${url}):`, String(e?.message ?? e));
    return { state: "unknown", price: null };
  }
}

// PostgREST direct (RLS user via JWT) : lecture des published à vérifier et
// tampon last_checked_at — pas de nouvelle edge function pour si peu.
// ── Sondes de session plateformes (chantier onboarding, 2026-07-27) ──────────
// Écrit profiles.extension_sessions pour que l'app affiche connecté / non
// connecté AVANT publication (cas pstephanie1005 : 4 échecs « connexion
// requise » incompréhensibles). Signaux :
//   - Vinted : /api/v2/users/current — 200 connecté, TOUT LE RESTE
//     indéterminé (2026-07-30 : le 401 est AMBIGU depuis un service worker,
//     cf. commentaire de la sonde ; false ne vient plus que de
//     noterSessionDeconnectee).
//   - Leboncoin / eBay : la page de dépôt redirige vers l'auth quand le compte
//     est déconnecté (auth.leboncoin.fr / signin.ebay.fr — exactement le test
//     d'entrée de leur fillListingForm).
//   - Beebs : SPA — seule une redirection login OBSERVÉE prouve la
//     déconnexion ; un 200 sur /fr/listing ne prouve rien (redirection
//     client) → null (indéterminé), jamais un faux « connecté ».
// Tri-état true/false/null par plateforme. Fire-and-forget : une sonde qui
// échoue ne bloque JAMAIS le traitement des jobs.
let lastSessionProbeAt = 0;
const SESSION_PROBE_INTERVAL_MS = 10 * 60 * 1000;

function decodeJwtSub(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64))?.sub ?? null;
  } catch { return null; }
}

// ── Sonde de session eBay — SOURCE UNIQUE (2026-08-11) ──────────────────────
// Extraite de probePlatformSessions pour être appelable HORS du relevé
// périodique : c'est elle qui arbitre désormais la garde de publication
// (arbitrerSessionEbay). Une seule définition, sinon les deux détections
// re-divergent — c'est exactement le bug qu'on corrige.
// Ce qu'elle prouve : une requête HTTP réelle, avec les cookies de
// l'utilisateur, sur la PAGE D'ENTRÉE DE VENTE, redirections suivies.
//   · atterrissage sur signin.ebay.* → false (déconnecté, signal sûr) ;
//   · atterrissage sur ebay.fr ...... → true  (session valide côté vente) ;
//   · tout le reste / réseau KO ..... → null  (indéterminé, jamais un faux
//     « connecté » ni un faux « déconnecté »).
async function sonderSessionEbay() {
  const r = await fetch("https://www.ebay.fr/sl/prelist/suggest", {
    credentials: "include", redirect: "follow",
  });
  const u = new URL(r.url);
  if (/(^|\.)signin\.ebay\./.test(u.hostname)) return { etat: false, http: r.status };
  return { etat: /(^|\.)ebay\.fr$/.test(u.hostname) ? true : null, http: r.status };
}

// Le SEUL endroit où ce libellé s'écrit — c'est lui que teste le déclencheur de
// noterSessionDeconnectee, il ne doit jamais partir sans arbitrage.
const MSG_CONNEXION_EBAY =
  "Connexion eBay requise : se connecter sur ebay.fr dans Chrome " +
  "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.";

// ── Arbitrage de la garde de session eBay (2026-08-11) ──────────────────────
// ebay.js ne rend plus qu'un SOUPÇON (sessionSuspecte + signal + url) ; le
// verdict se prend ici, avec la sonde HTTP — la seule des deux détections qui
// ait dit vrai le 11/08. Trois issues, jamais deux :
//   · sonde false → le soupçon est CONFIRMÉ : message historique, et lui seul
//     autorise noterSessionDeconnectee à écrire ebay:false ;
//   · sonde true  → CONTRADICTION : on ne dit pas à quelqu'un de se connecter
//     alors qu'il l'est (c'est ce qui a envoyé Romain chercher un problème de
//     compte inexistant). On dit ce qu'on a VU, et on ré-arme ;
//   · sonde null  → indéterminé : ni accusation, ni écriture de session.
// Dans les TROIS cas, le diagnostic part en base : les 6 échecs de ce message
// depuis le 27/07 sont muets, c'est ce qui a rendu la cause introuvable.
async function arbitrerSessionEbay(result) {
  let sonde = { etat: null, http: null };
  try { sonde = await sonderSessionEbay(); }
  catch (e) { console.warn("[background] sonde de session eBay injoignable —", String(e?.message ?? e)); }

  const url = String(result.sessionUrl ?? "");
  let chemin = url;
  try { chemin = new URL(url).pathname; } catch { /* URL illisible : on garde le brut */ }

  const diagnostic = {
    quoi: "garde_session_ebay",
    url: url.slice(0, 300),
    signal: result.sessionSignal ?? null,
    sonde: sonde.etat,
    http: sonde.http,
    at: new Date().toISOString(),
  };
  console.warn(
    `[background] garde de session eBay : signal=${diagnostic.signal} page=${chemin} ` +
    `→ sonde=${String(sonde.etat)} (HTTP ${String(sonde.http)})`
  );

  if (sonde.etat === false) {
    return { ...result, sessionConfirmee: true, diagnostic, error: MSG_CONNEXION_EBAY };
  }
  if (sonde.etat === true) {
    return {
      ...result, sessionConfirmee: false, diagnostic,
      error:
        `eBay a servi une page inattendue (${chemin}) alors que ta session eBay est valide — ` +
        "rien n'a été publié. Le job repartira automatiquement au prochain passage.",
    };
  }
  return {
    ...result, sessionConfirmee: false, diagnostic,
    error:
      `eBay n'a pas ouvert le formulaire de mise en vente (${chemin}) et l'état de la ` +
      "session n'a pas pu être vérifié. Le job repartira automatiquement au prochain passage.",
  };
}

async function probePlatformSessions() {
  const probe = async (fn) => { try { return await fn(); } catch { return { etat: null, http: null }; } };
  const [vinted, leboncoin, ebay, beebs] = await Promise.all([
    probe(async () => {
      const r = await fetch("https://www.vinted.fr/api/v2/users/current", {
        headers: { Accept: "application/json" }, credentials: "include",
      });
      // ⚠️ 401 ≠ déconnecté (faux « non connecté » du 30/07 21:13, prouvé en
      // base : bandeau rouge puis dépôt réussi, sonde true 50 s après) : un
      // cookie access_token_web PÉRIMÉ rend 401 alors que refresh_token_web
      // est valide — c'est la PAGE Vinted qui rafraîchit le token à son
      // chargement, jamais un fetch de service worker. Le 401 est donc
      // INDÉTERMINÉ (null, pas de bandeau) ; false ne vient plus que du
      // signal sûr noterSessionDeconnectee (garde d'entrée du handler,
      // après navigation réelle de l'onglet de travail). On perd un peu de
      // détection de vraie déconnexion, on supprime tous les faux positifs.
      return { etat: r.ok ? true : null, http: r.status };
    }),
    probe(async () => {
      const r = await fetch("https://www.leboncoin.fr/deposer-une-annonce", {
        credentials: "include", redirect: "follow",
      });
      const u = new URL(r.url);
      if (/(^|\.)auth\.leboncoin\.fr$/.test(u.hostname) || u.pathname.startsWith("/connexion")) return { etat: false, http: r.status };
      return { etat: u.pathname.startsWith("/deposer-une-annonce") ? true : null, http: r.status };
    }),
    probe(sonderSessionEbay),
    probe(async () => {
      const r = await fetch("https://www.beebs.app/fr/listing", {
        credentials: "include", redirect: "follow",
      });
      const u = new URL(r.url);
      // /auth ajouté le 2026-08-06 : la vraie page de connexion Beebs est
      // /fr/auth?step=sign-in (relevé prod) — les trois libellés historiques
      // ne matchaient aucune URL réelle. En pratique la SPA sert un 200 sur
      // /fr/listing et redirige CÔTÉ CLIENT : ce fetch ne verra donc
      // quasiment jamais false (null = indéterminé, par conception).
      return { etat: /\/(login|signin|connexion)|\/auth(\/|$)/i.test(u.pathname) ? false : null, http: r.status };
    }),
  ]);
  return {
    checked_at: new Date().toISOString(),
    vinted: vinted.etat, leboncoin: leboncoin.etat, ebay: ebay.etat, beebs: beebs.etat,
    // Statut HTTP BRUT du relevé, par plateforme (traçabilité 2026-07-30) —
    // c'est lui qui dit si un null vient d'un 401 (token à rafraîchir), d'un
    // 403 (challenge) ou d'un échec réseau (null).
    http: { vinted: vinted.http, leboncoin: leboncoin.http, ebay: ebay.http, beebs: beebs.http },
  };
}

// Traçabilité (2026-07-30) : le relevé PRÉCÉDENT est conservé sous `previous`
// (débarrassé de son propre historique — un seul niveau, la colonne ne grossit
// pas). Le faux « non connecté » du 30/07 21:13 avait été ÉCRASÉ par la sonde
// suivante : il n'a pu être établi que par inférence. Désormais prouvable :
//   extension_sessions->'previous'->>'vinted', ->'http'->>'vinted'
function sessionsSansHistorique(s) {
  if (!s || typeof s !== "object") return null;
  const { previous, ...rest } = s;
  return rest;
}

async function ecrireExtensionSessions(accessToken, sub, releve, previous) {
  if (previous === undefined) {
    try {
      const rows = await restRequest(`profiles?id=eq.${sub}&select=extension_sessions`, accessToken);
      previous = sessionsSansHistorique(rows?.[0]?.extension_sessions);
    } catch { previous = null; } // l'historique est un confort, jamais bloquant
  }
  await restRequest(`profiles?id=eq.${sub}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ extension_sessions: { ...releve, ...(previous ? { previous } : {}) } }),
  });
}

async function reportPlatformSessions(accessToken) {
  if (Date.now() - lastSessionProbeAt < SESSION_PROBE_INTERVAL_MS) return;
  lastSessionProbeAt = Date.now();
  const sub = decodeJwtSub(accessToken);
  if (!sub) return;
  const sessions = await probePlatformSessions();
  await ecrireExtensionSessions(accessToken, sub, sessions);
  console.log("[background] sessions plateformes relevées :", JSON.stringify(sessions));
}

// Signal SÛR de déconnexion (2026-07-30) : la garde d'entrée d'un handler
// vient d'observer une redirection login / un formulaire d'auth APRÈS une
// navigation réelle de l'onglet de travail — contrairement au 401 de la
// sonde (ambigu), c'est une preuve. Répercuté immédiatement dans
// extension_sessions (hors throttle : l'événement est rare et précieux) pour
// que le bandeau de l'app dise vrai sans attendre le prochain cycle.
async function noterSessionDeconnectee(accessToken, platform) {
  const sub = decodeJwtSub(accessToken);
  if (!sub) return;
  let base = null;
  try {
    const rows = await restRequest(`profiles?id=eq.${sub}&select=extension_sessions`, accessToken);
    base = sessionsSansHistorique(rows?.[0]?.extension_sessions);
  } catch { /* base = null : on écrit quand même le signal sûr */ }
  const releve = {
    vinted: null, leboncoin: null, ebay: null, beebs: null,
    ...(base ?? {}),
    [platform]: false,
    checked_at: new Date().toISOString(),
    http: { ...(base?.http ?? {}), [platform]: "login_redirect_observee" },
  };
  await ecrireExtensionSessions(accessToken, sub, releve, base);
  console.log(`[background] session ${platform} : DÉCONNEXION observée par le handler — extension_sessions mis à jour`);
}

async function restRequest(path, accessToken, init = {}) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
      Prefer: "return=minimal",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${path} → HTTP ${res.status}`);
  // Un écrivain qui demande return=representation VEUT les lignes. Avant le
  // 03/08 au soir, tout non-GET rendait null quel que soit Prefer — deux
  // victimes silencieuses : la création du run de sync (« run_non_cree » au
  // premier clic, le 2e clic reprenait la ligne pourtant créée) et le
  // rattachement du dressing (rattaches toujours vide → 409 du run d10ab149).
  const prefer = String(init.headers?.Prefer ?? "");
  if (init.method && init.method !== "GET" && !prefer.includes("return=representation")) return null;
  return res.status === 204 ? null : res.json();
}

// ── Sync du dressing Vinted (2026-08-03) ─────────────────────────────────────
// Objectif : remplir FillSell en une action avec les annonces qui appartiennent
// déjà à l'utilisateur, et commencer à mesurer ce qu'elles deviennent (vues,
// favoris, prix) — sans quoi tout ce qui suit (repérer ce qui stagne, proposer
// une action) resterait aveugle.
//
// Trois invariants, dans cet ordre d'importance :
//  1. ZÉRO DOUBLON. L'identité d'une annonce est (user_id, vinted_item_id) et
//     l'unicité est portée par la BASE (index inventaire_user_vinted_item_unique).
//     On écrit par upsert `?on_conflict=user_id,vinted_item_id` : même un bug
//     de cette fonction ne peut pas créer deux fois le même article.
//  2. PRIX D'ACHAT JAMAIS INVENTÉ. Un article importé arrive avec
//     prix_achat = NULL (pas 0) : Vinted ne connaît pas le prix d'achat, et un
//     0 produirait 100 % de marge sur toute la boutique.
//  3. RIEN N'EST SUPPRIMÉ. Un article vu puis absent est daté (disparu_le), pas
//     effacé : un incident réseau ne doit pas emporter d'historique.
//
// Rythme : séquentiel, une page à la fois, pauses variables. Le dressing bouge
// de quelques vues par jour — il n'y a rien à gagner à courir, et beaucoup à
// perdre face à DataDome.
const SYNC_PAUSE_MIN_MS = 4000;
const SYNC_PAUSE_MAX_MS = 9000;
const SYNC_MAX_PAGES = 40; // 40 × 96 = 3840 articles : garde-fou anti-boucle
// Écriture par tranches : la progression (items_vus, updated_at) bouge
// PENDANT la page, pas seulement entre deux pages — un dressing d'une seule
// page (96 max) n'affichait RIEN avant la fin. Les tranches n'écrivent que
// vers Supabase : aucun trafic Vinted supplémentaire, les pauses anti-bot
// (entre pages uniquement) ne bougent pas.
const SYNC_CHUNK = 8;
// Cadence des syncs MANUELLES (2026-08-03) : un run ne dure que ~7 s — sans
// borne, le bouton se relance en boucle et c'est le compte VINTED de
// l'utilisateur qui présente un profil de requêtes mécanique. 15 min : re-
// consulter son dressing au quart d'heure est un comportement humain normal,
// toutes les 7 s non ; cohérent avec les cadences du projet (sonde sessions
// 10 min, snapshots 1/jour, cron 24 h) ; et les vues/favoris bougent de
// quelques unités par JOUR — une fraîcheur plus fine n'apporte rien.
// Seul un run DONE arme la fenêtre : un échec (session expirée, bot-shield)
// doit pouvoir être retenté aussitôt corrigé. Le cron quotidien est exempt
// (declencheur='cron'). Miroir front : SYNC_CADENCE_MANUELLE_MS dans
// src/utils/vintedSync.js — même valeur, à faire évoluer ENSEMBLE.
const SYNC_MANUAL_COOLDOWN_MS = 15 * 60 * 1000;
// Cadence CRON : 20 h et non 24 h — cf. la garde dans syncDressingVinted.
const SYNC_CRON_COOLDOWN_MS = 20 * 60 * 60 * 1000;

// Journalise un refus de sync 'cron' SUR LE RUN QUI LE CAUSE — sans créer de
// ligne de run : une sync qui n'a pas eu lieu n'est pas un run, et en fabriquer
// une pour chaque refus polluerait l'historique de lignes vides (il peut y en
// avoir plusieurs par jour). C'est le dernier run 'done' qui « possède » la
// fenêtre de cadence, c'est donc lui qui la raconte.
// Le segment est REMPLACÉ à chaque refus, jamais empilé : un compteur et une
// date, longueur bornée. Préfixe « [note] » comme le reste du journal — ce
// n'est pas un échec de run (cf. la convention à la clôture 'done').
async function journaliserRefusCron(dernier, token) {
  if (!dernier?.id) return;
  const MARQUEUR = "cadence cron :";
  const segments = String(dernier.erreur ?? "")
    .split(" | ")
    .filter((s) => s.trim() && !s.includes(MARQUEUR));
  const precedent = String(dernier.erreur ?? "").split(" | ").find((s) => s.includes(MARQUEUR));
  const n = (Number(precedent?.match(/(\d+)\s+sync/)?.[1]) || 0) + 1;
  segments.push(
    `[note] ${MARQUEUR} ${n} sync 'cron' refusée(s) depuis ce run ` +
    `(fenêtre de 20 h), dernière le ${new Date().toISOString()}`
  );
  await restRequest(`vinted_sync_runs?id=eq.${dernier.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ erreur: segments.join(" | ").slice(0, 500) }),
  });
}
let syncDressingEnCours = false;

function syncPauseMs() {
  return SYNC_PAUSE_MIN_MS + Math.floor(Math.random() * (SYNC_PAUSE_MAX_MS - SYNC_PAUSE_MIN_MS));
}

// ── Harnais de pagination (2026-08-07) — UNPACKED SEULEMENT ──────────────────
// La boucle multi-pages (>96 articles), ses pauses 4-9 s et sa reprise n'ont
// JAMAIS tourné en réel : tous les runs prod sont monopages (37 articles max).
// Ce harnais substitue des pages FABRIQUÉES au seul point de contact Vinted de
// la sync (le message SYNC_DRESSING_PAGE) pour exercer TOUTE la mécanique —
// boucle, curseur page_suivante, écriture par tranches, gardes (a)/(b),
// marquage des disparitions — contre la VRAIE base Supabase. En mode mock,
// AUCUN octet ne part vers Vinted : ni onglet de travail, ni sonde de session,
// ni page wardrobe.
// DOUBLE VERROU, les deux obligatoires :
//   1. manifest SANS update_url = extension chargée en « Load unpacked ». Un
//      paquet CWS porte toujours un update_url → le harnais y est INERTE même
//      si la clé de storage traînait ;
//   2. clé posée À LA MAIN dans la console du service worker :
//        chrome.storage.local.set({ FILLSELL_SYNC_MOCK: { actif: true, total_articles: 289 } })
//      retrait : chrome.storage.local.remove("FILLSELL_SYNC_MOCK")
// ⚠️ COMPTE QA UNIQUEMENT : les articles fictifs s'écrivent POUR DE VRAI dans
// `inventaire` (ids en 9000000xxxxxx), et une sync complète marquerait
// `disparu_le` sur les vrais articles vinted_sync du compte connecté.
// Purge après test :
//   DELETE FROM inventaire WHERE user_id='<QA>' AND origine='vinted_sync'
//     AND vinted_item_id LIKE '9000000%';
const SYNC_MOCK_STORAGE_KEY = "FILLSELL_SYNC_MOCK";
async function lireSyncMockConfig() {
  if (chrome.runtime.getManifest().update_url) return null; // CWS : jamais
  try {
    const st = await chrome.storage.local.get(SYNC_MOCK_STORAGE_KEY);
    const cfg = st?.[SYNC_MOCK_STORAGE_KEY];
    if (cfg?.actif !== true) return null;
    const total = Number(cfg.total_articles);
    return { totalArticles: Number.isFinite(total) && total > 0 ? Math.floor(total) : 289 };
  } catch {
    return null;
  }
}

// Même contrat de retour que lirePageDressing (vinted.js) : c'est ce qui
// permet à la boucle de ne pas savoir qu'elle est mockée. per_page=96 comme le
// plafond serveur réel ; photos sur *.vinted.net pour rester du bon côté de la
// frontière de propriété des photos (estCdnVinted).
function pageDressingMock(mock, page) {
  const PER_PAGE = 96;
  const totalPages = Math.max(1, Math.ceil(mock.totalArticles / PER_PAGE));
  const debut = (page - 1) * PER_PAGE;
  const n = Math.max(0, Math.min(PER_PAGE, mock.totalArticles - debut));
  const nowSec = Math.floor(Date.now() / 1000);
  const articles = Array.from({ length: n }, (_, i) => {
    const num = debut + i + 1;
    const id = String(9000000000000 + num);
    return {
      vinted_item_id: id,
      titre: `Article harnais ${num}`,
      url: `https://www.vinted.fr/items/${id}`,
      prix: Number((5 + (num % 40) + 0.5).toFixed(2)),
      devise: "EUR",
      marque: null,
      taille: null,
      etat: null,
      vues: num % 50,
      favoris: num % 7,
      statut: "active",
      photos: [{ url: `https://images1.vinted.net/mock/harnais-${num}.jpg`, principale: true, ts: nowSec - num * 3600 }],
      photo_ts: nowSec - num * 3600,
    };
  });
  return {
    success: true,
    articles,
    pagination: { current_page: page, total_pages: totalPages, total_entries: mock.totalArticles, per_page: PER_PAGE },
    page,
  };
}

/** Date du jour en heure de PARIS (la base stocke en UTC, on regroupe par jour vécu). */
function jourParis(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// ── Détail d'UN article Vinted (2026-08-03 soir) ─────────────────────────────
// Un seul article, sur clic « Publier » côté site — le seul déclencheur permis
// pour /api/v2/item_upload/items/{id} (endpoint du formulaire d'édition, cf.
// bandeau ⛔ de lirePageDressing). withJobFlowLock : même onglet de travail que
// les publications et la sync — on ne se le dispute jamais.
async function fetchVintedItemDetail(vintedItemId) {
  const id = String(vintedItemId ?? "").trim();
  if (!id) return { success: false, error: "id d'article Vinted manquant" };
  return await withJobFlowLock("fetch-vinted-item", async () => {
    let tabId;
    try {
      tabId = await getOrCreateWorkTab("vinted", "https://www.vinted.fr/");
    } catch (e) {
      return { success: false, error: `onglet de travail Vinted : ${String(e?.message ?? e)}` };
    }
    const res = await sendMessageToTab(tabId, { type: "VINTED_ITEM_DETAIL", vintedItemId: id })
      .catch((e) => ({ success: false, error: `sonde injoignable : ${String(e?.message ?? e)}` }));
    return res ?? { success: false, error: "réponse vide du content script" };
  });
}

// ── Sonde d'état d'UNE annonce Vinted (2026-08-10) ───────────────────────────
// Demandée par le SITE à l'instant où l'utilisateur s'apprête à supprimer un
// article dont une annonce Vinted est réputée en ligne. Son SEUL rôle : décider
// si l'app a le droit de POSER UNE QUESTION (« plus en ligne — vendue ? »).
//
// ⚠️ ELLE N'ÉCRIT RIEN, NULLE PART. Aucun drapeau sur le job, aucun
// unavailable_since, aucun bandeau. C'est la leçon du 09/08 (5 faux bandeaux
// chez Ornella, 7ace830 → 6882e78) : une lecture ne conclut jamais à la place
// de l'utilisateur. Ici, toute écriture part d'un clic explicite, sur un écran
// qu'il vient lui-même d'ouvrir.
//
// Lecteur RÉUTILISÉ tel quel : checkListingState(url, "vinted"), exactement
// celui du poll de détection de vente — pas de second détecteur à valider, et
// les quatre verdicts sont déjà éprouvés en prod :
//   "sold"        → is_closed + item_closing_action='sold' : preuve POSITIVE
//   "unavailable" → 404/410, ou fermée sans preuve de vente
//   "active"      → toujours en ligne : l'app ne demande RIEN
//   "unknown"     → bot-shield, page inattendue, lecture ratée : on ne demande
//                   RIEN non plus. Une lecture ratée ne vaut pas une absence.
//
// ⛔ SURTOUT PAS /api/v2/items/{id} : cet endpoint est MORT depuis le 05/08 (il
// rend 404 avec un corps HTML pour TOUT article, vivant ou non — cf. le
// bandeau de lireDtoPublic dans content-scripts/vinted.js). Une sonde bâtie
// dessus répondrait « absent » pour la terre entière.
//
// URL VALIDÉE STRICTEMENT : ce message est relayé par fillsell-auth.js, donc
// atteignable par n'importe quel JS s'exécutant sur fillsell.app. Sans ce
// filtre, l'extension deviendrait un proxy de fetch AUTHENTIFIÉ vers l'URL de
// son choix (cookies de session inclus). Seules les pages d'annonce Vinted
// passent, et l'id doit être numérique.
function urlAnnonceVintedValide(brut) {
  let u;
  try { u = new URL(String(brut ?? "")); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host !== "vinted.fr" && host !== "www.vinted.fr") return null;
  if (!/^\/items\/\d+(?:-[^/]*)?\/?$/.test(u.pathname)) return null;
  return `${u.origin}${u.pathname}`; // query et fragment jetés
}

async function probeVintedListing(listingUrl) {
  const url = urlAnnonceVintedValide(listingUrl);
  if (!url) return { success: false, error: "URL d'annonce Vinted invalide" };
  // withJobFlowLock : la lecture passe par l'onglet de travail Vinted
  // (fetchListingHtml → workTabForFetch), le même que les publications et la
  // sync. On ne se le dispute jamais — incident du 12/07. Le site, lui, borne
  // son attente : si le verrou tarde, il ne pose simplement pas la question.
  return await withJobFlowLock("probe-vinted-listing", async () => {
    try {
      const { state, price } = await checkListingState(url, "vinted");
      console.log(`[background] sonde suppression : ${url} → ${state}${price ? ` (prix page : ${price} €)` : ""}`);
      return { success: true, state, price: price ?? null };
    } catch (e) {
      return { success: false, error: String(e?.message ?? e) };
    }
  });
}

// ── É1 republication : capture complète (2026-08-05) ─────────────────────────
// Même architecture que fetchVintedItemDetail : verrou de flux (on ne se
// dispute jamais l'onglet de travail avec une publication ou une sync), onglet
// de travail Vinted, délégation au content script. La capture est une LECTURE
// (détail d'édition + dto public + référentiels) — le verdict et la liste des
// champs manquants remontent tels quels au site, qui décidera de la
// persistance (É2, migration à valider).
async function captureVintedItem(vintedItemId) {
  const id = String(vintedItemId ?? "").trim();
  if (!id) return { success: false, error: "id d'article Vinted manquant" };
  return await withJobFlowLock("capture-vinted-item", () => captureVintedItemUnlocked(id));
}

// ⚠️ SANS VERROU — à n'appeler QUE depuis un contexte qui le détient déjà.
// C'est le cas de processRepublishJob, qui tourne dans le poll, lui-même sous
// withJobFlowLock : réclamer le verrou ici serait un auto-blocage (le même
// piège que la commande de sync distante, cf. traiterCommandeSyncDistante).
//
// DEUX TENTATIVES, navigation NEUVE entre les deux (2026-08-07, job 70cc68cd
// d'ornellaracano, jour du blast) : « sonde injoignable : Receiving end does
// not exist » est une condition TRANSITOIRE — onglet de travail dont la
// navigation post-discard n'a pas abouti (chargement trop lent, page
// d'erreur), content script jamais monté malgré les 20 s de relance de
// sendMessageToTab. Preuve du caractère transitoire : 8 secondes après ce
// même échec, la sync du dressing a re-navigué le MÊME onglet et sa sonde a
// répondu. Un 'failed' sec au premier essai fait perdre son geste à
// l'utilisateur (recliquer, re-débiter, re-rembourser) pour un aléa de
// chargement. On ne rejoue QUE la classe « connexion impossible » — jamais
// une vraie réponse du content script (même en échec), jamais le timeout de
// 5 min (là, on ne sait pas ce qui a été fait). La capture est une LECTURE :
// la rejouer ne peut rien dupliquer.
async function captureVintedItemUnlocked(vintedItemId) {
  const id = String(vintedItemId ?? "").trim();
  if (!id) return { success: false, error: "id d'article Vinted manquant" };
  let derniereErreur = null;
  for (let tentative = 1; tentative <= 2; tentative++) {
    let tabId;
    try {
      // Rappelé À CHAQUE tentative : navigateWorkTab re-décharge et re-navigue
      // l'onglet — c'est la navigation fraîche qui répare, pas l'attente.
      tabId = await getOrCreateWorkTab("vinted", "https://www.vinted.fr/");
    } catch (e) {
      return { success: false, error: `onglet de travail Vinted : ${String(e?.message ?? e)}` };
    }
    let injoignable = false;
    const res = await sendMessageToTab(tabId, { type: "VINTED_ITEM_CAPTURE", vintedItemId: id })
      .catch((e) => {
        const msg = String(e?.message ?? e);
        injoignable = msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection");
        return { success: false, error: `sonde injoignable : ${msg}` };
      });
    if (!injoignable) return res ?? { success: false, error: "réponse vide du content script" };
    derniereErreur = res;
    if (tentative === 1) {
      console.warn(`[capture] sonde injoignable (tentative 1) — navigation neuve puis 2e essai dans 5 s`);
      await sleep(5000);
    }
  }
  return derniereErreur;
}

// ── Capture + re-hébergement + persistance, CÔTÉ EXTENSION (2026-08-05) ──────
// Reprend à l'identique ce que faisait capturerEtPersisterArticleVinted côté
// site (src/utils/vintedSync.js), y compris l'injection du prix ajusté dans
// payload.prix et la conservation de payload.prix_origine. Le déplacement est
// TOUT l'objet du chantier : capturer ici, c'est capturer quelques secondes
// avant de supprimer — au lieu de plusieurs heures avant, au clic.
async function capturerEtPersisterDepuisExtension({ vintedItemId, inventaireId, prixRepublication, userId, accessToken }) {
  const id = String(vintedItemId ?? "").trim();
  const capture = await captureVintedItemUnlocked(id);
  if (!capture?.success) {
    return { success: false, error: capture?.error ?? "capture en échec" };
  }

  // Re-hébergement des photos : remplace le marqueur 'photos_rehebergees' posé
  // par la capture par le résultat RÉEL, échec par échec. Un échec photo ne
  // fait pas tomber la capture — il rejoint champs_manquants et le verdict
  // devient 'incomplet', ce qui interdit toute suppression plus loin.
  const manquants = (capture.champs_manquants ?? []).filter((c) => !String(c).startsWith("photos_rehebergees"));
  let photosUrls = [];
  if (capture.photos_cdn?.length) {
    try {
      const rep = await callEdgeFunction("republish-capture-photos", accessToken, {
        vinted_item_id: id, urls: capture.photos_cdn,
      });
      photosUrls = rep?.photos ?? [];
      for (const e of rep?.echecs ?? []) manquants.push(`photo non re-hébergée (${e.raison})`);
      if (!photosUrls.length) manquants.push("photos_rehebergees (aucune photo re-hébergée)");
    } catch (e) {
      manquants.push(`photos_rehebergees (${String(e?.message ?? e)})`);
    }
  }

  const prix = Number(prixRepublication);
  const prixAjuste = Number.isFinite(prix) && prix >= 1;
  const verdict = manquants.length ? "incomplet" : "valide";
  let ligne;
  try {
    ligne = await restRequest("vinted_republish_captures", accessToken, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        inventaire_id: inventaireId ?? null,
        vinted_item_id: id,
        verdict,
        champs_manquants: manquants,
        payload: {
          natif: capture.natif ?? null,
          dto_public: capture.dto_public ?? null,
          titre: capture.titre ?? null,
          prix: prixAjuste ? prix : (capture.prix ?? null),
          ...(prixAjuste ? { prix_origine: capture.prix ?? null } : {}),
          description: capture.description ?? null,
          photos_cdn: capture.photos_cdn ?? [],
          // Trace des lectures réseau de la capture (statut HTTP, forme,
          // amorce du corps en cas d'échec). Sans elle, un champ manquant ne
          // dit pas POURQUOI il manque — le premier test réel du 05/08 a coûté
          // un aller-retour de diagnostic pour ça.
          diagnostics: capture.diagnostics ?? null,
        },
        libelles: capture.libelles ?? null,
        photos_urls: photosUrls,
      }),
    });
  } catch (e) {
    return { success: false, error: `persistance : ${String(e?.message ?? e)}` };
  }
  const captureId = Array.isArray(ligne) && ligne.length ? ligne[0].id : null;
  if (!captureId) return { success: false, error: "persistance : identifiant de capture non rendu" };

  // Catégorie Vinted d'origine, récoltée au passage (2026-08-05). La capture
  // vient de lire le payload natif : le catalog_id y est, gratuitement. C'est
  // le point d'entrée du mapping de catégories des 4 plateformes — sans lui, un
  // article importé du dressing reste impubliable ailleurs.
  // Écrit SEULEMENT s'il manque : on ne réécrit jamais une valeur déjà posée.
  // Best-effort : un échec ici ne compromet pas la capture, qui est le geste
  // important (la colonne se remplira à la publication suivante).
  const catalogId = Number(capture.natif?.catalog_id);
  if (Number.isFinite(catalogId) && catalogId > 0 && inventaireId != null) {
    await restRequest(
      `inventaire?id=eq.${inventaireId}&vinted_catalog_id=is.null`,
      accessToken,
      { method: "PATCH", body: JSON.stringify({ vinted_catalog_id: catalogId }) },
    ).catch((e) => console.warn("[republish] catalog_id non écrit:", e?.message ?? e));
  }
  return { success: true, verdict, champs_manquants: manquants, capture_id: captureId, titre: capture.titre ?? null };
}

// ── Commande de sync venue du mobile (2026-08-05) ────────────────────────────
// L'utilisateur a cliqué depuis son téléphone : le site a posé une ligne
// vinted_sync_runs en 'queued', get-pending-jobs nous l'a servie (et ne la sert
// qu'aux versions >= 0.5.0). Trois gestes, dans cet ordre — l'ordre EST le
// correctif :
//   1. cadence AVANT réclamation. Une fois la ligne passée en 'running',
//      syncDressingUnlocked prend la branche REPRISE, qui n'est jamais bornée
//      (reprendre un run interrompu n'est pas une nouvelle sync). Or le PC peut
//      s'être réveillé des heures après le clic, derrière un cron quotidien qui
//      a déjà tout relu. Réclamer d'abord, ce serait resynchroniser pour rien ;
//   2. réclamation ATOMIQUE (filtre status=eq.queued) : deux Chrome ouverts sur
//      le même compte ne peuvent pas exécuter la même demande ;
//   3. exécution — la ligne étant déjà 'running', syncDressingUnlocked la
//      reprend telle quelle au lieu d'en créer une seconde (l'index unique
//      un_seul_actif l'interdirait de toute façon).
async function traiterCommandeSyncDistante(cmd) {
  const session = await getValidSession();
  if (!session?.access_token) return;
  const token = session.access_token;
  const userId = decodeJwtSub(token);
  if (!userId) return;
  const maintenant = () => new Date().toISOString();

  try {
    const derniers = await restRequest(
      `vinted_sync_runs?user_id=eq.${userId}&kind=eq.dressing&status=eq.done&select=finished_at&order=finished_at.desc&limit=1`,
      token, { headers: { Prefer: "return=representation" } },
    );
    const dernierFini = Date.parse(derniers?.[0]?.finished_at ?? "");
    if (Number.isFinite(dernierFini) && Date.now() - dernierFini < SYNC_MANUAL_COOLDOWN_MS) {
      const dansMin = Math.max(1, Math.ceil((dernierFini + SYNC_MANUAL_COOLDOWN_MS - Date.now()) / 60000));
      // Clôturée, pas laissée en file : sinon l'index unique bloquerait tout
      // nouveau clic jusqu'à l'expiration, et l'utilisateur n'aurait aucun
      // retour. 'cancelled' + motif lisible : le front l'affiche tel quel.
      await restRequest(`vinted_sync_runs?id=eq.${cmd.id}&status=eq.queued`, token, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled", finished_at: maintenant(), updated_at: maintenant(),
          erreur: `dressing déjà synchronisé il y a moins de 15 min (prochaine sync possible dans ~${dansMin} min)`,
        }),
      });
      console.log(`[sync-dressing][distant] commande ${cmd.id} annulée — cadence (~${dansMin} min)`);
      return;
    }
  } catch (e) {
    // Régulateur de cadence, pas barrière de sécurité : illisible → on passe.
    console.warn("[sync-dressing][distant] cadence illisible (on laisse passer):", e?.message ?? e);
  }

  let reclamee = null;
  try {
    reclamee = await restRequest(`vinted_sync_runs?id=eq.${cmd.id}&status=eq.queued`, token, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "running", claimed_at: maintenant(),
        // started_at remis à MAINTENANT : sans ça, la durée affichée du run
        // engloberait les heures d'attente entre le clic mobile et le réveil.
        started_at: maintenant(), updated_at: maintenant(),
        extension_build: FILLSELL_BUILD_ID,
      }),
    });
  } catch (e) {
    console.error("[sync-dressing][distant] réclamation impossible:", e?.message ?? e);
    return;
  }
  if (!Array.isArray(reclamee) || !reclamee.length) {
    console.log(`[sync-dressing][distant] commande ${cmd.id} déjà réclamée ailleurs — ignorée`);
    return;
  }

  console.log(`[sync-dressing][distant] commande ${cmd.id} réclamée — synchronisation lancée`);
  await syncDressingVinted({ declencheur: "bouton_distant" });
}

async function syncDressingVinted({ declencheur = "bouton" } = {}) {
  // Garde mémoire : deux déclenchements rapprochés (double-clic, alarme qui
  // tombe pendant un clic) ne doivent pas lire le dressing deux fois. La base
  // porte la même garantie (index unique WHERE status='running'), celle-ci
  // évite juste le travail inutile.
  if (syncDressingEnCours) {
    console.log("[sync-dressing] déjà en cours, déclenchement ignoré");
    return { ok: false, reason: "deja_en_cours" };
  }
  syncDressingEnCours = true;
  // withJobFlowLock est IMPÉRATIF : la sync navigue l'onglet de travail Vinted,
  // le même que celui d'une publication en cours. Sans ce verrou on rejouerait
  // l'incident du 2026-07-12 (deux flux se disputant le même onglet).
  try {
    return await withJobFlowLock("sync-dressing", () => syncDressingUnlocked(declencheur));
  } finally {
    syncDressingEnCours = false;
  }
}

async function syncDressingUnlocked(declencheur) {
  const session = await getValidSession();
  if (!session?.access_token) {
    console.log("[sync-dressing] pas de session FillSell — abandon silencieux");
    return { ok: false, reason: "no_session" };
  }
  const token = session.access_token;
  const userId = decodeJwtSub(token);
  if (!userId) return { ok: false, reason: "no_user" };

  // ── Reprise ───────────────────────────────────────────────────────────────
  // Un run laissé 'running' par une interruption (onglet fermé, PC éteint,
  // service worker tué) est REPRIS à sa page courante au lieu de tout relire.
  let run = null;
  try {
    const enCours = await restRequest(
      `vinted_sync_runs?user_id=eq.${userId}&kind=eq.dressing&status=eq.running&select=id,page_suivante,items_vus,items_crees,items_maj&limit=1`,
      token, { headers: { Prefer: "return=representation" } },
    );
    run = Array.isArray(enCours) && enCours.length ? enCours[0] : null;
  } catch (e) {
    console.warn("[sync-dressing] lecture du run en cours impossible:", e?.message ?? e);
  }
  // Repris ou neuf ? Capté ICI, avant que `run` soit réaffecté par la création
  // d'une nouvelle ligne : c'est ce drapeau qui interdira le marquage des
  // disparitions plus bas (garde (a), 2026-08-05).
  const runRepris = !!run;
  if (run) {
    console.log(`[sync-dressing] reprise du run ${run.id} à la page ${run.page_suivante}`);
  } else {
    // ── Cadence manuelle : borne posée ICI, côté background + base ─────────
    // (l'état React se contourne d'un F5). La REPRISE d'un run 'running'
    // au-dessus n'est jamais bornée : continuer un run interrompu n'est pas
    // une nouvelle sync. Lecture indisponible → on laisse passer : c'est un
    // régulateur de cadence, pas une barrière de sécurité.
    // ── Cadence CRON (2026-08-05) — la moitié SERVEUR ─────────────────────
    // L'alarme locale ne suffit pas : elle vit dans un profil Chrome. Une
    // extension réinstallée, un profil neuf, une seconde machine, et le
    // compteur repart de zéro. Cette garde-ci, elle, lit la BASE : elle vaut
    // pour le compte, quelle que soit l'installation.
    // 20 h et non 24 h : une borne stricte à 24 h dérive. L'alarme retombe à
    // la même heure ± quelques minutes ; une minute trop tôt et la sync est
    // refusée, l'utilisateur saute une journée ENTIÈRE, puis se met à syncer
    // un jour sur deux. 20 h absorbe le décalage tout en garantissant au plus
    // une sync par jour dans les usages réels.
    // Référence = dernier run 'done', comme la garde 'bouton' et pour la même
    // raison : un run bloqué par DataDome ou par une session morte n'a RIEN
    // lu, le compter interdirait la reprise pendant 20 h alors que le code
    // est fait pour repartir là où il s'est arrêté.
    if (declencheur === "cron") {
      try {
        const derniers = await restRequest(
          `vinted_sync_runs?user_id=eq.${userId}&kind=eq.dressing&status=eq.done&select=id,finished_at,erreur&order=finished_at.desc&limit=1`,
          token, { headers: { Prefer: "return=representation" } },
        );
        const dernier = derniers?.[0] ?? null;
        // ── Opt-in (2026-08-07) : le cron ENTRETIENT une sync existante, il
        // n'en INAUGURE jamais une. Sans cette garde, l'alarme (premier tir à
        // +10 min) lisait le dressing d'un compte qui n'a JAMAIS demandé de
        // sync — vécu le 06/08 : premier run d'ornellaracano@icloud.com en
        // declencheur='cron', 37 articles importés sans qu'elle ait appuyé
        // sur quoi que ce soit. Une liste vide est un fait (la lecture a
        // réussi), pas un aléa : on refuse — contrairement au catch
        // ci-dessous, qui laisse passer parce qu'il ne SAIT pas. Le trigger
        // garde_cadence_sync_cron (base) porte la même règle : une extension
        // figée ou trafiquée ne peut pas la contourner.
        if (!dernier) {
          console.log("[sync-dressing][cron] refusée — aucune sync 'done' sur ce compte : la première sync est un geste explicite de l'utilisateur");
          return { ok: false, reason: "cron_sans_premiere_sync" };
        }
        const dernierFini = Date.parse(dernier?.finished_at ?? "");
        if (Number.isFinite(dernierFini) && Date.now() - dernierFini < SYNC_CRON_COOLDOWN_MS) {
          const dansMin = Math.max(1, Math.ceil((dernierFini + SYNC_CRON_COOLDOWN_MS - Date.now()) / 60000));
          console.log(`[sync-dressing][cron] refusée par la cadence — prochaine possible dans ~${Math.round(dansMin / 60)} h`);
          await journaliserRefusCron(dernier, token).catch((e) =>
            console.warn("[sync-dressing][cron] refus non journalisé:", e?.message ?? e));
          return { ok: false, reason: "cadence_cron", prochaine_dans_min: dansMin };
        }
      } catch (e) {
        // Même doctrine que la garde 'bouton' : un aléa de lecture ne doit pas
        // condamner la sync. C'est un régulateur, pas une serrure.
        console.warn("[sync-dressing][cron] lecture de cadence impossible (on laisse passer):", e?.message ?? e);
      }
    }
    if (declencheur === "bouton") {
      try {
        const derniers = await restRequest(
          `vinted_sync_runs?user_id=eq.${userId}&kind=eq.dressing&status=eq.done&select=finished_at&order=finished_at.desc&limit=1`,
          token, { headers: { Prefer: "return=representation" } },
        );
        const dernierFini = Date.parse(derniers?.[0]?.finished_at ?? "");
        if (Number.isFinite(dernierFini) && Date.now() - dernierFini < SYNC_MANUAL_COOLDOWN_MS) {
          const dansMin = Math.max(1, Math.ceil((dernierFini + SYNC_MANUAL_COOLDOWN_MS - Date.now()) / 60000));
          console.log(`[sync-dressing] dressing synchronisé il y a moins de 15 min — prochaine sync manuelle possible dans ~${dansMin} min (cron non concerné)`);
          return { ok: false, reason: "cadence", prochaine_dans_min: dansMin };
        }
      } catch (e) {
        console.warn("[sync-dressing] lecture de cadence impossible (on laisse passer):", e?.message ?? e);
      }
    }
    const cree = await restRequest("vinted_sync_runs", token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId, kind: "dressing", status: "running",
        declencheur, extension_build: FILLSELL_BUILD_ID,
      }),
    }).catch((e) => { console.error("[sync-dressing] création du run:", e?.message ?? e); return null; });
    run = Array.isArray(cree) && cree.length ? cree[0] : null;
    if (!run) return { ok: false, reason: "run_non_cree" };
  }

  // Progression : best-effort, un raté se rattrape à la page suivante.
  const majRun = (champs) => restRequest(`vinted_sync_runs?id=eq.${run.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ ...champs, updated_at: new Date().toISOString() }),
  }).catch((e) => console.warn("[sync-dressing] maj run:", e?.message ?? e));

  // CLÔTURE : contrairement à majRun, elle n'a PAS le droit d'échouer en
  // silence. Une ligne laissée 'running' verrouille le compte : l'index
  // un_seul_actif interdit tout nouveau run, et le poll du front affiche
  // « en cours » pour toujours (run 606a9db5 du 03/08 au soir, clos en SQL à
  // la main). Un retry unique après 2 s ; s'il rate aussi, on le CRIE dans la
  // console — la reprise au prochain déclenchement reste alors la seule issue.
  const clore = async (champs) => {
    const corps = JSON.stringify({ ...champs, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const patch = () => restRequest(`vinted_sync_runs?id=eq.${run.id}`, token, { method: "PATCH", body: corps });
    try {
      await patch();
    } catch (e1) {
      console.error("[sync-dressing] clôture du run ratée, retry dans 2 s :", e1?.message ?? e1);
      await sleep(2000);
      await patch().catch((e2) =>
        console.error("[sync-dressing] CLÔTURE PERDUE — la ligne reste 'running' jusqu'à la prochaine reprise :", e2?.message ?? e2));
    }
  };

  const echec = async (message) => {
    // Message NU, sans préfixe : c'est un VRAI échec de run. Cf. la convention
    // du champ `erreur` détaillée à la clôture 'done' (les notes de journal,
    // elles, partent avec « [note] »).
    console.error("[sync-dressing] échec:", message);
    await clore({ status: "failed", erreur: String(message).slice(0, 500) });
    return { ok: false, reason: "echec", error: message };
  };

  // ── Corps du run ──────────────────────────────────────────────────────────
  // TOUT le travail entre la création du run et sa fin normale vit dans ce
  // try : n'importe quelle exception imprévue (upsert inventaire, snapshot,
  // onglet disparu…) doit CLORE la ligne avec son motif au lieu de laisser un
  // 'running' orphelin. Les gardes ponctuelles ci-dessous restent : elles
  // donnent des motifs plus précis que le filet général.
  try {

  // ── Harnais mock (unpacked seulement, cf. bandeau de lireSyncMockConfig) ──
  // Lu APRÈS la création du run : le harnais éprouve la boucle et la reprise,
  // pas les gardes de cadence ni le trigger, qui restent RÉELS et actifs.
  const mock = await lireSyncMockConfig();

  // ── Onglet de travail Vinted (fenêtre dédiée, jamais chez l'utilisateur) ──
  // En mode mock : ni onglet, ni sonde — zéro contact Vinted, c'est le contrat.
  let tabId = null;
  let ident = { success: true, userId: "harnais-mock" };
  if (mock) {
    console.warn(`[sync-dressing] ⚠️ HARNAIS MOCK ACTIF — ${mock.totalArticles} articles fabriqués, aucun appel Vinted (compte QA uniquement)`);
  } else {
    try {
      tabId = await getOrCreateWorkTab("vinted", "https://www.vinted.fr/");
    } catch (e) {
      return await echec(`onglet de travail Vinted : ${e?.message ?? e}`);
    }

    ident = await sendMessageToTab(tabId, { type: "VINTED_CURRENT_USER" }).catch((e) => ({
      success: false, error: `sonde injoignable : ${String(e?.message ?? e)}`,
    }));
    if (!ident?.success) {
      // Le motif précis (session absente HTTP 401, accès refusé HTTP 403,
      // erreur réseau, bot-shield) vient du content script, code HTTP réel
      // inclus — on le recopie tel quel dans le run. Le front reconnaît le cas
      // « session » sur ce texte pour afficher son message actionnable.
      return await echec(`sonde de session Vinted : ${ident?.error ?? "échec inconnu"}`);
    }
  }

  // ── Réservations de republication (volet c, 2026-08-05) ───────────────────
  // Les republications ARRÊTÉES À L'ÉTAPE 'deleted' : leur annonce a été
  // retirée et sa remplaçante peut déjà être en ligne. On charge leur titre
  // CAPTURÉ (celui de l'annonce Vinted, pas celui de la fiche FillSell, qui
  // peut différer) pour que la sync reconnaisse la recréation au lieu de
  // l'importer comme un article neuf. Lecture best-effort : en cas d'échec on
  // sync normalement — le filet ne doit jamais bloquer l'import.
  const reservesRepublish = [];
  try {
    const enVol = await restRequest(
      `cross_post_jobs?user_id=eq.${userId}&action=eq.republish` +
      `&status=in.(pending,processing,needs_user)` +
      `&platform_fields->>republish_step=eq.deleted&select=id,title,platform_fields`,
      token, { headers: { Prefer: "return=representation" } },
    );
    for (const j of enVol ?? []) {
      const capId = Number(j.platform_fields?.capture_id);
      let titre = j.title ?? null;
      if (Number.isFinite(capId)) {
        const c = await restRequest(
          `vinted_republish_captures?id=eq.${capId}&select=titre:payload->titre`,
          token, { headers: { Prefer: "return=representation" } },
        ).catch(() => null);
        if (c?.[0]?.titre) titre = c[0].titre;
      }
      if (titre && j.platform_fields?.deleted_at) {
        reservesRepublish.push({ job_id: j.id, titre, deleted_at: j.platform_fields.deleted_at });
      }
    }
    if (reservesRepublish.length) {
      console.log(`[sync-dressing] ${reservesRepublish.length} republication(s) à l'étape 'deleted' — leurs recréations ne seront pas importées`);
    }
  } catch (e) {
    console.warn("[sync-dressing] réservations republish illisibles (import normal):", e?.message ?? e);
  }

  const vusCetteSync = new Set();
  const echecsEcriture = []; // articles refusés par la base, rapportés à la clôture
  let page = run.page_suivante || 1;
  let items_vus = run.items_vus || 0;
  let items_crees = run.items_crees || 0;
  let items_maj = run.items_maj || 0;
  let totalEntries = null;

  while (page <= SYNC_MAX_PAGES) {
    // Point de coupe du harnais : la boucle, les pauses, le curseur et les
    // gardes tournent À L'IDENTIQUE — seule la provenance de la page change.
    const res = mock
      ? pageDressingMock(mock, page)
      : await sendMessageToTab(tabId, {
          type: "SYNC_DRESSING_PAGE", page, userId: ident.userId,
        }).catch((e) => ({ success: false, error: String(e?.message ?? e) }));

    if (!res?.success) {
      // Bot-shield ou session morte : on s'arrête PROPREMENT et on garde le
      // curseur. Le run reste repérable et la prochaine sync reprendra ici —
      // surtout pas de retry en rafale, c'est ce qui aggrave un challenge.
      if (res?.botShield || res?.sessionExpiree) {
        await clore({ status: "interrupted", page_suivante: page, items_vus, items_crees, items_maj,
          erreur: String(res?.error ?? "").slice(0, 500) });
        return { ok: false, reason: res.botShield ? "bot_shield" : "session_vinted", page };
      }
      return await echec(`page ${page} : ${res?.error ?? "erreur inconnue"}`);
    }

    const articles = Array.isArray(res.articles) ? res.articles : [];
    totalEntries = res.pagination?.total_entries ?? totalEntries;
    const totalPages = res.pagination?.total_pages ?? null;

    // Périmètre annoncé DÈS la lecture de la page : l'UI peut afficher
    // « 0 sur 32 » avant la première écriture, au lieu d'un compteur muet.
    await majRun({ total_pages: totalPages, total_entries: totalEntries, items_vus });

    // ⚠️ page_suivante n'avance qu'une fois la page ENTIÈRE écrite : un
    // curseur avancé en milieu de page ferait sauter, à la reprise, les
    // tranches jamais écrites de cette page. Les écritures de tranche
    // portent la progression, pas le curseur.
    for (let debut = 0; debut < articles.length; debut += SYNC_CHUNK) {
      const tranche = articles.slice(debut, debut + SYNC_CHUNK);
      // Filtré : un article sans id ne peut de toute façon pas se rapprocher de
      // `connus` (qui exige vinted_item_id), et un `undefined` dans le Set
      // fausserait la comparaison vu/annoncé de la garde (b).
      for (const a of tranche) if (a.vinted_item_id) vusCetteSync.add(a.vinted_item_id);
      const bilan = await enregistrerArticlesDressing(tranche, { token, userId, reservesRepublish });
      if (bilan.echecs?.length) echecsEcriture.push(...bilan.echecs);
      items_vus += tranche.length;
      items_crees += bilan.crees;
      items_maj += bilan.majs;
      await majRun({ items_vus, items_crees, items_maj, total_pages: totalPages, total_entries: totalEntries });
    }

    await majRun({ page_suivante: page + 1, items_vus, items_crees, items_maj });
    console.log(`[sync-dressing] page ${page}/${totalPages ?? "?"} — ${articles.length} articles (${items_vus} au total)`);

    if (articles.length === 0) break;
    if (totalPages != null && page >= totalPages) break;
    page += 1;
    await sleep(syncPauseMs());
  }

  // ── Disparitions : datées, JAMAIS supprimées ─────────────────────────────
  // Uniquement si la sync est allée au bout : interrompue à la page 2, on ne
  // sait rien des pages suivantes et tout marquer « disparu » serait faux.
  //
  // ⛔ DEUX GARDES AVANT TOUT MARQUAGE (2026-08-05). Échec FERMÉ dans les deux
  // cas — donnée manquante ou incohérente ⇒ on ne marque RIEN. Le coût est nul :
  // le run suivant marquera. Le coût inverse ne l'est pas — un marquage de masse
  // à tort éteint « Republier » et allume « Plus en ligne » sur des articles
  // bel et bien en ligne, jusqu'au run qui les revoit.
  //
  // (a) RUN REPRIS. `vusCetteSync` est reconstruit à CHAQUE exécution et repart
  //     VIDE, alors que c'est LUI qui décide qui a disparu. Une reprise à la
  //     page 2 ignore tout de la page 1 : ses articles seraient tous marqués
  //     disparus alors qu'ils ont été vus quelques minutes plus tôt. `items_vus`
  //     est restauré depuis la ligne du run, mais il ne sert qu'aux compteurs.
  //     Aucune comparaison ne peut rattraper ça — d'où le saut pur et simple.
  //     Choix ASSUMÉ (Nico, 05/08) : sauter plutôt que persister l'ensemble des
  //     vus — moins d'état à tenir, et le prochain run complet fera le travail.
  //     Aujourd'hui le défaut est masqué par le monopage (une reprise à la
  //     page 2 rend 0 article et `vusCetteSync.size > 0` est faux) ; il devient
  //     atteignable dès 2 pages, soit au-delà de 96 articles.
  //
  // (b) VU < ANNONCÉ. `total_entries` vient de la pagination Vinted et n'était
  //     jamais confronté à ce qu'on a réellement vu. Strict, sans tolérance :
  //     le sens de l'écart le permet. Un article RETIRÉ pendant le run fait
  //     baisser total_entries (relu à chaque page), donc vu >= annoncé — la
  //     garde ne se déclenche pas. Elle ne se déclenche que quand il MANQUE
  //     des articles à l'appel : page silencieusement courte, item sauté par un
  //     décalage de pagination, ajout pendant le run. Les deux premiers sont
  //     exactement ce qu'on veut attraper ; le troisième ne coûte qu'un report.
  //     total_entries absent = donnée manquante = on ne marque pas non plus.
  let motifSautDisparitions = runRepris
    ? `run repris à la page ${run.page_suivante ?? "?"} : les articles vus avant la reprise sont inconnus de ce passage`
    : totalEntries == null
      ? "total_entries absent de la pagination Vinted : périmètre du dressing invérifiable"
      : vusCetteSync.size < totalEntries
        ? `vu ${vusCetteSync.size} article(s) pour ${totalEntries} annoncé(s) par Vinted : relevé incomplet`
        : null;
  if (motifSautDisparitions) {
    console.warn(`[sync-dressing] disparitions NON marquées — ${motifSautDisparitions}`);
  }
  if (vusCetteSync.size > 0 && !motifSautDisparitions) {
    try {
      const connus = await restRequest(
        `inventaire?user_id=eq.${userId}&origine=eq.vinted_sync&disparu_le=is.null&select=id,vinted_item_id`,
        token, { headers: { Prefer: "return=representation" } },
      );
      // ── É4 (2026-08-05) : un article en cours de REPUBLICATION n'est pas
      // « disparu » — entre suppression et recréation, son absence du
      // dressing est VOULUE. Sans cette garde, une sync qui passe dans la
      // fenêtre daterait disparu_le et armerait le flux « plus en ligne —
      // vendue ? » sur un article qu'on est en train de republier : le faux
      // signal le plus dangereux du chantier. needs_user compris (étape
      // 'deleted' interrompue = toujours une republication vivante).
      let republishActifs = new Set();
      try {
        const jobsRepub = await restRequest(
          `cross_post_jobs?user_id=eq.${userId}&action=eq.republish` +
          `&status=in.(pending,processing,needs_user)&select=platform_fields`,
          token, { headers: { Prefer: "return=representation" } },
        );
        republishActifs = new Set(
          (jobsRepub ?? []).map((j) => j.platform_fields?.vinted_item_id).filter(Boolean),
        );
      } catch (e) {
        // Lecture impossible → on ne marque AUCUN disparu ce run : mieux vaut
        // un marquage retardé qu'un faux « vendue ? » sur une republication.
        console.warn("[sync-dressing] republish actifs illisibles — marquage des disparus sauté ce run:", e?.message ?? e);
        republishActifs = null;
        // Journalisé au même titre que les deux autres gardes : un run qui
        // renonce à marquer doit être constatable en base, avec son motif.
        motifSautDisparitions = `republications actives illisibles (${String(e?.message ?? e).slice(0, 120)})`;
      }
      const disparus = republishActifs === null ? [] : (connus ?? []).filter((r) =>
        r.vinted_item_id && !vusCetteSync.has(r.vinted_item_id) && !republishActifs.has(r.vinted_item_id));
      for (const d of disparus) {
        await restRequest(`inventaire?id=eq.${d.id}`, token, {
          method: "PATCH", body: JSON.stringify({ disparu_le: new Date().toISOString() }),
        }).catch(() => {});
      }
      if (disparus.length) console.log(`[sync-dressing] ${disparus.length} annonce(s) disparue(s), datées (aucune suppression)`);
    } catch (e) {
      console.warn("[sync-dressing] marquage des disparus:", e?.message ?? e);
    }
  }

  // ⚠️⚠️ CONVENTION DU CHAMP `erreur` (posée le 2026-08-05) ⚠️⚠️
  // `vinted_sync_runs.erreur` porte TROIS choses de nature différente. Le
  // STATUT de la ligne dit laquelle, et le préfixe le confirme :
  //   · 'failed' / 'interrupted' → un run réellement en ÉCHEC. Message NU.
  //     C'est CE cas, et lui seul, qu'un filtre d'alerte doit compter.
  //   · 'cancelled' / 'expired'  → une commande distante non exécutée (cadence
  //     de 15 min, ou 6 h sans extension). Message NU AUSSI : il est RENDU TEL
  //     QUEL à l'utilisateur par StockTab, un « [note] » lui apparaîtrait à
  //     l'écran. Ce n'est pas un échec de run pour autant — le statut suffit à
  //     l'exclure.
  //   · 'done' → NOTES DE JOURNAL sur un run allé au bout. TOUJOURS préfixées
  //     « [note] », et jamais montrées à l'utilisateur (StockTab ne lit
  //     `erreur` que pour failed/cancelled/expired).
  // Donc : un filtre sur les vrais échecs = status in ('failed','interrupted'),
  // et le préfixe « [note] » est la ceinture qui rattrape un filtre écrit trop
  // largement (`erreur is not null`) — il doit alors exclure ces lignes.
  // Toute nouvelle écriture non-échec sur un run 'done' DOIT reprendre le
  // préfixe : c'est ce qui garde le filtre juste.
  // (Aucune alerte ne lit ce champ aujourd'hui — ops-digest, handler-watch et
  // les 7 jobs cron ignorent la table. La convention est là pour que ça reste
  // vrai le jour où l'un d'eux s'y intéressera.)
  const NOTE = "[note] ";
  const notes = [];
  // Un run mocké doit se lire comme tel en base : personne ne doit prendre 289
  // articles fabriqués pour un dressing réel en analysant vinted_sync_runs.
  if (mock) notes.push(`${NOTE}HARNAIS MOCK pagination (unpacked) — ${mock.totalArticles} articles fabriqués, aucun appel Vinted`);
  // Diagnostic des runs à ZÉRO (2026-08-07, cas Sam) : un « done 0 » a deux
  // lectures — dressing vraiment vide, ou wardrobe lu à côté (mauvais compte,
  // session bancale). La sonde rend ce que le PROFIL annonce (item_count /
  // total_items_count) : on le journalise pour départager depuis la base,
  // sans jamais dégrader le run — item_count peut légitimement dépasser le
  // wardrobe exposé (32 remontés vs 236 annoncés sur le compte de test), on
  // ne fabrique pas un échec sur cette seule foi.
  if (items_vus === 0 && !mock) {
    notes.push(`${NOTE}dressing lu vide — le profil Vinted (${ident.login ?? "?"}) annonce item_count=${ident.itemCount ?? "?"}, total_items_count=${ident.totalItemsCount ?? "?"}`);
  }
  if (echecsEcriture.length) {
    // Des échecs d'écriture isolés ne dégradent PAS le statut (la sync est
    // allée au bout) mais sont consignés : items_vus − créés − maj doit
    // toujours s'expliquer en lisant la ligne du run. Ce ne sont pas des
    // échecs DU RUN — d'où le préfixe, au même titre que le reste.
    notes.push(`${NOTE}${echecsEcriture.length} article(s) non écrit(s) : ` +
      echecsEcriture.map((f) => `${f.vinted_item_id} (${f.erreur})`).join(" ; "));
  }
  if (motifSautDisparitions) notes.push(`${NOTE}disparitions non marquées — ${motifSautDisparitions}`);
  await clore({
    status: "done", items_vus, items_crees, items_maj,
    total_entries: totalEntries,
    ...(notes.length ? { erreur: notes.join(" | ").slice(0, 500) } : {}),
  });
  if (echecsEcriture.length) console.error(`[sync-dressing] ${echecsEcriture.length} article(s) non écrit(s) — détail dans vinted_sync_runs.erreur`);
  console.log(`[sync-dressing] terminée : ${items_vus} articles (${items_crees} créés, ${items_maj} mis à jour)`);
  return { ok: true, items_vus, items_crees, items_maj, echecs: echecsEcriture.length };

  } catch (e) {
    // Filet général : c'est CE catch qui garantit qu'aucune fin d'exécution ne
    // laisse la ligne en 'running' (bug du 03/08 : exception non prévue →
    // service worker rendu, run figé, compte verrouillé).
    return await echec(`erreur inattendue : ${e?.message ?? e}`);
  }
}

/**
 * Écrit une page d'articles : upsert inventaire + relevé du jour + entrée dans
 * le cycle de détection de vente. Rend le nombre de créations/mises à jour.
 */
async function enregistrerArticlesDressing(articles, { token, userId, reservesRepublish = [] }) {
  if (!articles.length) return { crees: 0, majs: 0 };

  // Ce qui existe déjà, pour distinguer création et mise à jour (l'upsert seul
  // ne le dit pas) et pour ne PAS réécrire des champs que l'utilisateur a pu
  // modifier dans FillSell.
  const ids = articles.map((a) => `"${a.vinted_item_id}"`).join(",");
  let existants = [];
  try {
    existants = await restRequest(
      `inventaire?user_id=eq.${userId}&vinted_item_id=in.(${ids})&select=id,vinted_item_id,first_seen_at,statut,origine,photos,prix_vente`,
      token, { headers: { Prefer: "return=representation" } },
    ) ?? [];
  } catch (e) {
    console.warn("[sync-dressing] lecture des existants:", e?.message ?? e);
  }
  const parVintedId = new Map(existants.map((r) => [r.vinted_item_id, r]));

  // ── VOLET (c) : ne pas importer l'annonce qu'un republish est en train de
  // recréer (2026-08-05). Une sync passée pendant l'étape 'deleted' voyait
  // l'annonce recréée comme un article INCONNU et en faisait une ligne de plus
  // — le doublon vécu le 05/08 (deux lignes, l'ancienne gardant un id mort).
  // La garde des disparitions empêchait le faux « disparu », pas ça.
  // On SAUTE l'import : c'est au republish de rattacher l'annonce à SA ligne
  // (volets a et b), avec son historique et son prix d'achat. Sauter est
  // réversible et sans perte — dès que le job quitte l'étape 'deleted',
  // l'article redevient importable normalement par la sync suivante.
  const connusIds = new Set(existants.map((r) => String(r.vinted_item_id)));
  const reserves = new Set();
  for (const r of reservesRepublish ?? []) {
    const { item } = reconnaitreAnnonceRecreee(articles, {
      titre: r.titre, deletedAt: r.deleted_at, idsConnus: connusIds,
    });
    if (item) {
      reserves.add(String(item.vinted_item_id));
      console.log(
        `[sync-dressing] article ${item.vinted_item_id} NON importé : c'est la recréation ` +
        `du republish ${r.job_id} (étape 'deleted') — il sera rattaché à sa ligne d'origine`
      );
    }
  }
  if (reserves.size) articles = articles.filter((a) => !reserves.has(String(a.vinted_item_id)));
  if (!articles.length) return { crees: 0, majs: 0, reserves: reserves.size };

  const maintenant = new Date().toISOString();
  const aujourdhui = jourParis();

  // ── Rattrapage : articles publiés VIA FillSell (2026-08-03 soir) ──────────
  // Leur ligne inventaire n'a PAS de vinted_item_id (elle est née dans l'app,
  // pas de la sync) — mais leur job de publication porte l'id Vinted :
  // platform_listing_id, ou listing_url seul pour les jobs historiques (la
  // colonne n'a jamais été écrite avant ce soir — 32 doublons prouvés sur le
  // run 04184057). Correspondance par ID VINTED UNIQUEMENT, jamais le titre
  // (leçon listing_url croisée : 36 % d'homonymes en réel).
  const orphelins = articles.filter((a) => !parVintedId.has(a.vinted_item_id));
  const parJob = new Map(); // vinted_item_id → inventaire_id du job de publication
  if (orphelins.length) {
    try {
      // Les plus récents d'abord : sur republication (2 jobs pour le même
      // article), c'est le dernier id Vinted qui fait foi — first-wins sur
      // une liste triée desc = le job le plus récent gagne.
      // status in (published, sold) UNIQUEMENT (filtre ajouté après revue du
      // 03/08) : seuls ces deux statuts prouvent que l'annonce appartient à
      // l'article. Un job cancelled/deleted/failed peut porter l'URL d'une
      // annonce morte — voire d'une AUTRE annonce (classe listing_url
      // croisée) : s'en servir rattacherait un import au mauvais article.
      // Cas réel : « Chaussures marron cuir enfant », 2 cancelled + 2 deleted
      // sur des annonces distinctes du même compte.
      const jobsPub = await restRequest(
        // É4 (2026-08-05) : republish inclus — l'annonce recréée est « publiée
        // via FillSell » au même titre qu'un publish, le rapprochement
        // anti-doublon de la sync doit la reconnaître.
        `cross_post_jobs?user_id=eq.${userId}&platform=eq.vinted&action=in.(publish,republish)` +
        `&status=in.(published,sold)` +
        `&inventaire_id=not.is.null&listing_url=not.is.null` +
        `&select=inventaire_id,platform_listing_id,listing_url&order=created_at.desc&limit=1000`,
        token, { headers: { Prefer: "return=representation" } },
      ) ?? [];
      for (const j of jobsPub) {
        const idVinted = j.platform_listing_id ?? extractListingId(j.listing_url, "vinted");
        if (idVinted != null && !parJob.has(String(idVinted))) parJob.set(String(idVinted), j.inventaire_id);
      }
    } catch (e) {
      // Rattrapage indisponible : la sync continue — l'upsert anti-doublon par
      // vinted_item_id protège toujours, au pire on recrée (état d'avant).
      console.warn("[sync-dressing] lecture des jobs de publication:", e?.message ?? e);
    }
  }

  // ── Vente détectée par la SYNC → MÊME chemin que le suivi d'annonce ────────
  // (2026-08-09, constat Ornella : espadrilles MOA.) La sync voyait la vente et
  // passait l'inventaire en vendu, mais cross_post_jobs n'en savait RIEN : pas
  // de bandeau (l'app lit les jobs, jamais l'inventaire), pas de ligne dans
  // `ventes`, pas de dépublication des frères (orchestrateSale n'est déclenchée
  // que par le clic du bandeau, sur un job). Convergence : PROPAGER VERS LES
  // JOBS — on pose sur le job Vinted vivant exactement le drapeau que poserait
  // le poll de détection (unavailable_since + sale_signal='sold' +
  // detected_price), et TOUTE la chaîne existante fait le reste : bandeau
  // « Vendue sur Vinted 🎉 », clic, check-listing-status → orchestrateSale
  // (vente, marges, frères annulés, pending_removal). La doctrine du 12/07
  // reste intacte : la sync ne fait que POSER UN DRAPEAU, seul le clic écrit.
  // GARDE ANTI-RÉTROACTIVITÉ : uniquement les ventes NOUVELLES — un article
  // déjà statut='vendu' en base (vente déjà actée, ou héritée d'avant ce
  // commit) n'est jamais re-signalé : aucune dépublication rejouée après coup.
  // publish ET republish (rétabli pour la 0.5.4, décision Nico 09/08) : un
  // republish est une annonce Vinted comme une autre — une vente dessus doit
  // produire le même bandeau et la même dépublication des frères qu'un
  // publish. Les jobs republish à id périmé qui ont motivé le revert 6882e78
  // sont clos par le ré-appariement du poll (superseded_listing) dès cette
  // version ; l'affichage app des bandeaux republish rouvrira par un commit
  // séparé, sur GO explicite, après acceptation de la 0.5.4.
  const ventesSignaleesAuJob = new Set(); // vinted_item_id dont un job vivant porte le drapeau
  const soldFrais = articles.filter((a) =>
    a.statut === "sold" && parVintedId.get(a.vinted_item_id)?.statut !== "vendu");
  if (soldFrais.length) {
    try {
      const jobsVifs = await restRequest(
        `cross_post_jobs?user_id=eq.${userId}&platform=eq.vinted&action=in.(publish,republish)` +
          `&status=eq.published&select=id,inventaire_id,platform_listing_id,listing_url,platform_fields` +
          `&order=created_at.desc&limit=1000`,
        token, { headers: { Prefer: "return=representation" } },
      ) ?? [];
      // Correspondance par ID VINTED d'abord (même règle que le rattrapage
      // ci-dessus : jamais le titre), inventaire_id en repli — un job publié
      // avant l'écriture de platform_listing_id peut n'avoir que ce lien-là.
      const jobParIdVinted = new Map();
      const jobParInventaire = new Map();
      for (const j of jobsVifs) {
        const idV = j.platform_listing_id ?? extractListingId(j.listing_url, "vinted");
        if (idV != null && !jobParIdVinted.has(String(idV))) jobParIdVinted.set(String(idV), j);
        if (j.inventaire_id != null && !jobParInventaire.has(String(j.inventaire_id))) jobParInventaire.set(String(j.inventaire_id), j);
      }
      for (const a of soldFrais) {
        const invId = parVintedId.get(a.vinted_item_id)?.id ?? parJob.get(String(a.vinted_item_id)) ?? null;
        const job = jobParIdVinted.get(String(a.vinted_item_id)) ??
          (invId != null ? jobParInventaire.get(String(invId)) : null);
        if (!job) continue; // aucun job Vinted vivant : import pur, flip direct comme avant
        const pf = job.platform_fields ?? {};
        if (pf.unavailable_since) { ventesSignaleesAuJob.add(a.vinted_item_id); continue; } // déjà signalé (poll ou run précédent) : ne pas écraser son horodatage
        try {
          await restRequest(`cross_post_jobs?id=eq.${job.id}`, token, {
            method: "PATCH",
            body: JSON.stringify({
              platform_fields: {
                ...pf,
                unavailable_since: maintenant,
                sale_signal: "sold", // preuve positive : is_closed + item_closing_action='sold' (wardrobe)
                ...(Number.isFinite(a.prix) && a.prix > 0 ? { detected_price: a.prix } : {}),
              },
            }),
          });
          ventesSignaleesAuJob.add(a.vinted_item_id);
          console.log(
            `[sync-dressing] VENTE Vinted détectée sur ${a.vinted_item_id} → drapeau posé sur le job ${job.id} ` +
            "(confirmation via le bandeau de l'app — aucune écriture de vente ici)"
          );
        } catch (e) {
          // PATCH raté : l'article N'ENTRE PAS dans ventesSignaleesAuJob → il
          // retombe sur l'ancien comportement (statut='vendu' direct) — jamais
          // une vente perdue, au pire sans bandeau ce run-ci.
          console.warn(`[sync-dressing] drapeau de vente refusé sur le job ${job.id}:`, e?.message ?? e);
        }
      }
    } catch (e) {
      // Lecture des jobs indisponible : repli complet sur l'ancien comportement.
      console.warn("[sync-dressing] signalement des ventes aux jobs:", e?.message ?? e);
    }
  }
  // ── PATCH léger : la règle de propriété (2026-08-03, 2e revue) ────────────
  // La sync ne réécrit EN ENTIER que SES lignes (origine='vinted_sync').
  // Toute autre ligne — rattachée via un job ce run-ci, OU déjà identifiée
  // par vinted_item_id lors d'un run précédent — ne reçoit QUE l'identité et
  // les compteurs Vinted : titre, marque, photos, prix, statut, origine sont
  // à l'utilisateur. La faire entrer dans l'upsert plein l'écraserait (et
  // réécrirait même son id, cf. le 409 du run d10ab149 : merge-duplicates
  // pose TOUTES les colonnes du payload dans le DO UPDATE, id compris — la
  // FK cross_post_jobs_inventaire_id_fkey a heureusement tout annulé).
  const patchLeger = (invId, a) => restRequest(`inventaire?id=eq.${invId}&user_id=eq.${userId}`, token, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      vinted_item_id: a.vinted_item_id,
      vinted_view_count: a.vues,
      vinted_favourite_count: a.favoris,
      vinted_status: a.statut,
      last_synced_at: maintenant,
      disparu_le: null,
      // listed_at_guess AUSSI sur les lignes nées FillSell (2026-08-07,
      // validé Nico) : ce n'est PAS une donnée utilisateur, c'est un fait
      // Vinted (timestamp de SES photos) — la frontière de propriété
      // titre/prix/photos reste intacte. Sans lui, les articles publiés via
      // FillSell n'avaient JAMAIS d'ancienneté (8/10 chez ornellaracano,
      // les 2 datées venant de l'écriture à la recréation d'un republish —
      // avec laquelle celle-ci CONVERGE : photos re-uploadées à la
      // recréation ⇒ photo_ts ≈ date de recréation). Clé ABSENTE quand
      // photo_ts manque : jamais un NULL par-dessus une valeur.
      ...(a.photo_ts ? { listed_at_guess: new Date(a.photo_ts * 1000).toISOString() } : {}),
    }),
  });

  const patchesLegers = new Set(); // vinted_item_id écrits par PATCH — exclus du lot d'upsert
  const echecs = [];               // { vinted_item_id, titre, erreur } — remontés dans le run
  for (const a of articles) {
    const dejaLa = parVintedId.get(a.vinted_item_id);
    let invId = null;
    if (dejaLa && dejaLa.origine !== "vinted_sync") invId = dejaLa.id;                 // ligne FillSell déjà identifiée
    else if (!dejaLa) { const viaJob = parJob.get(String(a.vinted_item_id)); if (viaJob != null) invId = viaJob; }
    if (invId == null) continue;
    try {
      const patched = await patchLeger(invId, a);
      if (Array.isArray(patched) && patched.length) {
        patchesLegers.add(a.vinted_item_id);
      }
      // 0 ligne = l'article a été supprimé de FillSell depuis la publication :
      // il repart en création normale ci-dessous, comme un article inconnu.
    } catch (e) {
      // PATCH raté : surtout ne PAS laisser l'article filer dans l'upsert
      // plein (doublon pour un rattaché, écrasement pour une ligne FillSell).
      // Il est signalé et sera retenté au prochain run.
      patchesLegers.add(a.vinted_item_id);
      echecs.push({ vinted_item_id: a.vinted_item_id, titre: a.titre ?? null, erreur: String(e?.message ?? e) });
      console.error(`[sync-dressing] PATCH ${a.vinted_item_id} → inventaire ${invId} refusé:`, e?.message ?? e);
    }
  }

  // Lot d'upsert : jamais un article patché, jamais deux fois le même id
  // (deux entrées wardrobe pour le même id feraient un « cannot affect row a
  // second time » — première occurrence seule).
  const vusDansLeLot = new Set();

  // ── Frontière de propriété des PHOTOS (affinée le 2026-08-03 soir) ────────
  // Ce n'est pas « renseigné vs vide », c'est « hébergé CHEZ NOUS vs hébergé
  // chez VINTED » :
  //   · au moins une photo à nous (storage Supabase, posée par le stepper —
  //     ListingPreviewScreen:5253) → le tableau ENTIER est intouchable ;
  //   · que des URLs CDN Vinted → la sync RAFRAÎCHIT normalement : Vinted est
  //     la source de vérité, et figer la première sync laisserait pointer vers
  //     des fichiers que Vinted supprime quand l'utilisateur remplace ses
  //     photos (article sans image, en silence).
  // Détection par DOMAINE d'URL ; les entrées OBJET ({type,url,…}) ne viennent
  // que de notre pipeline de retouche → à nous par construction.
  const urlPhoto = (p) => typeof p === "string" ? p : String(p?.url ?? p?.original ?? p?.enhanced ?? p?.bg_removed ?? "");
  const estCdnVinted = (p) => typeof p === "string" && /^https?:\/\/[^/]*\bvinted\.net\//i.test(p);
  const photosANous = (arr) => Array.isArray(arr) && arr.length > 0
    && arr.some((p) => typeof p !== "string" || !estCdnVinted(urlPhoto(p)));

  const lignes = articles.filter((a) => {
    if (patchesLegers.has(a.vinted_item_id)) return false;
    if (vusDansLeLot.has(a.vinted_item_id)) return false;
    vusDansLeLot.add(a.vinted_item_id);
    return true;
  }).map((a, i) => {
    const dejaLa = parVintedId.get(a.vinted_item_id);
    return {
      // `inventaire.id` n'a PAS de valeur par défaut en base (pas d'identity) :
      // c'est l'appelant qui la fournit, comme le fait déjà le front
      // (`id: Date.now()+...`). On garde la même convention.
      id: dejaLa?.id ?? Date.now() * 1000 + i,
      user_id: userId,
      titre: a.titre ?? "Article Vinted",
      // PRIX D'ACHAT VOLONTAIREMENT ABSENT : Vinted ne le connaît pas. Ne
      // JAMAIS mettre 0 ici (cf. règle de comptabilisation du 03/08).
      //
      // PRIX_VENTE : jamais le prix d'annonce Vinted ici (il vit dans
      // vinted_listing_snapshots, règle du chantier 4) — mais on ne REMPLACE
      // plus par NULL une valeur déjà en base (posée par la publication,
      // bd9a516, ou par l'utilisateur). Renseigné = intouchable ; vide = vide.
      prix_vente: dejaLa?.prix_vente ?? null,
      // STATUT : règle ASYMÉTRIQUE (2026-08-03 soir). La sync peut faire
      // stock → vendu (Vinted dit sold), JAMAIS vendu → stock : un article
      // vendu hors Vinted (vide-grenier, LBC) dont l'annonce Vinted vit
      // encore doit RESTER vendu — le rétrograder cassait la comptabilité et
      // relançait la détection de vente dessus. L'état brut de Vinted reste
      // lisible dans vinted_status, écrit à chaque run.
      // ⚠️ SAUF si un job vivant vient d'être signalé (2026-08-09) : c'est
      // alors le clic du bandeau (orchestrateSale) qui écrira vente + statut.
      // Flipper ici ferait perdre le gate consume_one_unit à la confirmation
      // → la vente ne serait JAMAIS comptabilisée (le trou exact du constat
      // Ornella). Sans job vivant : flip direct, comportement du 03/08.
      statut: dejaLa?.statut === "vendu" ? "vendu"
        : a.statut !== "sold" ? "stock"
        : ventesSignaleesAuJob.has(a.vinted_item_id) ? (dejaLa?.statut ?? "stock")
        : "vendu",
      marque: a.marque ?? null,
      // PHOTOS : cf. frontière de propriété ci-dessus. Le lot d'upsert exige
      // les mêmes clés sur toutes les lignes — la colonne reste présente et
      // porte l'existant quand il est à nous. Vinted sans photos + existant
      // CDN Vinted : on GARDE l'existant (un raté de lecture ne vide pas un
      // article). `description`, elle, est VOLONTAIREMENT absente de ce
      // payload : merge-duplicates ne touche que les colonnes présentes, et la
      // description récupérée au clic « Publier » doit survivre aux runs — ne
      // jamais l'ajouter ici.
      photos: photosANous(dejaLa?.photos)
        ? dejaLa.photos
        : (a.photos?.length ? a.photos.map((p) => p.url) : (dejaLa?.photos ?? null)),
      plateforme: "vinted",
      origine: "vinted_sync",
      vinted_item_id: a.vinted_item_id,
      vinted_view_count: a.vues,
      vinted_favourite_count: a.favoris,
      vinted_status: a.statut,
      // Estimation assumée : timestamp de la photo la plus ancienne. Le nom
      // « guess » est là pour qu'on ne l'affiche jamais à l'heure près.
      listed_at_guess: a.photo_ts ? new Date(a.photo_ts * 1000).toISOString() : null,
      first_seen_at: dejaLa?.first_seen_at ?? maintenant,
      last_synced_at: maintenant,
      disparu_le: null, // réapparu : on efface la date de disparition
    };
  });

  // UPSERT sur la contrainte d'unicité : 2e passage = mise à jour, jamais
  // duplication. `merge-duplicates` cible l'index (user_id, vinted_item_id).
  // Le lot est ATOMIQUE : une seule ligne refusée perdait les 30 autres (run
  // d10ab149 : 0 création sur un lot de 32). En cas de refus du lot, reprise
  // ligne par ligne — les lignes saines passent, les refusées sont signalées.
  if (lignes.length) {
    try {
      await restRequest("inventaire?on_conflict=user_id,vinted_item_id", token, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(lignes),
      });
    } catch (e) {
      console.warn(`[sync-dressing] lot d'upsert refusé (${e?.message ?? e}) — reprise ligne par ligne`);
      for (const ligne of lignes) {
        try {
          await restRequest("inventaire?on_conflict=user_id,vinted_item_id", token, {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([ligne]),
          });
        } catch (e2) {
          echecs.push({ vinted_item_id: ligne.vinted_item_id, titre: ligne.titre, erreur: String(e2?.message ?? e2) });
          console.error(`[sync-dressing] article ${ligne.vinted_item_id} (« ${ligne.titre} ») non écrit:`, e2?.message ?? e2);
        }
      }
    }
  }

  // Relevé du jour : c'est lui qui rendra « +3 vues en 15 jours » possible.
  // Un seul par article et par jour (contrainte de base) — un clic répété sur
  // le bouton écrase le relevé du jour au lieu d'empiler des lignes.
  const releves = articles.map((a) => ({
    user_id: userId,
    vinted_item_id: a.vinted_item_id,
    captured_at: maintenant,
    captured_on: aujourdhui,
    price: a.prix,
    view_count: a.vues,
    favourite_count: a.favoris,
    status: a.statut,
  }));
  await restRequest("vinted_listing_snapshots?on_conflict=user_id,vinted_item_id,captured_on", token, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(releves),
  }).catch((e) => console.warn("[sync-dressing] snapshots:", e?.message ?? e));

  // ── Entrée dans le cycle de détection de vente ───────────────────────────
  // Un article importé n'a aucun cross_post_jobs : sans cette ligne,
  // checkPublishedListings ne le regarderait jamais et sa vente ne serait
  // jamais détectée. On crée un job DÉJÀ 'published' (l'annonce existe, on ne
  // publie rien) — status terminal, donc invisible pour get-pending-jobs et
  // pour recoverStaleProcessingJobs, qui ne repêche que 'processing'.
  // Les patchés sont EXCLUS : leur job de publication réel existe déjà et
  // alimente déjà la détection de vente — un synthétique en plus ferait deux
  // jobs 'published' sur le même platform_listing_id. Les échecs d'écriture
  // aussi : leur inventaire_id ne pointerait sur rien (FK cross_post_jobs).
  const nonEcrits = new Set(echecs.map((f) => f.vinted_item_id));
  const aCreer = articles.filter((a) =>
    a.statut === "active" && a.url && !parVintedId.has(a.vinted_item_id)
    && !patchesLegers.has(a.vinted_item_id) && !nonEcrits.has(a.vinted_item_id));
  if (aCreer.length) {
    const parId = new Map(lignes.map((l) => [l.vinted_item_id, l.id]));
    const jobs = aCreer.map((a) => ({
      user_id: userId,
      inventaire_id: parId.get(a.vinted_item_id) ?? null,
      platform: "vinted",
      action: "publish",
      status: "published",
      title: a.titre ?? null,
      price: a.prix,
      listing_url: a.url,
      platform_listing_id: a.vinted_item_id,
      published_at: maintenant,
      handler_build: `${FILLSELL_BUILD_LABEL} · sync-dressing`,
    }));
    await restRequest("cross_post_jobs", token, {
      method: "POST", body: JSON.stringify(jobs),
    }).catch((e) => console.warn("[sync-dressing] jobs de suivi:", e?.message ?? e));
  }

  // Un PATCH léger compte comme une mise à jour : l'article existait, la
  // sync n'a fait que lui adosser son identité Vinted et ses compteurs.
  // Les échecs ne comptent ni créés ni mis à jour : ils sont RAPPORTÉS.
  const patchesReussis = [...patchesLegers].filter((id) => !nonEcrits.has(id)).length;
  const crees = lignes.filter((l) => !parVintedId.has(l.vinted_item_id) && !nonEcrits.has(l.vinted_item_id)).length;
  const majsLot = lignes.filter((l) => parVintedId.has(l.vinted_item_id) && !nonEcrits.has(l.vinted_item_id)).length;
  return { crees, majs: patchesReussis + majsLot, echecs };
}

// ── Catalogue cumulatif des requis découverts (chantier 2026-07-16) ───────────
// Chaque champ requis OBSERVÉ (config attributes Vinted, énumération DOM,
// refus 400 serveur) est upserté dans platform_category_aspects — la table
// joue pour Vinted/LBC/Beebs le rôle d'ebay_item_aspects : l'app la lit pour
// afficher les requis AVANT publication. Fire-and-forget : une découverte
// perdue se re-découvrira au prochain job, un job ne doit JAMAIS échouer pour
// un problème de catalogue.
function categoryKeyOf(job) {
  const pf = job.platform_fields ?? {};
  const path = pf.categoryPath ?? pf.beebsCategoryPath ?? pf.lbcCategoryPath ?? null;
  if (Array.isArray(path) && path.length) return path.join(" > ");
  if (pf.ebayCategoryId) return String(pf.ebayCategoryId);
  return "(catégorie inconnue)";
}

// PRÉCÉDENCE DES SOURCES (2026-08-11) — un refus SERVEUR prime sur le DOM.
// Bug mesuré : la déduplication « premier arrivé gagne » combinée à l'ordre du
// site d'appel (discoveredRequired en tête, serverRequired ensuite) jetait
// SILENCIEUSEMENT la découverte la plus forte dès que le champ existait aussi
// dans le formulaire. Preuve en base : les 4 seules lignes source='server_400'
// portent `photos` et `title` et `internal_memory_capacity` — précisément les
// clés que la passe DOM n'énumère PAS. Les refus serveur sur `color` (Peluches
// 10/08, Robes Midi 30/07) et `brand` (Robes Midi 29/07) ont tous été perdus :
// le champ EXISTE au formulaire sans astérisque, donc le DOM le posait d'abord
// en required=false et le refus serveur était ignoré.
// Conséquence pour l'utilisateur : Vinted refuse, on ne l'apprend jamais, et on
// le renvoie au même mur à chaque tentative.
// Une valeur haute gagne. À poids égal, `required: true` gagne.
const ASPECT_SOURCE_POIDS = { server_400: 3, manual: 2, dom: 1 };

async function persistDiscoveredAspects(accessToken, job, discovered) {
  const rows = [];
  const seen = new Map(); // key → index dans rows
  for (const d of discovered ?? []) {
    const key = String(d?.key ?? d?.field ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      // Doublon : on ne garde QUE si la nouvelle observation est plus forte.
      const i = seen.get(key);
      const src = d.source === "server_400" || d.source === "manual" ? d.source : "dom";
      const ancien = rows[i];
      const plusFort = (ASPECT_SOURCE_POIDS[src] ?? 1) > (ASPECT_SOURCE_POIDS[ancien.source] ?? 1) ||
        ((ASPECT_SOURCE_POIDS[src] ?? 1) === (ASPECT_SOURCE_POIDS[ancien.source] ?? 1) &&
          d.required !== false && ancien.required === false);
      if (!plusFort) continue;
      // On écrase la ligne, en CONSERVANT les options déjà relevées : un refus
      // 400 ne nomme que le champ, il ne connaît aucune valeur autorisée — les
      // perdre ferait retomber l'app en saisie de texte libre.
      rows[i] = {
        ...ancien,
        required: d.required !== false,
        source: src,
        field_label: d.label ? String(d.label).slice(0, 200) : ancien.field_label,
        allowed_values: Array.isArray(d.options) && d.options.length
          ? d.options.slice(0, 200).map((v) => String(v).trim()).filter(Boolean)
          : ancien.allowed_values,
      };
      continue;
    }
    seen.set(key, rows.length);
    rows.push({
      platform: job.platform,
      category_key: categoryKeyOf(job).slice(0, 300),
      field_key: key.slice(0, 120),
      field_label: d.label ? String(d.label).slice(0, 200) : null,
      required: d.required !== false,
      input_type: d.inputType ? String(d.inputType).slice(0, 40) : null,
      // trim (2026-07-30) : les options viennent de textContent DOM et
      // certaines portaient des espaces finaux (« Boutique italienne  ») —
      // recommittés tels quels par les sélecteurs de l'app dans les jobs.
      allowed_values: Array.isArray(d.options) && d.options.length
        ? d.options.slice(0, 200).map((v) => String(v).trim()).filter(Boolean)
        : null,
      source: d.source === "server_400" || d.source === "manual" ? d.source : "dom",
      last_seen_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return;
  try {
    await restRequest(
      "platform_category_aspects?on_conflict=platform,category_key,field_key",
      accessToken,
      {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify(rows),
      }
    );
    console.log(`[background] catalogue requis : ${rows.length} champ(s) upserté(s) (${job.platform} / ${rows[0].category_key})`);
  } catch (e) {
    console.warn("[background] persistDiscoveredAspects (non bloquant) :", String(e?.message ?? e));
  }
}

async function checkPublishedListings(session) {
  let jobs;
  try {
    jobs = await restRequest(
      "cross_post_jobs" +
        "?select=id,platform,inventaire_id,listing_url,last_checked_at,published_at,created_at,platform_fields" +
        // É4 (2026-08-05) : un job republish 'published' EST une annonce en
        // ligne — sans lui, un article republié sortait de la détection de
        // vente (le publish d'origine est clos 'cancelled' à la suppression).
        "&status=eq.published&action=in.(publish,republish)&listing_url=not.is.null" +
        "&order=last_checked_at.asc.nullsfirst&limit=30",
      session.access_token
    );
  } catch (e) {
    console.error("[background] Lecture des jobs published:", String(e?.message ?? e));
    return;
  }

  const now = Date.now();

  // Délai de grâce : une annonce trop fraîche n'est PAS vérifiée du tout — on ne
  // la lit même pas (économie de requêtes, et zéro risque de conclure sur une
  // annonce en cours d'indexation/modération). Elle sera examinée au cycle qui
  // suivra la fin de sa fenêtre.
  const inGrace = (j) => {
    const ref = Date.parse(j.published_at ?? j.created_at ?? "");
    if (!Number.isFinite(ref)) return false; // pas de date fiable : on ne bloque pas
    const grace = PUBLISH_GRACE_MS[j.platform] ?? PUBLISH_GRACE_DEFAULT_MS;
    return now - ref < grace;
  };

  const fresh = (jobs ?? []).filter(inGrace);
  if (fresh.length) {
    console.log(
      `[background] Délai de grâce : ${fresh.length} annonce(s) trop récente(s), non vérifiée(s) — ` +
      fresh.map((j) => `${j.platform} (${Math.round((PUBLISH_GRACE_MS[j.platform] ?? PUBLISH_GRACE_DEFAULT_MS) / 3600000)} h)`).join(", ")
    );
  }

  // Temporisation CROISSANTE sur les lectures indéterminées (2026-07-13) : 1re
  // relecture au cycle suivant, puis 30 min, 2 h… et 24 h une fois le job déclaré
  // non vérifiable. Sans ça, un job bloqué (bot-shield) consommait une place de
  // vérification à CHAQUE cycle, indéfiniment, en évinçant les autres.
  const dueDelayMs = (j) => {
    const echecs = Number(j.platform_fields?.check_unknown_count ?? 0);
    if (j.platform_fields?.check_unresolved) return UNKNOWN_RETRY_MS;
    if (!echecs) return SALE_CHECK_MIN_INTERVAL_MS;
    return Math.min(SALE_CHECK_MIN_INTERVAL_MS, [0, 30 * 60 * 1000, 2 * 60 * 60 * 1000][echecs] ?? SALE_CHECK_MIN_INTERVAL_MS);
  };

  const due = (jobs ?? [])
    .filter((j) => !inGrace(j))
    .filter((j) => !j.last_checked_at || now - Date.parse(j.last_checked_at) > dueDelayMs(j))
    .slice(0, SALE_CHECK_MAX_PER_CYCLE);
  if (!due.length) return;

  console.log(`[background] Détection : ${due.length} annonce(s) à vérifier`);
  for (let i = 0; i < due.length; i++) {
    const job = due[i];
    const { state, price } = await checkListingState(job.listing_url, job.platform);
    console.log(`[background] ${job.platform} ${job.id} → ${state}${price ? ` (prix page : ${price} €)` : ""}`);

    // État AMBIGU (bot-shield, page inattendue, champs absents) : on ne conclut
    // RIEN et on ne pose AUCUN drapeau — conclure sur une lecture ratée, c'est
    // fabriquer une fausse vente ou une fausse disparition.
    //
    // ⚠️ MAIS ON NE BOUCLE PLUS INDÉFINIMENT (2026-07-13, job 9051246f : bloqué
    // en « unknown » cycle après cycle, pendant des heures, sans jamais rien
    // dire). Un indéterminé qui se répète n'est pas un aléa, c'est un blocage —
    // on compte les échecs consécutifs, on espace les tentatives, et au-delà de
    // MAX_UNKNOWN on ARRÊTE de frapper à la porte en l'écrivant noir sur blanc
    // dans le job (visible en base et dans l'app), au lieu de tourner en silence.
    if (state === "unknown") {
      const pf = job.platform_fields ?? {};
      const echecs = Number(pf.check_unknown_count ?? 0) + 1;
      const patchUnknown = {
        last_checked_at: new Date().toISOString(), // ⚠️ on tamponne : sans ça, le job repassait à CHAQUE cycle
        platform_fields: { ...pf, check_unknown_count: echecs },
      };

      if (echecs >= MAX_UNKNOWN_CHECKS) {
        patchUnknown.platform_fields.check_unresolved = true;
        // Horodatage de la BASCULE (pas de la dernière tentative) : c'est lui qui
        // permet à l'app de dire « invérifiable depuis 3 jours » et de te le
        // signaler. Posé une seule fois, jamais écrasé par les relectures.
        patchUnknown.platform_fields.check_unresolved_since =
          pf.check_unresolved_since ?? new Date().toISOString();
        patchUnknown.error =
          `Impossible de vérifier l'état de cette annonce ${job.platform} après ${echecs} tentatives ` +
          "(page de vérification anti-bot ou format inattendu). L'annonce N'A PAS été touchée et le job " +
          "reste 'published' : vérifier à la main sur la plateforme. Nouvelle tentative dans 24 h.";
        console.warn(
          `[background] ${job.platform} ${job.id} : ABANDON après ${echecs} lectures indéterminées — ` +
          "job marqué non vérifiable (aucune conclusion, aucune écriture), prochaine tentative dans 24 h"
        );
      } else {
        console.log(
          `[background] ${job.platform} ${job.id} : état indéterminé (${echecs}/${MAX_UNKNOWN_CHECKS}) — ` +
          "aucune conclusion, nouvelle tentative après temporisation"
        );
      }

      await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
        method: "PATCH",
        body: JSON.stringify(patchUnknown),
      }).catch((e) => console.warn("[background] PATCH unknown:", String(e?.message ?? e)));

      if (i < due.length - 1) await sleep(randInt(1500, 4000));
      continue;
    }

    const patch = { last_checked_at: new Date().toISOString() };

    // Lecture ENFIN aboutie : on efface les compteurs d'indétermination, sinon un
    // job guéri (bot-shield passé, onglet enfin disponible) resterait pénalisé
    // par sa temporisation de 24 h et son message « non vérifiable ».
    const pfCourant = job.platform_fields ?? {};
    if (pfCourant.check_unknown_count || pfCourant.check_unresolved) {
      const remis = { ...pfCourant };
      delete remis.check_unknown_count;
      delete remis.check_unresolved;
      delete remis.check_unresolved_since; // le bandeau de l'app disparaît de lui-même
      patch.platform_fields = remis;
      patch.error = null;
      console.log(`[background] ${job.platform} ${job.id} : lecture de nouveau possible → compteurs d'indétermination effacés`);
    }

    // ⚠️ RÈGLE ABSOLUE (décision produit 2026-07-12) : le poll N'ÉCRIT JAMAIS
    // de vente en base — sur AUCUNE plateforme, pas même Vinted dont la preuve
    // de vente est pourtant fiable. Raison : le prix réel peut différer du prix
    // affiché (offre acceptée, marchandage), et un vendeur à volume ne
    // repassera jamais corriger après coup — la marge resterait fausse pour
    // toujours, en silence. Un bandeau au bon moment coûte moins cher qu'une
    // comptabilité fausse.
    // Le poll ne fait donc qu'une chose : POSER UN DRAPEAU. Le seul chemin qui
    // écrit (vente, inventaire, marges, frères) est le clic « Oui, enregistrer
    // la vente » dans l'app.
    //
    // La preuve positive ne disparaît pas pour autant — elle change de rôle :
    //   sale_signal="sold"        → bandeau IMMÉDIAT et affirmatif (« Vendue sur
    //                               Vinted 🎉 »), sans attendre une disparition
    //                               ambiguë, avec le prix lu sur la page pré-rempli
    //   sale_signal="unavailable" → bandeau interrogatif (« Plus en ligne —
    //                               vendue ? »), prix de publication pré-rempli
    // FAUX POSITIF QUI SE RÉPARE (2026-07-12) : une annonce marquée hors ligne
    // peut REVENIR (modération Beebs enfin passée, incident temporaire de la
    // plateforme, lecture ratée…). Sans ce nettoyage, le drapeau restait à vie et
    // le bandeau « Vendue ? » mentait indéfiniment sur une annonce bel et bien en
    // ligne. Si on la revoit active, on efface le drapeau : le bandeau disparaît
    // tout seul. Le délai de grâce réduit ce cas, il ne l'élimine pas.
    if (state === "active") {
      // ⚠️ On repart de patch.platform_fields s'il existe déjà (remise à zéro des
      // compteurs d'indétermination juste au-dessus) — sinon on l'écraserait.
      const pf = patch.platform_fields ?? job.platform_fields ?? {};
      if (pf.unavailable_since || pf.unavailable_pending_since) {
        const cleaned = { ...pf };
        delete cleaned.unavailable_since;
        delete cleaned.sale_signal;
        delete cleaned.detected_price;
        delete cleaned.unavailable_pending_since;
        patch.platform_fields = cleaned;
        console.log(`[background] ${job.platform} ${job.id} : de nouveau EN LIGNE → drapeau levé, bandeau retiré (fausse alerte)`);
      }
    }

    if (state === "sold" || state === "unavailable") {
      const pf = patch.platform_fields ?? job.platform_fields ?? {}; // idem : ne pas écraser la remise à zéro

      // ── VINTED : un 404 n'est PAS une preuve de disparition (2026-08-09) ────
      // 5 faux bandeaux « plus en ligne » le même jour, deux mensonges distincts :
      //   1. JOB PÉRIMÉ. La republication supprime l'annonce X et en recrée une
      //      (id Y). Le job de publication PRÉCÉDENT du même article restait
      //      'published' sur X (cancelPublishAfterDelete ne fermait que les
      //      publish — corrigé) : X 404 pour toujours, mais c'est le JOB qui
      //      est obsolète, pas l'article. Avant tout drapeau, on confronte
      //      l'id de listing_url à inventaire.vinted_item_id (maintenu par la
      //      sync ET par le rattachement de republication) : s'ils divergent,
      //      le job est CLOS (cancelled, marqueur superseded_listing) — jamais
      //      de bandeau, jamais une vente.
      //   2. 404 TRANSITOIRE. Le jogging Disney : 404 le 07/08 au soir, absent
      //      du wardrobe le 08/08 15 h (disparu_le posé par la sync), puis de
      //      retour actif — annonce masquée ou incident Vinted. Un SEUL 404
      //      posait le drapeau. Désormais deux lectures « unavailable »
      //      CONSÉCUTIVES espacées d'un cycle (≥ 2 h) sont exigées : la 1re
      //      pose unavailable_pending_since (aucun bandeau), la 2e pose le
      //      drapeau ; un « active » entre les deux efface tout (bloc
      //      ci-dessus). "sold" reste immédiat : c'est une preuve POSITIVE lue
      //      sur une page vivante, pas une absence. (Leboncoin garde sa
      //      logique inverse — là-bas c'est le 200 qui ment, cf. LBC_CHECK_TIRS.)
      if (state === "unavailable" && job.platform === "vinted") {
        let idArticle = null;
        if (job.inventaire_id != null) {
          try {
            const rows = await restRequest(
              `inventaire?id=eq.${job.inventaire_id}&select=vinted_item_id`,
              session.access_token,
            );
            idArticle = rows?.[0]?.vinted_item_id != null ? String(rows[0].vinted_item_id) : null;
          } catch (e) {
            console.warn(`[background] vinted ${job.id} : lecture inventaire impossible (${e?.message ?? e}) — prudence, on traite comme id concordant`);
          }
        }
        const idJob = extractListingId(job.listing_url, "vinted");
        if (idArticle && idJob != null && idArticle !== String(idJob)) {
          const remis = { ...pf };
          delete remis.unavailable_since;
          delete remis.sale_signal;
          delete remis.detected_price;
          delete remis.unavailable_pending_since;
          remis.superseded_listing = true;
          patch.status = "cancelled";
          patch.platform_fields = remis;
          patch.error =
            `Annonce ${idJob} remplacée par une republication (l'article vit désormais sur l'annonce ${idArticle}) — ` +
            "job obsolète clos automatiquement, pas une vente.";
          console.log(`[background] vinted ${job.id} : listing_url pointe ${idJob} mais l'article est sur ${idArticle} → job périmé CLOS (aucun bandeau)`);
        } else if (!pf.unavailable_since) {
          if (!pf.unavailable_pending_since) {
            patch.platform_fields = { ...pf, unavailable_pending_since: new Date().toISOString() };
            console.log(`[background] vinted ${job.id} : 404/hors ligne (1re lecture) — AUCUN bandeau, confirmation exigée au prochain cycle`);
          } else {
            const confirme = { ...pf };
            delete confirme.unavailable_pending_since;
            patch.platform_fields = {
              ...confirme,
              unavailable_since: new Date().toISOString(),
              sale_signal: "unavailable",
            };
            console.log(`[background] vinted ${job.id} : hors ligne CONFIRMÉ (2e lecture espacée d'un cycle) → confirmation utilisateur`);
          }
        }
      } else if (!pf.unavailable_since) {
        patch.platform_fields = {
          ...pf,
          unavailable_since: new Date().toISOString(),
          sale_signal: state, // "sold" = preuve positive | "unavailable" = doute
          ...(state === "sold" && price ? { detected_price: price } : {}),
        };
        console.log(
          state === "sold"
            ? `[background] ${job.platform} ${job.id} : VENTE DÉTECTÉE (preuve positive)${price ? ` au prix affiché ${price} €` : ""} → confirmation utilisateur (aucune écriture)`
            : `[background] ${job.platform} ${job.id} : plus en ligne, AUCUNE preuve de vente → confirmation utilisateur`
        );
      }
    }

    await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch((e) => console.warn("[background] PATCH job:", String(e?.message ?? e)));

    if (i < due.length - 1) await sleep(randInt(1500, 4000));
  }
}

// ── Re-capture différée des listing_url manquants (2026-07-12) ─────────────────
// Vécu en LIVE réel : LBC et Beebs publient bien, mais l'annonce ne figure
// dans "Mes annonces" qu'après un délai de modération/indexation —
// l'aller-retour de captureListingUrl, fait dans la foulée du dépôt, revenait
// bredouille ("annonce introuvable dans Mes annonces") et le job restait
// published SANS listing_url, donc invisible de la détection de vente et du
// retrait ciblé. On re-tente ici, au cycle de poll suivant : UNE navigation
// par plateforme et par cycle (cadence humaine — "je vais voir si mon annonce
// est en ligne"), tous les jobs manquants de la plateforme sont cherchés sur
// la même page chargée. Fenêtre bornée à 48 h après le dépôt : au-delà, ce
// n'est plus un délai de modération, on arrête de frapper à la porte.
// ⚠️ COUVERTURE DES 4 PLATEFORMES (2026-07-13) — la re-capture différée est
// désormais le filet de TOUT LE MONDE, puisqu'un job est publié sans attendre
// son URL. État réel de chacune :
//   · leboncoin / beebs → l'URL n'existe QUE dans "Mes annonces" : pages ci-dessous.
//   · ebay             → même chose depuis qu'eBay publie pour de vrai : la page
//                        d'après-publication n'expose aucune URL /itm/ (job
//                        f89341ab). VÉRIFIÉ : le Hub vendeur porte le lien avec
//                        le titre exact. (En temps normal la sonde donne l'URL
//                        immédiatement ; ceci est le filet.)
//   · vinted           → PAS de page ici, et c'est un constat, pas un oubli :
//                        son URL vient de la réponse serveur (sonde) ou de la
//                        redirection, toutes deux immédiates et vérifiées. Le
//                        seul repli possible serait le profil du vendeur, dont
//                        l'URL dépend de son id — non relevé côté extension. Si
//                        un jour un job Vinted reste sans URL, c'est là qu'il
//                        faudra brancher /api/v2/users/current.
const LISTING_URL_RECOVERY_PAGES = {
  leboncoin: ["https://www.leboncoin.fr/compte/part/mes-annonces"],
  ebay: ["https://www.ebay.fr/sh/lst/active"],
  // Beebs : d'abord "Actuellement en ligne" (l'URL publique de l'annonce vit
  // là), puis "En cours de vérification" au cas où la carte y porte déjà le
  // lien. ⚠️ Rappel : le format d'URL produit Beebs reste NON OBSERVÉ
  // (LISTING_URL_PATTERNS.beebs est une supposition).
  beebs: [
    "https://www.beebs.app/fr/account/my-adverts",
    "https://www.beebs.app/fr/account/my-adverts/creating",
  ],
};
const LISTING_URL_RECOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// SONDE DE MODÉRATION LEBONCOIN (2026-08-11) — LEBONCOIN UNIQUEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Leboncoin interdit la vente des cosmétiques : l'annonce est acceptée au dépôt
// puis refusée par leur modération quelques minutes plus tard. Le job reste
// 'published' sans listing_url, l'app affiche « récupération du lien en cours »,
// et le cron de nuit ne le rattrape qu'à 48 h (~3 jours de délai réel mesuré).
//
// CE QUE LA SONDE PEUT OBSERVER — relevé LIVE le 11/08 sur un vrai compte :
// « Mes annonces » n'a que DEUX onglets, « En ligne (N) » et « Expirées (N) ».
// Aucun onglet ni badge « refusée ». Une annonce refusée n'y figure NULLE PART.
// La seule observation possible est donc une ABSENCE — exactement le type de
// preuve qui a déjà piégé ce projet (sonde Vinted, « path ≠ /lstng » eBay).
// Ce qui la rend défendable ICI : sur Leboncoin l'URL est captée à la
// redirection du dépôt, immédiatement. 55 jobs LBC aboutis, 55 URL. « Pas
// d'URL » n'y a JAMAIS voulu dire « indexation lente ».
//
// ⚠️ TROIS ISSUES, PAS DEUX. Un échec de chargement n'est pas une preuve
// d'absence : c'est tout l'enjeu, et c'est pour ça que la sonde exige une
// PREUVE POSITIVE que la page a bien été vue.
const LBC_MODERATION_MISSES_SEUIL = 3;
const LBC_MODERATION_DELAI_MIN_MS = 2 * 60 * 60 * 1000;

/**
 * Preuve POSITIVE que « Mes annonces » Leboncoin a bien été rendue, et qu'on y
 * voit la LISTE COMPLÈTE des annonces en ligne.
 *
 * @returns {Promise<{vue: boolean, motif: string, enLigne: number|null, visibles: number}>}
 *   vue:true ⇒ et seulement alors ⇒ une absence de titre vaut observation.
 */
async function lbcMesAnnoncesEtat(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (patternSource) => {
        // 1. On est bien SUR la page. Un DataDome, une redirection vers
        //    auth.leboncoin.fr ou une session expirée changent le chemin :
        //    le test d'URL les élimine sans rien deviner.
        const u = new URL(location.href);
        if (!/(^|\.)leboncoin\.fr$/.test(u.hostname)) return { vue: false, motif: `hote_${u.hostname}`, enLigne: null, visibles: 0 };
        if (!/^\/compte\/part\/mes-annonces\/?$/.test(u.pathname)) return { vue: false, motif: `chemin_${u.pathname}`, enLigne: null, visibles: 0 };
        // 2. La page a VRAIMENT rendu sa liste. Marqueur = l'onglet « En
        //    ligne (N) », présent même à 0 annonce (relevé live : « En ligne (4)
        //    · Expirées (0) »). Un squelette de chargement, une page d'erreur ou
        //    un challenge n'ont pas ce compteur.
        const texte = document.body?.innerText ?? "";
        const m = texte.match(/En\s+ligne\s*\(\s*(\d+)\s*\)/i);
        if (!m) return { vue: false, motif: "compteur_en_ligne_absent", enLigne: null, visibles: 0 };
        const enLigne = parseInt(m[1], 10);
        // 3. Annonces DISTINCTES réellement visibles sur cette page.
        const re = new RegExp(patternSource, "i");
        const visibles = new Set(
          Array.from(document.querySelectorAll("a[href]"))
            .map((a) => (a.href.match(re) || [])[0])
            .filter(Boolean)
        ).size;
        // 4. ⚠️ GARDE PAGINATION. Si le compte a plus d'annonces que la page
        //    n'en montre, l'annonce cherchée peut être en page 2 : son absence
        //    ICI ne prouve rien. On ne conclut que si toute la liste est sous
        //    les yeux. (Sur les comptes observés, 4 annonces sur une page.)
        if (visibles < enLigne) return { vue: false, motif: `liste_partielle_${visibles}_sur_${enLigne}`, enLigne, visibles };
        return { vue: true, motif: "ok", enLigne, visibles };
      },
      args: [LISTING_URL_PATTERNS.leboncoin.source],
    });
    return res?.result ?? { vue: false, motif: "script_sans_resultat", enLigne: null, visibles: 0 };
  } catch (e) {
    // Onglet mort, page non injectable : surtout PAS une absence.
    return { vue: false, motif: `script_ko_${String(e?.message ?? e).slice(0, 40)}`, enLigne: null, visibles: 0 };
  }
}

// Fusion + écriture du compteur. Read-modify-write sur platform_fields lu au
// début du balayage (quelques secondes) : personne d'autre n'écrit ce champ sur
// un job déjà publié, et un écrasement coûterait au pire un compteur remis à
// zéro — jamais un remboursement de trop (le serveur revérifie tout).
async function lbcPatchSonde(session, job, sonde) {
  const pf = { ...(job.platform_fields ?? {}), moderation_probe: sonde };
  await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
    method: "PATCH",
    body: JSON.stringify({ platform_fields: pf }),
  }).catch((e) => console.warn("[background] PATCH moderation_probe:", String(e?.message ?? e)));
  job.platform_fields = pf; // le job en mémoire reste cohérent pour la suite
}

/**
 * Le titre n'a pas été trouvé sur la page. Décide entre les deux issues qui
 * restent, et déclenche le remboursement anticipé au seuil.
 *
 * ISSUE 2/3 — page VUE + titre ABSENT      → compteur +1
 * ISSUE 3/3 — page non concluante          → compteur INCHANGÉ (ni +1 ni reset)
 *
 * Un chargement raté, un DataDome, une session expirée, une liste paginée : rien
 * de tout cela ne dit que l'annonce n'existe pas. Le compteur ne bouge pas, on
 * réessaiera au prochain cycle. C'est LE point de la sonde.
 */
async function lbcSondeModeration(session, job, etatPage) {
  const precedent = job.platform_fields?.moderation_probe ?? {};
  if (!etatPage.vue) {
    // On note quand même la dernière observation NON concluante : sans elle, un
    // compteur figé à 2 pendant trois jours serait indéchiffrable en debug.
    await lbcPatchSonde(session, job, {
      ...precedent,
      misses: precedent.misses ?? 0,
      last_inconclusive_at: new Date().toISOString(),
      last_inconclusive: etatPage.motif,
    });
    return;
  }

  const misses = (precedent.misses ?? 0) + 1;
  const repere = Date.parse(job.published_at ?? job.created_at ?? "");
  const ageMs = Number.isFinite(repere) ? Date.now() - repere : 0;
  // LES DEUX CONDITIONS, JAMAIS L'UNE OU L'AUTRE. Le compteur seul ne suffit pas
  // (trois cycles rapprochés ne font pas 2 h) ; la durée seule ne suffit pas
  // (un navigateur fermé 3 h n'a rien observé du tout).
  const atteint = misses >= LBC_MODERATION_MISSES_SEUIL && ageMs >= LBC_MODERATION_DELAI_MIN_MS;
  const dejaRembourse = Boolean(job.platform_fields?.refund_unconfirmed);

  await lbcPatchSonde(session, job, {
    ...precedent,
    misses,
    last_miss_at: new Date().toISOString(),
    en_ligne: etatPage.enLigne,
    visibles: etatPage.visibles,
  });

  console.log(
    `[background] sonde LBC job ${job.id} : ${misses}/${LBC_MODERATION_MISSES_SEUIL} passage(s) bredouille(s), ` +
    `${Math.round(ageMs / 60000)} min depuis la publication` +
    (dejaRembourse ? " — déjà remboursé, surveillance poursuivie" : atteint ? " — SEUIL ATTEINT" : "")
  );
  if (!atteint || dejaRembourse) return;

  // Remboursement ANTICIPÉ. Le job RESTE 'published' : c'est ce qui le maintient
  // dans le filtre de cette même fonction (status=eq.published & listing_url is
  // null) jusqu'à l'échéance 48 h. On rend la Pépite tôt sans cesser de
  // chercher — si l'annonce finit par apparaître, l'issue 1/3 la rattrape.
  // Le serveur revérifie TOUTES les conditions (cf. update-job-status) et la
  // RPC est idempotente : ni le cron de 48 h ni un second passage ne peuvent
  // rendre une deuxième Pépite.
  try {
    const res = await callEdgeFunction("update-job-status", session.access_token, {
      job_id: job.id,
      refund_unconfirmed: true,
    });
    console.log(`[background] sonde LBC job ${job.id} : remboursement anticipé — ${JSON.stringify(res)}`);
    // Marqueur local pour ne pas rappeler l'edge function au cycle suivant (le
    // serveur refuserait proprement, mais autant ne pas l'appeler pour rien).
    job.platform_fields = { ...(job.platform_fields ?? {}), refund_unconfirmed: { at: new Date().toISOString() } };
  } catch (e) {
    console.warn(`[background] sonde LBC job ${job.id} : remboursement anticipé impossible — ${String(e?.message ?? e)}`);
  }
}

async function recoverMissingListingUrls(session) {
  let jobs;
  try {
    jobs = await restRequest(
      "cross_post_jobs" +
        // published_at / platform_fields / reservation_id ajoutés le 2026-08-11
        // pour la sonde de modération Leboncoin (compteur de passages
        // bredouilles + repère des 2 h). Les autres plateformes ne les lisent
        // pas : leur comportement est strictement inchangé.
        "?select=id,platform,title,created_at,published_at,platform_fields,reservation_id" +
        "&status=eq.published&action=eq.publish&listing_url=is.null" +
        // eBay ajouté le 2026-07-20. Le filtre datait de d4a0c32 (2026-07-12),
        // quand SEULS leboncoin et beebs avaient une page de récupération. eBay
        // a été ajouté à LISTING_URL_RECOVERY_PAGES par 3d2566c — et ce filtre
        // n'a jamais été rouvert : oubli, pas décision (le commentaire de
        // LISTING_URL_RECOVERY_PAGES annonce explicitement « le filet de TOUT
        // LE MONDE » et détaille le cas eBay). Conséquence : un job eBay publié
        // sans listing_url n'était JAMAIS repêché, sa page de récupération
        // restant morte. Tout l'aval de cette fonction est générique
        // (LISTING_URL_RECOVERY_PAGES[platform], LISTING_URL_PATTERNS[platform],
        // findListingLinkInPage requireTitle:true) : rien d'autre à changer.
        // vinted reste HORS liste, et c'est un constat assumé, pas un oubli —
        // pas de page de récupération pour lui (cf. commentaire ci-dessus).
        "&platform=in.(leboncoin,beebs,ebay)&order=created_at.desc&limit=10",
      session.access_token
    );
  } catch (e) {
    console.error("[background] Lecture des published sans listing_url:", String(e?.message ?? e));
    return;
  }

  const now = Date.now();
  // Le titre est indispensable au repérage dans la liste (règle
  // findListingLinkInPage : jamais "le premier lien qui matche").
  const eligible = (jobs ?? []).filter(
    (j) => j.title && j.created_at && now - Date.parse(j.created_at) < LISTING_URL_RECOVERY_MAX_AGE_MS
  );
  if (!eligible.length) return;

  const byPlatform = new Map();
  for (const j of eligible) {
    if (!byPlatform.has(j.platform)) byPlatform.set(j.platform, []);
    byPlatform.get(j.platform).push(j);
  }

  for (const [platform, platformJobs] of byPlatform) {
    const pattern = LISTING_URL_PATTERNS[platform];
    console.log(
      `[background] listing_url manquant : ${platformJobs.length} job(s) ${platform} — passage par "Mes annonces"`
    );
    let remaining = [...platformJobs];
    for (const pageUrl of LISTING_URL_RECOVERY_PAGES[platform] ?? []) {
      if (!remaining.length) break;
      let tabId;
      try {
        // Onglet de travail persistant habituel — pas de restauration de page :
        // le prochain job le renaviguera, et un vendeur qui vérifie ses
        // annonces reste précisément sur cette liste.
        tabId = await getOrCreateWorkTab(platform, pageUrl);
      } catch (e) {
        console.warn(`[background] recover(${platform}) : onglet indisponible — ${String(e?.message ?? e)}`);
        break;
      }
      await sleep(randInt(1500, 3000)); // rendu de la liste
      // Sonde de modération : état de la page relevé UNE FOIS par visite, avant
      // de chercher les titres. Leboncoin uniquement (cf. bloc au-dessus).
      const etatPage = platform === "leboncoin" ? await lbcMesAnnoncesEtat(tabId) : null;
      if (etatPage) {
        console.log(
          `[background] sonde LBC « Mes annonces » : ${etatPage.vue ? "PAGE VUE" : "page non concluante"} ` +
          `(${etatPage.motif}) — en ligne ${etatPage.enLigne ?? "?"}, visibles ${etatPage.visibles}`
        );
      }
      const stillMissing = [];
      let diagPage = null;
      for (const job of remaining) {
        // requireTitle : on est sur une page de LISTE, et on y cherche PLUSIEURS
        // jobs à la fois — le repli « lien unique » y serait catastrophique
        // (il attribuerait la même URL à tous les jobs de la plateforme).
        const { url, diag } = await findListingLinkInPage(tabId, pattern.source, job.title, { requireTitle: true });
        if (url) {
          console.log(`[background] listing_url récupéré (${platform}, job ${job.id}) : ${url}`);
          // platform_listing_id accompagne l'URL (même règle que
          // update-job-status côté serveur) — beebs exclu : son format d'URL
          // n'a jamais été observé, un id extrait au hasard serait pire que
          // NULL.
          const listingId = platform === "beebs" ? null : extractListingId(url, platform);
          // ISSUE 1/3 — TITRE TROUVÉ. Le compteur de la sonde est remis à zéro
          // et l'épisode horodaté. L'annonce EXISTE : si un remboursement
          // anticipé avait eu lieu, elle redevient suivie pour la vente et le
          // retrait, et AUCUNE Pépite n'est redébitée — le job garde juste la
          // trace qu'il a été rendu gratuit. Le message de l'app disparaît tout
          // seul, il est conditionné à l'absence de listing_url.
          const sondeResolue = job.platform_fields?.moderation_probe
            ? { ...job.platform_fields.moderation_probe, misses: 0, resolved_at: new Date().toISOString() }
            : null;
          const pfResolu = sondeResolue
            ? { platform_fields: { ...(job.platform_fields ?? {}), moderation_probe: sondeResolue } }
            : {};
          await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
            method: "PATCH",
            body: JSON.stringify({ listing_url: url, ...(listingId ? { platform_listing_id: listingId } : {}), ...pfResolu }),
          }).catch((e) => console.warn("[background] PATCH listing_url:", String(e?.message ?? e)));
        } else {
          stillMissing.push(job);
          diagPage = diag;
          if (etatPage) await lbcSondeModeration(session, job, etatPage);
        }
      }
      // Échec sur cette page : le diagnostic NOMME la cause au lieu de laisser
      // deviner — « 0 lien conforme au pattern » = le pattern d'URL est faux
      // (cas suspecté pour Beebs, format jamais observé) ; « N liens conformes
      // mais aucun titre reconnu » = c'est le repérage par titre qui rate.
      // L'échantillon de chemins révèle le format d'URL réel de la plateforme.
      if (stillMissing.length && diagPage) {
        console.log(
          `[background] recover(${platform}) ${pageUrl} : ${diagPage.conformesAuPattern} lien(s) conforme(s) au pattern ` +
          `sur ${diagPage.ancres} ancre(s) — chemins vus : ${diagPage.chemins.join(" | ") || "(aucun)"}`
        );
      }
      remaining = stillMissing;
    }
    if (remaining.length) {
      console.log(
        `[background] listing_url toujours introuvable pour ${remaining.length} job(s) ${platform} ` +
        "(modération en cours ?) — nouvelle tentative au prochain cycle."
      );
    }
    await sleep(randInt(3000, 8000)); // pause entre plateformes, jamais en rafale
  }
}

// ── Onglet ACTIF (dans la fenêtre dédiée) le temps d'une action ────────────────
// Historique : Chrome ne calcule ni layout ni hydratation React pour un onglet
// jamais peint. Sur la page annonce Vinted (/items/<id>), un onglet caché donne
// des rects 0×0 et aucun handler React attaché — le clic Supprimer part dans le
// vide, la modale ne se monte jamais. La v1 de cette fonction traitait le
// symptôme au pire endroit possible : elle ACTIVAIT l'onglet dans la fenêtre de
// l'utilisateur et ramenait celle-ci au premier plan (windows.update
// focused:true), lui volant son écran à chaque publication eBay et à chaque
// suppression.
//
// v2 (2026-07-13) : les onglets de travail vivent désormais dans la FENÊTRE
// DÉDIÉE (cf. getOrCreateWorkWindow). « Activer » un onglet là-bas est sans
// aucun effet visible pour l'utilisateur — sa fenêtre garde le focus, son
// onglet reste affiché. On ne touche donc plus JAMAIS à `focused` : ni sur sa
// fenêtre, ni sur la nôtre (la ramener au premier plan serait exactement ce
// qu'on cherche à éviter).
//
// ⚠️ Une fenêtre minimisée reste non rendue : cette activation ne garantit plus
// la peinture, contrairement à la v1. C'est un compromis ASSUMÉ (contrainte
// produit : invisible > rapide). Les chemins qui en dépendaient ont leur filet :
//   · Vinted publication → n'en a jamais eu besoin (formulaires hydratés en
//     arrière-plan), et le prix se commite maintenant par appel direct des props
//     React (commitVintedPrice), sans rendu ni focus ;
//   · eBay → relectures + re-poses déjà en place, échec propre en needsUser ;
//   · suppressions → si le contrôle reste à 0×0, le job repart en needsUser au
//     lieu d'imposer une fenêtre à l'écran (voir deleteListing).
// Le jour où un chemin exige VRAIMENT la peinture, la voie propre est un rendu
// hors-champ de la fenêtre dédiée, jamais un focus volé.
async function paintTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return async () => {};
  if (tab.active) return async () => {};

  const workWindowId = await getOrCreateWorkWindow().catch(() => null);
  if (tab.windowId !== workWindowId) {
    // L'onglet n'est pas chez nous : on s'abstient. Aucune activation dans la
    // fenêtre de l'utilisateur, à aucun prix — c'est la règle produit.
    console.warn(
      `[background] Onglet ${tabId} hors de la fenêtre de travail : activation ANNULÉE ` +
      "(l'invisibilité prime ; le job échouera proprement si la page exige d'être rendue)"
    );
    return async () => {};
  }

  const [previous] = await chrome.tabs.query({ active: true, windowId: workWindowId }).catch(() => []);
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  await sleep(randInt(2500, 4000)); // laisser une chance au layout/hydratation
  console.log(`[background] Onglet ${tabId} activé DANS la fenêtre de travail (aucun impact utilisateur)`);

  return async () => {
    if (previous && previous.id !== tabId) {
      await chrome.tabs.update(previous.id, { active: true }).catch(() => {});
    }
  };
}

// ── Phase B : exécution d'un job de SUPPRESSION (action='delete') ──────────────
// Armé UNIQUEMENT par le bandeau semi-auto de l'app (jamais automatique).
// Cible par plateforme : la page où vit le contrôle de suppression —
//   vinted → la page de l'annonce elle-même ; leboncoin → Mes annonces ;
//   ebay → Hub vendeur (annonces en cours) ; beebs → Mes annonces
//   (/fr/account/my-adverts, relevé en session réelle 2026-07-11).
// Le content script (DELETE_LISTING) fait le reste, en DELETE_DRY_RUN par
// défaut : il LOCALISE le contrôle de suppression sans jamais le cliquer et
// remonte une trace détaillée (platform_fields.delete_dry_run_trace) qui sert
// de relevé de sélecteurs pour la bascule en live.
// ⚠️ MISE À JOUR 2026-07-22 — Leboncoin vise désormais l'ANNONCE, plus la liste.
// Mesuré en direct pendant la panne LBC du soir, même compte, deux chargements
// à la suite : /compte/part/mes-annonces rendait 0 carte (« Vous n'avez aucune
// annonce en ligne ») pendant que /ad/vetements/3237226181 servait l'annonce
// avec son panneau « Gestion de mon annonce » — Modifier · Supprimer · Mettre en
// pause. Les deux sont servis par des systèmes distincts : viser l'annonce fait
// donc survivre la suppression à une panne de l'index vendeur, qui est ce qui a
// tué le job 2aee959f (robe) en 'failed' sur « Annonce introuvable dans Mes
// annonces » alors que l'annonce était joignable.
// Le repli sur la liste reste indispensable pour les jobs SANS listing_url
// (removal_url_missing) : là, le ciblage par titre dans « Mes annonces » est le
// seul recours.
// ⚠️ Ne JAMAIS viser /compte/mes-annonces/suppression directement : cette page
// lit l'annonce à supprimer dans localStorage.selectedAdsForDeletion, écrit par
// le clic sur le lien. Relevé réel : sur la page de la robe, cette clé contenait
// encore la MONTRE d'une session précédente — y aller en direct aurait supprimé
// la mauvaise annonce.
const DELETE_TARGETS = {
  vinted: (job) => job.listing_url,
  leboncoin: (job) => job.listing_url || "https://www.leboncoin.fr/compte/part/mes-annonces",
  ebay: () => "https://www.ebay.fr/sh/lst/active",
  beebs: () => "https://www.beebs.app/fr/account/my-adverts",
};

// ── Clôture du publish après un retrait ciblé réussi (2026-07-19) ─────────────
// Le job publish d'origine reste 'published' en base après un delete réussi :
// checkPublishedListings aurait re-scanné son listing_url au cycle suivant,
// trouvé l'annonce disparue (normal — retrait VOLONTAIRE) et posé
// sale_signal="unavailable" → faux bandeau « Plus en ligne — vendue ? » dans
// l'app. On passe donc le(s) publish correspondant(s) en 'cancelled' — même
// statut et même sémantique que « Non, je l'ai retirée » (dismissUnavailable
// côté app) : un retrait n'est pas une vente, la vente vit dans la table
// ventes. Le marqueur platform_fields.removed_by_user distingue ce cas, dans
// l'historique, du 'cancelled' posé par le flux vente (frères annulés).
// Match par listing_url EXACT + platform : l'URL du delete vient du publish
// lui-même (jamais de repli — leçon listing_url croisée), et les doublons de
// republication (même URL, même annonce) sortent tous du scan d'un coup.
// Un éventuel drapeau unavailable_since/sale_signal déjà posé (course d'un
// cycle entre scan et suppression) est levé au passage. Best-effort : un échec
// ici ne doit JAMAIS faire échouer un delete abouti — au pire le bandeau
// interrogatif apparaît et « Non, je l'ai retirée » le ferme, comme avant.
// opts (É4, 2026-08-05) : la republication clôt les publish de l'ANCIENNE
// annonce dès la suppression (avant la fenêtre de recréation), avec son
// propre marqueur et un message vrai — les défauts gardent mot pour mot le
// comportement historique du retrait ciblé.
async function cancelPublishAfterDelete(accessToken, deleteJob, opts = {}) {
  try {
    let pubs = null;
    if (deleteJob.listing_url) {
      // ⚠️ ÉGALITÉ D'URL = PIÈGE (corrigé le 2026-08-05). Une même annonce a
      // DEUX URLs valides : avec slug (…/items/8428482383-short-de-bain-…)
      // et sans (…/items/8428482383). Le job publish porte la première, le job
      // republish la seconde — l'égalité stricte ne matchait donc RIEN, aucun
      // repli ne se déclenchait (le repli par titre exige listing_url vide) et
      // la fonction sortait en silence. Constaté le 05/08 : après une
      // republication réussie, l'ancien publish est resté 'published' sur une
      // annonce supprimée — checkPublishedListings l'aurait scannée, trouvée
      // morte, et aurait posé un faux « plus en ligne — vendue ? ».
      // On matche donc sur l'ID d'annonce, seule partie stable de l'URL.
      const idAnnonce = String(deleteJob.listing_url).match(/\/items\/(\d+)/)?.[1] ?? null;
      // ⚠️ republish INCLUS (2026-08-09, les 4 faux bandeaux d'Ornella). Une
      // annonce déjà republiée une fois vit sur un job action='republish'
      // 'published' ; quand la republication SUIVANTE (l'auto É6 dès le
      // lendemain) supprime cette annonce, le filtre action=eq.publish le
      // laissait passer : il restait 'published' sur un id mort, le poll le
      // 404ait et posait un faux « plus en ligne ». id=neq : ne jamais
      // matcher le job qui est en train d'orchestrer la suppression.
      pubs = await restRequest(
        "cross_post_jobs?select=id,platform_fields" +
          `&action=in.(publish,republish)&status=eq.published&platform=eq.${deleteJob.platform}` +
          `&id=neq.${deleteJob.id}` +
          (idAnnonce
            // like=*\/items\/<id>* : couvre les deux formes, et l'ancrage sur
            // « /items/<id> » évite qu'un id soit préfixe d'un autre.
            ? `&or=(listing_url.like.*/items/${idAnnonce},listing_url.like.*/items/${idAnnonce}-*,platform_listing_id.eq.${idAnnonce})`
            : `&listing_url=eq.${encodeURIComponent(deleteJob.listing_url)}`),
        accessToken
      );
    } else if (deleteJob.inventaire_id != null && String(deleteJob.title ?? "").trim()) {
      // ── Repli sans URL (2026-07-22) ─────────────────────────────────────
      // Une suppression peut désormais aboutir SANS listing_url (ciblage par
      // titre dans « Mes annonces », cf. processDeleteJob). Sans ce repli, le
      // job publish d'origine resterait 'published' : checkPublishedListings
      // le re-scannerait, trouverait l'annonce disparue — normal, on vient de
      // la retirer — et poserait sale_signal="unavailable" → faux bandeau
      // « Plus en ligne, vendue ? » sur un article déjà vendu.
      // On restreint à (plateforme + inventaire_id) côté serveur, puis on
      // compare le TITRE en JS : PostgREST demanderait un échappement délicat
      // pour des titres à virgules et emoji, et la liste est minuscule (les
      // jobs d'UN article). Comparaison sur titre normalisé (espaces/casse),
      // jamais approximative : le job delete a copié le titre du publish, ils
      // sont identiques à la normalisation près.
      const rows = await restRequest(
        "cross_post_jobs?select=id,platform_fields,title" +
          `&action=in.(publish,republish)&status=eq.published&platform=eq.${deleteJob.platform}` +
          `&id=neq.${deleteJob.id}` +
          `&inventaire_id=eq.${deleteJob.inventaire_id}`,
        accessToken
      );
      const cle = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      pubs = (rows ?? []).filter((r) => cle(r.title) === cle(deleteJob.title));
      console.log(
        `[background] cancelPublishAfterDelete : pas d'URL — repli par ` +
        `(${deleteJob.platform} + article ${deleteJob.inventaire_id} + titre) → ` +
        `${pubs.length}/${(rows ?? []).length} publish à clôturer`
      );
    }
    if (!pubs?.length) return;
    for (const pub of pubs) {
      const pf = { ...(pub.platform_fields ?? {}) };
      // ── ARCHIVER, PAS DÉTRUIRE (2026-08-10, cas Sam) ────────────────────────
      // `unavailable_pending_since` n'est pas un drapeau comme les trois autres :
      // c'est la SEULE trace que le poll avait DÉJÀ vu l'annonce hors ligne (1re
      // lecture 404 ; la 2e, un cycle plus tard, aurait posé unavailable_since et
      // donc le bandeau — cf. checkPublishedListings). L'effacer avec le reste
      // détruisait la preuve en silence : article 9598454286 disparu de Vinted
      // entre deux syncs, supprimé par l'utilisateur avant que la confirmation
      // n'arrive, et plus rien nulle part ne disait que le système était en
      // train de le voir partir. Aucune vente, aucun CA, aucune trace.
      // On le DÉPLACE donc sous une clé d'archive, horodatée du retrait.
      // ⚠️ CETTE CLÉ N'EST LUE PAR RIEN et ne doit jamais l'être par un chemin
      // qui produit un bandeau ou une écriture : c'est de la médecine légale,
      // pas un signal. Les trois autres clés continuent d'être effacées — elles,
      // ce sont bien des drapeaux, et un retrait volontaire n'est pas une vente.
      if (pf.unavailable_pending_since) {
        pf.unavailable_pending_at_delete = pf.unavailable_pending_since;
        pf.unavailable_pending_archived_at = new Date().toISOString();
      }
      delete pf.unavailable_since;
      delete pf.sale_signal;
      delete pf.detected_price;
      delete pf.unavailable_pending_since;
      if (opts.marqueur) pf[opts.marqueur] = true;
      else pf.removed_by_user = true;
      await restRequest(`cross_post_jobs?id=eq.${pub.id}`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled",
          platform_fields: pf,
          error: opts.erreur ?? "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente",
        }),
      });
      console.log(
        `[background] Publish ${pub.id} (${deleteJob.platform}) → cancelled : retrait volontaire, ` +
        "sorti de la détection de vente (aucun bandeau « vendue ? » à venir)"
      );
    }
  } catch (e) {
    console.warn("[background] cancelPublishAfterDelete:", String(e?.message ?? e));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// É2 REPUBLICATION VINTED (2026-08-05) — machine à étapes PERSISTÉE EN BASE.
// platform_fields.republish_step :
//   'a_capturer' → 'captured' → 'deleted' → 'recreated'
// ('a_capturer' est devenu la première étape avec la capture différée,
//  migration 20260805100000 : le clic pose le job, l'extension capture juste
//  avant d'agir.)
// Chaque transition est écrite AVANT le geste suivant : une interruption
// (réseau, Chrome quitté, service worker tué) reprend exactement où elle
// s'est arrêtée au prochain poll. Le job n'existe que si le RPC
// spend_coins_and_republish a validé une capture verdict='valide' fraîche —
// et on RE-vérifie la capture ici avant de recréer : double verrou.
//
// ⛔⛔ REPUBLISH_DRY_RUN — LE drapeau (décision Nico, É2) ⛔⛔
// true  = AUCUNE suppression réelle, AUCUNE création : le job vérifie ses
//         prérequis puis se clôt en 'dry_run_completed' (Pépite remboursée
//         par le trigger republish_refund_on_terminal — un dry run ne se
//         paie pas).
// false = suppression puis recréation réelles.
// LA BASCULE : éditer CETTE constante, rebuild (npm run build:extension),
// recharger l'unpacked, et committer le changement — il n'existe AUCUN
// autre chemin (pas de réglage UI, pas de chrome.storage, pas de valeur
// par job) : rien d'activable par accident. Même doctrine que
// DELETE_DRY_RUN en son temps (vinted.js, basculé le 12/07 sur décision).
//
// ⚠️ BASCULÉ À false le 2026-08-05 (décision Nico). Motif consigné : le dry
// run clôturait le job AVANT de toucher Vinted, donc il n'exerçait NI la
// suppression NI la recréation — or la recréation (résolution id→libellé) est
// le seul moment réellement à risque. Il ne restait qu'un test de facturation,
// déjà validé. Risque accepté sur un article du compte bêta.
// Ce qui protège désormais, et qui n'a pas bougé : capture verdict='valide'
// RELUE avant la suppression (+ borne de fraîcheur 24 h), échec avant
// suppression → terminal avec Pépite rendue et annonce intacte, échec après
// suppression → JAMAIS un failed sec (needs_user qui repart à la recréation),
// espacement 2 min entre gestes et 2-5 min entre suppression et recréation.
const REPUBLISH_DRY_RUN = false;

// Espacement humain entre deux GESTES de republication (suppression OU
// recréation), toutes annonces confondues : un humain qui republie 50
// annonces ne les enchaîne pas en rafale. Combiné au poll (~2 min) et à
// next_action_after (2-5 min entre suppression et recréation d'un même
// article), le rythme réel est de quelques gestes par tranche de 5 minutes.
const REPUBLISH_ESPACEMENT_MS = 2 * 60 * 1000;
let dernierGesteRepublishAt = 0;

// Prix de la recréation — UNE seule résolution, utilisée AUX DEUX BOUTS :
// éprouvée AVANT la suppression (l'annonce est encore en ligne, on peut encore
// renoncer sans rien perdre) et relue à la recréation. Les deux ne peuvent donc
// pas diverger.
// Ordre : le prix ajusté au clic s'il existe, sinon celui relevé sur l'annonce.
// ⚠️ TYPAGE : payload.prix vient de l'API Vinted et est une CHAÎNE ("5.0"),
// jamais un nombre — d'où le parse explicite. `Number(null)` vaut 0 et
// `Number(undefined)` vaut NaN : on ne se repose sur aucun des deux, chaque
// candidat est validé fini ET strictement positif avant d'être retenu.
function resoudrePrixRepublication(pf, payload) {
  for (const brut of [pf?.prix_republication, payload?.prix]) {
    if (brut === null || brut === undefined || brut === "") continue;
    const n = Number(String(brut).trim().replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// ── RECONNAISSANCE D'UNE ANNONCE RECRÉÉE (2026-08-05) ────────────────────────
// UNE SEULE fonction, appelée des DEUX côtés — la recréation (avant de recréer,
// pour ne pas doubler ce qui existe déjà) et la sync (avant de créer une ligne
// pour une annonce inconnue). Deux appelants, un seul critère : ils ne peuvent
// pas se contredire.
//
// Née de l'incident du 05/08 : la recréation avait ABOUTI, le canal a été coupé
// par la redirection de succès de Vinted, l'extension a conclu à l'échec, et la
// sync passée entre-temps a importé l'annonce recréée comme un article neuf —
// doublon dans le stock, ancien id resté sur la ligne d'origine.
//
// CRITÈRE, en trois conditions CUMULATIVES :
//   1. id INCONNU de l'inventaire — écarte d'emblée tout ce qui est déjà suivi ;
//   2. titre STRICTEMENT égal (normalisé) au titre capturé ;
//   3. photos POSTÉRIEURES à la suppression de l'ancienne annonce.
// La 3e est le vrai discriminant : nos photos sont RÉUPLOADÉES à la recréation,
// donc leur horodatage date la nouvelle annonce. Vérifié sur le cas réel —
// photos à 09:38:20Z pour une suppression à 09:05:54Z. L'API wardrobe ne
// fournit aucune date de mise en ligne, c'est le seul substitut et il tient.
//
// ⛔ TITRE + PRIX NE SUFFISENT PAS, et c'est pour ça qu'on ne s'en contente
// pas : un revendeur a couramment deux articles identiques en ligne. Sans les
// conditions 1 et 3, on rattacherait le mauvais — un filet trop lâche est PIRE
// que pas de filet, il déplace la perte au lieu de l'éviter.
// ⛔ PLUSIEURS CANDIDATS ⇒ ON N'ATTACHE RIEN. L'abstention est un résultat
// légitime, pas un échec : mieux vaut laisser l'utilisateur trancher qu'un
// rattachement au hasard, irréversible côté inventaire.
function reconnaitreAnnonceRecreee(articles, { titre, deletedAt, idsConnus }) {
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const cible = norm(titre);
  if (!cible) return { item: null, raison: "titre de référence vide" };
  const seuil = Date.parse(deletedAt ?? "");
  if (!Number.isFinite(seuil)) return { item: null, raison: "date de suppression illisible" };
  const connus = idsConnus instanceof Set ? idsConnus : new Set(idsConnus ?? []);
  const candidats = (articles ?? []).filter((a) => {
    if (!a?.vinted_item_id || connus.has(String(a.vinted_item_id))) return false;
    if (norm(a.titre) !== cible) return false;
    const ts = Number(a.photo_ts);
    return Number.isFinite(ts) && ts * 1000 > seuil;
  });
  if (candidats.length === 1) return { item: candidats[0], raison: null };
  if (!candidats.length) return { item: null, raison: "aucune annonce du dressing ne correspond" };
  return { item: null, raison: `${candidats.length} annonces correspondent — abstention volontaire` };
}

// Clôt un job republish en SUCCÈS sur une annonce déjà en ligne (reconnue par
// la sonde ou par le dressing) : rattache le nouvel id à l'inventaire puis
// écrit le job. Même séquence que la fin de recréation nominale — l'inventaire
// AVANT le job, pour qu'un échec d'écriture laisse un job encore repérable.
async function cloreRepublishSurAnnonceExistante(accessToken, job, pf, nouvelId, url, motif) {
  const ancienId = pf.vinted_item_id ?? null;
  pf.republish_step = "recreated";
  pf.recreated_at = new Date().toISOString();
  if (ancienId) pf.old_vinted_item_id = ancienId;
  pf.new_vinted_item_id = String(nouvelId);
  pf.reconciliation = motif; // trace : ce succès n'a PAS été observé en direct
  delete pf.next_action_after;
  delete pf.recaptures_perimees;
  if (job.inventaire_id != null) {
    await restRequest(`inventaire?id=eq.${job.inventaire_id}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        vinted_item_id: String(nouvelId),
        disparu_le: null,
        listed_at_guess: new Date().toISOString(),
      }),
    }).catch((e) => console.error("[republish] rattachement inventaire échoué:", e?.message ?? e));
  }
  await updateJobStatus(accessToken, job.id, "published", {
    platform_fields: pf, error: null, listing_url: url,
  });
  await recordRecentResult(job, "published").catch(() => {});
  console.log(`[republish] job ${job.id} clos en succès par réconciliation (${motif}) → ${url}`);
}

async function processRepublishJob(job, accessToken) {
  const pf = { ...(job.platform_fields ?? {}) };
  // Défaut = 'a_capturer', PREMIÈRE étape de la machine (corrigé le 2026-08-05,
  // il était resté à 'captured', l'ancienne première étape d'avant la migration
  // 20260805100000). Un job sans étape lisible tombait donc directement dans la
  // branche SUPPRESSION. Rien n'a jamais été supprimé à tort — la relecture de
  // capture (capture_id absent → capMeta vide → needs_user) l'arrêtait avant le
  // moindre geste — mais faire reposer ça sur un filet plutôt que sur un défaut
  // juste n'a plus lieu d'être maintenant que le dry run est levé. Le bon défaut
  // est celui qui ne touche à rien : on (re)capture.
  const step = pf.republish_step ?? "a_capturer";
  console.log(`[background] Job ${job.id} → vinted (REPUBLISH, étape ${step}${REPUBLISH_DRY_RUN ? ", DRY RUN" : ""})`);

  if (job.platform !== "vinted") {
    const msg = `Republication non supportée sur ${job.platform} (Vinted seulement).`;
    await updateJobStatus(accessToken, job.id, "failed", { error: msg });
    return { status: "failed", error: msg };
  }

  // Espacement entre gestes + attente programmée suppression→recréation.
  // 'skipped' laisse le job en pending : le prochain poll le reprendra.
  if (Date.now() - dernierGesteRepublishAt < REPUBLISH_ESPACEMENT_MS) {
    return { status: "skipped", error: "espacement entre gestes de republication" };
  }
  if (pf.next_action_after && Date.now() < Date.parse(pf.next_action_after)) {
    return { status: "skipped", error: "attente humanisée avant recréation" };
  }

  // ── Étape 0 : CAPTURE (2026-08-05) ─────────────────────────────────────────
  // Le clic ne capture plus rien : il pose un job 'a_capturer'. On capture ICI,
  // quelques secondes avant d'agir, ce qui rend la republication commandable
  // depuis un téléphone SANS affaiblir quoi que ce soit — au contraire, la
  // capture ne peut plus être périmée au moment de supprimer.
  // On ne s'enchaîne PAS sur la suppression dans le même passage : le job
  // repasse 'pending' en étape 'captured' et le poll suivant supprimera. C'est
  // ce qui fait respecter l'espacement entre gestes sans cas particulier, et
  // ça laisse la borne de fraîcheur de 24 h vérifier une capture de 2 minutes.
  if (step === "a_capturer") {
    const userId = decodeJwtSub(accessToken);
    if (!userId) {
      const msg = "Session illisible — rien n'a été touché, ton annonce est intacte.";
      await updateJobStatus(accessToken, job.id, "failed", { error: msg });
      return { status: "failed", error: msg };
    }
    const cap = await capturerEtPersisterDepuisExtension({
      vintedItemId: pf.vinted_item_id,
      inventaireId: job.inventaire_id ?? null,
      prixRepublication: pf.prix_republication ?? null,
      userId, accessToken,
    });

    // ⚠️ 'failed' et NON 'needs_user' (arbitrage Nico) : rien n'a été touché,
    // l'annonce est intacte, il n'y a RIEN à reprendre — et seul un statut
    // terminal déclenche republish_refund_on_terminal. Un job laissé en
    // needs_user garderait la Pépite d'un service jamais rendu, ce que
    // l'article 5 des CGV interdit.
    if (!cap.success) {
      const msg = `Republication annulée avant toute suppression : ${cap.error}. Ton annonce est intacte, la Pépite est rendue.`;
      await updateJobStatus(accessToken, job.id, "failed", { platform_fields: pf, error: msg });
      return { status: "failed", error: msg };
    }
    if (cap.verdict !== "valide") {
      const detail = (cap.champs_manquants ?? []).slice(0, 3).join(" ; ") || "champs manquants";
      const msg = `Capture incomplète (${detail}) — republication annulée AVANT toute suppression. Ton annonce est intacte, la Pépite est rendue.`;
      await updateJobStatus(accessToken, job.id, "failed", { platform_fields: pf, error: msg });
      return { status: "failed", error: msg };
    }

    pf.capture_id = cap.capture_id;
    pf.republish_step = "captured";
    // Le titre du job reste celui de l'inventaire, posé par la RPC : c'est de
    // l'affichage (popup, cartes), et update-job-status a un contrat de champs
    // qui lui est propre — on ne lui passe pas un `title` non prévu pour du
    // cosmétique. Le titre qui compte pour recréer l'annonce est celui de la
    // CAPTURE, en base, qui est bien le titre réel relevé sur Vinted.
    await updateJobStatus(accessToken, job.id, "pending", { platform_fields: pf, error: null });
    console.log(`[background] Job ${job.id} → capture ${cap.capture_id} valide, suppression au prochain passage`);
    return { status: "skipped", error: "capture faite — suppression au prochain passage" };
  }

  // ── Étape 1 : SUPPRESSION ──────────────────────────────────────────────────
  if (step === "captured") {
    if (REPUBLISH_DRY_RUN) {
      // Rien n'est touché ; le trigger serveur rembourse la Pépite.
      pf.republish_dry_run = {
        at: new Date().toISOString(),
        note: "simulation : prérequis vérifiés, aucune suppression, aucune création",
      };
      await updateJobStatus(accessToken, job.id, "dry_run_completed", { platform_fields: pf, error: null });
      return { status: "dry_run_completed" };
    }
    if (!job.listing_url) {
      const msg = "Job republish sans listing_url : rien n'a été touché.";
      await updateJobStatus(accessToken, job.id, "failed", { error: msg });
      return { status: "failed", error: msg };
    }

    // ── INVARIANT « UNE SEULE ANNONCE HORS LIGNE À LA FOIS » (2026-08-07) ───
    // Lot réel de 8 (seandemet, 18h23) : 7 suppressions enchaînées AVANT la
    // première recréation — 7 annonces d'un coup hors ligne, la plus ancienne
    // 18 minutes. Mécanique : l'espacement global est réarmé par CHAQUE
    // geste, une recréation pas encore due est 'skipped', et une suppression
    // n'a AUCUNE contrainte de temps propre — les suppressions gagnaient
    // toujours, la machine vidait la file phase par phase au lieu d'article
    // par article.
    // La garde : tant qu'il existe pour CE compte un job republish à l'étape
    // 'deleted' dont la recréation est EN ROUTE (pending/processing), AUCUNE
    // nouvelle suppression ne part. Échec FERMÉ : lecture impossible → on ne
    // supprime PAS (mieux vaut un tour de poll perdu qu'une deuxième annonce
    // hors ligne sans certitude). Avec le tri du poll (recréations dues
    // d'abord, plus ancienne suppression en tête), le flux redevient :
    // capture → suppression → attente → recréation d'UN article, puis le
    // suivant.
    //
    // ⚠️ needs_user ET failed RETIRÉS DU FILTRE (2026-08-09, file d'Ornella).
    // Ils y étaient au motif qu'une annonce hors ligne « attend un geste ».
    // Le résultat réel : son job 146b0648 bloqué le 08/08 à 18:11 a GELÉ ses
    // 15 republications suivantes pendant 21 heures — aucune n'a même été
    // tentée (aucun processing_since), 5 Pépites débitées pour rien, et rien
    // dans l'app ne disait que le compte entier était à l'arrêt.
    // La raison de fond : l'invariant existe pour empêcher la file de se
    // vider PHASE PAR PHASE (7 suppressions avant la 1re recréation, lot
    // seandemet du 07/08). Un job en needs_user ne va PAS se recréer tout
    // seul — il ne protège donc plus rien, il paralyse. Un job bloqué reste
    // signalé par la pastille rouge « Hors ligne » et sa remontée en tête de
    // liste ; il ne prend plus le compte en otage.
    try {
      const horsLigne = await restRequest(
        `cross_post_jobs?user_id=eq.${decodeJwtSub(accessToken)}&action=eq.republish` +
        `&id=neq.${job.id}&status=in.(pending,processing)` +
        `&platform_fields->>republish_step=eq.deleted&select=id&limit=1`,
        accessToken, { headers: { Prefer: "return=representation" } },
      );
      if (Array.isArray(horsLigne) && horsLigne.length) {
        console.log(`[republish] job ${job.id} : suppression reportée — une annonce du compte est déjà hors ligne (job ${horsLigne[0].id}), sa recréation passe d'abord`);
        return { status: "skipped", error: "une annonce est déjà hors ligne — sa recréation passe d'abord" };
      }
    } catch (e) {
      console.warn(`[republish] job ${job.id} : invariant hors-ligne invérifiable (${e?.message ?? e}) — suppression reportée par prudence`);
      return { status: "skipped", error: "invariant hors-ligne invérifiable — suppression reportée" };
    }

    try {
      // ── Borne de fraîcheur À L'EXÉCUTION (point 3 validé, 2026-08-05) ────
      // C'est ICI que la péremption compte : un job qui a dormi (Chrome
      // fermé) supprimerait sur une photo périmée de l'annonce — prix ou
      // description modifiés entre-temps chez Vinted. Capture > 24 h au
      // moment d'AGIR → needs_user AVANT toute suppression, avec la vraie
      // cause et la vraie solution (Chrome ouvert peu après le clic), pas un
      // « relance » sec.
      // `prix` et `titre` sont tirés du payload DÈS ICI : ce sont les deux
      // champs que la recréation EXIGE et que le verdict ne prouve pas (lui ne
      // couvre que les libellés, la description et les photos). Sélection
      // ciblée en JSON plutôt que le payload entier : celui-ci embarque le
      // natif complet et les URLs de photos, inutiles à cette vérification.
      const capRows = await restRequest(
        `vinted_republish_captures?id=eq.${Number(pf.capture_id)}` +
        `&select=verdict,captured_at,prix:payload->prix,titre:payload->titre`,
        accessToken,
      );
      const capMeta = capRows?.[0];
      if (!capMeta || capMeta.verdict !== "valide") {
        await updateJobStatus(accessToken, job.id, "needs_user", {
          platform_fields: pf,
          error: "Capture introuvable ou invalide — rien n'a été touché, ton annonce est intacte. Relance la republication depuis l'app.",
        });
        return { status: "needsUser", error: "capture invalide avant suppression" };
      }

      // ── RÈGLE D'OR, ÉPROUVÉE DU BON CÔTÉ (2026-08-05) ────────────────────
      // « On ne supprime jamais tant que tout ce qu'il faut pour recréer n'est
      // pas écrit en base. » Le 05/08, tout ÉTAIT en base — mais le prix était
      // lu par un chemin faux, et personne ne l'avait éprouvé avant de
      // supprimer : l'annonce est partie, la recréation a échoué sur un
      // « NaN € », et l'article est resté hors ligne (job 9bd4839e).
      // Le verdict 'valide' ne prouve QUE les libellés, la description et les
      // photos. Les deux champs que la recréation exige en plus — le PRIX et le
      // TITRE — n'étaient contrôlés nulle part. On les résout donc ICI, avec
      // EXACTEMENT la fonction qu'utilisera la recréation, pendant que
      // l'annonce est encore en ligne et qu'un refus ne coûte rien.
      // ⛔ Tout nouveau champ exigé par la recréation doit être ajouté à cette
      // vérification, pas seulement lu plus bas.
      const prixPrevu = resoudrePrixRepublication(pf, { prix: capMeta.prix });
      const titrePrevu = String(capMeta.titre ?? job.title ?? "").trim();
      if (prixPrevu === null || !titrePrevu) {
        const manque = [prixPrevu === null ? "le prix" : null, !titrePrevu ? "le titre" : null].filter(Boolean).join(" et ");
        await updateJobStatus(accessToken, job.id, "needs_user", {
          platform_fields: pf,
          error: `Republication arrêtée AVANT toute suppression : ${manque} de la nouvelle annonce n'a pas pu être déterminé. ` +
                 "Ton annonce est intacte, elle est toujours en ligne. Relance la republication depuis l'app.",
        });
        return { status: "needsUser", error: `recréation impossible (${manque}) — aucune suppression` };
      }
      // Figé sur le job : la recréation republiera CE prix, celui qu'on vient
      // de valider, et non une seconde résolution qui pourrait diverger.
      pf.prix_recreation = prixPrevu;

      if (Date.parse(capMeta.captured_at) < Date.now() - 24 * 3600 * 1000) {
        // Compteur de péremption (validé par Nico) : détecte le cycle
        // « dort → périmée → relance → dort ». Il survit aux relances (la
        // relance d'É5 CONSERVE platform_fields) et n'est remis à zéro qu'à
        // une republication ABOUTIE — sinon l'utilisateur traînerait son
        // diagnostic pour toujours.
        const peremptions = (Number(pf.recaptures_perimees) || 0) + 1;
        pf.recaptures_perimees = peremptions;
        const message = peremptions >= 2
          ? "Deux tentatives ont expiré : ton Chrome s'ouvre trop longtemps après tes clics. " +
            "Republie cet article quand tu es DEVANT ton ordinateur — le clic, puis Chrome ouvert une dizaine de minutes, et c'est réglé. " +
            "Rien n'a été touché, ton annonce est intacte."
          : "Republication en attente : ta capture date de plus de 24 h et l'annonce a pu changer sur Vinted entre-temps — rien n'a été touché, ton annonce est intacte. " +
            "La republication a besoin que Chrome reste ouvert peu après ton clic : relance-la depuis l'app à un moment où ton ordinateur reste allumé la dizaine de minutes qui suit.";
        await updateJobStatus(accessToken, job.id, "needs_user", {
          platform_fields: pf,
          error: message,
        });
        return { status: "needsUser", error: `capture périmée (>24 h) à l'exécution — occurrence ${peremptions}` };
      }

      pf.processing_since = new Date().toISOString();
      await updateJobStatus(accessToken, job.id, "processing", { platform_fields: pf });
      const tabId = await getOrCreateWorkTab("vinted", job.listing_url);
      const restore = await paintTab(tabId);
      let result;
      try {
        result = await sendMessageToTab(tabId, { type: "DELETE_LISTING", job });
      } finally {
        await restore();
      }
      dernierGesteRepublishAt = Date.now();
      if (!result?.success) {
        // « Introuvable » peut vouloir dire « déjà supprimée » (leçon delete) :
        // l'état réel de l'annonce tranche avant toute conclusion.
        const { state } = await checkListingState(job.listing_url, "vinted").catch(() => ({ state: "unknown" }));
        if (state !== "unavailable" && state !== "sold") {
          // RIEN n'a été supprimé (deleteListing ne conclut jamais sans preuve) :
          // needs_user honnête, l'annonce d'origine est intacte.
          await updateJobStatus(accessToken, job.id, "needs_user", {
            platform_fields: pf,
            error: `Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Motif : ${result?.error ?? "inconnu"}. Corrige puis relance depuis l'app.`,
          });
          return { status: "needsUser", error: result?.error };
        }
      }
      // Supprimée (par nous, ou déjà absente). ÉTAPE ÉCRITE EN BASE avant tout
      // autre geste + attente humanisée avant la recréation (2 à 5 min).
      pf.republish_step = "deleted";
      pf.deleted_at = new Date().toISOString();
      pf.next_action_after = new Date(Date.now() + 120_000 + Math.floor(Math.random() * 180_000)).toISOString();
      await updateJobStatus(accessToken, job.id, "pending", { platform_fields: pf, error: null });
      // É4 : les publish de l'ANCIENNE annonce sont clos MAINTENANT — pas à la
      // recréation. Entre suppression et recréation, le veilleur quotidien
      // scannerait sinon l'ancienne URL, la trouverait morte, et poserait le
      // faux « plus en ligne — vendue ? » (classe de bug fermée par
      // cancelPublishAfterDelete). Best-effort, comme pour le retrait ciblé.
      await cancelPublishAfterDelete(accessToken, job, {
        marqueur: "republished_pending",
        erreur: "Annonce en cours de republication (supprimée puis recréée pour remonter dans le fil) — pas une vente",
      });
      return { status: "retry", error: "annonce supprimée — recréation à la prochaine passe" };
    } catch (e) {
      // Doute (canal coupé pendant la suppression ?) → needs_user, jamais un
      // silence : l'étape en base dit encore 'captured', la reprise re-sondera
      // l'état réel de l'annonce avant d'agir.
      await updateJobStatus(accessToken, job.id, "needs_user", {
        platform_fields: pf,
        error: `Republication interrompue pendant la suppression (${String(e?.message ?? e)}). Relance depuis l'app : l'état réel de l'annonce sera re-vérifié avant tout geste.`,
      }).catch(() => {});
      return { status: "needsUser", error: String(e?.message ?? e) };
    }
  }

  // ── Étape 2 : RECRÉATION ───────────────────────────────────────────────────
  // PAS de borne d'âge sur la capture ici, À DESSEIN (décision Nico, 04/08).
  // La borne 24 h de l'étape 'captured' protège la SUPPRESSION : elle empêche
  // d'effacer une annonce encore en ligne sur des données périmées (prix ou
  // description modifiés chez Vinted depuis la capture). Après la suppression,
  // ce risque n'existe plus — il n'y a plus d'annonce dont la capture pourrait
  // diverger. La capture n'est plus la photo d'un original : elle EST
  // l'original, la seule copie restante du titre, de la description, du prix,
  // des photos re-hébergées et des libellés résolus.
  // Refuser de recréer parce qu'elle est « vieille » laisserait l'utilisateur
  // sans annonce ET sans contenu, alors que nous détenons son unique
  // exemplaire : le pire résultat possible. On recrée donc quel que soit
  // l'âge, tant que verdict='valide'.
  // Les photos ne peuvent pas avoir été purgées entre-temps :
  // republish_captures_purgeables (migration 20260805060000) exclut de façon
  // ABSOLUE toute capture dont un republish n'est pas terminal — et une étape
  // 'deleted' interrompue vit précisément en needs_user.
  // ⛔ Ne pas « corriger » cette absence en ajoutant une borne : ce n'est pas
  // un oubli.
  if (step === "deleted") {
    try {
      // Double verrou : la capture est RELUE et revalidée — jamais de
      // recréation sur parole. (Le RPC l'a déjà exigée à la création du job.)
      const rows = await restRequest(
        `vinted_republish_captures?id=eq.${Number(pf.capture_id)}&select=verdict,payload,libelles,photos_urls`,
        accessToken,
      );
      const cap = rows?.[0];
      if (!cap || cap.verdict !== "valide") {
        await updateJobStatus(accessToken, job.id, "needs_user", {
          platform_fields: pf,
          error: "Annonce supprimée sur Vinted, capture introuvable ou invalide pour la recréation — tes données restent en base, contacte le support si ça persiste.",
        });
        return { status: "needsUser", error: "capture invalide à la recréation" };
      }
      // Prix : celui figé avant la suppression s'il est là, sinon re-résolu par
      // la MÊME fonction. Dernier filet — un prix non résoluble ici ne doit
      // JAMAIS partir vers le formulaire : on s'arrête en needs_user plutôt que
      // d'écrire « NaN € » dans le champ (l'échec du 05/08).
      const prixRecreation = resoudrePrixRepublication(
        { prix_republication: pf.prix_recreation ?? pf.prix_republication },
        cap.payload,
      );
      if (prixRecreation === null) {
        await updateJobStatus(accessToken, job.id, "needs_user", {
          platform_fields: pf,
          error: "L'annonce d'origine a été supprimée et le prix de la nouvelle annonce n'a pas pu être déterminé — " +
                 "rien n'est perdu, photos et fiche sont au chaud. Relance depuis l'app.",
        });
        return { status: "needsUser", error: "prix de recréation irrésoluble" };
      }
      pf.processing_since = new Date().toISOString();
      await updateJobStatus(accessToken, job.id, "processing", { platform_fields: pf });

      // Job « comme un publish » : le handler éprouvé fait TOUT le travail —
      // photos = NOS URLs re-hébergées, champs = libellés résolus à la capture.
      const jobLike = {
        id: job.id,
        platform: "vinted",
        action: "publish",
        title: cap.payload?.titre ?? job.title ?? "",
        description: cap.payload?.description ?? "",
        price: prixRecreation,
        photo_option: "original",
        photos: (cap.photos_urls ?? []).map((url, i) => ({ type: i === 0 ? "original" : `photo_${i}`, url })),
        inventaire_id: job.inventaire_id ?? null,
        platform_fields: {
          categoryPath: cap.libelles?.categoryPath ?? null,
          etat: cap.libelles?.etat ?? null,
          taille: cap.libelles?.taille ?? null,
          marque: cap.libelles?.marque ?? null,
          colors: cap.libelles?.couleurs ?? null,
          packageSize: cap.libelles?.colis ?? null,
          // ⚠️ L'ANNONCE D'ORIGINE N'EXISTE PLUS (2026-08-09). Ce drapeau dit
          // au handler qu'il remplit un formulaire de RECRÉATION : à partir
          // d'ici, plus AUCUNE garde n'a le droit de refuser de soumettre.
          // Un refus de soumettre laisse l'utilisateur sans annonce ET sans
          // rien à récupérer ; un refus de Vinted, lui, se retente sur un
          // formulaire encore ouvert. Entre les deux, le choix n'est pas
          // discutable. Voir ensurePhotosLanded (vinted.js).
          republish_recreation: true,
        },
      };

      // Même PRÉPARATION que la publication normale, pas seulement le même
      // remplisseur : processJob fait passer TOUT job par sanitizeJob avant de
      // l'envoyer (sa 1re ligne). Les emoji sortent du titre, sinon Vinted
      // répond 400 « le titre contient trop de symboles d'affilée » —
      // déclenché par UN SEUL symbole (⌚ du Casio, 19/07). Le titre de la
      // recréation vient de la CAPTURE (cap.payload.titre), qui n'a jamais vu
      // ce nettoyage : il partait brut. Une SEULE variable en aval, pour
      // qu'aucun rapprochement ne compare deux titres différents.
      const jobRecreation = sanitizeJob(jobLike);

      const handler = PLATFORM_HANDLERS.vinted;
      const listingUrl = typeof handler.newListingUrl === "function" ? handler.newListingUrl(jobRecreation) : handler.newListingUrl;

      // ── VOLET (b) : l'annonce existe-t-elle DÉJÀ ? ────────────────────────
      // Avant de recréer, on regarde le dressing. Sans ça, chaque reprise est
      // un pari : le 05/08, la recréation avait abouti et la reprise aurait
      // créé un doublon. Échec de lecture = on recrée comme avant (le filet ne
      // doit jamais empêcher le travail), abstention = idem.
      //
      // ⛔ CE VOLET NE S'EXÉCUTE PLUS SUR LA PAGE DE DÉPÔT (2026-08-05) ⛔
      // Il y tournait, ENTRE l'ouverture de /items/new et FILL_LISTING, et
      // c'était la SEULE différence entre ce chemin et la publication normale,
      // qui remplit le même formulaire avec le même remplisseur et réussit :
      // là-bas, rien ne s'intercale entre la page fraîchement chargée et
      // l'envoi du job (cf. processJob, getOrCreateWorkTab → clearProbeCaptures
      // → installNetworkProbe → FILL_LISTING, sans un await de plus).
      // Ici s'intercalaient DEUX allers-retours au content script et un appel
      // REST Supabase — un délai non borné pendant lequel le formulaire de
      // dépôt vieillissait, plus un GET /api/v2/wardrobe/…?per_page=96 tiré
      // DEPUIS la page de dépôt (le profil de trafic que le bandeau de
      // lirePageDressing demande précisément d'éviter). Symptôme : le clic sur
      // #category n'ouvrait plus le panneau (job 24a28fcb, 05/08 19:03).
      // La vérification se fait donc sur l'onglet de travail TEL QU'IL EST —
      // aucune navigation, donc aucune page de dépôt à abîmer. Ce sont de purs
      // appels d'API : ils marchent depuis n'importe quelle page vinted.fr.
      // ⚠️ L'onglet de travail rendu ici n'est PAS forcément scriptable : la
      // règle de navigateWorkTab est de le DÉCHARGER (chrome.tabs.discard)
      // quand il est inactif. Un onglet déchargé n'a plus de content script —
      // sendMessageToTab répond « Receiving end does not exist » et RELANCE
      // pendant 20 s (1 essai/seconde). C'est la rafale de « Content script
      // pas encore prêt sur l'onglet … » relevée en console le 05/08 : vingt
      // lignes, vingt secondes perdues à chaque passage, pour une
      // vérification best-effort. On regarde donc l'état réel de l'onglet
      // AVANT de lui parler, et on S'ABSTIENT s'il ne peut pas répondre —
      // sans ouvrir ni naviguer quoi que ce soit pour lui : ce serait un
      // chargement de page de plus à chaque recréation, pour un filet
      // best-effort. Le filet d'APRÈS-remplissage (ceinture dressing, plus
      // bas) couvre de toute façon le cas qui compte, celui du doublon.
      let tabVerif = await findExistingWorkTabId("vinted");
      if (tabVerif != null) {
        const t = await chrome.tabs.get(tabVerif).catch(() => null);
        const scriptable = t && !t.discarded && /^https:\/\/([^/]*\.)?vinted\./i.test(t.url || "");
        if (!scriptable) {
          console.log(
            `[republish] onglet de travail ${tabVerif} non interrogeable ` +
            `(${!t ? "disparu" : t.discarded ? "déchargé" : "hors vinted.fr"}) — ` +
            "vérification du dressing sautée, on recrée",
          );
          tabVerif = null;
        }
      }
      try {
        // tabVerif null = abstention décidée juste au-dessus : on ne parle à
        // personne et on enchaîne sur la recréation.
        const ident = tabVerif == null
          ? null
          : await sendMessageToTab(tabVerif, { type: "VINTED_CURRENT_USER" }).catch(() => null);
        if (ident?.userId) {
          const page = await sendMessageToTab(tabVerif, {
            type: "SYNC_DRESSING_PAGE", page: 1, userId: ident.userId,
          }).catch(() => null);
          if (page?.success) {
            const connus = await restRequest(
              `inventaire?user_id=eq.${decodeJwtSub(accessToken)}&vinted_item_id=not.is.null&select=vinted_item_id`,
              accessToken,
            ).catch(() => []);
            const { item, raison } = reconnaitreAnnonceRecreee(page.articles, {
              titre: jobRecreation.title,
              deletedAt: pf.deleted_at,
              idsConnus: new Set((connus ?? []).map((r) => String(r.vinted_item_id))),
            });
            if (item) {
              await cloreRepublishSurAnnonceExistante(
                accessToken, job, pf, item.vinted_item_id,
                item.url ?? `https://www.vinted.fr/items/${item.vinted_item_id}`,
                "annonce retrouvée dans le dressing avant recréation",
              );
              return { status: "published", listingUrl: item.url ?? null };
            }
            console.log(`[republish] pas de recréation à éviter (${raison}) — on recrée`);
          }
        }
      } catch (e) {
        console.warn("[republish] vérification du dressing impossible (on recrée):", e?.message ?? e);
      }

      // ── LA PAGE DE DÉPÔT S'OUVRE ICI, ET LE REMPLISSAGE PART TOUT DE SUITE ──
      // Ces quatre lignes sont la COPIE EXACTE de la séquence de la publication
      // normale (processJob) : ouvrir, purger les captures de la sonde,
      // installer la sonde, envoyer FILL_LISTING. Rien d'autre entre le
      // chargement de /items/new et le job — c'est tout le correctif.
      // ⛔ NE JAMAIS réinsérer un await ici : chaque chose glissée entre ces
      // lignes vieillit un formulaire de dépôt que personne ne surveille.
      // Ce qui doit être vérifié AVANT se fait plus haut (volet b, sur l'onglet
      // de travail) ; ce qui se vérifie APRÈS se fait plus bas (sonde,
      // ceinture dressing).
      const tabId = await getOrCreateWorkTab("vinted", listingUrl);
      clearProbeCaptures(tabId);
      await installNetworkProbe(tabId, "vinted");
      let result;
      try {
        result = await sendMessageToTab(tabId, { type: "FILL_LISTING", job: jobRecreation });
      } catch (e) {
        result = { success: false, error: `canal coupé pendant la recréation : ${String(e?.message ?? e)}` };
      }
      dernierGesteRepublishAt = Date.now();

      // ── VOLET (a) : le canal coupé peut être la SIGNATURE D'UN SUCCÈS ─────
      // Vinted REDIRIGE vers la nouvelle annonce dès qu'elle est créée : la
      // redirection détruit le content script AVANT sa réponse. La publication
      // normale interroge la sonde dans ce cas depuis le 13/07 (job ba84ebb0) ;
      // la recréation, elle, concluait à l'échec — c'est exactement ce qui a
      // laissé l'annonce de Nico en ligne avec un job en needs_user le 05/08.
      // Les captures de la sonde SURVIVENT à la mort de la page.
      if (!result?.success) {
        const urlSonde = await vintedUploadSucceededForTitle(tabId, jobRecreation.title).catch(() => null);
        if (urlSonde) {
          const idSonde = urlSonde.match(/\/items\/(\d+)/)?.[1] ?? null;
          if (idSonde) {
            await cloreRepublishSurAnnonceExistante(
              accessToken, job, pf, idSonde, urlSonde,
              "canal coupé par la redirection de succès — création confirmée par la réponse serveur",
            );
            return { status: "published", listingUrl: urlSonde };
          }
        }

        // ── CEINTURE : le dressing, TOUT DE SUITE ────────────────────────────
        // Ne dépend d'AUCUNE sonde — donc rattrape même ce que la sonde rate.
        // Le 05/08, la recherche du dressing n'existait qu'AVANT la recréation :
        // elle protégeait la relance, pas la tentative en cours, et le job se
        // clôturait en needs_user avant que quiconque puisse vérifier. Deux
        // annonces recréées ont été perdues comme ça. On regarde donc
        // maintenant, pendant qu'on tient encore l'onglet.
        try {
          const ident2 = await sendMessageToTab(tabId, { type: "VINTED_CURRENT_USER" }).catch(() => null);
          if (ident2?.userId) {
            const page2 = await sendMessageToTab(tabId, {
              type: "SYNC_DRESSING_PAGE", page: 1, userId: ident2.userId,
            }).catch(() => null);
            if (page2?.success) {
              const connus2 = await restRequest(
                `inventaire?user_id=eq.${decodeJwtSub(accessToken)}&vinted_item_id=not.is.null&select=vinted_item_id`,
                accessToken,
              ).catch(() => []);
              const { item: trouve, raison: pourquoi } = reconnaitreAnnonceRecreee(page2.articles, {
                titre: jobRecreation.title,
                deletedAt: pf.deleted_at,
                idsConnus: new Set((connus2 ?? []).map((r) => String(r.vinted_item_id))),
              });
              if (trouve) {
                await cloreRepublishSurAnnonceExistante(
                  accessToken, job, pf, trouve.vinted_item_id,
                  trouve.url ?? `https://www.vinted.fr/items/${trouve.vinted_item_id}`,
                  "recréation confirmée dans le dressing après coupure du canal",
                );
                return { status: "published", listingUrl: trouve.url ?? null };
              }
              console.log(`[republish] après coupure, rien de concluant dans le dressing (${pourquoi}) — échec assumé`);
            }
          }
        } catch (e) {
          console.warn("[republish] vérification du dressing après coupure impossible:", e?.message ?? e);
        }
      }

      if (result?.success && result.listingUrl) {
        // ── É4 : RATTACHEMENT du nouvel id (2026-08-05) ─────────────────────
        // L'annonce recréée a un NOUVEL id Vinted. Sans propagation, la
        // prochaine sync ne matcherait plus la ligne inventaire (→ elle
        // croirait l'ancien article disparu ET créerait un doublon du
        // nouveau). Propagé AVANT la clôture du job : si le PATCH inventaire
        // échoue, le job part quand même en published (l'annonce EST en
        // ligne) mais l'échec est journalisé — la sync du lendemain le
        // rattraperait en doublon visible plutôt qu'en perte silencieuse.
        const ancienId = pf.vinted_item_id ?? null;
        const nouvelId = result.listingUrl.match(/\/items\/(\d+)/)?.[1] ?? null;
        pf.republish_step = "recreated";
        pf.recreated_at = new Date().toISOString();
        if (ancienId) pf.old_vinted_item_id = ancienId;
        if (nouvelId) pf.new_vinted_item_id = nouvelId;
        delete pf.next_action_after;
        // Republication aboutie : le diagnostic de péremption repart de zéro.
        delete pf.recaptures_perimees;
        if (nouvelId && job.inventaire_id != null) {
          await restRequest(`inventaire?id=eq.${job.inventaire_id}`, accessToken, {
            method: "PATCH",
            body: JSON.stringify({
              vinted_item_id: nouvelId,
              disparu_le: null,
              // La republication EST une remise en ligne : c'est la nouvelle
              // date de mise en ligne la plus plausible.
              listed_at_guess: new Date().toISOString(),
              // « Le dernier prix publié fait foi » (doctrine bd9a516) : le
              // prix du job = celui de la capture, éventuellement AJUSTÉ à la
              // republication (feuille de prix) — la carte et le prochain
              // « Publier » doivent le refléter.
              ...(job.price != null ? { prix_vente: Number(job.price) } : {}),
            }),
          }).catch((e) => console.error(
            `[background] Republish ${job.id} : rattachement inventaire ${job.inventaire_id} → ${nouvelId} NON écrit —`,
            String(e?.message ?? e),
          ));
        }
        await updateJobStatus(accessToken, job.id, "published", {
          listing_url: result.listingUrl, platform_fields: pf, error: null,
        });
        console.log(`[background] Republish ${job.id} : recréée → ${result.listingUrl} (id ${ancienId ?? "?"} → ${nouvelId ?? "?"})`);
        return { status: "published", listingUrl: result.listingUrl };
      }

      // Échec APRÈS suppression : JAMAIS un failed sec (le trigger
      // rembourserait et abandonnerait un article dont l'annonce n'existe
      // plus). needs_user honnête : tout est au chaud, la relance depuis
      // l'app repart directement à la recréation (l'étape en base le dit).
      // L'annexe technique du content script (dump DOM, options relevées)
      // part dans last_diagnostic — le message affiché reste court (le dump
      // brut dans la modale « En attente de toi », vécu le 06/08, job
      // 68420b37, n'arrive plus).
      if (result?.diagnostic) pf.last_diagnostic = String(result.diagnostic).slice(0, 2000);
      await updateJobStatus(accessToken, job.id, "needs_user", {
        platform_fields: pf,
        error: `L'annonce d'origine a été supprimée sur Vinted et la recréation n'a pas encore abouti (${result?.error ?? "raison inconnue"}). Rien n'est perdu : photos et fiche sont au chaud, relance depuis l'app — la reprise repart directement à la recréation.`,
      });
      return { status: "needsUser", error: result?.error };
    } catch (e) {
      await updateJobStatus(accessToken, job.id, "needs_user", {
        platform_fields: pf,
        error: `Recréation interrompue (${String(e?.message ?? e)}). Rien n'est perdu — relance depuis l'app, la reprise repart directement à la recréation.`,
      }).catch(() => {});
      return { status: "needsUser", error: String(e?.message ?? e) };
    }
  }

  const msg = `Étape de republication inconnue : ${step}`;
  await updateJobStatus(accessToken, job.id, "needs_user", { platform_fields: pf, error: msg }).catch(() => {});
  return { status: "needsUser", error: msg };
}

// ═════════════════════════════════════════════════════════════════════════════
// É6 REPUBLICATION AUTOMATIQUE (2026-08-05, validée par Nico — PRO uniquement).
// Déclencheur CONJONCTIF À ÉCHEC FERMÉ :
//   · listed_at_guess < now − age_jours (défaut 30 — date d'upload de la photo
//     la plus ancienne ≈ date de mise en ligne, au jour près, et É4 la
//     rafraîchit à chaque republication) ;
//   · aucun republish FillSell vivant ni abouti < 24 h sur l'article ;
//   · quand des snapshots existent : observé par la sync depuis ≥ age_jours ;
//   · donnée manquante = PAS de republication auto. Jamais.
// UN article par cycle de poll maximum — le rythme humain vient de là, plus
// la machine à étapes elle-même (espacement 2 min, attente 2-5 min).
// Réglage : profiles.platform_settings.vinted.republish_auto
//   { actif, age_jours (7..365, déf. 30), plafond_jour (1..50, déf. 10) } —
// le plafond quotidien ET le seuil d'ancienneté sont RÉGLABLES PAR
// L'UTILISATEUR (demande explicite). ⚠️ Le plancher d'age_jours DOIT rester
// identique à celui de RepublishAutoBlock (src/tabs/StockTab.jsx) : s'ils
// divergent, l'app annonce « N éligibles » sur un seuil que l'extension
// n'applique pas — un compteur qui ment.
// Le plancher vaut 7 JOURS et ce n'est pas arbitraire : republier une annonce
// mise en ligne il y a 1 ou 2 jours est un motif que Vinted sait repérer, et
// c'est le compte de l'utilisateur qui prend le risque. Descendu à 1 le
// 2026-08-09, remonté à 7 le jour même — ne pas rebaisser sans arbitrage.
// Compte plus Pro ⇒ l'automatisation se COUPE PROPREMENT (actif:false +
// arret_motif:'plan_non_pro', lu par l'UI) — jamais une série d'échecs muets.
let autoRepublishBusy = false;

async function maybeAutoRepublish(session) {
  if (autoRepublishBusy) return;
  autoRepublishBusy = true;
  try {
    const token = session.access_token;
    const userId = decodeJwtSub(token);
    if (!userId) return;

    const profs = await restRequest(`profiles?id=eq.${userId}&select=is_pro,platform_settings`, token,
      { headers: { Prefer: "return=representation" } });
    const prof = profs?.[0];
    const cfg = prof?.platform_settings?.vinted?.republish_auto;
    if (!cfg?.actif) return;

    if (prof?.is_pro !== true) {
      // Arrêt PROPRE : lecture-fusion-écriture (platform_settings porte aussi
      // l'adresse Leboncoin — jamais d'écrasement global).
      const ps = prof?.platform_settings ?? {};
      const next = {
        ...ps,
        vinted: { ...(ps.vinted ?? {}), republish_auto: {
          ...cfg, actif: false, arrete_le: new Date().toISOString(), arret_motif: "plan_non_pro",
        } },
      };
      await restRequest(`profiles?id=eq.${userId}`, token, {
        method: "PATCH", body: JSON.stringify({ platform_settings: next }),
      }).catch(() => {});
      console.log("[republish-auto] compte plus Pro — automatisation coupée proprement (motif visible dans l'app)");
      return;
    }

    // ── Article par article aussi pour l'AUTO (2026-08-07) ──────────────────
    // Le plafond « 1 mise en file par cycle » limite le DÉBIT D'ENTRÉE, pas
    // l'empilement : le pré-filtre plus bas ne regarde que le MÊME article —
    // un cycle pouvait mettre B en file pendant que A était encore en vol, et
    // la file reconstituait exactement le lot qui a mis 7 annonces hors
    // ligne. Tant qu'UNE republication du compte est non terminale (quel que
    // soit l'article), on ne met RIEN de neuf en file : l'exécuteur porte
    // l'invariant, l'auto n'a aucune raison de fabriquer une file d'attente.
    const enVol = await restRequest(
      `cross_post_jobs?user_id=eq.${userId}&action=eq.republish` +
      `&status=in.(pending,processing,needs_user)&select=id&limit=1`,
      token, { headers: { Prefer: "return=representation" } },
    ).catch(() => null);
    if (enVol === null || enVol.length) return;

    const ageJours = Math.min(365, Math.max(7, Number(cfg.age_jours) || 30));
    const plafond = Math.min(50, Math.max(1, Number(cfg.plafond_jour) || 10));
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
    const faits = await restRequest(
      `cross_post_jobs?user_id=eq.${userId}&action=eq.republish` +
      `&platform_fields->>republish_source=eq.auto&created_at=gte.${debutJour.toISOString()}&select=id`,
      token, { headers: { Prefer: "return=representation" } },
    );
    if ((faits?.length ?? 0) >= plafond) return;

    const seuil = new Date(Date.now() - ageJours * 86_400_000).toISOString();
    const cands = await restRequest(
      `inventaire?user_id=eq.${userId}&statut=eq.stock&vinted_item_id=not.is.null` +
      `&disparu_le=is.null&listed_at_guess=lt.${encodeURIComponent(seuil)}` +
      `&select=id,vinted_item_id&order=listed_at_guess.asc&limit=10`,
      token, { headers: { Prefer: "return=representation" } },
    );

    for (const c of cands ?? []) {
      // Republish vivant, ou abouti < 24 h ? Le RPC re-garde de toute façon —
      // ce pré-filtre évite juste de griller le tour du cycle sur un refus.
      const jr = await restRequest(
        `cross_post_jobs?user_id=eq.${userId}&action=eq.republish` +
        `&platform_fields->>vinted_item_id=eq.${c.vinted_item_id}` +
        `&status=in.(pending,processing,needs_user,published)` +
        `&select=status,published_at&order=created_at.desc&limit=1`,
        token, { headers: { Prefer: "return=representation" } },
      );
      const j = jr?.[0];
      if (j && (j.status !== "published"
        || (j.published_at && Date.now() - Date.parse(j.published_at) < 24 * 3_600_000))) continue;

      // Second signal : observé par la sync depuis ≥ age_jours quand des
      // snapshots existent (le premier relevé fait foi).
      const snap = await restRequest(
        `vinted_listing_snapshots?user_id=eq.${userId}&vinted_item_id=eq.${c.vinted_item_id}` +
        `&select=captured_on&order=captured_on.asc&limit=1`,
        token, { headers: { Prefer: "return=representation" } },
      );
      if (snap?.length && Date.parse(snap[0].captured_on) > Date.now() - ageJours * 86_400_000) continue;

      const ok = await autoCaptureEtRepublier(c, token, userId);
      console.log(`[republish-auto] article ${c.vinted_item_id} : ${ok ? "mis en file" : "capture/RPC refusés — retentera un autre cycle"}`);
      return; // UN article par cycle, réussi ou pas — jamais de rafale.
    }
  } finally {
    autoRepublishBusy = false;
  }
}

// Capture → photos re-hébergées → persistance → RPC (p_source='auto').
// Miroir volontaire de capturerEtPersisterArticleVinted (site) : l'auto n'a
// pas d'onglet fillsell.app ouvert, tout passe par le background.
async function autoCaptureEtRepublier(cand, token, userId) {
  const cap = await captureVintedItem(cand.vinted_item_id);
  if (!cap?.success) return false;
  const manquants = (cap.champs_manquants ?? []).filter((m) => !m.startsWith("photos_rehebergees"));
  let photos = [];
  if (cap.photos_cdn?.length) {
    try {
      const r = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/functions/v1/republish-capture-photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ vinted_item_id: String(cand.vinted_item_id), urls: cap.photos_cdn }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
      photos = d.photos ?? [];
      for (const e of d.echecs ?? []) manquants.push(`photo non re-hébergée (${e.raison})`);
      if (!photos.length) manquants.push("photos_rehebergees (aucune photo re-hébergée)");
    } catch (e) {
      manquants.push(`photos_rehebergees (${String(e?.message ?? e)})`);
    }
  }
  const verdict = manquants.length ? "incomplet" : "valide";
  await restRequest("vinted_republish_captures", token, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId, inventaire_id: cand.id, vinted_item_id: String(cand.vinted_item_id),
      verdict, champs_manquants: manquants,
      payload: { natif: cap.natif ?? null, dto_public: cap.dto_public ?? null,
                 titre: cap.titre ?? null, prix: cap.prix ?? null,
                 description: cap.description ?? null, photos_cdn: cap.photos_cdn ?? [],
                 diagnostics: cap.diagnostics ?? null },
      libelles: cap.libelles ?? null, photos_urls: photos,
    }),
  }).catch((e) => console.warn("[republish-auto] persistance capture:", String(e?.message ?? e)));
  if (verdict !== "valide") return false; // échec FERMÉ : l'article retentera un autre jour
  const rpc = await restRequest("rpc/spend_coins_and_republish", token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_inventaire_id: cand.id, p_vinted_item_id: String(cand.vinted_item_id), p_source: "auto",
    }),
  }).catch((e) => { console.warn("[republish-auto] RPC:", String(e?.message ?? e)); return null; });
  return rpc?.allowed === true;
}

async function processDeleteJob(job, accessToken) {
  console.log(`[background] Job ${job.id} → ${job.platform} (DELETE)`);

  // ── Ce qu'il faut pour cibler, PAR PLATEFORME (2026-07-22) ────────────────
  // AVANT : `if (!job.listing_url) → failed`, sans distinction. Un verrou
  // trop large, qui a fait échouer le retrait de la montre G-Shock (job
  // 661f943b) AVANT même d'ouvrir un onglet — l'annonce Leboncoin est restée
  // en ligne sur un article vendu, et la garde d'identité du handler n'a
  // jamais eu l'occasion de tourner.
  // Or DELETE_TARGETS (juste au-dessus) dit exactement de quoi chacun a besoin :
  //   vinted    → job.listing_url : on navigue SUR l'annonce, sans URL il n'y
  //               a littéralement nulle part où aller ;
  //   leboncoin → job.listing_url quand il existe (chemin nominal depuis le
  //               2026-07-22 : la page de l'annonce porte son propre panneau de
  //               suppression), SINON « Mes annonces » et ciblage par titre —
  //               d'où un titre non vide exigé dans ce seul cas ;
  //   ebay / beebs → une CONSTANTE (Hub vendeur, « Mes annonces »). L'URL n'y
  //               sert à rien pour naviguer : c'est le content script qui
  //               localise la carte dans la liste, et il sait le faire par
  //               TITRE (garde d'identité à l'appui).
  // On exige donc la bonne preuve pour chacun : l'URL là où elle est
  // indispensable, un titre non vide partout ailleurs — sans titre, le content
  // script ne peut rien identifier, et le refus reste le bon comportement.
  const cibleParUrl = job.platform === "vinted";
  if (cibleParUrl && !job.listing_url) {
    const msg = "Job delete Vinted sans listing_url : la suppression Vinted navigue sur l'annonce elle-même, il n'y a aucune page de repli.";
    await updateJobStatus(accessToken, job.id, "failed", { error: msg });
    return { status: "failed", error: msg };
  }
  if (!cibleParUrl && !job.listing_url && !String(job.title ?? "").trim()) {
    const msg = `Job delete ${job.platform} sans listing_url NI titre : impossible d'identifier l'annonce dans « Mes annonces ».`;
    await updateJobStatus(accessToken, job.id, "failed", { error: msg });
    return { status: "failed", error: msg };
  }
  if (!job.listing_url) {
    console.log(
      `[background] Job ${job.id} (${job.platform}) : suppression SANS listing_url — ` +
      `ciblage par titre « ${job.title} » dans la liste, la garde d'identité du handler tranchera`
    );
  }

  try {
    // Même horodatage que la publication (cf. recoverStaleProcessingJobs) : un
    // job delete peut lui aussi mourir en route. Muté sur la copie mémoire
    // aussi (2026-07-30, même raison que processJob : update-job-status écrase
    // platform_fields en entier).
    job.platform_fields = { ...(job.platform_fields ?? {}), processing_since: new Date().toISOString() };
    await updateJobStatus(accessToken, job.id, "processing", { platform_fields: job.platform_fields });

    const target = DELETE_TARGETS[job.platform]?.(job);
    if (!target) throw new Error(`Pas de cible de suppression pour ${job.platform}`);

    // Même onglet de travail persistant que la publication (anti-DataDome).
    const tabId = await getOrCreateWorkTab(job.platform, target);

    // Observation fenêtre de travail (2026-07-30) : même relevé au démarrage
    // que la publication — voir releverEtatFenetreTravail. Jamais bloquant.
    stampEtatFenetre(job, "at_start", await releverEtatFenetreTravail(job.platform));
    if (job.platform_fields?.work_window_state) {
      await updateJobStatus(accessToken, job.id, "processing", { platform_fields: job.platform_fields })
        .catch((e2) => console.warn(`[background] Job ${job.id} : relevé fenêtre non persisté —`, String(e2?.message ?? e2)));
    }

    // Onglet activé DANS la fenêtre de travail dédiée (aucun impact chez
    // l'utilisateur — cf. paintTab v2). ⚠️ La fenêtre étant minimisée, la
    // peinture n'est plus garantie : si la page de suppression exige un rendu
    // (contrôles à 0×0, handlers React non attachés), le content script échoue
    // et le job repart en needsUser (ci-dessous) plutôt que d'imposer une
    // fenêtre à l'écran. Contrainte produit : invisible avant tout.
    const restore = await paintTab(tabId);
    let result;
    try {
      result = await sendMessageToTab(tabId, { type: "DELETE_LISTING", job });
    } finally {
      await restore();
    }

    // ⚠️ « ANNONCE INTROUVABLE » PEUT VOULOIR DIRE « DÉJÀ SUPPRIMÉE » (2026-07-13,
    // vécu sur les deux annonces eBay : elles étaient bel et bien retirées, et le
    // job s'acharnait en « introuvable dans le Hub — nouvelle tentative »).
    // Avant de conclure quoi que ce soit, on demande à la PLATEFORME. Une annonce
    // qui n'est plus en ligne, c'est une suppression RÉUSSIE, pas un échec.
    //
    // ⚠️ LES RÉSULTATS needsUser PASSENT AUSSI PAR ICI (2026-07-21). Ils en
    // étaient exclus, et ça a transformé une suppression RÉUSSIE en échec :
    // article Vinted déjà supprimé → sa page est servie en 404 → aucun jeton
    // CSRF dessus → POST refusé en 403 → le handler rendait needsUser… ce qui
    // sautait précisément le contrôle écrit pour ce cas. Le job a brûlé ses
    // 2 ré-armements et fini 'failed' sur une annonce qui n'existait plus.
    // Le ré-armement, lui, reste réservé aux non-needsUser (le cas needsUser a
    // sa propre branche plus bas, avec son message d'origine).
    if (result && !result.success && !result.dryRun) {
      const { state } = await checkListingState(job.listing_url, job.platform).catch(() => ({ state: "unknown" }));
      if (state === "unavailable" || state === "sold") {
        console.log(
          `[background] Job ${job.id} : le content script n'a pas abouti (${result.error}), MAIS l'annonce ` +
          `${job.platform} n'est plus en ligne — suppression CONFIRMÉE par l'état réel de l'annonce`
        );
        await updateJobStatus(accessToken, job.id, "deleted", {
          error: null,
          platform_fields: {
            ...(job.platform_fields ?? {}),
            delete_confirmed_by: "etat_annonce",
            delete_trace: result.trace ?? [],
          },
        });
        await cancelPublishAfterDelete(accessToken, job);
        await recordRecentResult(job, "deleted");
        return { status: "deleted" };
      }

      // L'annonce est TOUJOURS là (ou illisible) : ré-armement borné, jamais un
      // "failed" sec — la suppression reste faisable au prochain passage.
      //
      // ⚠️ « VÉRIFIÉ » NE SE DIT QUE SUR UN ÉTAT CONCLUANT (2026-07-21). Le
      // message annonçait « TOUJOURS en ligne (vérifié) » pour TOUT état autre
      // que unavailable/sold — donc aussi pour "unknown" (anti-bot, onglet
      // figé, HTTP non-ok), où le check n'a justement rien pu lire. On
      // présentait une lecture ratée comme une vérification aboutie, et
      // l'utilisateur allait chercher sur la plateforme une annonce qui pouvait
      // très bien être déjà retirée.
      if (!result.needsUser && /introuvable|0×0|0x0|modale|non peinte/i.test(String(result.error ?? ""))) {
        const msg =
          state === "active"
            ? `Suppression ${job.platform} non aboutie (${result.error}). L'annonce est TOUJOURS en ligne ` +
              "(vérifié). Nouvelle tentative au prochain passage ; sinon la retirer à la main sur la plateforme."
            : `Suppression ${job.platform} non aboutie (${result.error}). Impossible de VÉRIFIER si l'annonce ` +
              "est encore en ligne (lecture indéterminée : protection anti-bot, onglet indisponible ou page " +
              "inattendue) — elle est peut-être déjà retirée. Nouvelle tentative au prochain passage ; sinon " +
              "vérifier à la main sur la plateforme.";
        await rearmBounded(accessToken, job, msg);
        return { status: "needsUser", error: msg };
      }
    }

    if (result?.dryRun) {
      const trace = result.trace ?? [];
      console.log(`[background] Job ${job.id} : DELETE dry-run terminé —\n  ${trace.join("\n  ")}`);
      await updateJobStatus(accessToken, job.id, "dry_run_completed", {
        error: null,
        platform_fields: { ...(job.platform_fields ?? {}), delete_dry_run_trace: trace },
      });
      await recordRecentResult(job, "dry_run_completed");
      return { status: "dry_run_completed", trace };
    } else if (result?.needsUser) {
      await rearmBounded(accessToken, job, result.error);
      return { status: "needsUser", error: result.error };
    } else if (result?.success) {
      console.log(`[background] Job ${job.id} : annonce ${job.platform} supprimée`);
      await updateJobStatus(accessToken, job.id, "deleted", {
        platform_fields: { ...(job.platform_fields ?? {}), delete_trace: result.trace ?? [] },
      });
      await cancelPublishAfterDelete(accessToken, job);
      await recordRecentResult(job, "deleted");
      return { status: "deleted" };
    } else {
      throw new Error(result?.error || "Le content script n'a pas retourné de résultat");
    }
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/message channel closed|Receiving end does not exist/i.test(msg)) {
      // ⚠️ MÊME LEÇON QUE LA PUBLICATION VINTED : le canal coupé est ici la
      // SIGNATURE PROBABLE D'UN SUCCÈS. Le clic « Mettre fin à l'annonce »
      // (eBay) NAVIGUE : la page se recharge, le content script meurt AVANT de
      // répondre, et on n'a jamais sa réponse — alors que l'annonce vient d'être
      // retirée. Ré-armer aveuglément, c'est retenter une suppression déjà faite
      // (et conclure « annonce introuvable » au tour suivant, en boucle).
      // On demande donc à la PLATEFORME, pas au canal : si l'annonce n'est plus
      // en ligne, la suppression a réussi.
      const { state } = await checkListingState(job.listing_url, job.platform).catch(() => ({ state: "unknown" }));
      if (state === "unavailable" || state === "sold") {
        console.log(
          `[background] Job ${job.id} : canal coupé PAR LA NAVIGATION de suppression — ` +
          `l'annonce ${job.platform} n'est PLUS en ligne : suppression CONFIRMÉE`
        );
        await updateJobStatus(accessToken, job.id, "deleted", {
          error: null,
          platform_fields: { ...(job.platform_fields ?? {}), delete_confirmed_by: "etat_annonce" },
        }).catch((err) => console.error("[background] update-job-status failed:", err));
        await cancelPublishAfterDelete(accessToken, job);
        await recordRecentResult(job, "deleted");
        return { status: "deleted" };
      }
      // Toujours en ligne (ou état illisible) : là seulement, on retente.
      await rearmBounded(accessToken, job, `Suppression interrompue (onglet navigué/rechargé) : ${msg}`)
        .catch((err) => console.error("[background] update-job-status failed:", err));
      return { status: "retry", error: msg };
    }
    console.error(`[background] Job ${job.id} (delete) en échec:`, e);
    // Observation fenêtre (2026-07-30) : même relevé de fin que la publication.
    stampEtatFenetre(job, "at_end", await releverEtatFenetreTravail(job.platform));
    await updateJobStatus(accessToken, job.id, "failed", { error: msg, platform_fields: job.platform_fields })
      .catch((err) => console.error("[background] update-job-status failed:", err));
    return { status: "failed", error: msg };
  }
}

// 300 s (et non 120 s) depuis le passage au timing humain du 2026-07-09 : la
// frappe caractère par caractère (80–250 ms) et les pauses aléatoires entre
// actions (300–900 ms) allongent volontairement un remplissage complet à
// ~1–2 min de temps RÉEL. Le timer Web Worker des content scripts garantit que
// ce temps n'est plus dilaté par le throttling des onglets cachés (fix
// 2026-07-08) — mais il reste supérieur à l'ancien budget de 120 s.
function sendMessageToTabOnce(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout: pas de réponse du content script")),
      timeoutMs
    );
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// "Could not establish connection. Receiving end does not exist." (vécu ce soir
// sur Vinted) = le content script du manifest n'est pas ENCORE injecté quand on
// envoie le premier message : il s'exécute à document_idle, et une SPA peut
// enchaîner une navigation interne juste après le "complete" qui nous a
// débloqués. Cette erreur est émise AVANT toute livraison — le message n'a
// donc jamais atteint la page : le renvoyer ne peut pas dupliquer un
// remplissage (contrairement à un timeout, où l'on ne sait pas). On ne rejoue
// QUE ce cas, jamais les autres.
async function sendMessageToTab(tabId, message, timeoutMs = 300_000) {
  const RETRY_WINDOW_MS = 20_000;
  const deadline = Date.now() + RETRY_WINDOW_MS;
  let attempt = 0;

  for (;;) {
    try {
      return await sendMessageToTabOnce(tabId, message, timeoutMs);
    } catch (e) {
      const msg = String(e?.message ?? e);
      const noReceiver =
        msg.includes("Receiving end does not exist") ||
        msg.includes("Could not establish connection");
      if (!noReceiver || Date.now() >= deadline) throw e;
      attempt += 1;
      console.log(
        `[background] Content script pas encore prêt sur l'onglet ${tabId} ` +
        `(tentative ${attempt}) — nouvel essai dans 1 s`
      );
      await sleep(1000);
    }
  }
}
