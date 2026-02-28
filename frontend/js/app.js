/*
  sybron app.js
  minimal js for blockchain interaction
  no frameworks. no build step. just works.
*/

// config - update these after deployment
const CONFIG = {
    rpcUrl: 'http://localhost:8545',
    chainId: 1981,
    contracts: {
        healthToken: null,
        patientRegistry: null,
        researcherRegistry: null,
        consentManager: null,
        dataMarketplace: null
    }
};

// state
let provider = null;
let signer = null;
let userAddress = null;

// on page load
document.addEventListener('DOMContentLoaded', () => {
    loadContractAddresses();
    setupWalletButton();
    loadStats();
});

// load contract addresses from deployment file (if available)
async function loadContractAddresses() {
    try {
        const response = await fetch('/deployments/besu_local-deployment.json');
        if (response.ok) {
            const deployment = await response.json();
            CONFIG.contracts = deployment.contracts;
            console.log('loaded contract addresses:', CONFIG.contracts);
        }
    } catch (e) {
        console.log('no deployment file found, using defaults');
    }
}

// wallet connection
function setupWalletButton() {
    const btn = document.getElementById('connect-btn');
    if (!btn) return;
    
    btn.addEventListener('click', async () => {
        if (userAddress) {
            // already connected, disconnect
            disconnect();
        } else {
            await connect();
        }
    });
    
    // check if already connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        connect();
    }
}

async function connect() {
    const btn = document.getElementById('connect-btn');
    
    if (!window.ethereum) {
        alert('please install metamask or another web3 wallet');
        return;
    }
    
    try {
        btn.textContent = 'connecting...';
        
        // request account access
        const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
        });
        
        userAddress = accounts[0];
        
        // check network
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (parseInt(chainId, 16) !== CONFIG.chainId) {
            btn.textContent = 'wrong network';
            btn.classList.add('btn-warning');
            
            // try to switch network
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x' + CONFIG.chainId.toString(16) }]
                });
            } catch (switchError) {
                // network not added, try to add it
                if (switchError.code === 4902) {
                    await addNetwork();
                }
            }
        }
        
        // update button
        btn.textContent = shortenAddress(userAddress);
        btn.classList.add('connected');
        
        // set up provider
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        
        // listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnect();
            } else {
                userAddress = accounts[0];
                btn.textContent = shortenAddress(userAddress);
            }
        });
        
        // trigger page-specific setup
        if (typeof onWalletConnected === 'function') {
            onWalletConnected();
        }
        
    } catch (error) {
        console.error('connection error:', error);
        btn.textContent = 'connect wallet';
    }
}

async function addNetwork() {
    await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
            chainId: '0x' + CONFIG.chainId.toString(16),
            chainName: 'Sybron Health Chain',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            },
            rpcUrls: [CONFIG.rpcUrl]
        }]
    });
}

function disconnect() {
    userAddress = null;
    provider = null;
    signer = null;
    
    const btn = document.getElementById('connect-btn');
    btn.textContent = 'connect wallet';
    btn.classList.remove('connected');
}

function shortenAddress(address) {
    return address.slice(0, 6) + '...' + address.slice(-4);
}

// load network stats
async function loadStats() {
    // these will be updated when we have a working backend
    // for now, show placeholders
    
    const statsElements = {
        patients: document.getElementById('stat-patients'),
        researchers: document.getElementById('stat-researchers'),
        transactions: document.getElementById('stat-transactions'),
        earned: document.getElementById('stat-earned')
    };
    
    // if elements don't exist, skip
    if (!statsElements.patients) return;
    
    try {
        // try to connect to RPC and get real stats
        const tempProvider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
        
        // if we have contract addresses, get real data
        if (CONFIG.contracts.patientRegistry) {
            // for now, just show that network is accessible
            const blockNumber = await tempProvider.getBlockNumber();
            console.log('connected to network, block:', blockNumber);
            
            // show demo values (replace with real contract calls)
            statsElements.patients.textContent = '0';
            statsElements.researchers.textContent = '0';
            statsElements.transactions.textContent = '0';
            statsElements.earned.textContent = '0';
        } else {
            // no contracts deployed yet
            statsElements.patients.textContent = '--';
            statsElements.researchers.textContent = '--';
            statsElements.transactions.textContent = '--';
            statsElements.earned.textContent = '--';
        }
    } catch (e) {
        console.log('could not connect to network:', e.message);
        // show offline state
        statsElements.patients.textContent = '--';
        statsElements.researchers.textContent = '--';
        statsElements.transactions.textContent = '--';
        statsElements.earned.textContent = '--';
    }
}

// utility functions
function formatTokenAmount(amount, decimals = 18) {
    return ethers.formatUnits(amount, decimals);
}

function parseTokenAmount(amount, decimals = 18) {
    return ethers.parseUnits(amount.toString(), decimals);
}

function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
}

// show toast notification
function showToast(message, type = 'info') {
    // remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === 'error' ? '#cb2431' : type === 'success' ? '#22863a' : '#0066cc'};
        color: white;
        border-radius: 4px;
        font-size: 0.9rem;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// add animation styles
const style = document.createElement('style');
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
