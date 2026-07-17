import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

const REPO_URL = 'https://github.com/BlackEyedHatMan/scroll-scold';
const WEBSITE_URL = 'https://scrollscold.app';
const LICENSE_LINE = 'MIT License — © 2026 Black Eyed Hat Man';

function linkButton(dialog, url) {
    const button = new St.Button({
        label: url,
        style: 'color: #62a0ea; font-size: 10.5pt; padding: 2px 8px;',
        x_align: Clutter.ActorAlign.CENTER,
        can_focus: true,
        track_hover: true,
    });
    button.connect('clicked', () => {
        Gio.AppInfo.launch_default_for_uri(url, null);
        dialog.close();
    });
    return button;
}

/** @param {Extension} extension the Scroll Scold extension instance */
export function showAboutDialog(extension) {
    const dialog = new ModalDialog.ModalDialog({styleClass: 'scroll-scold-about-dialog'});

    const content = new St.BoxLayout({
        vertical: true,
        style: 'spacing: 10px; padding: 12px 30px; max-width: 420px;',
        x_align: Clutter.ActorAlign.CENTER,
    });

    content.add_child(new St.Icon({
        gicon: Gio.icon_new_for_string(GLib.build_filenamev(
            [extension.path, 'icons', 'scroll-scold.png'])),
        icon_size: 96,
        x_align: Clutter.ActorAlign.CENTER,
    }));

    const version = extension.metadata['version-name'] ?? '';
    content.add_child(new St.Label({
        text: `Scroll Scold ${version}`.trim(),
        style: 'font-weight: bold; font-size: 14pt; text-align: center;',
        x_align: Clutter.ActorAlign.CENTER,
    }));

    const description = new St.Label({
        text: 'An angry little bell that scolds you when social media steals too much of your time.',
        style: 'text-align: center;',
        x_align: Clutter.ActorAlign.CENTER,
    });
    description.clutter_text.line_wrap = true;
    content.add_child(description);

    content.add_child(linkButton(dialog, REPO_URL));
    content.add_child(linkButton(dialog, WEBSITE_URL));

    content.add_child(new St.Label({
        text: LICENSE_LINE,
        style: 'font-size: 9pt; text-align: center; margin-top: 8px;',
        opacity: 150,
        x_align: Clutter.ActorAlign.CENTER,
    }));

    dialog.contentLayout.add_child(content);
    dialog.addButton({
        label: 'Close',
        action: () => dialog.close(),
        key: Clutter.KEY_Escape,
        default: true,
    });
    dialog.open();
    return dialog;
}
