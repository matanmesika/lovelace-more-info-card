import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

// Exercise the distributed bundle. HA's child elements are protocol fixtures;
// real vacuum mapping, visual layout, and iOS still require the manual HA test.
const bundle = await readFile(new URL(process.env.CARD_BUNDLE || '../more-info-card.js', import.meta.url), 'utf8');
const window = new Window({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
window.console.info = () => {};
window.loadCardHelpers = async () => ({ importMoreInfoControl() {} });
window.eval(bundle);
const { document, HTMLElement, customElements, CustomEvent } = window;
class TestView extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); this.selection = []; }
  connectedCallback() { this.shadowRoot.innerHTML = '<button id="area">Living room</button><button id="start">Start</button>'; }
}
customElements.define('test-area-view', TestView);
customElements.define('test-mapping-view', class extends TestView {});
customElements.define('test-header', class extends HTMLElement {});
const hass = (name = 'Roborock') => ({
  states: { 'vacuum.saros_20_complete': { entity_id: 'vacuum.saros_20_complete', state: 'docked', attributes: { friendly_name: name } },
    'vacuum.other': { entity_id: 'vacuum.other', state: 'docked', attributes: {} } },
  localize: (key) => key === 'ui.common.back' ? 'Back' : '',
});
const tick = async (card) => { await Promise.resolve(); await Promise.resolve(); await card.updateComplete; await Promise.resolve(); await card.updateComplete; };
const make = async () => {
  const parent = document.createElement('div');
  const card = document.createElement('more-info-card');
  card.hass = hass(); card.setConfig({ entity: 'vacuum.saros_20_complete' });
  parent.append(card); document.body.append(parent); await tick(card);
  return { card, parent };
};
const detail = (overrides = {}) => ({
  viewTag: 'test-area-view', viewTitle: 'Clean areas',
  viewImport: async () => {}, viewParams: { entityId: 'vacuum.saros_20_complete' },
  viewHeaderTag: 'test-header', viewHeaderImport: async () => {}, ...overrides,
});
const fire = (element, type, data) => element.dispatchEvent(new CustomEvent(type, { detail: data, bubbles: true, composed: true }));
const open = async (card, overrides) => { fire(card.shadowRoot.querySelector('more-info-content'), 'show-child-view', detail(overrides)); await tick(card); };
const current = (card) => card.shadowRoot.querySelector('.child-view')?.firstElementChild;
const back = async (card) => { card.shadowRoot.querySelector('.child-view-header button').click(); await tick(card); };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

await test('area event loads view and header with the correct hass and params', async () => {
  const { card } = await make(); let imports = 0;
  await open(card, { viewImport: async () => { imports++; }, viewHeaderImport: async () => { imports++; } });
  assert.equal(imports, 2); assert.ok(current(card));
  assert.equal(current(card).params.entityId, 'vacuum.saros_20_complete');
  assert.equal(current(card).hass, card.hass);
  assert.equal(card.shadowRoot.querySelector('test-header').params.entityId, 'vacuum.saros_20_complete');
});
await test('opening areas sends no cleaning command', async () => {
  const { card } = await make(); let commands = 0; card.hass.callService = () => { commands++; };
  await open(card); assert.equal(commands, 0);
});
await test('child navigation stays within a containing popup', async () => {
  const { card, parent } = await make(); let leaked = 0;
  parent.addEventListener('show-child-view', () => leaked++);
  parent.addEventListener('close-child-view', () => leaked++);
  await open(card); fire(current(card), 'close-child-view'); await tick(card);
  assert.equal(leaked, 0); assert.ok(card.shadowRoot.querySelector('more-info-content'));
});
await test('nested mapping and Back preserve the selected areas', async () => {
  const { card } = await make(); await open(card); const area = current(card); area.selection = ['living_room'];
  fire(area, 'show-child-view', detail({ viewTag: 'test-mapping-view', viewHeaderTag: undefined, viewTitle: 'Mapping' }));
  await tick(card); assert.equal(current(card).localName, 'test-mapping-view');
  await back(card); assert.equal(current(card), area); assert.deepEqual(area.selection, ['living_room']);
  await back(card); assert.ok(card.shadowRoot.querySelector('more-info-content'));
});
await test('header actions can open a nested view', async () => {
  const { card } = await make(); await open(card);
  fire(card.shadowRoot.querySelector('test-header'), 'show-child-view', detail({ viewTag: 'test-mapping-view' }));
  await tick(card); assert.equal(current(card).localName, 'test-mapping-view');
});
await test('hass updates reach active and retained views', async () => {
  const { card } = await make(); await open(card); const area = current(card);
  fire(area, 'show-child-view', detail({ viewTag: 'test-mapping-view' })); await tick(card);
  card.hass = hass('Updated'); await tick(card);
  assert.equal(area.hass, card.hass); assert.equal(current(card).hass, card.hass);
  assert.equal(card.shadowRoot.querySelector('test-header').hass, card.hass);
});
await test('Back cancels a slow import', async () => {
  const { card } = await make(); let resolve;
  fire(card.shadowRoot.querySelector('more-info-content'), 'show-child-view', detail({ viewImport: () => new Promise(r => { resolve = r; }) }));
  await tick(card); assert.ok(card.shadowRoot.querySelector('[role="status"]'));
  await back(card); resolve(); await tick(card);
  assert.equal(current(card), undefined); assert.ok(card.shadowRoot.querySelector('more-info-content'));
});
await test('failed import displays an error and Back recovers', async () => {
  const { card } = await make(); await open(card, { viewImport: async () => { throw new Error('Import failed'); } });
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent, /Import failed/);
  await back(card); await open(card); assert.ok(current(card));
});
await test('missing view produces a recoverable error', async () => {
  const { card } = await make(); await open(card, { viewTag: 'test-missing-view' });
  assert.match(card.shadowRoot.querySelector('[role="alert"]').textContent, /not available/);
  await back(card); assert.ok(card.shadowRoot.querySelector('more-info-content'));
});
await test('changing entity cancels an outstanding import', async () => {
  const { card } = await make(); let resolve;
  fire(card.shadowRoot.querySelector('more-info-content'), 'show-child-view', detail({ viewImport: () => new Promise(r => { resolve = r; }) }));
  await tick(card); card.setConfig({ entity: 'vacuum.other' }); resolve(); await tick(card);
  assert.equal(current(card), undefined); assert.equal(card.shadowRoot.querySelector('more-info-content').stateObj.entity_id, 'vacuum.other');
});
await test('disconnect cancels an outstanding import', async () => {
  const { card, parent } = await make(); let resolve;
  fire(card.shadowRoot.querySelector('more-info-content'), 'show-child-view', detail({ viewImport: () => new Promise(r => { resolve = r; }) }));
  await tick(card); card.remove(); resolve(); await Promise.resolve(); await Promise.resolve(); parent.append(card); await tick(card);
  assert.equal(current(card), undefined); assert.ok(card.shadowRoot.querySelector('more-info-content'));
});
await test('unrelated show-dialog events still reach Home Assistant', async () => {
  const { card, parent } = await make(); let dialogs = 0;
  parent.addEventListener('show-dialog', () => dialogs++);
  fire(card.shadowRoot.querySelector('more-info-content'), 'show-dialog', { dialogTag: 'test-dialog' });
  assert.equal(dialogs, 1);
});
console.log(`${passed} navigation tests passed (DOM simulation, not a live HA installation).`);
await window.happyDOM.close();
