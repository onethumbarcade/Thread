# THREAD — One Thumb Arcade

The same HTML/CSS/JavaScript game powers the existing browser build and the
Android/iOS apps. Native builds bundle all gameplay, artwork, and music locally.
Only global rankings require the leaderboard service.

## Mobile development

Use Node 22 or later, then:

```sh
npm ci
npm run sync:mobile
npm run open:android
# or, on macOS with Xcode 26 or later:
npm run open:ios
```

`npm run sync:mobile` builds `dist/` and copies it into both native projects.
Edit the original game pages and `assets/`, not generated `dist/` files. The
native loader waits for saved preferences before starting the game scripts.

Run `npm test` for gameplay, leaderboard, sharing, and native-adapter checks.
The Mobile builds workflow also compiles an Android debug APK, an unsigned
Android release bundle, and an iOS simulator app. It does not publish to stores
or change the live browser version when run on the conversion branch.

App ID: `com.onethumbarcade.thread`. Development version: `0.1.0` (build 1).
See [Mobile release notes](mobile/RELEASE.md) for platform and launch details.
