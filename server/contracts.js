const fs = require("fs");
const path = require("path");

function findArtifact(name) {
  const roots = [
    path.join(__dirname, "..", "artifacts", "contracts", "token", `${name}.sol`, `${name}.json`),
    path.join(__dirname, "..", "artifacts", "contracts", "core", `${name}.sol`, `${name}.json`),
    path.join(__dirname, "..", "artifacts", "contracts", "marketplace", `${name}.sol`, `${name}.json`),
    path.join(__dirname, "..", "artifacts", "contracts", "permissioning", `${name}.sol`, `${name}.json`),
  ];

  for (const artifactPath of roots) {
    if (fs.existsSync(artifactPath)) {
      return JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    }
  }

  throw new Error(`Artifact not found for ${name}. Run "npm run compile" first.`);
}

function loadDeployment(network) {
  const candidates =
    network === "localhost" ? ["localhost", "hardhat"] : [network];

  for (const name of candidates) {
    const deploymentPath = path.join(
      __dirname,
      "..",
      "deployments",
      `${name}-deployment.json`
    );
    if (fs.existsSync(deploymentPath)) {
      return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
    }
  }

  throw new Error(
    `Deployment file not found for network "${network}". Run deployment first.`
  );
}

function createContracts(provider, signer, deployment) {
  const names = [
    "HealthToken",
    "PatientRegistry",
    "ResearcherRegistry",
    "ConsentManager",
    "DataMarketplace",
    "AccountRules",
    "NodeRules",
  ];

  const contracts = {};
  for (const name of names) {
    const artifact = findArtifact(name);
    const address = deployment.contracts[name];
    if (!address) {
      throw new Error(`Missing contract address for ${name} in deployment file`);
    }
    const { Contract } = require("ethers");
    contracts[name] = new Contract(address, artifact.abi, signer || provider);
  }

  return contracts;
}

module.exports = {
  findArtifact,
  loadDeployment,
  createContracts,
};
