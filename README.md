This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.jsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Booking and PayPal

The app now includes a booking flow with PayPal checkout and organizer access to bookings in the dashboard.

Required environment variables:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV` (`sandbox` or `live`)
- `PAYPAL_WEBHOOK_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MOLLIE_ENV` (`test` or `live`)
- `MOLLIE_API_KEY`
- `TICKET_QR_SECRET`

The booking flow creates a booking record first, then redirects to PayPal, Stripe, or Mollie when an online method is selected. After the provider returns, the checkout page finalizes the booking automatically. PayPal webhooks should be configured for `/api/paypal/webhook`, Stripe webhooks for `/api/stripe/webhook`, and Mollie Pay by Bank webhooks for `/api/payments/mollie/webhook` so the server can reconcile completed, denied, voided, expired, canceled, and refunded payments even when the browser return flow is interrupted.

## Payments and transfers

Copy `.env.example` to `.env.local` and fill in these variables:

- `DATABASE_URL` and `DIRECT_URL`
- `APP_URL` and `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_CURRENCY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CURRENCY`
- `MOLLIE_ENV`
- `MOLLIE_API_KEY`
- `MOLLIE_WEBHOOK_SECRET`
- `MOLLIE_CURRENCY`
- `MOLLIE_ALLOW_TEST_IN_PRODUCTION`
- `EMAIL_FROM`
- `EMAIL_PROVIDER` (`auto`, `resend`, or `smtp`)
- `RESEND_API_KEY` (recommended for production mail)
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_SERVER_SECURE` (`true` for port 465, otherwise optional)
- `BANK_TRANSFER_ACCOUNT_HOLDER`
- `BANK_TRANSFER_IBAN`
- `BANK_TRANSFER_BIC`
- `PAYMENT_REMINDER_INTERVALS`
- `PAYMENT_AUTO_CANCEL_AFTER_DAYS`
- `CRON_SECRET`
- `TICKET_QR_SECRET`
- `SCANNER_LINK_SECRET`

Then run:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run check:system -- --skip-network
npm run dev
```

## Environment and deployment checks

GateKeeper has a central environment validator in `src/lib/env.js` and a CI/CD-friendly system check:

```bash
npm run check:system
```

The check covers:

- environment structure and required variables
- database URL format and a `SELECT 1` probe
- Prisma Client generation
- Supabase URL, anon key, service role key, and Auth health reachability
- redirect base URL for `/auth` and `/auth/reset-password`
- PayPal mode, credentials, currency, and token endpoint reachability
- Stripe credentials, webhook configuration, currency, and account reachability
- Mollie mode, API key, currency, and webhook status configuration
- transactional mail provider availability

Use this when network access is not available, for example in lightweight CI:

```bash
npm run check:system -- --skip-network
```

Production rules:

- `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, Supabase keys, PayPal config including `PAYPAL_WEBHOOK_ID`, Stripe config including `STRIPE_WEBHOOK_SECRET`, mail config, `TICKET_QR_SECRET`, `SCANNER_LINK_SECRET`, and `CRON_SECRET` must be explicit.
- `APP_URL` and `NEXT_PUBLIC_APP_URL` must be HTTPS, must not point to localhost, must not end with a slash, and should match.
- `PAYPAL_ENV=sandbox` is rejected in production unless `PAYPAL_ALLOW_SANDBOX_IN_PRODUCTION=true` is intentionally set.
- `MOLLIE_ENV=test` is rejected in production when `MOLLIE_API_KEY` is set unless `MOLLIE_ALLOW_TEST_IN_PRODUCTION=true` is intentionally set.
- Missing mail provider credentials are a production error because ticket/payment/reminder/cancellation mails depend on them.
- Runtime code no longer falls back to database URLs, ticket secrets, or scanner secrets derived from unrelated env vars in production.

Manual dashboard checks before production:

- Supabase Dashboard > Authentication > URL Configuration:
  - Site URL must be `APP_URL`.
  - Additional Redirect URLs must include `${APP_URL}/auth` and `${APP_URL}/auth/reset-password`.
  - Local development may additionally include `http://localhost:3000/auth`, `http://localhost:3000/auth/reset-password`, `http://localhost:3001/auth`, and `http://localhost:3001/auth/reset-password`.
- Supabase Dashboard > Authentication > SMTP Settings:
  - Configure the sender domain and SMTP provider used by Supabase Auth signup/password-reset mails.
