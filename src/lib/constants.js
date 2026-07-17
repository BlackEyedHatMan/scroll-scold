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

export const SNOOZE_SECONDS = 5 * 60;

export const SCOLD_LINES = [
    "That's enough rabbit holes for now. Go do something legendary.",
    'The feed is infinite. Your day is not.',
    'Blink. Stretch. Walk away like it never happened.',
    'Future you called — they want this time back.',
    'The scroll will still be there. Your focus might not.',
];

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
