# Merchant Integration Guide

## After Running deploy.sh

You'll get these AWS resources:
- **SQS Queue**: `acp-event-store-dev-webhook-queue`  
- **SNS Topic**: `acp-event-store-dev-checkout-events`
- **API Endpoint**: `https://xyz.execute-api.us-east-1.amazonaws.com/dev`

## Option 1: Poll SQS Queue (Recommended)

### Python Example
```python
import boto3
import json
import time

# Configure AWS client
sqs = boto3.client('sqs', region_name='us-east-1')
QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/acp-event-store-dev-webhook-queue'

def process_webhook(payload):
    """Process the webhook payload"""
    print(f"Received: {payload['type']} for session {payload['sessionId']}")
    
    if payload['type'] == 'checkout.session.completed':
        # Fulfill the order
        print(f"Fulfilling order for session {payload['sessionId']}")
        print(f"Total: ${payload['data']['total']/100:.2f}")
        # Add your order fulfillment logic here
        
    elif payload['type'] == 'checkout.session.cancelled':
        # Cancel the order
        print(f"Cancelling session {payload['sessionId']}")
        # Add your cancellation logic here
        
    elif payload['type'] == 'checkout.session.created':
        # New session created
        print(f"New checkout session created: {payload['sessionId']}")
        # Add your tracking logic here

def poll_queue():
    """Poll SQS queue for messages"""
    while True:
        try:
            response = sqs.receive_message(
                QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20  # Long polling
            )
            
            for message in response.get('Messages', []):
                # Parse webhook payload
                payload = json.loads(message['Body'])
                
                # Process the webhook
                process_webhook(payload)
                
                # Delete message after successful processing
                sqs.delete_message(
                    QueueUrl=QUEUE_URL, 
                    ReceiptHandle=message['ReceiptHandle']
                )
                
        except Exception as e:
            print(f"Error processing messages: {e}")
            time.sleep(5)

# Start polling
if __name__ == "__main__":
    poll_queue()
```

### Node.js Example
```javascript
const AWS = require('aws-sdk');
const sqs = new AWS.SQS({ region: 'us-east-1' });

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/acp-event-store-dev-webhook-queue';

async function processWebhook(payload) {
    console.log(`Received: ${payload.type} for session ${payload.sessionId}`);
    
    switch (payload.type) {
        case 'checkout.session.completed':
            console.log(`Fulfilling order for session ${payload.sessionId}`);
            // Add your order fulfillment logic here
            break;
        case 'checkout.session.cancelled':
            console.log(`Cancelling session ${payload.sessionId}`);
            // Add your cancellation logic here
            break;
        case 'checkout.session.created':
            console.log(`New checkout session created: ${payload.sessionId}`);
            // Add your tracking logic here
            break;
    }
}

async function pollQueue() {
    while (true) {
        try {
            const response = await sqs.receiveMessage({
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 20
            }).promise();
            
            if (response.Messages) {
                for (const message of response.Messages) {
                    const payload = JSON.parse(message.Body);
                    
                    await processWebhook(payload);
                    
                    await sqs.deleteMessage({
                        QueueUrl: QUEUE_URL,
                        ReceiptHandle: message.ReceiptHandle
                    }).promise();
                }
            }
        } catch (error) {
            console.error('Error processing messages:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

pollQueue();
```

## Option 2: Subscribe to SNS Topic

### Subscribe Your HTTP Endpoint
```bash
# Replace with your actual topic ARN and webhook endpoint
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:acp-event-store-dev-checkout-events \
  --protocol https \
  --notification-endpoint https://yourstore.com/webhooks/acp
```

### HTTP Webhook Handler
```python
from flask import Flask, request, jsonify
import json

app = Flask(__name__)

@app.route('/webhooks/acp', methods=['POST'])
def handle_webhook():
    # SNS sends JSON in the request body
    data = json.loads(request.data)
    
    # Parse the actual webhook payload from SNS message
    if 'Message' in data:
        payload = json.loads(data['Message'])
        
        print(f"Received: {payload['type']} for session {payload['sessionId']}")
        
        # Process the webhook
        if payload['type'] == 'checkout.session.completed':
            # Fulfill order logic here
            pass
            
        return jsonify({"status": "success"})
    
    return jsonify({"status": "ignored"})

if __name__ == "__main__":
    app.run(port=5000)
```

## Webhook Payload Examples

### Session Created
```json
{
  "type": "checkout.session.created",
  "sessionId": "cs_1735123456_abc123",
  "status": "ready_for_payment",
  "timestamp": "2025-01-01T12:00:00Z",
  "data": {
    "id": "cs_1735123456_abc123",
    "status": "ready_for_payment",
    "currency": "usd",
    "line_items": [
      {
        "id": "line_1735123456_abc123",
        "item": {
          "id": "item_123",
          "quantity": 1
        },
        "base_amount": 2999,
        "discount": 0,
        "subtotal": 2999,
        "tax": 240,
        "total": 3239
      }
    ],
    "totals": [
      {
        "type": "items_base_amount",
        "display_text": "Items",
        "amount": 2999
      },
      {
        "type": "tax",
        "display_text": "Tax",
        "amount": 240
      },
      {
        "type": "total",
        "display_text": "Total",
        "amount": 3239
      }
    ],
    "fulfillment_options": [],
    "messages": [],
    "links": []
  }
}
```

