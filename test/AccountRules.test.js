const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AccountRules", function () {
  let accountRules;
  let deployer, admin2, hospital, researcher, patient, other;

  beforeEach(async function () {
    [deployer, admin2, hospital, researcher, patient, other] = await ethers.getSigners();

    const AccountRules = await ethers.getContractFactory("AccountRules");
    accountRules = await AccountRules.deploy([admin2.address]);
    await accountRules.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set deployer as admin", async function () {
      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
      expect(await accountRules.hasRole(ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should add initial admins", async function () {
      expect(await accountRules.isAccountAllowed(admin2.address)).to.be.true;
      expect(await accountRules.accountTypes(admin2.address)).to.equal(1); // Admin
    });

    it("Should auto-add deployer to allowlist", async function () {
      expect(await accountRules.isAccountAllowed(deployer.address)).to.be.true;
    });

    it("Should grant ADMIN_ROLE to initial admins", async function () {
      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
      expect(await accountRules.hasRole(ADMIN_ROLE, admin2.address)).to.be.true;
    });
  });

  describe("Transaction Allowed", function () {
    it("Should allow transactions from whitelisted accounts", async function () {
      expect(await accountRules.transactionAllowed(
        deployer.address, ethers.ZeroAddress, 0, 0, 0, "0x"
      )).to.be.true;
    });

    it("Should reject transactions from non-whitelisted accounts", async function () {
      expect(await accountRules.transactionAllowed(
        other.address, ethers.ZeroAddress, 0, 0, 0, "0x"
      )).to.be.false;
    });
  });

  describe("Add Account", function () {
    it("Should add a new account with type", async function () {
      await expect(accountRules.addAccount(hospital.address, 2)) // Hospital
        .to.emit(accountRules, "AccountAdded")
        .withArgs(hospital.address, 2, deployer.address);

      expect(await accountRules.isAccountAllowed(hospital.address)).to.be.true;
      expect(await accountRules.accountTypes(hospital.address)).to.equal(2);
    });

    it("Should reject adding existing account", async function () {
      await accountRules.addAccount(hospital.address, 2);
      await expect(accountRules.addAccount(hospital.address, 3))
        .to.be.revertedWith("Account already exists");
    });

    it("Should reject zero address", async function () {
      await expect(accountRules.addAccount(ethers.ZeroAddress, 2))
        .to.be.revertedWith("Invalid address");
    });

    it("Should reject non-admin caller", async function () {
      await expect(accountRules.connect(other).addAccount(hospital.address, 2))
        .to.be.reverted;
    });

    it("Should increment account count", async function () {
      const countBefore = await accountRules.getAccountCount();
      await accountRules.addAccount(hospital.address, 2);
      expect(await accountRules.getAccountCount()).to.equal(countBefore + 1n);
    });
  });

  describe("Batch Add Accounts", function () {
    it("Should add multiple accounts at once", async function () {
      await accountRules.addAccounts(
        [hospital.address, researcher.address, patient.address],
        [2, 3, 5] // Hospital, ResearchInstitution, Patient
      );

      expect(await accountRules.isAccountAllowed(hospital.address)).to.be.true;
      expect(await accountRules.isAccountAllowed(researcher.address)).to.be.true;
      expect(await accountRules.isAccountAllowed(patient.address)).to.be.true;
      expect(await accountRules.accountTypes(hospital.address)).to.equal(2);
      expect(await accountRules.accountTypes(researcher.address)).to.equal(3);
      expect(await accountRules.accountTypes(patient.address)).to.equal(5);
    });

    it("Should reject mismatched array lengths", async function () {
      await expect(
        accountRules.addAccounts([hospital.address], [2, 3])
      ).to.be.revertedWith("Length mismatch");
    });

    it("Should skip duplicates and zero addresses silently", async function () {
      await accountRules.addAccount(hospital.address, 2);
      // Adding hospital again + a new account should only add the new one
      await accountRules.addAccounts(
        [hospital.address, researcher.address],
        [2, 3]
      );
      expect(await accountRules.isAccountAllowed(researcher.address)).to.be.true;
    });
  });

  describe("Remove Account", function () {
    beforeEach(async function () {
      await accountRules.addAccount(hospital.address, 2);
    });

    it("Should remove an account", async function () {
      await expect(accountRules.removeAccount(hospital.address))
        .to.emit(accountRules, "AccountRemoved")
        .withArgs(hospital.address, deployer.address);

      expect(await accountRules.isAccountAllowed(hospital.address)).to.be.false;
    });

    it("Should reject removing non-existent account", async function () {
      await expect(accountRules.removeAccount(other.address))
        .to.be.revertedWith("Account not found");
    });

    it("Should prevent removing last admin", async function () {
      // deployer and admin2 are both admins
      // Remove admin2 first (should work)
      await accountRules.removeAccount(admin2.address);
      
      // Now only deployer is admin — cannot remove
      await expect(accountRules.removeAccount(deployer.address))
        .to.be.revertedWith("Cannot remove last admin");
    });

    it("Should allow transaction after re-adding removed account", async function () {
      await accountRules.removeAccount(hospital.address);
      expect(await accountRules.transactionAllowed(
        hospital.address, ethers.ZeroAddress, 0, 0, 0, "0x"
      )).to.be.false;

      await accountRules.addAccount(hospital.address, 2);
      expect(await accountRules.transactionAllowed(
        hospital.address, ethers.ZeroAddress, 0, 0, 0, "0x"
      )).to.be.true;
    });
  });

  describe("Update Account Type", function () {
    beforeEach(async function () {
      await accountRules.addAccount(hospital.address, 2);
    });

    it("Should update account type", async function () {
      await expect(accountRules.updateAccountType(hospital.address, 3))
        .to.emit(accountRules, "AccountTypeUpdated")
        .withArgs(hospital.address, 2, 3);

      expect(await accountRules.accountTypes(hospital.address)).to.equal(3);
    });

    it("Should reject updating non-existent account", async function () {
      await expect(accountRules.updateAccountType(other.address, 3))
        .to.be.revertedWith("Account not found");
    });
  });

  describe("View Functions", function () {
    it("Should return all accounts", async function () {
      await accountRules.addAccount(hospital.address, 2);
      await accountRules.addAccount(researcher.address, 3);

      const accounts = await accountRules.getAllAccounts();
      // deployer + admin2 + hospital + researcher
      expect(accounts.length).to.be.gte(3);
    });

    it("Should return correct account count", async function () {
      const initialCount = await accountRules.getAccountCount();
      await accountRules.addAccount(hospital.address, 2);
      expect(await accountRules.getAccountCount()).to.equal(initialCount + 1n);
    });

    it("Should return correct account type", async function () {
      await accountRules.addAccount(hospital.address, 2);
      expect(await accountRules.getAccountType(hospital.address)).to.equal(2);
    });

    it("Should return Unknown for non-registered account", async function () {
      expect(await accountRules.getAccountType(other.address)).to.equal(0); // Unknown
    });
  });
});
