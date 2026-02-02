/**
 * Real Merchant Service Implementation
 * 
 * This is a production-ready skeleton that integrates with:
 * - Stripe for payments
 * - Your product catalog (implement CatalogProvider interface)
 * - Your shipping provider (implement ShippingProvider interface)
 * - Your tax service (implement TaxProvider interface)
 * 
 * To use: 
 * 1. Set environment variables (see bottom of file)
 * 2. Implement the provider interfaces for your systems
 * 3. Replace MerchantServiceStub with RealMerchantService in checkoutController.ts
 */

import Stripe from 'stripe';
import { components } from '../api';
import { MerchantService, MerchantData } from './merchant';

type Item = components['schemas']['Item'];
type LineItem = components['schemas']['LineItem'];
type CheckoutSession = components['schemas']['CheckoutSession'];
type Order = components['schemas']['Order'];
type FulfillmentDetails = components['schemas']['FulfillmentDetails'];
type FulfillmentOptionShipping = components['schemas']['FulfillmentOptionShipping'];
type Address = components['schemas']['Address'];

// ============================================================================
// PROVIDER INTERFACES - Implement these for your specific systems
// ============================================================================

/**
 * Product Catalog Provider
 * Connect to: Shopify, WooCommerce, Magento, custom database, etc.
 */
export interface CatalogProvider {
  getProducts(productIds: string[]): Promise<ProductInfo[]>;
}

export interface ProductInfo {
  id: string;
  name: string;
  description?: string;
  price: number;          // in cents
  currency: string;
  inventory_count: number;
  weight_grams?: number;
  image_url?: string;
}

/**
 * Shipping Rate Provider  
 * Connect to: ShipStation, EasyPost, Shippo, UPS/FedEx APIs, etc.
 */
export interface ShippingProvider {
  getRates(address: Address, items: ProductInfo[]): Promise<ShippingRate[]>;
}

export interface ShippingRate {
  id: string;
  carrier: string;
  service: string;
  title: string;
  subtitle: string;
  price: number;          // in cents
  estimated_days_min: number;
  estimated_days_max: number;
}

/**
 * Tax Calculation Provider
 * Connect to: TaxJar, Avalara, Stripe Tax, or custom logic
 */
export interface TaxProvider {
  calculateTax(subtotal: number, address: Address): Promise<TaxResult>;
}

export interface TaxResult {
  tax_amount: number;     // in cents
  tax_rate: number;       // decimal (0.08 = 8%)
  breakdown?: {
    state?: number;
    county?: number;
    city?: number;
  };
}

/**
 * Order Management Provider
 * Connect to: Shopify, your OMS, ERP system, etc.
 */
export interface OrderProvider {
  createOrder(orderData: CreateOrderData): Promise<CreatedOrder>;
}

export interface CreateOrderData {
  checkout_session_id: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  shipping_address: Address;
  line_items: LineItem[];
  shipping_option: string;
  payment_intent_id: string;
  total_amount: number;
  currency: string;
}

export interface CreatedOrder {
  id: string;
  order_number: string;
  permalink_url: string;
}

// ============================================================================
// REAL MERCHANT SERVICE
// ============================================================================

export class RealMerchantService implements MerchantService {
  private stripe: Stripe;
  private catalog: CatalogProvider;
  private shipping: ShippingProvider;
  private tax: TaxProvider;
  private orders: OrderProvider;

  constructor(
    stripeSecretKey: string,
    catalog: CatalogProvider,
    shipping: ShippingProvider,
    tax: TaxProvider,
    orders: OrderProvider
  ) {
    this.stripe = new Stripe(stripeSecretKey);
    this.catalog = catalog;
    this.shipping = shipping;
    this.tax = tax;
    this.orders = orders;
  }

  async getMerchantData(
    items: Item[], 
    fulfillmentDetails: FulfillmentDetails | undefined
  ): Promise<MerchantData> {
    
    // 1. Fetch real product data from catalog
    const productIds = items.map(i => i.id);
    const products = await this.catalog.getProducts(productIds);
    
    // 2. Build line items with real pricing
    const address = fulfillmentDetails?.address;
    const line_items = await this.buildLineItems(items, products, address);
    
    // 3. Get shipping options if address provided
    const fulfillment_options = address 
      ? await this.getShippingOptions(address, products)
      : this.getDefaultShippingOptions();
    
    // 4. Build messages (promotions, warnings, etc.)
    const messages = this.buildMessages(items, products);
    
    return { line_items, fulfillment_options, messages };
  }

