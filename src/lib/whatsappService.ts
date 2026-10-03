import { BookingRecord, CourtId, COURTS } from "@/lib/bookingStore";
import { formatToE164 } from "@/lib/phoneValidation";

// Kept server-side: never expose a Cloud API access token with NEXT_PUBLIC_.
export const OWNER_WHATSAPP_NUMBER =
  process.env.OWNER_WHATSAPP_NUMBER ||
  process.env.NEXT_PUBLIC_OWNER_WHATSAPP ||
  "919952323211";

export const VENUE_GPS_LINK =
  process.env.NEXT_PUBLIC_VENUE_GPS_LINK ||
  "https://maps.google.com/?q=11.2333,78.8833";

export const DEFAULT_VENUE_NAME =
  process.env.WHATSAPP_VENUE_NAME || "OnePitch Turf, Perambalur";

export type WhatsAppNotificationResult = {
  success: boolean;
  customerSent: boolean;
  ownerSent: boolean;
  details: string;
};

// Simple deduplication cache to prevent duplicate WhatsApp messages within 60s
const recentlyDispatched = new Map<string, number>();

function isRecentlyDispatched(ref: string): boolean {
  const lastTime = recentlyDispatched.get(ref);
  const now = Date.now();
  if (lastTime && now - lastTime < 60000) {
    return true;
  }
  recentlyDispatched.set(ref, now);
  // Housekeeping: remove items older than 5 minutes
  if (recentlyDispatched.size > 200) {
    for (const [key, timestamp] of recentlyDispatched.entries()) {
      if (now - timestamp > 300000) {
        recentlyDispatched.delete(key);
      }
    }
  }
  return false;
}

export function getCourtLabel(courtId: string): string {
  if (courtId === "F") return "Full Ground (F)";
  const court = COURTS[courtId as keyof typeof COURTS];
  return court ? `${court.name} (${courtId})` : courtId;
}

export function formatCourtText(courtId: CourtId): string {
  const court = COURTS[courtId];
  if (!court) return courtId;
  return court.subtitle ? `${court.name} — ${court.subtitle}` : court.name;
}

export function getOwnerCourtName(courtId: CourtId): string {
  if (courtId === "F") return "Full turf";
  const court = COURTS[courtId];
  return court ? court.name : courtId;
}

export function formatPhoneWithPlus(phone: string): string {
  const digits = formatToE164(phone);
  if (!digits) return phone.startsWith("+") ? phone : `+${phone}`;
  return `+${digits}`;
}

