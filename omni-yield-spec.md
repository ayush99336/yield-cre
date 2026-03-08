Omni-Yield
Cross-Chain Yield Optimizer
Full Architecture & Technical Specification  •  v1.0

🎯 Track:  Best usage of CRE within a World Mini App  —  Chainlink x World ID Hackathon

1. Executive Summary
Omni-Yield is a cross-chain yield optimizer built as a World Mini App. It abstracts the entire process of finding, evaluating, and moving user funds to the highest-yielding protocol across multiple EVM chains — making DeFi yield accessible to everyday World App users as a simple "savings account" experience.

The four technology pillars and how they interlock:
Technology
Role in Omni-Yield
CRE (Chainlink Runtime Env)
Off-chain orchestration brain — reads APRs from multiple chains, detects yield gaps, triggers CCIP rebalancing
World ID + MiniKit
User identity & front-end — sybil-resistant login, wallet auth, balance display, deposit/withdraw UX inside World App
Chainlink CCIP
Cross-chain transport — moves USDC from World Chain to high-yield destination chain and back
Aave V3
Yield source — supplies USDC on Polygon Amoy / Arbitrum Sepolia and earns aUSDC interest


2. System Architecture
2.1 High-Level Component Map
The system has three logical planes:
    • User Plane  — World Mini App (Next.js + MiniKit SDK) running inside World App webview
    • Orchestration Plane  — CRE TypeScript Workflow running on a Chainlink DON
    • Settlement Plane  — Smart contracts on World Chain Sepolia, Polygon Amoy, Arbitrum Sepolia, and Gnosis Chiado

Architecture Diagram
┌─────────────────────────────────────────────────────────────────┐
│              WORLD APP  (User Plane)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js Mini App  │  MiniKit SDK  │  World ID (IDKit)   │  │
│  │  - Dashboard (APY, balance, positions)                    │  │
│  │  - Deposit / Withdraw flows                               │  │
│  │  - Wallet Auth via wallet_auth command                    │  │
│  └──────────────────┬───────────────────────────────────────┘  │
└─────────────────────┼───────────────────────────────────────────┘
                      │ HTTP (REST API)                            
┌─────────────────────▼───────────────────────────────────────────┐
│            BACKEND API  (Next.js API Routes)                     │
│  - World ID proof verification  (verifyCloudProof)               │
│  - User position tracking  (DB)                                  │
│  - CRE HTTP Trigger endpoint  (POST /api/cre-callback)           │
│  - CCIP status polling                                            │
└──────────────┬─────────────────────┬────────────────────────────┘
               │ EVM Write            │ EVM Read (CRE SDK)          
┌──────────────▼──────────┐  ┌────────▼───────────────────────────┐
│   SMART CONTRACTS       │  │  CRE WORKFLOW (Orchestration Plane) │
│                         │  │                                      │
│  YieldVault.sol         │  │  Trigger: Cron (every 10 min)        │
│  (World Chain Sepolia)  │  │                                      │
│  - Receives user USDC   │  │  Step 1: EVM Read — getAPR()         │
│  - Holds user shares    │  │    • Polygon Amoy  (Aave V3)         │
│  - Initiates CCIP send  │  │    • Arbitrum Sepolia  (Aave V3)     │
│                         │  │    • Gnosis Chiado  (Spark mock)     │
│  YieldReceiver.sol      │  │                                      │
│  (Polygon / Arbitrum /  │  │  Step 2: Compute best chain          │
│   Gnosis)               │  │    • Compare APRs                    │
│  - Receives CCIP msg    │  │    • Check threshold (>0.5%)         │
│  - Calls Aave supply()  │  │                                      │
│  - Calls Aave withdraw()│  │  Step 3: EVM Write (conditional)     │
│  - Returns via CCIP     │  │    • Call YieldVault.rebalance()      │
│                         │  │      on World Chain Sepolia           │
└─────────────┬───────────┘  └──────────────────────────────────── ┘
              │ CCIP Programmable Token Transfer                     
  ┌───────────▼──────────────────────────────┐                      
  │  CCIP LANES (Settlement Plane)            │                      
  │  World Chain Sepolia → Polygon Amoy       │                      
  │  World Chain Sepolia → Arbitrum Sepolia   │                      
  │  World Chain Sepolia → Gnosis Chiado      │                      
  └──────────────────────────────────────────┘                      


