import { LitElement, html, css, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { property, state } from "lit/decorators.js";
import pjson from "../package.json";
import "./editor.ts";
import { VisibilityController } from "./visibility";

const DOMAINS_NO_INFO = ["camera", "configurator"];
// Match HA's modern controls, which already contain their own state header.
const DOMAINS_WITH_STATE_HEADER = [
  "alarm_control_panel", "cover", "climate", "conversation", "fan",
  "humidifier", "input_boolean", "lawn_mower", "light", "lock", "siren",
  "script", "switch", "timer", "vacuum", "valve", "water_heater",
  "weather", "media_player",
];
const DOMAINS_NO_MORE_INFO = [
  "input_number",
  "input_select",
  "input_text",
  "number",
  "scene",
  "select",
];

interface ChildView {
  viewTag: string;
  viewTitle?: string;
  viewImport?: () => Promise<unknown>;
  viewParams?: any;
  viewHeaderTag?: string;
  viewHeaderImport?: () => Promise<unknown>;
}

interface LoadedChildView extends ChildView {
  element: HTMLElement & { hass?: any; params?: any; entry?: any };
  header?: HTMLElement & { hass?: any; params?: any };
}

class MoreInfoCard extends LitElement {
  @property({ attribute: false }) hass;
  @property({ attribute: false }) config;

  @state() private _entry: any;
  @state() private _supplementaryCards: any[] = [];
  @state() private _supplementaryError?: string;
  private _entryRequest = 0;
  private _entryEntity?: string;
  private _entryConnection: any;
  private _registryDisplayEntry: any;
  private _helpers: Promise<any>;
  private _supplementaryKey?: string;
  private _supplementaryRequest = 0;
  private _visibility = new VisibilityController(this);

  @state() private _childViews: LoadedChildView[] = [];
  @state() private _loadingChildView = false;
  @state() private _childViewError?: string;
  private _childViewRequest = 0;

  private async _showChildView(ev: CustomEvent<ChildView>) {
    const view = ev.detail;
    if (!view || !view.viewTag) return;
    // Own navigation even when this card is inside a more-info popup.
    ev.stopPropagation();
    const request = ++this._childViewRequest;
    this._loadingChildView = true;
    this._childViewError = undefined;
    try {
      await Promise.all([view.viewImport?.(), view.viewHeaderImport?.()]);
      if (request !== this._childViewRequest) return;
      if (!customElements.get(view.viewTag)) {
        throw new Error(`View is not available: ${view.viewTag}`);
      }
      const element = document.createElement(view.viewTag) as LoadedChildView["element"];
      element.hass = this.hass;
      element.entry = this._entry;
      element.params = view.viewParams;
      const header = view.viewHeaderTag
        ? document.createElement(view.viewHeaderTag) as LoadedChildView["header"]
        : undefined;
      if (header) {
        header.hass = this.hass;
        header.params = view.viewParams;
      }
      this._childViews = [...this._childViews, { ...view, element, header }];
    } catch (err) {
      if (request === this._childViewRequest) {
        this._childViewError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (request === this._childViewRequest) this._loadingChildView = false;
    }
  }

  private _goBack() {
    ++this._childViewRequest;
    if (!this._loadingChildView && !this._childViewError) {
      this._childViews = this._childViews.slice(0, -1);
    }
    this._loadingChildView = false;
    this._childViewError = undefined;
  }

  private _closeChildView(ev: Event) {
    if (!this._childViews.length && !this._loadingChildView && !this._childViewError) return;
    ev.stopPropagation();
    this._goBack();
  }

  willUpdate() {
    this._loadEntry();
    this._loadSupplementaryCards();
  }

  protected updated() {
    // Keep retained views current while preserving selection on Back.
    for (const view of this._childViews) {
      view.element.hass = this.hass;
      view.element.entry = this._entry;
      if (view.header) view.header.hass = this.hass;
    }
    for (const card of this._supplementaryCards) card.hass = this.hass;
    this._visibility.update(this.config || {});
  }

  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    ++this._childViewRequest;
    this._childViews = [];
    this._loadingChildView = false;
    this._childViewError = undefined;
    ++this._entryRequest;
    this._entryEntity = undefined;
    ++this._supplementaryRequest;
    this._supplementaryKey = undefined;
    this._visibility.disconnect();
  }

  private async _loadEntry() {
    const entity = this.config?.entity;
    if (!entity || !this.hass?.callWS) return;
    const connection = this.hass.connection || this.hass.callWS;
    const displayEntry = this.hass.entities?.[entity];
    if (entity === this._entryEntity && connection === this._entryConnection &&
        displayEntry === this._registryDisplayEntry) return;
    this._entryEntity = entity;
    this._entryConnection = connection;
    this._registryDisplayEntry = displayEntry;
    const request = ++this._entryRequest;
    try {
      const entry = await this.hass.callWS({ type: "config/entity_registry/get", entity_id: entity });
      if (request === this._entryRequest) this._entry = entry;
    } catch (_) {
      // YAML-only entities and restricted users may have no registry entry.
      if (request === this._entryRequest) this._entry = undefined;
    }
  }

  private _entryUpdated(ev: CustomEvent<any>) {
    if (ev.detail?.entity_id !== this.config.entity) return;
    ev.stopPropagation();
    ++this._entryRequest;
    this._entry = ev.detail;
  }

  private async _loadSupplementaryCards() {
    if (!this.config || !this.hass || !this._helpers) return;
    const entity = this.config.entity;
    const domain = entity.split(".")[0];
    const components = this.hass.config?.components || [];
    const sensor = ["sensor", "binary_sensor"].includes(domain);
    const history = (this.config.show_history ?? sensor) && components.includes("history");
    const logbook = (this.config.show_logbook ?? (sensor &&
      !this.hass.states[entity]?.attributes.unit_of_measurement)) && components.includes("logbook");
    const key = JSON.stringify([entity, history, logbook]);
    if (key === this._supplementaryKey) return;
    this._supplementaryKey = key;
    const request = ++this._supplementaryRequest;
    this._supplementaryCards = [];
    this._supplementaryError = undefined;
    try {
      const helpers = await this._helpers;
      if (request !== this._supplementaryRequest) return;
      const configs = [
        ...(history ? [{ type: "history-graph", entities: [entity], hours_to_show: 24 }] : []),
        ...(logbook ? [{ type: "logbook", entities: [entity], hours_to_show: 24 }] : []),
      ];
      const cards = configs.map(config => helpers.createCardElement(config));
      for (const card of cards) card.hass = this.hass;
      this._supplementaryCards = cards;
    } catch (err) {
      if (request === this._supplementaryRequest) {
        this._supplementaryError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  static getConfigElement() {
    return document.createElement("more-info-card-editor");
  }
  static getStubConfig(hass, entities, entitiesFill) {
    const ents = entitiesFill.filter((e) => {
      const domain = e.split(".")[0];
      return !(
        DOMAINS_NO_MORE_INFO.includes(domain) ||
        DOMAINS_NO_INFO.includes(domain)
      );
    });
    return {
      entity: ents[Math.floor(Math.random() * ents.length)] || "",
    };
  }

  setConfig(config) {
    if (!config || typeof config.entity !== "string" || !config.entity.includes(".")) {
      throw new Error("An entity is required");
    }
    for (const option of ["width", "height", "max_height"]) {
      const value = config[option];
      if (value !== undefined && !((typeof value === "number" && Number.isFinite(value) && value > 0) ||
          (typeof value === "string" && /^(auto|[0-9]+(?:\.[0-9]+)?(?:px|%|vh|vw|rem|em|dvh))$/.test(value)))) {
        throw new Error(`${option} must be a positive number (pixels) or a CSS length`);
      }
    }
    if (config.entity !== this.config?.entity) {
      ++this._childViewRequest;
      this._childViews = [];
      this._loadingChildView = false;
      this._childViewError = undefined;
      ++this._entryRequest;
      this._entryEntity = undefined;
      this._entry = undefined;
      ++this._supplementaryRequest;
      this._supplementaryKey = undefined;
      this._supplementaryCards = [];
    }
    this.config = { ...config };
    const domain = this.config.entity.split(".")[0];
    this._helpers = (window as any).loadCardHelpers();
    this._helpers.then((helpers: any) => helpers.importMoreInfoControl(domain)).catch(() => {});
  }

  getCardSize() {
    return typeof this.config?.height === "number" ? Math.ceil(this.config.height / 50) : 5;
  }

  private _dimensions() {
    const length = (value: any) => typeof value === "number" ? `${value}px` : value;
    return {
      width: length(this.config?.width),
      height: length(this.config?.height),
      maxHeight: length(this.config?.max_height),
    };
  }

  private _title() {
    const title = this.config?.title;
    return typeof title === "string" && title.trim() ? title : undefined;
  }

  render() {
    if (
      !this.hass ||
      !this.hass.states ||
      !this.hass.states[this.config?.entity]
    )
      return html`
        <ha-card
          .header=${this._title()}
          style=${styleMap(this._dimensions())}
        >
          <div class="card-content" style="color: var(--text-primary-color);">
            Unknown entity.
          </div>
        </ha-card>
      `;

    const stateObj = this.hass.states[this.config.entity];

    const domain = this.config.entity.split(".")[0];

    const memberDomain = domain === "group" ? stateObj.attributes.entity_id?.[0]?.split(".")[0] : domain;
    const showState = this.config.show_state ?? !DOMAINS_WITH_STATE_HEADER.includes(memberDomain);

    const childView = this._childViews[this._childViews.length - 1];
    const showChildView = childView || this._loadingChildView || this._childViewError;

    return html`
      <ha-card .header=${this._title()} style=${styleMap(this._dimensions())}>
        <div class="card-content"
          @show-child-view=${this._showChildView}
          @close-child-view=${this._closeChildView}
          @entity-entry-updated=${this._entryUpdated}
        >
          ${showChildView
            ? html`
                <div class="child-view-header">
                  <button type="button" @click=${this._goBack}>
                    ${this.hass.localize("ui.common.back") || "Back"}
                  </button>
                  <span>${childView?.viewTitle || ""}</span>
                  ${!this._loadingChildView && !this._childViewError ? childView?.header : ""}
                </div>
                ${this._loadingChildView
                  ? html`<p role="status">${this.hass.localize("ui.common.loading") || "Loading..."}</p>`
                  : this._childViewError
                    ? html`<p role="alert">${this._childViewError}</p>`
                    : html`<div class="child-view">${childView?.element}</div>`}
              `
            : DOMAINS_NO_MORE_INFO.includes(domain)
            ? html` No More Info Available `
            : html`
                ${DOMAINS_NO_INFO.includes(domain) || !showState
                  ? ""
                  : html`
                      <state-card-content
                        in-dialog
                        .stateObj=${stateObj}
                        .hass=${this.hass}
                      ></state-card-content>
                    `}
                <more-info-content
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                  .entry=${this._entry}
                ></more-info-content>
                ${this._supplementaryCards}
                ${this._supplementaryError ? html`<p role="alert">${this._supplementaryError}</p>` : nothing}
              `}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host { display: block; }
    ha-card {
      box-sizing: border-box;
      max-width: 100%;
      overflow: auto;
    }
    .card-content { padding: 16px; }
    more-info-content { display: block; }
    .child-view-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      color: var(--primary-text-color);
    }
    .child-view-header span { flex: 1; }
    .child-view-header button {
      font: inherit;
      color: var(--primary-color);
      background: none;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }
    .child-view-header button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .child-view { min-height: 160px; }
  `;
}

customElements.define("more-info-card", MoreInfoCard);
console.info(
  `%cMORE-INFO-CARD ${pjson.version} IS INSTALLED`,
  "color: green; font-weight: bold",
  ""
);


