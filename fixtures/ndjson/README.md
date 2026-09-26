# Golden NDJSON

One file per check script and harness distro: `<distro>/<script>.ndjson` is what
the bundle with only that check prints in the read-only harness container. The
parser tests and `FakeTransport` read these files.

**Not blessed yet.** The files committed now were written by hand in the shape
the harness container is expected to print (bundle hashes from the real
`daminus-dev bundle --only …`). Replace them with the first real
`run.sh --bless` output; until then they only prove the shape.

Regenerate after changing a check (needs docker, jq and cargo):

```sh
scripts/check-harness/run.sh --bless
```

CI runs the harness without `--bless` and fails when a check's output changes
shape (line kinds, check ids, field names and types). Numbers such as load and
disk use differ per machine and are not compared.
