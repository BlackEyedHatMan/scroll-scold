# Scroll Scold — GNOME Shell Extension (v1)

## Context

Greenfield build. The repo contains only a README, LICENSE, and the design mockup at `docs/artwork/scroll-scold-notification-art.png`, which specifies: six top-bar bell-icon states (normal, approaching-limit, limit-reached, muted, paused, error), the indicator popup menu (per-platform "12 / 15 min" rows, Monitoring / Mute alerts toggles, Reset today, Preferences, About, Quit), and the notification design (angry bell icon, "You've hit 15 minutes on YouTube.", Snooze 5 min / Got it buttons).

**Decisions confirmed with the user:**
- **Architecture**: the entire app is a **GNOME Shell extension (GJS/ESM)** — GNOME has no real system tray, so the panel indicator *is* a shell extension, and the shell can read focused-window titles on Wayland across all browsers and Chrome profiles with zero per-browser setup. Site detection = keyword matching on the focused browser window's title (only the active tab is visible in the title, which is exactly requirement #11's "actively using" semantics).
- **Timer**: per-platform continuous-session timer; leaving the site pauses it, and after a configurable grace period (default 60 s) away, it resets to 0. Cumulative "today" time is tracked separately for the menu display / "Reset today".
- **Re-notify**: "Snooze 5 min" re-scolds 5 minutes later if still on the site; "Got it"/dismiss re-scolds after another full threshold of continued use.

Target: GNOME 46–49 (Ubuntu 24.04 → latest), Wayland-first, X11-compatible.

## File layout

```
scroll-scold/
├── Makefile                      # schemas, pack (gnome-extensions pack), install, test, nested
├── README.md                     # rewrite: features, install, dev guide, known limitations
├── src/                          # ships in the extension zip
│   ├── metadata.json             # uuid scroll-scold@blackeyedhatman.com, shell-version 46–49
│   │                             #   (UUID is an identifier string in email-like format per GNOME
│   │                             #    convention — NOT a real mailbox, nothing will ever email it)
│   ├── extension.js              # Extension subclass — wiring only
│   ├── prefs.js                  # ExtensionPreferences entry
│   ├── lib/
│   │   ├── constants.js          # state enum, defaults, scold lines, icon map
│   │   ├── matcher.js            # PURE: title stripping + keyword matching (no gi imports)
│   │   ├── sessionEngine.js      # PURE core: timer/session/threshold state machine
│   │   ├── tracker.js            # shell glue: focus window, title signal, idle, 1s tick
│   │   ├── indicator.js          # PanelMenu.Button + popup menu
│   │   ├── notifier.js           # MessageTray notifications + sound
│   │   └── storage.js            # today-usage persistence + midnight reset
│   ├── prefsPages/
│   │   ├── generalPage.js        # threshold, grace, idle, sound, detection
│   │   └── platformsPage.js      # platform list add/edit/remove
│   ├── schemas/org.gnome.shell.extensions.scroll-scold.gschema.xml
│   ├── icons/                    # 6 symbolic SVGs (16px angry-bell states) + full-color scroll-scold.svg
│   └── sounds/scold.oga          # default alert sound (generate an original chime, e.g. via sox/ffmpeg)
└── tests/testMatcher.js, testSessionEngine.js   # run with `gjs -m`
```

## GSettings schema (`org.gnome.shell.extensions.scroll-scold`)

| Key | Type | Default |
|---|---|---|
| `platforms` | `s` (JSON) | YouTube, X (Twitter), Facebook, Instagram, TikTok, Reddit with match rules |
| `threshold-minutes` | `i` | 15 (range 1–480) — the single global threshold |
| `grace-seconds` | `i` | 60 |
| `idle-seconds` | `i` | 60 |
| `monitoring-enabled` / `mute-alerts` | `b` | true / false — two-way bound to menu toggles |
| `play-sound` / `use-custom-sound` / `custom-sound-path` | `b`/`b`/`s` | true / false / "" |
| `restrict-to-browsers` | `b` | true |
| `browser-wm-classes` | `as` | chrome, chromium, firefox, brave, edge, opera, vivaldi, librewolf, zen, epiphany |

`platforms` JSON: `[{"name": "YouTube", "rules": [{"mode": "contains", "value": "youtube"}]}, {"name": "X (Twitter)", "rules": [{"mode": "suffix", "value": "/ X"}, {"mode": "contains", "value": "twitter"}]}, ...]`

**Usage stats do NOT go in GSettings** (would hammer dconf every second). JSON state file at `~/.local/state/scroll-scold/usage.json`: `{"date": "2026-07-17", "seconds": {"YouTube": 743}}`. Flushed on platform change, every 60 s while active, and in `disable()`; written atomically.

## Module design

### matcher.js (pure, unit-tested)
1. Lowercase title; strip leading unread count `^\(\d+\+?\)\s*`; strip browser suffix by splitting on last ` - `/` — `/` – ` and dropping the segment if it *equals* a known browser name (repeat once for "Firefox Private Browsing"). Chrome profile names appear in wm_class, not titles.
2. Rule modes: `contains` (substring) and `suffix` (endsWith — needed for X, whose titles are `Home / X`, `(1) Notifications / X`; a bare "x" contains-match would match everything).
3. **Browser gating (default on)**: accept only if any configured browser token is a case-insensitive substring of the window's `wm_class` / `wm_class_instance` — substring matching is what survives multi-profile Chrome (`google-chrome (Profile 1)`). Prevents false positives like an editor with `youtube-player.js` open.

