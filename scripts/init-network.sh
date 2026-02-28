#!/bin/bash

# Sybron Health Chain - Network Initialization Script
# This script initializes the Besu network with QBFT consensus

set -e

echo "🏥 Initializing Sybron Health Chain Network..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Create directories matching docker-compose volume mounts
for i in 1 2 3 4; do
    mkdir -p "$PROJECT_DIR/docker/data/validator-$i"
    mkdir -p "$PROJECT_DIR/docker/keys/validator-$i"
done

# Generate node keys if they don't exist
if [ ! -f "$PROJECT_DIR/docker/keys/validator-1/nodekey" ]; then
    echo "📝 Generating validator node keys..."

    # Check if besu is available via docker
    if docker image inspect hyperledger/besu:24.1.0 > /dev/null 2>&1; then
        for i in 1 2 3 4; do
            echo "   Generating key for validator-$i..."
            docker run --rm -v "$PROJECT_DIR/docker/keys/validator-$i:/opt/besu/keys" \
                hyperledger/besu:24.1.0 \
                --data-path=/opt/besu/keys public-key export --to=/opt/besu/keys/nodekey.pub 2>/dev/null || true

            # If besu key gen didn't work, fall back to openssl
            if [ ! -f "$PROJECT_DIR/docker/keys/validator-$i/nodekey" ]; then
                openssl rand -hex 32 > "$PROJECT_DIR/docker/keys/validator-$i/nodekey"
            fi
        done
    else
        echo "   ⚠️  Besu Docker image not found, generating keys with openssl..."
        for i in 1 2 3 4; do
            openssl rand -hex 32 > "$PROJECT_DIR/docker/keys/validator-$i/nodekey"
        done
    fi

    echo "   ✓ Node keys generated"
else
    echo "   ℹ️  Node keys already exist"
fi

# Export validator-1 public key for bootnodes
if [ -f "$PROJECT_DIR/docker/keys/validator-1/nodekey" ]; then
    # Derive public key from private key (secp256k1)
    NODEKEY=$(cat "$PROJECT_DIR/docker/keys/validator-1/nodekey" | tr -d '[:space:]')
    echo ""
    echo "📋 Validator 1 nodekey: $NODEKEY"
    echo ""
    echo "   Set VALIDATOR_1_PUBKEY in your .env file to the public key"
    echo "   derived from this private key. You can get it by starting"
    echo "   validator-1 and checking its enode URL in the logs:"
    echo ""
    echo "     docker compose -f docker/docker-compose.yml up validator-1"
    echo "     docker logs sybron-validator-1 2>&1 | grep 'Enode URL'"
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Network initialization complete!"
echo ""
echo "Next steps:"
echo "  1. Start validator-1 to obtain its public key (enode)"
echo "  2. Set VALIDATOR_1_PUBKEY in .env"
echo "  3. Run 'npm run node:start' to start the full network"
echo "  4. Run 'npm run node:logs' to view logs"
echo "  5. Run 'npm run deploy:local' to deploy contracts"
