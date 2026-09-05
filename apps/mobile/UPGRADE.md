# iRexPro Mobile — Expo SDK Modernization Plan

The mobile app currently uses Expo SDK 51. The current stable Expo line is SDK 57, so modernization must be incremental rather than a single multi-major dependency jump.

## Governing rule

Upgrade one Expo SDK at a time and require the complete exact-head mobile release gate after every step:

1. SDK 51 → 52
2. SDK 52 → 53
3. SDK 53 → 54
4. SDK 54 → 55
5. SDK 55 → 56
6. SDK 56 → 57

Each SDK step must be a separate pull request. Do not stack the next SDK change until the preceding one is merged into `main` and its exact combined state is green.

## Required validation for every SDK step

From a clean frozen-lock install, every candidate must pass:

- `expo install --check` — immutable Expo dependency-alignment validation
- `pnpm --filter @irexpro/mobile validate:release-config`
- `pnpm --filter @irexpro/mobile typecheck`
- Android Metro export
- iOS Metro export
- Release Security
- Required CI Gate

When dependency versions change, regenerate `pnpm-lock.yaml` with pnpm rather than hand-editing resolved dependency graphs. Run Expo's dependency fixer for the target SDK, then review every package change before committing it.

## First migration: SDK 51 → 52

SDK 52 is the only allowed next target from the current baseline.

Expected platform/runtime changes from the SDK 52 release notes include:

- React Native 0.76 baseline
- minimum supported iOS version 15.1
- Android minimum SDK 24
- Android compile SDK 35

These platform changes must be accepted explicitly in the SDK 52 PR and later proven by native/EAS build evidence after the authorized EAS project is linked.

### New Architecture isolation

Do **not** combine SDK 51 → 52 with intentional New Architecture adoption. The first SDK 52 candidate should keep the existing architecture behavior explicitly disabled where supported, so any dependency or runtime regression can be attributed to the SDK/React Native upgrade itself.

New Architecture adoption gets its own later checkpoint after the SDK 52 baseline is green.

### SDK 52 checklist

1. Start from current `main` after all preceding mobile PRs are merged.
2. Upgrade `expo` to the SDK 52 release line using pnpm.
3. Run Expo dependency alignment/fix tooling for the installed SDK.
4. Review and commit the generated `package.json` and `pnpm-lock.yaml` changes together.
5. Review whether the SDK 51-specific pnpm hoisted linker remains necessary.
6. Review the custom pre-SDK-52 Metro monorepo configuration; remove compatibility workarounds only when SDK 52 validation proves they are no longer needed.
7. Keep New Architecture adoption isolated from this dependency step.
8. Run Expo dependency alignment, release validation, TypeScript, Android export, and iOS export.
9. Merge only after Release Security and Required CI Gate are green on the exact current head.

## Later SDK checkpoints

For SDK 53 through 57, repeat the same pattern: read that SDK's release notes, update only one SDK line, align dependencies, review native/platform changes, pass the complete gate, merge, then start the next version.

Do not remove compatibility workarounds merely because a newer SDK supports a cleaner default. Remove each workaround only in the PR where CI/build evidence proves the default replacement works in this monorepo.

## EAS/native proof boundary

Metro export proves JavaScript bundling and module resolution; it does not replace signed native-build evidence. Once an authorized operator links the app to its EAS project and configures platform credentials, preview native builds for both Android and iOS must be added to the release evidence before store release.

No Expo/EAS account tokens, Apple credentials, Android signing keys, or backend secrets belong in this repository.
