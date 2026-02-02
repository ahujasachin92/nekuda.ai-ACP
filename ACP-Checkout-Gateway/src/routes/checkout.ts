import { Router } from 'express';
import {
  createCheckoutSession,
  getCheckoutSession,
  updateCheckoutSession,
  completeCheckoutSession,
  cancelCheckoutSession
} from '../controllers/checkoutController';

const router = Router();

// POST /checkout_sessions - Create a checkout session
router.post('/checkout_sessions', createCheckoutSession);

// GET /checkout_sessions/:checkout_session_id - Retrieve a checkout session
router.get('/checkout_sessions/:checkout_session_id', getCheckoutSession);

// POST /checkout_sessions/:checkout_session_id - Update a checkout session
router.post('/checkout_sessions/:checkout_session_id', updateCheckoutSession);

// POST /checkout_sessions/:checkout_session_id/complete - Complete a checkout session
router.post('/checkout_sessions/:checkout_session_id/complete', completeCheckoutSession);

// POST /checkout_sessions/:checkout_session_id/cancel - Cancel a checkout session  
router.post('/checkout_sessions/:checkout_session_id/cancel', cancelCheckoutSession);

export default router;
