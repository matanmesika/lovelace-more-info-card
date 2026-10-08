more-info-card
==============

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/custom-components/hacs)

Display the more-info dialog of any entity as a lovelace card.

![more-info-card2](https://user-images.githubusercontent.com/1299821/55866774-56ff6e00-5b81-11e9-857d-e3a6edc17020.jpg)

For installation instructions [see this guide](https://github.com/thomasloven/hass-config/wiki/Lovelace-Plugins).

## Usage
```yaml
type: custom:more-info-card
entity: <entity_id>
title: <title>
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `entity` | Required | Entity ID to display. |
| `title` | No title | Card title. Omitted, `false`, `null`, empty and whitespace-only titles render no header. This changes the old automatic friendly-name title. Set a title explicitly to retain it. |
| `show_state` | Automatic | Show the legacy entity row. Modern controls such as light, climate and vacuum already have a state header, so the extra row is omitted. Set `true` to restore it. |
| `show_attributes` | `true` | Show the attributes dropdown. |
| `show_state_header` | `true` | Show the native state / last-changed header. |
| `show_name` | `true` | Show the name inside older native state headers that contain `p.name`. Newer HA headers already omit this name. |
| `show_effects` | `true` | Show the light effects selector. Applies only to the light control. |
| `show_history` | Sensors only | Include a built-in 24-hour history graph, when HA's history component is loaded. |
| `show_logbook` | Sensors without a unit | Include a built-in 24-hour logbook, when HA's logbook component is loaded. |
| `width` | Automatic | Card width: a number in pixels or a CSS length such as `100%` or `20rem`. |
| `height` | Automatic | Card height. Content scrolls when it exceeds the available height. |
| `max_height` | Automatic | Maximum card height, using the same units as `height`. |

Visibility styles are scoped to this card, including its nested shadow roots.
They do not change HA's global element definitions or require card-mod.
Dimensions bound the card; they do not scale every native control or slider.

```yaml
type: custom:more-info-card
entity: light.kitchen_lighting_light
title: false
show_attributes: false
show_state_header: false
show_effects: false
width: 100%
max_height: 450
```

## Compatibility fixes and issue coverage

The existing vacuum area-selection fix is retained. HA's `show-child-view`
protocol is handled inside the card, including nested views, headers and Back.
Opening a view itself does not send a cleaning command.

| Upstream issue | Changes / status |
| --- | --- |
| [#31](https://github.com/thomasloven/lovelace-more-info-card/issues/31) | Existing vacuum areas / mapping navigation fix retained. |
| [#23](https://github.com/thomasloven/lovelace-more-info-card/issues/23), [#29](https://github.com/thomasloven/lovelace-more-info-card/issues/29) | The same child-view handling supports legacy light color-picker and climate subviews. One commenter on #23 already reported recovery in HA 2023.11.1; current controls may handle these choices internally. |
| [#25](https://github.com/thomasloven/lovelace-more-info-card/issues/25), [#29](https://github.com/thomasloven/lovelace-more-info-card/issues/29) | Fetch extended entity-registry metadata and pass it to native controls, restoring their favorite-color data. Failures for unregistered entities leave basic controls usable. |
| [#26](https://github.com/thomasloven/lovelace-more-info-card/issues/26), [#27](https://github.com/thomasloven/lovelace-more-info-card/issues/27) | Remove redundant legacy rows from modern controls. Sensor history / logbook are supplied by built-in Lovelace cards, with visibility options. This does not recreate all of the native dialog's settings toolbar. |
| [#19](https://github.com/thomasloven/lovelace-more-info-card/issues/19), [#21](https://github.com/thomasloven/lovelace-more-info-card/issues/21) | Omitted and disabled titles no longer generate a card header. |
| [#22](https://github.com/thomasloven/lovelace-more-info-card/issues/22), [#30](https://github.com/thomasloven/lovelace-more-info-card/issues/30) | Add local name, state-header, attributes and light-effects visibility options. |
| [#32](https://github.com/thomasloven/lovelace-more-info-card/issues/32) | Add width, height and maximum-height options with scrolling; content sections can be hidden. Native controls are not proportionally scaled. |
| [#24](https://github.com/thomasloven/lovelace-more-info-card/issues/24) | The reported default light-card config no longer renders `state-card-content`, so card-mod's reproducing selector has no target. A regression test covers that config. Setting `show_state: true` restores the row; verify that opt-in with real card-mod if you use it. |

All 12 open issues were reviewed on 2026-10-08, including their comments.
Several have community workarounds; an open issue is not necessarily unanswered.
No issue is closed by this branch. These are proposed fixes pending maintainer
review and live HA validation.

## Development and tests

Use Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
```

The tests execute the distributed `more-info-card.js`, not a second copy of the
implementation. There are 12 navigation tests and 23 compatibility tests using
simulated DOM and HA protocol fixtures. They cover registry races / errors,
title and dimension handling, favorites metadata, child-view data, scoped
visibility, history / logbook and repeated DOM updates.

The fixtures do not validate actual Roborock cleaning, climate services,
HA rendering, card-mod with `show_state: true`, Browser Mod or iOS. See [the manual checks](tests/MANUAL.md).

## Example
```
type: custom:more-info-card
entity: vacuum.xiaomi_vacuum_cleaner
title: Vacuum cleaner
```

![more-info-card](https://user-images.githubusercontent.com/1299821/55860664-10a41200-5b75-11e9-9729-5b740e27c467.jpg)

---
<a href="https://www.buymeacoffee.com/uqD6KHCdJ" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/white_img.png" alt="Buy Me A Coffee" style="height: auto !important;width: auto !important;" ></a>

