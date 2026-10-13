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

- Groups minor + patch per ecosystem: bun/npm, github-actions, docker/dockerfile.
- Pins GitHub Action and Docker digests.
- Weekly lockfile maintenance (Monday before 06:00).
- Dependency Dashboard issue enabled in every repo.
- Automerges non-major updates once required checks are green; majors never automerge.
- `prConcurrentLimit: 5`, `prHourlyLimit: 2`, timezone `America/New_York`.
- Schedule is "any time": the server's own cron decides when runs happen on the pool.
- **Never proposes `@homeflare/*`.** `taslabs-net/homeflare-bumper` owns kit bumps; this stops
  two bots opening competing PRs for one release.
