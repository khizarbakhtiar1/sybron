// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPatientRegistry {
    function isVerified(bytes32 patientId) external view returns (bool);
    function getPatientWallet(bytes32 patientId) external view returns (address);
    function recordEarnings(bytes32 patientId, uint256 amount) external;
    function incrementDataSets(bytes32 patientId) external;
}

interface IResearcherRegistry {
    function isVerified(bytes32 researcherId) external view returns (bool);
    function hasCategoryAccess(bytes32 researcherId, bytes32 category) external view returns (bool);
    function recordDataAccess(bytes32 researcherId, uint256 amount) external;
    function getAccessTier(bytes32 researcherId) external view returns (uint256);
}

interface IConsentManager {
    function recordAccess(bytes32 patientId, bytes32 researcherId, bytes32 dataCategory) 
        external returns (bool valid, uint256 price);
    function isConsentValid(bytes32 patientId, bytes32 researcherId, bytes32 dataCategory) 
        external view returns (bool);
}

/**
 * @title DataMarketplace
 * @dev Core marketplace for healthcare data trading
 * @notice Handles data listings, purchases, and royalty distribution
 */
contract DataMarketplace is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public healthToken;
    IPatientRegistry public patientRegistry;
    IResearcherRegistry public researcherRegistry;
    IConsentManager public consentManager;

    // Fee structure (basis points, 100 = 1%)
    uint256 public platformFeeBps = 500;  // 5% platform fee
    uint256 public constant MAX_FEE_BPS = 1500;  // Max 15% fee

    address public platformFeeRecipient;

    struct DataListing {
        bytes32 listingId;
        bytes32 patientId;
        bytes32 dataCategory;
        string encryptedDataURI;         // IPFS URI to encrypted data
        string dataDescription;
        uint256 basePrice;               // Base price in HEALTH tokens
        uint256 createdAt;
        bool isActive;
        uint256 totalAccesses;
        uint256 totalEarnings;
    }

    struct DataAccessRequest {
        bytes32 requestId;
        bytes32 researcherId;
        bytes32 listingId;
        string purpose;
        uint256 offeredPrice;
        uint256 requestedAt;
        RequestStatus status;
        string decryptionKeyURI;         // Set when approved
    }

    enum RequestStatus {
        Pending,
        Approved,
        Rejected,
        Completed,
        Cancelled
    }

    // Storage
    mapping(bytes32 => DataListing) public listings;
    mapping(bytes32 => DataAccessRequest) public accessRequests;
    mapping(bytes32 => bytes32[]) public patientListings;      // patientId => listingIds
    mapping(bytes32 => bytes32[]) public researcherRequests;   // researcherId => requestIds

    bytes32[] public allListings;
    uint256 public totalListings;
    uint256 public totalTransactions;
    uint256 public totalVolume;

    // Events
    event ListingCreated(
        bytes32 indexed listingId,
        bytes32 indexed patientId,
        bytes32 indexed dataCategory,
        uint256 basePrice
    );
    event ListingUpdated(bytes32 indexed listingId, uint256 newPrice, bool isActive);
    event ListingDeactivated(bytes32 indexed listingId);
    
    event AccessRequested(
        bytes32 indexed requestId,
        bytes32 indexed researcherId,
        bytes32 indexed listingId,
        uint256 offeredPrice
    );
    event AccessApproved(bytes32 indexed requestId, string decryptionKeyURI);
    event AccessRejected(bytes32 indexed requestId, string reason);
    event AccessCompleted(bytes32 indexed requestId, uint256 patientPayout, uint256 platformFee);
    
    event PaymentProcessed(
        bytes32 indexed patientId,
        bytes32 indexed researcherId,
        uint256 amount,
        uint256 platformFee
    );

    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    constructor(
        address admin,
        address _healthToken,
        address _patientRegistry,
        address _researcherRegistry,
        address _consentManager,
        address _platformFeeRecipient
    ) {
        require(admin != address(0), "Invalid admin address");
        require(_healthToken != address(0), "Invalid token address");
        require(_patientRegistry != address(0), "Invalid patient registry");
        require(_researcherRegistry != address(0), "Invalid researcher registry");
        require(_consentManager != address(0), "Invalid consent manager");
        require(_platformFeeRecipient != address(0), "Invalid fee recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        healthToken = IERC20(_healthToken);
        patientRegistry = IPatientRegistry(_patientRegistry);
        researcherRegistry = IResearcherRegistry(_researcherRegistry);
        consentManager = IConsentManager(_consentManager);
        platformFeeRecipient = _platformFeeRecipient;
    }

    /**
     * @dev Create a new data listing
     */
    function createListing(
        bytes32 listingId,
        bytes32 patientId,
        bytes32 dataCategory,
        string calldata encryptedDataURI,
        string calldata dataDescription,
        uint256 basePrice
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(listings[listingId].createdAt == 0, "Listing exists");
        require(patientRegistry.isVerified(patientId), "Patient not verified");
        require(basePrice > 0, "Price must be positive");

        listings[listingId] = DataListing({
            listingId: listingId,
            patientId: patientId,
            dataCategory: dataCategory,
            encryptedDataURI: encryptedDataURI,
            dataDescription: dataDescription,
            basePrice: basePrice,
            createdAt: block.timestamp,
            isActive: true,
            totalAccesses: 0,
            totalEarnings: 0
        });

        patientListings[patientId].push(listingId);
        allListings.push(listingId);
        totalListings++;

        patientRegistry.incrementDataSets(patientId);

        emit ListingCreated(listingId, patientId, dataCategory, basePrice);
    }

    /**
     * @dev Request access to a data listing
     */
    function requestAccess(
        bytes32 requestId,
        bytes32 researcherId,
        bytes32 listingId,
        string calldata purpose,
        uint256 offeredPrice
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        require(accessRequests[requestId].requestedAt == 0, "Request exists");
        require(researcherRegistry.isVerified(researcherId), "Researcher not verified");
        
        DataListing memory listing = listings[listingId];
        require(listing.isActive, "Listing not active");
        require(offeredPrice >= listing.basePrice, "Price too low");

        // Check researcher has category access
        require(
            researcherRegistry.hasCategoryAccess(researcherId, listing.dataCategory),
            "No category access"
        );

        accessRequests[requestId] = DataAccessRequest({
            requestId: requestId,
            researcherId: researcherId,
            listingId: listingId,
            purpose: purpose,
            offeredPrice: offeredPrice,
            requestedAt: block.timestamp,
            status: RequestStatus.Pending,
            decryptionKeyURI: ""
        });

        researcherRequests[researcherId].push(requestId);

        emit AccessRequested(requestId, researcherId, listingId, offeredPrice);
    }

    /**
     * @dev Approve access request (requires patient consent)
     */
    function approveAccess(
        bytes32 requestId,
        string calldata decryptionKeyURI
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        DataAccessRequest storage request = accessRequests[requestId];
        require(request.status == RequestStatus.Pending, "Not pending");

        DataListing memory listing = listings[request.listingId];

        // Verify consent
        require(
            consentManager.isConsentValid(listing.patientId, request.researcherId, listing.dataCategory),
            "No valid consent"
        );

        request.status = RequestStatus.Approved;
        request.decryptionKeyURI = decryptionKeyURI;

        emit AccessApproved(requestId, decryptionKeyURI);
    }

    /**
     * @dev Complete access and process payment
     */
    function completeAccess(bytes32 requestId) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        DataAccessRequest storage request = accessRequests[requestId];
        require(request.status == RequestStatus.Approved, "Not approved");

        DataListing storage listing = listings[request.listingId];

        // Record consent access
        (bool valid, uint256 price) = consentManager.recordAccess(
            listing.patientId,
            request.researcherId,
            listing.dataCategory
        );
        require(valid, "Consent no longer valid");

        // Use offered price if higher than consent price
        uint256 finalPrice = request.offeredPrice > price ? request.offeredPrice : price;

        // Calculate fees
        uint256 platformFee = (finalPrice * platformFeeBps) / 10000;
        uint256 patientPayout = finalPrice - platformFee;

        // Get patient wallet
        address patientWallet = patientRegistry.getPatientWallet(listing.patientId);
        require(patientWallet != address(0), "Invalid patient wallet");

        // Transfer tokens
        // Note: Researcher must have approved this contract for token transfer
        healthToken.safeTransferFrom(msg.sender, patientWallet, patientPayout);
        healthToken.safeTransferFrom(msg.sender, platformFeeRecipient, platformFee);

        // Update records
        request.status = RequestStatus.Completed;
        listing.totalAccesses++;
        listing.totalEarnings += patientPayout;
        totalTransactions++;
        totalVolume += finalPrice;

        // Update registries
        patientRegistry.recordEarnings(listing.patientId, patientPayout);
        researcherRegistry.recordDataAccess(request.researcherId, finalPrice);

        emit AccessCompleted(requestId, patientPayout, platformFee);
        emit PaymentProcessed(listing.patientId, request.researcherId, finalPrice, platformFee);
    }

    /**
     * @dev Reject access request
     */
    function rejectAccess(
        bytes32 requestId,
        string calldata reason
    ) external onlyRole(OPERATOR_ROLE) {
        DataAccessRequest storage request = accessRequests[requestId];
        require(request.status == RequestStatus.Pending, "Not pending");

        request.status = RequestStatus.Rejected;
        emit AccessRejected(requestId, reason);
    }

    /**
     * @dev Update listing price
     */
    function updateListing(
        bytes32 listingId,
        uint256 newPrice,
        bool isActive
    ) external onlyRole(OPERATOR_ROLE) {
        require(listings[listingId].createdAt > 0, "Listing not found");
        require(newPrice > 0, "Price must be positive");

        listings[listingId].basePrice = newPrice;
        listings[listingId].isActive = isActive;

        emit ListingUpdated(listingId, newPrice, isActive);
    }

    /**
     * @dev Deactivate listing
     */
    function deactivateListing(bytes32 listingId) external onlyRole(OPERATOR_ROLE) {
        require(listings[listingId].createdAt > 0, "Listing not found");
        listings[listingId].isActive = false;
        emit ListingDeactivated(listingId);
    }

    /**
     * @dev Update platform fee
     */
    function updatePlatformFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFeeBps = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(oldFeeBps, newFeeBps);
    }

    /**
     * @dev Get patient's listings
     */
    function getPatientListings(bytes32 patientId) external view returns (bytes32[] memory) {
        return patientListings[patientId];
    }

    /**
     * @dev Get researcher's requests
     */
    function getResearcherRequests(bytes32 researcherId) external view returns (bytes32[] memory) {
        return researcherRequests[researcherId];
    }

    /**
     * @dev Get marketplace stats
     */
    function getStats() external view returns (
        uint256 _totalListings,
        uint256 _totalTransactions,
        uint256 _totalVolume
    ) {
        return (totalListings, totalTransactions, totalVolume);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
