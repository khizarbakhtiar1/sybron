// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title HealthToken
 * @dev The native utility token for Sybron Health Chain
 * @notice Used for:
 *   - Paying for data access
 *   - Patient rewards/royalties
 *   - Staking for researchers
 *   - Governance (future)
 */
contract HealthToken is ERC20, ERC20Burnable, AccessControl, ERC20Permit {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million initial

    // Treasury allocation percentages (basis points, 100 = 1%)
    uint256 public constant PATIENT_REWARDS_ALLOCATION = 4000; // 40%
    uint256 public constant RESEARCH_GRANTS_ALLOCATION = 3000; // 30%
    uint256 public constant OPERATIONS_ALLOCATION = 2000; // 20%
    uint256 public constant RESERVE_ALLOCATION = 1000; // 10%

    // Treasury addresses
    address public patientRewardsPool;
    address public researchGrantsPool;
    address public operationsWallet;
    address public reserveWallet;

    event TreasuryAddressesUpdated(
        address patientRewards,
        address researchGrants,
        address operations,
        address reserve
    );

    constructor(
        address admin,
        address _patientRewardsPool,
        address _researchGrantsPool,
        address _operationsWallet,
        address _reserveWallet
    ) ERC20("Sybron Health Token", "HEALTH") ERC20Permit("Sybron Health Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);

        patientRewardsPool = _patientRewardsPool;
        researchGrantsPool = _researchGrantsPool;
        operationsWallet = _operationsWallet;
        reserveWallet = _reserveWallet;

        // Mint initial supply and distribute to treasury pools
        _distributeInitialSupply();
    }

    function _distributeInitialSupply() internal {
        uint256 patientAmount = (INITIAL_SUPPLY * PATIENT_REWARDS_ALLOCATION) / 10000;
        uint256 researchAmount = (INITIAL_SUPPLY * RESEARCH_GRANTS_ALLOCATION) / 10000;
        uint256 operationsAmount = (INITIAL_SUPPLY * OPERATIONS_ALLOCATION) / 10000;
        uint256 reserveAmount = (INITIAL_SUPPLY * RESERVE_ALLOCATION) / 10000;

        _mint(patientRewardsPool, patientAmount);
        _mint(researchGrantsPool, researchAmount);
        _mint(operationsWallet, operationsAmount);
        _mint(reserveWallet, reserveAmount);
    }

    /**
     * @dev Mint new tokens (only by MINTER_ROLE, respects MAX_SUPPLY)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "HealthToken: max supply exceeded");
        _mint(to, amount);
    }

    /**
     * @dev Update treasury addresses
     */
    function updateTreasuryAddresses(
        address _patientRewardsPool,
        address _researchGrantsPool,
        address _operationsWallet,
        address _reserveWallet
    ) external onlyRole(TREASURY_ROLE) {
        require(_patientRewardsPool != address(0), "Invalid patient rewards address");
        require(_researchGrantsPool != address(0), "Invalid research grants address");
        require(_operationsWallet != address(0), "Invalid operations address");
        require(_reserveWallet != address(0), "Invalid reserve address");

        patientRewardsPool = _patientRewardsPool;
        researchGrantsPool = _researchGrantsPool;
        operationsWallet = _operationsWallet;
        reserveWallet = _reserveWallet;

        emit TreasuryAddressesUpdated(
            _patientRewardsPool,
            _researchGrantsPool,
            _operationsWallet,
            _reserveWallet
        );
    }
}
