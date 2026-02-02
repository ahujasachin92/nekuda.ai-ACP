# ACP Checkout Manager E2E Testing Suite

**Focused testing with separate API and event validation**

This directory contains two specialized E2E testing scripts that validate different aspects of the ACP Checkout Manager:

1. **API Endpoints Testing** - Fast, focused testing of REST API operations
2. **Event Architecture Testing** - Comprehensive validation of SNS/SQS event propagation

## 🎯 Testing Philosophy

**Separation of Concerns** - Instead of one monolithic test, we provide focused test suites:

- **API Tests**: Fast, reliable testing of HTTP endpoints (no event dependencies)
- **Event Tests**: Deep validation of event-driven architecture (DynamoDB → Streams → SNS → SQS)

This approach allows for:
- ⚡ **Faster CI/CD** - Run API tests in every PR check
- 🔍 **Focused debugging** - Isolate API issues vs event propagation issues  
- 🏗️ **Flexible deployment** - Test API separately from event infrastructure

## 🚀 Quick Start

### API Testing (Fast)
```bash
# Test all API endpoints - no event infrastructure required
node test/api-e2e-test.js --url https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
```

### Event Testing (Comprehensive) 
```bash
# Test complete event propagation - requires SQS queue
node test/events-e2e-test.js \
  --url https://your-api-id.execute-api.us-east-1.amazonaws.com/dev \
  --sqs https://sqs.us-east-1.amazonaws.com/account/your-queue-name \
  --profile your-aws-profile
```

## 📁 Test Scripts

### 1. API Endpoints Test (`api-e2e-test.js`)

**Purpose**: Validates all REST API operations with proper request/response handling

**Features**:
- ✅ **10 comprehensive API tests** covering all checkout operations
- ✅ **Corrected request format** based on actual implementation (no auth headers)
- ✅ **Fast execution** - typically completes in < 5 seconds
- ✅ **Order validation** - tests the new order object in completion responses
- ✅ **Error handling** - validates 404 and 400 error responses

**Test Coverage**:
```
✅ Create checkout session
✅ Retrieve checkout session  
✅ Update fulfillment option
✅ Update buyer information
✅ Update items in cart
✅ Complete checkout session (with order validation)
✅ Create session for cancellation
✅ Cancel checkout session
✅ 404 handling for non-existent session
✅ 400 handling for already completed session
```

**Usage Examples**:
```bash
# Basic API testing
node test/api-e2e-test.js --url https://api-id.execute-api.us-east-1.amazonaws.com/dev

# With environment variable
export ACP_BASE_URL=https://api-id.execute-api.us-east-1.amazonaws.com/dev
node test/api-e2e-test.js
```

### 2. Event Architecture Test (`events-e2e-test.js`)

**Purpose**: Validates SNS/SQS event propagation through the complete serverless architecture

**Features**:
- ✅ **6 event validation tests** covering all lifecycle events
- ✅ **Deep architecture testing** - validates complete DynamoDB → SNS → SQS flow
- ✅ **Event structure validation** - checks required fields in event payloads
- ✅ **Timeout handling** - proper wait times for event propagation
- ✅ **Message cleanup** - automatically cleans up SQS messages after validation

**Test Coverage**:
```
🔄 Session creation event validation
🔄 Session update event validation  
🔄 Create session for completion event test
🔄 Session completion event validation
🔄 Create session for cancellation event test
🔄 Session cancellation event validation
```

**Usage Examples**:
```bash
# Full event architecture testing
node test/events-e2e-test.js \
  --url https://api-id.execute-api.us-east-1.amazonaws.com/dev \
  --sqs https://sqs.us-east-1.amazonaws.com/123456789012/dev-order-updates \
  --profile nekuda-dev-admin

# With environment variables
export ACP_BASE_URL=https://api-id.execute-api.us-east-1.amazonaws.com/dev
export ACP_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue-name
export AWS_PROFILE=your-aws-profile
node test/events-e2e-test.js
```

## 📊 Test Results & Output

### ✅ API Tests Success
```
🚀 Starting ACP Checkout Manager API E2E Tests
📍 Base URL: https://api-id.execute-api.us-east-1.amazonaws.com/dev
🎯 Testing: API endpoints only (no event validation)

🧪 Test 1: Create checkout session
✅ Session created with ID: cs_1734567890_abc123 (247ms)

🧪 Test 2: Retrieve checkout session
✅ Session retrieved successfully with 2 line items (89ms)

🧪 Test 6: Complete checkout session
✅ Session completed with order ID: ord_1734567890_xyz789 (156ms)

📊 API E2E Test Results Summary
✅ Passed: 10
❌ Failed: 0
📈 Total: 10
🎉 All API tests passed!
```

