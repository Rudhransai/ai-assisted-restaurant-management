export function renderRestaurantMailContent(params: {
  guestName?: string;
  action: 'waitlist_notified' | 'reservation_reminder' | 'table_available' | 'order_confirmation';
  time?: string;
  tableNumber?: string;
  orderTotal?: string;
  orderItems?: string;
  orderId?: string;
}): string {
  const name = params.guestName ? ` ${params.guestName}` : '';
  if (params.action === 'waitlist_notified') {
    return `Hi${name}! You have been notified. Please proceed with your table assignment at the restaurant.`;
  }
  if (params.action === 'reservation_reminder') {
    return `Hi${name}! This is your reservation reminder${params.time ? ` for ${params.time}` : ''}. See you soon!`;
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
  action: 'waitlist_notified' | 'reservation_reminder' | 'table_available' | 'order_confirmation'
): string {
  if (action === 'order_confirmation') return 'Your order is confirmed! 🍽️';
  if (action === 'table_available') return 'Your table is ready!';
  if (action === 'reservation_reminder') return 'Reservation reminder';
  return 'Restaurant notification';
}
