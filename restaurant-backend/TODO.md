# TODO - Mail/WhatsApp Integration (one-by-one)

## Step 1: Notification sender abstraction
- [ ] Create `src/integrations/notificationSender.ts`
  - [ ] SMTP mail via Nodemailer
  - [ ] WhatsApp via Twilio
  - [ ] Env var validation + safe logging

## Step 2: Wire Waitlist notification to actual sender (whatsapp first)
- [ ] Update `src/services/restaurantDbStore.ts` `notifyWaitlistEntry()`
  - [ ] Call sender with `type='whatsapp'`
  - [ ] Update `notifications.status` based on send result

## Step 3: Wire reminders to actual sender (mail then whatsapp)
- [ ] Update `src/services/restaurantDbStore.ts` `sendReminders()`
  - [ ] Send via mail first (if email exists; if not, fall back to whatsapp)
  - [ ] Update `notifications.status` per send result

## Step 4: Add required dependencies
- [ ] Update `restaurant-backend/package.json` to include:
  - [ ] nodemailer
  - [ ] twilio

## Step 5: (Optional follow-up) Align ReminderScheduler
- [ ] If needed, update `src/services/reminderScheduler.ts` to use `sendReminders()` so it matches the same schema & sender.
