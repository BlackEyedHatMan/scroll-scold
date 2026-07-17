import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';

// Tracks MPRIS media players on the session bus. Browsers announce playing
// audio/video here (same mechanism as the shell's media controls), which lets
// the tracker treat hands-free video watching as activity instead of idle.
export class MediaWatcher {
    constructor() {
        this._bus = Gio.DBus.session;
        this._players = new Map(); // busName -> {playing, subId}
        this._destroyed = false;

        this._nameOwnerSubId = this._bus.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                const [name, , newOwner] = params.deepUnpack();
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (newOwner)
                    this._addPlayer(name);
                else
                    this._removePlayer(name);
            });

        this._bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'ListNames', null, null,
            Gio.DBusCallFlags.NONE, -1, null, (bus, res) => {
                try {
                    const [names] = bus.call_finish(res).deepUnpack();
                    if (this._destroyed)
                        return;
                    names.filter(n => n.startsWith(MPRIS_PREFIX))
                        .forEach(n => this._addPlayer(n));
                } catch (e) {
                    console.warn(`[scroll-scold] MPRIS scan failed: ${e.message}`);
                }
            });
    }

    destroy() {
        this._destroyed = true;
        if (this._nameOwnerSubId) {
            this._bus.signal_unsubscribe(this._nameOwnerSubId);
            this._nameOwnerSubId = null;
        }
        for (const name of [...this._players.keys()])
            this._removePlayer(name);
    }

    _addPlayer(name) {
        if (this._players.has(name))
            return;
        const record = {playing: false, subId: null};
        this._players.set(name, record);

        record.subId = this._bus.signal_subscribe(
            name, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
            MPRIS_PATH, null, Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                const [, changed] = params.deepUnpack();
                if ('PlaybackStatus' in changed)
                    record.playing = changed['PlaybackStatus'].deepUnpack() === 'Playing';
            });

        this._bus.call(name, MPRIS_PATH, 'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [PLAYER_IFACE, 'PlaybackStatus']), null,
            Gio.DBusCallFlags.NONE, -1, null, (bus, res) => {
                try {
                    const [status] = bus.call_finish(res).recursiveUnpack();
                    record.playing = status === 'Playing';
                } catch {
                    // player gone or has no PlaybackStatus — treat as not playing
                }
            });
    }

    _removePlayer(name) {
        const record = this._players.get(name);
        if (!record)
            return;
        if (record.subId)
            this._bus.signal_unsubscribe(record.subId);
        this._players.delete(name);
    }

    /**
     * Whether any (browser) media player is currently playing.
     *
     * @param {string[]} browserTokens identifiers from browser-wm-classes
     * @param {boolean} restrictToBrowsers if false, any MPRIS player counts
     * @returns {boolean}
     */
    isAnyPlaying(browserTokens, restrictToBrowsers) {
        for (const [name, record] of this._players) {
            if (!record.playing)
                continue;
            if (!restrictToBrowsers)
                return true;
            const lower = name.toLowerCase();
            if (browserTokens.some(t => t.trim() && lower.includes(t.toLowerCase().trim())))
                return true;
        }
        return false;
    }
}
