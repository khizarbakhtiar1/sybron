const hre = require("hardhat");

async function main() {
  console.log("🏥 Deploying Sybron Health Chain Contracts...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("");

  // Treasury addresses (update these for production)
  const patientRewardsPool = process.env.PATIENT_REWARDS_POOL || "0x627306090abaB3A6e1400e9345bC60c78a8BEf57";
  const researchGrantsPool = process.env.RESEARCH_GRANTS_POOL || "0xf17f52151EbEF6C7334FAD080c5704D77216b732";
  const operationsWallet = process.env.OPERATIONS_WALLET || "0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef";
  const reserveWallet = process.env.RESERVE_WALLET || "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544";

  // 1. Deploy HEALTH Token
  console.log("1️⃣  Deploying HealthToken...");
  const HealthToken = await hre.ethers.getContractFactory("HealthToken");
  const healthToken = await HealthToken.deploy(
    deployer.address,
    patientRewardsPool,
    researchGrantsPool,
    operationsWallet,
    reserveWallet
  );
  await healthToken.waitForDeployment();
  const healthTokenAddress = await healthToken.getAddress();
  console.log("   HealthToken deployed to:", healthTokenAddress);

  // 2. Deploy Patient Registry
  console.log("2️⃣  Deploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientRegistry.deploy(deployer.address);
  await patientRegistry.waitForDeployment();
  const patientRegistryAddress = await patientRegistry.getAddress();
  console.log("   PatientRegistry deployed to:", patientRegistryAddress);

  // 3. Deploy Researcher Registry
  console.log("3️⃣  Deploying ResearcherRegistry...");
  const ResearcherRegistry = await hre.ethers.getContractFactory("ResearcherRegistry");
  const researcherRegistry = await ResearcherRegistry.deploy(deployer.address);
  await researcherRegistry.waitForDeployment();
  const researcherRegistryAddress = await researcherRegistry.getAddress();
  console.log("   ResearcherRegistry deployed to:", researcherRegistryAddress);

  // 4. Deploy Consent Manager
  console.log("4️⃣  Deploying ConsentManager...");
  const ConsentManager = await hre.ethers.getContractFactory("ConsentManager");
  const consentManager = await ConsentManager.deploy(deployer.address);
  await consentManager.waitForDeployment();
  const consentManagerAddress = await consentManager.getAddress();
  console.log("   ConsentManager deployed to:", consentManagerAddress);

  // 5. Deploy Data Marketplace
  console.log("5️⃣  Deploying DataMarketplace...");
  const DataMarketplace = await hre.ethers.getContractFactory("DataMarketplace");
  const dataMarketplace = await DataMarketplace.deploy(
    deployer.address,
    healthTokenAddress,
    patientRegistryAddress,
    researcherRegistryAddress,
    consentManagerAddress,
    operationsWallet  // Platform fee recipient
  );
  await dataMarketplace.waitForDeployment();
  const dataMarketplaceAddress = await dataMarketplace.getAddress();
  console.log("   DataMarketplace deployed to:", dataMarketplaceAddress);

  // 6. Set up roles and permissions
  console.log("\n⚙️  Setting up roles and permissions...");
  
  // Grant REGISTRAR_ROLE to DataMarketplace in PatientRegistry
  const REGISTRAR_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  await patientRegistry.grantRole(REGISTRAR_ROLE, dataMarketplaceAddress);
  console.log("   ✓ Granted REGISTRAR_ROLE to DataMarketplace in PatientRegistry");

  // Grant REGISTRAR_ROLE to DataMarketplace in ResearcherRegistry
  await researcherRegistry.grantRole(REGISTRAR_ROLE, dataMarketplaceAddress);
  console.log("   ✓ Granted REGISTRAR_ROLE to DataMarketplace in ResearcherRegistry");

  // Grant CONSENT_ADMIN_ROLE to DataMarketplace in ConsentManager
  const CONSENT_ADMIN_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("CONSENT_ADMIN_ROLE"));
  await consentManager.grantRole(CONSENT_ADMIN_ROLE, dataMarketplaceAddress);
  console.log("   ✓ Granted CONSENT_ADMIN_ROLE to DataMarketplace in ConsentManager");

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("─".repeat(60));
  console.log(`   HealthToken:       ${healthTokenAddress}`);
  console.log(`   PatientRegistry:   ${patientRegistryAddress}`);
  console.log(`   ResearcherRegistry: ${researcherRegistryAddress}`);
  console.log(`   ConsentManager:    ${consentManagerAddress}`);
  console.log(`   DataMarketplace:   ${dataMarketplaceAddress}`);
  console.log("─".repeat(60));
  console.log("\n📝 Treasury Addresses:");
  console.log(`   Patient Rewards:   ${patientRewardsPool}`);
  console.log(`   Research Grants:   ${researchGrantsPool}`);
  console.log(`   Operations:        ${operationsWallet}`);
  console.log(`   Reserve:           ${reserveWallet}`);
  console.log("\n");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      HealthToken: healthTokenAddress,
      PatientRegistry: patientRegistryAddress,
      ResearcherRegistry: researcherRegistryAddress,
      ConsentManager: consentManagerAddress,
      DataMarketplace: dataMarketplaceAddress
    },
    treasury: {
      patientRewardsPool,
      researchGrantsPool,
      operationsWallet,
      reserveWallet
    }
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deploymentsDir, `${hre.network.name}-deployment.json`),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`💾 Deployment info saved to deployments/${hre.network.name}-deployment.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
