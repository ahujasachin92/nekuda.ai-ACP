# Architecture Deep Dive

**Technical overview of ACP Checkout Manager's serverless event-driven architecture**

This document provides a comprehensive technical analysis of the system architecture, design decisions, and implementation details for developers who want to understand the inner workings of the ACP Checkout Manager.

## 🏛️ System Overview

ACP Checkout Manager implements a **serverless event-sourcing pattern** using AWS managed services. The architecture prioritizes:

- **Scalability** - Automatic scaling from 0 to thousands of concurrent requests
- **Reliability** - Built-in redundancy and error handling at every layer  
- **Cost Efficiency** - Pay-per-use model with no idle server costs
- **Observability** - Complete audit trail and real-time monitoring
- **Maintainability** - Decoupled services with clear boundaries

## 🔧 Core Components

### 1. API Layer (AWS Lambda + API Gateway)

**Function**: `SessionManagerFunction`
- **Runtime**: Node.js 20.x with TypeScript
- **Handler**: Express.js with `serverless-http` adapter
- **Build**: esbuild for optimized bundling
- **Memory**: 256MB (configurable)
- **Timeout**: 30 seconds

**Key Features**:
```typescript
// TypeScript interfaces auto-generated from OpenAPI spec
type CheckoutSession = components['schemas']['CheckoutSession'];

// DynamoDB client with removeUndefinedValues optimization
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});
```

**API Gateway Configuration**:
- **CORS**: Pre-configured for cross-origin requests
- **Custom Headers**: `API-Version`, `Idempotency-Key`, `Request-Id`
- **Path Mapping**: `/{proxy+}` catches all routes

### 2. Event Store (DynamoDB)

**Table Design**: Composite Primary Key for Event Sourcing
```yaml
PartitionKey: SessionId (String)
SortKey: Version (Number)
Attributes:
  - Status: Current session status (String)
  - Data: Complete session object (Map)
  - Timestamp: Event timestamp (ISO String)
```

**Event Sourcing Pattern**:
- **Append-Only**: New events create new versions, never update existing
- **Version Incrementing**: Sequential version numbers (1, 2, 3...)
- **Complete State**: Each version stores the full session state
- **Query Latest**: `ScanIndexForward: false, Limit: 1` gets current state

**Stream Configuration**:
```yaml
StreamViewType: NEW_AND_OLD_IMAGES
# Enables real-time event processing
```

### 3. Event Processing Pipeline

**DynamoDB Streams → Event Publisher Lambda**

```typescript
// Simplified event processing (INSERT-only)
export const handler = async (event: DynamoDBStreamEvent) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const sessionData = record.dynamodb?.NewImage;
      await publishToSNS(sessionData);
    }
  }
};
```

**Event Publisher Features**:
- **Batch Processing**: Processes up to 10 stream records per invocation
- **Automatic Retry**: Built-in Lambda retry for failed batches
- **Filtering**: Only processes INSERT events (no MODIFY/REMOVE)

**SNS Topic → Order Notifications Lambda**

```typescript
// Event routing and webhook delivery
export const handler = async (event: SNSEvent) => {
  for (const record of event.Records) {
    const checkoutEvent = JSON.parse(record.Sns.Message);
    await sendToSQS(checkoutEvent);
  }
};
```

### 4. Webhook Delivery System

**SQS Queue Configuration**:
- **Message Retention**: 14 days for reliability
- **Visibility Timeout**: 5 minutes for processing
- **Dead Letter Queue**: 3 retry attempts before DLQ
- **FIFO Support**: Available for ordered processing

## 📊 Data Flow Analysis

### Request Flow
```
1. Client Request → API Gateway
2. API Gateway → Lambda (Express.js)
3. Lambda → DynamoDB (Event Store)
4. Response ← Lambda ← API Gateway ← Client
```

**Performance Characteristics**:
- **Cold Start**: ~200-500ms (typical for Node.js Lambda)
- **Warm Invocation**: ~50-200ms
- **DynamoDB Latency**: Single-digit milliseconds
- **End-to-end**: Typically 100-500ms

### Event Propagation Flow
```
1. DynamoDB Write → DynamoDB Streams (near real-time)
2. Streams → Event Publisher Lambda (~100ms)
3. Lambda → SNS Topic (< 10ms)
4. SNS → Order Notifications Lambda (~100ms)
5. Lambda → SQS Queue (< 10ms)
6. SQS → Webhook Consumer (customer system)
```

**Event Latency**:
- **Stream Propagation**: 100-500ms
- **End-to-end Event**: 500ms-2s typically

## 🛠️ Implementation Patterns

### Event Sourcing Implementation

**Version Management Strategy**:
```typescript
// Simple version incrementing
async saveSessionVersion(sessionId: string, sessionData: any, version: number) {
  await dynamoClient.send(new PutItemCommand({
    TableName: this.tableName,
    Item: {
      SessionId: sessionId,
      Version: version,
      Data: sessionData,
      Timestamp: new Date().toISOString()
    }
  }));
}
```

**Benefits of This Approach**:
- **Simplicity**: Straightforward append-only pattern
- **Auditability**: Complete history of all session changes
- **Consistency**: Sequential versioning
- **Debugging**: Easy to trace state changes through versions

### Error Handling Strategy

**Lambda Function Level**:
```typescript
// Structured error responses following OpenAPI schema
res.status(500).json({
  error: {
    type: 'processing_error',
    code: 'session_creation_failed',
    message: 'Failed to create checkout session'
  }
});
```

**Infrastructure Level**:
- **DynamoDB**: Automatic backups and point-in-time recovery
- **Lambda**: Dead letter queues for failed invocations
- **SQS**: Message retention and retry mechanisms
- **CloudWatch**: Automatic logging and metrics collection

