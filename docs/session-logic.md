# Session and alert logic

This page explains exactly when Scroll Scold's timer runs, when it resets, and when the scold notification fires. The short version: **alerts are driven by continuous use, while the menu displays your daily total** — two different numbers.

## Two counters per platform

For every platform (YouTube, X, …) the engine keeps two independent counters:

| Counter | What it measures | What resets it |
|---|---|---|
| **Session time** | Continuous active use in one sitting | Leaving the platform for longer than the grace period (default 60 s), or Reset today |
| **Today total** | All active use accumulated since midnight | Midnight, logout/login, or Reset today |

The popup menu shows the **today total** against the threshold — so a row like `YouTube — 58 / 15 min` means *58 minutes total today*, with a *15-minute per-session limit*. It does **not** mean an alert fired at 58 minutes, and it does not mean you're 43 minutes overdue for one. If you took breaks longer than the grace period, each sitting's session timer started from zero, and none of them may ever have reached 15 minutes.

Only the **session** counter triggers alerts.

## When the session timer runs

The timer for a platform ticks only while all of these hold:

- **Monitoring** is on,
- a matching tab is the **focused window**,
- you are not **idle** (no keyboard/mouse input for the idle threshold, default 60 s) — unless a browser is playing audio/video and *Media playback counts as activity* is on, in which case hands-free watching still counts.

Focus another window and the platform's session timer freezes (it never counts background tabs).

## When the session resets: the grace period

While you're away from a platform, an *away* clock runs for it. What happens next depends on how long you stay away:

- **Away ≤ grace period (default 60 s)** — a quick alt-tab, replying to a message: nothing is lost. When you come back, the session resumes exactly where it left off, *including* any pending alert schedule. Rapid tab-flicking cannot dodge the scold.
- **Away > grace period** — you genuinely left: the session resets to zero and the alert is re-armed at a fresh full threshold. Your today total is untouched.

This is why frequently switching between windows produces a large today total without ever seeing an alert: each return after a >60 s break starts a brand-new session, and no single session reaches the threshold.

## When the alert fires, and what the buttons do

When a session crosses the threshold (default 15 min of continuous use), you get the scold notification and the next alert is automatically scheduled a full threshold later. The notification's buttons only adjust that schedule — **tracking never stops**:

- **Snooze** — re-scolds after the snooze duration (default 2 min) of continued use.
- **Got it** — re-scolds after another full threshold (default 15 min) of continued use.
- **Ignoring the notification** — same effect as *Got it*: the next alert comes one full threshold later.

In all three cases both counters keep climbing. If you leave for longer than the grace period after being scolded, the pending re-scold is discarded along with the session — the next sitting starts clean.

**Mute alerts** suppresses notifications and sound only; tracking continues. **Monitoring off** freezes everything: no time accumulates, and away clocks don't run either.

## Worked example

With defaults (15 min threshold, 60 s grace):

1. Watch YouTube for 10 min → switch to your editor for 30 s → back to YouTube. Session resumes at 10 min; 5 more minutes brings the scold.
2. You hit **Snooze** and keep watching → scolded again 2 minutes later, at a 17-minute session.
3. You leave for 5 minutes → session resets. Coming back starts a new session; the next scold needs a fresh 15 continuous minutes.
4. All along, the menu's today total kept adding up: ~32 minutes so far, displayed as `32 / 15 min`.
