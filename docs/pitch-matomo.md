# Combined spam rules with visibility: a working prototype for Tracking Spam Prevention

## The problem

We run analytics for clients on Matomo Cloud. Some of them receive a steady stream of fake visits with a
very recognisable profile: **country China, direct entry, generic desktop device, screen resolution 3840x2160**.
For one client this profile accounted for almost 40,000 visits over a year.

Tracking Spam Prevention cannot deal with it today, for two reasons:

1. **No combined criteria.** Blocking China entirely is not acceptable, and neither resolution nor source can be
   used at all. The pattern is only safe to block when all conditions are combined.
2. **No visibility.** Nothing shows what the plugin blocks, in what volume, or lets us check a sample. We cannot
   verify a setting before or after turning it on.

These needs are already tracked in open requests: combined exclusion dimensions
([#162](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/162)), logging blocked bots
([#168](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/168)) and counters of discarded
requests ([#114](https://github.com/matomo-org/plugin-TrackingSpamPrevention/issues/114)).

## What we built

A standalone Matomo 6 plugin, `TrackingSpamRules`, that leaves Tracking Spam Prevention untouched and adds:

- **Rules made of AND-combined conditions**: country, resolution (exact or minimum width), source (direct,
  referrer domains, campaign), device type, generic device, browser, OS; per site or global.
- **Observing mode**: a new rule only counts and lists what it would block. Blocking is an explicit switch.
- **A journal of filtered sessions** (30 days) and **daily counters** per rule, which also include what
  Tracking Spam Prevention itself excluded, with its reason.
- **Session-level decisions**, so a blocked session does not leave a truncated visit in the reports.
- **A "legitimate" button** to flag a false positive and tighten the rule.
- **A health indicator** and fail-open behaviour: a plugin error never loses a visit.

Screenshots: `docs/screenshots/02-formulaire.png` (rule form), `04-observation.png` (observing),
`06-legitime.png` (blocking, flagged session).

## What the prototype shows

Tested on a local Matomo 6.0.0 with scripted tracking requests (`tests/manual/scenario.sh`):

| Test visit | Result |
| --- | --- |
| Spam session matching the reference pattern, 3 pages | Caught as one session, all 3 pages |
| French visitor, normal resolution | Not caught |
| Chinese visitor, 3840x2160, coming from Google, 2 pages | Not caught |
| Chinese visitor, normal resolution | Not caught |
| Chinese visitor, 3840x2160, coming from a campaign | Not caught |
| Chinese iPhone | Not caught |
| Headless browser excluded by Tracking Spam Prevention | Listed in the journal with reason "headless browser" |

In blocking mode the spam session no longer appears in `log_visit` at all.

It is a small amount of code because the core already provides what is needed: the
`Tracker.isExcludedVisit` event with `'after' => true`, and the reason string that Tracking Spam Prevention
writes into `$excluded`.

## What is left for a production version

This is a prototype, written to show the feature precisely. We have deliberately not done:

- load and scale work (it adds one or two queries per tracked request when a rule is enabled), and
  compatibility with QueuedTracking;
- Matomo coding standards, Vue components, the integration and UI test suites;
- visibility on exclusions made outside the hook (excluded IPs, known bots, referrer spam list);
- restoring a wrongly blocked session into the reports;
- a weekly digest, and automatically reverting a rule to observing mode when its volume spikes;
- integration with the privacy tools (the journal stores a masked IP and a closed list of fields).

## What we are asking

We would like this capability to exist in Matomo Cloud. We are happy to hand over the code (GPL v3+), to
adapt it, or simply to have it used as a specification for an extension of Tracking Spam Prevention.
