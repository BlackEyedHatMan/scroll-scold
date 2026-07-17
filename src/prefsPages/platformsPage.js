import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {parsePlatforms, rulesToKeywords, keywordsToRules} from '../lib/matcher.js';

/**
 * Platform list editor. Keyword syntax: comma-separated; a keyword ending in
 * "$" must match the END of the (browser-suffix-stripped) tab title — e.g.
 * X (Twitter) uses "/ x$, twitter" so a bare "x" can't match everything.
 *
 * @param {Gio.Settings} settings
 * @returns {Adw.PreferencesPage}
 */
export function buildPlatformsPage(settings) {
    const page = new Adw.PreferencesPage({
        title: 'Platforms',
        icon_name: 'user-bookmarks-symbolic',
    });

    const group = new Adw.PreferencesGroup({
        title: 'Monitored platforms',
        description: 'A platform is active when the focused browser tab\'s title matches ' +
            'any of its keywords. End a keyword with "$" to require it at the end of the title.',
    });

    const addButton = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        tooltip_text: 'Add platform',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    group.set_header_suffix(addButton);
    page.add(group);

    let selfWrite = false;
    const read = () => parsePlatforms(settings.get_string('platforms')).platforms;
    const write = platforms => {
        selfWrite = true;
        settings.set_string('platforms', JSON.stringify(platforms));
        selfWrite = false;
    };

    let rows = [];
    const rebuild = () => {
        for (const row of rows)
            group.remove(row);
        rows = [];

        const platforms = read();
        platforms.forEach((platform, index) => {
            const row = new Adw.ExpanderRow({
                title: platform.name,
                subtitle: rulesToKeywords(platform.rules) || 'No keywords — never matches',
            });

            const nameRow = new Adw.EntryRow({
                title: 'Display name',
                text: platform.name,
                show_apply_button: true,
            });
            nameRow.connect('apply', () => {
                const platformsNow = read();
                if (!platformsNow[index] || nameRow.text.trim() === '')
                    return;
                platformsNow[index].name = nameRow.text.trim();
                write(platformsNow);
                rebuild();
            });
            row.add_row(nameRow);

            const keywordsRow = new Adw.EntryRow({
                title: 'Title keywords (comma-separated, "$" = must end title)',
                text: rulesToKeywords(platform.rules),
                show_apply_button: true,
            });
            keywordsRow.connect('apply', () => {
                const platformsNow = read();
                if (!platformsNow[index])
                    return;
                platformsNow[index].rules = keywordsToRules(keywordsRow.text);
                write(platformsNow);
                rebuild();
            });
            row.add_row(keywordsRow);

            const deleteRow = new Adw.ActionRow({title: 'Remove this platform'});
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action', 'flat'],
            });
            deleteButton.connect('clicked', () => {
                const platformsNow = read();
                platformsNow.splice(index, 1);
                write(platformsNow);
                rebuild();
            });
            deleteRow.add_suffix(deleteButton);
            deleteRow.activatable_widget = deleteButton;
            row.add_row(deleteRow);

            group.add(row);
            rows.push(row);
        });
    };

    addButton.connect('clicked', () => {
        const platforms = read();
        platforms.push({
            name: 'New platform',
            rules: [{mode: 'contains', value: 'keyword'}],
        });
        write(platforms);
        rebuild();
    });

    settings.connect('changed::platforms', () => {
        if (!selfWrite)
            rebuild();
    });

    rebuild();
    return page;
}