3. Network Configuration & Contract Addresses
3.1 CCIP Testnet — Confirmed Router Addresses
All addresses sourced directly from the Chainlink CCIP Directory (docs.chain.link/ccip/directory/testnet).

Chain
Role
CCIP Router
Chain Selector
World Chain Sepolia
Source (home)
TBD — check CCIP dir*
TBD*
Polygon Amoy
Destination
0x9C32...a36A (Amoy)
16281711391670634445
Arbitrum Sepolia
Destination
0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165
3478487238524512106
Gnosis Chiado
Destination
0x19b1bac554111517831ACadc0FD119D23Bb14391
8871595565390010547
Ethereum Sepolia
Relay hub (optional)
0x0BF3dE8c394...3A59
16015286601757825753
* World Chain Sepolia CCIP support was being rolled out as of the time of writing. Verify at docs.chain.link/ccip/directory/testnet/chain/worldchain-testnet-sepolia before deploying.

⚠️ Important:  World Chain Sepolia is a newer network. If direct CCIP lanes to Polygon/Arbitrum/Gnosis are not yet live, route through Ethereum Sepolia as a relay hub (World Chain → Eth Sepolia → Destination). Verify lane status at ccip.chain.link/status.

3.2 Aave V3 Pool Addresses — Testnet
Chain
Pool Address
PoolAddressesProvider
Notes
Polygon Amoy
0x794a61358D6845594F94dc1DB02A252b5b4814aD
0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
Active testnet deployment
Arbitrum Sepolia
0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff
0xd1902Ec48ce7B559a7f3E2f1FCA67E09f4c5d96E
Verify on arbiscan
Gnosis Chiado
Spark Finance mock or deploy own
N/A
Use CCIP-BnM token as mock
Use the AaveProtocolDataProvider.getReserveData(asset) call to read current liquidityRate (RAY units, divide by 1e27 for decimal APR).


4. CRE Workflow Specification
4.1 Trigger
Parameter
Value
Type
Cron Trigger
Schedule
*/10 * * * *  (every 10 minutes)
Fallback
HTTP Trigger for manual admin rebalance
DON
Deployed on Chainlink Workflow DON (Early Access required for deploy; simulate locally during hackathon)

4.2 Workflow Logic (TypeScript Pseudocode)
File: src/workflow.ts

import { workflow, triggers, evm, http } from "@chainlink/cre-sdk";
import { CronTrigger } from "@chainlink/cre-sdk/triggers";

// ABI fragments — generated via 'cre generate-bindings'
import { AaveDataProviderABI } from "./bindings/aaveDataProvider";
import { YieldVaultABI }        from "./bindings/yieldVault";

const AAVE_DATA_PROVIDER = {
  polygonAmoy:    "0x...",   // AaveProtocolDataProvider
  arbitrumSepolia:"0x...",
  gnosisChiado:   "0x...",
};
const USDC_ADDRESSES = { polygonAmoy:"0x...", arbitrumSepolia:"0x...", gnosisChiado:"0x..." };
const YIELD_VAULT_WORLD_CHAIN = "0x...";  // YieldVault on World Chain Sepolia
const REBALANCE_THRESHOLD_RAY = 5_000_000_000_000_000_000_000_000n; // 0.5% in RAY

