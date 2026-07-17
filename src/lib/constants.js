// Shared constants. This module must stay importable from both the shell
// process and plain `gjs -m` (tests), so: no gi:// or shell imports.

export const IndicatorState = Object.freeze({
    NORMAL: 'normal',
    APPROACHING: 'approaching',
    LIMIT: 'limit',
    MUTED: 'muted',
    PAUSED: 'paused',
    ERROR: 'error',
});

// Fraction of the threshold at which the indicator switches to "approaching".
export const APPROACHING_FRACTION = 0.8;

export const SCOLD_LINES = [
    "That's enough rabbit holes for now. Go do something legendary.",
    'The feed is infinite. Your day is not.',
    'Blink. Stretch. Walk away like it never happened.',
    'Future you called — they want this time back.',
    'The scroll will still be there. Your focus might not.',
];

// Menu accent color for the "N / M min" usage labels (dark orange, per the
// design artwork).
export const USAGE_COLOR = '#f5a141';

// Badge colors assigned to user-added platforms that have no explicit color.
const FALLBACK_BADGE_COLORS = [
    '#e74c3c', '#8e44ad', '#2980b9', '#27ae60',
    '#f39c12', '#16a085', '#d35400', '#34495e',
];

/**
 * @param {{name: string, color?: string}} platform
 * @returns {string} CSS color for the platform's monogram badge
 */
export function platformBadgeColor(platform) {
    if (typeof platform.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(platform.color.trim()))
        return platform.color.trim();
    let sum = 0;
    for (const ch of platform.name)
        sum += ch.codePointAt(0);
    return FALLBACK_BADGE_COLORS[sum % FALLBACK_BADGE_COLORS.length];
}

/**
 * @param {string} name platform display name
 * @returns {string} single-character monogram for the badge
 */
export function platformMonogram(name) {
    const first = (name ?? '').trim()[0];
    return first ? first.toUpperCase() : '?';
}

// Trailing "— Browser Name" segments stripped from window titles before
// matching. Compared case-insensitively against the full trailing segment.
export const BROWSER_TITLE_SUFFIXES = [
    'google chrome',
    'chromium',
    'mozilla firefox',
    'mozilla firefox private browsing',
    'firefox',
    'brave',
    'microsoft edge',
    'microsoft​ edge', // Edge sometimes embeds a zero-width space
    'opera',
    'vivaldi',
    'librewolf',
    'zen browser',
    'gnome web',
    'web',
];
