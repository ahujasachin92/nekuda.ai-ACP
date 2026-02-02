import { components } from '../api';
import { MerchantData } from '../services/merchant';

type CheckoutSessionState          = components['schemas']['CheckoutSession'];
type CompletedCheckoutSessionState = components['schemas']['CheckoutSessionWithOrder'];
type FulfillmentOptionShipping     = components['schemas']['FulfillmentOptionShipping'];
type FulfillmentOptionDigital      = components['schemas']['FulfillmentOptionDigital'];
type FulfillmentOption             = FulfillmentOptionShipping | FulfillmentOptionDigital;
type SelectedFulfillmentOption     = components['schemas']['SelectedFulfillmentOption'];
type FulfillmentDetails            = components['schemas']['FulfillmentDetails'];
type LineItem                      = components['schemas']['LineItem'];
type Buyer                         = components['schemas']['Buyer'];
type Total                         = components['schemas']['Total'];
type Message                       = components['schemas']['MessageInfo'];
type Order                         = components['schemas']['Order'];

const MERCHANT_TERMS_OF_USE_URL   = process.env.MERCHANT_TERMS_OF_USE_URL   || "";
const MERCHANT_PRIVACY_POLICY_URL = process.env.MERCHANT_PRIVACY_POLICY_URL || "";
const MERCHANT_RETURN_POLICY_URL  = process.env.MERCHANT_RETURN_POLICY_URL  || "";

export class CheckoutSession {

  private state: CheckoutSessionState | CompletedCheckoutSessionState;
  
  constructor(initialState: CheckoutSessionState) {
    this.state = initialState;
  }

  public update(merchantData: MerchantData | undefined,
                buyer: Buyer | undefined,
                fulfillmentDetails: FulfillmentDetails | undefined,
                selectedFulfillmentOptions: SelectedFulfillmentOption[] | undefined,
  ): void {
    if (merchantData) {
      this.setMerchantData(merchantData);
    }

    if (buyer) {
      this.setBuyer(buyer);
    }

    if (fulfillmentDetails) {
      this.setFulfillmentDetails(fulfillmentDetails);
    }

    if (selectedFulfillmentOptions) {
      this.setSelectedFulfillmentOptions(selectedFulfillmentOptions);
    }
  }

  public setMerchantData(data: MerchantData): void {
    if (data.line_items) {
      this.setLineItems(data.line_items);
    }

    if (data.fulfillment_options) {
      this.setFulfillmentOptions(data.fulfillment_options);
    }

    if (data.messages) {
      this.setMessages(data.messages);
    }
  }

  public setLineItems(lineItems: LineItem[]): void {
    this.state.line_items = lineItems;
    this.state.totals     = this.calculateTotals(lineItems);

    this.updateStatus();
  }

  public get id(): string {
    return this.state.id;
  }

  public setFulfillmentOptions(options: FulfillmentOption[]): void {
    this.state.fulfillment_options = options;

    if (options.length === 0) {
      this.state.selected_fulfillment_options = [];
      this.updateStatus();
      return;
    }

    // Check if current selection is still valid
    const currentSelections = this.state.selected_fulfillment_options || [];
    const validSelection = currentSelections.length > 0 && currentSelections.every(sel => {
      const optionId = sel.shipping?.option_id || sel.digital?.option_id;
      return options.some(o => o.id === optionId);
    });

    if (!validSelection) {
      // Auto-select cheapest option for all items
      const cheapestOption = options.reduce((prev, curr) => prev.total < curr.total ? prev : curr, options[0]);
      const allItemIds = this.state.line_items.map(li => li.item.id);

      this.state.selected_fulfillment_options = [{
        type: cheapestOption.type,
        [cheapestOption.type]: {
          option_id: cheapestOption.id,
          item_ids: allItemIds
        }
      }] as SelectedFulfillmentOption[];
    }

    this.updateStatus();
  }