const handler = workflow.register(async (trigger: CronTrigger) => {

  // ── STEP 1: Read APRs from all chains ────────────────
  const evmClients = {
    polygonAmoy:     evm.client({ chainId: 80002 }),
    arbitrumSepolia: evm.client({ chainId: 421614 }),
    gnosisChiado:    evm.client({ chainId: 10200 }),
  };

  const aprs: Record<string, bigint> = {};
  for (const [chain, client] of Object.entries(evmClients)) {
    const data = await client.read({
      address: AAVE_DATA_PROVIDER[chain],
      abi: AaveDataProviderABI,
      functionName: "getReserveData",
      args: [USDC_ADDRESSES[chain]],
    });
    // liquidityRate is at index 0 in the tuple, expressed in RAY (1e27)
    aprs[chain] = data[0] as bigint;
  }

  // ── STEP 2: Find best chain ────────────────────────────
  const bestChain = Object.entries(aprs)
    .sort(([,a],[,b]) => (a > b ? -1 : 1))[0][0];
  const bestAPR   = aprs[bestChain];

  // Also read current chain from YieldVault state
  const worldClient = evm.client({ chainId: /* World Chain Sepolia ID */ 4801 });
  const currentChain: string = await worldClient.read({
    address: YIELD_VAULT_WORLD_CHAIN,
    abi: YieldVaultABI,
    functionName: "currentYieldChain",
    args: [],
  });
  const currentAPR = aprs[currentChain] ?? 0n;

  // ── STEP 3: Rebalance if gap exceeds threshold ────────
  if (bestChain !== currentChain && (bestAPR - currentAPR) > REBALANCE_THRESHOLD_RAY) {
    await worldClient.write({
      address: YIELD_VAULT_WORLD_CHAIN,
      abi: YieldVaultABI,
      functionName: "initiateRebalance",
      args: [bestChain],  // chain identifier string
    });
  }
});

export default handler;

4.3 CRE Non-Determinism Notes
⚠️ Critical CRE Constraint:  TypeScript in CRE runs inside a WASM sandbox. Never use Date.now(), Math.random(), or global fetch() directly. Use workflow.time.now() for timestamps and the evm/http capability clients for all I/O.

Forbidden Pattern
CRE-Safe Alternative
Date.now() / new Date()
workflow.time.now() from CRE SDK
Math.random()
workflow.random.bytes() capability
fetch() / axios
http.get() / http.post() from CRE http client
process.env.SECRET
workflow.secrets.get('MY_KEY') — store via cre secrets set
Infinite loops
Single-pass execution only; use cron trigger for polling


5. Smart Contract Architecture
5.1 YieldVault.sol (World Chain Sepolia)
This is the user-facing contract. Users deposit USDC here; it holds user share balances and is the CCIP sender.

Function
Description
deposit(uint256 amount)
User deposits USDC. Mints proportional shares. Emits Deposited event.
withdraw(uint256 shares)
Burns shares, triggers CCIP message to retrieve USDC from current yield chain, returns to user.
initiateRebalance(string newChain)
Called only by CRE workflow (onlyForwarder modifier). Sends CCIP message to withdraw from old chain, then deposit to new chain.
ccipReceive(Client.Any2EVMMessage)
Handles inbound CCIP messages: 'REBALANCE_COMPLETE' and 'WITHDRAW_COMPLETE'.
currentYieldChain() view
Returns the identifier of the chain currently holding funds ('polygonAmoy' / 'arbitrumSepolia' / etc.)
totalAssets() view
Returns current USDC value including accrued Aave yield.
getUserBalance(address) view
Returns user's USDC equivalent for display in Mini App.

