# AWS Infrastructure

**Production-ready serverless infrastructure for ACP Checkout Manager**

This directory contains the AWS SAM (Serverless Application Model) infrastructure that deploys a complete event-driven checkout system. The deployment creates a scalable, cost-effective solution with automatic scaling and built-in monitoring.

## 🏗️ Infrastructure Components

### Core Services
- **API Gateway** - RESTful API endpoints with automatic scaling
- **Lambda Functions** - Event-driven compute for checkout processing
- **DynamoDB** - Event sourcing database with automatic backup
- **DynamoDB Streams** - Real-time change capture for event processing

### Event Processing Pipeline
- **SNS Topic** - Event broadcasting for decoupled notifications
- **SQS Queue** - Reliable webhook delivery with retry mechanisms  
- **CloudWatch** - Comprehensive logging and monitoring

### Architecture Benefits
- ⚡ **Auto-scaling** - Handles any load automatically
- 💰 **Pay-per-use** - No fixed costs, pay only for actual usage
- 🔒 **Secure** - Built-in AWS security and encryption
- 🌍 **Global** - Deploy to any AWS region
- 📊 **Observable** - Complete monitoring and alerting

## 🚀 Quick Deployment

### Prerequisites
1. **AWS CLI** - [Install AWS CLI](https://aws.amazon.com/cli/)
2. **AWS SAM CLI** - [Install SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. **AWS Account** with appropriate permissions

### One-Command Deployment
```bash
# Navigate to infrastructure directory
cd infra

# Build and deploy (interactive setup)
sam build && sam deploy --guided
```

The deployment will ask for:
- **Stack name** (e.g., `acp-checkout-prod`)  
- **AWS Region** (e.g., `us-east-1`)
- **Confirmation** for resource creation

### Deployment with Profile
```bash
# Using specific AWS profile
AWS_PROFILE=your-profile sam build && sam deploy --guided

# Quick deploy with existing config
AWS_PROFILE=your-profile sam deploy

# Deploy with specific parameters (recommended pattern)
AWS_PROFILE=your-profile sam deploy \
  --parameter-overrides Environment=dev \
  --stack-name acp-event-store-dev \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM

# Required flags explanation:
# --parameter-overrides Environment=dev : Sets environment to 'dev'
# --stack-name : CloudFormation stack name (customize as needed)
# --resolve-s3 : Auto-creates S3 bucket for deployment artifacts
# --capabilities CAPABILITY_IAM : Allows creating IAM roles and policies
```

## 📋 Deployment Outputs

After successful deployment, you'll receive important URLs and resource names:

```yaml
Outputs:
  ApiEndpoint: https://abc123.execute-api.us-east-1.amazonaws.com/dev
  SessionsTableName: dev-acp-sessions  
  CheckoutEventsTopicArn: arn:aws:sns:us-east-1:123456789012:dev-checkout-events
  OrderUpdatesQueueUrl: https://sqs.us-east-1.amazonaws.com/123456789012/dev-order-updates
```

### Using Your API
```bash
# Set your API endpoint
API_ENDPOINT="https://your-id.execute-api.us-east-1.amazonaws.com/dev"

# Test the deployment
curl -X POST $API_ENDPOINT/checkout_sessions \
  -H "Content-Type: application/json" \
  -d '{"currency":"usd","items":[{"id":"test_1","quantity":1}]}'
```

## 🎯 Event-Driven Architecture

### Data Flow
```
API Request → DynamoDB (Event Store) → DynamoDB Streams → Lambda → SNS → Lambda → SQS → Webhooks
```

### Event Types Generated
- `checkout.session.created` - New session created
- `checkout.session.updated` - Session modified  
- `checkout.session.completed` - Payment processed
- `checkout.session.cancelled` - Session cancelled

### Event Processing Benefits
- **Real-time notifications** - Instant webhook delivery
- **Decoupled architecture** - Services scale independently  
- **Reliable delivery** - Built-in retry mechanisms
- **Complete audit trail** - Every change is recorded

## 📊 Monitoring & Observability

### CloudWatch Integration
The deployment automatically creates:
- **API Gateway metrics** - Request count, latency, errors
- **Lambda metrics** - Invocations, duration, error rates
- **DynamoDB metrics** - Read/write capacity, throttling
- **Event processing metrics** - SNS/SQS throughput

### Viewing Logs
```bash
# View all function logs
sam logs --stack-name your-stack-name

# Follow logs in real-time  
sam logs --stack-name your-stack-name --tail

# Specific function logs
sam logs --stack-name your-stack-name --name SessionManagerFunction
```

### Cost Monitoring
Monitor your costs with AWS Cost Explorer:
- Lambda execution costs
- DynamoDB read/write costs  
- Data transfer costs
- CloudWatch logs storage

## 🧪 Comprehensive Testing

Run the included E2E tests to verify your deployment:

```bash
# Test API endpoints only
./test/e2e-test.sh https://your-api-id.execute-api.us-east-1.amazonaws.com/dev

# Test complete event-driven architecture
./test/e2e-test.sh https://your-api-id.execute-api.us-east-1.amazonaws.com/dev \
  https://sqs.us-east-1.amazonaws.com/account/queue-name \
  your-aws-profile
```

## 🗑️ Cleanup

To remove all resources and stop incurring charges:

```bash
# Delete the CloudFormation stack
aws cloudformation delete-stack --stack-name your-stack-name

# Verify deletion
aws cloudformation describe-stacks --stack-name your-stack-name
```

## 💡 Pro Tips

- **Use different environments** - Deploy separate stacks for dev/staging/prod
- **Monitor costs** - Set up billing alerts in AWS Console
- **Backup strategy** - DynamoDB tables support point-in-time recovery
- **Security** - Use AWS IAM roles with least privilege principle
- **Performance** - Monitor Lambda cold starts and optimize memory settings

---

For detailed technical information, see [Architecture Documentation](../docs/ARCHITECTURE.md).