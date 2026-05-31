require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    besu_local: {
      url: "http://localhost:8545",
      chainId: 1981,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 0, // Free gas for permissioned network
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: "test test test test test test test test test test test junk",
            path: "m/44'/60'/0'/0",
            initialIndex: 0,
            count: 20,
          },
    },
    besu_testnet: {
      url: process.env.BESU_TESTNET_URL || "http://localhost:8545",
      chainId: 1981,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
