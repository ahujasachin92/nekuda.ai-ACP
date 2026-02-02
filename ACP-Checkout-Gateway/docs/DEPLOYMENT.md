# Deployment Guide

**Complete step-by-step instructions for deploying ACP Checkout Manager**

This guide walks through deploying the ACP Checkout Manager to AWS using SAM (Serverless Application Model). The deployment creates a production-ready, auto-scaling checkout system with complete event-driven architecture.

## 🏁 Quick Start

### One-Command Deployment
```bash
git clone https://github.com/your-org/acp-checkout-manager.git
cd acp-checkout-manager/infra
sam build && sam deploy --guided
```

## 📋 Prerequisites

### Required Tools
1. **AWS CLI v2** - [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. **AWS SAM CLI** - [Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. **Node.js 20+** - [Download](https://nodejs.org/)
4. **Git** - For cloning the repository

### AWS Account Setup
1. **AWS Account** with programmatic access
2. **AWS Profile** configured with credentials
3. **IAM Permissions** for CloudFormation, Lambda, DynamoDB, API Gateway, SNS, SQS

### Verify Prerequisites
```bash
# Check AWS CLI
aws --version
# Expected: aws-cli/2.x.x or higher

# Check SAM CLI  
sam --version
# Expected: SAM CLI, version 1.x.x or higher

# Check Node.js
node --version
# Expected: v20.x.x or higher

# Verify AWS credentials
aws sts get-caller-identity
```

## 🚀 Deployment Steps

### Step 1: Clone and Navigate
```bash
git clone https://github.com/your-org/acp-checkout-manager.git
cd acp-checkout-manager
```

### Step 2: Install Dependencies
```bash
# Install main application dependencies
npm install

# Install Lambda function dependencies
cd infra/src
npm install
cd ../..
```

### Step 3: Build the Application
```bash
cd infra
sam build
```

**Expected Output:**
```
Building codeuri: ../infra/src runtime: nodejs20.x metadata: {'BuildMethod': 'esbuild'} architecture: x86_64 functions: EventPublisherFunction, OrderNotificationsFunction
Building codeuri: ../ runtime: nodejs20.x metadata: {'BuildMethod': 'esbuild'} architecture: x86_64 functions: SessionManagerFunction

Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml
```

### Step 4: Deploy Infrastructure
```bash
sam deploy --guided
```

**Interactive Configuration:**
```
Stack Name [acp-checkout-manager]: acp-checkout-prod
AWS Region [us-east-1]: us-east-1
Parameter Environment [dev]: prod
Confirm changes before deploy [Y/n]: Y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
Save parameters to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

### Step 5: Deployment Confirmation
Review the changeset and confirm:
```
Deploy this changeset? [y/N]: y
```

**Deployment Progress:**
```
CloudFormation stack changeset
-------------------------------------------------------------------------------------------------
Operation                     LogicalId                     ResourceType                  Replacement
-------------------------------------------------------------------------------------------------
+ Add                         CheckoutAPI                   AWS::ApiGateway::RestApi      N/A
+ Add                         CheckoutEventsTopic           AWS::SNS::Topic               N/A
+ Add                         SessionsTable                 AWS::DynamoDB::Table          N/A
+ Add                         SessionManagerFunction        AWS::Lambda::Function         N/A
-------------------------------------------------------------------------------------------------

Successfully created/updated stack acp-checkout-prod
```

## 📊 Deployment Outputs

After successful deployment, you'll receive critical information:

```yaml
CloudFormation outputs from deployed stack
-------------------------------------------------------------------------------------------------
Outputs
-------------------------------------------------------------------------------------------------
Key                 ApiEndpoint
Description         API Gateway endpoint URL for ACP checkout API
Value               https://abc123def.execute-api.us-east-1.amazonaws.com/prod

Key                 SessionsTableName  
Description         DynamoDB table name for sessions
Value               prod-acp-sessions

Key                 CheckoutEventsTopicArn
Description         SNS topic ARN for checkout events  
Value               arn:aws:sns:us-east-1:123456789012:prod-checkout-events

Key                 OrderUpdatesQueueUrl
Description         SQS queue URL for order updates
Value               https://sqs.us-east-1.amazonaws.com/123456789012/prod-order-updates
-------------------------------------------------------------------------------------------------
```

## ✅ Deployment Verification

### Test API Endpoint
```bash
# Set your API endpoint from deployment outputs
API_ENDPOINT="https://your-id.execute-api.us-east-1.amazonaws.com/prod"

# Test session creation
curl -X POST $API_ENDPOINT/checkout_sessions \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "test_product",
        "quantity": 1
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "id": "cs_1734567890_abc123",
  "status": "ready_for_payment",
  "currency": "usd",
  "line_items": [
    {
      "id": "line_1734567890_def456",
      "item": {
        "id": "test_product",
        "quantity": 1
      },
      "base_amount": 1800,
      "discount": 0,
      "subtotal": 1800,
      "tax": 144,
      "total": 1944
    }
  ],
  "totals": [
    {
      "type": "items_base_amount",
      "display_text": "Items",
      "amount": 1800
    },
    {
      "type": "tax",
      "display_text": "Tax", 
      "amount": 144
    },
    {
      "type": "total",
      "display_text": "Total",
      "amount": 1944
    }
  ],
  "fulfillment_options": [],
  "messages": [],
  "links": []
}
```

### Run E2E Tests
```bash
# Full architecture test (replace with your actual values)
./test/e2e-test.sh \
  https://your-api-id.execute-api.us-east-1.amazonaws.com/prod \
  https://sqs.us-east-1.amazonaws.com/account/prod-order-updates \
  your-aws-profile
```

### Check Infrastructure
```bash
# View CloudFormation stack
aws cloudformation describe-stacks --stack-name acp-checkout-prod

# Check Lambda functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `acp`)].FunctionName'

# Verify DynamoDB table
aws dynamodb describe-table --table-name prod-acp-sessions

# Check API Gateway
aws apigateway get-rest-apis --query 'items[?name==`prod-acp-checkout-api`]'
```

## 🔄 Environment Management

### Multiple Environments
Deploy separate environments for development, staging, and production:

```bash
# Development environment
sam deploy --parameter-overrides Environment=dev --stack-name acp-checkout-dev

# Staging environment  
sam deploy --parameter-overrides Environment=staging --stack-name acp-checkout-staging

# Production environment
sam deploy --parameter-overrides Environment=prod --stack-name acp-checkout-prod
```

### Configuration Files
Save deployment configurations:

**samconfig.toml:**
```toml
version = 0.1
[default]
[default.deploy]
[default.deploy.parameters]
stack_name = "acp-checkout-prod"
s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-xyz"
s3_prefix = "acp-checkout-prod"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=prod"
image_repositories = []
```

### AWS Profile Management
```bash
# Deploy with specific AWS profile
AWS_PROFILE=production sam deploy

# Deploy with temporary credentials
AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=yyy sam deploy
```

## 📱 Updating Deployments

### Code Updates
```bash
# After making code changes
cd infra
sam build
sam deploy
```

### Infrastructure Updates
```bash
# When template.yaml changes
sam build
sam deploy --parameter-overrides Environment=prod
```

### Zero-Downtime Updates
SAM automatically handles zero-downtime deployments for Lambda functions by using aliases and gradual deployment strategies.

## 📊 Monitoring Setup

### CloudWatch Dashboard
```bash
# View function logs
sam logs --stack-name acp-checkout-prod --name SessionManagerFunction

# Follow logs in real-time
sam logs --stack-name acp-checkout-prod --name SessionManagerFunction --tail

# View all function logs
sam logs --stack-name acp-checkout-prod
```

### Cost Monitoring
Set up billing alerts in AWS Console:
1. Go to AWS Billing Dashboard
2. Create billing alert for your expected monthly spend
3. Monitor costs via AWS Cost Explorer

### Performance Monitoring
Key metrics to monitor:
- **API Gateway**: Request count, latency (P50, P95, P99), error rates
- **Lambda**: Duration, concurrent executions, error count
- **DynamoDB**: Consumed read/write capacity, throttling events
- **SNS/SQS**: Message throughput, dead letter queue messages

## 🚨 Troubleshooting

### Common Deployment Issues

**Build Failures:**
```bash
# Clear build cache
rm -rf .aws-sam/build
sam build --use-container
```

**Permission Errors:**
```bash
# Check IAM permissions
aws sts get-caller-identity
aws iam simulate-principal-policy --policy-source-arn $(aws sts get-caller-identity --query Arn --output text) --action-names cloudformation:CreateStack
```

**Template Validation:**
```bash
# Validate SAM template
sam validate
aws cloudformation validate-template --template-body file://template.yaml
```

### Runtime Issues

**Lambda Function Errors:**
```bash
# Check function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/prod-acp"
aws logs get-log-events --log-group-name "/aws/lambda/prod-acp-session-manager"
```

**DynamoDB Issues:**
```bash
# Check table status
aws dynamodb describe-table --table-name prod-acp-sessions

# Monitor table metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=prod-acp-sessions \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

### Event Processing Issues
```bash
# Check SNS topic
aws sns get-topic-attributes --topic-arn arn:aws:sns:region:account:prod-checkout-events

# Check SQS queue
aws sqs get-queue-attributes --queue-url https://sqs.region.amazonaws.com/account/prod-order-updates --attribute-names All

# Monitor DynamoDB Streams
aws dynamodbstreams list-streams
```

## 🧹 Cleanup

### Delete Stack
```bash
# Delete all resources
aws cloudformation delete-stack --stack-name acp-checkout-prod

# Verify deletion
aws cloudformation describe-stacks --stack-name acp-checkout-prod
```

### Manual Cleanup
Some resources may require manual deletion:
- S3 buckets (if any data exists)
- CloudWatch Log Groups (optional retention)
- Parameter Store values (if used)

### Cost Verification
After deletion, verify no charges are incurred:
```bash
# Check for remaining resources
aws resourcegroupstaggingapi get-resources --tag-filters Key=aws:cloudformation:stack-name,Values=acp-checkout-prod
```

## 💡 Best Practices

### Security
- Use least-privilege IAM roles
- Enable CloudTrail for API logging
- Consider VPC deployment for sensitive data
- Rotate access keys regularly

### Performance
- Monitor Lambda cold start metrics
- Optimize bundle sizes with esbuild
- Use DynamoDB on-demand pricing for variable workloads
- Set appropriate Lambda memory allocation

### Cost Optimization  
- Use AWS Cost Explorer to identify optimization opportunities
- Consider Reserved Capacity for predictable DynamoDB workloads
- Monitor and set billing alerts
- Review and clean up unused resources regularly

### Operational Excellence
- Implement proper logging and monitoring
- Use infrastructure as code for all changes
- Maintain separate environments for dev/staging/prod
- Document custom configurations and integrations

---

Your ACP Checkout Manager is now deployed and ready to handle checkout sessions with complete event-driven architecture, real-time notifications, and automatic scaling!