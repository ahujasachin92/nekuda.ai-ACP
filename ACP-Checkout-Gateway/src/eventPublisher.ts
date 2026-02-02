import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

interface CheckoutEvent {
  eventType: string;
  sessionId: string;
  version: number;
  status: string;
  timestamp: string;
  data?: any;
}

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log('DynamoDB Stream event received:', JSON.stringify(event, null, 2));

  if (!SNS_TOPIC_ARN) {
    console.error('SNS_TOPIC_ARN environment variable is not set');
    return;
  }

  const publishPromises = event.Records.map(record => processRecord(record));

  try {
    await Promise.all(publishPromises);
    console.log(`Successfully processed ${event.Records.length} records`);
  } catch (error) {
    console.error('Error processing DynamoDB stream records:', error);
    throw error;
  }
};

async function processRecord(record: DynamoDBRecord): Promise<void> {
  console.log('Processing record:', JSON.stringify(record, null, 2));

  const dynamoDbData = record.dynamodb;
  if (!dynamoDbData?.NewImage?.SessionId?.S) {
    console.log('No session ID found in record, skipping');
    return;
  }

  const sessionId = dynamoDbData.NewImage.SessionId.S;
  const version = parseInt(dynamoDbData.NewImage.Version?.N || '0');
  const status = dynamoDbData.NewImage.Status.S!;
  const eventType = dynamoDbData.NewImage.Reason.S!;
  const timestamp = dynamoDbData.NewImage.Timestamp?.S || new Date().toISOString();

  let sessionData = null;

  try {
    if (dynamoDbData.NewImage.Data?.S) {
      sessionData = JSON.parse(dynamoDbData.NewImage.Data.S);
    }
  } catch (error) {
    console.error('Error parsing session data:', error);
  }

  const checkoutEvent: CheckoutEvent = {
    eventType,
    sessionId,
    version,
    status,
    timestamp,
    data: sessionData
  };

  const messageAttributes = {
    sessionId: {
      DataType: 'String',
      StringValue: sessionId
    },
    eventType: {
      DataType: 'String',
      StringValue: eventType
    }
  };

  try {
    const publishCommand = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify(checkoutEvent),
      Subject: `Checkout Session ${record.eventName}: ${sessionId}`,
      MessageAttributes: messageAttributes
    });

    const result = await snsClient.send(publishCommand);
    console.log(`Published event for session ${sessionId}, MessageId: ${result.MessageId}`);

  } catch (error) {
    console.error(`Failed to publish event for session ${sessionId}:`, error);
    throw error;
  }
}