### sessionEngine.js (pure, injectable clock, unit-tested)
Per-platform record `{sessionSec, todaySec, awaySec, nextNotifyAtSec}`. Driven by a 1 s tick with `delta = clamp((monotonicNow − last)/1e6, 0, 2)` — monotonic clock + clamp means suspend gaps never count.
- On matched platform focused & not idle: session and today accumulate; `awaySec = 0`.
- Idle on the platform: pause only.
- Away from platform: `awaySec += delta`; past grace → `sessionSec = 0`, notify state cleared.
- Crossing threshold (or `nextNotifyAtSec`): emit `threshold-crossed`; then `nextNotifyAtSec = sessionSec + thresholdSec`. `snooze()` sets it to `sessionSec + 300`.
- Midnight rollover: compare local date each tick; on change zero today-seconds and persist.
- Indicator state priority: error > paused (monitoring off) > muted > limit-reached (any session ≥ threshold) > approaching (≥ 80%) > normal.

### tracker.js
`global.display.connect('notify::focus-window')`; reconnect `notify::title` on the focused `Meta.Window` (title changes detect tab switches/SPA navigation). Idle via `global.backend.get_core_idle_monitor().get_idletime()` polled in the 1 s tick (try/catch fallback = never idle + error state). All GLib sources tracked and removed in `destroy()`.

### indicator.js
`PanelMenu.Button` with `St.Icon` (`style_class: 'system-status-icon'`), gicon swapped from a cached map of the six `-symbolic.svg` files (symbolic filename suffix → automatic theme recoloring). Menu per mockup:
- Header "Scroll Scold" + gear `St.Button` → `extension.openPreferences()`
- Per-platform rows: name left, "N / 15 min" right (today-minutes/threshold); refreshed only while menu is open
- `PopupSwitchMenuItem` Monitoring / Mute alerts, two-way bound to GSettings
- Reset today → `engine.resetToday()`; Preferences → `openPreferences()`; About → open repo URL; Quit → `GLib.idle_add(() => Main.extensionManager.disableExtension(this.uuid))` (idle-deferred because the handler runs inside UI that disable() destroys)
- No per-platform brand logos in v1 (trademark issue for extensions.gnome.org review)

### notifier.js (GNOME 46+ MessageTray rework API — constructor-props style only)
`new MessageTray.Source({title: 'Scroll Scold', icon})` added to `Main.messageTray`; `new MessageTray.Notification({source, title, body, gicon})` with `addAction('Snooze 5 min', …)` / `addAction('Got it', …)`. Body: `You've hit ${minutes} minutes on ${platform}.` + a random scold line ("That's enough rabbit holes for now. Go do something legendary." + a few more). Sound via `global.display.get_sound_player().play_from_file(Gio.File, …)` in try/catch — custom path if configured and exists, else bundled `scold.oga`. `mute-alerts` skips both notification and sound (timers keep running).

### prefs.js (Adw/GTK4 — separate process, never import shell modules)
- **General page**: SpinRows for threshold/grace/idle; SwitchRows mute-alerts, play-sound, use-custom-sound; ActionRow with `Gtk.FileDialog` for custom sound path; SwitchRow restrict-to-browsers + EntryRow (comma-separated) browser list.
- **Platforms page**: PreferencesGroup with "+" header button; one `Adw.ExpanderRow` per platform (EntryRow name, EntryRow keywords, delete button). Keyword syntax: comma-separated; trailing `$` = suffix mode (e.g. X shows `/ X$, twitter`); parsed to/from the JSON rules.

## Implementation order

0. Commit this planning document to the repo as `docs/gnome-app-plan.md` and push to `main` — before any code. Then pause for a conversation the user requested about why the extension is written in `.js` files, before starting implementation.
1. Scaffold: metadata.json, schema, Makefile, empty enable/disable; verify load in nested shell
2. `matcher.js` + tests (fixture table of real Chrome/Firefox/X tab titles)
3. `sessionEngine.js` + tests (grace reset, idle pause, snooze/re-notify, midnight rollover)
4. `tracker.js` — log detected platform to journal; verify with real browsers
5. `indicator.js` — states, menu, toggles
6. `notifier.js` — notification, actions, sound
7. `storage.js` — persistence, midnight reset, Reset today
8. Prefs pages
9. Assets: trace mockup bell into 6 symbolic SVGs (16×16, plain paths) + full-color notification SVG; generate original `scold.oga` chime
10. README rewrite + packaging audit (everything destroyed in `disable()`, no leaked sources — extensions.gnome.org requirement)

## Verification

- **Unit**: `make test` → `gjs -m tests/testMatcher.js && gjs -m tests/testSessionEngine.js` (pure modules, hand-rolled asserts)
- **Live**: `make pack && make install`, then `dbus-run-session -- gnome-shell --nested --wayland`; enable via `gnome-extensions enable scroll-scold@blackeyedhatman.com`; launch a browser inside the nested session. Logs: `journalctl -f -o cat /usr/bin/gnome-shell`. Prefs standalone: `gnome-extensions prefs <uuid>`.
- **Manual matrix** (threshold set to 1 min): Chrome default + second profile, Firefox; X title variants (`Home / X`, `(1) … / X`); idle pause (70 s no input); grace reset (70 s in terminal); snooze/got-it re-notify cycles; Reset today; suspend/resume (no time jump).

## Known v1 limitations (document in README)
- Title matching can rarely false-positive (mitigated by browser gating); X title format may drift — rules are user-editable data.
- PWA/`crx_` windows don't pass the browser gate by default (user can add `crx_` to the browser list).
- Verify MessageTray API + `get_core_idle_monitor()` against the installed shell version during build (flagged, isolated behind small wrappers).
