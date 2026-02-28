const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthToken", function () {
  let healthToken;
  let admin, patientPool, researchPool, opsWallet, reserve, user;

  beforeEach(async function () {
    [admin, patientPool, researchPool, opsWallet, reserve, user] = await ethers.getSigners();

    const HealthToken = await ethers.getContractFactory("HealthToken");
    healthToken = await HealthToken.deploy(
      admin.address,
      patientPool.address,
      researchPool.address,
      opsWallet.address,
      reserve.address
    );
    await healthToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await healthToken.name()).to.equal("Sybron Health Token");
      expect(await healthToken.symbol()).to.equal("HEALTH");
    });

    it("Should distribute initial supply correctly", async function () {
      const initialSupply = ethers.parseEther("100000000"); // 100M
      
      // 40% to patient rewards
      const patientBalance = await healthToken.balanceOf(patientPool.address);
      expect(patientBalance).to.equal(initialSupply * 4000n / 10000n);

      // 30% to research grants
      const researchBalance = await healthToken.balanceOf(researchPool.address);
      expect(researchBalance).to.equal(initialSupply * 3000n / 10000n);

      // 20% to operations
      const opsBalance = await healthToken.balanceOf(opsWallet.address);
      expect(opsBalance).to.equal(initialSupply * 2000n / 10000n);

      // 10% to reserve
      const reserveBalance = await healthToken.balanceOf(reserve.address);
      expect(reserveBalance).to.equal(initialSupply * 1000n / 10000n);
    });

    it("Should grant admin roles correctly", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

      expect(await healthToken.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await healthToken.hasRole(MINTER_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const amount = ethers.parseEther("1000");
      await healthToken.mint(user.address, amount);
      expect(await healthToken.balanceOf(user.address)).to.equal(amount);
    });

    it("Should not exceed max supply", async function () {
      const maxSupply = await healthToken.MAX_SUPPLY();
      const currentSupply = await healthToken.totalSupply();
      const excessAmount = maxSupply - currentSupply + 1n;

      await expect(healthToken.mint(user.address, excessAmount))
        .to.be.revertedWith("HealthToken: max supply exceeded");
    });

    it("Should not allow non-minter to mint", async function () {
      const amount = ethers.parseEther("1000");
      await expect(healthToken.connect(user).mint(user.address, amount))
        .to.be.reverted;
    });
  });

  describe("Burning", function () {
    it("Should allow users to burn their tokens", async function () {
      const amount = ethers.parseEther("1000");
      await healthToken.mint(user.address, amount);
      
      await healthToken.connect(user).burn(ethers.parseEther("500"));
      expect(await healthToken.balanceOf(user.address)).to.equal(ethers.parseEther("500"));
    });
  });
});

describe("PatientRegistry", function () {
  let patientRegistry;
  let admin, patient, other;

  beforeEach(async function () {
    [admin, patient, other] = await ethers.getSigners();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    patientRegistry = await PatientRegistry.deploy(admin.address);
    await patientRegistry.waitForDeployment();
  });

  describe("Patient Registration", function () {
    it("Should register a new patient", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      
      await patientRegistry.registerPatient(
        patientId,
        patient.address,
        "ipfs://metadata"
      );

      const patientData = await patientRegistry.patients(patientId);
      expect(patientData.walletAddress).to.equal(patient.address);
      expect(patientData.status).to.equal(1); // Pending
    });

    it("Should verify a registered patient", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      
      await patientRegistry.registerPatient(patientId, patient.address, "ipfs://metadata");
      await patientRegistry.verifyPatient(patientId);

      const patientData = await patientRegistry.patients(patientId);
      expect(patientData.status).to.equal(2); // Verified
    });

    it("Should not register duplicate patients", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      
      await patientRegistry.registerPatient(patientId, patient.address, "ipfs://metadata");
      
      await expect(
        patientRegistry.registerPatient(patientId, other.address, "ipfs://other")
      ).to.be.revertedWith("Patient already exists");
    });

    it("Should not register same wallet twice", async function () {
      const patientId1 = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const patientId2 = ethers.keccak256(ethers.toUtf8Bytes("patient-002"));
      
      await patientRegistry.registerPatient(patientId1, patient.address, "ipfs://metadata");
      
      await expect(
        patientRegistry.registerPatient(patientId2, patient.address, "ipfs://other")
      ).to.be.revertedWith("Wallet already registered");
    });
  });

  describe("Data Categories", function () {
    it("Should update data categories for verified patient", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const categories = ethers.toBeHex(0x07, 32); // Genomics + Lab + Imaging
      
      await patientRegistry.registerPatient(patientId, patient.address, "ipfs://metadata");
      await patientRegistry.verifyPatient(patientId);
      await patientRegistry.updateDataCategories(patientId, categories);

      const patientData = await patientRegistry.patients(patientId);
      expect(patientData.dataCategories).to.equal(categories);
    });
  });
});

describe("ConsentManager", function () {
  let consentManager;
  let admin, patient, researcher;

  beforeEach(async function () {
    [admin, patient, researcher] = await ethers.getSigners();

    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy(admin.address);
    await consentManager.waitForDeployment();
  });

  describe("Consent Granting", function () {
    it("Should grant consent with correct parameters", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
      const category = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));
      const duration = 365 * 24 * 60 * 60; // 1 year
      const price = ethers.parseEther("100");

      await consentManager.grantConsent(
        patientId,
        researcherId,
        category,
        duration,
        "Cancer research",
        true,
        false,
        true,
        10,
        price
      );

      const consent = await consentManager.getConsent(patientId, researcherId, category);
      expect(consent.status).to.equal(1); // Granted
      expect(consent.agreedPrice).to.equal(price);
      expect(consent.maxAccessCount).to.equal(10);
    });

    it("Should revoke consent", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
      const category = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));

      await consentManager.grantConsent(
        patientId, researcherId, category,
        365 * 24 * 60 * 60, "Research", true, false, true, 10,
        ethers.parseEther("100")
      );

      await consentManager.revokeConsent(patientId, researcherId, category);

      const consent = await consentManager.getConsent(patientId, researcherId, category);
      expect(consent.status).to.equal(2); // Revoked
    });

    it("Should respect global opt-out", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
      const category = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));

      await consentManager.setGlobalOptOut(patientId, true);

      await expect(
        consentManager.grantConsent(
          patientId, researcherId, category,
          365 * 24 * 60 * 60, "Research", true, false, true, 10,
          ethers.parseEther("100")
        )
      ).to.be.revertedWith("Patient has opted out");
    });
  });

  describe("Consent Templates", function () {
    it("Should create consent from template", async function () {
      const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
      const researcherId = ethers.keccak256(ethers.toUtf8Bytes("researcher-001"));
      const category = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));

      await consentManager.grantConsentFromTemplate(
        patientId,
        researcherId,
        category,
        0, // Template ID 0 (Basic Research)
        "Academic study",
        ethers.parseEther("50")
      );

      const consent = await consentManager.getConsent(patientId, researcherId, category);
      expect(consent.status).to.equal(1); // Granted
    });
  });
});
