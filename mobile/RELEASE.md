# Mobile conversion

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

Android: Java 21, Android SDK 36, and Gradle wrapper 8.14.3. Run
`bash gradlew assembleDebug bundleRelease` in `android/`. The debug APK is for
installation testing; the release AAB remains unsigned until a release key is
configured. Keep signing keys outside the repository.

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
