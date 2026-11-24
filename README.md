# SPCX Chain

Run an independent SPCX mainnet watchtower or use the same CLI to monitor a node from a software agent. SPCX is an EVM L3 on Robinhood Chain. Public watchtowers can follow and validate the chain today. Signing assertions and earning community rewards require a separate enrollment. The portal publishes the current enrollment status.

[Validator portal](https://validator.spcxchain.network/) · [Enrollment status](https://validator.spcxchain.network/status.json) · [Explorer](https://explorer.spcxchain.network/) · [Docs](https://docs.spcxchain.network/)

## Install

Install Git, Python 3.10+ and Node.js 22+. The installer builds an executable from this checkout using Python's standard library. It runs as your own user and works offline after cloning.

```sh
git clone --branch validators-v0.1.1 --depth 1 https://github.com/spcxchain/spcx-chain.git
cd spcx-chain
python3 install.py
export PATH="$HOME/.local/bin:$PATH"
spcx-validator --version
spcx-validator inspect
```

Add the PATH line to your shell profile to keep it across sessions. Use `python3 install.py --bin-dir /path/to/bin` for a service account. You can also use `python3 validator inspect` directly from the checkout. Inspect prints the observed chain IDs, genesis hash, WASM root, bond asset and the finality level of the data.

| Network | Chain ID | Gas |
| --- | ---: | --- |
| SPCX Mainnet | 46630022 | SPCX |
| Robinhood Mainnet | 4663 | ETH |

## Start a watchtower

Use a dedicated Linux host with Docker Engine, Compose v2 and persistent SSD storage. Obtain a Robinhood mainnet archive HTTPS endpoint that serves historical state and logs from block 121350260. Initialize as UID 1000 or root to match the container's volume permissions. Run the following commands as the same user with access to Docker.

```sh
NODE_DIR="$HOME/spcx-watchtower"
spcx-validator init --dir "$NODE_DIR"
spcx-validator start --dir "$NODE_DIR"
spcx-validator status
```

Init prompts privately for the archive URL. Unattended installs can supply it through `SPCX_PARENT_RPC` using their own secret manager. One watchtower uses loopback port 18658. The node can take time to catch up. Status compares its genesis and common block hash with the public SPCX RPC and reports `caughtUp` when synced. Review assertion comparisons in the node logs as well.

```sh
docker compose -f "$NODE_DIR/compose.json" logs --tail=100 validator
```

## Connect an agent

Run the agent on the watchtower host. Set `OPERATOR` to the operator's public wallet address. The monitor emits one JSON object per line. It reads the local RPC and can run under a separate user with no Docker membership or wallet key.

```sh
spcx-validator agent "$OPERATOR" --once
spcx-validator agent "$OPERATOR" --interval 60
```

For alert handling and output fields see [AGENTS.md](AGENTS.md). For the protocol bond, pilot stake terms and unsigned planning commands see the [operator guide](validator/README.md).

## Verify the kit

Run the planner tests with Node. Install Foundry Anvil to run the full two-chain rehearsal. Both use local fixtures.

```sh
node --test validator/lab/plans.test.cjs
spcx-validator rehearse
```

The operator sources come from the portal's v0.1.1 kit (SHA-256 `930ffc4bc90c0c6b227d47b356d7bc14dd0ccef1c04ac98861272c67e1b52d96`). This distribution builds its own executable and exposes the operator commands. The portal deployment command belongs to the separate website distribution. The bundled ethers dependency carries its [MIT notice](validator/Ethers-LICENSE.md).
