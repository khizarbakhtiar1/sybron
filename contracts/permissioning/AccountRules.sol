// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AccountRules
 * @dev On-chain account permissioning for Sybron Health Chain
 * @notice Only whitelisted accounts can send transactions on this network
 * 
 * This contract is called by Besu nodes before accepting any transaction.
 * If transactionAllowed() returns false, the transaction is rejected at the node level.
 */
contract AccountRules is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // Whitelisted accounts that can transact
    mapping(address => bool) private allowedAccounts;
    address[] private accountList;
    
    // Account types for granular control
    enum AccountType {
        Unknown,
        Admin,
        Hospital,
        ResearchInstitution,
        Regulator,
        Patient,
        ServiceAccount
    }
    
    mapping(address => AccountType) public accountTypes;
    
    // Events
    event AccountAdded(address indexed account, AccountType accountType, address indexed addedBy);
    event AccountRemoved(address indexed account, address indexed removedBy);
    event AccountTypeUpdated(address indexed account, AccountType oldType, AccountType newType);
    
    constructor(address[] memory initialAdmins) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        
        // Add initial admins
        for (uint256 i = 0; i < initialAdmins.length; i++) {
            _addAccount(initialAdmins[i], AccountType.Admin);
            _grantRole(ADMIN_ROLE, initialAdmins[i]);
        }
        
        // Always allow the deployer
        _addAccount(msg.sender, AccountType.Admin);
    }
    
    /**
     * @dev Called by Besu to check if a transaction is allowed
     * @param sender The address sending the transaction
     * @return True if the transaction should be allowed
     */
    function transactionAllowed(
        address sender,
        address, // target
        uint256, // value
        uint256, // gasPrice
        uint256, // gasLimit
        bytes calldata // payload
    ) external view returns (bool) {
        return allowedAccounts[sender];
    }
    
    /**
     * @dev Add an account to the whitelist
     */
    function addAccount(address account, AccountType accountType) external onlyRole(ADMIN_ROLE) {
        require(!allowedAccounts[account], "Account already exists");
        require(account != address(0), "Invalid address");
        
        _addAccount(account, accountType);
        emit AccountAdded(account, accountType, msg.sender);
    }
    
    /**
     * @dev Add multiple accounts at once
     */
    function addAccounts(address[] calldata accounts, AccountType[] calldata types) external onlyRole(ADMIN_ROLE) {
        require(accounts.length == types.length, "Length mismatch");
        
        for (uint256 i = 0; i < accounts.length; i++) {
            if (!allowedAccounts[accounts[i]] && accounts[i] != address(0)) {
                _addAccount(accounts[i], types[i]);
                emit AccountAdded(accounts[i], types[i], msg.sender);
            }
        }
    }
    
    /**
     * @dev Remove an account from the whitelist
     */
    function removeAccount(address account) external onlyRole(ADMIN_ROLE) {
        require(allowedAccounts[account], "Account not found");
        require(accountTypes[account] != AccountType.Admin || _countAdmins() > 1, "Cannot remove last admin");
        
        allowedAccounts[account] = false;
        accountTypes[account] = AccountType.Unknown;
        
        // Remove from list (swap and pop)
        for (uint256 i = 0; i < accountList.length; i++) {
            if (accountList[i] == account) {
                accountList[i] = accountList[accountList.length - 1];
                accountList.pop();
                break;
            }
        }
        
        emit AccountRemoved(account, msg.sender);
    }
    
    /**
     * @dev Update account type
     */
    function updateAccountType(address account, AccountType newType) external onlyRole(ADMIN_ROLE) {
        require(allowedAccounts[account], "Account not found");
        
        AccountType oldType = accountTypes[account];
        accountTypes[account] = newType;
        
        emit AccountTypeUpdated(account, oldType, newType);
    }
    
    /**
     * @dev Check if an account is allowed
     */
    function isAccountAllowed(address account) external view returns (bool) {
        return allowedAccounts[account];
    }
    
    /**
     * @dev Get account type
     */
    function getAccountType(address account) external view returns (AccountType) {
        return accountTypes[account];
    }
    
    /**
     * @dev Get all allowed accounts
     */
    function getAllAccounts() external view returns (address[] memory) {
        return accountList;
    }
    
    /**
     * @dev Get count of allowed accounts
     */
    function getAccountCount() external view returns (uint256) {
        return accountList.length;
    }
    
    function _addAccount(address account, AccountType accountType) internal {
        allowedAccounts[account] = true;
        accountTypes[account] = accountType;
        accountList.push(account);
    }
    
    function _countAdmins() internal view returns (uint256 count) {
        for (uint256 i = 0; i < accountList.length; i++) {
            if (accountTypes[accountList[i]] == AccountType.Admin) {
                count++;
            }
        }
    }
}
