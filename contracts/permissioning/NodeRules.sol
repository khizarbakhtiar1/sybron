// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title NodeRules
 * @dev On-chain node permissioning for Sybron Health Chain
 * @notice Only whitelisted nodes can join the network and participate in consensus
 * 
 * This contract is called by Besu nodes when a peer tries to connect.
 * If connectionAllowed() returns false, the connection is rejected.
 */
contract NodeRules is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    struct Node {
        bytes32 enodeHigh;      // First 32 bytes of enode public key
        bytes32 enodeLow;       // Last 32 bytes of enode public key
        NodeType nodeType;
        string organizationName;
        bool isActive;
        uint256 addedAt;
    }
    
    enum NodeType {
        Unknown,
        Validator,          // Can produce blocks (hospitals, research institutions)
        Observer,           // Can read but not validate (regulators, auditors)
        Bootnode           // Network bootstrap node
    }
    
    // Node storage: keccak256(enodeHigh, enodeLow) => Node
    mapping(bytes32 => Node) public nodes;
    bytes32[] private nodeIds;
    
    // Track validators separately for quick access
    bytes32[] private validatorNodeIds;
    
    // Events
    event NodeAdded(bytes32 indexed nodeId, NodeType nodeType, string organization);
    event NodeRemoved(bytes32 indexed nodeId);
    event NodeTypeUpdated(bytes32 indexed nodeId, NodeType oldType, NodeType newType);
    event NodeDeactivated(bytes32 indexed nodeId);
    event NodeReactivated(bytes32 indexed nodeId);
    
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }
    
    /**
     * @dev Called by Besu to check if a node connection is allowed
     * @param enodeHigh First 32 bytes of the enode public key
     * @param enodeLow Last 32 bytes of the enode public key
     * @return True if the connection should be allowed
     */
    function connectionAllowed(
        bytes32 enodeHigh,
        bytes32 enodeLow,
        bytes16, // enodeHost (IP)
        uint16   // enodePort
    ) external view returns (bool) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        return nodes[nodeId].isActive;
    }
    
    /**
     * @dev Add a node to the network
     * @param enodeHigh First 32 bytes of enode public key
     * @param enodeLow Last 32 bytes of enode public key
     * @param nodeType Type of node (Validator, Observer, Bootnode)
     * @param organizationName Name of the organization running this node
     */
    function addNode(
        bytes32 enodeHigh,
        bytes32 enodeLow,
        NodeType nodeType,
        string calldata organizationName
    ) external onlyRole(ADMIN_ROLE) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        require(!nodes[nodeId].isActive, "Node already exists");
        require(bytes(organizationName).length > 0, "Organization name required");
        
        nodes[nodeId] = Node({
            enodeHigh: enodeHigh,
            enodeLow: enodeLow,
            nodeType: nodeType,
            organizationName: organizationName,
            isActive: true,
            addedAt: block.timestamp
        });
        
        nodeIds.push(nodeId);
        
        if (nodeType == NodeType.Validator) {
            validatorNodeIds.push(nodeId);
        }
        
        emit NodeAdded(nodeId, nodeType, organizationName);
    }
    
    /**
     * @dev Remove a node from the network
     */
    function removeNode(bytes32 enodeHigh, bytes32 enodeLow) external onlyRole(ADMIN_ROLE) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        require(nodes[nodeId].isActive, "Node not found");
        
        // Don't allow removing last validator
        if (nodes[nodeId].nodeType == NodeType.Validator) {
            require(validatorNodeIds.length > 1, "Cannot remove last validator");
            _removeFromValidators(nodeId);
        }
        
        nodes[nodeId].isActive = false;
        emit NodeRemoved(nodeId);
    }
    
    /**
     * @dev Temporarily deactivate a node
     */
    function deactivateNode(bytes32 enodeHigh, bytes32 enodeLow) external onlyRole(ADMIN_ROLE) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        require(nodes[nodeId].isActive, "Node not active");
        
        if (nodes[nodeId].nodeType == NodeType.Validator) {
            require(validatorNodeIds.length > 1, "Cannot deactivate last validator");
        }
        
        nodes[nodeId].isActive = false;
        emit NodeDeactivated(nodeId);
    }
    
    /**
     * @dev Reactivate a deactivated node
     */
    function reactivateNode(bytes32 enodeHigh, bytes32 enodeLow) external onlyRole(ADMIN_ROLE) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        require(nodes[nodeId].addedAt > 0, "Node not found");
        require(!nodes[nodeId].isActive, "Node already active");
        
        nodes[nodeId].isActive = true;
        emit NodeReactivated(nodeId);
    }
    
    /**
     * @dev Check if a node is allowed
     */
    function isNodeAllowed(bytes32 enodeHigh, bytes32 enodeLow) external view returns (bool) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        return nodes[nodeId].isActive;
    }
    
    /**
     * @dev Get node details
     */
    function getNode(bytes32 enodeHigh, bytes32 enodeLow) external view returns (Node memory) {
        bytes32 nodeId = keccak256(abi.encodePacked(enodeHigh, enodeLow));
        return nodes[nodeId];
    }
    
    /**
     * @dev Get all node IDs
     */
    function getAllNodeIds() external view returns (bytes32[] memory) {
        return nodeIds;
    }
    
    /**
     * @dev Get validator node IDs
     */
    function getValidatorNodeIds() external view returns (bytes32[] memory) {
        return validatorNodeIds;
    }
    
    /**
     * @dev Get count of active nodes
     */
    function getActiveNodeCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < nodeIds.length; i++) {
            if (nodes[nodeIds[i]].isActive) {
                count++;
            }
        }
    }
    
    /**
     * @dev Get count of validators
     */
    function getValidatorCount() external view returns (uint256) {
        return validatorNodeIds.length;
    }
    
    function _removeFromValidators(bytes32 nodeId) internal {
        for (uint256 i = 0; i < validatorNodeIds.length; i++) {
            if (validatorNodeIds[i] == nodeId) {
                validatorNodeIds[i] = validatorNodeIds[validatorNodeIds.length - 1];
                validatorNodeIds.pop();
                break;
            }
        }
    }
}
