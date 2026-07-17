import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {SCOLD_LINES} from './constants.js';

// Scold notifications + sound. Uses the GNOME 46+ MessageTray API
// (constructor-props Source/Notification, addAction) and plays sound
// directly through Meta.SoundPlayer so behavior is identical on 46–50.
export class Notifier {
    /**
     * @param {object} params
     * @param {Gio.Settings} params.settings
     * @param {SessionEngine} params.engine
     * @param {string} params.extensionPath
     */
    constructor({settings, engine, extensionPath}) {
        this._settings = settings;
        this._engine = engine;
        this._appIcon = Gio.icon_new_for_string(
            GLib.build_filenamev([extensionPath, 'icons', 'scroll-scold.svg']));
        this._defaultSound = GLib.build_filenamev([extensionPath, 'sounds', 'scold.wav']);
        this._source = null;
    }

    destroy() {
        this._source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this._source = null;
    }

    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: 'Scroll Scold',
                icon: this._appIcon,
            });
            this._source.connect('destroy', () => (this._source = null));
            Main.messageTray.add(this._source);
        }
        return this._source;
    }

    /**
     * @param {string} platform platform display name
     * @param {number} sessionSeconds current continuous-session length
     */
    scold(platform, sessionSeconds) {
        if (this._settings.get_boolean('mute-alerts'))
            return;

        const minutes = Math.round(sessionSeconds / 60);
        const line = SCOLD_LINES[Math.floor(Math.random() * SCOLD_LINES.length)];
        const notification = new MessageTray.Notification({
            source: this._ensureSource(),
            title: 'Scroll Scold',
            body: `You've hit ${minutes} minutes on ${platform}. ${line}`,
            gicon: this._appIcon,
            urgency: MessageTray.Urgency.NORMAL,
        });
        notification.addAction('Snooze 5 min', () => this._engine.snooze(platform));
        notification.addAction('Got it', () => this._engine.acknowledge(platform));
        this._ensureSource().addNotification(notification);

        this._playSound();
    }

    _playSound() {
        if (!this._settings.get_boolean('play-sound'))
            return;
        try {
            let path = this._defaultSound;
            if (this._settings.get_boolean('use-custom-sound')) {
                const custom = this._settings.get_string('custom-sound-path');
                if (custom && GLib.file_test(custom, GLib.FileTest.EXISTS))
                    path = custom;
            }
            const player = global.display.get_sound_player();
            player.play_from_file(Gio.File.new_for_path(path), 'Scroll Scold alert', null);
        } catch (e) {
            console.warn(`[scroll-scold] could not play alert sound: ${e.message}`);
        }
    }
}
