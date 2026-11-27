# SPCX community operators

SPCX Chain is an EVM L3 on Robinhood Chain. Anyone can operate an independent Nitro watchtower without depositing tokens. Active validator admission and work rewards are separate from watchtower operation.

| Purpose | Requirement |
| --- | --- |
| Observe and validate locally | Independent Nitro watchtower and own parent archive RPC |
| Community stake | At least 1,000 SPCXC on Robinhood, mature for 24 hours |
| Post rollup assertions | Synced validator, network permission, parent ETH and protocol WETH bond |
| Earn SPCXC rewards | Credited confirmed-assertion work and a separately funded UTC pool |

## Deployed staking program

Use https://mainnet.spcxchain.network/staking/ and the [staking source and guide](../staking/README.md).

- Contract: `0x5Ba4dd3B7cFBbAb136b7606D1592081905124CD9` on Robinhood mainnet 4663.
- Token: SPCXC, `0x904ccdcee00a4f4596b1e92604c00274b75cb244`.
- Minimum position: 1,000 SPCXC. Every top-up resets the entire position's 24-hour lock.
- After expiry the owner can withdraw directly. A partial withdrawal must leave at least the minimum.
- Rewards: a funded daily SPCXC pool multiplied by the operator's work points divided by all credited points. Claims open after that UTC day closes. No fixed APY or automatic idle yield.
- Live terms: https://mainnet.spcxchain.network/staking-api/config.
- Live funding: https://mainnet.spcxchain.network/staking-api/program-status.

The staking owner must be the direct operator address in this pilot. A trusted reviewer verifies attribution and credits confirmed assertions. The contract rechecks confirmation, creation block, mature stake, permission and replay. Reviewer trust remains part of the system.

Stake alone does not authorize an operator or start a signing node. Nitro readiness, permission and protocol collateral remain separate. The inspected rollup uses a 0.0005 WETH base bond, with possible additional dispute collateral. Verify current protocol terms before operating a signer. The community contract does not slash program principal; Nitro protocol collateral has its own risks.

## Run a watchtower

Use Docker Engine, Compose v2, Python 3.10+ and Node.js 22+ on a dedicated Linux host with persistent SSD storage. Supply your own Robinhood mainnet archive HTTPS endpoint serving historical state and logs from parent block 121350260. Initialize as root or UID 1000 and keep the archive credential private.

```sh
spcx-validator inspect
NODE_DIR="$HOME/spcx-watchtower"
spcx-validator init --dir "$NODE_DIR"
spcx-validator start --dir "$NODE_DIR"
spcx-validator status
docker compose -f "$NODE_DIR/compose.json" logs --tail=100 validator
```

Use the same user and directory consistently. The repository's current v0.1.1 CLI status compares sync and a common block hash. That observation alone is not proof of completed independent execution validation. This staking source release retains that CLI runtime unchanged.

## Software agents

The read-only monitor emits JSON observations. Give it the public operator address, not a project signer or private key.

```sh
spcx-validator agent OPERATOR --once
spcx-validator agent OPERATOR --interval 60
```

In v0.1.1, `seat` refers to the historical dual-vault proposal. `PROGRAM_NOT_CONFIGURED` does not mean that the deployed SPCXC staking contract is missing. Use the staking API or `node staking/verify.cjs` for the deployed program. Node health, stake maturity, rollup permission and funded rewards are distinct observations.

## Historical planning commands

The old `deploy-plan`, `bind-plan`, `join-plan`, `relay-plan`, `seat-status`, `admit-plan`, `fund-plan`, `credit-plan`, `claim-plan` and `exit-plan` target a different dual-vault design. Do not use them to operate the live 1,000 SPCXC / 24-hour contract.

Their previous instructions are retained as [historical pilot documentation](LEGACY-PILOT-0.1.1.md). The old `ValidatorProgram.sol` and fixtures remain for reproduction; their presence is not evidence of deployed vaults. Current contract methods and ABI are under [`staking/`](../staking/).

The current operator setup page is https://mainnet.spcxchain.network/run-a-node/.
