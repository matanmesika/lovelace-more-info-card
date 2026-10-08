import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

// Run the exact distributed bundle, with HA protocol fixtures. These tests
// verify data, navigation, lifecycle and DOM stability, not a live HA backend.
const bundle = await readFile(new URL(process.env.CARD_BUNDLE || '../more-info-card.js', import.meta.url), 'utf8');
const window = new Window({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.console.info = () => {};
const { document, HTMLElement, customElements, CustomEvent } = window;
let creations = [];
window.loadCardHelpers = async () => ({
  importMoreInfoControl() {},
  createCardElement(config) {
    creations.push(config);
    const element = document.createElement('test-history-card');
    element.config = config;
    return element;
  },
});
window.eval(bundle);
customElements.define('test-history-card', class extends HTMLElement {});
class StateHeader extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<p class="name">Name</p><p>Last changed</p>'; }
}
customElements.define('ha-more-info-state-header', StateHeader);
class Light extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<ha-more-info-state-header></ha-more-info-state-header><ha-attributes></ha-attributes><ha-more-info-control-select-container><ha-control-select-menu></ha-control-select-menu></ha-more-info-control-select-container><button>Color</button>';
    this.shadowRoot.querySelector('button').onclick = () => this.dispatchEvent(new CustomEvent('show-child-view', {
      bubbles: true, composed: true,
      detail: { viewTag: 'ha-more-info-view-light-color-picker', viewTitle: 'Color', viewImport: async () => {}, viewParams: { entityId: this.stateObj.entity_id, defaultMode: 'color' } },
    }));
  }
}
customElements.define('more-info-light', Light);
customElements.define('more-info-content', class extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set stateObj(value) {
    this._stateObj = value;
    if (value?.entity_id.startsWith('light.') && !this.shadowRoot.firstElementChild) {
      this.shadowRoot.append(document.createElement('more-info-light'));
    }
    const child = this.shadowRoot.firstElementChild;
    if (child) child.stateObj = value;
  }
  get stateObj() { return this._stateObj; }
  set entry(value) { this._entry = value; if (this.shadowRoot.firstElementChild) this.shadowRoot.firstElementChild.entry = value; }
  get entry() { return this._entry; }
});
customElements.define('ha-more-info-view-light-color-picker', class extends HTMLElement {});
customElements.define('ha-more-info-view-climate-hvac-modes', class extends HTMLElement {});

const entity = (id, attributes = {}) => ({ entity_id: id, state: 'on', attributes });
const hass = (overrides = {}) => ({
  states: {
    'light.test': entity('light.test', { friendly_name: 'Kitchen', supported_color_modes: ['rgb'] }),
    'climate.test': entity('climate.test'),
    'sensor.test': entity('sensor.test', { unit_of_measurement: '°C' }),
    'binary_sensor.test': entity('binary_sensor.test'),
    'group.test': entity('group.test', { entity_id: ['light.test'] }),
  },
  config: { components: ['history', 'logbook'] },
  localize: () => '',
  ...overrides,
});
const tick = async card => {
  for (let i = 0; i < 6; i++) { await Promise.resolve(); await card.updateComplete; }
  await new Promise(r => window.setTimeout(r, 0));
};
const make = async (config = {}, state = hass()) => {
  const card = document.createElement('more-info-card');
  card.hass = state;
  card.setConfig({ entity: 'light.test', ...config });
  document.body.append(card);
  await tick(card);
  return card;
};
const content = card => card.shadowRoot.querySelector('more-info-content');
const fire = (element, type, detail) => element.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
const light = card => content(card).shadowRoot.querySelector('more-info-light');
const styles = root => root.querySelector('style[data-more-info-card-visibility]')?.textContent || '';
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

