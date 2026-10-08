// Styles are local to this card's shadow trees. Never patch HA element classes.
export class VisibilityController {
  private _observers = new Map<ShadowRoot, MutationObserver>();
  private _styles = new Map<ShadowRoot, HTMLStyleElement>();
  private _queued = false;
  private _active = false;
  private _config: any = {};

  constructor(private _host: HTMLElement) {}

  update(config: any) {
    this._config = config;
    if (!this._host.isConnected || !["show_attributes", "show_state_header", "show_name", "show_effects"].some(key => config[key] === false)) {
      this.disconnect();
      return;
    }
    this._active = true;
    this._scan();
  }

  disconnect() {
    this._active = false;
    for (const observer of this._observers.values()) observer.disconnect();
    this._observers.clear();
    for (const style of this._styles.values()) style.remove();
    this._styles.clear();
  }

  private _schedule = () => {
    if (this._queued || !this._active) return;
    this._queued = true;
    queueMicrotask(() => {
      this._queued = false;
      if (this._active) this._scan();
    });
  };

  private _scan() {
    const roots = new Set<ShadowRoot>();
    const visit = (root: ShadowRoot) => {
      roots.add(root);
      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    if (this._host.shadowRoot) visit(this._host.shadowRoot);
    // Remove observers for views that have been replaced or closed.
    for (const [root, observer] of this._observers) {
      if (!roots.has(root)) {
        observer.disconnect();
        this._observers.delete(root);
        this._styles.get(root)?.remove();
        this._styles.delete(root);
      }
    }
    for (const root of roots) {
      const rules: string[] = [];
      if (this._config.show_attributes === false) rules.push("ha-attributes { display: none !important; }");
      if (this._config.show_state_header === false) rules.push("ha-more-info-state-header { display: none !important; }");
      if (this._config.show_name === false && root.host.localName === "ha-more-info-state-header") {
        rules.push("p.name { display: none !important; }");
      }
      if (this._config.show_effects === false && root.host.localName === "more-info-light") {
        rules.push("ha-more-info-control-select-container, ha-control-select-menu { display: none !important; }");
      }
      const text = rules.join("\n");
      let style = this._styles.get(root);
      if (text) {
        if (!style) {
          style = document.createElement("style");
          style.dataset.moreInfoCardVisibility = "";
          this._styles.set(root, style);
        }
        // Idempotent writes prevent observer/render feedback loops.
        if (style.textContent !== text) style.textContent = text;
        if (style.parentNode !== root) root.append(style);
      } else if (style) {
        style.remove();
        this._styles.delete(root);
      }
      if (!this._observers.has(root)) {
        const observer = new MutationObserver(this._schedule);
        observer.observe(root, { childList: true, subtree: true });
        this._observers.set(root, observer);
      }
    }
  }
}