  public setSelectedFulfillmentOptions(selections: SelectedFulfillmentOption[]): void {
    // Validate that all selected options exist in available options
    const validSelections = selections.filter(sel => {
      const optionId = sel.shipping?.option_id || sel.digital?.option_id;
      return this.state.fulfillment_options.some(o => o.id === optionId);
    });

    if (validSelections.length > 0) {
      this.state.selected_fulfillment_options = validSelections;
    }

    this.updateStatus();
  }

  public setBuyer(buyer: Buyer): void {
    this.state.buyer = buyer;
    this.updateStatus();
  }

  public setFulfillmentDetails(details: FulfillmentDetails): void {
    this.state.fulfillment_details = details;

    this.updateStatus();
  }

  public setMessages(messages: Message[]): void {
    this.state.messages = messages;
  }

  public getStateSnapshot(): CheckoutSessionState {
    return { ...this.state };
  }

  public canBeCompleted(): boolean {
    return this.state.status === 'ready_for_payment';
  }

  public complete(order: Order): void {
    if (this.canBeCompleted()) {
      this.state.status = 'completed';
      let completedCheckout : CompletedCheckoutSessionState = { ...this.state, order };
      this.state = completedCheckout;
    }
  }


  public canBeCanceled(): boolean {
    return this.state.status !== 'completed' && this.state.status !== 'canceled';
  }

  public cancel(): void {
    if (this.canBeCanceled()) {
      this.state.status = 'canceled';
    }
  }

  private calculateTotals(lineItems: LineItem[]): Total[] {
    const items_base_amount = lineItems.reduce((sum, item) => sum + item.base_amount, 0);
    const items_discount = lineItems.reduce((sum, item) => sum + item.discount, 0);
    const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = lineItems.reduce((sum, item) => sum + item.tax, 0);
    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    return [
      {
        type: 'items_base_amount' as const,
        display_text: 'Items Base Amount',
        amount: items_base_amount
      },
      {
        type: 'items_discount' as const, 
        display_text: 'Discount',
        amount: -items_discount
      },
      {
        type: 'subtotal' as const,
        display_text: 'Subtotal',
        amount: subtotal
      },
      {
        type: 'tax' as const,
        display_text: 'Tax',
        amount: tax
      },
      {
        type: 'total' as const,
        display_text: 'Total',
        amount: total
      }
    ];
  }

  private updateStatus(): void {
    if (this.isReadyForPayment()) {
      this.state.status = 'ready_for_payment';
    } else if (this.isNotReadyForPayment()) {
      this.state.status = 'not_ready_for_payment';
    }
  }
    
  private isReadyForPayment(): boolean {
    const hasSelectedFulfillment = (this.state.selected_fulfillment_options?.length ?? 0) > 0;

    return this.state.line_items.length > 0 &&
           this.state.fulfillment_options.length > 0 &&
           hasSelectedFulfillment &&
           this.state.fulfillment_details?.address !== undefined &&
           this.state.buyer !== undefined &&
           this.state.status !== 'completed' &&
           this.state.status !== 'canceled';
  }

  private isNotReadyForPayment(): boolean {
    const hasSelectedFulfillment = (this.state.selected_fulfillment_options?.length ?? 0) > 0;

    return (this.state.line_items.length == 0 ||
            this.state.fulfillment_options.length == 0 ||
            !hasSelectedFulfillment ||
            this.state.fulfillment_details?.address === undefined ||
            this.state.buyer === undefined) &&
            this.state.status !== 'completed' &&
            this.state.status !== 'canceled';
  }

  static new(sessionId: string): CheckoutSession {

    let state: CheckoutSessionState = {
      id: sessionId,
      payment_provider: {
        provider: "stripe",
        supported_payment_methods: ["card"]
      },
      status: "not_ready_for_payment",
      currency: "usd",
      line_items: [],
      totals: [],
      fulfillment_details: undefined,
      fulfillment_options: [],
      selected_fulfillment_options: [],
      messages: [],
      links: [
        { type: "terms_of_use", url: MERCHANT_TERMS_OF_USE_URL },
        { type: "privacy_policy", url: MERCHANT_PRIVACY_POLICY_URL },
        { type: "return_policy", url: MERCHANT_RETURN_POLICY_URL }
      ],
    };

    return new CheckoutSession(state);
  }
}