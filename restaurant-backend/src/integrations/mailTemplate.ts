export function renderRestaurantMailContent(params: {
  guestName?: string;
  action: 'waitlist_notified' | 'reservation_reminder' | 'table_available';
  time?: string;
  tableNumber?: string;
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
  return `Hi${name}! Notification from the restaurant.`;
}
