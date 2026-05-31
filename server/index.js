require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");
const {
  CATEGORY_BYTES,
  CATEGORY_BITS,
  categoryKeyFromBytes,
  categoryLabel,
} = require("./categories");
const { loadDeployment, createContracts } = require("./contracts");

const PORT = process.env.API_PORT || 3000;
const NETWORK = process.env.NETWORK || "localhost";
const RPC_URL =
  process.env.RPC_URL ||
  (NETWORK === "besu_local" ? "http://localhost:8545" : "http://127.0.0.1:8545");

const DEFAULT_OPERATOR_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const TIER_NAMES = {
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
};

const REQUEST_STATUS = ["Pending", "Approved", "Rejected", "Completed", "Cancelled"];
const PATIENT_STATUS = ["Unregistered", "Pending", "Verified", "Suspended"];

let deployment;
let provider;
let operator;
let contracts;

function initBlockchain() {
  deployment = loadDeployment(NETWORK);
  provider = new ethers.JsonRpcProvider(RPC_URL);
  const privateKey = process.env.PRIVATE_KEY || DEFAULT_OPERATOR_KEY;
  operator = new ethers.Wallet(privateKey, provider);
  contracts = createContracts(provider, operator, deployment);
}

function requireAddress(value, fieldName) {
  if (!value || !ethers.isAddress(value)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.status = 400;
    throw error;
  }
}

