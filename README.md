# Sybron Health Chain

A permissioned healthcare data marketplace built on **Hyperledger Besu**. Patients own and monetize their health data while maintaining full consent control. Research institutions access anonymized datasets through a transparent, auditable marketplace.

## Key Features

- **Patient Data Ownership**: Patients register pseudonymously and control all access to their data
- **Granular Consent Management**: Time-limited, purpose-specific consent with revocation rights
- **Researcher Reputation System**: Tiered access based on reputation scores and ethics compliance
- **HEALTH Token Economy**: Native utility token for marketplace transactions and patient rewards
- **Privacy-First Design**: Encrypted off-chain data storage with on-chain access control
- **Permissioned Network**: Only verified validators (hospitals, research institutions, regulators)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYBRON HEALTH CHAIN                      │
│                   (Hyperledger Besu - QBFT)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Patient    │  │  Consent    │  │  Data Marketplace   │ │
│  │  Registry   │  │  Manager    │  │  (Listings/Access)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  $HEALTH    │  │ Researcher  │  │  Royalty            │ │
│  │  Token      │  │ Registry    │  │  Distribution       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│         Off-Chain: IPFS/Filecoin (Encrypted Data)          │
└─────────────────────────────────────────────────────────────┘
```

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `HealthToken.sol` | ERC-20 utility token with treasury distribution |
| `PatientRegistry.sol` | Patient registration and verification |
| `ResearcherRegistry.sol` | Researcher/institution registration with reputation |
| `ConsentManager.sol` | Granular consent management with templates |
| `DataMarketplace.sol` | Core marketplace for data listings and access |

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Installation

```bash
# Clone the repository
cd sybron

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Local Development (Hardhat)

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Deploy to local Hardhat network
npx hardhat run scripts/deploy.js
```

### Local Besu Network

```bash
# Start Besu nodes
npm run node:start

# Wait for nodes to sync (check logs)
npm run node:logs

# Deploy contracts to Besu
npm run deploy:local

# Run demo script
npx hardhat run scripts/demo.js --network besu_local
```

### Stop Network

```bash
npm run node:stop
```

## Workflow

### 1. Patient Registration
```javascript
// Register patient with pseudonymous ID
await patientRegistry.registerPatient(
  patientId,
  walletAddress,
  "ipfs://encryptedMetadata"
);

// Admin verifies patient (after off-chain KYC)
await patientRegistry.verifyPatient(patientId);
```

### 2. Researcher Registration
```javascript
// Register institution
await researcherRegistry.registerResearcher(
  researcherId,
  walletAddress,
  1, // Institution type
  "Johns Hopkins",
  "ipfs://credentials"
);

// Verify and approve for categories
await researcherRegistry.verifyResearcher(researcherId);
await researcherRegistry.approveCategory(researcherId, genomicsCategory);
```

### 3. Consent Management
```javascript
// Patient grants consent to researcher
await consentManager.grantConsent(
  patientId,
  researcherId,
  dataCategory,
  365 days,      // duration
  "Cancer study", // purpose
  true,          // allow derivative works
  false,         // no commercial use
  true,          // require notification
  10,            // max accesses
  100 HEALTH     // price per access
);
```

### 4. Data Marketplace
```javascript
// Create listing
await dataMarketplace.createListing(
  listingId,
  patientId,
  category,
  "ipfs://encryptedData",
  "Genomic sequence",
  100 HEALTH // base price
);

// Researcher requests access
await dataMarketplace.requestAccess(
  requestId,
  researcherId,
  listingId,
  "Early cancer detection research",
  100 HEALTH
);

// Patient approves (via admin)
await dataMarketplace.approveAccess(requestId, "ipfs://decryptionKey");

// Complete transaction
await dataMarketplace.completeAccess(requestId);
// → Patient receives 95 HEALTH (95%)
// → Platform receives 5 HEALTH (5%)
```

## Security Considerations

- **Private Keys**: Never commit private keys. Use `.env` for local development only
- **Off-Chain Data**: All actual health data stored encrypted on IPFS/Filecoin
- **Access Control**: Role-based access using OpenZeppelin's AccessControl
- **Consent Validation**: Every data access validates active consent on-chain

## Roadmap

- [x] Phase 1: Core contracts (Complete)
- [ ] Phase 2: Privacy groups (Tessera integration)
- [ ] Phase 3: Multi-party consent (for family/guardian scenarios)
- [ ] Phase 4: AI training consent module
- [ ] Phase 5: Cross-chain bridges for token liquidity
- [ ] Phase 6: Governance DAO for protocol upgrades

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines first.

---

