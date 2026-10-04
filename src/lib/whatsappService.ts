import { BookingRecord, CourtId, COURTS } from "@/lib/bookingStore";
import { formatToE164 } from "@/lib/phoneValidation";

// Kept server-side: never expose a Cloud API access token with NEXT_PUBLIC_.
export const OWNER_WHATSAPP_NUMBER =
  process.env.OWNER_WHATSAPP_NUMBER ||
  process.env.NEXT_PUBLIC_OWNER_WHATSAPP ||
  "919952323211";

export type WhatsAppNotificationResult = {
  success: boolean;
  customerSent: boolean;
  ownerSent: boolean;
  details: string;
};

export type WhatsAppTemplatePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: [
      {
        type: "body";
        parameters: Array<{ type: "text"; text: string }>;
      },
    ];
  };
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

/**
 * Single court name formatter shared by both customer and owner templates:
 * e.g. "Full Turf", "Court 1", "Court 2"
 */
export function formatCourtName(courtId: CourtId): string {
  const court = COURTS[courtId];
  return court ? court.name : "Full Turf";
}

/**
 * Formats Indian phone number with "+" for notification body text:
 * e.g. "9688689556" -> "+919688689556"
 */
export function formatPhoneWithPlus(phone: string): string {
  const digits = formatToE164(phone);
  if (!digits) return phone.startsWith("+") ? phone : `+${phone}`;
  return `+${digits}`;
}

/**
 * Formats date for owner template:
 * e.g. "2026-09-19" -> "Sat, 19 Sept, 2026"
 */
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
 * Formats date for customer template:
 * e.g. "2026-09-06" -> "Sunday, September 6, 2026"
 */
