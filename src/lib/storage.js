import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

// Persists today's per-platform usage to
// ~/.local/state/scroll-scold/usage.json (NOT GSettings: timers would dirty
// dconf every flush). All file IO is asynchronous — synchronous IO in shell
// code stalls the compositor (extensions.gnome.org review rule EGO-X-004).
// Format: {"date": "2026-07-17", "seconds": {"YouTube": 743}}

export class Storage {
    constructor() {
        this._dir = GLib.build_filenamev([GLib.get_user_state_dir(), 'scroll-scold']);
        this._path = GLib.build_filenamev([this._dir, 'usage.json']);
        this._lastError = null;
        this._dirEnsured = false;
    }

    get lastError() {
        return this._lastError;
    }

    static today() {
        return GLib.DateTime.new_now_local().format('%Y-%m-%d');
    }

    /**
     * @returns {Promise<{date: string, seconds: Object<string, number>}>}
     *   today's usage; stale (previous-day) data comes back zeroed.
     */
    async load() {
        const today = Storage.today();
        try {
            const file = Gio.File.new_for_path(this._path);
            const [bytes] = await file.load_contents_async(null);
            const data = JSON.parse(new TextDecoder().decode(bytes));
            if (data?.date === today && typeof data.seconds === 'object' && data.seconds !== null)
                return {date: today, seconds: data.seconds};
        } catch (e) {
            // Missing file is the normal first-run case; anything else is worth a log.
            if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)))
                console.warn(`[scroll-scold] could not load usage state: ${e.message}`);
        }
        return {date: today, seconds: {}};
    }

    /**
     * Fire-and-forget asynchronous write.
     *
     * @param {Object<string, number>} seconds per-platform totals
     */
    save(seconds) {
        try {
            if (!this._dirEnsured) {
                // One-time, at most once per shell session.
                GLib.mkdir_with_parents(this._dir, 0o700);
                this._dirEnsured = true;
            }
            const payload = JSON.stringify({date: Storage.today(), seconds});
            const bytes = new GLib.Bytes(new TextEncoder().encode(payload));
            const file = Gio.File.new_for_path(this._path);
            file.replace_contents_bytes_async(bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null)
                .then(() => (this._lastError = null))
                .catch(e => {
                    this._lastError = e;
                    console.warn(`[scroll-scold] could not save usage state: ${e.message}`);
                });
        } catch (e) {
            this._lastError = e;
            console.warn(`[scroll-scold] could not save usage state: ${e.message}`);
        }
    }
}
