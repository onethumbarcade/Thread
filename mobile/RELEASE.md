# Mobile conversion

## Version 0.1.9

- Increase Daily Track stat labels from 9px to 13px with aligned values and room for wrapping.
- Rename Your Best to Personal Best.

## Version 0.1.8

- Center the leaderboard ID text block while aligning its heading and IDs left.
- Add matching checkered flag icons to Play, Replay, and Try Again actions.

## Version 0.1.7

- Add global rank beside personal best in the track archive.
- Add Recent and Not Played sorting and 20-track pages covering every released track.
- Use “Top 50 Threaders” on leaderboards.

## Version 0.1.6

- Center the Threader ID column heading and player IDs on the leaderboard, including YOU.

## Version 0.1.5

- Show the daily track leader’s score as Global Best in the post-game summary.
- Keep personal rank separate and refresh the correct global best when returning from the leaderboard.

## Version 0.1.4

- Add equal-width Refresh and Play Track actions to the leaderboard.
- Play Track opens the selected daily or archived track, even while rankings load.
- Native navigation saves pending local changes before opening the selected track.

## Version 0.1.3

- Add aligned Rank, Threader ID, and Score headers; show bare public IDs and retain YOU.
- Replace per-frame laser/tracker shadow blurs with layered neon strokes, including the rainbow Star pulse.
- Update HUD values and power timers only when their displayed values change.
- Keep shape geometry, collision rules, power durations, and canvas resolution unchanged.

## Version 0.1.2

- Daily tracks and their dates use midnight Pacific, including daylight saving changes.
- Cache the animated background glows and collectible artwork; preserve the neon style, canvas resolution, and gameplay physics.
- Measure HUD layout on changes instead of every frame and use an opaque gameplay canvas.
- Android CI compares the prior and cached renderers in the installed WebView and verifies touch movement. Emulator measurements still need confirmation on a phone.

## Included

- Capacitor 8 Android and iOS projects with the THREAD name and existing artwork.
- All game code, menu music, generated music, and images bundled with the app.
- Native Preferences for the installation's player credential, settings,
  attempts, local scores, and pending score uploads. No browser-record migration
  or user-entered player names. Android backup and device transfer are disabled.
- Native HTTP requests to the existing leaderboard API using the same bearer
  credential and server validation. No server credentials are bundled.
- Native sharing and haptics. Track links use
  `onethumbarcade-thread://play?...` and retain the entire custom mix.
- Portrait phone presentation, safe-area handling, and hidden ad placeholders.
- A pause button, automatic pause when leaving the app, explicit Continue,
  and Android Back handling. Game duration excludes paused time.
- iOS required-reason privacy manifest for the Preferences API.

## Building

`npm ci` and `npm run sync:mobile` prepare both projects from a clean checkout.
The generated pages use a startup loader so no game or leaderboard code reads
storage until native Preferences are available. The app opens the title menu
through Capacitor's `server.appStartPath`.
This path must start with `/`: Android appends it directly to the app origin.
The bundle builder rejects a missing slash, and CI installs the app in an
Android emulator with networking disabled to verify title-menu startup and
navigation before publishing the test APK artifact.

Android: Java 21, Android SDK 36, and Gradle wrapper 8.14.3. Run
`bash gradlew assembleDebug bundleRelease` in `android/`. The debug APK is for
installation testing; the release AAB remains unsigned until a release key is
configured. Keep signing keys outside the repository.
CI explicitly creates or restores its test-only key at THREAD_TEST_KEYSTORE,
uses that path for debug signing, and saves the key before emulator diagnostics.
Versions through 0.1.2 used ephemeral keys; uninstall the earlier test build before
installing 0.1.3. This clears that installation's local records and player ID.
Release signing remains separate.

iOS: macOS and Xcode 26 or later. Open `ios/App/App.xcodeproj`, select the Apple
developer team, and build to a registered iPhone or archive for TestFlight.
Swift Package Manager resolves the native dependencies. The CI simulator
artifact cannot be installed directly onto an iPhone.

The GitHub Mobile builds workflow compiles both platforms and attaches build
artifacts to its run. Simulator compilation is not a substitute for real-device
audio, touch, background/resume, and performance testing.

## Still needed before store release

- Confirm the app identifier and publisher account, then configure Android
  release signing and Apple signing/Team ID. Increment store build numbers on
  each subsequent upload.
- Play Console and App Store Connect listings, age ratings, screenshots,
  support contact, and a public privacy-policy URL. Disclosures need to cover
  installation identifiers, public gameplay scores, and leaderboard hosting.
  The app does not include advertising or analytics SDKs in this build.
- Test the first installation, cold relaunch, interrupted runs, music mute,
  custom-track sharing, pending score uploads, and leaderboard return on actual
  Android and iPhone devices. Test offline play separately from ranked runs:
  starting a ranked run requires a server connection.
- Custom-scheme challenge links require an installed app. Verified HTTPS App
  Links/Universal Links and store-install fallbacks can be configured once the
  public domain, Android release certificate, Apple Team ID, and store URLs are
  available. Plain track codes remain available in the existing share flow.
- Implement and review real advertising or purchases separately if desired;
  the previous display-ad placeholders are hidden in the native build.

Changes on the native conversion branch are not automatically a store release.
No store credentials, purchase setup, browser-player transfer, or production
publication are part of this first build.
