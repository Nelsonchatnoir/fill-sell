// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION AUTO RETENUE PAR SON CRÉNEAU LE DIT (02/10 soir, point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Règle inchangée (Nico, 12/09) : aucune republication AUTOMATIQUE ne part hors
// du créneau choisi ; un créneau manqué n'est pas rattrapé, le job attend le
// suivant. Ce qui manquait : le job gardait le message de son dernier essai.
// jocabroc8 520ece42 (« Lot 2 plats creux… ») affichait depuis le 01/10 19:01
// « On réessaie tout seuls dans trois quarts d'heure », alors qu'il était
// retenu à chaque poll du lendemain (poste allumé seulement HORS de son créneau
// 19:00–22:00) et que rien ne pouvait partir avant le créneau suivant.
// Le message dit l'heure de reprise (celle que rend le serveur SQL,
// republish_planifiee_fenetres_courantes) et la condition : Chrome ouvert à ce
// moment-là. Pur (Deno + Node).

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla" };

function quand(reprise) {
  const t = Date.parse(String(reprise ?? ""));
  if (!Number.isFinite(t)) return null;
  try {
    const jour = new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "2-digit" });
    const heure = new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    return `${jour} à ${heure}`;
  } catch { return null; }
}

/** Le message d'une republication auto retenue hors de son créneau. */
export function messageRetenueCreneau(platform, reprise) {
  const nom = NOM[platform] ?? platform ?? "";
  const q = quand(reprise);
  return `Republication automatique ${nom ? `${nom} ` : ""}en attente de ton créneau : elle repartira ` +
    (q ? `${q} ` : "à l'ouverture de ton prochain créneau ") +
    "(heure de Paris), si Chrome est ouvert sur ton ordinateur à ce moment-là. Ton annonce est intacte, rien n'a été retiré.";
}
