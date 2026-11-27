# Live SPCXC staking

The community staking contract is deployed on **Robinhood Chain mainnet (4663)**. SPCXC is different from native SPCX, which pays gas on SPCX Chain (46630022).

| Setting | Value |
| --- | --- |
| Staking contract | `0x5Ba4dd3B7cFBbAb136b7606D1592081905124CD9` |
| SPCXC token | `0x904ccdcee00a4f4596b1e92604c00274b75cb244` |
| Minimum position | 1,000 SPCXC |
| Withdrawal lock | 86,400 seconds from the latest stake |
| Reward epoch | One UTC day |
| Reward asset | Existing SPCXC on Robinhood |
| Portal | https://mainnet.spcxchain.network/staking/ |

## Stake and withdraw

Use the portal on Robinhood, check the asset, contract, amount and approval in your wallet, and keep ETH for parent-chain gas. A new position requires at least 1,000 SPCXC. A later top-up may be smaller if the resulting position meets the minimum.

Every stake or top-up starts a new 24-hour lock for the **entire position**. Contract timestamps determine expiry. After expiry the owner can call `withdraw(amount)` directly; a partial withdrawal must leave at least 1,000 SPCXC, while a full withdrawal is allowed. Principal withdrawal needs no reviewer approval or cross-chain relay.

`positions(owner)` exposes `amount`, `unlockAt`, `since` and `sinceBlock`; `eligible(owner)` checks the mature minimum position. Amounts use 18 decimals: 1,000 SPCXC is `1000000000000000000000` raw units.

## Validator admission

A mature position is required for this community program. It does not configure Nitro or grant validator permission. The operator also needs a synced, configured Nitro validator, network authorization, parent ETH and the rollup's protocol WETH bond. Program principal and protocol collateral are separate. A free watchtower needs no SPCXC deposit and earns no automatic yield.

This pilot attributes work to the **direct operator address that owns the SPCXC position**. The sponsor/delegated operator and dual-vault plans in the historical CLI are not this deployed program.

## Funded work rewards

`fundEpoch(epoch, amount)` funds a pool of existing SPCXC separately from participant principal. There is no mint, fixed APY or guaranteed daily payout.

A trusted reviewer verifies actual assertion work and calls `creditWork`. The contract checks mature stake, rollup permission, assertion confirmation, creation block and assertion replay. Creator/receipt attribution and the supplied work timestamp still depend on that reviewer. This is not permissionless reward adjudication or an independent audit.

Each accepted assertion adds one point to the **UTC day when it is reviewed**. After that day closes:

```text
reward = funded_epoch_pool × operator_points / total_epoch_points
```

Integer division rounds down. A 300 SPCXC pool with three total points pays 200 SPCXC to an operator with two points. No funding or credited points means zero claimable reward. `claimable(epoch, owner)` reads the amount; `claimReward(epoch)` pays the caller once for that closed epoch. Earned claims survive principal withdrawal. Only empty closed epochs may roll their budgets forward; credited epochs remain claimable.

Read current funding at https://mainnet.spcxchain.network/staking-api/program-status. Evidence balances are timestamped observations. An active contract and portal do not establish a reward payment.

## Source and verification

- [Solidity](contracts/SPCXCValidatorStaking.sol), [ABI](abi.json), [artifact](artifacts/SPCXCValidatorStaking.json), [exact compiler input](compiler-input.json).
- [Deployment manifest](deployment.json) and [timestamped evidence](../releases/evidence/spcxc-staking-mainnet-2026-11-27.json).
- [Successful deployment transaction](https://robinhoodchain.blockscout.com/tx/0x5a43c4b044c6fda4cf49e6a65d24dba2c4aeb8ea55b03dc2141fafc153361714).
- [Current validator guide](../validator/README.md).

Recheck public evidence without a wallet:

```sh
node staking/verify.cjs
```

Only fixed JSON-RPC reads are accepted. The verifier checks both chain IDs, child genesis, creation receipt, exact constructor input, runtime and immutable locations, fixed terms and active public configuration. It loads no key and sends no blockchain transaction. A finalized receipt flag is reported only when the RPC finalized block supports it.

## Reproduce and test

Use `solc@0.8.24`, installed outside the source tree, or set `SPCX_SOLC_MODULE` to its absolute module directory. The exact standard JSON retains the original source paths and fixture source, optimizer 200, EVM Paris.

```sh
node staking/compile.cjs
ANVIL=/absolute/path/to/anvil node staking/tests/contract.test.cjs
```

Compilation compares ABI, creation bytecode, runtime and immutable locations. Disposable local Anvil scenarios cover lock boundaries, top-ups, exits, work/replay checks, pool separation, proportional claims, token transfer failures and reentry. These tests send no public-network transactions.
