// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ConsentManager
 * @dev Manages granular patient consent for data sharing
 * @notice Patients have full control over who can access their data
 */
contract ConsentManager is AccessControl, Pausable {
    bytes32 public constant CONSENT_ADMIN_ROLE = keccak256("CONSENT_ADMIN_ROLE");

    enum ConsentStatus {
        NotSet,
        Granted,
        Revoked,
        Expired
    }

    struct Consent {
        bytes32 patientId;
        bytes32 researcherId;
        bytes32 dataCategory;
        ConsentStatus status;
        uint256 grantedAt;
        uint256 expiresAt;
        uint256 revokedAt;
        string purpose;                    // Research purpose description
        bool allowDerivativeWorks;         // Can results be used in other studies?
        bool allowCommercialUse;           // Can data be used commercially?
        bool requireNotification;          // Notify patient of data access?
        uint256 maxAccessCount;            // 0 = unlimited
        uint256 currentAccessCount;
        uint256 agreedPrice;               // Price per access in HEALTH tokens
    }

    struct ConsentTemplate {
        string name;
        uint256 defaultDuration;           // Default duration in seconds
        bool allowDerivativeWorks;
        bool allowCommercialUse;
        bool requireNotification;
        uint256 maxAccessCount;
    }

    // Consent storage: patientId => researcherId => dataCategory => Consent
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => Consent))) public consents;
    
    // Patient's global settings
    mapping(bytes32 => bool) public globalOptOut;  // Patient has opted out of all sharing
    mapping(bytes32 => uint256) public patientMinPrice;  // Minimum price patient accepts

    // Consent templates
    mapping(uint256 => ConsentTemplate) public consentTemplates;
    uint256 public templateCount;

    // Events
    event ConsentGranted(
        bytes32 indexed patientId,
        bytes32 indexed researcherId,
        bytes32 indexed dataCategory,
        uint256 expiresAt,
        string purpose
    );
    event ConsentRevoked(
        bytes32 indexed patientId,
        bytes32 indexed researcherId,
        bytes32 indexed dataCategory,
        uint256 revokedAt
    );
    event ConsentExpired(
        bytes32 indexed patientId,
        bytes32 indexed researcherId,
        bytes32 indexed dataCategory
    );
    event ConsentAccessed(
        bytes32 indexed patientId,
        bytes32 indexed researcherId,
        bytes32 indexed dataCategory,
        uint256 accessCount
    );
    event GlobalOptOutSet(bytes32 indexed patientId, bool optedOut);
    event MinPriceSet(bytes32 indexed patientId, uint256 minPrice);
    event TemplateCreated(uint256 indexed templateId, string name);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONSENT_ADMIN_ROLE, admin);

        // Create default templates
        _createTemplate("Basic Research", 365 days, false, false, true, 0);
        _createTemplate("Academic Study", 180 days, true, false, true, 100);
        _createTemplate("Commercial Research", 90 days, true, true, true, 50);
        _createTemplate("One-Time Access", 30 days, false, false, true, 1);
    }

    /**
     * @dev Grant consent for a researcher to access patient data
     */
    function grantConsent(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory,
        uint256 duration,
        string calldata purpose,
        bool allowDerivativeWorks,
        bool allowCommercialUse,
        bool requireNotification,
        uint256 maxAccessCount,
        uint256 agreedPrice
    ) external onlyRole(CONSENT_ADMIN_ROLE) whenNotPaused {
        require(!globalOptOut[patientId], "Patient has opted out");
        require(agreedPrice >= patientMinPrice[patientId], "Price below minimum");
        require(duration > 0, "Duration must be positive");

        uint256 expiresAt = block.timestamp + duration;

        consents[patientId][researcherId][dataCategory] = Consent({
            patientId: patientId,
            researcherId: researcherId,
            dataCategory: dataCategory,
            status: ConsentStatus.Granted,
            grantedAt: block.timestamp,
            expiresAt: expiresAt,
            revokedAt: 0,
            purpose: purpose,
            allowDerivativeWorks: allowDerivativeWorks,
            allowCommercialUse: allowCommercialUse,
            requireNotification: requireNotification,
            maxAccessCount: maxAccessCount,
            currentAccessCount: 0,
            agreedPrice: agreedPrice
        });

        emit ConsentGranted(patientId, researcherId, dataCategory, expiresAt, purpose);
    }

    /**
     * @dev Grant consent using a template
     */
    function grantConsentFromTemplate(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory,
        uint256 templateId,
        string calldata purpose,
        uint256 agreedPrice
    ) external onlyRole(CONSENT_ADMIN_ROLE) whenNotPaused {
        require(templateId < templateCount, "Invalid template");
        require(!globalOptOut[patientId], "Patient has opted out");
        require(agreedPrice >= patientMinPrice[patientId], "Price below minimum");

        ConsentTemplate memory template = consentTemplates[templateId];
        uint256 expiresAt = block.timestamp + template.defaultDuration;

        consents[patientId][researcherId][dataCategory] = Consent({
            patientId: patientId,
            researcherId: researcherId,
            dataCategory: dataCategory,
            status: ConsentStatus.Granted,
            grantedAt: block.timestamp,
            expiresAt: expiresAt,
            revokedAt: 0,
            purpose: purpose,
            allowDerivativeWorks: template.allowDerivativeWorks,
            allowCommercialUse: template.allowCommercialUse,
            requireNotification: template.requireNotification,
            maxAccessCount: template.maxAccessCount,
            currentAccessCount: 0,
            agreedPrice: agreedPrice
        });

        emit ConsentGranted(patientId, researcherId, dataCategory, expiresAt, purpose);
    }

    /**
     * @dev Revoke consent (can be called by patient via admin)
     */
    function revokeConsent(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory
    ) external onlyRole(CONSENT_ADMIN_ROLE) {
        Consent storage consent = consents[patientId][researcherId][dataCategory];
        require(consent.status == ConsentStatus.Granted, "Consent not active");

        consent.status = ConsentStatus.Revoked;
        consent.revokedAt = block.timestamp;

        emit ConsentRevoked(patientId, researcherId, dataCategory, block.timestamp);
    }

    /**
     * @dev Record an access and check if consent is still valid
     */
    function recordAccess(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory
    ) external onlyRole(CONSENT_ADMIN_ROLE) returns (bool valid, uint256 price) {
        Consent storage consent = consents[patientId][researcherId][dataCategory];

        // Check if consent exists and is granted
        if (consent.status != ConsentStatus.Granted) {
            return (false, 0);
        }

        // Check expiration
        if (block.timestamp > consent.expiresAt) {
            consent.status = ConsentStatus.Expired;
            emit ConsentExpired(patientId, researcherId, dataCategory);
            return (false, 0);
        }

        // Check access count
        if (consent.maxAccessCount > 0 && consent.currentAccessCount >= consent.maxAccessCount) {
            return (false, 0);
        }

        // Record access
        consent.currentAccessCount++;
        emit ConsentAccessed(patientId, researcherId, dataCategory, consent.currentAccessCount);

        return (true, consent.agreedPrice);
    }

    /**
     * @dev Check if consent is valid (without recording access)
     */
    function isConsentValid(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory
    ) external view returns (bool) {
        Consent memory consent = consents[patientId][researcherId][dataCategory];

        if (consent.status != ConsentStatus.Granted) return false;
        if (block.timestamp > consent.expiresAt) return false;
        if (consent.maxAccessCount > 0 && consent.currentAccessCount >= consent.maxAccessCount) return false;

        return true;
    }

    /**
     * @dev Set global opt-out for patient
     */
    function setGlobalOptOut(bytes32 patientId, bool optOut) external onlyRole(CONSENT_ADMIN_ROLE) {
        globalOptOut[patientId] = optOut;
        emit GlobalOptOutSet(patientId, optOut);
    }

    /**
     * @dev Set minimum price for patient
     */
    function setPatientMinPrice(bytes32 patientId, uint256 minPrice) external onlyRole(CONSENT_ADMIN_ROLE) {
        patientMinPrice[patientId] = minPrice;
        emit MinPriceSet(patientId, minPrice);
    }

    /**
     * @dev Create a new consent template
     */
    function createTemplate(
        string calldata name,
        uint256 defaultDuration,
        bool allowDerivativeWorks,
        bool allowCommercialUse,
        bool requireNotification,
        uint256 maxAccessCount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _createTemplate(name, defaultDuration, allowDerivativeWorks, allowCommercialUse, requireNotification, maxAccessCount);
    }

    function _createTemplate(
        string memory name,
        uint256 defaultDuration,
        bool allowDerivativeWorks,
        bool allowCommercialUse,
        bool requireNotification,
        uint256 maxAccessCount
    ) internal {
        consentTemplates[templateCount] = ConsentTemplate({
            name: name,
            defaultDuration: defaultDuration,
            allowDerivativeWorks: allowDerivativeWorks,
            allowCommercialUse: allowCommercialUse,
            requireNotification: requireNotification,
            maxAccessCount: maxAccessCount
        });

        emit TemplateCreated(templateCount, name);
        templateCount++;
    }

    /**
     * @dev Get consent details
     */
    function getConsent(
        bytes32 patientId,
        bytes32 researcherId,
        bytes32 dataCategory
    ) external view returns (Consent memory) {
        return consents[patientId][researcherId][dataCategory];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
