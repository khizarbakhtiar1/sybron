const hre = require("hardhat");

/**
 * Seeds the local network with sample patients, researchers, and listings.
 * Run after deploy: npx hardhat run scripts/seed.js --network localhost
 */
async function main() {
  console.log("🌱 Seeding Sybron Health Chain...\n");

  const [admin, patient1, patient2, patient3, researcher] = await hre.ethers.getSigners();
  const fs = require("fs");
  const path = require("path");

  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${hre.network.name}-deployment.json`
  );

  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    console.error("Run deploy first: npm run deploy:hardhat");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const patientRegistry = await hre.ethers.getContractAt(
    "PatientRegistry",
    deployment.contracts.PatientRegistry
  );
  const researcherRegistry = await hre.ethers.getContractAt(
    "ResearcherRegistry",
    deployment.contracts.ResearcherRegistry
  );
  const consentManager = await hre.ethers.getContractAt(
    "ConsentManager",
    deployment.contracts.ConsentManager
  );
  const dataMarketplace = await hre.ethers.getContractAt(
    "DataMarketplace",
    deployment.contracts.DataMarketplace
  );

  const samples = [
    {
      patientWallet: patient1.address,
      patientId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-patient-genomics")),
      listingId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-listing-genomics")),
      category: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("GENOMICS")),
      categoryBits: 1n << 0n,
      description: "Complete genomic sequence with variant annotations",
      price: hre.ethers.parseEther("150"),
      dataUri: "ipfs://QmSeedGenomics001",
    },
    {
      patientWallet: patient2.address,
      patientId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-patient-labs")),
      listingId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-listing-labs")),
      category: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("LAB_RESULTS")),
      categoryBits: 1n << 1n,
      description: "5-year quarterly blood panel history (CBC, metabolic, lipids)",
      price: hre.ethers.parseEther("75"),
      dataUri: "ipfs://QmSeedLabs002",
    },
    {
      patientWallet: patient3.address,
      patientId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-patient-vitals")),
      listingId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-listing-vitals")),
      category: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VITALS")),
      categoryBits: 1n << 4n,
      description: "Continuous glucose monitoring data (6 months, 5-min intervals)",
      price: hre.ethers.parseEther("200"),
      dataUri: "ipfs://QmSeedVitals003",
    },
  ];

  for (const sample of samples) {
    const existing = await patientRegistry.patients(sample.patientId);
    if (existing.status === 0n) {
      await patientRegistry.registerPatient(
        sample.patientId,
        sample.patientWallet,
        `ipfs://seed-meta-${sample.listingId.slice(2, 8)}`
      );
      await patientRegistry.verifyPatient(sample.patientId);
      await patientRegistry.updateDataCategories(
        sample.patientId,
        hre.ethers.toBeHex(sample.categoryBits, 32)
      );
    }

    const existingListing = await dataMarketplace.listings(sample.listingId);
    if (existingListing.createdAt === 0n) {
      await dataMarketplace.createListing(
        sample.listingId,
        sample.patientId,
        sample.category,
        sample.dataUri,
        sample.description,
        sample.price
      );
      console.log(`   ✓ Listing: ${sample.description}`);
    }
  }

  const mainResearcherId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("seed-researcher-001"));
  const existingResearcher = await researcherRegistry.researchers(mainResearcherId);
  if (existingResearcher.status === 0n) {
    await researcherRegistry.registerResearcher(
      mainResearcherId,
      researcher.address,
      1,
      "Johns Hopkins University",
      "ipfs://QmSeedResearcherCredentials"
    );
    await researcherRegistry.verifyResearcher(mainResearcherId);
    for (const sample of samples) {
      await researcherRegistry.approveCategory(mainResearcherId, sample.category);
    }
    console.log("   ✓ Verified researcher with category access");
  }

  console.log("\n✅ Seed data ready. Start the API: npm run start:api");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
