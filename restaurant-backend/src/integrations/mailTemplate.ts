export function renderRestaurantMailContent(params: {
  guestName?: string;
  action: 'waitlist_notified' | 'reservation_reminder' | 'reservation_confirmed' | 'table_available' | 'order_confirmation' | 'low_stock_alert' | 'payment_receipt';
  partySize?: number;
  alertItems?: string;
  time?: string;
  tableNumber?: string;
  orderTotal?: string;
  orderItems?: string;
  orderId?: string;
  /** Reservation id shown as a booking reference the guest can quote. */
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
      `This is a reminder for your table reservation${params.time ? ` at ${params.time}` : ' today'}.`,
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
    lines.push('', 'Thank you, see you soon!');
    return lines.join('\n');
  }
  if (params.action === 'reservation_confirmed') {
    const party = params.partySize ? ` Party Size: ${params.partySize}.` : '';
    const table = params.tableNumber ? ` Table: ${params.tableNumber}.` : '';
    const ref = params.reference ? ` Ref: ${params.reference}.` : '';
    return `Hi${name}, your reservation is confirmed!${params.time ? ` Time: ${params.time}.` : ''}${party}${table}${ref} We look forward to seeing you.`;
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
