import {
  BookingRecord,
  CalculatedSlot,
  CourtId,
  MASTER_SLOTS,
  PaymentType,
} from "@/lib/bookingStore";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sendBookingConfirmationEmails } from "@/lib/email";
import {
  sendDualWhatsAppNotifications,
  WhatsAppNotificationResult,
} from "@/lib/whatsappService";
import { getCourtPricing } from "@/lib/pricingService";

type DbBooking = {
  id: string;
  booking_ref: string;
  court_id: CourtId;
  booking_date: string;
  slot_ids: string[];
  start_time: string;
  end_time: string;
  duration_hours: number;
  price_total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  team_name: string | null;
  sport_type: string | null;
  status: "HELD" | "CONFIRMED" | "CANCELLED";
  payment_method: "UPI";
  payment_status: "PAID" | "PENDING";
  payment_id: string | null;
  order_id: string | null;
  held_until: string | null;
  created_at: string;
  payment_type: PaymentType;
  balance_due: number;
};

export type BookingInput = {
  courtId: CourtId;
  date: string;
  slotIds: string[];
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  teamName?: string;
  sportType?: string;
  paymentType?: PaymentType;
};

const BUSINESS_TIMEZONE = "Asia/Kolkata";

function getIndiaDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function getIndiaDate() {
  const indiaNow = getIndiaDateTime();
  return `${indiaNow.year}-${String(indiaNow.month).padStart(
    2,
    "0",
  )}-${String(indiaNow.day).padStart(2, "0")}`;
}

function mapBooking(b: DbBooking): BookingRecord {
  return {
    id: b.id,
    bookingRef: b.booking_ref,
    courtId: b.court_id,
    date: b.booking_date,
    slotIds: b.slot_ids,
    startTime: b.start_time,
    endTime: b.end_time,
    durationHours: b.duration_hours,
    priceTotal: b.price_total,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    customerEmail: b.customer_email || "",
    teamName: b.team_name || undefined,
    sportType: b.sport_type || undefined,
    status: b.status,
    paymentMethod: "UPI",
    paymentStatus: b.payment_status,
    paymentId: b.payment_id || undefined,
    paymentType: b.payment_type || "FULL",
    balanceDue: b.balance_due || 0,
    orderId: b.order_id || undefined,
    heldUntil: b.held_until ? new Date(b.held_until).getTime() : undefined,
    createdAt: new Date(b.created_at).getTime(),
  };
}

export async function getSlotDetails(
  courtId: CourtId,
  slotIds: string[],
  paymentType: PaymentType = "FULL",
) {
  const selected = MASTER_SLOTS.filter((slot) =>
    slotIds.includes(slot.id),
  ).sort((a, b) => a.startHour - b.startHour);

  if (selected.length !== slotIds.length) {
    throw new Error("One or more selected slots are invalid.");
  }

  const pricing = await getCourtPricing();
  const courtPricing = pricing[courtId];

  if (!courtPricing) {
    throw new Error(`Pricing not configured for court ${courtId}`);
  }

  const fullPrice = courtPricing.fullPricePerHour * selected.length;
  const advancePrice = courtPricing.advancePricePerHour * selected.length;

  return {
    startTime: selected[0].startTime,
    endTime: selected.at(-1)!.endTime,
    duration: selected.length,
    fullPrice,
    advancePrice,
    totalToPay: paymentType === "ADVANCE" ? advancePrice : fullPrice,
    balanceDue: paymentType === "ADVANCE" ? fullPrice - advancePrice : 0,
  };
}

