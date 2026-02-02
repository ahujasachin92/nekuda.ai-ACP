import { components } from '../api';

type Item                      = components['schemas']['Item'];
type LineItem                  = components['schemas']['LineItem'];
type MessageInfo               = components['schemas']['MessageInfo'];
type CheckoutSession           = components['schemas']['CheckoutSession'];
type Order                     = components['schemas']['Order'];
type FulfillmentDetails        = components['schemas']['FulfillmentDetails'];
type FulfillmentOptionShipping = components['schemas']['FulfillmentOptionShipping'];
type FulfillmentOptionDigital  = components['schemas']['FulfillmentOptionDigital'];

export interface MerchantData {
    line_items: LineItem[];
    messages?: MessageInfo[];
    fulfillment_options: (FulfillmentOptionShipping | FulfillmentOptionDigital)[];
}

export interface MerchantService {
    /**
     * Fetches merchant-specific data for the given items and fulfillment details.
     *
     * This method is called when a checkout session is created or updated. It should:
     * - Query your inventory system to get real-time pricing and availability
     * - Calculate line items including base amounts, discounts, subtotals, and totals
     * - Return available fulfillment options (shipping methods, delivery times, costs)
     * - Provide any messages to display to the customer (promotions, warnings, info)
     *
     * **Important:** Taxes should only be calculated when fulfillmentDetails has an address,
     * as tax rates depend on the shipping destination. If fulfillmentDetails is undefined,
     * return line items without tax calculations.
     *
     * @param items - The items being purchased (product ID and quantity)
     * @param fulfillmentDetails - The fulfillment details including address, or undefined if not yet provided
     * @returns Merchant data including line items, fulfillment options, and messages
     */
    getMerchantData(items: Item[], fulfillmentDetails: FulfillmentDetails | undefined): MerchantData | Promise<MerchantData>;

    /**
     * Creates an order in your order management system.
     *
     * This method is called when a checkout session is completed. It should:
     * - Create the order in your OMS with all session details
     * - Process payment or coordinate with your payment processor
     * - Trigger fulfillment workflows (inventory allocation, shipping label generation, etc.)
     * - Return order details including a unique order ID and permalink URL
     *
     * The returned order information will be used for:
     * - Sending confirmation to the customer
     * - Generating webhooks to notify external systems (like OpenAI agents)
     * - Providing a tracking link for the customer to view their order
     *
     * @param session - The completed checkout session with all customer and payment details
     * @returns Order information including order ID and permalink URL
     */
    createOrder(session: CheckoutSession): Order;
}

export class MerchantServiceStub implements MerchantService {
    createOrder(session: CheckoutSession): Order {
        const orderId = crypto.randomUUID();
        
        return {
            id: orderId,
            checkout_session_id: session.id,
            permalink_url: `https://merchant.example.com/orders/${orderId}`
        };
    }

    getMerchantData(items: Item[], fulfillmentDetails: FulfillmentDetails | undefined): MerchantData {
        return {
            line_items: this.fetchLineItems(items),
            messages: [
                {
                    type: 'info',
                    content_type: 'plain',
                    content: 'Welcome to the demo store! This is a simulated checkout experience.'
                }
            ],
            fulfillment_options: [
                {
                    id: 'ship_standard',
                    type: 'shipping',
                    title: 'Standard Shipping',
                    subtitle: '5-7 business days',
                    carrier: 'USPS',
                    earliest_delivery_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                    latest_delivery_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    subtotal: 100,
                    tax: 80,
                    total: 180
                },
                {
                    id: 'ship_expedited',
                    type: 'shipping',
                    title: 'Expedited Shipping',
                    subtitle: '2-3 business days',
                    carrier: 'FedEx',
                    earliest_delivery_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                    latest_delivery_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                    subtotal: 150,
                    tax: 120,
                    total: 270
                }
            ]
        }

    }

    fetchLineItems(items: components['schemas']['Item'][]): components['schemas']['LineItem'][] {
        return items.map(item => {
            const pricing = this.generatePricing(item.id);
            const base_amount = pricing.unit_price * item.quantity;
            
            // Simple discount: 10% off if quantity > 1
            const discount = item.quantity > 1 ? Math.floor(base_amount * 0.10) : 0;
            
            const subtotal = base_amount - discount;
            const tax = Math.floor(subtotal * pricing.tax_rate);
            const total = subtotal + tax;

            return {
            id: `line_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            item: {
                id: item.id,
                quantity: item.quantity
            },
            base_amount,
            discount,
            subtotal,
            tax,
            total
            };
        });
    }

    generatePricing(productId: string) {
        // Generate deterministic pricing based on product ID hash
        const hash = Array.from(productId).reduce((hash, char) => hash + char.charCodeAt(0), 0);

        // Generate price between $5-50 based on ID hash
        const basePrice = 500 + (hash % 4500); // 500-4999 cents ($5-$49.99)

        return {
            unit_price: basePrice,
            tax_rate: 0.08 // 8% tax
        };
    }
}

