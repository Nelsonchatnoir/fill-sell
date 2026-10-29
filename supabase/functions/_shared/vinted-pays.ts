// ============================================================================
// VINTED ZONE EURO — ce que Vinted affiche dans chaque langue, RELEVÉ, jamais
// supposé (25/09/2026, chantier « Vinted zone euro », déclencheur : Alberto,
// compte italien, 2 republications bloquées sur « Condizioni »).
//
// ── CE QUI A ÉTÉ MESURÉ, ET OÙ ─────────────────────────────────────────────
//   · Pays : les 18 domaines Vinted de la zone euro, liens hreflang de la page
//     d'accueil de vinted.fr (FR BE LU NL DE AT IT ES PT IE FI EE LV LT SK SI
//     HR GR). Hors euro (UK, US, CZ, PL, SE, HU, RO, DK, AU) : hors périmètre.
//   · États : filtre « Condizioni / Estado / Zustand… » de la page catalogue
//     PUBLIQUE de chaque domaine, testid `selectable-item-status-<id>--title`.
//     Les 5 identifiants (6, 1, 2, 3, 4) sont les MÊMES partout ; seul le
//     libellé change. Contrôle croisé sur de VRAIS formulaires de dépôt :
//       - it : liste relevée par l'extension sur le formulaire d'Alberto
//         (jobs 80c3d14c, b81a3312) = libellés du filtre, à l'identique ;
//       - en : catalogue platform_category_aspects (comptes anglais sur
//         vinted.fr, 14/09) = libellés du filtre de vinted.ie ;
//       - fr : 3 116 captures (table historique de l'extension).
//     Les autres langues n'ont été vues QUE sur le filtre public : elles sont
//     marquées `formulaire: false` et le serveur ne s'en sert PAS pour poser
//     un champ (un libellé à une virgule près ferait choisir la mauvaise
//     option par l'appariement approximatif de l'extension — « Neu » au lieu
//     de « Neu, mit Etikett »).
//   · Racines du catalogue : GET /api/v2/item_upload/catalogs de chaque
//     domaine, anonyme. Mêmes 8 identifiants partout (1904, 5, 1193, 1918,
//     2994, 2309, 4824, 4332). AT = DE, BE = LU = FR, à l'identique.
//
// ⛔ LE DOMAINE N'EST PAS LA LANGUE. Alberto (compte italien) travaille sur
//    www.vinted.fr — la seule adresse que l'extension connaît — et Vinted lui
//    sert la page en ITALIEN, la langue de son compte. La langue se lit donc
//    sur ce que Vinted a affiché À CE COMPTE (capture, relevé du formulaire),
//    et le pays dans l'API du compte (users/current : country_code, locale —
//    vérifié sur la session de Nico : « FR », « fr »).
// ============================================================================

export type LangueVinted =
  | "fr" | "it" | "es" | "de" | "nl" | "pt" | "en" | "fi" | "et" | "lv" | "lt" | "sk" | "sl" | "hr" | "el";

/** Pays Vinted de la zone euro : code ISO → domaine et langue(s) de la page publique. */
export const PAYS_VINTED_EURO: Readonly<Record<string, { domaine: string; langues: LangueVinted[] }>> = {
  FR: { domaine: "www.vinted.fr", langues: ["fr"] },
  BE: { domaine: "www.vinted.be", langues: ["fr", "nl"] },
  LU: { domaine: "www.vinted.lu", langues: ["fr"] },
  NL: { domaine: "www.vinted.nl", langues: ["nl"] },
  DE: { domaine: "www.vinted.de", langues: ["de"] },
  AT: { domaine: "www.vinted.at", langues: ["de"] },
  IT: { domaine: "www.vinted.it", langues: ["it"] },
  ES: { domaine: "www.vinted.es", langues: ["es"] },
  PT: { domaine: "www.vinted.pt", langues: ["pt"] },
  IE: { domaine: "www.vinted.ie", langues: ["en"] },
  FI: { domaine: "www.vinted.fi", langues: ["fi"] },
  EE: { domaine: "www.vinted.ee", langues: ["et"] },
  LV: { domaine: "www.vinted.lv", langues: ["lv"] },
  LT: { domaine: "www.vinted.lt", langues: ["lt"] },
  SK: { domaine: "www.vinted.sk", langues: ["sk"] },
  SI: { domaine: "www.vinted.si", langues: ["sl"] },
  HR: { domaine: "www.vinted.hr", langues: ["hr"] },
  GR: { domaine: "www.vinted.gr", langues: ["el"] },
};

/**
 * Libellés des 5 états par langue, dans l'ordre de Vinted (6, 1, 2, 3, 4).
 * `formulaire` = vu à l'identique sur un VRAI formulaire de dépôt (cf. bandeau).
 */
