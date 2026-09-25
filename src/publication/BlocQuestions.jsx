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
import { questionsAPoser, aspectBloquant } from "./moteur/regles";
import { genericFieldToSharedKey, SHARED_PROPAGATION, NO_BRAND_VALUE, PLATFORM_LABELS } from "./moteur/champsPartages";
import { listeFaitFoiRelevee } from "./moteur/listes";
import { VINTED_COLORS } from "../utils/vintedColors";
import { Carte, Puce } from "./composants";
import { NOM } from "./texte";

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
  };
  const [stickyGeneric, setStickyGeneric] = useState(() => ({}));
  const toucherGeneric = (gp, key) => setStickyGeneric(prev => {
    const cur = prev[gp] ?? new Set();
    return cur.has(key) ? prev : { ...prev, [gp]: new Set([...cur, key]) };
  });
  const [stickyEbay, setStickyEbay] = useState(() => new Set());
  const toucherEbay = (name) => setStickyEbay(prev => prev.has(name) ? prev : new Set([...prev, name]));
  // La description Vinted saisie ici reste sous les yeux (comme les autres
  // réponses) : elle ne disparaît plus au premier caractère tapé.
  const [descriptionTouchee, setDescriptionTouchee] = useState(false);

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
  const total = q.redTotal + (demandePrixAchat ? 1 : 0) + (montrerDescription ? 1 : 0);
  if (!total && !m.vintedGenreBlocked && !m.beebsGenreBlocked) return null;
  const restants = q.redRestants + (m.prixAchatManquant ? 1 : 0) + (descriptionVide ? 1 : 0);

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
                  onChange={v => { toucherShared(key); m.setSharedField(key, v); }}
                  T={TN}
                  tailleTexte={16}
                  idBase="fsn-shared-couleur"
                />
              ) : field.type === "select" ? (
                <select className="fsn-select" value={val} onChange={ev => { toucherShared(key); m.setSharedField(key, ev.target.value); }}>
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
                <input className="fsn-input" type="text" value={val} placeholder="—" onChange={ev => { toucherShared(key); m.setSharedField(key, ev.target.value); }} />
              )}
              {key === "marque" && (
                <button type="button" className={`fsn-choice${val === NO_BRAND_VALUE ? " fsn-choice--on" : ""}`} style={{ alignSelf: "flex-start" }}
                  onClick={() => { toucherShared("marque"); m.setSharedField("marque", NO_BRAND_VALUE); }}>
                  {val === NO_BRAND_VALUE ? "✓ " : ""}{t("fieldBrandNone")}
                </button>
              )}
            </div>
          );
        })}

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
            toucherGeneric(gp, a.key);
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
                {a.state === "invalid"
                  ? (en ? `“${a.value}” is not in the list this platform accepts.` : `« ${a.value} » n'est pas dans la liste que cette plateforme accepte.`)
                  : (a.allowedValues?.length
                      ? (en ? "Required here — the values come from its form." : "Exigé ici — les valeurs viennent de son formulaire.")
                      : (en ? "Required here — free text." : "Exigé ici — texte libre."))}
              </div>
              <AspectValueInput
                value={a.state === "invalid" ? (a.suggested ?? a.value ?? "") : a.value}
                allowedValues={a.allowedValues}
                strict={false}
                closedMax={faitFoi ? m.EBAY_CLOSED_LIST_MAX : undefined}
                onChange={ecrire}
                T={TN}
                tailleTexte={16}
                idBase={`fsn-gen-${gp}-${slug(a.key)}`}
              />
              {sk === "marque" && (
                <button type="button" className={`fsn-choice${a.value === NO_BRAND_VALUE ? " fsn-choice--on" : ""}`} style={{ alignSelf: "flex-start" }}
                  onClick={() => ecrire(NO_BRAND_VALUE)}>
                  {a.value === NO_BRAND_VALUE ? "✓ " : ""}{t("fieldBrandNone")}
                </button>
              )}
            </div>
          );
        })}

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
                toucherEbay(a.name);
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

      {m.vintedGenreBlocked && <div className="fsn-card-p">{t("vintedGenreRequired")}</div>}
      {m.beebsGenreBlocked && <div className="fsn-card-p">{t("beebsGenreRequired")}</div>}
    </Carte>
  );
}