### ✅ Event Tests Success
```
🚀 Starting ACP Checkout Manager Events E2E Tests  
📍 Base URL: https://api-id.execute-api.us-east-1.amazonaws.com/dev
📬 SQS Queue: dev-order-updates
🔄 Testing: SNS/SQS event propagation only

🧪 Test 1: Session creation event validation
ℹ️  Session created: cs_1734567890_abc123, waiting for creation event...
ℹ️  Waiting for event propagation: DynamoDB → Streams → SNS → SQS...
ℹ️  Checking SQS queue for checkout.session.created event...
ℹ️  Found event: checkout.session.created for session cs_1734567890_abc123
✅ Event validated: checkout.session.created for session cs_1734567890_abc123

📊 Events E2E Test Results Summary
✅ Passed: 6
❌ Failed: 0
📈 Total: 6
🎉 All event tests passed! Event architecture validated.
```

### ❌ Failure Examples
```
🧪 Test 1: Create checkout session
❌ Expected 201, got 500: {"error":{"type":"processing_error"}}

🧪 Test 2: Session creation event validation  
❌ Event not found: checkout.session.created for session cs_123 (timeout after 30s)

💥 Some tests failed!
```

## 🔧 CI/CD Integration

### Fast API Testing (for PRs)
```yaml
name: API Tests
on: [pull_request]
jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Run API Tests
      run: node test/api-e2e-test.js --url ${{ secrets.API_BASE_URL }}
```

### Complete Testing (for deployments)
```yaml
name: Full E2E Tests
on: [push]
jobs:
  full-tests:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run API Tests
      run: node test/api-e2e-test.js --url ${{ secrets.API_BASE_URL }}
      
    - name: Run Event Tests
      env:
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      run: |
        node test/events-e2e-test.js \
          --url ${{ secrets.API_BASE_URL }} \
          --sqs ${{ secrets.SQS_QUEUE_URL }} \
          --profile ${{ secrets.AWS_PROFILE }}
```

## 📋 Prerequisites

### API Testing
- Node.js 18+
- Network access to your API endpoint

### Event Testing  
- Node.js 18+
- AWS CLI configured with appropriate permissions
- SQS queue receiving events from your checkout system
- Permissions to read/delete messages from the SQS queue

## 🔍 Troubleshooting

### API Test Issues
1. **401/403 errors**: The current implementation doesn't use authentication
2. **404 on all endpoints**: Check the base URL includes correct stage/path
3. **Timeout errors**: API might be cold-starting, try running again
4. **SSL errors**: Ensure valid certificates on the API endpoint

### Event Test Issues  
1. **AWS CLI not found**: Install and configure AWS CLI
2. **No messages in SQS**: Check event publishing is working (DynamoDB Streams → SNS)
3. **Permission denied**: Ensure SQS read/delete permissions  
4. **Timeout waiting for events**: Check the complete event flow is configured

### Debug Tips
```bash
# Verbose AWS CLI output
export AWS_CLI_DEBUG=1

# Check SQS queue manually
aws sqs receive-message --queue-url "your-queue-url" --max-number-of-messages 10

# Test API manually
curl -X POST https://your-api.com/dev/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-29" \
  -d '{"items":[{"id":"test","quantity":1}]}'
```

## Exit Codes

- **0**: All tests passed
- **1**: One or more tests failed

## Manual Testing

You can test individual operations manually using the corrected curl commands:

```bash
# Create session
curl --location 'https://your-api.com/dev/checkout_sessions' \
--header 'Content-Type: application/json' \
--header 'API-Version: 2025-09-29' \
--header 'Idempotency-Key: test-12345' \
--header 'Request-Id: req-67890' \
--data-raw '{
  "items": [{"id": "test_item", "quantity": 1}],
  "buyer": {
    "first_name": "Test",
    "last_name": "User", 
    "email": "test@example.com"
  }
}'

# Complete session
curl --location 'https://your-api.com/dev/checkout_sessions/{SESSION_ID}/complete' \
--header 'Content-Type: application/json' \
--header 'API-Version: 2025-09-29' \
--header 'Idempotency-Key: complete-12345' \
--data-raw '{
  "payment_data": {
    "token": "tok_test",
    "provider": "stripe"
  }
}'
```