await test('modern light and climate controls omit duplicate state rows', async () => {
  for (const id of ['light.test', 'climate.test', 'group.test']) {
    const card = await make({ entity: id });
    assert.equal(card.shadowRoot.querySelectorAll('state-card-content').length, 0);
  }
});
await test('legacy sensors keep their state row with in-dialog layout', async () => {
  const card = await make({ entity: 'sensor.test' });
  assert.ok(card.shadowRoot.querySelector('state-card-content').hasAttribute('in-dialog'));
});
await test('state row can be explicitly enabled or disabled', async () => {
  const card = await make({ show_state: true });
  assert.equal(card.shadowRoot.querySelectorAll('state-card-content').length, 1);
  card.setConfig({ entity: 'light.test', show_state: false }); await tick(card);
  assert.equal(card.shadowRoot.querySelectorAll('state-card-content').length, 0);
});
await test('false, empty, omitted and null titles do not create a header', async () => {
  for (const title of [false, '', ' ', null, undefined]) {
    const card = await make({ title });
    assert.equal(card.shadowRoot.querySelector('ha-card').header, undefined);
  }
});
await test('a supplied title is retained', async () => {
  const card = await make({ title: 'Kitchen light' });
  assert.equal(card.shadowRoot.querySelector('ha-card').header, 'Kitchen light');
});
await test('unknown entity renders a valid title and error message', async () => {
  const card = await make({ entity: 'light.missing', title: 'Missing' });
  assert.equal(card.shadowRoot.querySelector('ha-card').header, 'Missing');
  assert.match(card.shadowRoot.textContent, /Unknown entity/);
});
await test('card tolerates a missing hass or config during initialization', async () => {
  const card = document.createElement('more-info-card'); document.body.append(card); await tick(card);
  assert.match(card.shadowRoot.textContent, /Unknown entity/);
});
await test('dimensions accept pixels and CSS units and update the layout size', async () => {
  const card = await make({ width: 300, height: 400, max_height: '70vh' });
  const style = card.shadowRoot.querySelector('ha-card').style;
  assert.equal(style.width, '300px'); assert.equal(style.height, '400px'); assert.equal(style.maxHeight, '70vh');
  assert.equal(card.getCardSize(), 8);
  card.setConfig({ entity: 'light.test', height: '25rem', width: '100%' }); await tick(card);
  assert.equal(style.height, '25rem'); assert.equal(style.width, '100%'); assert.equal(style.maxHeight, '');
});
await test('invalid entity and dimensions fail with useful errors', async () => {
  const card = document.createElement('more-info-card');
  for (const entity of [undefined, 42, '']) assert.throws(() => card.setConfig({ entity }), /entity/);
  for (const height of [-1, NaN, {}, '10px; color:red']) assert.throws(() => card.setConfig({ entity: 'light.test', height }), /height/);
});
await test('registry metadata reaches more-info-content and light favorites', async () => {
  let requests = 0;
  const entry = { entity_id: 'light.test', options: { light: { favorite_colors: [{ rgb_color: [255, 0, 0] }] } } };
  const card = await make({}, hass({ callWS: async message => { requests++; assert.equal(message.type, 'config/entity_registry/get'); return entry; } }));
  assert.equal(content(card).entry, entry); assert.equal(light(card).entry, entry);
  card.hass = { ...card.hass, states: { ...card.hass.states } }; await tick(card);
  assert.equal(requests, 1);
});
await test('registry failure keeps basic controls usable', async () => {
  const card = await make({}, hass({ callWS: async () => { throw new Error('not_found'); } }));
  assert.equal(content(card).entry, undefined); assert.ok(content(card));
});
await test('late registry responses cannot contaminate a different entity', async () => {
  let resolve;
  const card = await make({}, hass({ callWS: ({ entity_id }) => entity_id === 'light.test' ? new Promise(r => resolve = r) : Promise.resolve({ entity_id }) }));
  card.setConfig({ entity: 'climate.test' }); await tick(card);
  resolve({ entity_id: 'light.test' }); await tick(card);
  assert.equal(content(card).entry.entity_id, 'climate.test');
});
await test('registry refreshes when the connection is replaced', async () => {
  let requests = 0;
  const callWS = async () => ({ entity_id: 'light.test', sequence: ++requests });
  const card = await make({}, hass({ callWS, connection: {} }));
  card.hass = { ...card.hass, connection: {} }; await tick(card);
  assert.equal(content(card).entry.sequence, 2);
});
await test('entity-entry-updated refreshes favorites and stays within the card', async () => {
  const card = await make(); let leaked = 0;
  card.parentNode.addEventListener('entity-entry-updated', () => leaked++);
  const entry = { entity_id: 'light.test', options: { light: { favorite_colors: [] } } };
  fire(content(card), 'entity-entry-updated', entry); await tick(card);
  assert.equal(content(card).entry, entry); assert.equal(leaked, 0);
});
await test('color picker protocol opens locally with entity and mode', async () => {
  const card = await make(); light(card).shadowRoot.querySelector('button').click(); await tick(card);
  const picker = card.shadowRoot.querySelector('ha-more-info-view-light-color-picker');
  assert.equal(picker.params.entityId, 'light.test'); assert.equal(picker.params.defaultMode, 'color');
  card.shadowRoot.querySelector('.child-view-header button').click(); await tick(card); assert.ok(content(card));
});
await test('climate child controls receive the registry entry', async () => {
  const entry = { entity_id: 'climate.test', options: {} };
  const card = await make({ entity: 'climate.test' }, hass({ callWS: async () => entry }));
  fire(content(card), 'show-child-view', { viewTag: 'ha-more-info-view-climate-hvac-modes', viewParams: { entityId: 'climate.test' } }); await tick(card);
  const control = card.shadowRoot.querySelector('ha-more-info-view-climate-hvac-modes');
  assert.equal(control.entry, entry); assert.equal(control.params.entityId, 'climate.test');
});
await test('sensor history and binary sensor logbook are restored', async () => {
  creations = [];
  const sensor = await make({ entity: 'sensor.test' });
  assert.deepEqual(creations.map(c => c.type), ['history-graph']);
  assert.equal(sensor.shadowRoot.querySelector('test-history-card').config.entities[0], 'sensor.test');
  creations = [];
  const contact = await make({ entity: 'binary_sensor.test' });
  assert.deepEqual(creations.map(c => c.type), ['history-graph', 'logbook']);
  const oldCards = [...contact.shadowRoot.querySelectorAll('test-history-card')];
  contact.hass = { ...contact.hass }; await tick(contact);
  assert.deepEqual([...contact.shadowRoot.querySelectorAll('test-history-card')], oldCards);
  assert.equal(oldCards[0].hass, contact.hass);
});
await test('history and logbook obey configuration and loaded components', async () => {
  const card = await make({ entity: 'binary_sensor.test', show_history: false, show_logbook: false });
  assert.equal(card.shadowRoot.querySelectorAll('test-history-card').length, 0);
  const disabled = await make({ show_history: true, show_logbook: true }, hass({ config: { components: [] } }));
  assert.equal(disabled.shadowRoot.querySelectorAll('test-history-card').length, 0);
});
await test('attributes, state header, name and effects hide only inside this card', async () => {
  const hidden = await make({ show_attributes: false, show_state_header: false, show_name: false, show_effects: false });
  const normal = await make();
  const root = light(hidden).shadowRoot;
  assert.match(styles(root), /ha-attributes/); assert.match(styles(root), /ha-more-info-state-header/); assert.match(styles(root), /ha-control-select-menu/);
  assert.match(styles(root.querySelector('ha-more-info-state-header').shadowRoot), /p.name/);
  assert.equal(styles(light(normal).shadowRoot), '');
});
await test('visibility options can be turned back on without stale styles', async () => {
  const card = await make({ show_attributes: false });
  const root = light(card).shadowRoot;
  assert.match(styles(root), /ha-attributes/);
  card.setConfig({ entity: 'light.test', show_attributes: true }); await tick(card);
  assert.equal(styles(root), '');
});
await test('late nested controls receive visibility rules', async () => {
  const card = await make({ show_attributes: false });
  const nested = document.createElement('div'); nested.attachShadow({ mode: 'open' }).innerHTML = '<ha-attributes></ha-attributes>';
  light(card).shadowRoot.append(nested); await tick(card);
  assert.match(styles(nested.shadowRoot), /ha-attributes/);
});
await test('100 hass updates and card-mod-like DOM mutations keep one card and one state row', async () => {
  const card = await make({ show_state: true, show_attributes: false });
  const control = content(card);
  const row = card.shadowRoot.querySelector('state-card-content');
  const root = light(card).shadowRoot;
  for (let i = 0; i < 100; i++) {
    const marker = document.createElement('card-mod'); root.append(marker); marker.remove();
    card.hass = { ...card.hass, states: { ...card.hass.states } }; await tick(card);
  }
  assert.equal(content(card), control); assert.equal(card.shadowRoot.querySelector('state-card-content'), row);
  assert.equal(card.shadowRoot.querySelectorAll('ha-card').length, 1);
  assert.equal(card.shadowRoot.querySelectorAll('state-card-content').length, 1);
  assert.equal(root.querySelectorAll('style[data-more-info-card-visibility]').length, 1);
});
await test('disconnect cleans observers and reconnect restores local visibility', async () => {
  const card = await make({ show_attributes: false }); const root = light(card).shadowRoot;
  card.remove(); await new Promise(r => setTimeout(r, 0)); assert.equal(styles(root), '');
  document.body.append(card); await tick(card); assert.match(styles(root), /ha-attributes/);
});
console.log(`${passed} compatibility tests passed (HA protocol fixtures, not a live HA installation).`);
await window.happyDOM.close();
