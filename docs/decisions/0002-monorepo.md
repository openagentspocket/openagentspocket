# 0002. One monorepo: app, plugin, relay, schema

Status: accepted (2026-11-01)

## Decision

`apps/mobile`, `packages/{core,ui,plugin,relay}` and `modules/ssh` live in one repository. The herdr plugin, the push relay and `herdr-schema.json` move in with the app.

## Why

The wire contracts (pairing, notifications, protocol schema) change together with their consumers; one PR, one test run.