function makeId(prefix, wallet) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${prefix}-${wallet.toLowerCase()}-${Date.now()}`)
  );
}

async function getPatientIdForWallet(wallet) {
  return contracts.PatientRegistry.walletToPatientId(wallet);
}

async function getResearcherIdForWallet(wallet) {
  return contracts.ResearcherRegistry.walletToResearcherId(wallet);
}

async function formatListing(listingId) {
  const listing = await contracts.DataMarketplace.listings(listingId);
  if (listing.createdAt === 0n) return null;

  const categoryKey = categoryKeyFromBytes(listing.dataCategory);
  return {
    listingId,
    patientId: listing.patientId,
    dataCategory: listing.dataCategory,
    categoryKey,
    categoryLabel: categoryLabel(categoryKey),
    encryptedDataURI: listing.encryptedDataURI,
    dataDescription: listing.dataDescription,
    basePrice: listing.basePrice.toString(),
    basePriceFormatted: ethers.formatEther(listing.basePrice),
    createdAt: Number(listing.createdAt),
    isActive: listing.isActive,
    totalAccesses: Number(listing.totalAccesses),
    totalEarnings: listing.totalEarnings.toString(),
    totalEarningsFormatted: ethers.formatEther(listing.totalEarnings),
  };
}

async function formatAccessRequest(requestId) {
  const request = await contracts.DataMarketplace.accessRequests(requestId);
  if (request.requestedAt === 0n) return null;

  const listing = await formatListing(request.listingId);
  return {
    requestId,
    researcherId: request.researcherId,
    listingId: request.listingId,
    purpose: request.purpose,
    offeredPrice: request.offeredPrice.toString(),
    offeredPriceFormatted: ethers.formatEther(request.offeredPrice),
    requestedAt: Number(request.requestedAt),
    status: Number(request.status),
    statusLabel: REQUEST_STATUS[Number(request.status)] || "Unknown",
    decryptionKeyURI: request.decryptionKeyURI,
    listing,
  };
}

async function getAllFormattedRequests() {
  const requestIds = await contracts.DataMarketplace.getAllRequests();
  const requests = [];

  for (const requestId of requestIds) {
    const request = await formatAccessRequest(requestId);
    if (request) requests.push(request);
  }

  return requests;
}

async function getNetworkStats() {
  const [totalListings, totalTransactions, totalVolume] =
    await contracts.DataMarketplace.getStats();

  const totalPatients = await contracts.PatientRegistry.totalPatients();
  const totalResearchers = await contracts.ResearcherRegistry.totalResearchers();

  let totalPatientEarnings = 0n;
  const listingIds = await contracts.DataMarketplace.getAllListings();
  for (const listingId of listingIds) {
    const listing = await contracts.DataMarketplace.listings(listingId);
    totalPatientEarnings += listing.totalEarnings;
  }

  return {
    patients: Number(totalPatients),
    researchers: Number(totalResearchers),
    listings: Number(totalListings),
    transactions: Number(totalTransactions),
    volume: ethers.formatEther(totalVolume),
    patientEarnings: ethers.formatEther(totalPatientEarnings),
  };
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(express.static(path.join(__dirname, "..", "frontend")));
  app.use(
    "/deployments",
    express.static(path.join(__dirname, "..", "deployments"))
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      network: NETWORK,
      chainId: deployment.chainId,
      operator: operator.address,
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      network: NETWORK,
      chainId: deployment.chainId,
      rpcUrl: RPC_URL,
      contracts: deployment.contracts,
      categories: Object.entries(CATEGORY_BYTES).map(([key, hash]) => ({
        key,
        label: categoryLabel(key),
        hash,
      })),
    });
  });

  app.get("/api/stats", async (_req, res, next) => {
    try {
      res.json(await getNetworkStats());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/listings", async (_req, res, next) => {
    try {
      const listingIds = await contracts.DataMarketplace.getAllListings();
      const listings = [];

      for (const listingId of listingIds) {
        const listing = await formatListing(listingId);
        if (listing && listing.isActive) listings.push(listing);
      }

      res.json({ listings });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/patient/:wallet", async (req, res, next) => {
    try {
      requireAddress(req.params.wallet, "wallet address");
      const patientId = await getPatientIdForWallet(req.params.wallet);

      if (patientId === ethers.ZeroHash) {
        return res.json({ registered: false });
      }

      const patient = await contracts.PatientRegistry.patients(patientId);
      const listingIds = await contracts.DataMarketplace.getPatientListings(patientId);
      const listings = [];

      for (const listingId of listingIds) {
        const listing = await formatListing(listingId);
        if (listing) listings.push(listing);
      }

      const allRequests = await getAllFormattedRequests();
      const patientRequests = allRequests.filter(
        (request) => request.listing && request.listing.patientId === patientId
      );
      const pendingRequests = patientRequests.filter((request) => request.status === 0);

      res.json({
        registered: true,
        patientId,
        walletAddress: patient.walletAddress,
        status: Number(patient.status),
        statusLabel: PATIENT_STATUS[Number(patient.status)],
        totalDataSets: Number(patient.totalDataSets),
        totalEarnings: patient.totalEarnings.toString(),
        totalEarningsFormatted: ethers.formatEther(patient.totalEarnings),
        listings,
        pendingRequests,
        accessRequests: patientRequests,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/researcher/:wallet", async (req, res, next) => {
    try {
      requireAddress(req.params.wallet, "wallet address");
      const researcherId = await getResearcherIdForWallet(req.params.wallet);

      if (researcherId === ethers.ZeroHash) {
        return res.json({ registered: false });
      }

      const researcher = await contracts.ResearcherRegistry.researchers(researcherId);
      const tier = await contracts.ResearcherRegistry.getAccessTier(researcherId);
      const requestIds = await contracts.DataMarketplace.getResearcherRequests(researcherId);
      const requests = [];

      for (const requestId of requestIds) {
        const request = await formatAccessRequest(requestId);
        if (request) requests.push(request);
      }

      const accessed = requests.filter((request) => request.status === 3);

      res.json({
        registered: true,
        researcherId,
        walletAddress: researcher.walletAddress,
        institutionName: researcher.institutionName,
        status: Number(researcher.status),
        reputationScore: Number(researcher.reputationScore),
        reputationPercent: `${(Number(researcher.reputationScore) / 100).toFixed(0)}%`,
        accessTier: Number(tier),
        accessTierLabel: TIER_NAMES[Number(tier)] || "Unknown",
        totalDataAccesses: Number(researcher.totalDataAccesses),
        totalSpent: researcher.totalSpent.toString(),
        totalSpentFormatted: ethers.formatEther(researcher.totalSpent),
        requests,
        accessed,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/patient/register", async (req, res, next) => {
    try {
      const { walletAddress, metadataUri } = req.body;
      requireAddress(walletAddress, "walletAddress");

      const existingId = await getPatientIdForWallet(walletAddress);
      if (existingId !== ethers.ZeroHash) {
        return res.status(409).json({ error: "Wallet already registered" });
      }

      const patientId = makeId("patient", walletAddress);
      const metadata = metadataUri || `ipfs://sybron-patient-${walletAddress.slice(2, 10)}`;

      await (
        await contracts.PatientRegistry.registerPatient(patientId, walletAddress, metadata)
      ).wait();
      await (await contracts.PatientRegistry.verifyPatient(patientId)).wait();

      res.json({ patientId, walletAddress, status: "Verified" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/patient/listing", async (req, res, next) => {
    try {
      const { walletAddress, category, description, price, fileUri } = req.body;
      requireAddress(walletAddress, "walletAddress");

      const patientId = await getPatientIdForWallet(walletAddress);
      if (patientId === ethers.ZeroHash) {
        return res.status(404).json({ error: "Patient not registered" });
      }

      const categoryKey = category || "genomics";
      const categoryBytes = CATEGORY_BYTES[categoryKey];
      if (!categoryBytes) {
        return res.status(400).json({ error: "Invalid category" });
      }

      const bit = CATEGORY_BITS[categoryKey];
      if (bit) {
        await (
          await contracts.PatientRegistry.updateDataCategories(
            patientId,
            ethers.toBeHex(bit, 32)
          )
        ).wait();
      }

      const listingId = makeId("listing", walletAddress);
      const basePrice = ethers.parseEther(String(price || "100"));
      const dataUri = fileUri || `ipfs://sybron-data-${listingId.slice(2, 10)}`;

      await (
        await contracts.DataMarketplace.createListing(
          listingId,
          patientId,
          categoryBytes,
          dataUri,
          description || "Patient health data listing",
          basePrice
        )
      ).wait();

      const listing = await formatListing(listingId);
      res.json({ listing });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/researcher/register", async (req, res, next) => {
    try {
      const { walletAddress, institutionName, credentialsUri, researcherType } = req.body;
      requireAddress(walletAddress, "walletAddress");

      const existingId = await getResearcherIdForWallet(walletAddress);
      if (existingId !== ethers.ZeroHash) {
        return res.status(409).json({ error: "Wallet already registered" });
      }

      const researcherId = makeId("researcher", walletAddress);
      const credentials =
        credentialsUri || `ipfs://sybron-researcher-${walletAddress.slice(2, 10)}`;
      const type = Number(researcherType ?? 1);

      await (
        await contracts.ResearcherRegistry.registerResearcher(
          researcherId,
          walletAddress,
          type,
          institutionName || "Research Institution",
          credentials
        )
      ).wait();
      await (await contracts.ResearcherRegistry.verifyResearcher(researcherId)).wait();

      for (const categoryBytes of Object.values(CATEGORY_BYTES)) {
        await (
          await contracts.ResearcherRegistry.approveCategory(researcherId, categoryBytes)
        ).wait();
      }

      res.json({ researcherId, walletAddress, status: "Verified" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/researcher/request", async (req, res, next) => {
    try {
      const { walletAddress, listingId, purpose, offer } = req.body;
      requireAddress(walletAddress, "walletAddress");

      if (!listingId) {
        return res.status(400).json({ error: "listingId is required" });
      }

      const researcherId = await getResearcherIdForWallet(walletAddress);
      if (researcherId === ethers.ZeroHash) {
        return res.status(404).json({ error: "Researcher not registered" });
      }

      const listing = await contracts.DataMarketplace.listings(listingId);
      if (listing.createdAt === 0n) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const offeredPrice = ethers.parseEther(String(offer || ethers.formatEther(listing.basePrice)));
      const requestId = makeId("request", walletAddress);

      await (
        await contracts.DataMarketplace.requestAccess(
          requestId,
          researcherId,
          listingId,
          purpose || "Research study",
          offeredPrice
        )
      ).wait();

      const patientId = listing.patientId;
      const oneYear = 365 * 24 * 60 * 60;
      const consentValid = await contracts.ConsentManager.isConsentValid(
        patientId,
        researcherId,
        listing.dataCategory
      );

      if (!consentValid) {
        await (
          await contracts.ConsentManager.grantConsent(
            patientId,
            researcherId,
            listing.dataCategory,
            oneYear,
            purpose || "Marketplace data access",
            true,
            false,
            true,
            10,
            offeredPrice
          )
        ).wait();
      }

      const request = await formatAccessRequest(requestId);
      res.json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marketplace/approve", async (req, res, next) => {
    try {
      const { requestId, decryptionKeyUri } = req.body;
      if (!requestId) {
        return res.status(400).json({ error: "requestId is required" });
      }

      const keyUri = decryptionKeyUri || `ipfs://sybron-key-${requestId.slice(2, 10)}`;
      await (await contracts.DataMarketplace.approveAccess(requestId, keyUri)).wait();

      const request = await formatAccessRequest(requestId);
      res.json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marketplace/reject", async (req, res, next) => {
    try {
      const { requestId, reason } = req.body;
      if (!requestId) {
        return res.status(400).json({ error: "requestId is required" });
      }

      await (
        await contracts.DataMarketplace.rejectAccess(requestId, reason || "Request rejected")
      ).wait();

      const request = await formatAccessRequest(requestId);
      res.json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/marketplace/complete", async (req, res, next) => {
    try {
      const { requestId } = req.body;
      if (!requestId) {
        return res.status(400).json({ error: "requestId is required" });
      }

      const request = await contracts.DataMarketplace.accessRequests(requestId);
      const price = request.offeredPrice;
      const marketplaceAddress = deployment.contracts.DataMarketplace;

      const balance = await contracts.HealthToken.balanceOf(operator.address);
      if (balance < price) {
        await (
          await contracts.HealthToken.mint(operator.address, price - balance)
        ).wait();
      }

      await (
        await contracts.HealthToken.approve(marketplaceAddress, price)
      ).wait();
      await (await contracts.DataMarketplace.completeAccess(requestId)).wait();

      const completed = await formatAccessRequest(requestId);
      res.json({ request: completed });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || "Internal server error",
    });
  });

  return app;
}

if (require.main === module) {
  try {
    initBlockchain();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`Sybron API running at http://localhost:${PORT}`);
      console.log(`Network: ${NETWORK} (chain ${deployment.chainId})`);
      console.log(`Operator: ${operator.address}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

module.exports = { createApp, initBlockchain, getNetworkStats, formatListing };
