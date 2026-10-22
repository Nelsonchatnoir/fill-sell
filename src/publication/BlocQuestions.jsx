// ═══════════════════════════════════════════════════════════════════════════
// LES QUESTIONS — UN SEUL ENDROIT DE SAISIE (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// L'encart rouge de l'ancien écran Publier, refait : mêmes sources (champs
// partagés manquants, aspects Vinted/LBC/Beebs bloquants, aspects eBay
// bloquants), même règle de déduplication, même « sticky » (un champ où la
// personne a écrit ne se démonte jamais sous ses doigts — fix du 30/07 et du
// 07/09), même écriture (le champ DÉDIÉ prime sur le canal générique — leçon
// RoCotCot). La sélection vit dans moteur/regles.js (questionsAPoser) : c'est
// la même fonction que l'ancien écran appelle depuis ce lot.
// Ce qui change : chaque question dit QUI la pose et pourquoi, les champs
// font 16 px, une seule couleur (ambre = un geste), et l'encart passe au vert
// dès que plus rien ne bloque.
import { useState } from "react";
import { AspectValueInput } from "../components/ListingPreviewScreen";
import { ISBN_ABSENT } from "../../supabase/functions/_shared/vinted-exigences.js";
import { questionsAPoser, aspectBloquant, propagerReponseTaille, tailleAmbigue } from "./moteur/regles";
import { genericFieldToSharedKey, SHARED_PROPAGATION, NO_BRAND_VALUE, PLATFORM_LABELS } from "./moteur/champsPartages";
import { listeFaitFoiRelevee, listeCandidatsDabord, champARecherche, valeurUneLettre } from "./moteur/listes";
import { tailleDansGrille } from "../../supabase/functions/_shared/tailles.js";
import { VINTED_COLORS } from "../utils/vintedColors";
import { Carte, Puce } from "./composants";
import { NOM } from "./texte";
import { posesMemoireVisibles } from "./moteur/memoireCategorie";
import { phraseGenreAChoisir, phraseGenreDeduit } from "./moteur/genreAChoisir";

