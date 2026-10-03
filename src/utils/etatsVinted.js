// ═══════════════════════════════════════════════════════════════════════════
// LES ÉTATS VINTED S'AFFICHENT DANS LA LANGUE DE L'APP (03/10, point E — dew)
// ═══════════════════════════════════════════════════════════════════════════
// Une boutique Vinted servie dans une autre langue (dew : formulaire en
// anglais) rend ses libellés d'état tels que la PAGE les affiche — « Very
// good », « New with tags »… L'extension les recopie dans sa question (le
// sélecteur de la page n'accepte qu'eux), et l'app les affichait tels quels :
// « Condition (accepte : New with tags · New without tags · Very good · Good ·
// Satisfactory) », puis un sélecteur en anglais dans « ✋ Compléter ».
//
// LA RÈGLE : la VALEUR envoyée à la page reste celle de la page ; ce qui
// S'AFFICHE est le libellé de la langue de l'app, retrouvé par l'identifiant
// Vinted de l'état (status_id), le même dans toutes les langues.
//
// La table est la copie des libellés de ETATS_VINTED
// (supabase/functions/_shared/vinted-pays.ts) : selftest:etats-vinted-affiches
// échoue au premier écart entre les deux.

export const LIBELLES_ETATS_VINTED = {
  fr: { 6: "Neuf avec étiquette", 1: "Neuf sans étiquette", 2: "Très bon état", 3: "Bon état", 4: "Satisfaisant" },
  it: { 6: "Nuovo con cartellino", 1: "Nuovo senza cartellino", 2: "Ottime", 3: "Buone", 4: "Discrete" },
  en: { 6: "New with tags", 1: "New without tags", 2: "Very good", 3: "Good", 4: "Satisfactory" },
  es: { 6: "Nuevo con etiquetas", 1: "Nuevo sin etiquetas", 2: "Muy bueno", 3: "Bueno", 4: "Satisfactorio" },
  de: { 6: "Neu, mit Etikett", 1: "Neu", 2: "Sehr gut", 3: "Gut", 4: "Zufriedenstellend" },
  nl: { 6: "Nieuw met prijskaartje", 1: "Nieuw zonder prijskaartje", 2: "Heel goed", 3: "Goed", 4: "Veelgebruikt" },
  pt: { 6: "Novo com etiquetas", 1: "Novo sem etiquetas", 2: "Muito bom", 3: "Bom", 4: "Satisfatório" },
  fi: { 6: "Uusi, jossa hintalappu", 1: "Uusi ilman hintalappua", 2: "Erittäin hyvä", 3: "Hyvä", 4: "Tyydyttävä" },
  et: { 6: "Uus koos hinnasildiga", 1: "Uus ilma hinnasildita", 2: "Väga hea", 3: "Hea", 4: "Rahuldav" },
  lv: { 6: "Jauna prece ar etiķetēm", 1: "Jauna prece bez etiķetēm", 2: "Ļoti labs", 3: "Labs", 4: "Apmierinošs" },
  lt: { 6: "Nauja su etiketėmis", 1: "Nauja be etikečių", 2: "Labai gera", 3: "Gera", 4: "Patenkinama" },
  sk: { 6: "Nové s visačkou", 1: "Nové bez visačky", 2: "Veľmi dobré", 3: "Dobré", 4: "Uspokojivé" },
  sl: { 6: "Novo z etiketo", 1: "Novo brez etikete", 2: "Zelo dobro", 3: "Dobro", 4: "Zadovoljivo" },
  hr: { 6: "Novo s etiketama", 1: "Novo bez etiketa", 2: "Veoma dobro", 3: "Dobro", 4: "Zadovoljavajuće" },
  el: { 6: "Νέο με ετικέτες", 1: "Νέο χωρίς ετικέτες", 2: "Πολύ καλό", 3: "Καλό", 4: "Ικανοποιητικό" },
};

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// libellé (toutes langues, normalisé) → status_id
const PAR_LIBELLE = new Map();
for (const libelles of Object.values(LIBELLES_ETATS_VINTED)) {
  for (const [id, texte] of Object.entries(libelles)) PAR_LIBELLE.set(norm(texte), Number(id));
}

const texteOption = (o) => String(typeof o === "string" ? o : (o?.title ?? o?.label ?? o?.value ?? "")).trim();

/** status_id Vinted d'un libellé d'état, quelle que soit sa langue — null sinon. */
export function idEtatVinted(valeur) {
  return PAR_LIBELLE.get(norm(valeur)) ?? null;
}

/** Le libellé à AFFICHER pour une valeur d'état Vinted : celui de la langue
 *  de l'app. Une valeur qui n'est pas un état connu revient telle quelle. */
export function libelleEtatVinted(valeur, lang = "fr") {
  const brut = String(valeur ?? "");
  const id = idEtatVinted(brut);
  if (!id) return brut;
  return LIBELLES_ETATS_VINTED[lang === "en" ? "en" : "fr"][id] ?? brut;
}

/** Toutes les valeurs de la liste sont-elles des états Vinted (au moins une) ? */
export function estListeEtatsVinted(valeurs) {
  const l = (Array.isArray(valeurs) ? valeurs : []).map(texteOption).filter(Boolean);
  return l.length > 0 && l.every((v) => idEtatVinted(v) != null);
}

/** La question porte-t-elle sur l'état Vinted ? (clé du champ, ou liste
 *  offerte faite uniquement d'états). */
export function estChampEtatVinted(platform, champ) {
  if (platform !== "vinted" || !champ || typeof champ !== "object") return false;
  const cle = norm(champ.field_key ?? champ.target?.key);
  if (cle === "condition" || cle === "status" || cle === "etat" || cle === "status_id") return true;
  return estListeEtatsVinted(champ.allowed_values);
}

/** Le nom du champ « état » dans la langue de l'app. */
export function nomChampEtat(lang = "fr") {
  return lang === "en" ? "Condition" : "État";
}

/**
 * Dans un message de l'extension Vinted : chaque « <Champ> (accepte : a · b) »
 * dont les valeurs sont TOUTES des états Vinted est réécrit dans la langue de
 * l'app — le nom du champ comme les valeurs. Tout autre texte passe intact.
 */
export function etatsVintedLisibles(texte, platform, lang = "fr") {
  const t = String(texte ?? "");
  if (platform !== "vinted" || !t.includes("(accepte :")) return t;
  return t.replace(/([^:,.()]+?) \(accepte : ([^)]*)\)/g, (tout, champ, liste) => {
    const valeurs = liste.split(" · ").map((v) => v.trim()).filter(Boolean);
    if (!estListeEtatsVinted(valeurs)) return tout;
    const debut = champ.match(/^\s*/)[0];
    return `${debut}${nomChampEtat(lang)} (accepte : ${valeurs.map((v) => libelleEtatVinted(v, lang)).join(" · ")})`;
  });
}
