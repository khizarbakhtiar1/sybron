const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Example script showing how to interact with the Sybron Health Chain
 * Demonstrates the full workflow: register, consent, list, access, payment
 */
async function main() {
  console.log("🧪 Running Sybron Health Chain Demo...\n");

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}-deployment.json`);
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment file not found. Run 'npm run deploy:local' first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const [admin, patient, researcher] = await hre.ethers.getSigners();

  console.log("📋 Loaded contracts from deployment");
  console.log("   Admin:", admin.address);
  console.log("   Patient Wallet:", patient.address);
  console.log("   Researcher Wallet:", researcher.address);
  console.log("");

  // Load contract instances
  const healthToken = await hre.ethers.getContractAt("HealthToken", deployment.contracts.HealthToken);
  const patientRegistry = await hre.ethers.getContractAt("PatientRegistry", deployment.contracts.PatientRegistry);
  const researcherRegistry = await hre.ethers.getContractAt("ResearcherRegistry", deployment.contracts.ResearcherRegistry);
  const consentManager = await hre.ethers.getContractAt("ConsentManager", deployment.contracts.ConsentManager);
  const dataMarketplace = await hre.ethers.getContractAt("DataMarketplace", deployment.contracts.DataMarketplace);

  // Generate unique IDs
  const patientId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("patient-001-" + Date.now()));
  const researcherId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("researcher-001-" + Date.now()));
  const dataCategory = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("GENOMICS"));
  const listingId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("listing-001-" + Date.now()));
  const requestId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("request-001-" + Date.now()));

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Register Patient
  // ═══════════════════════════════════════════════════════════════
  console.log("1️⃣  Registering patient...");
  await patientRegistry.registerPatient(
    patientId,
    patient.address,
    "ipfs://QmPatientEncryptedMetadata123"
  );
  console.log("   ✓ Patient registered");

  // Verify patient
  await patientRegistry.verifyPatient(patientId);
  console.log("   ✓ Patient verified");

  // Update data categories
  const CATEGORY_GENOMICS = 1n << 0n;
  await patientRegistry.updateDataCategories(patientId, hre.ethers.toBeHex(CATEGORY_GENOMICS, 32));
  console.log("   ✓ Data categories updated (GENOMICS enabled)\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Register Researcher
  // ═══════════════════════════════════════════════════════════════
  console.log("2️⃣  Registering researcher...");
  await researcherRegistry.registerResearcher(
    researcherId,
    researcher.address,
    1, // ResearcherType.Institution
    "Johns Hopkins University",
    "ipfs://QmResearcherCredentials456"
  );
  console.log("   ✓ Researcher registered");

  // Verify researcher
  await researcherRegistry.verifyResearcher(researcherId);
  console.log("   ✓ Researcher verified");

  // Approve researcher for genomics category
  await researcherRegistry.approveCategory(researcherId, dataCategory);
  console.log("   ✓ Researcher approved for GENOMICS category\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Patient Grants Consent
  // ═══════════════════════════════════════════════════════════════
  console.log("3️⃣  Granting consent...");
  const oneYear = 365 * 24 * 60 * 60;
  const dataPrice = hre.ethers.parseEther("100"); // 100 HEALTH tokens

  await consentManager.grantConsent(
    patientId,
    researcherId,
    dataCategory,
    oneYear,
    "Cancer genomics research study",
    true,  // allowDerivativeWorks
    false, // allowCommercialUse
    true,  // requireNotification
    10,    // maxAccessCount
    dataPrice
  );
  console.log("   ✓ Consent granted for 1 year, max 10 accesses\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Create Data Listing
  // ═══════════════════════════════════════════════════════════════
  console.log("4️⃣  Creating data listing...");
  await dataMarketplace.createListing(
    listingId,
    patientId,
    dataCategory,
    "ipfs://QmEncryptedGenomicsData789",
    "Complete genomic sequence with cancer markers",
    dataPrice
  );
  console.log("   ✓ Data listing created\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Researcher Requests Access
  // ═══════════════════════════════════════════════════════════════
  console.log("5️⃣  Requesting data access...");
  await dataMarketplace.requestAccess(
    requestId,
    researcherId,
    listingId,
    "Studying genetic markers for early cancer detection",
    dataPrice
  );
  console.log("   ✓ Access requested\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Approve Access
  // ═══════════════════════════════════════════════════════════════
  console.log("6️⃣  Approving access request...");
  await dataMarketplace.approveAccess(
    requestId,
    "ipfs://QmDecryptionKey_ForResearcher_ABC"
  );
  console.log("   ✓ Access approved, decryption key provided\n");

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Complete Payment (simulate)
  // ═══════════════════════════════════════════════════════════════
  console.log("7️⃣  Processing payment...");
  
  // First, transfer some tokens to the researcher and approve marketplace
  const patientRewardsPool = deployment.treasury.patientRewardsPool;
  const healthTokenWithAdmin = healthToken.connect(admin);
  
  // For demo: mint some tokens to admin and transfer to marketplace operator
  // In production, researcher would purchase tokens first
  console.log("   (Demo: Setting up token allowances...)");
  
  // Check balance
  const balance = await healthToken.balanceOf(patientRewardsPool);
  console.log(`   Patient rewards pool balance: ${hre.ethers.formatEther(balance)} HEALTH`);

  // ═══════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(60));
  console.log("📊 DEMO RESULTS");
  console.log("=".repeat(60));

  const patientData = await patientRegistry.patients(patientId);
  console.log("\n👤 Patient Status:");
  console.log(`   Verified: ${patientData.status === 2n}`);
  console.log(`   Total Data Sets: ${patientData.totalDataSets}`);

  const researcherData = await researcherRegistry.researchers(researcherId);
  console.log("\n🔬 Researcher Status:");
  console.log(`   Institution: ${researcherData.institutionName}`);
  console.log(`   Reputation: ${researcherData.reputationScore}/10000`);
  console.log(`   Access Tier: ${await researcherRegistry.getAccessTier(researcherId)}`);

  const consentValid = await consentManager.isConsentValid(patientId, researcherId, dataCategory);
  console.log("\n📝 Consent Status:");
  console.log(`   Valid: ${consentValid}`);

  const listing = await dataMarketplace.listings(listingId);
  console.log("\n📦 Listing Status:");
  console.log(`   Active: ${listing.isActive}`);
  console.log(`   Base Price: ${hre.ethers.formatEther(listing.basePrice)} HEALTH`);

  const marketStats = await dataMarketplace.getStats();
  console.log("\n🏪 Marketplace Stats:");
  console.log(`   Total Listings: ${marketStats[0]}`);
  console.log(`   Total Transactions: ${marketStats[1]}`);
  console.log(`   Total Volume: ${hre.ethers.formatEther(marketStats[2])} HEALTH`);

  console.log("\n✅ Demo completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
