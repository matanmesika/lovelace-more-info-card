# Home Assistant validation

Install the branch's built `more-info-card.js` as a JavaScript module using a
unique resource URL, clear the frontend cache, and reload. Remove or disable
any other resource URL defining `more-info-card` first, so only one copy loads.
Keep the previous resource available to revert after testing.

## Vacuum / retained fix (#31)

```yaml
type: custom:more-info-card
entity: vacuum.saros_20_complete
title: Vacuum
```

1. Open Areas. Confirm the native area list appears inside the card.
2. Select an area, open mapping/settings if available, and press Back. Confirm
   the selected area remains selected when returning from mapping.
3. Open and close this view in a Browser Mod popup. Confirm Back does not close
   the outer popup and that unrelated HA dialogs still open normally.
4. Confirm opening / navigating the view does not start the vacuum. Test Start
   only when you intend to run a real cleaning cycle.

## Light and climate (#23, #25, #29)

Use a registered light with saved favorite colors and supported effects, and
a climate entity with fan / HVAC choices. Confirm favorite colors appear and
that choosing a color, effect or HVAC mode reaches the real entity. Older HA
versions may open child views; newer versions may switch controls internally.
Repeat after a websocket reconnect and after editing the favorite colors.

## Titles and redundant rows (#19, #21, #26, #27)

Test an omitted title, `title: false`, an empty title, and an explicit title.
The first three should have no card header. Light and climate should have no
extra legacy row. `show_state: true` should restore that row. A sensor should
retain its state row; history / logbook appear if configured and supported.

## Visibility and sizing (#22, #30, #32)

```yaml
type: custom:more-info-card
entity: light.kitchen_lights
title: false
show_attributes: false
show_state_header: false
show_effects: false
height: 400
max_height: 70vh
width: 100%
```

Confirm the configured sections disappear, all remaining controls remain
reachable by scrolling, and a second normal card is unaffected. Toggle these
options back on in the editor. Test desktop and iOS at different widths.

## Card-mod and the legacy state row (#24)

The original report targets `state-card-content` on a light with the default
configuration. The card no longer renders that legacy row for lights unless
`show_state: true`, and the automated regression test checks that the reported
selector has no target by default. With real card-mod, verify both the original
configuration and, if you use it, the explicit override:

```yaml
type: custom:more-info-card
entity: light.kitchen_lighting_light
card_mod:
  style:
    state-card-content:
```

Save, reopen the editor, reload, and trigger repeated entity state updates.
Inspect the number of `state-card-content` nodes and browser memory. Neither
should grow indefinitely. Repeat with `show_state: true` and confirm the target
row is absent with the original default config. If duplication still reproduces
with `show_state: true`, record the HA and card-mod versions and the browser console.
