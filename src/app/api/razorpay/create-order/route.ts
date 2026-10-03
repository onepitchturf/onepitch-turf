import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { CourtId, PaymentType } from "@/lib/bookingStore";
import {
  attachOrderToBooking,
  getAvailability,
  getSlotDetails,
  holdBooking,
} from "@/lib/bookingService";

export const runtime = "nodejs";

function isCourtId(value: unknown): value is CourtId {
  return value === "C1" || value === "C2" || value === "F";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      courtId,
      date,
      slotIds,
      customerName,
      customerPhone,
      customerEmail,
      paymentType = "FULL",
    } = body;

    const activePaymentType: PaymentType =
      paymentType === "ADVANCE" ? "ADVANCE" : "FULL";

    if (
      !isCourtId(courtId) ||
      typeof date !== "string" ||
      !Array.isArray(slotIds) ||
      slotIds.length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "Missing court, date, or time slots." },
        { status: 400 },
      );
    }

    if (
      typeof customerName !== "string" ||
      typeof customerPhone !== "string" ||
      !customerName.trim() ||
      customerPhone.replace(/\D/g, "").length < 10
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Please enter player name and mobile number.",
        },
        { status: 400 },
      );
    }

    const keyId =
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (
      !keyId ||
      !keySecret ||
      keyId.includes("your_key") ||
      keySecret.includes("your_razorpay")
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Razorpay is not configured. Add valid Razorpay API keys to .env.local.",
        },
        { status: 503 },
      );
    }

    // 1. Verify availability
    const availability = await getAvailability(courtId, date);
    for (const slotId of slotIds) {
      const slot = availability.find((s) => s.id === slotId);
      if (!slot || slot.status !== "AVAILABLE") {
        return NextResponse.json(
          {
            success: false,
            error: `Slot ${slot?.label || slotId} is no longer available (${slot?.conflictReason || "Conflict"}).`,
          },
          { status: 409 },
        );
      }
    }

    // 2. Dynamic Price Calculation
    const details = await getSlotDetails(courtId, slotIds, activePaymentType);
    const amountInRupees = details.totalToPay;
    const amountInPaise = amountInRupees * 100;

    // 3. Place hold
    const holdResult = await holdBooking({
      courtId,
      date,
      slotIds,
      customerName,
      customerPhone,
      customerEmail: customerEmail || "",
      paymentType: activePaymentType,
    });

    if (!holdResult.success) {
      return NextResponse.json(
        { success: false, error: holdResult.error },
        { status: 409 },
      );
    }

    // 4. Create Razorpay Order
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: (holdResult.holdToken || `rcpt_${Date.now()}`).slice(0, 40),
      notes: {
        courtId,
        date,
        slotCount: String(slotIds.length),
        paymentType: activePaymentType,
        turfName: "OnePitch Arena",
      },
    });

    if (
      !holdResult.holdToken ||
      !(await attachOrderToBooking(holdResult.holdToken, order.id))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Your checkout hold expired. Please select the slots again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: amountInRupees,
      amountInPaise,
      currency: "INR",
      keyId,
      holdToken: holdResult.holdToken,
      customer: {
        name: customerName,
        phone: customerPhone,
        ...(typeof customerEmail === "string" && customerEmail.trim()
          ? { email: customerEmail.trim() }
          : {}),
      },
    });
  } catch (error) {
    console.error("Razorpay create-order error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initiate UPI payment order." },
      { status: 500 },
    );
  }
}
