// Pure timer state machine. No gi:// imports — unit-testable with plain
// `gjs -m tests/testSessionEngine.js`. Time is injected by the caller as
// per-tick deltas, so tests (and the monotonic-clock strategy) stay simple.

import {APPROACHING_FRACTION, SNOOZE_SECONDS} from './constants.js';

export const EngineEvent = Object.freeze({
    THRESHOLD_CROSSED: 'threshold-crossed',
    SESSION_RESET: 'session-reset',
});

export class SessionEngine {
    /**
     * @param {object} config
     * @param {number} config.thresholdSeconds continuous-use limit
     * @param {number} config.graceSeconds away time before a session resets
     * @param {Object<string, number>} [config.todaySeconds] persisted per-platform totals
     */
    constructor({thresholdSeconds, graceSeconds, todaySeconds = {}}) {
        this._thresholdSeconds = thresholdSeconds;
        this._graceSeconds = graceSeconds;
        this._records = new Map();
        for (const [name, seconds] of Object.entries(todaySeconds))
            this._record(name).todaySec = seconds;
    }

    _record(name) {
        let rec = this._records.get(name);
        if (!rec) {
            rec = {
                sessionSec: 0,
                todaySec: 0,
                awaySec: 0,
                nextNotifyAtSec: this._thresholdSeconds,
            };
            this._records.set(name, rec);
        }
        return rec;
    }

    get thresholdSeconds() {
        return this._thresholdSeconds;
    }

    set thresholdSeconds(seconds) {
        this._thresholdSeconds = seconds;
        // Sessions that have not been scolded yet pick up the new threshold.
        for (const rec of this._records.values()) {
            if (rec.sessionSec < rec.nextNotifyAtSec)
                rec.nextNotifyAtSec = Math.max(seconds, rec.sessionSec);
        }
    }

    set graceSeconds(seconds) {
        this._graceSeconds = seconds;
    }

    /**
     * Advance all timers by one tick.
     *
     * @param {object} input
     * @param {number} input.deltaSeconds elapsed since last tick (pre-clamped)
     * @param {string|null} input.activePlatform matched platform of the focused window
     * @param {boolean} input.isIdle user has been idle past the idle threshold
     * @param {boolean} input.monitoring monitoring toggle state
     * @returns {Array<{type: string, platform: string, sessionSeconds: number}>} events
     */
    advance({deltaSeconds, activePlatform, isIdle, monitoring}) {
        const events = [];
        if (!monitoring || deltaSeconds <= 0)
            return events; // frozen: no accumulation, no away decay

        for (const [name, rec] of this._records) {
            if (name === activePlatform)
                continue;
            if (rec.sessionSec === 0)
                continue;
            rec.awaySec += deltaSeconds;
            if (rec.awaySec > this._graceSeconds) {
                rec.sessionSec = 0;
                rec.awaySec = 0;
                rec.nextNotifyAtSec = this._thresholdSeconds;
                events.push({type: EngineEvent.SESSION_RESET, platform: name, sessionSeconds: 0});
            }
        }

        if (activePlatform !== null && !isIdle) {
            const rec = this._record(activePlatform);
            rec.awaySec = 0;
            rec.sessionSec += deltaSeconds;
            rec.todaySec += deltaSeconds;
            if (rec.sessionSec >= rec.nextNotifyAtSec) {
                rec.nextNotifyAtSec = rec.sessionSec + this._thresholdSeconds;
                events.push({
                    type: EngineEvent.THRESHOLD_CROSSED,
                    platform: activePlatform,
                    sessionSeconds: rec.sessionSec,
                });
            }
        }

        return events;
    }

    /** Re-scold this platform in 5 minutes (if still in session). */
    snooze(name) {
        const rec = this._record(name);
        rec.nextNotifyAtSec = rec.sessionSec + SNOOZE_SECONDS;
    }

    /** Re-scold this platform only after another full threshold of use. */
    acknowledge(name) {
        const rec = this._record(name);
        rec.nextNotifyAtSec = rec.sessionSec + this._thresholdSeconds;
    }

    resetToday() {
        for (const rec of this._records.values()) {
            rec.todaySec = 0;
            rec.sessionSec = 0;
            rec.awaySec = 0;
            rec.nextNotifyAtSec = this._thresholdSeconds;
        }
    }

    sessionSeconds(name) {
        return this._records.get(name)?.sessionSec ?? 0;
    }

    todaySeconds(name) {
        return this._records.get(name)?.todaySec ?? 0;
    }

    /** @returns {Object<string, number>} snapshot for persistence */
    todaySnapshot() {
        const out = {};
        for (const [name, rec] of this._records) {
            if (rec.todaySec > 0)
                out[name] = Math.round(rec.todaySec);
        }
        return out;
    }

    /**
     * Timer-derived display state, ignoring toggles/errors (the indicator
     * layers those on top with higher priority).
     *
     * @returns {'limit'|'approaching'|'normal'}
     */
    timerState() {
        let max = 0;
        for (const rec of this._records.values())
            max = Math.max(max, rec.sessionSec);
        if (max >= this._thresholdSeconds)
            return 'limit';
        if (max >= this._thresholdSeconds * APPROACHING_FRACTION)
            return 'approaching';
        return 'normal';
    }
}
