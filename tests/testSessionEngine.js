// Run with: gjs -m tests/testSessionEngine.js

import {SessionEngine, EngineEvent} from '../src/lib/sessionEngine.js';

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

function makeEngine(overrides = {}) {
    return new SessionEngine({
        thresholdSeconds: 900, // 15 min
        graceSeconds: 60,
        ...overrides,
    });
}

// Advance n seconds in 1s ticks; returns all events.
function run(engine, seconds, {platform = null, idle = false, monitoring = true} = {}) {
    const events = [];
    for (let i = 0; i < seconds; i++) {
        events.push(...engine.advance({
            deltaSeconds: 1,
            activePlatform: platform,
            isIdle: idle,
            monitoring,
        }));
    }
    return events;
}

print('threshold crossing');
{
    const e = makeEngine();
    const events = run(e, 900, {platform: 'YouTube'});
    assertEq(events.length, 1, 'one event at threshold');
    assertEq(events[0].type, EngineEvent.THRESHOLD_CROSSED, 'event type');
    assertEq(events[0].platform, 'YouTube', 'event platform');
    assertEq(e.sessionSeconds('YouTube'), 900, 'session seconds');
    assertEq(e.todaySeconds('YouTube'), 900, 'today seconds');
    assertEq(e.timerState(), 'limit', 'limit state');
}

print('re-notify after another full threshold');
{
    const e = makeEngine();
    run(e, 900, {platform: 'YouTube'});
    const more = run(e, 899, {platform: 'YouTube'});
    assertEq(more.length, 0, 'no event before second threshold');
    const cross = run(e, 1, {platform: 'YouTube'});
    assertEq(cross.length, 1, 're-notified at 2× threshold');
}

print('snooze re-notifies after 5 minutes');
{
    const e = makeEngine();
    run(e, 900, {platform: 'YouTube'});
    e.snooze('YouTube');
    assertEq(run(e, 299, {platform: 'YouTube'}).length, 0, 'quiet during snooze');
    assertEq(run(e, 1, {platform: 'YouTube'}).length, 1, 'scolds after snooze');
}

print('grace period: short absence only pauses');
{
    const e = makeEngine();
    run(e, 800, {platform: 'YouTube'});
    run(e, 59, {platform: null}); // away < grace
    assertEq(e.sessionSeconds('YouTube'), 800, 'session survives short absence');
    const events = run(e, 100, {platform: 'YouTube'});
    assertEq(events.length, 1, 'threshold still crossed after resuming');
}

print('grace period: long absence resets session');
{
    const e = makeEngine();
    run(e, 800, {platform: 'YouTube'});
    const events = run(e, 61, {platform: null});
    assertEq(events.length, 1, 'reset event emitted');
    assertEq(events[0].type, EngineEvent.SESSION_RESET, 'reset event type');
    assertEq(e.sessionSeconds('YouTube'), 0, 'session reset to zero');
    assertEq(e.todaySeconds('YouTube'), 800, 'today total kept');
    assertEq(run(e, 899, {platform: 'YouTube'}).length, 0, 'fresh session, no early scold');
}

print('switching platforms: away decay applies to the abandoned one');
{
    const e = makeEngine();
    run(e, 500, {platform: 'YouTube'});
    run(e, 61, {platform: 'Reddit'});
    assertEq(e.sessionSeconds('YouTube'), 0, 'YouTube session reset while on Reddit');
    assertEq(e.sessionSeconds('Reddit'), 61, 'Reddit session running');
}

print('idle pauses accumulation but is not "away"');
{
    const e = makeEngine();
    run(e, 800, {platform: 'YouTube'});
    run(e, 300, {platform: 'YouTube', idle: true}); // long idle on the site
    assertEq(e.sessionSeconds('YouTube'), 800, 'idle does not accumulate');
    assertEq(run(e, 100, {platform: 'YouTube'}).length, 1, 'resumes and crosses');
}

print('monitoring off freezes everything');
{
    const e = makeEngine();
    run(e, 800, {platform: 'YouTube'});
    run(e, 500, {platform: null, monitoring: false});
    assertEq(e.sessionSeconds('YouTube'), 800, 'no away decay while frozen');
    run(e, 500, {platform: 'YouTube', monitoring: false});
    assertEq(e.sessionSeconds('YouTube'), 800, 'no accumulation while frozen');
}

print('approaching state at 80%');
{
    const e = makeEngine();
    run(e, 719, {platform: 'YouTube'});
    assertEq(e.timerState(), 'normal', 'normal below 80%');
    run(e, 1, {platform: 'YouTube'});
    assertEq(e.timerState(), 'approaching', 'approaching at 80%');
}

print('resetToday clears sessions and totals');
{
    const e = makeEngine({todaySeconds: {YouTube: 1234}});
    assertEq(e.todaySeconds('YouTube'), 1234, 'persisted totals loaded');
    run(e, 100, {platform: 'YouTube'});
    e.resetToday();
    assertEq(e.todaySeconds('YouTube'), 0, 'today cleared');
    assertEq(e.sessionSeconds('YouTube'), 0, 'session cleared');
    assertEq(run(e, 899, {platform: 'YouTube'}).length, 0, 'no early scold after reset');
}

print('threshold change mid-session applies when not yet scolded');
{
    const e = makeEngine();
    run(e, 500, {platform: 'YouTube'});
    e.thresholdSeconds = 300; // lowered below current session
    const events = run(e, 1, {platform: 'YouTube'});
    assertEq(events.length, 1, 'scolds immediately when new threshold already passed');
}

print('todaySnapshot rounds and skips zeros');
{
    const e = makeEngine();
    run(e, 90, {platform: 'YouTube'});
    assertEq(e.todaySnapshot(), {YouTube: 90}, 'snapshot content');
}

if (failures > 0) {
    print(`\n${failures} test(s) failed`);
    imports.system.exit(1);
}
print('\nall sessionEngine tests passed');
