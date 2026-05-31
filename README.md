# Sybron Health Chain

A permissioned healthcare data marketplace built on **Hyperledger Besu**. Patients own and monetize their health data while maintaining full consent control. Research institutions access anonymized datasets through a transparent, auditable marketplace.

## Key Features

- **Patient Data Ownership**: Patients register pseudonymously and control all access to their data
- **Granular Consent Management**: Time-limited, purpose-specific consent with revocation rights
- **Researcher Reputation System**: Tiered access based on reputation scores and ethics compliance
- **HEALTH Token Economy**: Native utility token for marketplace transactions and patient rewards
- **Privacy-First Design**: Encrypted off-chain data storage with on-chain access control
- **Permissioned Network**: Only verified validators (hospitals, research institutions, regulators)
- **Web Portals**: Patient and researcher dashboards connected to on-chain contracts via operator API

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYBRON HEALTH CHAIN                      │
│                   (Hyperledger Besu - QBFT)                 │
├─────────────────────────────────────────────────────────────┤
│  Patient Registry │ Consent Manager │ Data Marketplace      │
│  HEALTH Token     │ Researcher Reg. │ Account/Node Rules    │
├─────────────────────────────────────────────────────────────┤
│  Operator API (Express) ──► Frontend (patient/researcher)   │
├─────────────────────────────────────────────────────────────┤
│         Off-Chain: IPFS/Filecoin (Encrypted Data)          │
└─────────────────────────────────────────────────────────────┘
```

The operator API submits permissioned transactions (registration, listings, access requests, payments) on behalf of verified users. Wallets prove identity; the API enforces KYC/verification workflows off-chain.

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `HealthToken.sol` | ERC-20 utility token with treasury distribution |
| `PatientRegistry.sol` | Patient registration and verification |
| `ResearcherRegistry.sol` | Researcher/institution registration with reputation |
| `ConsentManager.sol` | Granular consent management with templates |
| `DataMarketplace.sol` | Core marketplace for data listings and access |
| `AccountRules.sol` | On-chain account permissioning |
| `NodeRules.sol` | On-chain node permissioning |

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for Besu network)
- Git
- MetaMask or another Web3 wallet (for frontend)

## Installation

```bash
cd sybron
npm install
cp .env.example .env
```

## Quick Start (Local Development)

The fastest way to run the full stack uses Hardhat's local node:

**Terminal 1 — blockchain node**

```bash
npm run node:hardhat
```

**Terminal 2 — deploy, seed, and start API**

```bash
npm run deploy:hardhat
npm run seed
npm run start:api
```

Open **http://localhost:3000** in your browser.

Add the local network to MetaMask:

| Setting | Value |
|---------|-------|
| Network name | Sybron Health Chain |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `1337` |
| Currency | ETH |

Import a Hardhat test account (account #0 private key from Hardhat output) to interact with the portals.

### End-to-End Workflow in the UI

1. **Patient portal** (`/patient.html`): Connect wallet → auto-register → create a data listing
2. **Researcher portal** (`/researcher.html`): Connect a different wallet → browse listings → request access
3. **Patient portal**: Approve the request → **Complete & pay** to settle in HEALTH tokens (95% patient / 5% platform)

## Development Commands

```bash
# Compile contracts
npm run compile

# Run test suite (145+ tests)
npm run test

# Run full marketplace demo script
npm run demo

# Deploy to local Hardhat node
npm run deploy:hardhat

# Seed sample listings for the UI
npm run seed

# Start operator API + frontend
npm run start:api
```

## Besu Network (Production-like)

```bash
# Initialize validator keys
./scripts/init-network.sh

# Start 4-node QBFT network
npm run node:start

# Deploy contracts (set PRIVATE_KEY in .env first)
npm run deploy:local