Security: onlyForwarder Modifier
The initiateRebalance() function must be callable ONLY by the CRE Forwarder contract (deployed by Chainlink). This is the on-chain trust anchor for CRE.

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IRouterClient } from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import { Client }        from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import { CCIPReceiver }  from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import { IERC20 }        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract YieldVault is CCIPReceiver {
    // ── State ─────────────────────────────────────────────
    IRouterClient public immutable ccipRouter;
    IERC20         public immutable usdc;
    address        public           creForwarder;   // set in constructor
    string         public           currentYieldChain;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public totalDeposited;

    // Chain selector registry (set in constructor)
    mapping(string => uint64)  public chainSelectors;
    mapping(string => address) public yieldReceivers;

    // ── Modifiers ─────────────────────────────────────────
    modifier onlyForwarder() {
        require(msg.sender == creForwarder, "YieldVault: not CRE forwarder");
        _;
    }

    // ── Core Functions ────────────────────────────────────
    function deposit(uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        uint256 sharesToMint = totalShares == 0 ? amount
            : (amount * totalShares) / totalDeposited;
        shares[msg.sender] += sharesToMint;
        totalShares        += sharesToMint;
        totalDeposited     += amount;
    }

    function initiateRebalance(string calldata newChain) external onlyForwarder {
        // Step 1: Send CCIP msg to old chain → withdraw from Aave
        _sendCCIP(currentYieldChain, abi.encode("WITHDRAW_ALL"), 0);
        currentYieldChain = newChain;
    }

    function _sendCCIP(
        string memory targetChain,
        bytes  memory data,
        uint256 tokenAmount
    ) internal {
        Client.EVMTokenAmount[] memory tokenAmounts;
        if (tokenAmount > 0) {
            tokenAmounts    = new Client.EVMTokenAmount[](1);
            tokenAmounts[0] = Client.EVMTokenAmount({ token: address(usdc), amount: tokenAmount });
            usdc.approve(address(ccipRouter), tokenAmount);
        } else {
            tokenAmounts = new Client.EVMTokenAmount[](0);
        }
        Client.EVM2AnyMessage memory msg_ = Client.EVM2AnyMessage({
            receiver:  abi.encode(yieldReceivers[targetChain]),
            data:      data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({ gasLimit: 500_000 })),
            feeToken:  address(0)  // pay in native
        });
        uint256 fee = ccipRouter.getFee(chainSelectors[targetChain], msg_);
        ccipRouter.ccipSend{ value: fee }(chainSelectors[targetChain], msg_);
    }
}

5.2 YieldReceiver.sol (Polygon / Arbitrum / Gnosis)
One instance deployed on each yield chain. Receives CCIP messages from YieldVault and interfaces with Aave V3.
Message Type
Action
DEPOSIT + tokens
Approve Aave Pool, call pool.supply(usdc, amount, address(this), 0). Hold aUSDC.
WITHDRAW_ALL
Read aUSDC balance. Call pool.withdraw(usdc, type(uint256).max, address(this)). Send USDC back via CCIP Programmable Token Transfer.
WITHDRAW_FOR_USER + shares
Calculate user's proportion, withdraw that amount, send CCIP back to YieldVault with USER_WITHDRAW payload.


6. World Mini App Frontend Specification
6.1 Tech Stack
Layer
Choice
Framework
Next.js 15 (App Router) + TypeScript
MiniKit
@worldcoin/minikit-js — wrap root with <MiniKitProvider>
World ID
@worldcoin/idkit — IDKitWidget for Orb-level verification
Web3
Viem + Wagmi v2 for contract reads/writes on World Chain Sepolia
Styling
Tailwind CSS + shadcn/ui components
State
Zustand for global wallet + position state
Backend
Next.js API Routes (app/api/) for World ID verification & CRE callback

6.2 Screen Flow
Screen
Description
/ (Landing)
World ID verify gate. User must hold Orb-level credential. IDKitWidget opens World App scanner. On success → /app
/app (Dashboard)
Displays: current APY, user's USDC balance + yield earned, current active chain, CRE status (last checked, next rebalance estimate)
/deposit
Amount input → MiniKit sendTransaction command → calls YieldVault.deposit(). Show CCIP bridge progress.
/withdraw
Amount input (max = user balance) → YieldVault.withdraw(). CCIP return journey shown.
/history
Transaction list: deposits, withdrawals, rebalance events sourced from CCIP Explorer API