### TypeScript Integration

**Auto-Generated Types**:
```bash
# OpenAPI spec generates TypeScript interfaces
./spec/generate-types.sh
# Creates src/api.ts and src/types.ts
```

**Type Safety Benefits**:
- **Compile-time Validation**: Catch schema mismatches before deployment
- **IDE Support**: Full autocomplete for API types
- **Contract Enforcement**: Ensures API matches OpenAPI specification
- **Schema Consistency**: Changes to spec automatically update types

## 🚀 Build & Deployment Pipeline

### esbuild Configuration
```yaml
# Optimized for Lambda performance
BuildMethod: esbuild
BuildProperties:
  Minify: false        # Keep readable for debugging
  Target: es2020       # Modern JS for Node.js 20.x
  Sourcemap: true      # Enable stack traces
  EntryPoints:         # Multiple entry points
    - src/lambda.ts
    - event-publisher.ts
```

**Build Optimizations**:
- **Tree Shaking**: Remove unused code automatically
- **Bundle Splitting**: Separate bundles for different functions
- **Source Maps**: Maintain debugging capability in production
- **TypeScript**: Direct TS → JS compilation without tsc

### Infrastructure as Code
```yaml
# CloudFormation with SAM transforms
Transform: AWS::Serverless-2016-10-31

# Automatic IAM policies
Policies:
  - DynamoDBCrudPolicy:
      TableName: !Ref SessionsTable
```

**SAM Benefits**:
- **Simplified Syntax**: Higher-level abstractions over CloudFormation
- **Automatic IAM**: Generate least-privilege policies automatically
- **Local Testing**: `sam local` for development
- **Deployment**: Single command deployment with `sam deploy`

## 📈 Scalability & Performance

### Auto-Scaling Characteristics

**Lambda Concurrency**:
- **Default Limit**: 1000 concurrent executions per region
- **Burst Scaling**: 500-3000 concurrent executions initially
- **Gradual Scaling**: +500 executions per minute after burst
- **Reserved Concurrency**: Optional guaranteed capacity

**DynamoDB Scaling**:
- **On-Demand Mode**: Automatic scaling based on traffic
- **Burst Capacity**: Handle traffic spikes up to 2x baseline
- **Global Tables**: Multi-region replication for global scale

**Cost Scaling Examples**:
```
Low Traffic (1K requests/month):
- Lambda: $0.02
- DynamoDB: $0.25
- API Gateway: $3.50
Total: ~$4/month

Medium Traffic (100K requests/month):
- Lambda: $2.00
- DynamoDB: $25.00
- API Gateway: $350.00
Total: ~$377/month

High Traffic (10M requests/month):
- Lambda: $200.00
- DynamoDB: $2,500.00
- API Gateway: $35,000.00
Total: ~$37,700/month
```

### Performance Optimization

**Lambda Configuration**:
- **Memory Sizing**: 256MB (configurable based on workload)
- **Connection Reuse**: DynamoDB client initialized outside handler
- **Bundle Size**: esbuild produces optimized bundles

**DynamoDB Configuration**:
- **Query Patterns**: Composite key design (SessionId + Version)
- **Write Pattern**: Append-only for event sourcing
- **Read Consistency**: Eventually consistent for cost optimization

## 🔒 Security Architecture

### IAM Policy Design
```yaml
# Function-specific permissions only
EventPublisherFunction:
  Policies:
    - SNSPublishMessagePolicy:
        TopicName: !GetAtt CheckoutEventsTopic.TopicName
# No broad permissions like "*" resources
```

**Security Features**:
- **Least Privilege**: Each Lambda has minimal required permissions
- **Resource Scoping**: Policies reference specific resources, not wildcards
- **VPC Optional**: Public subnets for simplicity, VPC available if needed
- **Encryption**: All data encrypted in transit and at rest by default

### Data Protection
- **API Gateway**: Built-in DDoS protection via AWS Shield
- **Lambda**: Isolated execution environments per invocation
- **DynamoDB**: Server-side encryption with AWS managed keys
- **CloudWatch**: Log retention with automatic encryption

## 🧪 Testing Architecture

### E2E Testing with Event Validation
```bash
# Complete architecture testing
./test/e2e-test.sh https://api-url https://sqs-url aws-profile

# Tests both API responses AND event propagation
check_sqs_messages() {
  aws sqs receive-message --queue-url "$SQS_URL" \
    --max-number-of-messages 10 \
    --wait-time-seconds 5
}
```

**Testing Layers**:
1. **API Testing**: HTTP request/response validation
2. **Event Testing**: DynamoDB → Streams → SNS → SQS validation
3. **Integration Testing**: End-to-end business scenarios
4. **Performance Testing**: Response time measurement

## 📊 Monitoring & Observability

### CloudWatch Integration
```typescript
// Automatic structured logging
console.log(JSON.stringify({
  level: 'INFO',
  message: 'Session created',
  sessionId: session.id,
  timestamp: new Date().toISOString()
}));
```

**Monitoring Stack**:
- **Lambda Metrics**: Duration, error rate, concurrent executions
- **API Gateway**: Request count, latency percentiles, 4XX/5XX errors
- **DynamoDB**: Read/write capacity, throttling events
- **Custom Metrics**: Business metrics via CloudWatch custom metrics

### Alerting Strategy
- **Error Rate**: Alert on >1% error rate
- **Latency**: Alert on P95 > 1000ms
- **Throughput**: Alert on sudden traffic drops
- **Cost**: Alert on unexpected cost increases

---

This architecture enables a production-ready checkout system that scales automatically, provides complete audit trails, and delivers real-time event notifications while maintaining cost efficiency and operational simplicity.