# Run demo against Besu
NETWORK=besu_local npm run start:api
```

Stop the network:

```bash
npm run node:stop
```

## API Reference

The operator API runs on port `3000` by default (`API_PORT` in `.env`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Chain ID, contract addresses, categories |
| GET | `/api/stats` | Network statistics |
| GET | `/api/listings` | Active marketplace listings |
| GET | `/api/patient/:wallet` | Patient profile and requests |
| GET | `/api/researcher/:wallet` | Researcher profile and requests |
| POST | `/api/patient/register` | Register and verify patient |
| POST | `/api/patient/listing` | Create data listing |
| POST | `/api/researcher/register` | Register and verify researcher |
| POST | `/api/researcher/request` | Request data access (+ auto-consent) |
| POST | `/api/marketplace/approve` | Approve access request |
| POST | `/api/marketplace/reject` | Reject access request |
| POST | `/api/marketplace/complete` | Complete payment in HEALTH tokens |

## Programmatic Workflow

### 1. Patient Registration

```javascript
await patientRegistry.registerPatient(patientId, walletAddress, "ipfs://encryptedMetadata");
await patientRegistry.verifyPatient(patientId);
```

### 2. Researcher Registration

```javascript
await researcherRegistry.registerResearcher(researcherId, walletAddress, 1, "Johns Hopkins", "ipfs://credentials");
await researcherRegistry.verifyResearcher(researcherId);
await researcherRegistry.approveCategory(researcherId, genomicsCategory);
```

### 3. Consent Management

```javascript
await consentManager.grantConsent(
  patientId, researcherId, dataCategory,
  365 * 24 * 60 * 60, "Cancer study",
  true, false, true, 10, ethers.parseEther("100")
);
```

### 4. Data Marketplace

```javascript
await dataMarketplace.createListing(listingId, patientId, category, "ipfs://encryptedData", "Genomic sequence", price);
await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Research purpose", price);
await dataMarketplace.approveAccess(requestId, "ipfs://decryptionKey");
await healthToken.approve(marketplaceAddress, price);
await dataMarketplace.completeAccess(requestId);
// → Patient receives 95 HEALTH (95%)
// → Platform receives 5 HEALTH (5%)
```

Run the full scripted demo:

```bash
npm run deploy:hardhat
npm run demo
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Operator/deployer private key | Hardhat account #0 |
| `NETWORK` | Deployment network name | `localhost` |
| `RPC_URL` | JSON-RPC endpoint | `http://127.0.0.1:8545` |
| `API_PORT` | Operator API port | `3000` |
| `BESU_TESTNET_URL` | Besu RPC for testnet deploy | `http://localhost:8545` |

See `.env.example` for treasury addresses and IPFS configuration.

## Security Considerations

- **Private Keys**: Never commit private keys. Use `.env` for local development only
- **Off-Chain Data**: All actual health data stored encrypted on IPFS/Filecoin
- **Access Control**: Role-based access using OpenZeppelin's AccessControl
- **Consent Validation**: Every data access validates active consent on-chain
- **Operator API**: Production deployments must authenticate API requests and audit all operator actions

## Project Structure

```
sybron/
├── contracts/          # Solidity smart contracts
├── test/               # Hardhat test suite
├── scripts/            # Deploy, demo, and seed scripts
├── server/             # Operator API (Express)
├── frontend/           # Patient/researcher web portals
├── docker/             # Besu network configuration
├── network/            # Genesis and permissioning config
└── deployments/        # Auto-generated contract addresses (gitignored)
```

## Roadmap

- [x] Phase 1: Core contracts
- [x] Phase 1.5: Operator API + web portals
- [ ] Phase 2: Privacy groups (Tessera integration)
- [ ] Phase 3: Multi-party consent (for family/guardian scenarios)
- [ ] Phase 4: AI training consent module
- [ ] Phase 5: Cross-chain bridges for token liquidity
- [ ] Phase 6: Governance DAO for protocol upgrades

## License

MIT License — see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please open an issue or pull request with a clear description of your changes.
