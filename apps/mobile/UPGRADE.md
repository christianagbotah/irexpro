# iRexPro Mobile — Expo SDK Modernization Plan

The mobile app is now on Expo SDK 54. The current stable Expo line is SDK 57, so modernization remains incremental rather than a multi-major dependency jump.

## Governing rule

Upgrade one Expo SDK at a time and require the complete exact-head mobile release gate after every step:

1. SDK 51 → 52 — completed
2. SDK 52 → 53 — completed
3. SDK 53 → 54 — completed
4. React Native New Architecture on SDK 54 — current checkpoint
5. SDK 54 → 55
6. SDK 55 → 56
7. SDK 56 → 57

Each checkpoint must be a separate pull request. Do not stack the next SDK change until the preceding checkpoint is merged into `main` and its exact combined state is green.

## Required validation for every SDK step

From a clean frozen-lock install, every candidate must pass:

- `expo install --check` — immutable Expo dependency-alignment validation
- `pnpm --filter @irexpro/mobile validate:release-config`
- `pnpm --filter @irexpro/mobile typecheck`
- Android Metro export
- iOS Metro export
- Release Security and every other workflow selected by the exact-head path matrix
- Required CI Gate

When dependency versions change, regenerate `pnpm-lock.yaml` with pnpm rather than hand-editing resolved dependency graphs. Run Expo's dependency fixer for the target SDK, then review every package change before committing it.

## New Architecture checkpoint on SDK 54

SDK 54 is the final Expo release that permits opting out of React Native New Architecture. The dedicated Sprint 53 checkpoint therefore enables New Architecture on SDK 54 before any SDK 55 dependency upgrade.

Required proof for this checkpoint:

1. Do not change Expo, React Native, React, or lockfile versions merely to enable the architecture.
2. Remove the explicit `newArchEnabled: false` opt-out from app configuration so SDK 54 uses its New Architecture default.
3. Run `expo-doctor@latest` and review every compatibility result rather than assuming native-module support.
4. Generate disposable Android and iOS native projects with Expo prebuild and verify that both resolve New Architecture as enabled.
5. Preserve SecureStore session behavior, safe-area handling, accessibility, EAS identifiers/profiles, and production API configuration.
6. Pass mobile TypeScript, Android export, iOS export, and all exact-head repository gates.
7. Once accepted, release configuration must reject any attempt to restore the Legacy Architecture opt-out.

## SDK 54 monorepo resolution baseline

The Sprint 53 compatibility probe demonstrated that the old SDK-51-era Metro overrides and forced pnpm hoisting are no longer appropriate on SDK 54. With those legacy settings present, Expo Doctor reported a Metro-default mismatch and duplicate React/native-module resolution. The validated SDK 54 baseline therefore:

- uses Expo's default `getDefaultConfig(__dirname)` Metro configuration without custom `watchFolders` or `resolver.nodeModulesPaths`
- uses pnpm's isolated dependency layout by removing the workspace-level `nodeLinker: hoisted` override
- keeps root/web/admin React and ReactDOM on 19.2.8 while mobile resolves its Expo-aligned React 19.1.0 independently
- retains the existing lockfile because the isolated layout installs successfully from the frozen SDK 54 lock

This combination passed Expo Doctor, Expo dependency alignment, mobile TypeScript, Android and iOS Metro exports, Web and Admin production builds, and disposable Android/iOS native generation before being committed.

## Remaining SDK checkpoints

After New Architecture is proven on SDK 54, continue in order: SDK 54 → 55, SDK 55 → 56, then SDK 56 → 57. Read each release's current migration notes before changing dependencies because minimum tooling and platform requirements can advance between releases.

Do not remove compatibility workarounds merely because a newer SDK supports a cleaner default. Remove each workaround only in the checkpoint where CI/build evidence proves the default replacement works in this monorepo.

## EAS/native proof boundary

Metro export proves JavaScript bundling and module resolution; it does not replace signed native-build evidence. Disposable `expo prebuild` output can prove generated architecture configuration, but store-grade native proof still requires authorized EAS project linkage and platform signing credentials.

Once an authorized operator links the app to its EAS project and configures platform credentials, preview native builds for both Android and iOS must be added to the release evidence before store release.

No Expo/EAS account tokens, Apple credentials, Android signing keys, or backend secrets belong in this repository.
