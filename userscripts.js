// ==UserScript==
// @name         YouTube Safari: Background Play & Ad Skipper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Forces background playback and auto-skips ads on YouTube.
// @author       You
// @match        *://*.youtube.com/*
// @grant        none
// @run-at       document-start
// @inject-into  page
// ==/UserScript==

(function() {
    'use strict';

    // ----------------------------------------------------
    // 0. STRIP AD DATA FROM PLAYER RESPONSES
    // ----------------------------------------------------
    // Removes ad schedules before the player reads them, so most ads never load.
    const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
    const stripAds = obj => {
        if (obj && typeof obj === 'object') {
            AD_KEYS.forEach(key => { if (key in obj) delete obj[key]; });
            if (obj.playerResponse) stripAds(obj.playerResponse);
        }
        return obj;
    };

    const origParse = JSON.parse;
    JSON.parse = function(...args) {
        return stripAds(origParse.apply(this, args));
    };

    const origJson = Response.prototype.json;
    Response.prototype.json = function() {
        return origJson.call(this).then(stripAds);
    };

    // Initial page load embeds the player response as an inline object literal
    let initialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        get: () => initialPlayerResponse,
        set: value => { initialPlayerResponse = stripAds(value); }
    });

    // ----------------------------------------------------
    // 1. BACKGROUND PLAY (Spoof Visibility)
    // ----------------------------------------------------
    // This stops YouTube from knowing when you switch tabs or minimize the browser.
    const spoofVisibility = () => {
        try {
            Object.defineProperties(document, {
                'hidden': { value: false, writable: false },
                'visibilityState': { value: 'visible', writable: false },
                'webkitHidden': { value: false, writable: false },
                'webkitVisibilityState': { value: 'visible', writable: false }
            });
        } catch (e) {
            // Ignore if already defined
        }
    };
    
    spoofVisibility();

    // ----------------------------------------------------
    // 1b. TEMPORARY DEBUG: first background switch pauses playback
    // ----------------------------------------------------
    // DEBUG_LOG shows an on-screen log (also saved in localStorage so it survives reloads).
    // TRY_RESUME makes ONE play() attempt after iOS pauses on backgrounding.
    // If Control Center play breaks again, set TRY_RESUME to false.
    const DEBUG_LOG = false;
    const TRY_RESUME = true;
    const RESUME_WINDOW_MS = 1500; // pause must land this close to the background switch
    const RESUME_DELAY_MS = 1000;  // wait for the switch to finish before calling play()
    const LOG_KEY = 'ytbgDebugLog';

    // Real visibility, unaffected by the spoof above
    const realHiddenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
    const isReallyHidden = () => realHiddenGetter.call(document);

    let logLines = [];
    try { logLines = JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) {}
    let logPanel = null;

    const renderLog = () => {
        if (!logPanel) return;
        logPanel.textContent = logLines.join('\n');
        logPanel.scrollTop = logPanel.scrollHeight;
    };

    const log = msg => {
        if (!DEBUG_LOG) return;
        const now = new Date();
        const stamp = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
        logLines.push(`${stamp} ${isReallyHidden() ? 'BG' : 'FG'} ${msg}`);
        logLines = logLines.slice(-40);
        try { localStorage.setItem(LOG_KEY, JSON.stringify(logLines)); } catch (e) {}
        renderLog();
    };

    if (DEBUG_LOG) {
        document.addEventListener('DOMContentLoaded', () => {
            logPanel = document.createElement('pre');
            logPanel.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:2147483647;' +
                'max-width:75vw;max-height:30vh;overflow:hidden;margin:0;padding:4px;' +
                'font:10px/1.3 monospace;color:#0f0;background:rgba(0,0,0,.75);' +
                'pointer-events:none;white-space:pre-wrap;';
            document.documentElement.appendChild(logPanel);
            log('--- page loaded ---');
        });
    }

    let backgroundedAt = 0;
    let pausedVideo = null;
    let pausedAt = 0;
    let resumeTried = false;

    const maybeResume = () => {
        if (!TRY_RESUME || resumeTried || !pausedVideo || !backgroundedAt) return;
        if (Math.abs(pausedAt - backgroundedAt) > RESUME_WINDOW_MS) return;

        resumeTried = true; // one attempt per background switch, no retries
        const video = pausedVideo;
        setTimeout(() => {
            if (!isReallyHidden() || !video.paused) {
                log('resume skipped');
                return;
            }
            log('resume: play()');
            video.play().then(
                () => log('play() ok'),
                err => log(`play() rejected: ${err.name}`)
            );
        }, RESUME_DELAY_MS);
    };

    // Registered before the blockers below so these still see the events
    ['visibilitychange', 'pagehide', 'pageshow', 'blur', 'focus'].forEach(evt => {
        window.addEventListener(evt, e => {
            if (e.target !== window && e.target !== document) return; // skip element blur/focus
            log(evt);
            if (evt === 'visibilitychange' && isReallyHidden()) {
                backgroundedAt = Date.now();
                resumeTried = false;
                maybeResume(); // covers the pause firing before visibilitychange
            }
        }, true);
    });

    // Media events don't bubble, but capture-phase listeners still see them
    ['play', 'playing', 'pause', 'waiting', 'ended'].forEach(evt => {
        document.addEventListener(evt, e => {
            if (!(e.target instanceof HTMLVideoElement)) return;
            log(`${evt} t=${e.target.currentTime.toFixed(1)}`);
            if (evt === 'pause') {
                pausedVideo = e.target;
                pausedAt = Date.now();
                maybeResume();
            }
        }, true);
    });

    // Block the events that trigger video pausing
    const blockEvents = ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur'];
    blockEvents.forEach(evt => {
        window.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
    });

    // ----------------------------------------------------
    // 2. AD BLOCKING & AUTO-SKIPPING
    // ----------------------------------------------------
    // Ads and content share one <video>, so remember what we changed and restore it
    let mutedByScript = false;
    let savedRate = 1;

    const handleVideoAd = () => {
        const player = document.querySelector('.html5-video-player');
        const video = player && player.querySelector('video');
        if (!video) return;

        if (player.classList.contains('ad-showing')) {
            // Mute immediately, without waiting for duration to be known
            if (!mutedByScript) {
                savedRate = video.playbackRate;
                mutedByScript = true;
            }
            video.muted = true;
            video.playbackRate = 16;
            if (isFinite(video.duration)) video.currentTime = video.duration - 0.1;

            const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            if (skipBtn) skipBtn.click();
        } else if (mutedByScript) {
            video.muted = false;
            video.playbackRate = savedRate;
            mutedByScript = false;
        }
    };

    // Media events don't bubble, but capture-phase listeners still see them
    ['loadstart', 'loadedmetadata', 'playing', 'timeupdate'].forEach(evt => {
        document.addEventListener(evt, handleVideoAd, true);
    });

    // React the moment the player toggles its "ad-showing" class
    new MutationObserver(handleVideoAd).observe(document, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true
    });

    const handleAds = () => {
        handleVideoAd();

        // C. Hide static banner ads, side-panel ads, and popups
        const adSelectors = [
            'ytd-companion-slot-renderer',
            'ytd-promoted-sparkles-web-renderer',
            'ytd-display-ad-renderer',
            '.ytd-player-legacy-desktop-watch-ads-renderer',
            'ytd-in-feed-ad-layout-renderer',
            'ytd-ad-slot-renderer'
        ];
        
        adSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el.style.display !== 'none') el.style.display = 'none';
            });
        });
        
        // D. Attempt to close the "Ad blockers violate terms" popup if it appears
        const antiAdblockPopup = document.querySelector('tp-yt-paper-dialog:has(yt-formatted-string[text*="Ad blockers"])');
        if (antiAdblockPopup) {
            antiAdblockPopup.remove();
            // Try to unpause the video if the popup paused it
            const mainVideo = document.querySelector('video.html5-main-video');
            if (mainVideo && mainVideo.paused) mainVideo.play();
        }
    };

    // Run the ad handler continuously (every 300ms) to catch ads the second they inject
    setInterval(handleAds, 300);

})();