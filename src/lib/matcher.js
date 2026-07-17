// Pure title/window matching logic. No gi:// imports — unit-testable with
// plain `gjs -m tests/testMatcher.js`.

import {BROWSER_TITLE_SUFFIXES} from './constants.js';

const SEPARATORS = [' — ', ' – ', ' - '];
const UNREAD_PREFIX = /^\(\d+\+?\)\s*/;

function stripOneSuffix(title) {
    for (const sep of SEPARATORS) {
        const idx = title.lastIndexOf(sep);
        if (idx < 0)
            continue;
        const trailing = title.slice(idx + sep.length).trim();
        if (BROWSER_TITLE_SUFFIXES.includes(trailing))
            return title.slice(0, idx).trim();
    }
    return null;
}

/**
 * Normalize a raw window title for matching: lowercase, strip a leading
 * unread count like "(3) ", and strip trailing browser-name segments
 * ("cats — YouTube — Mozilla Firefox" → "cats — youtube").
 *
 * @param {string} title raw window title
 * @returns {string} normalized title
 */
export function normalizeTitle(title) {
    let t = (title ?? '').toLowerCase().trim().replace(UNREAD_PREFIX, '');
    // Strip up to two trailing segments: handles both "… — Mozilla Firefox"
    // and "… — Mozilla Firefox Private Browsing" listed separately, plus the
    // occasional "… - Brave - Brave" style doubling.
    for (let i = 0; i < 2; i++) {
        const stripped = stripOneSuffix(t);
        if (stripped === null)
            break;
        t = stripped;
    }
    return t;
}

/**
 * @param {string} normalizedTitle output of normalizeTitle()
 * @param {{mode: string, value: string}} rule
 * @returns {boolean}
 */
function ruleMatches(normalizedTitle, rule) {
    const value = (rule.value ?? '').toLowerCase().trim();
    if (!value)
        return false;
    if (rule.mode === 'suffix')
        return normalizedTitle.endsWith(value);
    return normalizedTitle.includes(value); // 'contains' (default)
}

/**
 * Find the first configured platform whose rules match the window title.
 *
 * @param {string} title raw window title
 * @param {Array<{name: string, rules: Array<{mode: string, value: string}>}>} platforms
 * @returns {string|null} platform name, or null
 */
export function matchPlatform(title, platforms) {
    const normalized = normalizeTitle(title);
    if (!normalized)
        return null;
    for (const platform of platforms) {
        if ((platform.rules ?? []).some(rule => ruleMatches(normalized, rule)))
            return platform.name;
    }
    return null;
}

/**
 * Whether a window belongs to a known browser. Matches browser tokens as
 * case-insensitive substrings so multi-profile Chrome windows
 * ("google-chrome (Profile 1)") and instance variants stay covered.
 *
 * @param {string[]} windowClasses wm_class / wm_class_instance / app id values
 * @param {string[]} browserTokens configured browser identifiers
 * @returns {boolean}
 */
export function isBrowserWindow(windowClasses, browserTokens) {
    const classes = windowClasses.filter(Boolean).map(c => c.toLowerCase());
    return browserTokens.some(token => {
        const t = token.toLowerCase().trim();
        return t && classes.some(c => c.includes(t));
    });
}

/**
 * Parse the platforms GSettings JSON string, returning [] on malformed data.
 *
 * @param {string} json
 * @returns {{platforms: Array, error: boolean}}
 */
export function parsePlatforms(json) {
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed))
            return {platforms: [], error: true};
        const platforms = parsed.filter(p =>
            p && typeof p.name === 'string' && p.name.trim() !== '' &&
            Array.isArray(p.rules));
        return {platforms, error: platforms.length !== parsed.length};
    } catch {
        return {platforms: [], error: true};
    }
}

/**
 * Convert a platform's rules to the prefs keyword syntax: comma-separated,
 * trailing "$" marks a suffix rule (e.g. "/ x$, twitter").
 *
 * @param {Array<{mode: string, value: string}>} rules
 * @returns {string}
 */
export function rulesToKeywords(rules) {
    return (rules ?? [])
        .map(r => (r.mode === 'suffix' ? `${r.value}$` : r.value))
        .join(', ');
}

/**
 * Inverse of rulesToKeywords().
 *
 * @param {string} keywords comma-separated keyword list
 * @returns {Array<{mode: string, value: string}>}
 */
export function keywordsToRules(keywords) {
    return (keywords ?? '')
        .split(',')
        .map(k => k.trim())
        .filter(k => k !== '' && k !== '$')
        .map(k => k.endsWith('$')
            ? {mode: 'suffix', value: k.slice(0, -1).trimEnd()}
            : {mode: 'contains', value: k});
}
