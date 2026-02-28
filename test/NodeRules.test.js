const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NodeRules", function () {
  let nodeRules;
  let admin, other;
  // Sample enode key parts (64-byte public key split into two 32-byte halves)
  const enodeHigh1 = ethers.keccak256(ethers.toUtf8Bytes("node1-high"));
  const enodeLow1 = ethers.keccak256(ethers.toUtf8Bytes("node1-low"));
  const enodeHigh2 = ethers.keccak256(ethers.toUtf8Bytes("node2-high"));
  const enodeLow2 = ethers.keccak256(ethers.toUtf8Bytes("node2-low"));
  const enodeHigh3 = ethers.keccak256(ethers.toUtf8Bytes("node3-high"));
  const enodeLow3 = ethers.keccak256(ethers.toUtf8Bytes("node3-low"));

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();

    const NodeRules = await ethers.getContractFactory("NodeRules");
    nodeRules = await NodeRules.deploy(admin.address);
    await nodeRules.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set admin roles", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));

      expect(await nodeRules.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await nodeRules.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Add Node", function () {
    it("Should add a validator node", async function () {
      await expect(
        nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Sybron Foundation") // Validator
      ).to.emit(nodeRules, "NodeAdded");

      expect(await nodeRules.isNodeAllowed(enodeHigh1, enodeLow1)).to.be.true;
    });

    it("Should store node details correctly", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Hospital A");

      const node = await nodeRules.getNode(enodeHigh1, enodeLow1);
      expect(node.enodeHigh).to.equal(enodeHigh1);
      expect(node.enodeLow).to.equal(enodeLow1);
      expect(node.nodeType).to.equal(1); // Validator
      expect(node.organizationName).to.equal("Hospital A");
      expect(node.isActive).to.be.true;
      expect(node.addedAt).to.be.gt(0);
    });

    it("Should add an observer node", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 2, "Regulator"); // Observer

      const node = await nodeRules.getNode(enodeHigh1, enodeLow1);
      expect(node.nodeType).to.equal(2);
    });

    it("Should add a bootnode", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 3, "Bootstrap"); // Bootnode

      const node = await nodeRules.getNode(enodeHigh1, enodeLow1);
      expect(node.nodeType).to.equal(3);
    });

    it("Should track validator nodes separately", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Validator 1");
      await nodeRules.addNode(enodeHigh2, enodeLow2, 2, "Observer 1"); // Not a validator

      expect(await nodeRules.getValidatorCount()).to.equal(1);
    });

    it("Should reject adding existing active node", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Node 1");
      await expect(
        nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Node 1 again")
      ).to.be.revertedWith("Node already exists");
    });

    it("Should reject empty organization name", async function () {
      await expect(
        nodeRules.addNode(enodeHigh1, enodeLow1, 1, "")
      ).to.be.revertedWith("Organization name required");
    });

    it("Should reject non-admin caller", async function () {
      await expect(
        nodeRules.connect(other).addNode(enodeHigh1, enodeLow1, 1, "Node")
      ).to.be.reverted;
    });
  });

  describe("Connection Allowed", function () {
    it("Should allow connection for active node", async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Node 1");

      expect(await nodeRules.connectionAllowed(
        enodeHigh1, enodeLow1,
        "0x00000000000000000000000000000001", // host
        30303 // port
      )).to.be.true;
    });

    it("Should reject connection for unknown node", async function () {
      expect(await nodeRules.connectionAllowed(
        enodeHigh1, enodeLow1,
        "0x00000000000000000000000000000001",
        30303
      )).to.be.false;
    });
  });

  describe("Remove Node", function () {
    beforeEach(async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Validator 1");
      await nodeRules.addNode(enodeHigh2, enodeLow2, 1, "Validator 2");
    });

    it("Should remove a node", async function () {
      await expect(nodeRules.removeNode(enodeHigh1, enodeLow1))
        .to.emit(nodeRules, "NodeRemoved");

      expect(await nodeRules.isNodeAllowed(enodeHigh1, enodeLow1)).to.be.false;
    });

    it("Should remove node from validator list", async function () {
      await nodeRules.removeNode(enodeHigh1, enodeLow1);
      expect(await nodeRules.getValidatorCount()).to.equal(1);
    });

    it("Should reject removing non-existent node", async function () {
      await expect(
        nodeRules.removeNode(enodeHigh3, enodeLow3)
      ).to.be.revertedWith("Node not found");
    });

    it("Should prevent removing last validator", async function () {
      await nodeRules.removeNode(enodeHigh1, enodeLow1); // Remove first
      await expect(
        nodeRules.removeNode(enodeHigh2, enodeLow2) // Try to remove last
      ).to.be.revertedWith("Cannot remove last validator");
    });
  });

  describe("Deactivate / Reactivate", function () {
    beforeEach(async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Validator 1");
      await nodeRules.addNode(enodeHigh2, enodeLow2, 1, "Validator 2");
    });

    it("Should deactivate a node", async function () {
      await expect(nodeRules.deactivateNode(enodeHigh1, enodeLow1))
        .to.emit(nodeRules, "NodeDeactivated");

      expect(await nodeRules.isNodeAllowed(enodeHigh1, enodeLow1)).to.be.false;
    });

    it("Should reactivate a deactivated node", async function () {
      await nodeRules.deactivateNode(enodeHigh1, enodeLow1);
      await expect(nodeRules.reactivateNode(enodeHigh1, enodeLow1))
        .to.emit(nodeRules, "NodeReactivated");

      expect(await nodeRules.isNodeAllowed(enodeHigh1, enodeLow1)).to.be.true;
    });

    it("Should reject deactivating inactive node", async function () {
      await nodeRules.deactivateNode(enodeHigh1, enodeLow1);
      await expect(
        nodeRules.deactivateNode(enodeHigh1, enodeLow1)
      ).to.be.revertedWith("Node not active");
    });

    it("Should reject reactivating active node", async function () {
      await expect(
        nodeRules.reactivateNode(enodeHigh1, enodeLow1)
      ).to.be.revertedWith("Node already active");
    });

    it("Should reject reactivating non-existent node", async function () {
      await expect(
        nodeRules.reactivateNode(enodeHigh3, enodeLow3)
      ).to.be.revertedWith("Node not found");
    });

    it("Should prevent deactivating last validator", async function () {
      await nodeRules.deactivateNode(enodeHigh1, enodeLow1);
      await expect(
        nodeRules.deactivateNode(enodeHigh2, enodeLow2)
      ).to.be.revertedWith("Cannot deactivate last validator");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await nodeRules.addNode(enodeHigh1, enodeLow1, 1, "Validator 1");
      await nodeRules.addNode(enodeHigh2, enodeLow2, 2, "Observer 1");
    });

    it("Should return all node IDs", async function () {
      const nodeIds = await nodeRules.getAllNodeIds();
      expect(nodeIds.length).to.equal(2);
    });

    it("Should return validator node IDs only", async function () {
      const validatorIds = await nodeRules.getValidatorNodeIds();
      expect(validatorIds.length).to.equal(1);
    });

    it("Should return active node count", async function () {
      expect(await nodeRules.getActiveNodeCount()).to.equal(2);
    });

    it("Should return correct active count after deactivation", async function () {
      await nodeRules.deactivateNode(enodeHigh2, enodeLow2);
      expect(await nodeRules.getActiveNodeCount()).to.equal(1);
    });

    it("Should return validator count", async function () {
      expect(await nodeRules.getValidatorCount()).to.equal(1);
    });
  });
});
