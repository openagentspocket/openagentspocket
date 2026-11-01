# 0017. Terminal: expo-libghostty, fallback xterm.js

Status: accepted (2026-11-01)

## Decision

Use expo-libghostty (MIT, same libghostty as the Swift app) after a spike on SDK 58; fall back to xterm.js in a WebView.

## Why

Native-quality rendering if it works, a known fallback if not.
