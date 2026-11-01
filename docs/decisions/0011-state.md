# 0011. Zustand per Host, fed by pure reducers; TanStack Query for request/response only

Status: accepted (2026-11-01)

## Decision

Event streams are push, not cacheable queries. Reducers live in `packages/core` and are the unit-tested part; events are batched per frame.

## Why

Least code, easy to test without React Native.