### Session Completed
```json
{
  "type": "checkout.session.completed",
  "sessionId": "cs_1735123456_abc123",
  "status": "completed",
  "timestamp": "2025-01-01T12:05:00Z",
  "data": {
    "id": "cs_1735123456_abc123",
    "status": "completed",
    "currency": "usd",
    "line_items": [
      {
        "id": "line_1735123456_abc123",
        "item": {
          "id": "item_123",
          "quantity": 1
        },
        "base_amount": 2999,
        "discount": 0,
        "subtotal": 2999,
        "tax": 240,
        "total": 3239
      }
    ],
    "totals": [
      {
        "type": "items_base_amount",
        "display_text": "Items",
        "amount": 2999
      },
      {
        "type": "tax",
        "display_text": "Tax",
        "amount": 240
      },
      {
        "type": "total",
        "display_text": "Total",
        "amount": 3239
      }
    ],
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "customer@example.com"
    },
    "payment_provider": {
      "provider": "stripe",
      "supported_payment_methods": ["card"]
    },
    "fulfillment_options": [],
    "messages": [],
    "links": [],
    "order": {
      "id": "order_1735123456_xyz789",
      "checkout_session_id": "cs_1735123456_abc123",
      "permalink_url": "https://merchant.example.com/orders/order_1735123456_xyz789"
    }
  }
}
```

### Session Cancelled
```json
{
  "type": "checkout.session.cancelled",
  "sessionId": "cs_1735123456_abc123",
  "status": "canceled",
  "timestamp": "2025-01-01T12:03:00Z",
  "data": {
    "id": "cs_1735123456_abc123",
    "status": "canceled",
    "currency": "usd",
    "line_items": [
      {
        "id": "line_1735123456_abc123",
        "item": {
          "id": "item_123",
          "quantity": 1
        },
        "base_amount": 2999,
        "discount": 0,
        "subtotal": 2999,
        "tax": 240,
        "total": 3239
      }
    ],
    "totals": [
      {
        "type": "items_base_amount",
        "display_text": "Items",
        "amount": 2999
      },
      {
        "type": "tax",
        "display_text": "Tax",
        "amount": 240
      },
      {
        "type": "total",
        "display_text": "Total",
        "amount": 3239
      }
    ],
    "fulfillment_options": [],
    "messages": [],
    "links": []
  }
}
```

## AWS Setup

### Required Environment Variables
```bash
# From deploy.sh output
export AWS_REGION=us-east-1
export SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/acp-event-store-dev-webhook-queue
export SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789:acp-event-store-dev-checkout-events
```

### Required IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:123456789:acp-event-store-dev-webhook-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Subscribe",
        "sns:Unsubscribe"
      ],
      "Resource": "arn:aws:sns:us-east-1:123456789:acp-event-store-dev-checkout-events"
    }
  ]
}
```

## Test Integration

### 1. Create Test Session
```bash
# Replace with your actual API endpoint from deploy.sh output
API_ENDPOINT="https://abc123.execute-api.us-east-1.amazonaws.com/dev"

# Create checkout session
curl -X POST $API_ENDPOINT/checkout_sessions \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "test_item",
        "quantity": 1
      }
    ],
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "test@example.com"
    }
  }'
```

### 2. Complete the Session (Triggers Webhook)
```bash
# Use the session ID from step 1
SESSION_ID="cs_1735123456_abc123"

curl -X POST $API_ENDPOINT/checkout_sessions/$SESSION_ID/complete \
  -H "Content-Type: application/json" \
  -d '{
    "payment_data": {
      "provider": "stripe",
      "token": "tok_test_12345"
    },
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "test@example.com"
    }
  }'
```

### 3. Cancel a Session (Also Triggers Webhook)
```bash
curl -X POST $API_ENDPOINT/checkout_sessions/$SESSION_ID/cancel \
  -H "Content-Type: application/json"
```

## Troubleshooting

### Check SQS Queue
```bash
# Check queue attributes
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/acp-event-store-dev-webhook-queue \
  --attribute-names All

# Check for messages in queue
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/acp-event-store-dev-webhook-queue
```

### Monitor CloudWatch Logs
```bash
# View logs for all functions
sam logs --stack-name acp-event-store-dev --tail

# View specific function logs
sam logs --stack-name acp-event-store-dev --name OrderNotificationsFunction --tail
```

### Common Issues
1. **No webhooks received**: Check IAM permissions and queue URL
2. **JSON parse errors**: Verify message format in CloudWatch logs  
3. **Messages not deleted**: Make sure to delete messages after processing to avoid duplicates

## Production Considerations

- **Error Handling**: Implement retry logic and dead letter queues
- **Authentication**: Add webhook signature verification
- **Scaling**: Use multiple consumers for high volume
- **Monitoring**: Set up CloudWatch alarms for failed messages
- **Security**: Use IAM roles instead of access keys where possible