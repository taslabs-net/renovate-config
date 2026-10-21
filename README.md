# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) preset for the HomeFlare fleet. Self-hosted
Renovate (Mend Renovate Community Edition on the Synology NAS, declared in homeflare-ct100
`src/nas/projects/renovate-ce`, dashboard at https://renovate.homeflare.dev) replaces
Dependabot fleet-wide. It runs as the `homeflare-reviewer` GitHub App.

## Use

Each repository's `renovate.json` is rendered by `@homeflare/config` (`bun run repo-shape:refresh`):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>taslabs-net/renovate-config"]
}
```

A repository the lander lands (its repo-shape says so) also extends lander mode, after the default:
`"extends": ["github>taslabs-net/renovate-config", "github>taslabs-net/renovate-config:lander"]`.

taslabs-net is a personal account, so there is no org-level preset; every repo opts in via `extends`.
This repository is **public** because presets must be readable by the Renovate server.

## The lander interface

hf-lander (homeflare-ct100 `src/lander`) is the estate's one merge path. Renovate tells it what may
land with labels, and every rule that decides `automerge` decides the label the same way:

| Renovate decided   | Labels                         | Lander                                   |
| ------------------ | ------------------------------ | ---------------------------------------- |
| `automerge: true`  | `dependencies`, `lander:eligible` | may land it once its gate is green    |
| `automerge: false` | `dependencies`, `hold`         | holds it; a person removes `hold` to land |

Renovate merges a group's labels as a union and its `automerge` as an AND, so a group that mixes
the two carries both labels and is held: it fails closed. A label a person changes is never put
back (Renovate stops syncing labels on that pull), which is how removing `hold` approves one.

`lander.json` (lander mode) sets every `automerge` off, so Renovate merges nothing itself and the
labels are the only signal. A repository switches to it only after it is in the lander's
`LIVE_REPOS`; the other order lands nothing there.

## What `default.json` does

It extends Renovate 44's `config:best-practices` (recommended config, monorepo groups,
replacements, workarounds, digest changelogs, config migration, abandonment warnings,
Action and Docker digest pins, and a three-day npm release age that skips update types
with no release timestamp). Python gets the same three-day age via
`security:minimumReleaseAgePypi`. A global `minimumReleaseAge` is not set: applied to
`pin`, `replacement`, and lockfile updates, that check never clears.

- **Release age, third party.** A patch waits 3 days (the presets above); a minor or major waits
  7 days, for npm and PyPI only. The NAS caches keep those publish timestamps; the docker and Go
  proxy paths do not (or were not checked), and `minimumReleaseAgeBehaviour: timestamp-required`
  would hold those updates forever.
- **Majors** are never automerged. A third-party major is not proposed until it is ticked on the
  Dependency Dashboard, and then it carries `hold`.
- **`@homeflare/*` is one group per repository, with a one-hour soak, no dashboard approval and
  `prPriority: 10`,** and it automerges on green. **homeflare-wiki is the canary**: it takes every
  release at once, so a broken release is red there inside the hour the fleet waits. A kit major is
  held. The soak exists because the kit repo is private (no npm provenance) and a `@homeflare/config`
  refresh rewrites the CI workflow that grades it. To stop a bad version, add
  `"allowedVersions": "!/^X\\.Y\\.Z$/"` to the kit rule. `homeflare-bumper` is retired.
- **Security.** A GitHub (Dependabot) alert opens a fix pull at once: no release age, no approval,
  ahead of every other branch and outside the hourly limit (Renovate's own ordering). It is
  eligible and automerges once required checks are green, including a major. Alerts must be
  enabled on the repository for this to see anything. The block is applied as `force`, so it
  also overrides a held family (vitest, alchemy, effect, bun, payload, the ct100 obs images): a
  security fix outranks the hold on purpose.
- **Pulls open immediately** (`prCreation: immediate`; `internalChecksFilter: strict` keeps a
  release-age wait from creating the branch at all). `not-pending` waited for checks on the
  branch, but fleet CI runs on `pull_request` only, so a branch never got a check; measured
  2026-10-21: 24 kit-consumer `renovate/homeflare-kit` branches sat without a pull.
- **Rebase.** `rebaseWhen: auto` with `keepUpdatedLabel: lander:eligible`: an eligible pull is
  rebased when it falls behind main, anything else only when it conflicts, and never once a
  person has pushed to it.
- Groups minor + patch: bun/npm, GitHub Actions, Docker, Python, Go, `golang.org/x`,
  `google.golang.org`, OpenTelemetry Go, Caddy, and `@modelcontextprotocol/*`. psycopg and
  psycopg-binary are their own group. Weekly lockfile maintenance (Monday before 06:00).
- `prConcurrentLimit: 5`, `prHourlyLimit: 1` (was 2; Opus round 1: the `prCreation` flip lets
  ~318 waiting branches open, and each merge rebases the eligible rest), timezone
  `America/New_York`. Kit pulls are created first (`prPriority`), security pulls ignore the hourly
  limit. Schedule is "any time": the server's cron and the App's webhook events decide when jobs run.

Vendored content is never edited: charts under `talos/charts/` (homeflare-proxmox) are verbatim
helm pulls pinned by a tree digest, and homeflare-os `os-core-lock/` is an upstream workspace kept
for its lockfile, whose `workspace:*` members are absent, so every artifact update there fails.

The Caddy `go.mod` disable named a bare repo (`homeflare-builds`), which never matches
`owner/repo`; it now uses the full name (a test keeps it so). The kit catalog sync is still bare,
inert on purpose: enabling it as written would leave `bun.lock` stale and fail frozen installs.

Two departures from `config:best-practices`:

- Bun and npm range pins stay off. `:pinDevDependencies` opened immortal PRs,
  automerge stayed off, and the lockfile update failed, so those PRs accumulated.
- GitHub Actions digest pins stay off. `.github/workflows/*` is rendered by
  `@homeflare/config`'s repo-shape (the fleet-wide pin point), so a `pinDigest`
  edit lands in generated files and fails the repo-shape drift test. Action
  references are bumped in `@homeflare/config` instead.

## Checks

`node --test tests/` pins the invariants the lander depends on (no dependencies). Validate with
the server's own Renovate (CE 15.7.0 bundles 44.134.1):
`npx --package renovate@44.134.1 renovate-config-validator --strict default.json lander.json`.
