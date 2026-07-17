import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {buildGeneralPage} from './prefsPages/generalPage.js';
import {buildPlatformsPage} from './prefsPages/platformsPage.js';

export default class ScrollScoldPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_search_enabled(true);
        window.add(buildGeneralPage(settings, window));
        window.add(buildPlatformsPage(settings));
    }
}
