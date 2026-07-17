import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Persists today's per-platform usage to
// ~/.local/state/scroll-scold/usage.json (NOT GSettings: timers would dirty
// dconf every flush). Format: {"date": "2026-07-17", "seconds": {"YouTube": 743}}

export class Storage {
    constructor() {
        this._dir = GLib.build_filenamev([GLib.get_user_state_dir(), 'scroll-scold']);
        this._path = GLib.build_filenamev([this._dir, 'usage.json']);
        this._lastError = null;
    }

    get lastError() {
        return this._lastError;
    }

    static today() {
        return GLib.DateTime.new_now_local().format('%Y-%m-%d');
    }

    /**
     * @returns {{date: string, seconds: Object<string, number>}} today's usage;
     *   stale (previous-day) data comes back zeroed.
     */
    load() {
        try {
            const file = Gio.File.new_for_path(this._path);
            const [ok, bytes] = file.load_contents(null);
            if (!ok)
                throw new Error('load_contents failed');
            const data = JSON.parse(new TextDecoder().decode(bytes));
            const today = Storage.today();
            if (data?.date === today && typeof data.seconds === 'object' && data.seconds !== null)
                return {date: today, seconds: data.seconds};
            return {date: today, seconds: {}};
        } catch (e) {
            // Missing file is the normal first-run case; anything else is worth a log.
            if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)))
                console.warn(`[scroll-scold] could not load usage state: ${e.message}`);
            return {date: Storage.today(), seconds: {}};
        }
    }

    /**
     * @param {Object<string, number>} seconds per-platform totals
     */
    save(seconds) {
        try {
            GLib.mkdir_with_parents(this._dir, 0o700);
            const payload = JSON.stringify({date: Storage.today(), seconds});
            GLib.file_set_contents(this._path, payload); // atomic (tmp + rename)
            this._lastError = null;
        } catch (e) {
            this._lastError = e;
            console.warn(`[scroll-scold] could not save usage state: ${e.message}`);
        }
    }
}
