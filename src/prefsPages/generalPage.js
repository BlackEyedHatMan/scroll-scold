import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

function spinRow({title, subtitle, lower, upper, step = 1}) {
    return new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 10,
        }),
    });
}

/**
 * @param {Gio.Settings} settings
 * @param {Adw.PreferencesWindow} window parent for the file dialog
 * @returns {Adw.PreferencesPage}
 */
export function buildGeneralPage(settings, window) {
    const page = new Adw.PreferencesPage({
        title: 'General',
        icon_name: 'preferences-system-symbolic',
    });

    // --- Limits ---
    const limits = new Adw.PreferencesGroup({
        title: 'Limits',
        description: 'One threshold applies to every monitored platform.',
    });

    const threshold = spinRow({
        title: 'Time limit',
        subtitle: 'Continuous minutes on a platform before you get scolded',
        lower: 1, upper: 480,
    });
    settings.bind('threshold-minutes', threshold, 'value', Gio.SettingsBindFlags.DEFAULT);
    limits.add(threshold);

    const snooze = spinRow({
        title: 'Snooze duration',
        subtitle: 'Minutes the "Snooze" notification button delays the next scold',
        lower: 1, upper: 60,
    });
    settings.bind('snooze-minutes', snooze, 'value', Gio.SettingsBindFlags.DEFAULT);
    limits.add(snooze);

    const grace = spinRow({
        title: 'Grace period',
        subtitle: 'Seconds away from a platform before its session timer resets',
        lower: 5, upper: 600, step: 5,
    });
    settings.bind('grace-seconds', grace, 'value', Gio.SettingsBindFlags.DEFAULT);
    limits.add(grace);

    const idle = spinRow({
        title: 'Idle pause',
        subtitle: 'Seconds without input before the timer pauses (note: hands-free video watching counts as idle)',
        lower: 10, upper: 600, step: 5,
    });
    settings.bind('idle-seconds', idle, 'value', Gio.SettingsBindFlags.DEFAULT);
    limits.add(idle);

    page.add(limits);

    // --- Alerts ---
    const alerts = new Adw.PreferencesGroup({title: 'Alerts'});

    const mute = new Adw.SwitchRow({
        title: 'Mute alerts',
        subtitle: 'Keep tracking, but skip notifications and sound',
    });
    settings.bind('mute-alerts', mute, 'active', Gio.SettingsBindFlags.DEFAULT);
    alerts.add(mute);

    const playSound = new Adw.SwitchRow({title: 'Play sound'});
    settings.bind('play-sound', playSound, 'active', Gio.SettingsBindFlags.DEFAULT);
    alerts.add(playSound);

    const useCustom = new Adw.SwitchRow({
        title: 'Use custom sound',
        subtitle: 'Override the built-in scold chime',
    });
    settings.bind('use-custom-sound', useCustom, 'active', Gio.SettingsBindFlags.DEFAULT);
    alerts.add(useCustom);

    const soundRow = new Adw.ActionRow({title: 'Custom sound file'});
    const updateSoundSubtitle = () => {
        const path = settings.get_string('custom-sound-path');
        soundRow.subtitle = path ? GLib.path_get_basename(path) : 'None selected';
    };
    updateSoundSubtitle();
    settings.connect('changed::custom-sound-path', updateSoundSubtitle);

    const chooseButton = new Gtk.Button({
        label: 'Choose…',
        valign: Gtk.Align.CENTER,
    });
    chooseButton.connect('clicked', () => {
        const filter = new Gtk.FileFilter();
        filter.set_name('Audio files');
        filter.add_mime_type('audio/x-wav');
        filter.add_mime_type('audio/ogg');
        filter.add_mime_type('audio/mpeg');
        filter.add_mime_type('audio/flac');
        const dialog = new Gtk.FileDialog({
            title: 'Choose an alert sound',
            default_filter: filter,
        });
        dialog.open(window, null, (dlg, result) => {
            try {
                const file = dlg.open_finish(result);
                if (file?.get_path()) {
                    settings.set_string('custom-sound-path', file.get_path());
                    settings.set_boolean('use-custom-sound', true);
                }
            } catch {
                // dialog dismissed
            }
        });
    });
    soundRow.add_suffix(chooseButton);
    soundRow.activatable_widget = chooseButton;
    settings.bind('use-custom-sound', soundRow, 'sensitive', Gio.SettingsBindFlags.GET);
    alerts.add(soundRow);

    page.add(alerts);

    // --- Detection ---
    const detection = new Adw.PreferencesGroup({title: 'Detection'});

    const restrict = new Adw.SwitchRow({
        title: 'Only match browser windows',
        subtitle: 'Recommended: avoids counting e.g. a code editor with "youtube" in a file name',
    });
    settings.bind('restrict-to-browsers', restrict, 'active', Gio.SettingsBindFlags.DEFAULT);
    detection.add(restrict);

    const browsers = new Adw.EntryRow({
        title: 'Browser identifiers (comma-separated, matched against window class)',
        show_apply_button: true,
    });
    browsers.text = settings.get_strv('browser-wm-classes').join(', ');
    browsers.connect('apply', () => {
        const list = browsers.text.split(',').map(s => s.trim()).filter(s => s !== '');
        settings.set_strv('browser-wm-classes', list);
    });
    settings.bind('restrict-to-browsers', browsers, 'sensitive', Gio.SettingsBindFlags.GET);
    detection.add(browsers);

    page.add(detection);

    return page;
}
