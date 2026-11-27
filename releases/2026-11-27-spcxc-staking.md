# SPCXC staking is live on Robinhood

The SPCX community staking contract is deployed at `0x5Ba4dd3B7cFBbAb136b7606D1592081905124CD9` on Robinhood Chain mainnet (4663). The portal is https://mainnet.spcxchain.network/staking/.

The minimum position is **1,000 SPCXC**. Owners can withdraw after **24 hours from their latest stake**; a top-up resets that lock for the whole position. Partial withdrawals must leave at least the minimum. Principal withdrawal is direct on Robinhood and does not depend on a cross-chain relay or reviewer approval.

A mature stake is required for community validator admission. Nitro readiness, network permission, parent ETH and the protocol WETH bond remain separate. A free watchtower needs no SPCXC deposit.

Rewards use separately funded UTC-day pools of existing SPCXC. Each accepted confirmed assertion earns one point in the day it is reviewed. After the day closes, an operator can claim their funded share, rounded down. There is no fixed APY, issuance or automatic reward for holding a stake. Attribution is reviewed by a trusted reviewer; contract checks do not remove that trust assumption.

The publication snapshot records observed budgets separately. An empty pool means no reward from that pool. Deployment verification is not a payout receipt or an independent audit.

## Included in this update

- Deployed Solidity source, ABI and exact compiler input with artifact reproduction.
- Wallet-free verification of network identity, receipt, constructor input, runtime and live terms.
- Local contract scenarios for locks, exits, work credit and pool accounting.
- Current staking and validator guides. The previous dual-vault proposal is marked historical.

The watchtower runtime and gas-allowance service are separate updates.

## Evidence

- [Deployment transaction](https://robinhoodchain.blockscout.com/tx/0x5a43c4b044c6fda4cf49e6a65d24dba2c4aeb8ea55b03dc2141fafc153361714).
- [Manifest](../staking/deployment.json) and [timestamped verification](evidence/spcxc-staking-mainnet-2026-11-27.json).
- [Source, ABI and reproduction](../staking/README.md).
- [Live configuration](https://mainnet.spcxchain.network/staking-api/config) and [funding](https://mainnet.spcxchain.network/staking-api/program-status).

The website changelog records this feature as `feature:spcxc-staking-v1`, linking its public source commit and successful deployment transaction. Source publication and the existing onchain deployment are distinct facts.
