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

## Usage

The script runs through [Userscripts](https://github.com/quoid/userscripts),
a free, open-source Safari extension for iOS and macOS. The script needs page
access, so it sets `@inject-into page` and `@run-at document-start`.

### 1. Install the Userscripts extension

**iOS / iPadOS**

1. Install **Userscripts** from the App Store.
2. Open the Userscripts app and tap **Set Userscripts Directory**. Pick or
   create a folder, for example `Userscripts` in iCloud Drive or
   On My iPhone.
3. Go to **Settings → Apps → Safari → Extensions → Userscripts** (on iOS 17
   and earlier: **Settings → Safari → Extensions**). Turn it on, and set
   **All Websites** or at least `youtube.com` to **Allow**.

**macOS**

1. Install **Userscripts** from the Mac App Store.
2. Open the Userscripts app and click **Change Userscripts Directory** to
   pick a folder.
3. In Safari, go to **Settings → Extensions**, enable **Userscripts**, and
   allow it on `youtube.com`.

### 2. Add this script

Copy `userscripts.js` into the Userscripts directory you picked, using the
Files app on iOS or Finder on macOS. In Safari, open the extensions menu (the
puzzle-piece icon, or **aA** in the iOS address bar), tap **Userscripts**, and
check that **YouTube Safari: Background Play & Ad Skipper** is listed and
enabled.

### 3. Use it

1. Open `youtube.com` (or `m.youtube.com`) in Safari and play a video.
   Reload the page if YouTube was already open before you added the script.
2. Switch to another app or lock the screen. Audio keeps playing, and you can
   control it from Control Center or the lock screen.
3. Ads are blocked when possible. Ads that still appear are muted, sped up
   and skipped.

To update the script, replace the file in the Userscripts directory and
reload YouTube.

**Tampermonkey** (other browsers): create a new script and paste in the
contents of `userscripts.js`. Tampermonkey ignores `@inject-into`.

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