  createOrder(session: CheckoutSession): Order {
    // This is called synchronously in the current implementation
    // For production, you might want to make this async
    
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // In production, you would:
    // 1. Create a Stripe PaymentIntent or charge
    // 2. Create order in your OMS
    // 3. Send confirmation email
    // 4. Trigger fulfillment
    
    console.log('Creating order for session:', session.id);
    console.log('Total amount:', session.totals?.find(t => t.type === 'total')?.amount);
    
    return {
      id: orderId,
      checkout_session_id: session.id,
      permalink_url: `${process.env.STORE_URL || 'https://yourstore.com'}/orders/${orderId}`
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async buildLineItems(
    items: Item[], 
    products: ProductInfo[],
    address?: Address
  ): Promise<LineItem[]> {
    
    const lineItems: LineItem[] = [];
    
    for (const item of items) {
      const product = products.find(p => p.id === item.id);
      
      if (!product) {
        throw new Error(`Product not found: ${item.id}`);
      }
      
      const base_amount = product.price * item.quantity;
      
      // Calculate discount (customize your discount logic here)
      const discount = this.calculateDiscount(item, product, base_amount);
      
      const subtotal = base_amount - discount;
      
      // Calculate tax if address provided
      let tax = 0;
      if (address) {
        const taxResult = await this.tax.calculateTax(subtotal, address);
        tax = taxResult.tax_amount;
      }
      
      const total = subtotal + tax;
      
      lineItems.push({
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
      });
    }
    
    return lineItems;
  }

  private calculateDiscount(item: Item, product: ProductInfo, baseAmount: number): number {
    // Implement your discount logic here
    // Examples:
    // - Quantity discounts
    // - Promo codes
    // - Member discounts
    // - Sale prices
    
    // Default: 10% off for quantity > 1
    if (item.quantity > 1) {
      return Math.floor(baseAmount * 0.10);
    }
    
    return 0;
  }

  private async getShippingOptions(
    address: Address, 
    products: ProductInfo[]
  ): Promise<FulfillmentOptionShipping[]> {
    
    const rates = await this.shipping.getRates(address, products);
    
    return rates.map(rate => ({
      id: rate.id,
      type: 'shipping' as const,
      title: rate.title,
      subtitle: rate.subtitle,
      carrier: rate.carrier,
      earliest_delivery_time: this.addDays(new Date(), rate.estimated_days_min).toISOString(),
      latest_delivery_time: this.addDays(new Date(), rate.estimated_days_max).toISOString(),
      subtotal: rate.price,
      tax: Math.floor(rate.price * 0.08), // Shipping tax - adjust as needed
      total: rate.price + Math.floor(rate.price * 0.08)
    }));
  }

  private getDefaultShippingOptions(): FulfillmentOptionShipping[] {
    // Return placeholder options when no address yet
    return [
      {
        id: 'ship_standard',
        type: 'shipping',
        title: 'Standard Shipping',
        subtitle: '5-7 business days',
        carrier: 'USPS',
        earliest_delivery_time: this.addDays(new Date(), 5).toISOString(),
        latest_delivery_time: this.addDays(new Date(), 7).toISOString(),
        subtotal: 599,
        tax: 0,
        total: 599
      },
      {
        id: 'ship_express',
        type: 'shipping',
        title: 'Express Shipping',
        subtitle: '2-3 business days',
        carrier: 'FedEx',
        earliest_delivery_time: this.addDays(new Date(), 2).toISOString(),
        latest_delivery_time: this.addDays(new Date(), 3).toISOString(),
        subtotal: 1299,
        tax: 0,
        total: 1299
      }
    ];
  }

  private buildMessages(items: Item[], products: ProductInfo[]): components['schemas']['MessageInfo'][] {
    const messages: components['schemas']['MessageInfo'][] = [];
    
    // Check for low inventory
    for (const item of items) {
      const product = products.find(p => p.id === item.id);
      if (product && product.inventory_count < item.quantity) {
        messages.push({
          type: 'warning',
          content_type: 'plain',
          content: `Only ${product.inventory_count} units of ${product.name} available`
        });
      } else if (product && product.inventory_count < 5) {
        messages.push({
          type: 'info',
          content_type: 'plain',
          content: `${product.name} is low in stock - order soon!`
        });
      }
    }
    
    // Add promotional messages
    const subtotal = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.id);
      return sum + (product?.price || 0) * item.quantity;
    }, 0);
    
    if (subtotal < 5000) { // Less than $50
      messages.push({
        type: 'info',
        content_type: 'plain',
        content: `Add $${((5000 - subtotal) / 100).toFixed(2)} more for free shipping!`
      });
    }
    