export const ETATS_VINTED: Readonly<Record<LangueVinted, { formulaire: boolean; libelles: Readonly<Record<number, string>> }>> = {
  fr: { formulaire: true, libelles: { 6: "Neuf avec étiquette", 1: "Neuf sans étiquette", 2: "Très bon état", 3: "Bon état", 4: "Satisfaisant" } },
  it: { formulaire: true, libelles: { 6: "Nuovo con cartellino", 1: "Nuovo senza cartellino", 2: "Ottime", 3: "Buone", 4: "Discrete" } },
  en: { formulaire: true, libelles: { 6: "New with tags", 1: "New without tags", 2: "Very good", 3: "Good", 4: "Satisfactory" } },
  es: { formulaire: false, libelles: { 6: "Nuevo con etiquetas", 1: "Nuevo sin etiquetas", 2: "Muy bueno", 3: "Bueno", 4: "Satisfactorio" } },
  de: { formulaire: false, libelles: { 6: "Neu, mit Etikett", 1: "Neu", 2: "Sehr gut", 3: "Gut", 4: "Zufriedenstellend" } },
  nl: { formulaire: false, libelles: { 6: "Nieuw met prijskaartje", 1: "Nieuw zonder prijskaartje", 2: "Heel goed", 3: "Goed", 4: "Veelgebruikt" } },
  pt: { formulaire: false, libelles: { 6: "Novo com etiquetas", 1: "Novo sem etiquetas", 2: "Muito bom", 3: "Bom", 4: "Satisfatório" } },
  fi: { formulaire: false, libelles: { 6: "Uusi, jossa hintalappu", 1: "Uusi ilman hintalappua", 2: "Erittäin hyvä", 3: "Hyvä", 4: "Tyydyttävä" } },
  et: { formulaire: false, libelles: { 6: "Uus koos hinnasildiga", 1: "Uus ilma hinnasildita", 2: "Väga hea", 3: "Hea", 4: "Rahuldav" } },
  lv: { formulaire: false, libelles: { 6: "Jauna prece ar etiķetēm", 1: "Jauna prece bez etiķetēm", 2: "Ļoti labs", 3: "Labs", 4: "Apmierinošs" } },
  lt: { formulaire: false, libelles: { 6: "Nauja su etiketėmis", 1: "Nauja be etikečių", 2: "Labai gera", 3: "Gera", 4: "Patenkinama" } },
  sk: { formulaire: false, libelles: { 6: "Nové s visačkou", 1: "Nové bez visačky", 2: "Veľmi dobré", 3: "Dobré", 4: "Uspokojivé" } },
  sl: { formulaire: false, libelles: { 6: "Novo z etiketo", 1: "Novo brez etikete", 2: "Zelo dobro", 3: "Dobro", 4: "Zadovoljivo" } },
  hr: { formulaire: false, libelles: { 6: "Novo s etiketama", 1: "Novo bez etiketa", 2: "Veoma dobro", 3: "Dobro", 4: "Zadovoljavajuće" } },
  el: { formulaire: false, libelles: { 6: "Νέο με ετικέτες", 1: "Νέο χωρίς ετικέτες", 2: "Πολύ καλό", 3: "Καλό", 4: "Ικανοποιητικό" } },
};

