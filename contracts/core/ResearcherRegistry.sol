// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ResearcherRegistry
 * @dev Manages researcher/institution registration and reputation
 * @notice Only verified researchers can access patient data
 */
contract ResearcherRegistry is AccessControl, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum ResearcherType {
        Individual,
        Institution,
        Pharmaceutical,
        Government,
        NonProfit
    }

    enum ResearcherStatus {
        Unregistered,
        Pending,
        Verified,
        Suspended,
        Revoked
    }

    struct Researcher {
        bytes32 researcherId;
        address walletAddress;
        ResearcherType researcherType;
        ResearcherStatus status;
        uint256 registeredAt;
        uint256 verifiedAt;
        string institutionName;
        string encryptedCredentialsURI;  // IPFS URI to encrypted credentials/licenses
        uint256 reputationScore;          // 0-10000 (basis points)
        uint256 totalDataAccesses;
        uint256 totalSpent;
        uint256 successfulStudies;
        uint256 ethicsViolations;
        bytes32[] approvedCategories;     // Data categories they can access
    }

    struct AccessTier {
        string name;
        uint256 requiredReputation;
        uint256 maxConcurrentAccess;
        uint256 discountBps;  // Discount in basis points
    }

    mapping(bytes32 => Researcher) public researchers;
    mapping(address => bytes32) public walletToResearcherId;
    mapping(uint256 => AccessTier) public accessTiers;

    uint256 public totalResearchers;
    uint256 public verifiedResearchers;
    uint256 public constant INITIAL_REPUTATION = 5000; // Start at 50%
    uint256 public constant MAX_REPUTATION = 10000;

    event ResearcherRegistered(
        bytes32 indexed researcherId,
        address indexed wallet,
        ResearcherType researcherType,
        string institutionName
    );
    event ResearcherVerified(bytes32 indexed researcherId, address indexed verifier);
    event ResearcherSuspended(bytes32 indexed researcherId, string reason);
    event ResearcherRevoked(bytes32 indexed researcherId, string reason);
    event ReputationUpdated(bytes32 indexed researcherId, uint256 oldScore, uint256 newScore);
    event CategoryApproved(bytes32 indexed researcherId, bytes32 category);
    event CategoryRevoked(bytes32 indexed researcherId, bytes32 category);
    event EthicsViolationRecorded(bytes32 indexed researcherId, string details);
    event StudyCompleted(bytes32 indexed researcherId, bool successful);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);

        // Initialize access tiers
        accessTiers[1] = AccessTier("Bronze", 0, 10, 0);
        accessTiers[2] = AccessTier("Silver", 3000, 50, 500);    // 5% discount
        accessTiers[3] = AccessTier("Gold", 6000, 200, 1000);    // 10% discount
        accessTiers[4] = AccessTier("Platinum", 8500, 1000, 1500); // 15% discount
    }

    /**
     * @dev Register a new researcher/institution
     */
    function registerResearcher(
        bytes32 researcherId,
        address wallet,
        ResearcherType researcherType,
        string calldata institutionName,
        string calldata encryptedCredentialsURI
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused {
        require(researchers[researcherId].status == ResearcherStatus.Unregistered, "Researcher exists");
        require(walletToResearcherId[wallet] == bytes32(0), "Wallet already registered");
        require(wallet != address(0), "Invalid wallet");
        require(bytes(institutionName).length > 0, "Institution name required");

        researchers[researcherId] = Researcher({
            researcherId: researcherId,
            walletAddress: wallet,
            researcherType: researcherType,
            status: ResearcherStatus.Pending,
            registeredAt: block.timestamp,
            verifiedAt: 0,
            institutionName: institutionName,
            encryptedCredentialsURI: encryptedCredentialsURI,
            reputationScore: INITIAL_REPUTATION,
            totalDataAccesses: 0,
            totalSpent: 0,
            successfulStudies: 0,
            ethicsViolations: 0,
            approvedCategories: new bytes32[](0)
        });

        walletToResearcherId[wallet] = researcherId;
        totalResearchers++;

        emit ResearcherRegistered(researcherId, wallet, researcherType, institutionName);
    }

    /**
     * @dev Verify a researcher
     */
    function verifyResearcher(bytes32 researcherId) external onlyRole(VERIFIER_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Pending, "Not pending");

        researchers[researcherId].status = ResearcherStatus.Verified;
        researchers[researcherId].verifiedAt = block.timestamp;
        verifiedResearchers++;

        emit ResearcherVerified(researcherId, msg.sender);
    }

    /**
     * @dev Approve researcher for a data category
     */
    function approveCategory(
        bytes32 researcherId,
        bytes32 category
    ) external onlyRole(VERIFIER_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Verified, "Not verified");

        researchers[researcherId].approvedCategories.push(category);
        emit CategoryApproved(researcherId, category);
    }

    /**
     * @dev Update reputation score
     */
    function updateReputation(
        bytes32 researcherId,
        int256 change
    ) external onlyRole(REGISTRAR_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Verified, "Not verified");

        uint256 oldScore = researchers[researcherId].reputationScore;
        uint256 newScore;

        if (change < 0) {
            uint256 decrease = uint256(-change);
            newScore = oldScore > decrease ? oldScore - decrease : 0;
        } else {
            newScore = oldScore + uint256(change);
            if (newScore > MAX_REPUTATION) {
                newScore = MAX_REPUTATION;
            }
        }

        researchers[researcherId].reputationScore = newScore;
        emit ReputationUpdated(researcherId, oldScore, newScore);
    }

    /**
     * @dev Record an ethics violation
     */
    function recordEthicsViolation(
        bytes32 researcherId,
        string calldata details,
        uint256 reputationPenalty
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(researchers[researcherId].status != ResearcherStatus.Unregistered, "Not found");

        researchers[researcherId].ethicsViolations++;
        
        uint256 oldScore = researchers[researcherId].reputationScore;
        uint256 newScore = oldScore > reputationPenalty ? oldScore - reputationPenalty : 0;
        researchers[researcherId].reputationScore = newScore;

        emit EthicsViolationRecorded(researcherId, details);
        emit ReputationUpdated(researcherId, oldScore, newScore);

        // Auto-suspend on 3+ violations
        if (researchers[researcherId].ethicsViolations >= 3) {
            researchers[researcherId].status = ResearcherStatus.Suspended;
            verifiedResearchers--;
            emit ResearcherSuspended(researcherId, "Multiple ethics violations");
        }
    }

    /**
     * @dev Record data access (called by marketplace)
     */
    function recordDataAccess(
        bytes32 researcherId,
        uint256 amount
    ) external onlyRole(REGISTRAR_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Verified, "Not verified");

        researchers[researcherId].totalDataAccesses++;
        researchers[researcherId].totalSpent += amount;
    }

    /**
     * @dev Record study completion
     */
    function recordStudyCompletion(
        bytes32 researcherId,
        bool successful
    ) external onlyRole(REGISTRAR_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Verified, "Not verified");

        if (successful) {
            researchers[researcherId].successfulStudies++;
            // Boost reputation for successful studies
            uint256 oldScore = researchers[researcherId].reputationScore;
            uint256 newScore = oldScore + 100;
            if (newScore > MAX_REPUTATION) newScore = MAX_REPUTATION;
            researchers[researcherId].reputationScore = newScore;
            emit ReputationUpdated(researcherId, oldScore, newScore);
        }

        emit StudyCompleted(researcherId, successful);
    }

    /**
     * @dev Get researcher's access tier
     */
    function getAccessTier(bytes32 researcherId) external view returns (uint256) {
        uint256 reputation = researchers[researcherId].reputationScore;

        if (reputation >= accessTiers[4].requiredReputation) return 4;
        if (reputation >= accessTiers[3].requiredReputation) return 3;
        if (reputation >= accessTiers[2].requiredReputation) return 2;
        return 1;
    }

    /**
     * @dev Check if researcher is verified
     */
    function isVerified(bytes32 researcherId) external view returns (bool) {
        return researchers[researcherId].status == ResearcherStatus.Verified;
    }

    /**
     * @dev Check if researcher has category access
     */
    function hasCategoryAccess(
        bytes32 researcherId,
        bytes32 category
    ) external view returns (bool) {
        bytes32[] memory categories = researchers[researcherId].approvedCategories;
        for (uint256 i = 0; i < categories.length; i++) {
            if (categories[i] == category) return true;
        }
        return false;
    }

    /**
     * @dev Suspend researcher
     */
    function suspendResearcher(
        bytes32 researcherId,
        string calldata reason
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(researchers[researcherId].status == ResearcherStatus.Verified, "Not verified");

        researchers[researcherId].status = ResearcherStatus.Suspended;
        verifiedResearchers--;

        emit ResearcherSuspended(researcherId, reason);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
