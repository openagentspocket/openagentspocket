# App extras

Strings the React Native app needs that the Swift String Catalogs do not have (new screens, system
controls SwiftUI drew for free). `t()` reads them as part of the `app` table; the Swift catalog wins when
both have a key. Keys follow the Swift convention (`%@` string, `%lld` number) so `ArgsOf` types them.
Add every key to both `en.json` and `es.json` (Spanish: voseo, infinitive buttons). Never edit
`src/catalogs/*`: those are regenerated from Swift by `pnpm -F @openagentspocket/i18n convert`.
