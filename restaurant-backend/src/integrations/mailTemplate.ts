/** Shown in guest-facing messages: "your reservation at Main Bistro is confirmed!" */
function restaurantName(): string {
  return process.env.RESTAURANT_NAME || 'Main Bistro';
}

export function renderRestaurantMailContent(params: {
  guestName?: string;
  action: 'waitlist_notified' | 'reservation_reminder' | 'reservation_confirmed' | 'table_available' | 'order_confirmation' | 'low_stock_alert' | 'payment_receipt';
  partySize?: number;
  alertItems?: string;
  /** Reservation date as YYYY-MM-DD. */
  date?: string;
  time?: string;
  tableNumber?: string;
  orderTotal?: string;
  orderItems?: string;
  orderId?: string;
  /** Short booking reference the guest can quote, e.g. SXVROT7H. */
  reference?: string;
  /** Reminder only: one-tap attendance links. */
  confirmUrl?: string;
  cancelUrl?: string;
}): string {
  const name = params.guestName ? ` ${params.guestName}` : '';
  if (params.action === 'waitlist_notified') {
    return `Hi${name}! You have been notified. Please proceed with your table assignment at the restaurant.`;
  }
  if (params.action === 'reservation_reminder') {
    const lines = [
      `Hi${name},`,
      '',
      `This is a reminder for your table reservation at ${restaurantName()} today${params.time ? ` at ${params.time}` : ''}.`,
    ];
    if (params.confirmUrl && params.cancelUrl) {
      lines.push(
        '',
        'Are you still coming? Please confirm your attendance by clicking one of the options below:',
        '',
        `👍 Yes, I am coming: ${params.confirmUrl}`,
        `❌ No, I need to cancel: ${params.cancelUrl}`
      );
    }
    lines.push('', 'Thank you.');
    return lines.join('\n');
  }
  if (params.action === 'reservation_confirmed') {
    const fields = [
      params.date ? `Date: ${params.date}` : '',
      params.time ? `Time: ${params.time}` : '',
      params.partySize ? `Party Size: ${params.partySize}` : '',
    ].filter(Boolean).join(', ');
    const ref = params.reference ? ` Ref: ${params.reference}.` : '';
    return `Hi${name}, your reservation at ${restaurantName()} is confirmed!${fields ? ` ${fields}.` : ''}${ref}`;
  }
  if (params.action === 'low_stock_alert') {
    return [
      'LOW STOCK ALERT',
      '',
      'These ingredients are below their minimum stock level:',
      params.alertItems ?? '  (none)',
      '',
      'Please reorder.',
    ].join('\n');
  }
  if (params.action === 'payment_receipt') {
    return [
      `Hi${name}! Payment received — thank you.`,
      ``,
      `Invoice : ${params.orderId ?? 'N/A'}`,
      `Paid    : ${params.orderTotal ?? '0.00'}`,
      ``,
      `This message is your receipt. We hope to see you again soon.`,
    ].join('\n');
  }
  if (params.action === 'table_available') {
    return `Hi${name}! Great news — table ${params.tableNumber ?? ''} is now available. Please visit the restaurant soon to claim your table.`;
  }
  if (params.action === 'order_confirmation') {
    return [
      `Hi${name}! Your order has been confirmed. 🎉`,
      ``,
      `Order ID : ${params.orderId ?? 'N/A'}`,
      `Table    : ${params.tableNumber ?? 'N/A'}`,
      ``,
      `Items:`,
      params.orderItems ?? '  (no items)',
      ``,
      `Total    : ${params.orderTotal ?? '$0.00'}`,
      ``,
      `Thank you for dining with us! We will have everything ready when you arrive.`,
    ].join('\n');
  }
  return `Hi${name}! Notification from the restaurant.`;
}

export function mailSubject(
  action:
    | 'waitlist_notified'
    | 'reservation_reminder'
    | 'reservation_confirmed'
    | 'table_available'
    | 'order_confirmation'
    | 'low_stock_alert'
    | 'payment_receipt'
): string {
  if (action === 'order_confirmation') return 'Your order is confirmed! 🍽️';
  if (action === 'reservation_confirmed') return 'Your reservation is confirmed';
  if (action === 'low_stock_alert') return 'Low stock alert';
  if (action === 'payment_receipt') return 'Payment received — your receipt';
  if (action === 'table_available') return 'Your table is ready!';
  if (action === 'reservation_reminder') return 'Reservation reminder';
  return 'Restaurant notification';
}
