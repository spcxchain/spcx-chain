# Blockscout explorer live on SPCX Chain

Public HTTPS deployment: **26 November 2026 (UTC)**. Public evidence checked again on **27 November 2026 (UTC)**.

SPCX Chain now has a public Blockscout explorer backed by a dedicated Nitro archive node. Users can inspect blocks, transaction receipts, addresses and token transfers on SPCX mainnet, chain ID **46630022**, with native **SPCX** as the gas currency.

- Explorer: https://explorer.spcxchain.network/
- Live deployment status: https://explorer.spcxchain.network/__spcx_explorer
- [Machine-readable evidence captured on 27 November](evidence/blockscout-explorer-2026-11-27.json)

## What was deployed

The self-hosted explorer uses Blockscout's backend, database and web interface with an independent Nitro archive reader. The archive reader reconstructs SPCX from batches published on Robinhood Chain. It provides historical state, receipts and traces for indexing.

The dedicated explorer infrastructure is separate from the production sequencer, batch poster and validator signer. The archive reader does not require the production operator's signing keys.

## Public verification

The public status endpoint reports build `spcx-blockscout-public-v1.0.0-085f300b44da`, phase `https` and status `online`.

At the recorded check, the archive head was **57**, the reference RPC head was **59**, and the reported lag was **2 blocks**. These are timestamped observations, not fixed network parameters.

A common block and an indexed successful transaction were checked against the public SPCX RPC:

| Item | Evidence |
| --- | --- |
| Indexed block | [Block 57 API](https://explorer.spcxchain.network/api/v2/blocks/57) |
| Common block hash | `0x2940a6c828fc446de711451c275fd8dd82a0a8e7c1a220fd36ecb7f0ef98d369` |
| Successful transaction | [View receipt](https://explorer.spcxchain.network/tx/0xb08973cf1b98607bbfb71064bf1cab59747319d9a3094fc3fa772184ed4dfad7) |
| Transaction API | [Indexed transaction](https://explorer.spcxchain.network/api/v2/transactions/0xb08973cf1b98607bbfb71064bf1cab59747319d9a3094fc3fa772184ed4dfad7) |
| Reference RPC | https://rpc.spcxchain.network/ |

Blockscout returned the transaction in block 57 with status `ok` and result `success`. The indexed block hash matched `eth_getBlockByNumber("0x39", false)` on the public child RPC.

## Interpretation

This deployment provides explorer access and indexed child-chain receipts. Parent settlement tracking is not enabled in this deployment. A successful child receipt is separate from assertion confirmation, parent finality and withdrawal payout.

An archive reader following posted batches may trail the sequencer RPC while newer blocks remain unposted. Consult the live status endpoint when assessing freshness.

## Upstream

- [Blockscout backend](https://github.com/blockscout/blockscout)
- [Blockscout frontend](https://github.com/blockscout/frontend)
- [Arbitrum Nitro](https://github.com/OffchainLabs/nitro)
