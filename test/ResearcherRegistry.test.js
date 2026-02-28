const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ResearcherRegistry", function () {
  let researcherRegistry;
  let admin, researcher, researcher2, other;
  let researcherId, researcherId2;
  const genomicsCategory = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));
  const labCategory = ethers.keccak256(ethers.toUtf8Bytes("LAB_RESULTS"));

  beforeEach(async function () {
    [admin, researcher, researcher2, other] = await ethers.getSigners();

    const ResearcherRegistry = await ethers.getContractFactory("ResearcherRegistry");
    researcherRegistry = await ResearcherRegistry.deploy(admin.address);
    await researcherRegistry.waitForDeployment();

    researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
    researcherId2 = ethers.keccak256(ethers.toUtf8Bytes("researcher-002"));
  });

  describe("Deployment", function () {
    it("Should set admin roles correctly", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
      const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));

      expect(await researcherRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await researcherRegistry.hasRole(REGISTRAR_ROLE, admin.address)).to.be.true;
      expect(await researcherRegistry.hasRole(VERIFIER_ROLE, admin.address)).to.be.true;
    });

    it("Should initialize access tiers", async function () {
      const bronze = await researcherRegistry.accessTiers(1);
      expect(bronze.name).to.equal("Bronze");
      expect(bronze.requiredReputation).to.equal(0);

      const platinum = await researcherRegistry.accessTiers(4);
      expect(platinum.name).to.equal("Platinum");
      expect(platinum.requiredReputation).to.equal(8500);
      expect(platinum.discountBps).to.equal(1500);
    });
  });

  describe("Registration", function () {
    it("Should register a new researcher", async function () {
      await expect(
        researcherRegistry.registerResearcher(
          researcherId,
          researcher.address,
          1, // Institution
          "Johns Hopkins",
          "ipfs://credentials"
        )
      )
        .to.emit(researcherRegistry, "ResearcherRegistered")
        .withArgs(researcherId, researcher.address, 1, "Johns Hopkins");

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.walletAddress).to.equal(researcher.address);
      expect(data.status).to.equal(1); // Pending
      expect(data.institutionName).to.equal("Johns Hopkins");
      expect(data.reputationScore).to.equal(5000); // INITIAL_REPUTATION
      expect(await researcherRegistry.totalResearchers()).to.equal(1);
    });

    it("Should map wallet to researcher ID", async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      expect(await researcherRegistry.walletToResearcherId(researcher.address))
        .to.equal(researcherId);
    });

    it("Should reject duplicate researcher ID", async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await expect(
        researcherRegistry.registerResearcher(
          researcherId, researcher2.address, 1, "Stanford", "ipfs://cred2"
        )
      ).to.be.revertedWith("Researcher exists");
    });

    it("Should reject duplicate wallet", async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await expect(
        researcherRegistry.registerResearcher(
          researcherId2, researcher.address, 1, "Stanford", "ipfs://cred2"
        )
      ).to.be.revertedWith("Wallet already registered");
    });

    it("Should reject zero address wallet", async function () {
      await expect(
        researcherRegistry.registerResearcher(
          researcherId, ethers.ZeroAddress, 1, "MIT", "ipfs://cred"
        )
      ).to.be.revertedWith("Invalid wallet");
    });

    it("Should reject empty institution name", async function () {
      await expect(
        researcherRegistry.registerResearcher(
          researcherId, researcher.address, 1, "", "ipfs://cred"
        )
      ).to.be.revertedWith("Institution name required");
    });

    it("Should reject non-REGISTRAR_ROLE caller", async function () {
      await expect(
        researcherRegistry.connect(other).registerResearcher(
          researcherId, researcher.address, 1, "MIT", "ipfs://cred"
        )
      ).to.be.reverted;
    });

    it("Should reject registration when paused", async function () {
      await researcherRegistry.pause();
      await expect(
        researcherRegistry.registerResearcher(
          researcherId, researcher.address, 1, "MIT", "ipfs://cred"
        )
      ).to.be.reverted;
    });
  });

  describe("Verification", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
    });

    it("Should verify a pending researcher", async function () {
      await expect(researcherRegistry.verifyResearcher(researcherId))
        .to.emit(researcherRegistry, "ResearcherVerified")
        .withArgs(researcherId, admin.address);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.status).to.equal(2); // Verified
      expect(data.verifiedAt).to.be.gt(0);
      expect(await researcherRegistry.verifiedResearchers()).to.equal(1);
    });

    it("Should reject verifying non-pending researcher", async function () {
      await researcherRegistry.verifyResearcher(researcherId);
      await expect(researcherRegistry.verifyResearcher(researcherId))
        .to.be.revertedWith("Not pending");
    });

    it("isVerified should return true for verified researcher", async function () {
      await researcherRegistry.verifyResearcher(researcherId);
      expect(await researcherRegistry.isVerified(researcherId)).to.be.true;
    });

    it("isVerified should return false for pending researcher", async function () {
      expect(await researcherRegistry.isVerified(researcherId)).to.be.false;
    });
  });

  describe("Category Approval", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should approve a category for verified researcher", async function () {
      await expect(researcherRegistry.approveCategory(researcherId, genomicsCategory))
        .to.emit(researcherRegistry, "CategoryApproved")
        .withArgs(researcherId, genomicsCategory);

      expect(await researcherRegistry.hasCategoryAccess(researcherId, genomicsCategory))
        .to.be.true;
    });

    it("Should return false for unapproved category", async function () {
      expect(await researcherRegistry.hasCategoryAccess(researcherId, labCategory))
        .to.be.false;
    });

    it("Should handle multiple categories", async function () {
      await researcherRegistry.approveCategory(researcherId, genomicsCategory);
      await researcherRegistry.approveCategory(researcherId, labCategory);

      expect(await researcherRegistry.hasCategoryAccess(researcherId, genomicsCategory)).to.be.true;
      expect(await researcherRegistry.hasCategoryAccess(researcherId, labCategory)).to.be.true;
    });

    it("Should reject approval for non-verified researcher", async function () {
      await researcherRegistry.registerResearcher(
        researcherId2, researcher2.address, 1, "Stanford", "ipfs://cred2"
      );
      await expect(researcherRegistry.approveCategory(researcherId2, genomicsCategory))
        .to.be.revertedWith("Not verified");
    });
  });

  describe("Reputation", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should increase reputation", async function () {
      await researcherRegistry.updateReputation(researcherId, 1000);
      const data = await researcherRegistry.researchers(researcherId);
      expect(data.reputationScore).to.equal(6000); // 5000 + 1000
    });

    it("Should decrease reputation", async function () {
      await researcherRegistry.updateReputation(researcherId, -2000);
      const data = await researcherRegistry.researchers(researcherId);
      expect(data.reputationScore).to.equal(3000); // 5000 - 2000
    });

    it("Should not go below 0", async function () {
      await researcherRegistry.updateReputation(researcherId, -10000);
      const data = await researcherRegistry.researchers(researcherId);
      expect(data.reputationScore).to.equal(0);
    });

    it("Should not exceed MAX_REPUTATION", async function () {
      await researcherRegistry.updateReputation(researcherId, 10000);
      const data = await researcherRegistry.researchers(researcherId);
      expect(data.reputationScore).to.equal(10000);
    });

    it("Should emit ReputationUpdated", async function () {
      await expect(researcherRegistry.updateReputation(researcherId, 500))
        .to.emit(researcherRegistry, "ReputationUpdated")
        .withArgs(researcherId, 5000, 5500);
    });
  });

  describe("Access Tiers", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should return Bronze tier at initial reputation (5000)", async function () {
      // 5000 < 6000 (Gold threshold), >= 3000 (Silver threshold)
      expect(await researcherRegistry.getAccessTier(researcherId)).to.equal(2); // Silver
    });

    it("Should return Gold tier at 6000+", async function () {
      await researcherRegistry.updateReputation(researcherId, 1000); // 6000
      expect(await researcherRegistry.getAccessTier(researcherId)).to.equal(3);
    });

    it("Should return Platinum tier at 8500+", async function () {
      await researcherRegistry.updateReputation(researcherId, 3500); // 8500
      expect(await researcherRegistry.getAccessTier(researcherId)).to.equal(4);
    });

    it("Should return Bronze tier at 0 reputation", async function () {
      await researcherRegistry.updateReputation(researcherId, -5000); // 0
      expect(await researcherRegistry.getAccessTier(researcherId)).to.equal(1);
    });
  });

  describe("Ethics Violations", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should record ethics violation and penalize reputation", async function () {
      await researcherRegistry.recordEthicsViolation(researcherId, "Data misuse", 1000);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.ethicsViolations).to.equal(1);
      expect(data.reputationScore).to.equal(4000); // 5000 - 1000
    });

    it("Should auto-suspend on 3+ violations", async function () {
      await researcherRegistry.recordEthicsViolation(researcherId, "Violation 1", 500);
      await researcherRegistry.recordEthicsViolation(researcherId, "Violation 2", 500);
      await researcherRegistry.recordEthicsViolation(researcherId, "Violation 3", 500);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.status).to.equal(3); // Suspended
      expect(data.ethicsViolations).to.equal(3);
      expect(await researcherRegistry.verifiedResearchers()).to.equal(0);
    });

    it("Should emit EthicsViolationRecorded event", async function () {
      await expect(researcherRegistry.recordEthicsViolation(researcherId, "Misuse", 500))
        .to.emit(researcherRegistry, "EthicsViolationRecorded")
        .withArgs(researcherId, "Misuse");
    });
  });

  describe("Data Access Recording", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should record data access", async function () {
      const amount = ethers.parseEther("100");
      await researcherRegistry.recordDataAccess(researcherId, amount);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.totalDataAccesses).to.equal(1);
      expect(data.totalSpent).to.equal(amount);
    });

    it("Should accumulate multiple accesses", async function () {
      await researcherRegistry.recordDataAccess(researcherId, ethers.parseEther("50"));
      await researcherRegistry.recordDataAccess(researcherId, ethers.parseEther("75"));

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.totalDataAccesses).to.equal(2);
      expect(data.totalSpent).to.equal(ethers.parseEther("125"));
    });
  });

  describe("Study Completion", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should record successful study and boost reputation", async function () {
      await researcherRegistry.recordStudyCompletion(researcherId, true);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.successfulStudies).to.equal(1);
      expect(data.reputationScore).to.equal(5100); // 5000 + 100
    });

    it("Should record unsuccessful study without reputation change", async function () {
      await researcherRegistry.recordStudyCompletion(researcherId, false);

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.successfulStudies).to.equal(0);
      expect(data.reputationScore).to.equal(5000); // unchanged
    });

    it("Should emit StudyCompleted", async function () {
      await expect(researcherRegistry.recordStudyCompletion(researcherId, true))
        .to.emit(researcherRegistry, "StudyCompleted")
        .withArgs(researcherId, true);
    });
  });

  describe("Suspension", function () {
    beforeEach(async function () {
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      await researcherRegistry.verifyResearcher(researcherId);
    });

    it("Should suspend a verified researcher", async function () {
      await expect(researcherRegistry.suspendResearcher(researcherId, "Policy violation"))
        .to.emit(researcherRegistry, "ResearcherSuspended")
        .withArgs(researcherId, "Policy violation");

      const data = await researcherRegistry.researchers(researcherId);
      expect(data.status).to.equal(3); // Suspended
      expect(await researcherRegistry.verifiedResearchers()).to.equal(0);
    });

    it("Should reject suspending non-verified researcher", async function () {
      await researcherRegistry.suspendResearcher(researcherId, "test");
      await expect(researcherRegistry.suspendResearcher(researcherId, "again"))
        .to.be.revertedWith("Not verified");
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause", async function () {
      await researcherRegistry.pause();
      await expect(
        researcherRegistry.registerResearcher(
          researcherId, researcher.address, 1, "MIT", "ipfs://cred"
        )
      ).to.be.reverted;

      await researcherRegistry.unpause();
      await researcherRegistry.registerResearcher(
        researcherId, researcher.address, 1, "MIT", "ipfs://cred"
      );
      const data = await researcherRegistry.researchers(researcherId);
      expect(data.status).to.equal(1); // Pending
    });

    it("Should reject pause from non-admin", async function () {
      await expect(researcherRegistry.connect(other).pause()).to.be.reverted;
    });
  });
});
