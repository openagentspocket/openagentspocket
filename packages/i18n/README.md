# @openagentspocket/i18n

English and Spanish strings for the app, converted from the Swift app's String Catalogs. No
retranslation: the Spanish (Rioplatense voseo) is the Swift catalog's, byte for byte.

## Use

```ts
import { t } from '@openagentspocket/i18n';

t('Needs you'); // SwiftUI Text("Needs you")
t('%lld blocked', count); // Text("\(count) blocked"), plural-aware
t('%@ session version %lld', name, version); // arguments typed from the key's specifiers
```

- Keys are the Swift catalog keys, verbatim: find a Swift `Text("…")`/`String(localized:)`, swap
  each interpolation for its specifier (`String` → `%@`, `Int` → `%lld`, a literal `%` → `%%`)
  and that is the key. Unknown keys and wrong arguments are type errors.
- `t()` reads the device language (Hermes `Intl`) until `setLocale(tag)` is called; numbers are
  formatted with the full tag (`es-AR` → `12.345`), as Foundation formats `%lld`.
- Other tables (`widgets`, `watch`, `notificationService`, `intents`, `appShortcuts`,
  `infoPlist`) go through `translate(locale, table, key, args)`; App Intents keys take named
  arguments (`{ agent }`).
- No React, no React Native, no core: usable from any UI code.

## Regenerate

The JSON under `src/catalogs/<locale>/<table>.json` is generated. Fix wording in the Swift
catalog, then:

```sh
pnpm -F @openagentspocket/i18n convert -- --swift <path to the Swift checkout>   # or AGENTICO_SWIFT_DIR
pnpm -F @openagentspocket/i18n convert:check -- --swift <path>                    # fails when stale
```

The converter keeps format arguments (`%@` → `{0}`, `%lld` → `{0, number}`, `%2$@` keeps its
position), turns plural variations into ICU plurals (`#` is the count, Apple's `zero` is `=0`),
turns `${name}` into a named argument and fails on anything it can't convert faithfully
(device variations, substitutions, `%f`). The runtime (`src/format.ts`) implements exactly that
ICU subset with CLDR en/es plural rules, so no Intl.PluralRules polyfill is needed.

## Tests

`pnpm -F @openagentspocket/i18n test`: every key resolves in both locales, every Spanish message keeps the
key's arguments, every message formats like `intl-messageformat` (the reference ICU runtime, a
dev dependency only), the Swift app's Spanish localization cases, and the `t()` API. With the
Swift checkout present, `sync.test.ts` also proves the JSON is current and that every Swift value
renders back unchanged.
