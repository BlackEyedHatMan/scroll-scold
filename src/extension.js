import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {showAboutDialog} from './lib/aboutDialog.js';
import {IndicatorState} from './lib/constants.js';
import {parsePlatforms} from './lib/matcher.js';
import {SessionEngine, EngineEvent} from './lib/sessionEngine.js';
import {Storage} from './lib/storage.js';
import {Tracker} from './lib/tracker.js';
import {Indicator} from './lib/indicator.js';
import {Notifier} from './lib/notifier.js';

// True until the first enable() in this GNOME Shell process. The lock screen
// disables/re-enables extensions within the SAME process, while a logout
// starts a new one — so this flag distinguishes a fresh login (reset the
// timers) from a mere unlock (keep them).
let freshLogin = true;

export default class ScrollScoldExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._quitIdleId = null;

        this._storage = new Storage();
        let todaySeconds;
        if (freshLogin) {
            freshLogin = false;
            todaySeconds = {};
            this._storage.save({});
        } else {
            todaySeconds = this._storage.load().seconds;
        }
        this._engine = new SessionEngine({
            thresholdSeconds: this._settings.get_int('threshold-minutes') * 60,
            graceSeconds: this._settings.get_int('grace-seconds'),
            snoozeSeconds: this._settings.get_int('snooze-minutes') * 60,
            todaySeconds,
        });

        this._notifier = new Notifier({
            settings: this._settings,
            engine: this._engine,
            extensionPath: this.path,
        });

        this._tracker = new Tracker({
            settings: this._settings,
            engine: this._engine,
            storage: this._storage,
            onEvents: events => this._onEngineEvents(events),
            onUpdate: () => this._onTick(),
        });

        this._indicator = new Indicator({
            extension: this,
            settings: this._settings,
            engine: this._engine,
            onResetToday: () => {
                this._engine.resetToday();
                this._storage.save({});
                this._indicator.refreshUsage();
            },
        });
        Main.panel.addToStatusArea('scroll-scold', this._indicator);
        this._indicator.setPlatforms(this._tracker.platforms);

        this._settingsSignalIds = [
            this._settings.connect('changed::threshold-minutes', () => {
                this._engine.thresholdSeconds = this._settings.get_int('threshold-minutes') * 60;
            }),
            this._settings.connect('changed::grace-seconds', () => {
                this._engine.graceSeconds = this._settings.get_int('grace-seconds');
            }),
            this._settings.connect('changed::snooze-minutes', () => {
                this._engine.snoozeSeconds = this._settings.get_int('snooze-minutes') * 60;
            }),
            this._settings.connect('changed::platforms', () => {
                // Parse fresh: the tracker's cached copy may not be updated
                // yet (its own changed:: handler can run after this one).
                const {platforms} = parsePlatforms(this._settings.get_string('platforms'));
                this._indicator?.setPlatforms(platforms);
            }),
        ];

        this._tracker.enable();
    }

    disable() {
        if (this._quitIdleId) {
            GLib.source_remove(this._quitIdleId);
            this._quitIdleId = null;
        }
        for (const id of this._settingsSignalIds ?? [])
            this._settings.disconnect(id);
        this._settingsSignalIds = [];
        this._tracker?.destroy(); // flushes storage
        this._tracker = null;
        this._notifier?.destroy();
        this._notifier = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._engine = null;
        this._storage = null;
        this._settings = null;
    }

    openAbout() {
        showAboutDialog(this);
    }

    /** "Quit" menu item: disable the extension (deferred — the click handler
     *  runs inside UI that disable() destroys). */
    requestQuit() {
        if (this._quitIdleId)
            return;
        this._quitIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._quitIdleId = null;
            Main.extensionManager.disableExtension(this.uuid);
            return GLib.SOURCE_REMOVE;
        });
    }

    _onEngineEvents(events) {
        for (const event of events) {
            if (event.type === EngineEvent.THRESHOLD_CROSSED)
                this._notifier.scold(event.platform, event.sessionSeconds);
        }
    }

    _onTick() {
        this._indicator.setState(this._currentState());
        this._indicator.refreshUsage();
    }

    _currentState() {
        if (this._tracker.hasError)
            return IndicatorState.ERROR;
        if (!this._settings.get_boolean('monitoring-enabled'))
            return IndicatorState.PAUSED;
        if (this._settings.get_boolean('mute-alerts'))
            return IndicatorState.MUTED;
        const timerState = this._engine.timerState();
        if (timerState === 'limit')
            return IndicatorState.LIMIT;
        if (timerState === 'approaching')
            return IndicatorState.APPROACHING;
        return IndicatorState.NORMAL;
    }
}
