const { ethers } = require("ethers");

const CATEGORY_KEYS = [
  "genomics",
  "lab_results",
  "imaging",
  "prescriptions",
  "vitals",
  "mental_health",
  "chronic",
  "lifestyle",
];

const CATEGORY_LABELS = {
  genomics: "Genomics",
  lab_results: "Lab Results",
  imaging: "Medical Imaging",
  prescriptions: "Prescriptions",
  vitals: "Vitals & Monitoring",
  mental_health: "Mental Health",
  chronic: "Chronic Conditions",
  lifestyle: "Lifestyle Data",
};

const CATEGORY_BYTES = Object.fromEntries(
  CATEGORY_KEYS.map((key) => [
    key,
    ethers.keccak256(ethers.toUtf8Bytes(key.toUpperCase().replace("_", "_"))),
  ])
);

// Match on-chain ConsentManager / marketplace category hashes used in tests and demo
CATEGORY_BYTES.genomics = ethers.keccak256(ethers.toUtf8Bytes("GENOMICS"));
CATEGORY_BYTES.lab_results = ethers.keccak256(ethers.toUtf8Bytes("LAB_RESULTS"));
CATEGORY_BYTES.imaging = ethers.keccak256(ethers.toUtf8Bytes("IMAGING"));
CATEGORY_BYTES.prescriptions = ethers.keccak256(ethers.toUtf8Bytes("PRESCRIPTIONS"));
CATEGORY_BYTES.vitals = ethers.keccak256(ethers.toUtf8Bytes("VITALS"));
CATEGORY_BYTES.mental_health = ethers.keccak256(ethers.toUtf8Bytes("MENTAL_HEALTH"));
CATEGORY_BYTES.chronic = ethers.keccak256(ethers.toUtf8Bytes("CHRONIC_CONDITIONS"));
CATEGORY_BYTES.lifestyle = ethers.keccak256(ethers.toUtf8Bytes("LIFESTYLE"));

const CATEGORY_BITS = {
  genomics: 1n << 0n,
  lab_results: 1n << 1n,
  imaging: 1n << 2n,
  prescriptions: 1n << 3n,
  vitals: 1n << 4n,
  mental_health: 1n << 5n,
  chronic: 1n << 6n,
  lifestyle: 1n << 7n,
};

function categoryKeyFromBytes(categoryBytes) {
  const normalized = categoryBytes.toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_BYTES)) {
    if (value.toLowerCase() === normalized) return key;
  }
  return "unknown";
}

function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key;
}

module.exports = {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_BYTES,
  CATEGORY_BITS,
  categoryKeyFromBytes,
  categoryLabel,
};
