# AGENTS.md

Turf booking site: Next.js 15 (App Router) + React 19 + TypeScript (strict), Supabase Postgres, Razorpay (UPI), Resend (email), WhatsApp Cloud API. npm. No test suite, no CI, no README.

## Commands
- `npm run dev` / `npm run build` / `npm start`
- `npm run lint` is `next lint` and is **broken** (eslint is not installed and there is no config) — do not rely on it. Typecheck instead: `npx tsc --noEmit`.
- No tests exist; don't invent a test framework.

## Architecture / booking flow
- UI (`BookingModal.tsx`) → `POST /api/razorpay/create-order` (re-checks availability, holds slots via RPC, creates Razorpay order) → Razorpay checkout → `POST /api/razorpay/verify-payment` (server-side HMAC signature check, confirms booking via RPC). `holdToken` ties the whole flow together.
- `POST /api/bookings` with `action: "confirm"` is a separate no-payment path.
- **Single Source of Truth for Confirmations**: Both `/api/razorpay/verify-payment` and `/api/bookings` delegate directly to `confirmHeldBooking` in `src/lib/bookingService.ts`. This function atomically executes the `confirm_booking` RPC and triggers both email and WhatsApp notifications together, eliminating redundant duplicate notification dispatches in route handlers.
- The browser never queries the `bookings` table. All DB access is through security-definer RPCs in `supabase/migrations/20260905_create_bookings.sql`: `hold_booking`, `attach_booking_order`, `confirm_booking`, `active_booking_slots`. The table has RLS enabled. The migration must be applied to the Supabase project (SQL editor or `supabase db push`) — without it the availability API returns 503 with "apply the bookings migration".
- Hold semantics: `hold_booking` holds slots 5 minutes (`held_until`), serializes per date via `pg_advisory_xact_lock`, and full turf court `F` conflicts with both `C1` and `C2`.
- Fixed turf config (courts, prices ₹200/C1·C2, ₹500/F per hour, and the 20 hourly slots `slot-05-06` … `slot-23-24`, `slot-00-01`) lives only in `src/lib/bookingStore.ts`. Change prices/slots there, and keep in sync with the SQL `court_id` check (`C1|C2|F`) and RPC slot validation.
- Path alias `@/*` → `./src/*`. `next.config.js` has `images.unoptimized: true` (all images are static files under `public/images/`).

## Env & secrets
- Copy `.env.example` → `.env.local`. Use the Supabase **anon/publishable** key as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — never a service_role key. Razorpay needs `NEXT_PUBLIC_RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (server-side only).
- WhatsApp messaging uses Meta's official WhatsApp Business Cloud API with two approved templates (`en` language):
  - **`turf_booking_owner_notify`** (13 body parameters):
    - `{{1}}` Customer Name (e.g. `Mohamed Arief`)
    - `{{2}}` Customer Phone (e.g. `+919688689556`)
    - `{{3}}` Booking Ref (e.g. `TRF-985BBE38`)
    - `{{4}}` Court Name (e.g. `Full turf`)
    - `{{5}}` Formatted Date (e.g. `Sat, 19 Sept, 2026`)
    - `{{6}}` Time Slot (e.g. `09:00 PM - 11:00 PM`)
    - `{{7}}` Sport (e.g. `Cricket`)
    - `{{8}}` Team Name (e.g. `Not provided`)
    - `{{9}}` Paid / Advance Amount in INR (e.g. `300`)
    - `{{10}}` Payment Status (e.g. `Advance via UPI` / `Paid via UPI`)
    - `{{11}}` Payment ID (e.g. `pay_Tdo4ZD9HYAuJPA`)
    - `{{12}}` Order ID (e.g. `order_Tdo4QUBFNj0BoX`)
    - `{{13}}` Balance Due in INR (e.g. `700`)
  - **`turf_booking_customer_notify`** (10 body parameters):
    - `{{1}}` Customer Name (e.g. `Mohamed Arief`)
    - `{{2}}` Booking Ref (e.g. `TRF-CF92BF08`)
    - `{{3}}` Court Name & Subtitle (e.g. `Full Turf — Entire Turf (C1 + C2)`)
    - `{{4}}` Sport (e.g. `Football`)
    - `{{5}}` Formatted Date (e.g. `Sunday, September 6, 2026`)
    - `{{6}}` Time Slot (e.g. `10:00 PM – 01:00 AM`)
    - `{{7}}` Paid / Advance Amount in INR (e.g. `300`)
    - `{{8}}` Payment ID (e.g. `pay_TYLQbdRcsePvPN`)
    - `{{9}}` Payment Type (e.g. `Advance` / `Paid`)
    - `{{10}}` Balance Due in INR (e.g. `700`)
  - `src/lib/whatsappService.ts` (`sendDualWhatsAppNotifications`) is the core engine, supporting both env var naming styles (`WHATSAPP_TOKEN` / `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_CUSTOMER` defaulting to `turf_booking_customer_notify`, `WHATSAPP_TEMPLATE_OWNER` defaulting to `turf_booking_owner_notify`, and `WHATSAPP_TEMPLATE_LANG` defaulting to `en`).
  - Includes a 60-second in-memory deduplication cache per booking reference to guarantee customer and owner never receive duplicate messages across concurrent or retry triggers.
  - `src/lib/whatsappService.ts` (`sendDualWhatsAppNotifications`) is the sole engine, replacing all legacy duplicate files.
- All notification senders are intentionally never-throwing: a broken email/WhatsApp config must never fail or delay a paid booking (see `Promise.allSettled` in `bookingService.ts`, `email.ts`, `whatsappService.ts`). Preserve this invariant.
- Customer phones are validated as Indian 10-digit (starting 6–9) numbers via `src/lib/phoneValidation.ts`; WhatsApp numbers are normalized to E.164 digits (`91…`).