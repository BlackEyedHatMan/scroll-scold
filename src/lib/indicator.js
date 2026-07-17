import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {IndicatorState} from './constants.js';

export const Indicator = GObject.registerClass(
class ScrollScoldIndicator extends PanelMenu.Button {
    /**
     * @param {object} params
     * @param {Extension} params.extension owning extension (openPreferences/quit)
     * @param {Gio.Settings} params.settings
     * @param {SessionEngine} params.engine
     * @param {() => void} params.onResetToday
     */
    _init({extension, settings, engine, onResetToday}) {
        super._init(0.5, 'Scroll Scold');

        this._extension = extension;
        this._settings = settings;
        this._engine = engine;
        this._onResetToday = onResetToday;
        this._usageLabels = new Map();
        this._state = null;

        this._gicons = {};
        for (const state of Object.values(IndicatorState)) {
            this._gicons[state] = Gio.icon_new_for_string(GLib.build_filenamev(
                [extension.path, 'icons', `scroll-scold-${state}-symbolic.svg`]));
        }

        this._icon = new St.Icon({style_class: 'system-status-icon'});
        this.add_child(this._icon);
        this.setState(IndicatorState.NORMAL);

        this._buildMenu();

        this._settingsSignalIds = [
            this._settings.connect('changed::monitoring-enabled', () =>
                this._monitoringItem.setToggleState(
                    this._settings.get_boolean('monitoring-enabled'))),
            this._settings.connect('changed::mute-alerts', () =>
                this._muteItem.setToggleState(
                    this._settings.get_boolean('mute-alerts'))),
        ];
    }

    _buildMenu() {
        // Header: "Scroll Scold" + settings gear
        const header = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'scroll-scold-header',
        });
        header.add_child(new St.Label({
            text: 'Scroll Scold',
            style: 'font-weight: bold;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const gearButton = new St.Button({
            style_class: 'button',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'preferences-system-symbolic',
                icon_size: 14,
            }),
        });
        gearButton.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
        });
        header.add_child(gearButton);
        this.menu.addMenuItem(header);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._platformSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._platformSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._monitoringItem = new PopupMenu.PopupSwitchMenuItem('Monitoring',
            this._settings.get_boolean('monitoring-enabled'));
        this._monitoringItem.connect('toggled', (_item, state) =>
            this._settings.set_boolean('monitoring-enabled', state));
        this.menu.addMenuItem(this._monitoringItem);

        this._muteItem = new PopupMenu.PopupSwitchMenuItem('Mute alerts',
            this._settings.get_boolean('mute-alerts'));
        this._muteItem.connect('toggled', (_item, state) =>
            this._settings.set_boolean('mute-alerts', state));
        this.menu.addMenuItem(this._muteItem);

        this._addActionItem('Reset today', () => this._onResetToday());

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addActionItem('Preferences', () => this._extension.openPreferences());
        this._addActionItem('About Scroll Scold', () => {
            const url = this._extension.metadata.url;
            if (url)
                Gio.AppInfo.launch_default_for_uri(url, null);
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addActionItem('Quit', () => this._extension.requestQuit());
    }

    _addActionItem(label, callback) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
        this.menu.addMenuItem(item);
    }

    /**
     * Rebuild the per-platform usage rows.
     *
     * @param {Array<{name: string}>} platforms
     */
    setPlatforms(platforms) {
        this._platformSection.removeAll();
        this._usageLabels.clear();
        for (const {name} of platforms) {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            item.add_child(new St.Label({
                text: name,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            const usage = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
                opacity: 160,
            });
            item.add_child(usage);
            this._platformSection.addMenuItem(item);
            this._usageLabels.set(name, usage);
        }
        this.refreshUsage();
    }

    /** Update usage labels; cheap, but only worth doing while the menu is open. */
    refreshUsage() {
        if (!this.menu.isOpen)
            return;
        const thresholdMin = Math.round(this._engine.thresholdSeconds / 60);
        for (const [name, label] of this._usageLabels) {
            const todayMin = Math.floor(this._engine.todaySeconds(name) / 60);
            label.text = `${todayMin} / ${thresholdMin} min`;
        }
    }

    /** @param {string} state one of IndicatorState */
    setState(state) {
        if (state === this._state)
            return;
        this._state = state;
        this._icon.gicon = this._gicons[state] ?? this._gicons[IndicatorState.NORMAL];
    }

    destroy() {
        for (const id of this._settingsSignalIds ?? [])
            this._settings.disconnect(id);
        this._settingsSignalIds = [];
        super.destroy();
    }
});
