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

    const addButton = new Gtk.MenuButton({
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

            const colorRow = new Adw.EntryRow({
                title: 'Badge color (hex, e.g. #ff0000 — empty = automatic)',
                text: platform.color ?? '',
                show_apply_button: true,
            });
            colorRow.connect('apply', () => {
                const platformsNow = read();
                if (!platformsNow[index])
                    return;
                const value = colorRow.text.trim();
                if (value === '')
                    delete platformsNow[index].color;
                else
                    platformsNow[index].color = value;
                write(platformsNow);
                rebuild();
            });
            row.add_row(colorRow);

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

    // "+" menu: re-add any deleted built-in default, or a custom platform.
    // The defaults come from the schema, so there is one source of truth.
    const defaultPlatforms = parsePlatforms(
        settings.get_default_value('platforms').unpack()).platforms;

    const popover = new Gtk.Popover();
    addButton.set_popover(popover);

    const addPlatform = platform => {
        const platforms = read();
        platforms.push(platform);
        write(platforms);
        rebuild();
        popover.popdown();
    };

    popover.connect('show', () => {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_top: 6, margin_bottom: 6, margin_start: 6, margin_end: 6,
        });
        const existing = new Set(read().map(p => p.name));
        const missing = defaultPlatforms.filter(d => !existing.has(d.name));
        for (const preset of missing) {
            const button = new Gtk.Button({label: preset.name, css_classes: ['flat']});
            button.get_child()?.set_xalign(0);
            button.connect('clicked', () => addPlatform({...preset}));
            box.append(button);
        }
        if (missing.length > 0) {
            box.append(new Gtk.Separator({
                orientation: Gtk.Orientation.HORIZONTAL,
                margin_top: 4, margin_bottom: 4,
            }));
        }
        const custom = new Gtk.Button({label: 'Custom platform…', css_classes: ['flat']});
        custom.get_child()?.set_xalign(0);
        custom.connect('clicked', () => addPlatform({
            name: 'New platform',
            rules: [{mode: 'contains', value: 'keyword'}],
        }));
        box.append(custom);
        popover.set_child(box);
    });

    settings.connect('changed::platforms', () => {
        if (!selfWrite)
            rebuild();
    });

    rebuild();
    return page;
}
