#!/bin/bash

# Setup script for local DynamoDB tables
# Run this after starting DynamoDB Local

ENDPOINT="http://localhost:8001"

echo "Creating DynamoDB tables on $ENDPOINT..."

# Create Session History Table
aws dynamodb create-table \
    --table-name acp-checkout-local-sessions \
    --attribute-definitions \
        AttributeName=SessionId,AttributeType=S \
        AttributeName=Version,AttributeType=N \
    --key-schema \
        AttributeName=SessionId,KeyType=HASH \
        AttributeName=Version,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url $ENDPOINT \
    --region us-east-1 \
    2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Created acp-checkout-local-sessions table"
else
    echo "  Table acp-checkout-local-sessions already exists or error occurred"
fi

# Create Idempotency Table
aws dynamodb create-table \
    --table-name acp-checkout-local-idempotency \
    --attribute-definitions \
        AttributeName=IdempotencyKey,AttributeType=S \
    --key-schema \
        AttributeName=IdempotencyKey,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url $ENDPOINT \
    --region us-east-1 \
    2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Created acp-checkout-local-idempotency table"
else
    echo "  Table acp-checkout-local-idempotency already exists or error occurred"
fi

echo ""
echo "Listing tables:"
aws dynamodb list-tables --endpoint-url $ENDPOINT --region us-east-1

echo ""
echo "Done! You can now run: npm run dev:local"
