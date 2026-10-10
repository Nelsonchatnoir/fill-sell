// ═══════════════════════════════════════════════════════════════════════════
// LA BARRIÈRE D'ERREUR — UNE EXCEPTION NE BLANCHIT JAMAIS L'ÉCRAN (10/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Sans barrière, une exception levée pendant le rendu d'un composant démonte
// TOUT l'arbre React : page blanche, et au rechargement on revient au Stock
// (publication en lot, 09/10 22:13 → 10/10 : « userId is not defined » dès la
// fin de la préparation — Nico et Louis). Une barrière garde l'exception là
// où elle naît : ce qu'elle entoure est remplacé par `secours` (un nœud, ou
// une fonction (erreur, reessayer) => nœud), le reste de l'écran continue.
//
// `onErreur(erreur, info)` prévient l'écran qui la pose (mettre un article de
// côté, journaliser) ; `cleReprise` : quand elle change, la barrière se rouvre
// (l'enfant est remonté). Elle ne voit que les erreurs de RENDU et d'effets
// des composants qu'elle entoure — pas celles des gestes (onClick) ni des
// promesses, qui ne démontent rien.
import { Component } from "react";

export default class BarriereErreur extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
    this.reessayer = () => this.setState({ erreur: null });
  }

  static getDerivedStateFromError(erreur) {
    return { erreur: erreur ?? new Error("erreur inconnue") };
  }

  componentDidCatch(erreur, info) {
    try { console.error(`[barrière${this.props.nom ? ` ${this.props.nom}` : ""}]`, erreur, info?.componentStack ?? ""); } catch { /* console absente */ }
    try { this.props.onErreur?.(erreur, info); } catch { /* le secours s'affiche quand même */ }
  }

  componentDidUpdate(prev) {
    if (this.state.erreur && prev.cleReprise !== this.props.cleReprise) this.reessayer();
  }

  render() {
    if (this.state.erreur) {
      const { secours = null } = this.props;
      return typeof secours === "function" ? secours(this.state.erreur, this.reessayer) : secours;
    }
    return this.props.children ?? null;
  }
}
