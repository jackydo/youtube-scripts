# YouTube Safari: Background Play & Ad Skipper

A userscript for YouTube in Safari (iOS and macOS) that keeps audio playing in
the background and blocks or skips ads.

## Features

- **Background play**: tells YouTube the page is always visible and blocks the
  `visibilitychange`, `pagehide` and `blur` events YouTube uses to pause playback.
- **Ad data stripping**: removes `adPlacements`, `adSlots`, `playerAds` and
  `adBreakHeartbeatParams` from player responses (`JSON.parse`,
  `Response.json()` and `ytInitialPlayerResponse`), so most ads never load.
- **Video ad handling**: when the player enters ad mode, it mutes the ad, plays
  it at 16× and seeks to the end. It also clicks "Skip Ad". Mute and playback
  speed are restored when the ad ends.
- **Banner and feed ads**: hides companion, sparkles, display and in-feed ad
  elements.
- **Anti-adblock popup**: removes the "Ad blockers violate terms" dialog and
  resumes the video.

## Install

The script must run in the page context. It declares `@inject-into page` and
`@run-at document-start`.

- **iOS / macOS Safari**: install the [Userscripts](https://github.com/quoid/userscripts)
  app, then copy `userscripts.js` into its scripts folder.
- **Tampermonkey**: create a new script and paste the contents of
  `userscripts.js`. Tampermonkey ignores `@inject-into`.

## Debug options

Section `1b` of the script contains a temporary debug block for the
first-background-switch pause on iOS:

| Constant      | Default | Effect                                                                 |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `DEBUG_LOG`   | `true`  | Shows an on-screen event log (bottom-left) and saves it to `localStorage` under `ytbgDebugLog`. |
| `TRY_RESUME`  | `true`  | Calls `play()` once if the video pauses within 1.5 s of the page going to the background. |

Set `TRY_RESUME = false` if pressing play in Control Center stops working.
Set `DEBUG_LOG = false` to hide the log.

## Known issues

- On iOS, the first switch to the background can still pause playback. Press
  play in Control Center to resume; later switches keep playing. A fix is in
  progress (see Debug options).
- Ads that YouTube inserts directly into the video stream are not affected by
  ad data stripping. They are still muted and sped up.
