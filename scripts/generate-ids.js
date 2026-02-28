const hre = require("hardhat");

/**
 * Utility script to generate unique IDs for testing
 */
async function main() {
  const timestamp = Date.now();
  
  console.log("🔑 Generated Test IDs:\n");
  
  // Patient IDs
  for (let i = 1; i <= 3; i++) {
    const id = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`patient-${i}-${timestamp}`));
    console.log(`Patient ${i}: ${id}`);
  }
  
  console.log("");
  
  // Researcher IDs
  for (let i = 1; i <= 3; i++) {
    const id = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`researcher-${i}-${timestamp}`));
    console.log(`Researcher ${i}: ${id}`);
  }
  
  console.log("");
  
  // Data Categories
  const categories = ["GENOMICS", "LAB_RESULTS", "IMAGING", "PRESCRIPTIONS", "VITALS"];
  for (const cat of categories) {
    const id = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(cat));
    console.log(`Category ${cat}: ${id}`);
  }
  
  console.log("");
  
  // Listing IDs
  for (let i = 1; i <= 3; i++) {
    const id = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`listing-${i}-${timestamp}`));
    console.log(`Listing ${i}: ${id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