export function formatDateDisplay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateStr
    : date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function formatTemplateDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatOwnerDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
    const monthShort = date.toLocaleDateString("en-US", { month: "short" });
    const formattedMonth = monthShort === "Sep" ? "Sept" : monthShort;
    return `${weekday}, ${day} ${formattedMonth}, ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Builds the 13 body parameters for Meta's `turf_booking_owner_notify` WhatsApp template:
 *
 *  {{1}} Customer Name       e.g. "Mohamed Arief"
 *  {{2}} Customer Phone      e.g. "+919688689556"
 *  {{3}} Booking Ref         e.g. "TRF-985BBE38"
 *  {{4}} Court Name          e.g. "Full turf"
 *  {{5}} Formatted Date      e.g. "Sat, 19 Sept, 2026"
 *  {{6}} Time Slot           e.g. "09:00 PM - 11:00 PM"
 *  {{7}} Sport               e.g. "Cricket"
 *  {{8}} Team Name           e.g. "Not provided"
 *  {{9}} Paid Amount         e.g. "300"
 *  {{10}} Payment Status     e.g. "Advance via UPI"
 *  {{11}} Payment ID         e.g. "pay_Tdo4ZD9HYAuJPA"
 *  {{12}} Order ID           e.g. "order_Tdo4QUBFNj0BoX"
 *  {{13}} Balance Due        e.g. "700"
 */
export function buildOwnerTemplateParams(booking: BookingRecord): string[] {
  const customerName =
    (booking.customerName || "Customer").trim() || "Customer";
  const customerPhone = formatPhoneWithPlus(booking.customerPhone);
  const bookingRef = booking.bookingRef || "TRF-PENDING";
  const courtName = getOwnerCourtName(booking.courtId);
  const dateText = formatOwnerDate(booking.date);
  const timeText =
    booking.startTime && booking.endTime
      ? `${booking.startTime} - ${booking.endTime}`
      : "Scheduled Time";
  const sportText = booking.sportType?.trim() || "Cricket";
  const teamText = booking.teamName?.trim() || "Not provided";
  const advanceText = String(booking.priceTotal ?? 0);
  const paymentMethodText =
    booking.paymentType === "ADVANCE" ? "Advance via UPI" : "Paid via UPI";
  const paymentIdText = booking.paymentId || "Not available";
  const orderIdText = booking.orderId || "Not available";
  const balanceText = String(booking.balanceDue ?? 0);

  return [
    customerName,
    customerPhone,
    bookingRef,
    courtName,
    dateText,
    timeText,
    sportText,
    teamText,
    advanceText,
    paymentMethodText,
    paymentIdText,
    orderIdText,
    balanceText,
  ];
}

/**
 * Builds the 10 body parameters for Meta's `turf_booking_customer_notify` WhatsApp template:
 *
 *  {{1}} Customer Name       e.g. "Mohamed Arief"
 *  {{2}} Booking Ref         e.g. "TRF-CF92BF08"
 *  {{3}} Court & Subtitle    e.g. "Full Turf — Entire Turf (C1 + C2)"
 *  {{4}} Sport               e.g. "Football"
 *  {{5}} Formatted Date      e.g. "Sunday, September 6, 2026"
 *  {{6}} Time Slot           e.g. "10:00 PM – 01:00 AM"
 *  {{7}} Paid Amount         e.g. "300"
 *  {{8}} Payment ID          e.g. "pay_TYLQbdRcsePvPN"
 *  {{9}} Payment Type        e.g. "Advance"
 *  {{10}} Balance Due        e.g. "700"
 */
export function buildCustomerTemplateParams(booking: BookingRecord): string[] {
  const customerName =
    (booking.customerName || "Customer").trim() || "Customer";
  const bookingRef = booking.bookingRef || "TRF-CF92BF08";
  const courtText = formatCourtText(booking.courtId) || "OnePitch Turf";
  const sportText = booking.sportType?.trim() || "Football";
  const dateText = formatTemplateDate(booking.date) || "Scheduled Date";
  const timeText =
    booking.startTime && booking.endTime
      ? `${booking.startTime} – ${booking.endTime}`
      : "Scheduled Time";
  const advanceText = String(booking.priceTotal ?? 0);
  const paymentIdText = booking.paymentId || "PAID";
  const paymentTypeText = booking.paymentType === "ADVANCE" ? "Advance" : "Paid";
  const balanceText = String(booking.balanceDue ?? 0);

  return [
    customerName,
    bookingRef,
    courtText,
    sportText,
    dateText,
    timeText,
    advanceText,
    paymentIdText,
    paymentTypeText,
    balanceText,
  ];
}

/**
 * Legacy builder for Meta's approved 11-parameter `turf_slot_booking_alert` template:
 */
export function buildBookingConfirmedTemplateParams(
  booking: BookingRecord,
): string[] {
  const courtText = formatCourtText(booking.courtId) || "OnePitch Turf";
  const dateText = formatTemplateDate(booking.date) || "Scheduled Date";
  const timeText =
    booking.startTime && booking.endTime
      ? `${booking.startTime} – ${booking.endTime}`
      : "Scheduled Time";
  const durationText = `${booking.durationHours || 1} ${Number(booking.durationHours) === 1 ? "Hour" : "Hours"}`;
  const priceText = Number(booking.priceTotal || 0).toLocaleString("en-IN");
  const sportText = booking.sportType || "Football";
  const venueText = DEFAULT_VENUE_NAME || "OnePitch Turf, Perambalur";
  const paymentMethodText = booking.paymentMethod || "UPI";
  const paymentIdText = booking.paymentId || booking.orderId || "PAID";

  return [
    (booking.customerName || "Customer").trim() || "Customer", // {{1}} Mohamed Arief
    booking.bookingRef || "TRF-PENDING", // {{2}} TRF-CF92BF08
    venueText, // {{3}} OnePitch Turf, Perambalur
    courtText, // {{4}} Full Turf — Entire Turf (C1 + C2)
    sportText, // {{5}} Football
    dateText, // {{6}} Sunday, September 6, 2026
    timeText, // {{7}} 10:00 PM – 01:00 AM
    durationText, // {{8}} 3 Hours
    priceText, // {{9}} 4,500
    paymentMethodText, // {{10}} UPI
    paymentIdText, // {{11}} pay_TYLQbdRcsePvPN
  ];
}

export function generateCustomerTicketMessage(booking: BookingRecord): string {
  const duration = `${booking.durationHours} ${booking.durationHours === 1 ? "hour" : "hours"}`;
  const isAdvance = booking.paymentType === "ADVANCE";
  return [
    "ONEPITCH TURF - BOOKING CONFIRMED",
    `Hello ${booking.customerName}, your booking is confirmed.`,
    `Booking ID: ${booking.bookingRef}`,
    `Court: ${getCourtLabel(booking.courtId)}`,
    `Date: ${formatDateDisplay(booking.date)}`,
    `Time: ${booking.startTime} - ${booking.endTime} (${duration})`,
    `Sport: ${booking.sportType || "Football"}`,
    booking.teamName ? `Team: ${booking.teamName}` : "",
    `${isAdvance ? "Advance paid" : "Amount paid"}: Rs. ${Number(booking.priceTotal || 0).toLocaleString("en-IN")}`,
    booking.balanceDue && booking.balanceDue > 0
      ? `Balance due: Rs. ${Number(booking.balanceDue).toLocaleString("en-IN")}`
      : "",
    `Payment ID: ${booking.paymentId || "PAID"}`,
    "Venue: OnePitch Turf, Collector Office Road, Perambalur",
    `Location: ${VENUE_GPS_LINK}`,
    "Please arrive 10 minutes before your slot. Thank you!",
  ]
    .filter(Boolean)
    .join("\n");
}

export function generateOwnerAlertMessage(booking: BookingRecord): string {
  const isAdvance = booking.paymentType === "ADVANCE";
  return [
    "*NEW ONEPITCH TURF BOOKING*",
    "",
    `*Booking ID:* ${booking.bookingRef}`,
    "",
    "*CUSTOMER DETAILS*",
    `*Customer:* ${booking.customerName}`,
    `*Phone:* +${formatToE164(booking.customerPhone)}`,
    "",
    "*BOOKING DETAILS*",
    `*Court:* ${formatCourtText(booking.courtId)}`,
    `*Date:* ${formatOwnerDate(booking.date)}`,
    `*Time:* ${booking.startTime} - ${booking.endTime}`,
    `*Sport:* ${booking.sportType || "Cricket"}`,
    `*Team:* ${booking.teamName || "Not provided"}`,
    "",
    "*PAYMENT DETAILS*",
    `*${isAdvance ? "Advance Paid" : "Amount"}:* Rs. ${Number(booking.priceTotal || 0).toLocaleString("en-IN")}`,
    booking.balanceDue && booking.balanceDue > 0
      ? `*Balance Due:* Rs. ${Number(booking.balanceDue).toLocaleString("en-IN")}`
      : "",
    `*Payment Status:* ${isAdvance ? "Advance via UPI" : "Paid via UPI"}`,
    `*Payment ID:* ${booking.paymentId || "Not available"}`,
    `*Order ID:* ${booking.orderId || "Not available"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getCustomerWhatsAppUrl(booking: BookingRecord): string {
  return `https://wa.me/${formatToE164(booking.customerPhone)}?text=${encodeURIComponent(generateCustomerTicketMessage(booking))}`;
}

export function getOwnerWhatsAppUrl(booking: BookingRecord): string {
  return `https://wa.me/${formatToE164(OWNER_WHATSAPP_NUMBER)}?text=${encodeURIComponent(generateOwnerAlertMessage(booking))}`;
}

/**
 * Sends a WhatsApp Cloud API template message matching Meta's official API schema.
 */
async function sendCloudTemplateMessage(params: {
  endpoint: string;
  token: string;
  to: string;
  templateName: string;
  lang: string;
  parameters: string[];
}): Promise<void> {
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.lang,
      },
      components: [
        {
          type: "body",
          parameters: params.parameters.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
    },
  };

  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  console.log(
    `[WhatsApp Cloud API] Dispatched to ${params.to} (Status ${response.status}):`,
    responseText,
  );

  if (!response.ok) {
    throw new Error(`Cloud API error (${response.status}): ${responseText}`);
  }
}

