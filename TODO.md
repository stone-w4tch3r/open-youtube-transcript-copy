# TODO

## Upstream Sync Automation

- Keep the GitHub update workflow manual-only for now to avoid disabled stale schedules and noisy keepalive commits.
- If reliable automation is needed, add a `repository_dispatch` trigger and call it from a local `systemd` timer, external cron service, or another active automation host.
- AMO appears to expose public add-on update data through polling APIs rather than outbound webhooks, so update detection should compare AMO metadata such as version, file URL, and SHA-256 hash.