export function formatCustomerDate(dateStr: string): string {
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

/**
 * Shared time range formatter for both customer and owner:
 * e.g. "09:00 PM - 11:00 PM"
 */
export function formatTimeSlot(startTime?: string, endTime?: string): string {
  return startTime && endTime ? `${startTime} - ${endTime}` : "Scheduled Time";
}

/**
 * Builds the 10-parameter body template payload for customer notification:
 * Template: `turf_booking_customer_notify`
 *
 *  {{1}} Customer Name    e.g. "Mohamed Arief"
 *  {{2}} Booking Ref      e.g. "TRF-CF92BF08"
 *  {{3}} Court Name       e.g. "Full Turf"
 *  {{4}} Sport            e.g. "Football"
 *  {{5}} Formatted Date   e.g. "Sunday, September 6, 2026"
 *  {{6}} Time Slot        e.g. "10:00 PM - 01:00 AM"
 *  {{7}} Paid Amount      e.g. "300"
 *  {{8}} Payment ID       e.g. "pay_TYLQbdRcsePvPN"
 *  {{9}} Payment Type     e.g. "Advance" / "Paid"
 *  {{10}} Balance Due     e.g. "700"
 */
export function buildCustomerPayload(
  booking: BookingRecord,
  toPhone = booking.customerPhone,
  templateName = process.env.WHATSAPP_TEMPLATE_CUSTOMER ||
    "turf_booking_customer_notify",
  lang = process.env.WHATSAPP_TEMPLATE_LANG || "en",
): WhatsAppTemplatePayload {
  const isAdvance = booking.paymentType === "ADVANCE";
  const parameters = [
    (booking.customerName || "Customer").trim() || "Customer", // {{1}}
    booking.bookingRef || "TRF-CF92BF08", // {{2}}
    formatCourtName(booking.courtId), // {{3}}
    booking.sportType?.trim() || "Football", // {{4}}
    formatCustomerDate(booking.date), // {{5}}
    formatTimeSlot(booking.startTime, booking.endTime), // {{6}}
    String(booking.priceTotal ?? 0), // {{7}}
    booking.paymentId || "PAID", // {{8}}
    isAdvance ? "Advance" : "Paid", // {{9}}
    String(booking.balanceDue ?? 0), // {{10}}
  ];

  return {
    messaging_product: "whatsapp",
    to: formatToE164(toPhone),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

/**
 * Builds the 13-parameter body template payload for owner notification:
 * Template: `turf_booking_owner_notify`
 *
 *  {{1}} Customer Name    e.g. "Mohamed Arief"
 *  {{2}} Customer Phone   e.g. "+919688689556"
 *  {{3}} Booking Ref      e.g. "TRF-985BBE38"
 *  {{4}} Court Name       e.g. "Full Turf"
 *  {{5}} Formatted Date   e.g. "Sat, 19 Sept, 2026"
 *  {{6}} Time Slot        e.g. "09:00 PM - 11:00 PM"
 *  {{7}} Sport            e.g. "Cricket"
 *  {{8}} Team Name        e.g. "Not provided"
 *  {{9}} Paid Amount      e.g. "300"
 *  {{10}} Payment Status  e.g. "Advance via UPI" / "Paid via UPI"
 *  {{11}} Payment ID      e.g. "pay_Tdo4ZD9HYAuJPA"
 *  {{12}} Order ID        e.g. "order_Tdo4QUBFNj0BoX"
 *  {{13}} Balance Due     e.g. "700"
 */
export function buildOwnerPayload(
  booking: BookingRecord,
  toPhone = OWNER_WHATSAPP_NUMBER,
  templateName = process.env.WHATSAPP_TEMPLATE_OWNER ||
    "turf_booking_owner_notify",
  lang = process.env.WHATSAPP_TEMPLATE_LANG || "en",
): WhatsAppTemplatePayload {
  const isAdvance = booking.paymentType === "ADVANCE";
  const parameters = [
    (booking.customerName || "Customer").trim() || "Customer", // {{1}}
    formatPhoneWithPlus(booking.customerPhone), // {{2}}
    booking.bookingRef || "TRF-PENDING", // {{3}}
    formatCourtName(booking.courtId), // {{4}}
    formatOwnerDate(booking.date), // {{5}}
    formatTimeSlot(booking.startTime, booking.endTime), // {{6}}
    booking.sportType?.trim() || "Cricket", // {{7}}
    booking.teamName?.trim() || "Not provided", // {{8}}
    String(booking.priceTotal ?? 0), // {{9}}
    isAdvance ? "Advance via UPI" : "Paid via UPI", // {{10}}
    booking.paymentId || "Not available", // {{11}}
    booking.orderId || "Not available", // {{12}}
    String(booking.balanceDue ?? 0), // {{13}}
  ];

  return {
    messaging_product: "whatsapp",
    to: formatToE164(toPhone),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

/** Convenience getters returning parameter strings array */
export function buildCustomerTemplateParams(booking: BookingRecord): string[] {
  return buildCustomerPayload(booking).template.components[0].parameters.map(
    (p) => p.text,
  );
}

export function buildOwnerTemplateParams(booking: BookingRecord): string[] {
  return buildOwnerPayload(booking).template.components[0].parameters.map(
    (p) => p.text,
  );
}

/**
 * Sends a WhatsApp Cloud API template payload to Meta Graph API.
 */
async function sendCloudPayload(
  endpoint: string,
  token: string,
  payload: WhatsAppTemplatePayload,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  console.log(
    `[WhatsApp Cloud API] Dispatched to ${payload.to} (Status ${response.status}):`,
    responseText,
  );

  if (!response.ok) {
    throw new Error(`Cloud API error (${response.status}): ${responseText}`);
  }
}

/**
 * Sends WhatsApp notifications to customer and owner.
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

    console.log("booking", booking);

    const token =
      process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
    const phoneNumberId =
      process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID ||
      process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.warn(
        "[WhatsApp] WhatsApp Cloud API credentials not configured. Skipping notifications.",
      );
      return {
        success: false,
        customerSent: false,
        ownerSent: false,
        details: "WhatsApp Cloud API credentials not configured.",
      };
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const customerPayload = buildCustomerPayload(booking);
    const ownerPayload = buildOwnerPayload(booking);

    const tasks: Promise<void>[] = [];
    let customerTaskIndex = -1;
    let ownerTaskIndex = -1;

    if (customerPayload.to) {
      customerTaskIndex = tasks.length;
      tasks.push(sendCloudPayload(endpoint, token, customerPayload));
    }

    if (ownerPayload.to) {
      ownerTaskIndex = tasks.length;
      tasks.push(sendCloudPayload(endpoint, token, ownerPayload));
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