    return messages;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

// ============================================================================
// EXAMPLE PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Simple in-memory catalog for testing
 */
export class InMemoryCatalogProvider implements CatalogProvider {
  private products: Map<string, ProductInfo> = new Map([
    ['SKU-TSHIRT-BLK-M', { 
      id: 'SKU-TSHIRT-BLK-M', 
      name: 'Black T-Shirt (M)', 
      price: 2499, 
      currency: 'usd',
      inventory_count: 50,
      weight_grams: 200
    }],
    ['SKU-TSHIRT-BLK-L', { 
      id: 'SKU-TSHIRT-BLK-L', 
      name: 'Black T-Shirt (L)', 
      price: 2499, 
      currency: 'usd',
      inventory_count: 35,
      weight_grams: 220
    }],
    ['SKU-HOODIE-GRY-M', { 
      id: 'SKU-HOODIE-GRY-M', 
      name: 'Gray Hoodie (M)', 
      price: 5999, 
      currency: 'usd',
      inventory_count: 20,
      weight_grams: 450
    }],
    ['SKU-CAP-RED', { 
      id: 'SKU-CAP-RED', 
      name: 'Red Baseball Cap', 
      price: 1999, 
      currency: 'usd',
      inventory_count: 100,
      weight_grams: 100
    }],
  ]);

  async getProducts(productIds: string[]): Promise<ProductInfo[]> {
    return productIds
      .map(id => this.products.get(id))
      .filter((p): p is ProductInfo => p !== undefined);
  }
  
  // Helper to add products dynamically
  addProduct(product: ProductInfo): void {
    this.products.set(product.id, product);
  }
}

/**
 * Simple flat-rate shipping provider
 */
export class FlatRateShippingProvider implements ShippingProvider {
  async getRates(address: Address, items: ProductInfo[]): Promise<ShippingRate[]> {
    // Calculate total weight
    const totalWeight = items.reduce((sum, p) => sum + (p.weight_grams || 200), 0);
    
    // Adjust prices based on weight
    const weightMultiplier = Math.ceil(totalWeight / 500); // Per 500g
    
    return [
      {
        id: 'ground',
        carrier: 'USPS',
        service: 'Ground',
        title: 'USPS Ground',
        subtitle: '5-7 business days',
        price: 499 * weightMultiplier,
        estimated_days_min: 5,
        estimated_days_max: 7
      },
      {
        id: 'priority',
        carrier: 'USPS',
        service: 'Priority',
        title: 'USPS Priority',
        subtitle: '2-3 business days',
        price: 899 * weightMultiplier,
        estimated_days_min: 2,
        estimated_days_max: 3
      },
      {
        id: 'express',
        carrier: 'FedEx',
        service: 'Express',
        title: 'FedEx Express',
        subtitle: 'Next business day',
        price: 1999 * weightMultiplier,
        estimated_days_min: 1,
        estimated_days_max: 1
      }
    ];
  }
}

/**
 * Simple percentage-based tax provider
 */
export class SimpleTaxProvider implements TaxProvider {
  // US state tax rates (simplified)
  private taxRates: Record<string, number> = {
    'CA': 0.0725,
    'NY': 0.08,
    'TX': 0.0625,
    'FL': 0.06,
    'WA': 0.065,
    // Add more states...
  };

  async calculateTax(subtotal: number, address: Address): Promise<TaxResult> {
    const state = address.state || '';
    const rate = this.taxRates[state.toUpperCase()] || 0.05; // Default 5%
    
    return {
      tax_amount: Math.floor(subtotal * rate),
      tax_rate: rate
    };
  }
}

/**
 * Simple order provider that logs orders
 */
export class SimpleOrderProvider implements OrderProvider {
  async createOrder(orderData: CreateOrderData): Promise<CreatedOrder> {
    const orderId = `ORD-${Date.now()}`;
    const orderNumber = `#${Math.floor(Math.random() * 100000)}`;
    
    console.log('=== ORDER CREATED ===');
    console.log('Order ID:', orderId);
    console.log('Order Number:', orderNumber);
    console.log('Customer:', orderData.customer);
    console.log('Total:', orderData.total_amount / 100, orderData.currency.toUpperCase());
    console.log('Items:', orderData.line_items.length);
    console.log('=====================');
    
    return {
      id: orderId,
      order_number: orderNumber,
      permalink_url: `https://yourstore.com/orders/${orderId}`
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a configured RealMerchantService instance
 * 
 * Usage in checkoutController.ts:
 * 
 * import { createMerchantService } from './services/merchant.real';
 * const merchantService = createMerchantService();
 */
export function createMerchantService(): RealMerchantService {
  const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_xxx';
  
  // Use the simple providers for testing
  // Replace with your real implementations
  const catalog = new InMemoryCatalogProvider();
  const shipping = new FlatRateShippingProvider();
  const tax = new SimpleTaxProvider();
  const orders = new SimpleOrderProvider();
  
  return new RealMerchantService(stripeKey, catalog, shipping, tax, orders);
}

// ============================================================================
// ENVIRONMENT VARIABLES NEEDED
// ============================================================================
/*
Add these to your .env.local:

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Store info
STORE_URL=https://yourstore.com
STORE_NAME=Your Store Name

# Optional: External service APIs
SHIPSTATION_API_KEY=your_key
TAXJAR_API_KEY=your_key
*/
