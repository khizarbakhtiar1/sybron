const API_BASE = window.location.origin;

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function fetchConfig() {
  return apiGet("/api/config");
}

async function fetchStats() {
  return apiGet("/api/stats");
}

async function fetchListings() {
  return apiGet("/api/listings");
}

async function fetchPatient(walletAddress) {
  return apiGet(`/api/patient/${walletAddress}`);
}

async function fetchResearcher(walletAddress) {
  return apiGet(`/api/researcher/${walletAddress}`);
}

async function registerPatient(walletAddress, metadataUri) {
  return apiPost("/api/patient/register", { walletAddress, metadataUri });
}

async function createListing(payload) {
  return apiPost("/api/patient/listing", payload);
}

async function registerResearcher(payload) {
  return apiPost("/api/researcher/register", payload);
}

async function requestAccess(payload) {
  return apiPost("/api/researcher/request", payload);
}

async function approveAccess(requestId, decryptionKeyUri) {
  return apiPost("/api/marketplace/approve", { requestId, decryptionKeyUri });
}

async function rejectAccess(requestId, reason) {
  return apiPost("/api/marketplace/reject", { requestId, reason });
}

async function completeAccess(requestId) {
  return apiPost("/api/marketplace/complete", { requestId });
}

function timeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
