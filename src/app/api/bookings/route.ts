import { NextRequest, NextResponse } from "next/server";
import { CourtId, PaymentType } from "@/lib/bookingStore";
import { confirmHeldBooking, holdBooking } from "@/lib/bookingService";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Booking records are private and are not exposed by this endpoint.",
    },
    { status: 403 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const paymentType: PaymentType =
      body.paymentType === "ADVANCE" ? "ADVANCE" : "FULL";

    if (action === "hold") {
      const {
        courtId,
        date,
        slotIds,
        customerName,
        customerPhone,
        customerEmail,
      } = body;
      if (!courtId || !date || !slotIds || slotIds.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required booking details for hold.",
          },
          { status: 400 },
        );
      }

      const result = await holdBooking({
        courtId: courtId as CourtId,
        date,
        slotIds,
        customerName: customerName || "Guest",
        customerPhone: customerPhone || "",
        customerEmail: customerEmail || "",
        paymentType,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 409 },
        );
      }

      return NextResponse.json({ success: true, holdToken: result.holdToken });
    }

    if (action === "confirm") {
      const {
        holdToken,
        courtId,
        date,
        slotIds,
        customerName,
        customerPhone,
        customerEmail,
        teamName,
        sportType,
      } = body;

      if (
        !courtId ||
        !date ||
        !slotIds ||
        slotIds.length === 0 ||
        !customerName ||
        !customerPhone
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Please fill in all player contact details.",
          },
          { status: 400 },
        );
      }

      const input = {
        courtId: courtId as CourtId,
        date,
        slotIds,
        customerName,
        customerPhone,
        customerEmail,
        teamName,
        sportType,
        paymentType,
      };
      const held = holdToken
        ? { success: true as const, holdToken }
        : await holdBooking(input);
      if (!held.success) {
        return NextResponse.json(
          { success: false, error: held.error },
          { status: 409 },
        );
      }
      const result = await confirmHeldBooking({
        ...input,
        holdToken: held.holdToken,
        paymentStatus: "PAID",
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 409 },
        );
      }

      return NextResponse.json({
        success: true,
        booking: result.booking,
        notifications: result.notifications,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action specified." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Booking POST error:", error);
    return NextResponse.json(
      { success: false, error: "Server error processing booking request." },
      { status: 500 },
    );
  }
}
