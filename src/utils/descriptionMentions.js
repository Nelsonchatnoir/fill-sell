// ═══════════════════════════════════════════════════════════════════════════
// « TA DESCRIPTION PARLE D'UNE AUTRE PLATEFORME » (2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════
// La description de la vendeuse part telle quelle sur les trois autres
// plateformes (verrou anti-réécriture). Une description sur onze parle de
// Vinted, d'un transporteur ou de son dressing — publier « voir mon dressing »
// sur Leboncoin est au mieux étrange, au pire interdit.
//
// CE N'EST PAS UNE RÉÉCRITURE, ET CE N'EST PAS UN BLOCAGE : on le DIT, la
// vendeuse tranche. Sans réponse, la description part telle quelle. L'IA
// n'intervient jamais sur ce texte.
//
// LISTE FERMÉE, arbitrée par Nico le 07/09 après mesure. Taux constaté sur les
// 2 278 articles ayant une capture : 254 déclenchements, soit 11,15 % — sous
// le plafond de 11,8 % qu'il avait fixé. Contrôle des faux positifs : 1 157
// articles emploient envoi, colis, remise, lot, port ou taille SANS déclencher.
//
// ⛔ BORNES DE MOTS PARTOUT : jamais une correspondance à l'intérieur d'un mot
// (une marque « Vintedo » ou un modèle « Relaisport » ne déclenchent rien).
// ⛔ Ne jamais ajouter ici un mot du vocabulaire courant de la vente. Toute
// addition se REMESURE : si le taux dépasse 11,8 %, la liste est trop large.
// ═══════════════════════════════════════════════════════════════════════════

const TERMES = {
  plateformes: ["vinted", "leboncoin", "le bon coin", "beebs", "ebay", "videdressing", "vestiaire collective"],
  dressing: ["mon dressing", "mes autres articles", "mes autres annonces", "mon profil", "ma penderie", "mon armoire"],
  transporteurs: ["mondial relay", "point relais", "relais colis", "shop2shop", "colissimo", "chronopost"],
};

// Forme comparable : accents et casse gommés, apostrophes unifiées. On ne
// touche PAS au texte publié — c'est une lecture, jamais une réécriture.
const comparable = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'`]/g, "'").replace(/\s+/g, " ").toLowerCase();

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Les mentions d'une autre plateforme dans une description, ou null.
 * @returns {{termes: string[], familles: string[]} | null}
 */
export function mentionsAutrePlateforme(description) {
  const texte = comparable(description);
  if (!texte) return null;
  const trouves = [];
  const familles = new Set();
  for (const [famille, mots] of Object.entries(TERMES)) {
    for (const mot of mots) {
      // (?<![a-z0-9]) / (?![a-z0-9]) : bornes de mot qui tiennent avec les
      // espaces internes (« mondial relay ») là où \b échouerait.
      const re = new RegExp(`(?<![a-z0-9])${echapper(comparable(mot))}(?![a-z0-9])`);
      if (re.test(texte)) { trouves.push(mot); familles.add(famille); }
    }
  }
  return trouves.length ? { termes: trouves, familles: [...familles] } : null;
}

/** Phrase affichée à la vendeuse — nomme ce qui a été trouvé, sans juger. */
export function messageMentions(mentions, lang = "fr") {
  if (!mentions) return null;
  const liste = mentions.termes.slice(0, 3).map((t) => `« ${t} »`).join(", ");
  return lang === "en"
    ? `Your Vinted description mentions ${liste}. It will be published as is on the other platforms — edit it if you'd rather not. On Leboncoin, which rejects any mention of another website, mentions of Vinted, eBay, Beebs and web addresses are removed automatically at posting time.`
    : `Ta description Vinted mentionne ${liste}. Elle part telle quelle sur les autres plateformes — modifie-la si tu préfères. Sur Leboncoin, qui refuse toute mention d'un autre site, les mentions de Vinted, eBay, Beebs et les adresses web sont retirées automatiquement au dépôt.`;
}

export const _internes = { TERMES, comparable };