6.3 World ID Integration
Gate the entire app behind World ID Orb-level verification. This proves each user is a unique human (sybil resistance). On the backend, verify with verifyCloudProof from @worldcoin/idkit-core before issuing a session.

Key IDKit Config:  Set app_id to your Developer Portal app configured as on-chain=false (cloud verification). action = 'omni-yield-access'. signal = user's wallet address from MiniKit wallet_auth.

6.4 MiniKit Commands Used
Command
Usage
wallet_auth
First action after World ID gate. Gets user's wallet address via SIWE. Stores in app state.
send_transaction
Calls YieldVault.deposit() and YieldVault.withdraw(). Gas-free on World Chain via World App paymaster.
verify
Triggers World ID proof generation for IDKit.


7. End-to-End Data Flow Walkthroughs
7.1 Happy Path: User Deposits → Yield Earned → Rebalance

Step
Action
1
User opens World App → taps Omni-Yield Mini App
2
IDKitWidget prompts World ID Orb scan → proof sent to /api/verify → verifyCloudProof called → session issued
3
MiniKit wallet_auth → user's World Chain address stored
4
User enters deposit amount → send_transaction → YieldVault.deposit(amount) called on World Chain Sepolia
5
YieldVault mints shares, holds USDC, emits Deposited event
6
YieldVault calls CCIP Router → Programmable Token Transfer (USDC + DEPOSIT msg) sent to YieldReceiver on best chain
7
CCIP delivers on destination chain (~10–20 min testnet) → YieldReceiver.ccipReceive() called
8
YieldReceiver calls Aave pool.supply(usdc, amount, address(this), 0) → receives aUSDC
9
CRE Workflow triggers every 10 min: reads liquidityRate from all chains' AaveProtocolDataProvider
10
CRE detects new best chain (APR gap > 0.5%) → calls YieldVault.initiateRebalance('newChain') via CRE EVM Write
11
YieldVault sends CCIP WITHDRAW_ALL to old chain → YieldReceiver withdraws from Aave → sends USDC back
12
YieldVault receives USDC via CCIP → immediately sends CCIP DEPOSIT to new chain → cycle repeats
13
User checks dashboard: sees higher APY, position value + accrued yield displayed in real-time


8. Security Considerations
8.1 CCIP Best Practices Applied
    • Verify source chain selector in ccipReceive() — reject messages from unknown chains
    • Verify sender address in ccipReceive() — only accept from known YieldVault / YieldReceiver counterparts
    • Verify CCIP Router address — use immutable router set in constructor; never accept from unrecognized callers
    • Decouple reception from business logic — store incoming CCIP message, then process in separate step to prevent gas-limit attacks
    • Set conservative gasLimit in extraArgs (500,000) — tune based on Aave supply/withdraw gas benchmarks

8.2 World ID Security
    • Proof verification server-side only — never verify client-side (MITM risk)
    • Track nullifierHashes in DB — prevent same World ID reusing access across multiple wallets
    • signal = wallet address — ties the World ID proof to the specific depositing wallet

8.3 CRE Trust Model
    • onlyForwarder modifier on initiateRebalance() — ensures only the CRE Chainlink DON can trigger rebalancing
    • CRE provides BFT consensus across multiple nodes before writing on-chain — single node compromise cannot trigger a rebalance
    • No user private keys in CRE workflow — only calls write functions through the Forwarder contract