- PayPal Developer Dashboard:
  - Production must use live app credentials when `PAYPAL_ENV=live`.
  - Sandbox credentials are only acceptable for staging or intentional production tests.
  - Create a webhook endpoint for `${APP_URL}/api/paypal/webhook`.
  - Subscribe to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.COMPLETED`, and `CHECKOUT.ORDER.VOIDED`.
  - Store the resulting webhook ID as `PAYPAL_WEBHOOK_ID`.
- Stripe Dashboard:
  - Production must use live secret keys.
  - Create a webhook endpoint for `${APP_URL}/api/stripe/webhook`.
  - Subscribe to `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`.
  - Store the signing secret as `STRIPE_WEBHOOK_SECRET`.
- Mollie Dashboard:
  - Use a test API key for local or staging sandbox checks and a live API key only for production.
  - Ensure Pay by Bank is available for the Mollie profile before enabling `MOLLIE_PAY_BY_BANK` for public events.
  - The checkout request sends `${APP_URL}/api/payments/mollie/webhook` as the webhook URL.
  - The webhook only needs to deliver Mollie's payment `id`; GateKeeper reloads the payment status server-side before changing booking state.
- Mail provider dashboard:
  - Verify the sender domain used by `EMAIL_FROM`.
  - For Resend, the API key must belong to the verified domain.
  - For SMTP, host, port, user, password, and TLS mode must match the provider.
- Vercel Project > Settings > Environment Variables:
  - Set all production variables from `.env.example` without placeholder values.
  - Do not expose server-only secrets as `NEXT_PUBLIC_*`.

For manual payment flows:

- `Rechnung` and `Banküberweisung` are stored as open bookings with a payment reference.
- The organizer can mark them as paid in the dashboard.
- Payment reminders can be resent from the bookings view.
- The confirmation page shows the bank details from the env vars above.
- Automatic reminder jobs run through `POST /api/cron/payment-reminders` or `GET /api/cron/payment-reminders`.
- Operational cleanup runs through `POST /api/cron/maintenance` or `GET /api/cron/maintenance`.
- Protect that endpoint with `CRON_SECRET` in production.
- The default reminder schedule is `3,7,14` days after booking unless you override it.
- Manual bookings are automatically cancelled after `PAYMENT_AUTO_CANCEL_AFTER_DAYS` days, default `30`.
- Maintenance removes expired rate-limit buckets, old system events, and expired/revoked scanner link sessions. Ticket bookings and scan logs are retained.

Vercel setup:

- The repo includes `vercel.json` with daily crons for payment reminders at `07:00 UTC` and maintenance at `02:30 UTC`.
- Vercel cron requests can call `/api/cron/payment-reminders` and `/api/cron/maintenance` directly.
- For manual tests or external schedulers, send `x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`.
- Do not put cron secrets in query strings in production.

For PayPal:

- Set `PAYPAL_ENV=sandbox` for testing or `live` for production.
- Make sure the organizer profile has a PayPal email if you want funds to go directly to the organizer.

For Stripe:

- Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` before offering Stripe checkout.
- Stripe checkout currently collects card payments through Stripe Checkout.
- Organizer payment-method selection shows estimated provider transaction costs for PayPal and Stripe.
- GateKeeper does not add service fees or hidden charges; customer totals equal ticket price times quantity.

For email delivery:

- Production should configure either Resend (`RESEND_API_KEY` + `EMAIL_FROM`) or SMTP (`EMAIL_SERVER_HOST`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_FROM`).
- `EMAIL_PROVIDER=auto` tries Resend first when configured, then SMTP. Use `EMAIL_PROVIDER=smtp` or `EMAIL_PROVIDER=resend` to force one provider.
- Registration and password-reset mails are sent by Supabase Auth directly for maximum stability.
- Configure Supabase Auth SMTP, sender identity, and allowed redirect URLs in the Supabase project.
- GateKeeper's Resend/SMTP settings are used for ticket, payment, reminder, cancellation, and event-alert mails.
- Send a live transactional smoke test with `npm run mail:test -- --to you@example.com` after setting `EMAIL_PROVIDER`, `EMAIL_FROM`, and the provider credentials.

For ticket security:

- Set a strong `TICKET_QR_SECRET` in every environment.
- Ticket QR codes are signed and the check-in flow rejects tampered codes.

## Security hardening

- Mutating API requests are checked for same-origin access before route handlers run.
- Public write-heavy endpoints have IP rate limits and request-size limits.
- Login, registration, booking, event creation, and event updates validate JSON size server-side.
- Bot honeypot fields are included in public forms and rejected server-side.
- Security headers are set globally through `src/proxy.js`.
