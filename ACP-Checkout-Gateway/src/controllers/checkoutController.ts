import { Request, Response } from 'express';
import { components } from '../api';
import { DynamoRepository, SessionHistory } from '../repository';
import { MerchantService, MerchantServiceStub, MerchantData } from '../services/merchant';
import { createMerchantService } from '../services/merchant.real';
import { EventType } from '../model/eventTypes';
import { RequestMetadata, IDEMPOTENCY_KEY_HEADER, SIGNATURE_HEADER, REQUEST_ID_HEADER } from '../model/requestMetadata';
import { webhookService } from '../services/webhookService';

type CheckoutSessionCreateRequest   = components['schemas']['CheckoutSessionCreateRequest'];
type CheckoutSessionUpdateRequest   = components['schemas']['CheckoutSessionUpdateRequest'];
type CheckoutSessionCompleteRequest = components['schemas']['CheckoutSessionCompleteRequest'];
type CheckoutSessionState           = components['schemas']['CheckoutSession'];
type CheckoutSessionStateWithOrder  = components['schemas']['CheckoutSessionWithOrder'];
type State                          = CheckoutSessionState | CheckoutSessionStateWithOrder;

const sessionHistoryTable = process.env.SESSION_HISTORY_TABLE;
if (!sessionHistoryTable) {
  throw new Error('SESSION_HISTORY_TABLE environment variable is not set');
}

const idempotencyTable = process.env.IDEMPOTENCY_TABLE;
if (!idempotencyTable) {
  throw new Error('IDEMPOTENCY_TABLE environment variable is not set');
}

// Switch between stub and real merchant service via MERCHANT_SERVICE env var
const merchantService: MerchantService = process.env.MERCHANT_SERVICE === 'real'
  ? createMerchantService()
  : new MerchantServiceStub();

console.log(`Using merchant service: ${process.env.MERCHANT_SERVICE === 'real' ? 'RealMerchantService' : 'MerchantServiceStub'}`);
const repository = new DynamoRepository(sessionHistoryTable, idempotencyTable);

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const body           = req.body as CheckoutSessionCreateRequest;
    const metadata       = RequestMetadata.from(req);
    const idempotencyKey = metadata.idempotencyKey;

    let sessionHistory = await repository.getSessionByIdempotencyKey(idempotencyKey);
    let session        = sessionHistory.latest;

    if (tryGetExistingResponse(sessionHistory, metadata, res)) { return; }

    
    let merchantData = body.items ? await merchantService.getMerchantData(body.items, body.fulfillment_details) : undefined;
    session.update(merchantData, body.buyer, body.fulfillment_details, undefined);
    
    await repository.saveSession(session, sessionHistory.nextVersion, EventType.CREATED, metadata);

    // Send webhook notification (async, don't block response)
    const sessionState = session.getStateSnapshot();
    webhookService.sendSessionEvent('checkout.session.created', sessionState).catch(console.error);

    res.status(201).json(sessionState);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'invalid_request',
        code: 'session_creation_failed',
        message: 'Failed to create checkout session'
      }
    });
  }
}

export async function getCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { checkout_session_id } = req.params;
    const sessionHistory = await repository.getSessionHistory(checkout_session_id as string);
    const session = sessionHistory.latest;
    
    if (sessionHistory.latestVersion == 0) {
      res.status(404).json({
        error: {
          type: 'invalid_request',
          code: 'resource_not_found',
          message: `Checkout session ${checkout_session_id} not found`
        }
      });
      return;
    }

    let state = session.getStateSnapshot();

    res.status(201).json(state);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'processing_error',
        code: 'retrieval_failed',
        message: 'Failed to retrieve checkout session'
      }
    });
  }
}