9. Hackathon Build Plan & Milestones
Phase
Tasks
Owner
Est. Time
1 — Contracts
YieldVault.sol + YieldReceiver.sol. Deploy to World Chain Sepolia + Polygon Amoy + Arbitrum Sepolia.
Solidity
6–8 hrs
2 — CRE Workflow
Scaffold CRE project (cre init). Write workflow.ts. Simulate locally with cre simulate.
TypeScript
4–6 hrs
3 — CCIP Integration
Wire CCIP send/receive in contracts. Test token transfers with CCIP-BnM test token.
Solidity
4–5 hrs
4 — Aave Integration
Integrate pool.supply() and pool.withdraw() in YieldReceiver. Use Aave Amoy testnet.
Solidity
3–4 hrs
5 — Mini App
Next.js app + MiniKit setup. World ID gate. Dashboard UI. Deposit/withdraw flows.
Next.js
6–8 hrs
6 — Backend API
World ID verify endpoint. CRE HTTP callback. CCIP status polling.
Next.js API
3–4 hrs
7 — Integration
Wire all pieces end-to-end. Test full flow on testnets.
Full-stack
4–5 hrs
8 — Polish
README, demo video, submit.
All
2–3 hrs

🏆 Judge Demo Strategy:  For the demo, pre-stage a deposit transaction so the CCIP bridge has already settled (avoids live 10-20 min wait). Show the CRE simulation log proving the yield-monitoring logic, and then trigger a manual rebalance via HTTP trigger to show the live CCIP cross-chain movement.


10. Known Risks & Mitigations
Risk
Mitigation
World Chain Sepolia may not have active CCIP lanes to all 3 destination chains
Route through Ethereum Sepolia as relay. Or reduce to 2 chains (Polygon Amoy + Arbitrum Sepolia) where CCIP lanes are confirmed.
CRE deploy access requires Early Access approval
Use local simulation (cre simulate) for hackathon demo. CRE simulation is fully functional and shows the workflow logic clearly.
CCIP testnet latency 10–20 min
Pre-execute CCIP txs before demo. Show CCIP Explorer link for message status. Use CCIP-BnM test tokens which are mintable on-demand.
Aave Gnosis Chiado deployment uncertain
Use CCIP-BnM token with a mock yield contract on Gnosis Chiado instead of real Aave. The CRE read logic is identical — just read a mock APR storage variable.
Aave supply requires ERC-20 approval
YieldReceiver.sol calls usdc.approve(aavePool, amount) before pool.supply(). Ensure allowance > 0 in all deposit paths.


11. Recommended Repository Structure

omni-yield/
├── contracts/                  # Foundry project
│   ├── src/
│   │   ├── YieldVault.sol       # World Chain — user-facing vault
│   │   └── YieldReceiver.sol    # Polygon/Arbitrum/Gnosis — Aave integrator
│   ├── script/
│   │   └── Deploy.s.sol         # Deployment scripts
│   └── test/
│       └── YieldVault.t.sol     # Foundry tests
│
├── cre-workflow/               # CRE TypeScript project
│   ├── src/
│   │   ├── workflow.ts          # Main workflow logic
│   │   └── bindings/            # Generated ABI bindings (cre generate-bindings)
│   ├── cre.config.ts            # CRE project configuration
│   └── package.json
│
├── mini-app/                   # Next.js 15 World Mini App
│   ├── app/
│   │   ├── layout.tsx           # MiniKitProvider wrapper
│   │   ├── page.tsx             # World ID gate + landing
│   │   ├── app/
│   │   │   ├── page.tsx         # Dashboard
│   │   │   ├── deposit/page.tsx
│   │   │   └── withdraw/page.tsx
│   │   └── api/
│   │       ├── verify/route.ts  # World ID cloud verification
│   │       └── cre-cb/route.ts  # CRE HTTP trigger callback
│   └── package.json
│
└── README.md


📎 Key External Docs:  CRE: docs.chain.link/cre  •  MiniKit: docs.world.org/mini-apps  •  CCIP: docs.chain.link/ccip  •  Aave V3 Pool: aave.com/docs/aave-v3/smart-contracts/pool  •  World ID On-Chain: docs.world.org/world-id/id/on-chain