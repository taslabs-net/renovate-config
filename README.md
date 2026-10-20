# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset for the HomeFlare fleet. Self-hosted
Renovate (Mend Renovate Community Edition on the homeflare-mini pool, dashboard at
https://renovate.homeflare.dev) replaces Dependabot fleet-wide.

## Use

Each repository's `renovate.json` is rendered by `@homeflare/config` (`bun run repo-shape:refresh`):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>taslabs-net/renovate-config"]
}
```

taslabs-net is a personal account, so there is no org-level preset; every repo opts in via `extends`.
This repository is **public** because presets must be readable by the Renovate server.

## What `default.json` does

It extends Renovate 44's `config:best-practices` (recommended config, monorepo groups,
replacements, workarounds, digest changelogs, config migration, abandonment warnings,
Action and Docker digest pins, and a three-day npm release age that skips update types
with no release timestamp). Python gets the same three-day age via
`security:minimumReleaseAgePypi`. A global `minimumReleaseAge` is not set: applied to
`pin`, `replacement`, and lockfile updates, that check never clears.

Two departures from `config:best-practices`:

- Bun and npm range pins stay off. `:pinDevDependencies` opened immortal PRs,
  automerge stayed off, and the lockfile update failed, so those PRs accumulated.
- GitHub Actions digest pins stay off. `.github/workflows/*` is rendered by
  `@homeflare/config`'s repo-shape (the fleet-wide pin point), so a `pinDigest`
  edit lands in generated files and fails the repo-shape drift test. Action
  references are bumped in `@homeflare/config` instead.

- Rebases a branch when it falls behind or conflicts (`rebaseWhen: auto`), unless a
  person has pushed commits to it. A pull is not opened until its release-age wait is
  over (`prCreation: not-pending`), so those waits do not fill the five-PR cap.
- Groups minor + patch and automerges on green: bun/npm, GitHub Actions, Docker,
  Python, Go, `golang.org/x`, `google.golang.org`, OpenTelemetry Go, Caddy, and
  `@modelcontextprotocol/*`. psycopg and psycopg-binary are their own group.
- A GitHub security alert automerges once required checks are green, including a major.
  Any other major waits.
- Weekly lockfile maintenance (Monday before 06:00) automerges.
- `prConcurrentLimit: 5`, `prHourlyLimit: 2`, timezone `America/New_York`.
- Schedule is "any time": the server's own cron decides when runs happen on the pool.
- **`@homeflare/*` is one group, with no release-age wait, and it automerges on green,**
  including a major. A red check is the exception and stays open. `homeflare-bumper` must
  stay off (`KIT_BUMP_ENABLED` not `true`) so it does not open a second pull for the same release.
- **The Effect stack is one group, `effect-stack`:** `effect`, `@effect/*`, `alchemy`,
  `@alchemy.run/*` and `@distilled.cloud/*` always move together and never automerge.
  alchemy depends on distilled at an exact version, so a lone bump installs a second
  `effect` and the types collapse to `any`. This rule does not lift the separate `effect`
  HOLD at 4.0.3; that is a deliberate decision of its own.
