# TrackingSpamRules (prototype)

A Matomo 6 plugin that complements the bundled *Tracking Spam Prevention* plugin without modifying it.
It is a **working prototype**, meant to demonstrate a feature set, not a finished product.

## What it does

- **Combined rules.** A rule is a set of conditions that must all match: country, screen resolution
  (exact list or minimum width), traffic source (direct entry, referrer domains, campaign), device type,
  generic device (no identified brand), browser, operating system. Per website or for all websites.
- **Observe before blocking.** Every new rule starts in *observing* mode: matching traffic is counted and
  listed, nothing is blocked. Switching to *blocking* is an explicit action.
- **Visibility.** A journal lists the filtered sessions (kept 30 days) and daily counters give the volume
  per rule. Requests excluded by *Tracking Spam Prevention* are listed too, with its reason.
- **Session-level decisions.** Once a visitor matches a rule, all their requests for the next 30 minutes
  follow the same decision, so a blocked session leaves no truncated visit behind.
- **"Legitimate" button.** Flags a filtered session and opens the rule so it can be tightened.
- **Fail open.** Any error in the plugin is caught and counted; the visit is tracked normally.
- **Health indicator.** Number of requests evaluated today and errors over 7 days.

The admin screen is under *Administration > System > Spam rules* (super user only), in English and French.
It has three tabs: **Overview** (key figures, daily chart, ranking of what filters the most), **Rules**
(one card per rule with an Observe / Block switch, and a side-panel editor where conditions are added one
at a time and a sentence shows live what the rule catches) and **Filtered sessions** (filters and
expandable rows). It also works at phone width.

## Rule format

```json
{
  "country": ["cn"],
  "resolution": {"in": ["3840x2160"]},
  "source": {"type": "direct"},
  "device_type": ["desktop"],
  "device_generic": true
}
```

## How it works

- Hooks `Tracker.isExcludedVisit` with `'after' => true`, so it runs after *Tracking Spam Prevention* and can
  read the reason that plugin wrote into `$excluded`.
- Rules are stored in a table and loaded through the tracker general cache; saving a rule clears that cache.
- Country comes from `VisitorGeolocator` (same call and cache as core), device from DeviceDetector.
- A "direct entry" condition only matches the first request of a visit: if the visitor already has an
  ongoing visit, a request without referrer is treated as its continuation.
- The journal stores a closed list of fields. The IP address is masked (at least 2 bytes); `token_auth`,
  user id and `cip` are never stored.

## Tests

- `tests/Unit/RuleMatcherTest.php`: 17 unit tests of the rule engine (no Matomo dependency).
- `tests/manual/scenario.sh`: sends fake spam and legitimate visits to a **local** Matomo and prints the
  journal, the counters and the recorded visits. It truncates visit tables: never run it against a real instance.

## Known limits (prototype)

- Not load-tested; one or two extra queries per tracked request when at least one rule is enabled.
- Not tested with QueuedTracking.
- Core exclusions that happen outside the hook (excluded IPs, known bots, referrer spam list) are not visible.
- No behavioural criteria (bounce, visit duration): they do not exist yet when the request is evaluated.
- A filtered session cannot be restored into the reports.
- Plain JavaScript admin screen, no Vue components; code comments are partly in French.
