# 0021. How agents work in this repo

Status: accepted (2026-11-01)

## Decision

Builders work in JS in worktrees and run only verify-fast and the tests related to their files. One integrator runs native builds and the full suite once per run, and runs Maestro. A read-only reviewer checks each run.

## Why

Keeps feedback fast and the shared devices uncontended.
