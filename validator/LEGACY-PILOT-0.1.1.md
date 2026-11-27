> Historical dual-vault proposal. This is not the deployed SPCXC staking program. Use [the current operator guide](README.md).

# SPCX community validators · pilot 0.1.1

Humans and software agents run the same Nitro node. A wallet can sponsor its own operator or authorize a separate operating key. In the latter case both stakes and rewards belong to the sponsor. A self-sponsored agent controls its own seat and can receive rewards into its own wallet.

## Try the kit

Use Python 3.10+, Node 22+, and Foundry Anvil for the rehearsal. The kit bundles ethers 6.15.0 and the compiled contracts. The rehearsal starts and stops two local Anvil processes on ephemeral localhost ports. It never asks for credentials.

    spcx-validator inspect
    spcx-validator rehearse
    spcx-validator export ./validator-src

Inspect checks the mainnet chain IDs, child genesis, rollup, WASM, bond asset and SPCXC metadata. Supply an operator address to inspect its permission and bond. The output identifies the block and finality used. When a public provider prunes finalized state, inspect can read a pinned latest block. All transaction planners require finalized parent state.

## Run a watchtower on a separate operator VPS

Install Docker with Compose v2, Python and Node. Use your own Robinhood mainnet archive HTTPS endpoint with historical state and logs starting at parent block 121350260. The host must run Linux and the package must be initialized as root or UID 1000. Use persistent SSD storage sized for chain growth. The image and WASM match the chain’s existing node setup.

    spcx-validator init
    spcx-validator start
    spcx-validator status

Init prompts privately for the parent endpoint. The config stores this credential at rest with restricted permissions. It checks the archive, chain ID and finalized rollup WASM. Defaults are /opt/spcx-community-validator and loopback RPC port 18658. Set --dir PATH for independent configuration placement. This package reserves one Compose project and one localhost port per host. Start runs a dedicated Nitro watchtower with block validation. Status checks the common block hash and eth_syncing against the public child RPC. This is a sync check. Audit assertion comparison in Docker logs as well. A quiet chain may keep the same head.

    docker compose -f /opt/spcx-community-validator/compose.json logs --tail=100 validator

Do not share private parent gateway URLs, project keystores or validator seed phrases with community nodes. An agent can invoke inspect, status and the JSON planners using a process account without Docker or access to node credentials. The node itself continues validating even when the agent is offline.

## Stake program and rewards

Robinhood mainnet (4663) holds ERC-20 SPCXC at 0x904ccdcee00a4f4596b1e92604c00274b75cb244. SPCX Chain (46630022) holds native SPCX. The stake program has separate vaults on these networks. It does not modify the rollup’s protocol collateral. On the inspected rollup, an active operator also needs permission, parent ETH for fees and a 0.0005 WETH base bond. Additional collateral may be required during disputes.

1. Agree on both minimums, the lock term, epoch length, per-operator payout, reviewer and treasury budget. Allow for a full canonical confirmation window plus operating margin before a seat expires. Parent and child wallet owners must use the same address and control it on both networks. Smart wallets need compatible ownership and deployment on both chains.
2. The sponsor locks SPCXC on Robinhood. A distinct operator first calls setSponsor for that sponsor. Next the sponsor locks native SPCX for the same seat and absolute expiry on SPCX Chain.
3. The child vault sends the seat data through ArbSys. A relayer submits the canonical proof on Robinhood after rollup confirmation. ParentProgram checks the bridge and the actual child sender. Partial or expired seats cannot enter the program. Each chain independently releases its principal at expiry even if the relay is delayed.
4. Governance checks the two stakes, node sync, funding and operator addresses, then admits the operator through the existing rollup allowlist. Only a funded active Nitro operator with the required permissions can post an assertion. A watchtower earns no automatic staking yield.
5. A trusted reviewer attests a direct EOA assertion receipt after parent finality and rollup confirmation. The CLI binds the receipt sender, creation log, timestamp, creation height and assertion ID. Both stake locks must already have been proven at the time of the work. ParentProgram also checks rollup confirmation and creation height onchain. Incorrect attribution by a compromised reviewer remains a risk. Multisig or independently audited review infrastructure is appropriate before public funding.
6. For this pilot each funded epoch pays a fixed amount of existing SPCXC per qualifying operator, at most once per operator per epoch and once per assertion. Multiple nodes can watch the same assertion. Only its actual creator can earn the work credit. Idle periods may have no work, and a small budget can be exhausted. Other useful work, dispute support, uptime, or independent verification do not automatically earn rewards under this rule. No APY, issuance, protocol-fee revenue or slashing of program principal is implemented. Nitro’s own bond risks still apply. Funds remaining after an epoch plus one program term can roll forward by governance. Existing credited rewards remain claimable by their owner even after expiry.
7. Governance must remove expired community seats from the native allowlist. Expiration stops program eligibility automatically. Cross-contract native validator permissions require a separate governance transaction. The operator should plan its Nitro stake exit with the network operator. Program exit only unlocks program collateral.

