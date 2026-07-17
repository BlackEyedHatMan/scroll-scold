// Run with: gjs -m tests/testMatcher.js

import {
    normalizeTitle, matchPlatform, isBrowserWindow,
    parsePlatforms, rulesToKeywords, keywordsToRules,
} from '../src/lib/matcher.js';

let failures = 0;

function assertEq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        print(`  ok: ${label}`);
    } else {
        failures++;
        print(`FAIL: ${label}\n      expected ${e}\n      actual   ${a}`);
    }
}

const PLATFORMS = [
    {name: 'YouTube', rules: [{mode: 'contains', value: 'youtube'}]},
    {name: 'X (Twitter)', rules: [
        {mode: 'suffix', value: '/ x'},
        {mode: 'contains', value: 'twitter'},
    ]},
    {name: 'Reddit', rules: [{mode: 'contains', value: 'reddit'}]},
];

print('normalizeTitle');
assertEq(normalizeTitle('Cat videos - YouTube - Google Chrome'),
    'cat videos - youtube', 'strips Chrome suffix');
assertEq(normalizeTitle('Cat videos - YouTube — Mozilla Firefox'),
    'cat videos - youtube', 'strips Firefox em-dash suffix');
assertEq(normalizeTitle('Home / X - Mozilla Firefox Private Browsing'),
    'home / x', 'strips Firefox private browsing suffix');
assertEq(normalizeTitle('(3) Home / X - Google Chrome'),
    'home / x', 'strips unread count prefix');
assertEq(normalizeTitle('My Notes - My Editor'),
    'my notes - my editor', 'keeps non-browser trailing segments');
assertEq(normalizeTitle(''), '', 'empty title');
assertEq(normalizeTitle(null), '', 'null title');

print('matchPlatform');
assertEq(matchPlatform('Cat videos - YouTube - Google Chrome', PLATFORMS),
    'YouTube', 'contains match');
assertEq(matchPlatform('Home / X - Google Chrome', PLATFORMS),
    'X (Twitter)', 'suffix match for X');
assertEq(matchPlatform('(1) Notifications / X - Google Chrome', PLATFORMS),
    'X (Twitter)', 'suffix match with unread count');
assertEq(matchPlatform('xkcd: Standards - Google Chrome', PLATFORMS),
    null, '"x" inside words does not match');
assertEq(matchPlatform('Tweet by someone - Twitter - Google Chrome', PLATFORMS),
    'X (Twitter)', 'legacy twitter contains match');
assertEq(matchPlatform('r/linux - Reddit - Brave', PLATFORMS),
    'Reddit', 'reddit via brave');
assertEq(matchPlatform('Inbox - Gmail - Google Chrome', PLATFORMS),
    null, 'non-social title no match');
assertEq(matchPlatform('YouTube', PLATFORMS),
    'YouTube', 'bare platform title');

print('isBrowserWindow');
const BROWSERS = ['chrome', 'chromium', 'firefox', 'brave', 'edge'];
assertEq(isBrowserWindow(['google-chrome', 'Google-chrome'], BROWSERS),
    true, 'plain chrome');
assertEq(isBrowserWindow(['google-chrome (Profile 1)', 'Google-chrome'], BROWSERS),
    true, 'chrome secondary profile');
assertEq(isBrowserWindow(['Navigator', 'firefox'], BROWSERS),
    true, 'firefox instance');
assertEq(isBrowserWindow(['code', 'Code'], BROWSERS),
    false, 'editor is not a browser');
assertEq(isBrowserWindow([null, undefined], BROWSERS),
    false, 'missing classes');

print('parsePlatforms');
assertEq(parsePlatforms(JSON.stringify(PLATFORMS)).platforms.length, 3, 'valid json');
assertEq(parsePlatforms(JSON.stringify(PLATFORMS)).error, false, 'valid json no error');
assertEq(parsePlatforms('nonsense').platforms, [], 'malformed json → empty');
assertEq(parsePlatforms('nonsense').error, true, 'malformed json → error flag');
assertEq(parsePlatforms('{"a": 1}').error, true, 'non-array → error flag');
assertEq(parsePlatforms('[{"name": "ok", "rules": []}, {"bad": true}]').platforms.length,
    1, 'partial data keeps valid entries');

print('keyword syntax round-trip');
assertEq(rulesToKeywords(PLATFORMS[1].rules), '/ x$, twitter', 'rules → keywords');
assertEq(keywordsToRules('/ x$, twitter'),
    [{mode: 'suffix', value: '/ x'}, {mode: 'contains', value: 'twitter'}],
    'keywords → rules');
assertEq(keywordsToRules('  youtube ,, $ ,'),
    [{mode: 'contains', value: 'youtube'}],
    'ignores empties and bare $');

if (failures > 0) {
    print(`\n${failures} test(s) failed`);
    imports.system.exit(1);
}
print('\nall matcher tests passed');