// L'objet de jetons attendu par AspectValueInput : des variables, jamais des
// couleurs en dur.
const TN = { border: "var(--fs-border)", chip: "var(--fs-card)", ink: "var(--fs-ink)", mute: "var(--fs-mute2)" };
const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function BlocQuestions({ m }) {
  const en = m.lang === "en";
  const t = m.t; const tpl = m.tpl;
  const fieldsCfg = m.platformFieldsConfig;
  const sharedFieldCfg = {
    taille:  fieldsCfg.vinted.find(f => f.key === "taille"),
    couleur: { key: "couleur", label: t("fieldColorLabel"),    type: "text" },
    matiere: { key: "matiere", label: t("fieldMaterialLabel"), type: "text" },
    marque:  { key: "marque",  label: t("fieldBrandLabel"),    type: "text" },
  };
  const [stickyShared, setStickyShared] = useState(() => new Set());
  const toucherShared = (key) => {
    setStickyShared(prev => prev.has(key) ? prev : new Set([...prev, key]));
    m.noterReponseFiche?.(key); // sa réponse ira sur la fiche au publish
    // (18/10, zéro friction) La télémétrie sait que c'est la personne qui a répondu.
    m.noterGesteQuestion?.(`partage:${key}`);
  };
  // (03/10, cas Ornella) La réponse va sur les plateformes que la question
  // nomme, même quand leur copie a été retouchée à la main — sinon « Bonobo »
  // restait dans le champ et la copie Vinted sur « B » (moteur/reponsesPartagees).
  const repondre = (key, v) => (m.repondreChampPartage ?? m.setSharedField)(key, v);
  const [stickyGeneric, setStickyGeneric] = useState(() => ({}));
  const toucherGeneric = (gp, key) => {
    m.noterGesteQuestion?.(`${gp}:${key}`);
    setStickyGeneric(prev => {
      const cur = prev[gp] ?? new Set();
      return cur.has(key) ? prev : { ...prev, [gp]: new Set([...cur, key]) };
    });
  };
  const [stickyEbay, setStickyEbay] = useState(() => new Set());
  const toucherEbay = (name) => {
    m.noterGesteQuestion?.(`ebay:${name}`);
    setStickyEbay(prev => prev.has(name) ? prev : new Set([...prev, name]));
  };
  // La description Vinted saisie ici reste sous les yeux (comme les autres
  // réponses) : elle ne disparaît plus au premier caractère tapé.
  const [descriptionTouchee, setDescriptionTouchee] = useState(false);

  // ── LA TAILLE, RÉPONDUE UNE FOIS (02/10, point 11) ──────────────────────
  // Toutes les plateformes cochées qui portent une taille, avec leur grille :
  // une réponse donnée pour l'une s'écrit chez les autres là où elle vaut
  // (moteur/regles.propagerReponseTaille) — jamais par-dessus une réponse.
  const lignesTaille = () => {
    const out = [];
    for (const [gp, list] of Object.entries(m.genericRequiredStatus ?? {})) {
      const a = (list ?? []).find(x => genericFieldToSharedKey(gp, x.key) === "taille");
      if (a) out.push({ gp, a, valeur: a.value ?? "", allowedValues: a.allowedValues, enQuestion: a.state === "invalid" || a.state === "missing", repondue: Boolean(stickyGeneric[gp]?.has(a.key)) });
    }
    const e = (m.ebayRequiredStatus ?? []).find(x => x.sharedKey === "taille" || x.name === "Taille");
    if (e) out.push({ gp: "ebay", a: e, valeur: e.value ?? "", allowedValues: e.allowedValues, enQuestion: e.state === "invalid" || e.state === "missing", repondue: stickyEbay.has(e.name) });
    return out;
  };
  // Écrit une taille sur UNE plateforme, par le canal de sa ligne (le champ
  // DÉDIÉ d'abord — leçon RoCotCot), et la garde sous les yeux.
  const ecrireTaille = (gp, a, v) => {
    if (gp === "ebay") {
      toucherEbay(a?.name ?? "Taille");
      if (m.setPlatformDedicatedField) m.setPlatformDedicatedField("ebay", "taille", v);
      else if (m.setEbaySharedField) m.setEbaySharedField("taille", v);
      return;
    }
    if (!a) return;
    toucherGeneric(gp, a.key);
    if (a.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(gp, a.dedicatedTarget, v);
    else m.setPlatformAspect(gp, a.key, v);
  };
  const repondreTaille = (gp, a, v) => {
    const lignes = lignesTaille();
    // Seul un CHOIX dans la grille se propage — jamais une frappe en cours
    // (« Autre valeur… » écrit à chaque touche : « S » de « S/M » partirait).
    const choisie = Array.isArray(a?.allowedValues) && a.allowedValues.includes(v);
    const ecritures = choisie
      ? propagerReponseTaille({ gp, valeur: v, avant: a?.value ?? "", ambigu: tailleAmbigue(a?.value, a?.allowedValues), lignes })
      : [{ gp, valeur: v }];
    for (const { gp: p, valeur } of ecritures) ecrireTaille(p, p === gp ? a : lignes.find(l => l.gp === p)?.a, valeur);
    m.noterReponseFicheValeur?.("taille", v);
  };

  const q = questionsAPoser({
    missingSharedFields: m.redSharedFields, sharedFieldCfg, stickyShared,
    genericRequiredStatus: m.genericRequiredStatus, stickyGeneric, canGeneric: Boolean(m.setPlatformAspect),
    ebayRequiredStatus: m.ebayRequiredStatus, stickyEbay, canEbay: Boolean(m.setEbayAspect),
    genericFieldToSharedKey, SHARED_PROPAGATION, peutDecocher: Boolean(m.setSelected),
  });

  // Les questions HORS aspects : prix d'achat, description Vinted, genre.
  const demandePrixAchat = m.demanderPrixAchat;
  const descriptionVide = m.descriptionVideVinted;
  const montrerDescription = descriptionVide || (descriptionTouchee && m.selected?.has("vinted"));
  // (22/10 soir, point 4 — Louis) Le rayon (genre) à choisir est une VRAIE
  // question : comptée, et posée avec ses rayons valides. Avant, l'encart
  // pouvait dire « Tout est complété » au-dessus d'un Publier grisé.
  const genresBloques = ["vinted", "beebs"].filter(p => m[`${p}GenreBlocked`]);
  const genresPoses = Object.entries(m.genresDeduits ?? {}).filter(([p]) => m.selected?.has?.(p) ?? true);
  const total = q.redTotal + (demandePrixAchat ? 1 : 0) + (montrerDescription ? 1 : 0) + genresBloques.length;
  // (18/10 nuit, point 1) Ce que la mémoire « compte × catégorie » a posé sur
  // cet article : visible, et modifiable — jamais une valeur posée en silence.
  const poses = posesMemoireVisibles(m);
  if (!total && !poses.length && !genresPoses.length) return null;
  const restants = q.redRestants + (m.prixAchatManquant ? 1 : 0) + (descriptionVide ? 1 : 0) + genresBloques.length;

  const origine = (texte) => texte ? <span className="qui"> · {texte}</span> : null;

  return (
    <Carte gravite={restants > 0 ? "geste" : "info"} style={{ gap: 12 }}>
      <div className="fsn-row fsn-row--between">
        <div className="fsn-card-t">
          {restants > 0
            ? (restants === 1 ? (en ? "One question before publishing" : "Une question avant de publier") : (en ? `${restants} questions before publishing` : `${restants} questions avant de publier`))
            : (en ? "Everything is filled in — you can publish" : "Tout est complété — tu peux publier")}
        </div>
        <Puce ton={restants > 0 ? "geste" : "ok"}>{restants > 0 ? (en ? `${restants} to fill in` : `${restants} à compléter`) : "✓"}</Puce>
      </div>
      <p className="fsn-card-p">
        {restants > 0
          ? (en ? "Each answer is written on the item card too: you won't be asked again." : "Chaque réponse s'écrit aussi sur la fiche de l'article : on ne te la redemandera pas.")
          : (en ? "What you typed stays below — you can still adjust it." : "Ce que tu as saisi reste ci-dessous — tu peux encore l'ajuster.")}
      </p>

      <div className="fsn-grid2">
        {/* Prix d'achat : demandé à un article né de ce parcours. VIDE ≠ ZÉRO,
            et « je ne sais plus » existe enfin ici (jamais un 0 écrit à la
            place d'un « je ne sais pas »). */}
        {demandePrixAchat && (
          <div className="fsn-q fsn-q--bloque" style={{ gridColumn: "1 / -1" }}>
            <div className="fsn-q-t">{t("stepPublishBuyPriceLabel")}</div>
            <div className="fsn-q-why">{en ? "For your margin. Zero is a valid answer (a gift); if you don't remember, say so." : "Pour ta marge. Zéro est une réponse valable (un cadeau) ; si tu ne sais plus, dis-le."}</div>
            <div className="fsn-row fsn-row--wrap">
              <input
                className="fsn-input" type="number" inputMode="decimal" style={{ flex: "1 1 140px" }}
                value={m.prixAchatInconnu ? "" : m.prixAchatSaisi}
                disabled={m.prixAchatInconnu}
                onChange={ev => { m.setPrixAchatSaisi(ev.target.value); }}
                placeholder={t("stepPublishBuyPricePlaceholder")}
              />
              <button type="button" className={`fsn-choice${m.prixAchatInconnu ? " fsn-choice--on" : ""}`} onClick={() => m.setPrixAchatInconnu(!m.prixAchatInconnu)}>
                {m.prixAchatInconnu ? "✓ " : ""}{en ? "I don't remember" : "Je ne sais plus"}
              </button>
            </div>
          </div>
        )}

        {/* Description Vinted vide : SES mots, jamais un texte inventé. */}
        {montrerDescription && (
          <div className={`fsn-q${descriptionVide ? " fsn-q--bloque" : ""}`} style={{ gridColumn: "1 / -1" }}>
            <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{t("fieldDescriptionLabel")}</div><Puce ton={descriptionVide ? "geste" : "ok"}>Vinted</Puce></div>
            <div className="fsn-q-why">{en ? "Vinted refuses a listing without a description. Write it in your own words." : "Vinted refuse une annonce sans description. Écris-la avec tes mots."}</div>
            <textarea className="fsn-textarea" value={m.edited?.vinted?.description ?? ""} onChange={ev => { setDescriptionTouchee(true); m.modifierCarte("vinted", "description", ev.target.value); }} placeholder={en ? "Condition, size, what's included…" : "État, taille, ce qui est inclus…"} />
          </div>
        )}

        {q.sharedFieldsToRender.map((key) => {
          const field = sharedFieldCfg[key];
          const val = m.sharedFields[key] ?? "";
          const fieldGroups = field.childGroups && m.sharedChildAxes
            ? [...field.childGroups.filter(g => g.axis === "shoes" || m.sharedChildAxes[g.axis]), ...field.groups]
            : field.groups;
          const originLabel = m.redSharedFieldPlatforms[key];
          const manque = m.redSharedFields.includes(key);
          // (25/09) La Couleur exigée par Vinted se choisit dans SA palette
          // (29 libellés, globale) : une couleur tapée hors palette ne se
          // normalise pas et repartait sans couleur — le 400 qu'on corrige.
          // La réponse sert toujours à toutes les plateformes cochées.
          const paletteVinted = key === "couleur"
            && (m.genericRequiredStatus?.vinted ?? []).some(a => a.key === "color");
          return (
            <div key={key} className={`fsn-q${manque ? " fsn-q--bloque" : ""}`}>
              <div className="fsn-q-t">{field.label}{origine(originLabel)}</div>
              <div className="fsn-q-why">{en ? "Required by these platforms. One answer serves them all." : "Exigé par ces plateformes. Une réponse sert à toutes."}</div>
              {paletteVinted ? (
                <AspectValueInput
                  value={val}
                  allowedValues={VINTED_COLORS}
                  strict
                  closedMax={m.EBAY_CLOSED_LIST_MAX}
                  onChange={v => { toucherShared(key); repondre(key, v); }}
                  T={TN}
                  tailleTexte={16}
                  idBase="fsn-shared-couleur"
                />
              ) : field.type === "select" ? (
                <select className="fsn-select" value={val} onChange={ev => { toucherShared(key); repondre(key, ev.target.value); }}>
                  <option value="">—</option>
                  {fieldGroups
                    ? fieldGroups.map(g => (
                        <optgroup key={g.groupLabel} label={g.groupLabel}>
                          {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))
                    : field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className="fsn-input" type="text" value={val} placeholder="—" onChange={ev => { toucherShared(key); repondre(key, ev.target.value); }} />
              )}
              {/* Une lettre n'est une marque, une couleur ni une matière pour
                  aucune plateforme : on dit pourquoi le champ reste à compléter,
                  au lieu d'un bouton gris sans explication. */}
              {key !== "taille" && valeurUneLettre(val) && (
                <div className="fsn-q-why">{en ? "One letter isn't enough: type it in full." : "Une seule lettre ne suffit pas : écris-la en entier."}</div>
              )}
              {key === "marque" && (
                <button type="button" className={`fsn-choice${val === NO_BRAND_VALUE ? " fsn-choice--on" : ""}`} style={{ alignSelf: "flex-start" }}
                  onClick={() => { toucherShared("marque"); repondre("marque", NO_BRAND_VALUE); }}>
                  {val === NO_BRAND_VALUE ? "✓ " : ""}{t("fieldBrandNone")}
                </button>
              )}
            </div>
          );
        })}

        {/* La taille, UNE question pour les plateformes qui ne savent pas
            l'écrire (02/10, point 11) : une seule réponse quand une valeur
            vaut dans toutes leurs grilles, sinon la grille de chacune — dans
            la même question, ses candidates en tête. */}
        {q.questionTaille && (() => {
          const qt = q.questionTaille;
          const bloque = qt.lignes.some(({ a }) => aspectBloquant(a));
          const noms = qt.lignes.map(({ gp }) => NOM(gp)).join(" · ");
          const brut = qt.lignes.map(({ a }) => String(a.value ?? "").trim()).find(Boolean) ?? "";
          if (qt.mode === "une") {
            const valeurs = qt.lignes.map(({ a }) => String(a.value ?? "").trim());
            const commune = qt.communes.find(c => valeurs.every((v, i) => v && tailleDansGrille(c, qt.lignes[i].a.allowedValues)?.valeur === v)) ?? "";
            return (
              <div key="taille-unique" className={`fsn-q${bloque ? " fsn-q--bloque" : ""}`} style={{ gridColumn: "1 / -1" }}>
                <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{en ? "Size" : "Taille"}</div><Puce ton={bloque ? "geste" : "ok"}>{noms}</Puce></div>
                <div className="fsn-q-why">
                  {brut
                    ? (en ? `“${brut}” can't be written as is on ${noms}: choose once, it's written for each.` : `« ${brut} » ne s'écrit pas tel quel sur ${noms} : choisis une fois, on l'écrit pour chacune.`)
                    : (en ? `Required on ${noms}: choose once, it's written for each.` : `Exigée sur ${noms} : choisis une fois, on l'écrit pour chacune.`)}
                </div>
                <AspectValueInput
                  value={commune}
                  allowedValues={qt.communes}
                  strict
                  closedMax={m.EBAY_CLOSED_LIST_MAX}
                  onChange={v => {
                    for (const { gp, a } of qt.lignes) ecrireTaille(gp, a, tailleDansGrille(v, a.allowedValues)?.valeur ?? v);
                    m.noterReponseFicheValeur?.("taille", v);
                  }}
                  T={TN}
                  tailleTexte={16}
                  idBase="fsn-taille-commune"
                />
              </div>
            );
          }
          return (
            <div key="taille-par-grille" className={`fsn-q${bloque ? " fsn-q--bloque" : ""}`} style={{ gridColumn: "1 / -1" }}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{en ? "Size" : "Taille"}</div><Puce ton={bloque ? "geste" : "ok"}>{noms}</Puce></div>
              <div className="fsn-q-why">
                {en
                  ? `${brut ? `“${brut}”` : "This size"} has no single equivalent in these grids: choose it in each one (likely options first). An answer is reused wherever it fits.`
                  : `${brut ? `« ${brut} »` : "Cette taille"} n'a pas d'équivalent unique dans ces grilles : choisis-la dans chacune (les options probables en tête). Une réponse resservira partout où elle vaut.`}
              </div>
              {qt.lignes.map(({ gp, a, candidats }) => (
                <div key={`t:${gp}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="fsn-row fsn-row--between"><span className="fsn-q-why">{NOM(gp)}</span><Puce ton={aspectBloquant(a) ? "geste" : "ok"}>{aspectBloquant(a) ? (en ? "to choose" : "à choisir") : "✓"}</Puce></div>
                  <AspectValueInput
                    value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
                    allowedValues={candidats.length ? listeCandidatsDabord(a.allowedValues, candidats) : a.allowedValues}
                    strict={gp === "ebay" ? a.mode === "SELECTION_ONLY" : false}
                    closedMax={m.EBAY_CLOSED_LIST_MAX}
                    onChange={v => repondreTaille(gp, a, v)}
                    T={TN}
                    tailleTexte={16}
                    idBase={`fsn-taille-${gp}`}
                  />
                </div>
              ))}
            </div>
          );
        })()}

        {q.redGenericAspects.map(({ gp, a }) => {
          // (25/09) Rayon Vinted « neuf seulement » face à un article d'occasion :
          // aucune valeur à choisir (la seule serait « Neuf », un mensonge) —
          // le message dit de changer de rayon, ou de laisser Vinted de côté.
          if (a.neufSeulement) return (
            <div key={`g:${gp}:${a.key}`} className="fsn-q fsn-q--bloque" style={{ gridColumn: "1 / -1" }}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{a.label}</div><Puce ton="geste">{NOM(gp)}</Puce></div>
              <div className="fsn-q-why">{a.message}</div>
              {m.setSelected && (
                <div className="fsn-btn-row">
                  <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm"
                    onClick={() => m.setSelected(prev => { const s = new Set(prev); s.delete(gp); return s; })}>
                    {en ? `Don't publish on ${NOM(gp)}` : `Ne pas publier sur ${NOM(gp)}`}
                  </button>
                </div>
              )}
            </div>
          );
          const seule = q.genSeule({ a }) ? a.allowedValues[0] : null;
          // (chantier du 24/09) La réponse écrit la copie de la plateforme, et
          // se note pour la fiche quand le champ est un champ de l'article
          // (taille, marque, couleur, matière) — écrite au publish si la fiche
          // ne porte encore rien (jamais par-dessus le texte du vendeur).
          const sk = genericFieldToSharedKey(gp, a.key);
          const ecrire = (v) => {
            // Une taille répondue ici vaut aussi ailleurs (02/10, point 11).
            if (sk === "taille") { repondreTaille(gp, a, v); return; }
            toucherGeneric(gp, a.key);
            // (18/10 nuit) Une réponse à un champ du RAYON est retenue au clic
            // Publier (moteur/memoireCategorie) — seulement un choix dans la liste.
            m.noterReponseQuestion?.(gp, a, v);
            if (a.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(gp, a.dedicatedTarget, v);
            else m.setPlatformAspect(gp, a.key, v);
            if (sk) m.noterReponseFicheValeur?.(sk, v);
          };
          // Une liste qui FAIT FOI (fermée, entière : grille de tailles Opla à
          // 37 valeurs, paliers Beebs) se choisit dans un vrai sélecteur, même
          // longue — sous iOS, la liste de suggestions n'existe pas.
          const faitFoi = listeFaitFoiRelevee({ platform: gp, key: a.key, inputType: a.inputType, allowedValues: a.allowedValues });
          if (seule) return (
            <div key={`g:${gp}:${a.key}`} className="fsn-q fsn-q--bloque" style={{ gridColumn: "1 / -1" }}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{a.label}</div><Puce ton="geste">{NOM(gp)}</Puce></div>
              <div className="fsn-q-why">{tpl("stepPublishSingleValueMsg", { value: seule, platform: PLATFORM_LABELS[gp] ?? gp })}</div>
              <div className="fsn-btn-row">
                <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => ecrire(seule)}>{t("stepPublishSingleValueYes")}</button>
                <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={() => m.setSelected(prev => { const s = new Set(prev); s.delete(gp); return s; })}>{t("stepPublishSingleValueNo")}</button>
              </div>
            </div>
          );
          return (
            <div key={`g:${gp}:${a.key}`} className={`fsn-q${aspectBloquant(a) ? " fsn-q--bloque" : ""}`}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{a.label}</div><Puce ton={aspectBloquant(a) ? "geste" : "ok"}>{NOM(gp)}</Puce></div>
              <div className="fsn-q-why">
                {gp === "vinted" && a.key === "isbn"
                  ? (en ? "Vinted requires the ISBN of a book — on the back, under the barcode (978… or 979…)." : "Vinted exige l'ISBN d'un livre — au dos, sous le code-barres (978… ou 979…).")
                  : a.state === "invalid"
                  ? (en ? `“${a.value}” is not in the list this platform accepts.` : `« ${a.value} » n'est pas dans la liste que cette plateforme accepte.`)
                  : (a.allowedValues?.length
                      ? (en ? "Required here — the values come from its form." : "Exigé ici — les valeurs viennent de son formulaire.")
                      : (en ? "Required here — free text." : "Exigé ici — texte libre."))}
              </div>
              <AspectValueInput
                value={gp === "vinted" && a.key === "isbn" && a.value === ISBN_ABSENT ? "" : (a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value)}
                // (12/10, Morgane) L'ISBN se TAPE : jamais derrière « Autre valeur… ».
                allowedValues={gp === "vinted" && a.key === "isbn" ? [] : a.allowedValues}
                // (12/10, A10bis) Une liste qui FAIT FOI (fermée, entière) : une
                // valeur hors liste y est bloquante — « Autre valeur… » n'y menait
                // qu'à une impasse (Louis, « Moules noel »). Sélecteur fermé.
                strict={faitFoi}
                closedMax={faitFoi ? m.EBAY_CLOSED_LIST_MAX : undefined}
                // (03/10) Marque (et Modèle Vinted) : le référentiel de la
                // plateforme dépasse notre relevé — on tape, la liste suggère.
                libre={champARecherche(gp, a.key)}
                onChange={ecrire}
                T={TN}
                tailleTexte={16}
                idBase={`fsn-gen-${gp}-${slug(a.key)}`}
              />
              {gp === "vinted" && a.key === "isbn" && (
                <button type="button" className={`fsn-choice${a.value === ISBN_ABSENT ? " fsn-choice--on" : ""}`} style={{ alignSelf: "flex-start" }}
                  onClick={() => ecrire(ISBN_ABSENT)}>
                  {a.value === ISBN_ABSENT ? "✓ " : ""}{en ? "This book has no ISBN" : ISBN_ABSENT}
                </button>
              )}
              {sk === "marque" && (
                <button type="button" className={`fsn-choice${a.value === NO_BRAND_VALUE ? " fsn-choice--on" : ""}`} style={{ alignSelf: "flex-start" }}
                  onClick={() => ecrire(NO_BRAND_VALUE)}>
                  {a.value === NO_BRAND_VALUE ? "✓ " : ""}{t("fieldBrandNone")}
                </button>
              )}
            </div>
          );
        })}

        {genresBloques.map((p) => {
          const choix = m.genreAChoisir?.[p] ?? null;
          return (
            <div key={`genre:${p}`} className="fsn-q fsn-q--bloque" style={{ gridColumn: "1 / -1" }} data-question={`genre-${p}`}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{en ? "Section" : "Rayon"}</div><Puce ton="geste">{NOM(p)}</Puce></div>
              <div className="fsn-q-why">
                {choix ? phraseGenreAChoisir({ ...choix, nomPlateforme: NOM(p), lang: m.lang }) : t(p === "vinted" ? "vintedGenreRequired" : "beebsGenreRequired")}
              </div>
              {choix?.valides?.length > 0 && m.choisirGenre && (
                <div className="fsn-row fsn-row--wrap">
                  {choix.valides.map(g => (
                    <button key={g} type="button" className="fsn-choice" onClick={() => m.choisirGenre(p, g)}>{g}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {genresPoses.map(([p, d]) => {
          const valeur = d.change ?? d.valeur;
          return (
            <div key={`genre-pose:${p}`} className="fsn-q" style={{ gridColumn: "1 / -1" }} data-genre-deduit={p}>
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{en ? "Section" : "Rayon"}</div><Puce ton="ok">{NOM(p)}</Puce></div>
              <div className="fsn-q-why">
                {d.change
                  ? (en ? `Your answer: “${d.change}”.` : `Ta réponse : « ${d.change} ».`)
                  : phraseGenreDeduit(d, NOM(p), m.lang)}
              </div>
              {(d.valides ?? []).length > 1 && m.choisirGenre && (
                <div className="fsn-row fsn-row--wrap">
                  {d.valides.map(g => (
                    <button key={g} type="button" className={`fsn-choice${g === valeur ? " fsn-choice--on" : ""}`} onClick={() => m.choisirGenre(p, g)}>
                      {g === valeur ? "✓ " : ""}{g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {poses.map(({ k, pose, valeur }) => (
          <div key={`mem:${k}`} className="fsn-q" data-memoire={k}>
            <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{pose.label}</div><Puce ton="ok">{NOM(pose.plateforme)}</Puce></div>
            <div className="fsn-q-why">
              {pose.modifiee
                ? (en ? "Your answer — it will be remembered for this category." : "Ta réponse — elle sera retenue pour ce rayon.")
                : (en ? `Taken from your last answer for “${pose.categorie}”. Change it if this item is different.` : `Repris de ta dernière réponse pour « ${pose.categorie} ». Change-la si cet article est différent.`)}
            </div>
            <AspectValueInput
              value={valeur}
              allowedValues={pose.allowedValues}
              strict
              closedMax={m.EBAY_CLOSED_LIST_MAX}
              onChange={v => changerPoseMemoire(m, pose, v)}
              T={TN}
              tailleTexte={16}
              idBase={`fsn-mem-${slug(k)}`}
            />
          </div>
        ))}

        {/* Les dimensions eBay, UNE question (18/10, zéro friction) : un champ
            par dimension, côte à côte, chacun écrit dans son aspect eBay. */}
        {q.questionDimensions && (() => {
          const lignes = q.questionDimensions.lignes;
          const bloque = lignes.some(aspectBloquant);
          return (
            <div key="dimensions-ebay" className={`fsn-q${bloque ? " fsn-q--bloque" : ""}`} style={{ gridColumn: "1 / -1" }} data-question="dimensions">
              <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{en ? "Dimensions" : "Dimensions"}</div><Puce ton={bloque ? "geste" : "ok"}>eBay</Puce></div>
              <div className="fsn-q-why">
                {en
                  ? `eBay requires them for this category, and nothing in your text or photos gives them. Measure once: ${lignes.map(a => (a.label ?? a.name).toLowerCase()).join(", ")} (e.g. “34 cm”).`
                  : `eBay les exige pour cette catégorie, et ni ton texte ni tes photos ne les donnent. Mesure une fois : ${lignes.map(a => (a.label ?? a.name).toLowerCase()).join(", ")} (par ex. « 34 cm »).`}
              </div>
              <div className="fsn-row fsn-row--wrap" style={{ gap: 8 }}>
                {lignes.map(a => (
                  <div key={`d:${a.name}`} style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px", minWidth: 0 }}>
                    <span className="fsn-q-why">{a.label ?? a.name}</span>
                    <AspectValueInput
                      value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
                      allowedValues={a.allowedValues}
                      strict={a.mode === "SELECTION_ONLY"}
                      closedMax={m.EBAY_CLOSED_LIST_MAX}
                      onChange={v => { toucherEbay(a.name); m.noterReponseQuestion?.("ebay", a, v); m.setEbayAspect(a.name, v); }}
                      T={TN}
                      tailleTexte={16}
                      idBase={`fsn-ebay-dim-${slug(a.name)}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {q.redEbayAspects.map(a => (
          <div key={`e:${a.name}`} className={`fsn-q${aspectBloquant(a) ? " fsn-q--bloque" : ""}`}>
            <div className="fsn-row fsn-row--between"><div className="fsn-q-t">{a.label ?? a.name}</div><Puce ton={aspectBloquant(a) ? "geste" : "ok"}>eBay</Puce></div>
            <div className="fsn-q-why">
              {a.state === "invalid"
                ? (en ? `“${a.value}” is not in eBay's list for this category.` : `« ${a.value} » n'est pas dans la liste eBay de cette catégorie.`)
                : (en ? "Required by eBay for this category." : "Exigé par eBay pour cette catégorie.")}
            </div>
            <AspectValueInput
              value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
              allowedValues={a.allowedValues}
              strict={a.mode === "SELECTION_ONLY"}
              closedMax={m.EBAY_CLOSED_LIST_MAX}
              onChange={v => {
                if (a.sharedKey === "taille") { repondreTaille("ebay", a, v); return; }
                toucherEbay(a.name);
                if (!a.sharedKey) m.noterReponseQuestion?.("ebay", a, v);
                if (a.sharedKey && m.setEbaySharedField) { m.noterReponseFiche?.(a.sharedKey); m.setEbaySharedField(a.sharedKey, v); }
                else m.setEbayAspect(a.name, v);
              }}
              T={TN}
              tailleTexte={16}
              idBase={`fsn-ebay-${slug(a.name)}`}
            />
          </div>
        ))}
      </div>

    </Carte>
  );
}

// ── LA MÉMOIRE « COMPTE × CATÉGORIE » (18/10 nuit, point 1) ───────────────
// La personne change une valeur posée par la mémoire : même canal que la
// question (champ dédié d'abord), et c'est SA réponse — retenue au publish.
function changerPoseMemoire(m, pose, v) {
  const ligne = { key: pose.champ, name: pose.champ, allowedValues: pose.allowedValues, dedicatedTarget: pose.dedicatedTarget };
  m.noterReponseQuestion?.(pose.plateforme, ligne, v);
  if (pose.plateforme === "ebay") { m.setEbayAspect?.(pose.champ, v); return; }
  if (pose.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(pose.plateforme, pose.dedicatedTarget, v);
  else m.setPlatformAspect?.(pose.plateforme, pose.champ, v);
}
