# SPCX operator agents

Use the installed `spcx-validator` executable or `python3 validator` from this checkout. Run `inspect` first and check the identifiers before recording a mainnet observation.

- SPCX child chain ID is 46630022. Genesis is `0xa33c011eec2550e73849e2a882d754e4b23a53568475511726ecc69619077a3b`.
- Robinhood parent chain ID is 4663. The operator supplies a private archive endpoint to the watchtower during initialization.
- Read the public enrollment state from [the validator portal](https://validator.spcxchain.network/status.json).

## Health probe

Run `spcx-validator agent "$OPERATOR" --once` on the host running the watchtower. OPERATOR is its public address. Parse stdout as JSON. For continuous mode, use `--interval 60` and process each line as one observation.

| Output | Interpretation |
| --- | --- |
| `node.caughtUp == true` | Local node passed the reference head, sync and common-hash checks in this sample. |
| `node.available == false` | A local or reference RPC check failed. Record the detail and retry on the next scheduled sample. |
| `node.caughtUp == false` | Inspect sync progress and common-block agreement. |
| `seat.state == "PROGRAM_NOT_CONFIGURED"` | No program and vault address pair has been configured for seat monitoring. |

A successful process exit can carry an unavailable-node observation. Use the JSON fields to decide health. For node initialization use an independently supplied archive endpoint from the host secret manager. Monitoring requires only read access. Treat enrollment, signing and bonding as separate operator decisions.
