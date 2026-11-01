# Agentico

A mobile companion for [herdr](https://herdr.dev): an agent console over SSH.
See which coding Agents on your Hosts need you, answer them in a tap, and open
a terminal when you need one. React Native + Expo, for iOS and Android.

**Status: pre-alpha rewrite.** This repo is a rebuild of a native iOS app. It
currently shows a themed Home with demo data; the SSH transport is the next step.
See [docs/roadmap.md](docs/roadmap.md).

## Layout

| Path | What |
|---|---|
| `apps/mobile` | The Expo app (Expo Router): screens and wiring only |
| `packages/core` | Pure TypeScript: herdr protocol types (generated), reducers, parsers |
| `packages/ui` | Theme tokens (Índigo, Papel, Noche) and the UI primitives |
| `packages/plugin` | The herdr plugin that renders the pairing QR and sends notifications (Apache-2.0, from Heeler) |
| `packages/relay` | The push relay (Apache-2.0, from Heeler) |
| `modules/ssh` | The SSH Expo Module: iOS over libssh2 + OpenSSL (Apache-2.0 part, see `modules/ssh/ios/NOTICE`); Android pending |

## Develop

Requires Node 22.13+ and pnpm 11.

```sh
pnpm install
pnpm verify-fast     # lint, types, generated files, ratchets, related tests
pnpm test            # every unit and component test
pnpm -F @agentico/mobile start
```

Native builds (`expo run:ios` / `expo run:android`) need Xcode / Android Studio.
Contributors and agents: read [CLAUDE.md](CLAUDE.md) first.

## License

MIT, except `packages/plugin` and `packages/relay` (Apache-2.0, derived from
[Heeler](https://github.com/ZingerLittleBee/Heeler)).
