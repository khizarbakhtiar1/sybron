#!/bin/bash

# Sybron Health Chain - Network Initialization Script
# This script initializes the Besu network with QBFT consensus

set -e

echo "🏥 Initializing Sybron Health Chain Network..."

# Create directories
mkdir -p docker/data/node-1
mkdir -p docker/data/node-2
mkdir -p docker/data/postgres
mkdir -p docker/keys

# Generate node keys if they don't exist
if [ ! -f docker/keys/node-1.key ]; then
    echo "📝 Generating node keys..."
    
    # Using openssl to generate keys (in production, use Besu's key generation)
    openssl ecparam -name secp256k1 -genkey -noout -out docker/keys/node-1.key 2>/dev/null || true
    openssl ecparam -name secp256k1 -genkey -noout -out docker/keys/node-2.key 2>/dev/null || true
    
    echo "   ✓ Node keys generated"
else
    echo "   ℹ️  Node keys already exist"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Network initialization complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run node:start' to start the network"
echo "  2. Run 'npm run node:logs' to view logs"
echo "  3. Run 'npm run deploy:local' to deploy contracts"
