# Golden NDJSON

One file per check script and harness distro: `<distro>/<script>.ndjson` is what
the bundle with only that check prints in the read-only harness container. The
parser tests and `FakeTransport` read these files.

Blessed from real runs of `run.sh --bless` (Docker, `ubuntu:24.04` and
`debian:12`, read-only root, user `daminus`). The harness host's components
(project folder, compose projects, pm2 apps) are set in `run.sh`.

Regenerate after changing a check (needs docker, jq and cargo):

```sh
scripts/check-harness/run.sh --bless
```

CI runs the harness without `--bless` and fails when a check's output changes
shape (line kinds, check ids, field names and types). Numbers such as load and
disk use differ per machine and are not compared.
