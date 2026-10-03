// Shared booking types and fixed turf configuration. Booking availability and
// records are read and written exclusively through Supabase in bookingService.
export type CourtId = "C1" | "C2" | "F";
export type PaymentType = "ADVANCE" | "FULL";

export interface CourtInfo {
  id: CourtId;
  name: string;
  subtitle: string;
  description: string;
  pricePerHour: number;
  capacity: string;
  sportTypes: string[];
}

export interface CourtPricing {
  courtId: CourtId;
  fullPricePerHour: number;
  advancePricePerHour: number;
}

export interface CourtInfo {
  id: CourtId;
  name: string;
  subtitle: string;
  description: string;
  pricePerHour: number;
  capacity: string;
  sportTypes: string[];
}

export const COURTS: Record<CourtId, CourtInfo> = {
  C1: {
    id: "C1",
    name: "Court 1",
    subtitle: "Left Half",
    description:
      "Perfect for 5v5 or 6v6. Pick your Sports football or cricket.",
    pricePerHour: 600,
    capacity: "5v5 / 6v6 (10-12 Players)",
    sportTypes: ["Football", "Cricket"],
  },
  C2: {
    id: "C2",
    name: "Court 2",
    subtitle: "Right Half",
    description: "5v5 or 6v6, floodlit and ready. Bring the whole squad.",
    pricePerHour: 600,
    capacity: "5v5 / 6v6 (10-12 Players)",
    sportTypes: ["Football", "Cricket"],
  },
  F: {
    id: "F",
    name: "Full Turf",
    subtitle: "Entire Turf (C1 + C2)",
    description: "Go big with 8v8 or 11v11. Take over the full turf.",
    pricePerHour: 1000,
    capacity: "8v8 / 11v11 (16-22 Players)",
    sportTypes: ["Football", "Cricket"],
  },
};

export type SlotPeriod = "morning" | "afternoon" | "evening" | "night";
export type SlotStatus =
  | "AVAILABLE"
  | "SELECTED"
  | "BOOKED"
  | "EXPIRED"
  | "UNAVAILABLE"
  | "HELD";
export interface SlotDefinition {
  id: string;
  startTime: string;
  endTime: string;
  startHour: number;
  endHour: number;
  period: SlotPeriod;
  label: string;
}
export interface CalculatedSlot extends SlotDefinition {
  status: SlotStatus;
  price: number;
  advancePrice: number;
  bookedCourt?: CourtId;
  conflictReason?: string;
  bookedBy?: string;
}
export interface BookingRecord {
  id: string;
  bookingRef: string;
  courtId: CourtId;
  date: string;
  slotIds: string[];
  startTime: string;
  endTime: string;
  durationHours: number;
  priceTotal: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  teamName?: string;
  sportType?: string;
  status: "CONFIRMED" | "HELD" | "CANCELLED";
  paymentMethod: "UPI";
  paymentStatus: "PAID" | "PENDING";
  paymentId?: string;
  orderId?: string;
  heldUntil?: number;
  createdAt: number;
  paymentType?: PaymentType;
  balanceDue?: number;
}

/** Single source of truth for totals. Slot prices come from the DB via /api/availability. */
export function calcTotals(slots: CalculatedSlot[], paymentType: PaymentType) {
  const full = slots.reduce((sum, s) => sum + s.price, 0);
  const advance = slots.reduce((sum, s) => sum + s.advancePrice, 0);
  const payNow = paymentType === "ADVANCE" ? advance : full;
  return { full, advance, payNow, balanceDue: full - payNow };
}

const SLOT_CONFIGS: Array<
  [string, string, string, number, number, SlotPeriod]
> = [
  ["05-06", "05:00 AM", "06:00 AM", 5, 6, "morning"],
  ["06-07", "06:00 AM", "07:00 AM", 6, 7, "morning"],
  ["07-08", "07:00 AM", "08:00 AM", 7, 8, "morning"],
  ["08-09", "08:00 AM", "09:00 AM", 8, 9, "morning"],
  ["09-10", "09:00 AM", "10:00 AM", 9, 10, "morning"],
  ["10-11", "10:00 AM", "11:00 AM", 10, 11, "morning"],
  ["11-12", "11:00 AM", "12:00 PM", 11, 12, "afternoon"],
  ["12-13", "12:00 PM", "01:00 PM", 12, 13, "afternoon"],
  ["13-14", "01:00 PM", "02:00 PM", 13, 14, "afternoon"],
  ["14-15", "02:00 PM", "03:00 PM", 14, 15, "afternoon"],
  ["15-16", "03:00 PM", "04:00 PM", 15, 16, "afternoon"],
  ["16-17", "04:00 PM", "05:00 PM", 16, 17, "evening"],
  ["17-18", "05:00 PM", "06:00 PM", 17, 18, "evening"],
  ["18-19", "06:00 PM", "07:00 PM", 18, 19, "evening"],
  ["19-20", "07:00 PM", "08:00 PM", 19, 20, "evening"],
  ["20-21", "08:00 PM", "09:00 PM", 20, 21, "evening"],
  ["21-22", "09:00 PM", "10:00 PM", 21, 22, "night"],
  ["22-23", "10:00 PM", "11:00 PM", 22, 23, "night"],
  ["23-24", "11:00 PM", "12:00 AM", 23, 24, "night"],
  ["00-01", "12:00 AM", "01:00 AM", 24, 25, "night"],
];

export const MASTER_SLOTS: SlotDefinition[] = SLOT_CONFIGS.map(
  ([id, startTime, endTime, startHour, endHour, period]) => ({
    id: `slot-${id}`,
    startTime,
    endTime,
    startHour,
    endHour,
    period,
    label: `${startTime} – ${endTime}`,
  }),
);

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