async function sendGateway(to: string, body: string): Promise<void> {
  const url = process.env.WHATSAPP_GATEWAY_URL;
  const token = process.env.WHATSAPP_GATEWAY_TOKEN;
  if (!url || !token) {
    throw new Error(
      "WhatsApp is not configured. Add Cloud API credentials or gateway credentials.",
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, body }),
  });
  if (!response.ok) {
    throw new Error(`Gateway ${response.status}: ${await response.text()}`);
  }
}

/**
 * Sends WhatsApp notification to customer and owner.
 * Guaranteed to never throw so that payment and booking flows never fail.
 */
export async function sendDualWhatsAppNotifications(
  booking: BookingRecord,
): Promise<WhatsAppNotificationResult> {
  try {
    if (booking.bookingRef && isRecentlyDispatched(booking.bookingRef)) {
      return {
        success: true,
        customerSent: true,
        ownerSent: true,
        details: `Notification already dispatched for ${booking.bookingRef} (deduplicated).`,
      };
    }

    const token =
      process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
    const phoneNumberId =
      process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ||
      process.env.WHATSAPP_PHONE_NUMBER_ID;

    // Check Cloud API credentials
    if (token && phoneNumberId) {
      const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
      const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en";
      const customerTemplate =
        process.env.WHATSAPP_TEMPLATE_CUSTOMER ||
        "turf_booking_customer_notify";
      const ownerTemplate =
        process.env.WHATSAPP_TEMPLATE_OWNER || "turf_booking_owner_notify";

      const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
      const customerParams =
        customerTemplate === "turf_booking_customer_notify"
          ? buildCustomerTemplateParams(booking)
          : buildBookingConfirmedTemplateParams(booking);

      const ownerParams =
        ownerTemplate === "turf_booking_owner_notify"
          ? buildOwnerTemplateParams(booking)
          : ownerTemplate === "turf_booking_customer_notify"
            ? buildCustomerTemplateParams(booking)
            : buildBookingConfirmedTemplateParams(booking);

      const customerPhone = formatToE164(booking.customerPhone);
      const ownerPhone = formatToE164(OWNER_WHATSAPP_NUMBER);

      const tasks: Promise<void>[] = [];
      let customerTaskIndex = -1;
      let ownerTaskIndex = -1;

      if (customerPhone) {
        customerTaskIndex = tasks.length;
        tasks.push(
          sendCloudTemplateMessage({
            endpoint,
            token,
            to: customerPhone,
            templateName: customerTemplate,
            lang,
            parameters: customerParams,
          }),
        );
      }

      if (ownerPhone) {
        ownerTaskIndex = tasks.length;
        tasks.push(
          sendCloudTemplateMessage({
            endpoint,
            token,
            to: ownerPhone,
            templateName: ownerTemplate,
            lang,
            parameters: ownerParams,
          }),
        );
      }

      const results = await Promise.allSettled(tasks);
      const customerSent =
        customerTaskIndex >= 0 &&
        results[customerTaskIndex]?.status === "fulfilled";
      const ownerSent =
        ownerTaskIndex >= 0 && results[ownerTaskIndex]?.status === "fulfilled";

      const errors: string[] = [];
      results.forEach((res, i) => {
        if (res.status === "rejected") {
          const recipient = i === customerTaskIndex ? "customer" : "owner";
          errors.push(`${recipient}: ${String(res.reason)}`);
        }
      });

      if (errors.length) {
        console.error(`[WhatsApp] ${booking.bookingRef}: ${errors.join("; ")}`);
      }

      return {
        success: customerSent || ownerSent,
        customerSent,
        ownerSent,
        details: errors.length
          ? errors.join("; ")
          : "Customer and owner WhatsApp notifications sent successfully via Cloud API.",
      };
    }

    // Fallback: Custom Gateway
    if (
      process.env.WHATSAPP_GATEWAY_URL &&
      process.env.WHATSAPP_GATEWAY_TOKEN
    ) {
      const attempts = await Promise.allSettled([
        sendGateway(
          formatToE164(booking.customerPhone),
          generateCustomerTicketMessage(booking),
        ),
        sendGateway(
          formatToE164(OWNER_WHATSAPP_NUMBER),
          generateOwnerAlertMessage(booking),
        ),
      ]);

      const customerSent = attempts[0].status === "fulfilled";
      const ownerSent = attempts[1].status === "fulfilled";
      const errors = attempts.flatMap((attempt, index) =>
        attempt.status === "rejected"
          ? [`${index === 0 ? "customer" : "owner"}: ${String(attempt.reason)}`]
          : [],
      );

      if (errors.length) {
        console.error(
          `[WhatsApp Gateway] ${booking.bookingRef}: ${errors.join("; ")}`,
        );
      }

      return {
        success: customerSent && ownerSent,
        customerSent,
        ownerSent,
        details: errors.length
          ? errors.join("; ")
          : "Dispatched via WhatsApp Gateway.",
      };
    }

    console.warn(
      "[WhatsApp] Neither WhatsApp Cloud API nor Gateway is configured. Skipping notifications.",
    );
    return {
      success: false,
      customerSent: false,
      ownerSent: false,
      details: "WhatsApp is not configured.",
    };
  } catch (error) {
    console.error(
      "[WhatsApp] Unexpected error during notification dispatch:",
      error,
    );
    return {
      success: false,
      customerSent: false,
      ownerSent: false,
      details: `Unexpected error: ${String(error)}`,
    };
  }
}
