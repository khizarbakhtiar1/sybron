const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataMarketplace", function () {
  let healthToken, patientRegistry, researcherRegistry, consentManager, dataMarketplace;
  let admin, patient, researcher, platformWallet, other;
  let patientId, researcherId, dataCategory, listingId, requestId;

  beforeEach(async function () {
    [admin, patient, researcher, platformWallet, other] = await ethers.getSigners();

    // Deploy HealthToken
    const HealthToken = await ethers.getContractFactory("HealthToken");
    healthToken = await HealthToken.deploy(
      admin.address,
      admin.address, // patient pool
      admin.address, // research pool
      admin.address, // ops
      admin.address  // reserve
    );
    await healthToken.waitForDeployment();

    // Deploy PatientRegistry
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    patientRegistry = await PatientRegistry.deploy(admin.address);
    await patientRegistry.waitForDeployment();

    // Deploy ResearcherRegistry
    const ResearcherRegistry = await ethers.getContractFactory("ResearcherRegistry");
    researcherRegistry = await ResearcherRegistry.deploy(admin.address);
    await researcherRegistry.waitForDeployment();

    // Deploy ConsentManager
    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy(admin.address);
    await consentManager.waitForDeployment();

    // Deploy DataMarketplace
    const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
    dataMarketplace = await DataMarketplace.deploy(
      admin.address,
      await healthToken.getAddress(),
      await patientRegistry.getAddress(),
      await researcherRegistry.getAddress(),
      await consentManager.getAddress(),
      platformWallet.address
    );
    await dataMarketplace.waitForDeployment();

    // Set up IDs
    patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
    researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
    dataCategory = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));
    listingId = ethers.keccak256(ethers.toUtf8Bytes("listing-001"));
    requestId = ethers.keccak256(ethers.toUtf8Bytes("request-001"));

    // Grant marketplace roles in sub-contracts
    const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
    const CONSENT_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CONSENT_ADMIN_ROLE"));
    const marketplaceAddr = await dataMarketplace.getAddress();

    await patientRegistry.grantRole(REGISTRAR_ROLE, marketplaceAddr);
    await researcherRegistry.grantRole(REGISTRAR_ROLE, marketplaceAddr);
    await consentManager.grantRole(CONSENT_ADMIN_ROLE, marketplaceAddr);
  });

  // Helper: set up a verified patient
  async function setupPatient() {
    await patientRegistry.registerPatient(patientId, patient.address, "ipfs://meta");
    await patientRegistry.verifyPatient(patientId);
    await patientRegistry.updateDataCategories(patientId, ethers.toBeHex(0x01, 32));
  }

  // Helper: set up a verified researcher with category access
  async function setupResearcher() {
    await researcherRegistry.registerResearcher(
      researcherId, researcher.address, 1, "MIT", "ipfs://cred"
    );
    await researcherRegistry.verifyResearcher(researcherId);
    await researcherRegistry.approveCategory(researcherId, dataCategory);
  }

  // Helper: grant consent
  async function setupConsent(price) {
    const oneYear = 365 * 24 * 60 * 60;
    await consentManager.grantConsent(
      patientId, researcherId, dataCategory,
      oneYear, "Cancer research", true, false, true, 10, price
    );
  }

  // Helper: set up the full pipeline up to listing
  async function setupListing(price) {
    const p = price || ethers.parseEther("100");
    await setupPatient();
    await setupResearcher();
    await setupConsent(p);
    await dataMarketplace.createListing(
      listingId, patientId, dataCategory,
      "ipfs://encryptedData", "Genomic sequence", p
    );
  }

  describe("Deployment", function () {
    it("Should set correct contract references", async function () {
      expect(await dataMarketplace.healthToken()).to.equal(await healthToken.getAddress());
      expect(await dataMarketplace.platformFeeRecipient()).to.equal(platformWallet.address);
      expect(await dataMarketplace.platformFeeBps()).to.equal(500);
    });

    it("Should grant admin and operator roles", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

      expect(await dataMarketplace.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await dataMarketplace.hasRole(OPERATOR_ROLE, admin.address)).to.be.true;
    });

    it("Should reject zero address for healthToken", async function () {
      const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
      await expect(
        DataMarketplace.deploy(
          admin.address,
          ethers.ZeroAddress,
          await patientRegistry.getAddress(),
          await researcherRegistry.getAddress(),
          await consentManager.getAddress(),
          platformWallet.address
        )
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should reject zero address for admin", async function () {
      const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
      await expect(
        DataMarketplace.deploy(
          ethers.ZeroAddress,
          await healthToken.getAddress(),
          await patientRegistry.getAddress(),
          await researcherRegistry.getAddress(),
          await consentManager.getAddress(),
          platformWallet.address
        )
      ).to.be.revertedWith("Invalid admin address");
    });

    it("Should reject zero address for fee recipient", async function () {
      const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
      await expect(
        DataMarketplace.deploy(
          admin.address,
          await healthToken.getAddress(),
          await patientRegistry.getAddress(),
          await researcherRegistry.getAddress(),
          await consentManager.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid fee recipient");
    });
  });

  describe("Create Listing", function () {
    beforeEach(async function () {
      await setupPatient();
    });

    it("Should create a listing for verified patient", async function () {
      const price = ethers.parseEther("100");

      await expect(
        dataMarketplace.createListing(
          listingId, patientId, dataCategory,
          "ipfs://data", "Description", price
        )
      )
        .to.emit(dataMarketplace, "ListingCreated")
        .withArgs(listingId, patientId, dataCategory, price);

      const listing = await dataMarketplace.listings(listingId);
      expect(listing.patientId).to.equal(patientId);
      expect(listing.basePrice).to.equal(price);
      expect(listing.isActive).to.be.true;
      expect(await dataMarketplace.totalListings()).to.equal(1);
    });

    it("Should reject duplicate listing ID", async function () {
      await dataMarketplace.createListing(
        listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
      );
      await expect(
        dataMarketplace.createListing(
          listingId, patientId, dataCategory, "ipfs://data2", "Desc2", ethers.parseEther("200")
        )
      ).to.be.revertedWith("Listing exists");
    });

    it("Should reject zero price", async function () {
      await expect(
        dataMarketplace.createListing(
          listingId, patientId, dataCategory, "ipfs://data", "Desc", 0
        )
      ).to.be.revertedWith("Price must be positive");
    });

    it("Should reject listing for unverified patient", async function () {
      const unverifiedId = ethers.keccak256(ethers.toUtf8Bytes("unverified"));
      await patientRegistry.registerPatient(unverifiedId, other.address, "ipfs://meta");

      await expect(
        dataMarketplace.createListing(
          listingId, unverifiedId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
        )
      ).to.be.revertedWith("Patient not verified");
    });

    it("Should reject from non-operator", async function () {
      await expect(
        dataMarketplace.connect(other).createListing(
          listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
        )
      ).to.be.reverted;
    });

    it("Should increment patient's data sets", async function () {
      await dataMarketplace.createListing(
        listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
      );
      const patientData = await patientRegistry.patients(patientId);
      expect(patientData.totalDataSets).to.equal(1);
    });

    it("Should track patient listings", async function () {
      await dataMarketplace.createListing(
        listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
      );
      const listings = await dataMarketplace.getPatientListings(patientId);
      expect(listings.length).to.equal(1);
      expect(listings[0]).to.equal(listingId);
    });
  });

  describe("Request Access", function () {
    const price = ethers.parseEther("100");

    beforeEach(async function () {
      await setupListing(price);
    });

    it("Should create an access request", async function () {
      await expect(
        dataMarketplace.requestAccess(
          requestId, researcherId, listingId, "Cancer study", price
        )
      )
        .to.emit(dataMarketplace, "AccessRequested")
        .withArgs(requestId, researcherId, listingId, price);

      const request = await dataMarketplace.accessRequests(requestId);
      expect(request.researcherId).to.equal(researcherId);
      expect(request.status).to.equal(0); // Pending
    });

    it("Should reject duplicate request ID", async function () {
      await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price);
      await expect(
        dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study2", price)
      ).to.be.revertedWith("Request exists");
    });

    it("Should reject price below base", async function () {
      await expect(
        dataMarketplace.requestAccess(
          requestId, researcherId, listingId, "Study", ethers.parseEther("50")
        )
      ).to.be.revertedWith("Price too low");
    });

    it("Should reject unverified researcher", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake-researcher"));
      await expect(
        dataMarketplace.requestAccess(requestId, fakeId, listingId, "Study", price)
      ).to.be.revertedWith("Researcher not verified");
    });

    it("Should reject researcher without category access", async function () {
      // Register and verify a second researcher without category approval
      const researcherId2 = ethers.keccak256(ethers.toUtf8Bytes("researcher-002"));
      await researcherRegistry.registerResearcher(
        researcherId2, other.address, 1, "Stanford", "ipfs://cred2"
      );
      await researcherRegistry.verifyResearcher(researcherId2);
      // No category approval

      await expect(
        dataMarketplace.requestAccess(requestId, researcherId2, listingId, "Study", price)
      ).to.be.revertedWith("No category access");
    });

    it("Should track researcher requests", async function () {
      await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price);
      const requests = await dataMarketplace.getResearcherRequests(researcherId);
      expect(requests.length).to.equal(1);
    });
  });

  describe("Approve Access", function () {
    const price = ethers.parseEther("100");

    beforeEach(async function () {
      await setupListing(price);
      await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price);
    });

    it("Should approve a pending request with valid consent", async function () {
      await expect(
        dataMarketplace.approveAccess(requestId, "ipfs://decryptionKey")
      )
        .to.emit(dataMarketplace, "AccessApproved")
        .withArgs(requestId, "ipfs://decryptionKey");

      const request = await dataMarketplace.accessRequests(requestId);
      expect(request.status).to.equal(1); // Approved
    });

    it("Should reject approving non-pending request", async function () {
      await dataMarketplace.approveAccess(requestId, "ipfs://key");
      await expect(
        dataMarketplace.approveAccess(requestId, "ipfs://key2")
      ).to.be.revertedWith("Not pending");
    });

    it("Should reject approval without valid consent", async function () {
      // Revoke consent first
      await consentManager.revokeConsent(patientId, researcherId, dataCategory);

      await expect(
        dataMarketplace.approveAccess(requestId, "ipfs://key")
      ).to.be.revertedWith("No valid consent");
    });
  });

  describe("Reject Access", function () {
    const price = ethers.parseEther("100");

    beforeEach(async function () {
      await setupListing(price);
      await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price);
    });

    it("Should reject an access request", async function () {
      await expect(
        dataMarketplace.rejectAccess(requestId, "Incomplete application")
      )
        .to.emit(dataMarketplace, "AccessRejected")
        .withArgs(requestId, "Incomplete application");

      const request = await dataMarketplace.accessRequests(requestId);
      expect(request.status).to.equal(2); // Rejected
    });

    it("Should only reject pending requests", async function () {
      await dataMarketplace.rejectAccess(requestId, "reason");
      await expect(
        dataMarketplace.rejectAccess(requestId, "again")
      ).to.be.revertedWith("Not pending");
    });
  });

  describe("Complete Access (Payment)", function () {
    const price = ethers.parseEther("100");

    beforeEach(async function () {
      await setupListing(price);
      await dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price);
      await dataMarketplace.approveAccess(requestId, "ipfs://key");

      // Fund admin with tokens and approve marketplace
      // Admin already has tokens from initial distribution
      const marketplaceAddr = await dataMarketplace.getAddress();
      await healthToken.approve(marketplaceAddr, ethers.parseEther("1000000"));
    });

    it("Should complete access and process payment correctly", async function () {
      const patientBalanceBefore = await healthToken.balanceOf(patient.address);
      const platformBalanceBefore = await healthToken.balanceOf(platformWallet.address);

      await expect(dataMarketplace.completeAccess(requestId))
        .to.emit(dataMarketplace, "AccessCompleted");

      const request = await dataMarketplace.accessRequests(requestId);
      expect(request.status).to.equal(3); // Completed

      // Check payment split: 5% platform, 95% patient
      const platformFee = (price * 500n) / 10000n; // 5 HEALTH
      const patientPayout = price - platformFee;    // 95 HEALTH

      const patientBalanceAfter = await healthToken.balanceOf(patient.address);
      const platformBalanceAfter = await healthToken.balanceOf(platformWallet.address);

      expect(patientBalanceAfter - patientBalanceBefore).to.equal(patientPayout);
      expect(platformBalanceAfter - platformBalanceBefore).to.equal(platformFee);
    });

    it("Should update marketplace stats", async function () {
      await dataMarketplace.completeAccess(requestId);

      const stats = await dataMarketplace.getStats();
      expect(stats[0]).to.equal(1); // totalListings
      expect(stats[1]).to.equal(1); // totalTransactions
      expect(stats[2]).to.equal(price); // totalVolume
    });

    it("Should update listing stats", async function () {
      await dataMarketplace.completeAccess(requestId);

      const listing = await dataMarketplace.listings(listingId);
      expect(listing.totalAccesses).to.equal(1);
    });

    it("Should record patient earnings in registry", async function () {
      await dataMarketplace.completeAccess(requestId);

      const patientData = await patientRegistry.patients(patientId);
      const platformFee = (price * 500n) / 10000n;
      expect(patientData.totalEarnings).to.equal(price - platformFee);
    });

    it("Should record researcher data access in registry", async function () {
      await dataMarketplace.completeAccess(requestId);

      const researcherData = await researcherRegistry.researchers(researcherId);
      expect(researcherData.totalDataAccesses).to.equal(1);
      expect(researcherData.totalSpent).to.equal(price);
    });

    it("Should reject completing non-approved request", async function () {
      const requestId2 = ethers.keccak256(ethers.toUtf8Bytes("request-002"));
      await dataMarketplace.requestAccess(requestId2, researcherId, listingId, "Other", price);

      await expect(dataMarketplace.completeAccess(requestId2))
        .to.be.revertedWith("Not approved");
    });

    it("Should reject if consent was revoked after approval", async function () {
      // Revoke consent
      await consentManager.revokeConsent(patientId, researcherId, dataCategory);

      await expect(dataMarketplace.completeAccess(requestId))
        .to.be.revertedWith("Consent no longer valid");
    });
  });

  describe("Listing Management", function () {
    const price = ethers.parseEther("100");

    beforeEach(async function () {
      await setupListing(price);
    });

    it("Should update listing price and status", async function () {
      const newPrice = ethers.parseEther("200");
      await dataMarketplace.updateListing(listingId, newPrice, true);

      const listing = await dataMarketplace.listings(listingId);
      expect(listing.basePrice).to.equal(newPrice);
      expect(listing.isActive).to.be.true;
    });

    it("Should deactivate a listing", async function () {
      await dataMarketplace.deactivateListing(listingId);

      const listing = await dataMarketplace.listings(listingId);
      expect(listing.isActive).to.be.false;
    });

    it("Should reject update on non-existent listing", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(dataMarketplace.updateListing(fakeId, price, true))
        .to.be.revertedWith("Listing not found");
    });

    it("Should reject zero price update", async function () {
      await expect(dataMarketplace.updateListing(listingId, 0, true))
        .to.be.revertedWith("Price must be positive");
    });

    it("Should reject access request on inactive listing", async function () {
      await dataMarketplace.deactivateListing(listingId);
      await expect(
        dataMarketplace.requestAccess(requestId, researcherId, listingId, "Study", price)
      ).to.be.revertedWith("Listing not active");
    });
  });

  describe("Platform Fee", function () {
    it("Should allow admin to update platform fee", async function () {
      await expect(dataMarketplace.updatePlatformFee(1000))
        .to.emit(dataMarketplace, "PlatformFeeUpdated")
        .withArgs(500, 1000);

      expect(await dataMarketplace.platformFeeBps()).to.equal(1000);
    });

    it("Should reject fee above maximum", async function () {
      await expect(dataMarketplace.updatePlatformFee(2000))
        .to.be.revertedWith("Fee too high");
    });

    it("Should reject non-admin fee update", async function () {
      await expect(dataMarketplace.connect(other).updatePlatformFee(1000))
        .to.be.reverted;
    });
  });

  describe("Pausable", function () {
    it("Should prevent listing creation when paused", async function () {
      await setupPatient();
      await dataMarketplace.pause();

      await expect(
        dataMarketplace.createListing(
          listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
        )
      ).to.be.reverted;
    });

    it("Should allow operations after unpause", async function () {
      await setupPatient();
      await dataMarketplace.pause();
      await dataMarketplace.unpause();

      await dataMarketplace.createListing(
        listingId, patientId, dataCategory, "ipfs://data", "Desc", ethers.parseEther("100")
      );
      expect(await dataMarketplace.totalListings()).to.equal(1);
    });
  });
});