## Deployment and operator commands

The kit does not include live vault addresses. Prepare and review a fresh deployment, deploy on test networks with their own manifests or rehearse locally, and validate a real Nitro node and canonical message delivery before opening mainnet enrollment. Mainnet commands intentionally pin chain identities. A testnet integration needs its own addresses and chain profile.

To generate unsigned deployment requests, set SPCX_PARENT_RPC (your archive URL) and optionally SPCX_CHILD_RPC. Amount arguments are decimal token amounts, term and epoch arguments are seconds. Supply your own policy. The CLI has no assumed mainnet minimum or payout rate.

    spcx-validator deploy-plan DEPLOYER REVIEWER PARENT_MIN_SPCXC CHILD_MIN_SPCX LOCK_SECONDS EPOCH_SECONDS PAYOUT_SPCXC
    spcx-validator bind-plan PARENT_PROGRAM CHILD_VAULT REVIEWER

The plan predicts CREATE addresses from pending nonces on each chain. A nonce change invalidates the previous plan. After inclusion, pin the actual reciprocal addresses. Verify the displayed economics, code and governor before binding. The one-time bind is irreversible. No deployment or operator funds move when generating a plan.

After binding, set SPCX_PROGRAM and SPCX_VAULT to the reviewed addresses. Each planner returns a JSON state or unsigned transaction. For enrollment, request the next step again only after the previous signed transaction is included on its proper chain and finalized where required. Use a wallet or a separate chain- and method-scoped signer, and track outstanding transaction hashes before generating another transaction.

    spcx-validator join-plan SPONSOR OPERATOR
    spcx-validator relay-plan CHILD_LOCK_TX RELAYER
    spcx-validator seat-status OPERATOR
    spcx-validator admit-plan OPERATOR
    spcx-validator operator-check OPERATOR

The governance wallet reviews admit-plan and later expiry-plan, both simulated through UpgradeExecutor. Confirm runtime state at signing. The original project validator is outside these community plans. Attribution in this release supports direct MakeNodes operator addresses. Smart-contract staking wallets or different assertion workflows need a separate attribution policy.

For an admitted operator on a synced dedicated host, active-config verifies the live seat, allowlist, basic funding and locally encrypted operator key. It stages a separate private config. The operator explicitly starts the signing service in the next command. The operating wallet can make real Robinhood transactions and put its WETH bond at risk. Use an operating key dedicated to Nitro. Where supported, keep the sponsor's principal under a separate wallet.

    spcx-validator active-config OPERATOR /secure/operator-keystore.json
    docker compose -f /opt/spcx-community-validator/compose.active.json up -d

For a software agent, use the read-only monitor. It emits one JSON object per line, including node health and seat eligibility when configured. A missing local node or failed registry read is reported explicitly. Use --once for health probes.

    spcx-validator agent OPERATOR --interval 60
    spcx-validator agent OPERATOR --once

For admission checks the agent can also call operator-check. Queue relay-plan once a lock receipt exists. A reviewer service can consume finalized AssertionCreated logs and call credit-plan per receipt. Recheck on pending confirmation; journal signed transaction hashes. CLI outputs must pass through the operator’s independent signer policy. Running an LLM by itself does not verify a block. Admission scheduling, signer infrastructure, automated reviewer and relayer operations are deployment responsibilities.

    spcx-validator fund-plan TREASURY EPOCH_NUMBER AMOUNT_SPCXC
    spcx-validator credit-plan SEAT_ID ASSERTION_CREATION_TX
    spcx-validator claim-plan SPONSOR
    spcx-validator exit-plan SEAT_ID parent SPONSOR
    spcx-validator exit-plan SEAT_ID child SPONSOR
    spcx-validator expiry-plan OPERATOR

For fund-plan the first result can be an exact ERC-20 approval. Repeat after confirmation for the actual budget transfer. EPOCH_NUMBER is floor(parent Unix timestamp / epoch seconds). A sponsor withdrawing its stake uses a separate exit per chain. If cross-chain RPC is temporarily down the native contracts still offer immediate direct exit on the local network after expiry.

## Reproduction and scope

Rehearsal runs compiled Solidity on two disposable EVMs. Only the chain-specific ArbSys, bridge, BoLD rollup and test ERC-20 dependencies are local fixtures. A second suite checks receipt attribution, replay handling, canonical-message calldata, chain-aware requests and watchtower settings with RPC fixtures. Real public RPC inspection is read-only. This release has not completed a real third-party Nitro synchronization, an onchain public enrollment or a treasury payout.

The exported sources compile with solc 0.8.17 and optimizer runs 200. The build inputs are contracts/ValidatorProgram.sol and lab/Fixtures.sol. To reproduce artifacts with the matching solc package installed, run node compile.cjs. Ethers 6.15.0 is included under its MIT license.