export async function updateCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { checkout_session_id } = req.params;
    const body           = req.body as CheckoutSessionUpdateRequest;
    const metadata       = RequestMetadata.from(req);

    const sessionHistory = await repository.getSessionHistory(checkout_session_id as string);
    const session        = sessionHistory.latest;

    if (tryGetExistingResponse(sessionHistory, metadata, res)) { return; }

    if (sessionHistory.latestVersion == 0) {
      res.status(404).json({
        error: {
          type: 'invalid_request',
          code: 'resource_not_found',
          message: `Checkout session ${checkout_session_id} not found`
        }
      });
      return;
    }

    let merchantData = body.items ? await merchantService.getMerchantData(body.items, body.fulfillment_details) : undefined;
    session.update(merchantData, body.buyer, body.fulfillment_details, body.selected_fulfillment_options);

    await repository.saveSession(session, sessionHistory.nextVersion, EventType.UPDATED, metadata);

    // Send webhook notification
    const sessionState = session.getStateSnapshot();
    webhookService.sendSessionEvent('checkout.session.updated', sessionState).catch(console.error);

    res.status(201).json(sessionState);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'invalid_request',
        code: 'session_update_failed',
        message: 'Failed to update checkout session'
      }
    });
  }
}

export async function completeCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { checkout_session_id } = req.params;
    const body           = req.body as CheckoutSessionCompleteRequest;
    const metadata       = RequestMetadata.from(req);

    if (!body.payment_data) {
      res.status(400).json({
        error: {
          type: 'invalid_request',
          code: 'missing_payment_data',
          message: 'payment_data is required to complete checkout session'
        }
      });
      return;
    }

    const sessionHistory = await repository.getSessionHistory(checkout_session_id as string);
    const session = sessionHistory.latest;

    if (tryGetExistingResponse(sessionHistory, metadata, res)) { return; }

    if (sessionHistory.latestVersion == 0) {
      res.status(404).json({
        error: {
          type: 'invalid_request',
          code: 'resource_not_found',
          message: `Checkout session ${checkout_session_id} not found`
        }
      });
      return;
    }

    if (!session.canBeCompleted()) {
      res.status(400).json({
        error: {
          type: 'invalid_request',
          code: 'already_completed',
          message: 'Checkout session cannot be completed'
        }
      });
      return;
    }

    if (body.buyer) {
      session.setBuyer(body.buyer);
    }

    let state = session.getStateSnapshot();
    let order = merchantService.createOrder(state);

    session.complete(order);

    await repository.saveSession(session, sessionHistory.nextVersion, EventType.COMPLETED, metadata);

    // Send webhook notifications
    const completedState = session.getStateSnapshot();
    webhookService.sendSessionEvent('checkout.session.completed', completedState).catch(console.error);
    webhookService.sendOrderEvent('order.created', completedState.id, {
      id: order.id,
      permalink_url: order.permalink_url,
      status: 'created'
    }).catch(console.error);

    res.status(201).json(completedState);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'processing_error',
        code: 'completion_failed',
        message: 'Failed to complete checkout session'
      }
    });
  }
}

export async function cancelCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { checkout_session_id } = req.params;
    const metadata       = RequestMetadata.from(req);
    const sessionHistory = await repository.getSessionHistory(checkout_session_id as string);
    const session        = sessionHistory.latest;

    if (sessionHistory.latestVersion == 0) {
      res.status(404).json({
        error: {
          type: 'invalid_request',
          code: 'resource_not_found',
          message: `Checkout session ${checkout_session_id} not found`
        }
      });
      return;
    }

    if (!session.canBeCanceled) {
      res.status(400).json({
        error: {
          type: 'invalid_request',
          message: 'Session cannot be canceled in its current state',
          code: 'cancellation_not_allowed'
        }
      });
      return;
    }

    session.cancel();

    await repository.saveSession(session, sessionHistory.nextVersion, EventType.CANCELED, metadata);

    // Send webhook notification
    const cancelledState = session.getStateSnapshot();
    webhookService.sendSessionEvent('checkout.session.cancelled', cancelledState).catch(console.error);

    res.status(201).json(cancelledState);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'processing_error',
        code: 'cancellation_failed',
        message: 'Failed to cancel checkout session'
      }
    });
  }
}

function tryGetExistingResponse(history: SessionHistory, metadata: RequestMetadata, res: Response): boolean {
  const idempotencyKey = metadata.idempotencyKey;
  if (!idempotencyKey) {
    return false;
  }

  const state = history.pastResponses.get(idempotencyKey);
  if (!state) {
    return false;
  }
  
  res.status(201).json(state);

  return true;
}