export async function getAvailability(
  courtId: CourtId,
  date: string,
): Promise<CalculatedSlot[]> {
  const pricing = await getCourtPricing();
  const courtPricing = pricing[courtId];

  if (!courtPricing) {
    throw new Error(`Pricing not configured for court ${courtId}`);
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("active_booking_slots", {
    p_booking_date: date,
  });

  if (error) {
    throw error;
  }

  const bookings = (data || []) as Pick<
    DbBooking,
    "court_id" | "slot_ids" | "status" | "held_until" | "team_name"
  >[];

  const indiaNow = getIndiaDateTime();
  const indiaDate = getIndiaDate();
  const today = indiaDate === date;

  return MASTER_SLOTS.map((slot) => {
    const price = courtPricing.fullPricePerHour;
    const advancePrice = courtPricing.advancePricePerHour;

    const effectiveCurrentHour =
      indiaNow.hour === 0
        ? 24 + indiaNow.minute / 60
        : indiaNow.hour + indiaNow.minute / 60;

    const expiryHour = slot.startHour + 0.5;

    if (today && effectiveCurrentHour >= expiryHour) {
      return {
        ...slot,
        price,
        advancePrice,
        status: "EXPIRED" as const,
        conflictReason: "This time slot has expired.",
      };
    }

    const conflicts = bookings.filter((b) => b.slot_ids.includes(slot.id));
    const blocking = conflicts.find(
      (b) => b.court_id === "F" || courtId === "F" || b.court_id === courtId,
    );

    if (!blocking) {
      return {
        ...slot,
        price,
        advancePrice,
        status: "AVAILABLE" as const,
      };
    }

    const held = blocking.status === "HELD";
    const sameCourt = blocking.court_id === courtId;

    return {
      ...slot,
      price,
      advancePrice,
      status: (sameCourt
        ? held
          ? "HELD"
          : "BOOKED"
        : "UNAVAILABLE") as CalculatedSlot["status"],
      bookedCourt: blocking.court_id,
      bookedBy: blocking.team_name || "Another customer",
      conflictReason: held
        ? "This slot is currently in checkout."
        : `${
            blocking.court_id === "F" ? "Full Turf" : blocking.court_id
          } is booked.`,
    };
  });
}

export async function holdBooking(input: BookingInput) {
  const details = await getSlotDetails(
    input.courtId,
    input.slotIds,
    input.paymentType,
  );
  const availability = await getAvailability(input.courtId, input.date);

  if (
    input.slotIds.some(
      (slotId) =>
        availability.find((slot) => slot.id === slotId)?.status !== "AVAILABLE",
    )
  ) {
    return {
      success: false as const,
      error: "Selected slots are no longer available.",
    };
  }

    const { data, error } = await getSupabaseServerClient().rpc("hold_booking", {
    p_court_id: input.courtId,
    p_booking_date: input.date,
    p_slot_ids: input.slotIds,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail || "",
    p_start_time: details.startTime,
    p_end_time: details.endTime,
    p_duration_hours: details.duration,
    p_price_total: details.totalToPay,
    p_payment_type: input.paymentType === "ADVANCE" ? "ADVANCE" : "FULL",
    p_balance_due: details.balanceDue,
  });

  if (error) {
    return {
      success: false as const,
      error: "Selected slots are no longer available.",
    };
  }

  return {
    success: true as const,
    holdToken: (data as DbBooking).id,
  };
}

export async function attachOrderToBooking(holdToken: string, orderId: string) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "attach_booking_order",
    {
      p_booking_id: holdToken,
      p_order_id: orderId,
    },
  );

  return !error && data === true;
}

export async function confirmHeldBooking(
  input: BookingInput & {
    holdToken: string;
    orderId?: string;
    paymentId?: string;
    paymentStatus?: "PAID" | "PENDING";
    paymentType?: PaymentType;
  },
) {
  const { data, error } = await getSupabaseServerClient().rpc(
    "confirm_booking",
    {
      p_booking_id: input.holdToken,
      p_order_id: input.orderId || null,
      p_payment_id: input.paymentId || null,
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_customer_email: input.customerEmail || "",
      p_team_name: input.teamName || "",
      p_sport_type: input.sportType || "",
      p_payment_status: input.paymentStatus || "PAID",
    },
  );

  if (error) {
    return {
      success: false as const,
      error:
        "This checkout hold is no longer valid. Please select the slots again.",
    };
  }

  // start/end time, duration, price_total, payment_type and balance_due
  // all come from the row saved at hold time.
  const booking = mapBooking(data as DbBooking);

  const [, whatsappResult] = await Promise.allSettled([
    sendBookingConfirmationEmails(booking),
    sendDualWhatsAppNotifications(booking),
  ]);

  const notifications: WhatsAppNotificationResult =
    whatsappResult.status === "fulfilled"
      ? whatsappResult.value
      : {
          success: false,
          customerSent: false,
          ownerSent: false,
          details: String(whatsappResult.reason),
        };

  return { success: true as const, booking, notifications };
}