/** Racines du catalogue par langue (identifiant → libellé), relevées le 25/09. */
export const RACINES_CATALOGUE: Readonly<Record<LangueVinted, Readonly<Record<number, string>>>> = {
  fr: { 1904: "Femmes", 5: "Hommes", 1193: "Enfants", 1918: "Maison", 2994: "Électronique", 2309: "Livres et médias", 4824: "Loisirs et collections", 4332: "Sport" },
  it: { 1904: "Donna", 5: "Uomo", 1193: "Bambini", 1918: "Casa", 2994: "Elettronica", 2309: "Libri e media", 4824: "Hobby e collezionismo", 4332: "Sport" },
  es: { 1904: "Mujer", 5: "Hombre", 1193: "Niños", 1918: "Hogar", 2994: "Electrónica", 2309: "Libros y multimedia", 4824: "Hobbies y coleccionismo", 4332: "Deportes" },
  de: { 1904: "Damen", 5: "Herren", 1193: "Kinder", 1918: "Home", 2994: "Elektronik", 2309: "Bücher & andere Medien", 4824: "Hobby- & Sammlerartikel", 4332: "Sport" },
  nl: { 1904: "Dames", 5: "Heren", 1193: "Kinderen", 1918: "Home", 2994: "Elektronica", 2309: "Boeken & multimedia", 4824: "Hobby's & verzamelen", 4332: "Sport" },
  pt: { 1904: "Mulher", 5: "Homem", 1193: "Criança", 1918: "Casa", 2994: "Eletrónica", 2309: "Livros e Multimédia", 4824: "Hobbies e Coleções", 4332: "Desporto" },
  en: { 1904: "Women", 5: "Men", 1193: "Kids", 1918: "Home", 2994: "Electronics", 2309: "Books & Media", 4824: "Hobbies & collectables", 4332: "Sports" },
  fi: { 1904: "Naiset", 5: "Miehet", 1193: "Lapset", 1918: "Koti", 2994: "Elektroniikka", 2309: "Lukeminen ja viihde", 4824: "Harrastukset ja keräily", 4332: "Urheilu" },
  et: { 1904: "Naised", 5: "Mehed", 1193: "Lastele", 1918: "Kodu", 2994: "Elektroonika", 2309: "Raamatud ja meedia", 4824: "Hobid ja kogumine", 4332: "Sport" },
  lv: { 1904: "Sievietēm", 5: "Vīriešiem", 1193: "Bērniem", 1918: "Mājai", 2994: "Elektronika", 2309: "Grāmatas un ieraksti", 4824: "Hobiji un kolekcionēšana", 4332: "Sports" },
  lt: { 1904: "Moterims", 5: "Vyrams", 1193: "Vaikams", 1918: "Namams", 2994: "Elektronika", 2309: "Knygos ir įrašai", 4824: "Hobiams ir kolekcijoms", 4332: "Sportui" },
  sk: { 1904: "Ženy", 5: "Muži", 1193: "Deti", 1918: "Domov", 2994: "Elektronika", 2309: "Knihy a médiá", 4824: "Koníčky a zberateľstvo", 4332: "Šport" },
  sl: { 1904: "Ženske", 5: "Moški", 1193: "Otroci", 1918: "Dom", 2994: "Elektronika", 2309: "Knjige in mediji", 4824: "Hobiji in zbirateljski artikli", 4332: "Šport" },
  hr: { 1904: "Žene", 5: "Muškarci", 1193: "Djeca", 1918: "Dom", 2994: "Elektronika", 2309: "Knjige i mediji", 4824: "Hobiji i kolekcionarstvo", 4332: "Sport" },
  el: { 1904: "Γυναίκα", 5: "Άνδρας", 1193: "Παιδιά", 1918: "Σπίτι", 2994: "Ηλεκτρονικά είδη", 2309: "Βιβλία & πολυμέσα", 4824: "Χόμπι και συλλεκτικά είδη", 4332: "Άθληση" },
};

/**
 * (28/10/2026, mele.marta 2fd83d73) Langues de PAGE qui ouvrent, seules, la pose par identifiant quand le pays du
 * compte n'a PAS été lu : la sonde users/current se tait dès que le jeton d'une heure a expiré (http
 * « jeton_expire_session_ouverte » → vinted_identite null), et une publication n'a ni capture ni liste d'états pour
 * dire sa langue. L'autorisation n'était alors jamais servie : la page italienne descendait l'arbre par libellés
 * français (« Électronique » introuvable parmi « Elettronica »…). Une langue n'est rendue que si TOUS les pays où
 * Vinted la sert sont ouverts (coin_config vinted_pays_<cc> = 1) — fermer un pays la retire, comme avant.
 * ⛔ Jamais le français (chemin d'aujourd'hui) ni l'anglais (un compte FRANÇAIS peut voir sa page en anglais : seule
 * la sonde dit alors son pays). C'est la page elle-même (<html lang>, lu par vinted.js) qui dit sa langue.
 */
export function languesOuvertesSansPays(ouverts: ReadonlySet<string>): LangueVinted[] {
  return (Object.keys(ETATS_VINTED) as LangueVinted[])
    .filter((l) => l !== "fr" && l !== "en")
    .filter((l) => {
      const pays = paysDeLaLangue(l);
      return pays.length > 0 && pays.every((cc) => ouverts.has(cc));
    });
}

/** Pays de la zone euro dont c'est la langue (pour l'interrupteur par pays). */
export function paysDeLaLangue(l: LangueVinted): string[] {
  return Object.entries(PAYS_VINTED_EURO).filter(([, p]) => p.langues.includes(l)).map(([cc]) => cc);
}

const norm = (s: unknown) => String(s ?? "").normalize("NFC").trim().toLowerCase();

/** Langues dont la racine de catalogue porte EXACTEMENT ce libellé. */
export function languesDeLaRacine(racine: unknown): LangueVinted[] {
  const r = norm(racine);
  if (!r) return [];
  return (Object.keys(RACINES_CATALOGUE) as LangueVinted[])
    .filter((l) => Object.values(RACINES_CATALOGUE[l]).some((t) => norm(t) === r));
}

