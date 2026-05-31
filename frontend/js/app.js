/*
  sybron app.js
  shared wallet connection and network stats
*/

const CONFIG = {
  rpcUrl: "http://localhost:8545",
  chainId: 1337,
  contracts: {},
};

let provider = null;
let signer = null;
let userAddress = null;

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  setupWalletButton();
  loadStats();
});

async function loadConfig() {
  try {
    const config = await fetchConfig();
    CONFIG.chainId = Number(config.chainId);
    CONFIG.contracts = config.contracts;
    if (config.rpcUrl) CONFIG.rpcUrl = config.rpcUrl;
  } catch (error) {
    console.log("API not available, using defaults:", error.message);
    try {
      const response = await fetch("/deployments/hardhat-deployment.json");
      if (response.ok) {
        const deployment = await response.json();
        CONFIG.contracts = deployment.contracts;
        CONFIG.chainId = Number(deployment.chainId);
      }
    } catch (_) {
      // offline demo mode
    }
  }
}

function setupWalletButton() {
  const btn = document.getElementById("connect-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (userAddress) {
      disconnect();
    } else {
      await connect();
    }
  });

  if (window.ethereum && window.ethereum.selectedAddress) {
    connect();
  }
}

async function connect() {
  const btn = document.getElementById("connect-btn");

  if (!window.ethereum) {
    alert("Please install MetaMask or another Web3 wallet.");
    return;
  }

  try {
    btn.textContent = "connecting...";

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    userAddress = accounts[0];

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainId, 16) !== CONFIG.chainId) {
      btn.textContent = "wrong network";
      btn.classList.add("btn-warning");

      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CONFIG.chainId.toString(16) }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await addNetwork();
        }
      }
    }

    btn.textContent = shortenAddress(userAddress);
    btn.classList.add("connected");

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        userAddress = accounts[0];
        btn.textContent = shortenAddress(userAddress);
        if (typeof onWalletConnected === "function") {
          onWalletConnected();
        }
      }
    });

    if (typeof onWalletConnected === "function") {
      onWalletConnected();
    }
  } catch (error) {
    console.error("connection error:", error);
    btn.textContent = "connect wallet";
  }
}

async function addNetwork() {
  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: "0x" + CONFIG.chainId.toString(16),
        chainName: "Sybron Health Chain",
        nativeCurrency: {
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        },
        rpcUrls: [CONFIG.rpcUrl],
      },
    ],
  });
}

function disconnect() {
  userAddress = null;
  provider = null;
  signer = null;

  const btn = document.getElementById("connect-btn");
  btn.textContent = "connect wallet";
  btn.classList.remove("connected");
}

function shortenAddress(address) {
  return address.slice(0, 6) + "..." + address.slice(-4);
}

async function loadStats() {
  const statsElements = {
    patients: document.getElementById("stat-patients"),
    researchers: document.getElementById("stat-researchers"),
    transactions: document.getElementById("stat-transactions"),
    earned: document.getElementById("stat-earned"),
  };

  if (!statsElements.patients) return;

  try {
    const stats = await fetchStats();
    statsElements.patients.textContent = String(stats.patients);
    statsElements.researchers.textContent = String(stats.researchers);
    statsElements.transactions.textContent = String(stats.transactions);
    statsElements.earned.textContent = stats.patientEarnings || stats.volume || "0";
  } catch (_) {
    statsElements.patients.textContent = "--";
    statsElements.researchers.textContent = "--";
    statsElements.transactions.textContent = "--";
    statsElements.earned.textContent = "--";
  }
}

function formatTokenAmount(amount, decimals = 18) {
  return ethers.formatUnits(amount, decimals);
}

function parseTokenAmount(amount, decimals = 18) {
  return ethers.parseUnits(amount.toString(), decimals);
}

function showToast(message, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === "error" ? "#cb2431" : type === "success" ? "#22863a" : "#0066cc"};
        color: white;
        border-radius: 4px;
        font-size: 0.9rem;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
