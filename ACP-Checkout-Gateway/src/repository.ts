import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { components } from './api';
import { CheckoutSession } from './model/checkoutSession';
import { EventType } from './model/eventTypes';
import { RequestMetadata } from './model/requestMetadata';

type CheckoutSessionState          = components['schemas']['CheckoutSession'];
type CheckoutSessionStateWithOrder = components['schemas']['CheckoutSessionWithOrder'];
type State                         = CheckoutSessionState | CheckoutSessionStateWithOrder;

export class SessionHistory {
  sessionId: string;
  versions: Map<number, State>;
  pastResponses: Map<string, State>;
  latestVersion: number;

  constructor(sessionId: string,
              versions: Map<number, State> = new Map(),
              pastResponses: Map<string, State> = new Map(),
              latestVersion: number = 0) {
    
    this.sessionId = sessionId;
    this.versions = versions;
    this.pastResponses = pastResponses;
    this.latestVersion = latestVersion;
  }

  get latest(): CheckoutSession {
    if (this.latestVersion === 0) {
      return CheckoutSession.new(this.sessionId);
    }
    return new CheckoutSession(this.versions.get(this.latestVersion)!);
  }

  get nextVersion(): number {
    return this.latestVersion + 1;
  }
}

export class DynamoRepository {
  private client: DynamoDBDocumentClient;
  private sessionHistoryTableName: string;
  private idempotencyTableName: string;

  constructor(sessionHistoryTable: string, idempotencyTable: string) {
    // Support local DynamoDB endpoint via environment variable
    const endpoint = process.env.DYNAMODB_ENDPOINT;
    const clientConfig = endpoint ? { endpoint, region: process.env.AWS_REGION || 'us-east-1' } : {};
    
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
    this.sessionHistoryTableName = sessionHistoryTable;
    this.idempotencyTableName = idempotencyTable;
    
    if (endpoint) {
      console.log(`DynamoDB using local endpoint: ${endpoint}`);
    }
  }

  async getSessionByIdempotencyKey(idempotencyKey: string): Promise<SessionHistory> {
    const existingSessionId = await this.getSessionIdByIdempotencyKey(idempotencyKey);
    if (existingSessionId) {
      return await this.getSessionHistory(existingSessionId);
    }
    
    const sessionId = crypto.randomUUID();
    await this.setSessionId(idempotencyKey, sessionId);
    return new SessionHistory(sessionId);
  }

  async getSessionHistory(sessionId: string): Promise<SessionHistory> {
    try {
      const result = await this.client.send(new QueryCommand({
        TableName: this.sessionHistoryTableName,
        KeyConditionExpression: 'SessionId = :sessionId',
        ExpressionAttributeValues: { ':sessionId': sessionId },
        ScanIndexForward: true
      }));

      if (!result.Items || result.Items.length === 0) {
        return new SessionHistory(sessionId);
      }

      const versions = new Map<number, State>();
      const pastResponses = new Map<string, State>();
      let latestVersion = 0;

      for (const item of result.Items) {
        const version = item.Version as number;
        const idempotencyKey = item.IdempotencyKey as string;
        const data = item.Data as State;
        versions.set(version, data);
        pastResponses.set(idempotencyKey, data);
        
        if (version > latestVersion) {
          latestVersion = version;
        }
      }

      return new SessionHistory(sessionId, versions, pastResponses, latestVersion);
    } catch (error) {
      console.error('Error fetching session history from DynamoDB:', error);
      throw error;
    }
  }

  async saveSession(
    session:  CheckoutSession,
    version:  number,
    reason:   EventType,
    metadata: RequestMetadata
  ): Promise<void> {
    try {
      const sessionId = session.id;
      const sessionState = session.getStateSnapshot();

      await this.client.send(new PutCommand({
        TableName: this.sessionHistoryTableName,
        Item: {
          SessionId: sessionId,
          Version: version,
          Status: sessionState.status,
          Reason: reason,
          IdempotencyKey: metadata.idempotencyKey,
          RequestId: metadata.requestId,
          Signature: metadata.signature,
          Metadata: JSON.stringify(metadata),
          Data: sessionState,
          Timestamp: new Date().toISOString()
        },
        ConditionExpression: 'attribute_not_exists(SessionId) AND attribute_not_exists(Version)'
      }));
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Optimistic concurrency error: version ${version} already exists for session ${session.id}`);
      }
      console.error('Error saving session to DynamoDB:', error);
      throw error;
    }
  }

  private async getSessionIdByIdempotencyKey(idempotencyKey: string): Promise<string | null> {
    try {
      const result = await this.client.send(new GetCommand({
        TableName: this.idempotencyTableName,
        Key: { IdempotencyKey: idempotencyKey }
      }));

      return result.Item ? result.Item.SessionId : null;
    } catch (error) {
      console.error('Error checking idempotency key:', error);
      return null;
    }
  }

  private async setSessionId(idempotencyKey: string, sessionId: string, ttlHours: number = 24): Promise<void> {
    try {
      const ttl = Math.floor(Date.now() / 1000) + (ttlHours * 3600);

      await this.client.send(new PutCommand({
        TableName: this.idempotencyTableName,
        Item: {
          IdempotencyKey: idempotencyKey,
          SessionId: sessionId,
          TTL: ttl,
          CreatedAt: new Date().toISOString()
        },
        ConditionExpression: 'attribute_not_exists(IdempotencyKey)'
      }));
    } catch (error) {
      console.error('Error storing idempotency mapping:', error);
      throw error;
    }
  }
}
