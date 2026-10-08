import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import pjson from "../package.json";
import "./editor.ts";

const DOMAINS_NO_INFO = ["camera", "configurator"];
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
  element: HTMLElement & { hass?: any; params?: any };
  header?: HTMLElement & { hass?: any; params?: any };
}

class MoreInfoCard extends LitElement {
  @property() hass;
  @property() config;

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

  protected updated() {
    // Keep retained views current while preserving selection on Back.
    for (const view of this._childViews) {
      view.element.hass = this.hass;
      if (view.header) view.header.hass = this.hass;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    ++this._childViewRequest;
    this._childViews = [];
    this._loadingChildView = false;
    this._childViewError = undefined;
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
    if (config.entity !== this.config?.entity) {
      ++this._childViewRequest;
      this._childViews = [];
      this._loadingChildView = false;
      this._childViewError = undefined;
    }
    this.config = config;
    const domain = this.config.entity.split(".")[0];
    (window as any).loadCardHelpers().then((helpers: any) => {
      helpers.importMoreInfoControl(domain);
    });
  }

  getCardSize() {
    return 5;
  }

  render() {
    if (
      !this.hass ||
      !this.hass.states ||
      !this.hass.states[this.config.entity]
    )
      return html`
        <ha-card
          .header="$this.config.title || Unknown Entity"
          style="--ha-card-background: var(--primary-color); filter: grayscale(1);"
        >
          <div class="card-content" style="color: var(--text-primary-color);">
            Unknown entity.
          </div>
        </ha-card>
      `;

    const stateObj = this.hass.states[this.config.entity];

    const domain = this.config.entity.split(".")[0];

    const name =
      stateObj.attributes.friendly_name === undefined
        ? stateObj.entity_id.split(".")[1].replace(/_/g, " ")
        : stateObj.attributes.friendly_name;

    const childView = this._childViews[this._childViews.length - 1];
    const showChildView = childView || this._loadingChildView || this._childViewError;

    return html`
      <ha-card .header=${this.config.title || name}>
        <div class="card-content"
          @show-child-view=${this._showChildView}
          @close-child-view=${this._closeChildView}
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
                ${DOMAINS_NO_INFO.includes(domain)
                  ? ""
                  : html`
                      <state-card-content
                        .stateObj=${stateObj}
                        .hass=${this.hass}
                      ></state-card-content>
                    `}
                <more-info-content
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                ></more-info-content>
              `}
        </div>
      </ha-card>
    `;
  }

  static styles = css`
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

