// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PatientRegistry
 * @dev Manages patient registration and identity on Sybron Health Chain
 * @notice Patients register with pseudonymous IDs, real identity stays off-chain
 */
contract PatientRegistry is AccessControl, Pausable {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum PatientStatus {
        Unregistered,
        Pending,
        Verified,
        Suspended
    }

    struct Patient {
        bytes32 patientId;              // Pseudonymous identifier (hash of off-chain ID)
        address walletAddress;          // Patient's wallet for receiving payments
        PatientStatus status;
        uint256 registeredAt;
        uint256 verifiedAt;
        bytes32 dataCategories;         // Bitmap of available data categories
        string encryptedMetadataURI;    // IPFS URI to encrypted patient metadata
        uint256 totalDataSets;          // Number of data sets contributed
        uint256 totalEarnings;          // Total HEALTH tokens earned
    }

    // Data category flags (bitmap)
    uint256 public constant CATEGORY_GENOMICS = 1 << 0;
    uint256 public constant CATEGORY_LAB_RESULTS = 1 << 1;
    uint256 public constant CATEGORY_IMAGING = 1 << 2;
    uint256 public constant CATEGORY_PRESCRIPTIONS = 1 << 3;
    uint256 public constant CATEGORY_VITALS = 1 << 4;
    uint256 public constant CATEGORY_MENTAL_HEALTH = 1 << 5;
    uint256 public constant CATEGORY_CHRONIC_CONDITIONS = 1 << 6;
    uint256 public constant CATEGORY_LIFESTYLE = 1 << 7;

    mapping(bytes32 => Patient) public patients;
    mapping(address => bytes32) public walletToPatientId;
    
    uint256 public totalPatients;
    uint256 public verifiedPatients;

    event PatientRegistered(bytes32 indexed patientId, address indexed wallet, uint256 timestamp);
    event PatientVerified(bytes32 indexed patientId, address indexed verifier, uint256 timestamp);
    event PatientSuspended(bytes32 indexed patientId, string reason);
    event PatientReactivated(bytes32 indexed patientId);
    event DataCategoriesUpdated(bytes32 indexed patientId, bytes32 categories);
    event MetadataUpdated(bytes32 indexed patientId, string newURI);
    event EarningsRecorded(bytes32 indexed patientId, uint256 amount, uint256 totalEarnings);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    /**
     * @dev Register a new patient
     * @param patientId Pseudonymous ID (hash of real identity verified off-chain)
     * @param wallet Patient's wallet address for receiving payments
     * @param encryptedMetadataURI IPFS URI containing encrypted patient metadata
     */
    function registerPatient(
        bytes32 patientId,
        address wallet,
        string calldata encryptedMetadataURI
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused {
        require(patients[patientId].status == PatientStatus.Unregistered, "Patient already exists");
        require(walletToPatientId[wallet] == bytes32(0), "Wallet already registered");
        require(wallet != address(0), "Invalid wallet address");

        patients[patientId] = Patient({
            patientId: patientId,
            walletAddress: wallet,
            status: PatientStatus.Pending,
            registeredAt: block.timestamp,
            verifiedAt: 0,
            dataCategories: bytes32(0),
            encryptedMetadataURI: encryptedMetadataURI,
            totalDataSets: 0,
            totalEarnings: 0
        });

        walletToPatientId[wallet] = patientId;
        totalPatients++;

        emit PatientRegistered(patientId, wallet, block.timestamp);
    }

    /**
     * @dev Verify a registered patient
     */
    function verifyPatient(bytes32 patientId) external onlyRole(VERIFIER_ROLE) {
        require(patients[patientId].status == PatientStatus.Pending, "Patient not pending");

        patients[patientId].status = PatientStatus.Verified;
        patients[patientId].verifiedAt = block.timestamp;
        verifiedPatients++;

        emit PatientVerified(patientId, msg.sender, block.timestamp);
    }

    /**
     * @dev Update patient's data categories
     */
    function updateDataCategories(
        bytes32 patientId,
        bytes32 categories
    ) external onlyRole(REGISTRAR_ROLE) {
        require(patients[patientId].status == PatientStatus.Verified, "Patient not verified");

        patients[patientId].dataCategories = categories;
        emit DataCategoriesUpdated(patientId, categories);
    }

    /**
     * @dev Suspend a patient account
     */
    function suspendPatient(
        bytes32 patientId,
        string calldata reason
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(patients[patientId].status != PatientStatus.Unregistered, "Patient not found");

        if (patients[patientId].status == PatientStatus.Verified) {
            verifiedPatients--;
        }
        patients[patientId].status = PatientStatus.Suspended;

        emit PatientSuspended(patientId, reason);
    }

    /**
     * @dev Reactivate a suspended patient
     */
    function reactivatePatient(bytes32 patientId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(patients[patientId].status == PatientStatus.Suspended, "Patient not suspended");

        patients[patientId].status = PatientStatus.Verified;
        verifiedPatients++;

        emit PatientReactivated(patientId);
    }

    /**
     * @dev Record earnings for a patient (called by marketplace)
     */
    function recordEarnings(
        bytes32 patientId,
        uint256 amount
    ) external onlyRole(REGISTRAR_ROLE) {
        require(patients[patientId].status == PatientStatus.Verified, "Patient not verified");

        patients[patientId].totalEarnings += amount;
        emit EarningsRecorded(patientId, amount, patients[patientId].totalEarnings);
    }

    /**
     * @dev Increment data set count for a patient
     */
    function incrementDataSets(bytes32 patientId) external onlyRole(REGISTRAR_ROLE) {
        require(patients[patientId].status == PatientStatus.Verified, "Patient not verified");
        patients[patientId].totalDataSets++;
    }

    /**
     * @dev Check if patient is verified
     */
    function isVerified(bytes32 patientId) external view returns (bool) {
        return patients[patientId].status == PatientStatus.Verified;
    }

    /**
     * @dev Get patient's wallet address
     */
    function getPatientWallet(bytes32 patientId) external view returns (address) {
        return patients[patientId].walletAddress;
    }

    /**
     * @dev Check if patient has specific data category
     */
    function hasDataCategory(bytes32 patientId, uint256 category) external view returns (bool) {
        return uint256(patients[patientId].dataCategories) & category != 0;
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
