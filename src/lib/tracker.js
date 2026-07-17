import GLib from 'gi://GLib';

import {matchPlatform, isBrowserWindow, parsePlatforms} from './matcher.js';
import {Storage} from './storage.js';

const TICK_SECONDS = 1;
// Guard against scheduler stalls and suspend edge cases: a single tick can
// never account for more than this much wall time.
const MAX_TICK_DELTA = 2;
const FLUSH_INTERVAL_SECONDS = 60;

// Shell glue: watches the focused window, its title, and user idle time, and
// drives the SessionEngine with 1s ticks. Owns the usage-storage flush cadence.
export class Tracker {
    /**
     * @param {object} params
     * @param {Gio.Settings} params.settings extension settings
     * @param {SessionEngine} params.engine
     * @param {Storage} params.storage
     * @param {(events: Array) => void} params.onEvents engine events per tick
     * @param {() => void} params.onUpdate called every tick (UI refresh)
     */
    constructor({settings, engine, storage, onEvents, onUpdate}) {
        this._settings = settings;
        this._engine = engine;
        this._storage = storage;
        this._onEvents = onEvents;
        this._onUpdate = onUpdate;

        this._tickId = null;
        this._focusSignalId = null;
        this._titleSignalId = null;
        this._settingsSignalIds = [];
        this._focusedWindow = null;
        this._activePlatform = null;
        this._lastFlushedPlatform = null;
        this._lastMonotonicUs = GLib.get_monotonic_time();
        this._sinceFlushSec = 0;
        this._date = Storage.today();
        this._platformsError = false;
        this._idleUnavailable = false;

        this._idleMonitor = null;
        try {
            this._idleMonitor = global.backend.get_core_idle_monitor();
        } catch (e) {
            this._idleUnavailable = true;
            console.warn(`[scroll-scold] idle monitor unavailable, treating user as always active: ${e.message}`);
        }

        this._loadSettings();
    }

    get activePlatform() {
        return this._activePlatform;
    }

    get platforms() {
        return this._platforms;
    }

    get hasError() {
        return this._platformsError || this._storage.lastError !== null;
    }

    enable() {
        this._focusSignalId = global.display.connect('notify::focus-window',
            () => this._onFocusChanged());
        this._settingsSignalIds.push(
            this._settings.connect('changed::platforms', () => {
                this._loadSettings();
                this._recomputeActive();
            }),
            this._settings.connect('changed::browser-wm-classes', () => {
                this._loadSettings();
                this._recomputeActive();
            }),
            this._settings.connect('changed::restrict-to-browsers', () => {
                this._loadSettings();
                this._recomputeActive();
            }));
        this._onFocusChanged();

        this._lastMonotonicUs = GLib.get_monotonic_time();
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = null;
        }
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
        this._disconnectTitleSignal();
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);
        this._settingsSignalIds = [];
        this._flush();
    }

    _loadSettings() {
        const {platforms, error} = parsePlatforms(this._settings.get_string('platforms'));
        this._platforms = platforms;
        this._platformsError = error;
        this._browserTokens = this._settings.get_strv('browser-wm-classes');
        this._restrictToBrowsers = this._settings.get_boolean('restrict-to-browsers');
    }

    _disconnectTitleSignal() {
        if (this._titleSignalId && this._focusedWindow) {
            try {
                this._focusedWindow.disconnect(this._titleSignalId);
            } catch {
                // window may already be destroyed
            }
        }
        this._titleSignalId = null;
        this._focusedWindow = null;
    }

    _onFocusChanged() {
        this._disconnectTitleSignal();
        const win = global.display.focus_window;
        if (win) {
            this._focusedWindow = win;
            // Title changes are how we see tab switches and in-page navigation —
            // the window object stays the same, only its title updates.
            this._titleSignalId = win.connect('notify::title',
                () => this._recomputeActive());
        }
        this._recomputeActive();
    }

    _recomputeActive() {
        const win = this._focusedWindow;
        let active = null;
        if (win) {
            const classes = [
                win.get_wm_class?.(),
                win.get_wm_class_instance?.(),
                win.get_gtk_application_id?.(),
                win.get_sandboxed_app_id?.(),
            ];
            const isBrowser = !this._restrictToBrowsers ||
                isBrowserWindow(classes, this._browserTokens);
            if (isBrowser)
                active = matchPlatform(win.get_title() ?? '', this._platforms);
        }
        if (active !== this._activePlatform) {
            this._activePlatform = active;
            this._flush();
        }
    }

    _isIdle() {
        if (!this._idleMonitor)
            return false;
        try {
            const idleMs = this._idleMonitor.get_idletime();
            return idleMs > this._settings.get_int('idle-seconds') * 1000;
        } catch {
            return false;
        }
    }

    _tick() {
        const nowUs = GLib.get_monotonic_time();
        // CLOCK_MONOTONIC halts during suspend on Linux, and the clamp keeps
        // any residual jump from being counted as active time.
        const delta = Math.min(Math.max((nowUs - this._lastMonotonicUs) / 1e6, 0), MAX_TICK_DELTA);
        this._lastMonotonicUs = nowUs;

        // New day: zero all totals (wall-clock date also catches overnight suspend).
        const today = Storage.today();
        if (today !== this._date) {
            this._date = today;
            this._engine.resetToday();
            this._flush();
        }

        const monitoring = this._settings.get_boolean('monitoring-enabled');
        const events = this._engine.advance({
            deltaSeconds: delta,
            activePlatform: this._activePlatform,
            isIdle: this._isIdle(),
            monitoring,
        });

        if (monitoring && this._activePlatform !== null) {
            this._sinceFlushSec += delta;
            if (this._sinceFlushSec >= FLUSH_INTERVAL_SECONDS)
                this._flush();
        }

        if (events.length > 0)
            this._onEvents(events);
        this._onUpdate();
    }

    _flush() {
        this._sinceFlushSec = 0;
        this._storage.save(this._engine.todaySnapshot());
    }
}
