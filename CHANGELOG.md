# Changelog

All notable public releases for this repository are documented here.

This changelog is intentionally public and release-focused. Internal planning notes remain local-only in `.planning/`.

## Download the Mac App

- macOS installers (`.dmg` / `.zip`) are published on the [Latest Release](https://github.com/tvcnet/videorepair/releases/latest).
- GitHub `Code` -> `Download ZIP` is source code only (not the installable app).

## [2.0.3] - 2026-02-23

Patch release for packaged macOS app repair-completion reliability.

### Fixed
- Packaged app backend now detects repaired output files when `untrunc` adds option suffixes (for example `*_fixed-dyn.mp4`) instead of assuming only `*_fixed.mp4`.
- Backend now captures the actual `untrunc` save path from logs and returns the correct repaired file path to the UI.
- Prevents false failure states where repair succeeded but the app reported an error after `untrunc` exited with code `0`.

## [2.0.2] - 2026-02-23

Patch release for packaged macOS app repair-start reliability.

### Fixed
- Electron file selection path handling for modern Electron versions (uses a preload bridge instead of relying on deprecated/removed renderer `File.path` behavior).
- Repair-start UX feedback so failed starts surface a visible error in the repair log/panel instead of appearing to hang at `0%`.
- Added an immediate backend "Starting repair job..." log entry so long-running repairs do not look stalled before first progress output.

## [2.0.1] - 2026-02-23

First properly packaged macOS application release of VideoRepair Pro.

### Fixed
- Packaged app startup reliability (Electron now waits for the local server to be ready).
- Finder launch issue that could show `Cannot GET /`.
- Packaged `untrunc` execution by unpacking the binary from `app.asar` and resolving the runtime path.

### Changed
- Desktop/local file handling flow for the mac app wrapper.
- Release and Git hygiene for versioned mac app publishing.

## [2.0.0] - 2026-02-22

Transitional VideoRepair Pro branding release.

### Important Note
- This tag points to a web application snapshot, not the packaged macOS app build.
- The first proper packaged macOS app release is `v2.0.1`.

### Changed
- VideoRepair Pro branding/version preparation in the web app.
- Web UI and release-prep updates for the 2.x line.

## [1.0.0] - 2026-02-22

Initial public VideoRepair web application release (pre-Electron/mac packaging).

### Added
- Node.js/Express web wrapper for `untrunc`.
- Web UI flow for selecting reference/corrupt videos and starting repairs.
- Basic repair orchestration and progress/status handling.