// ── (29/10, lot B 4.1 — mele.marta 2fd83d73) UNE LISTE DE RACINES DIT LA LANGUE DE LA PAGE ─────────────────────
// La page italienne affichait [Accessori, Donna, Uomo, Bambini, Casa, Elettronica, Libri e media, Hobby e
// collezionismo, Sport] : la 0.6.149 la jugeait française parce que « Sport » s'écrit pareil, et demandait
// « Vinted ne propose pas « Électronique » ». La règle : 3 libellés ou plus qui sont des racines d'une MÊME langue
// autre que le français — en ne comptant que les racines que le français n'a pas (« Sport ») — = page étrangère.
// Une page française n'en a jamais plus d'une (« Sport ») : mesuré sur les 15 langues ci-dessus.
// ⛔ Recopiée dans chrome-extension/content-scripts/vinted.js (RACINES_CATALOGUE_VINTED, l'extension n'importe pas ce
//    module) : scripts/vinted-langue-page-ouverte-selftest.mjs vérifie que les deux tables sont identiques.
export const RACINES_ETRANGERES_MIN = 3;

function comptesRacinesEtrangeres(liste: unknown): Array<{ l: LangueVinted; n: number }> {
  if (!Array.isArray(liste)) return [];
  const vus = new Set(liste.map(norm).filter(Boolean));
  const fr = new Set(Object.values(RACINES_CATALOGUE.fr).map(norm));
  return (Object.keys(RACINES_CATALOGUE) as LangueVinted[])
    .filter((l) => l !== "fr")
    .map((l) => ({ l, n: new Set(Object.values(RACINES_CATALOGUE[l]).map(norm).filter((t) => !fr.has(t) && vus.has(t))).size }))
    .filter((x) => x.n >= RACINES_ETRANGERES_MIN)
    .sort((a, b) => b.n - a.n);
}

/** Les langues NON françaises dont au moins 3 libellés de la liste sont des racines (hors racines françaises), de la plus représentée à la moins. */
export function languesEtrangeresDesRacines(liste: unknown): LangueVinted[] {
  return comptesRacinesEtrangeres(liste).map((x) => x.l);
}

/** LA langue étrangère d'une liste de racines (la plus représentée, sans ex æquo), ou null. */
export function langueEtrangereDesRacines(liste: unknown): LangueVinted | null {
  const c = comptesRacinesEtrangeres(liste);
  if (!c.length || (c.length > 1 && c[0].n === c[1].n)) return null;
  return c[0].l;
}

/** Langues dont les 5 libellés d'état sont EXACTEMENT cette liste (ordre indifférent). */
export function languesDeLaListeEtats(liste: unknown): LangueVinted[] {
  if (!Array.isArray(liste) || liste.length !== 5) return [];
  const vus = new Set(liste.map(norm));
  if (vus.size !== 5) return [];
  return (Object.keys(ETATS_VINTED) as LangueVinted[])
    .filter((l) => Object.values(ETATS_VINTED[l].libelles).every((t) => vus.has(norm(t))));
}

/**
 * La langue de la page Vinted d'un job, lue sur ce que Vinted a affiché à CE
 * compte. Chaque indice donne un ensemble de langues possibles ; on garde leur
 * intersection. Rend null dès que ce n'est pas UNE langue sans ambiguïté —
 * et le français n'est jamais « déduit » ici : un job français suit son
 * chemin d'aujourd'hui, sans rien de posé.
 */
export function langueVintedDuJob(indices: { racineCapturee?: unknown; listeEtatsRelevee?: unknown; racinesQuestion?: unknown }): LangueVinted | null {
  const ensembles: LangueVinted[][] = [];
  if (indices.racineCapturee != null && String(indices.racineCapturee).trim()) {
    ensembles.push(languesDeLaRacine(indices.racineCapturee));
  }
  if (indices.listeEtatsRelevee != null) {
    const l = languesDeLaListeEtats(indices.listeEtatsRelevee);
    if (l.length) ensembles.push(l);
  }
  // (29/10, lot B 4.1) Les racines qu'une question « categoryLevelChoice » de CE job a relevées sur la page (liste
  // affichée par Vinted à ce compte) : une seule langue étrangère sans ex æquo, sinon pas un indice.
  if (indices.racinesQuestion != null) {
    const l = langueEtrangereDesRacines(indices.racinesQuestion);
    if (l) ensembles.push([l]);
  }
  if (!ensembles.length) return null;
  let reste = ensembles[0];
  for (const e of ensembles.slice(1)) reste = reste.filter((l) => e.includes(l));
  if (reste.length !== 1) return null;
  return reste[0];
}
