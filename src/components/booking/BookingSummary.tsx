"use client";

import React from "react";
import {
  CourtId,
  COURTS,
  CalculatedSlot,
  PaymentType,
  calcTotals,
} from "@/lib/bookingStore";

interface BookingSummaryProps {
  selectedCourt: CourtId;
  selectedDate: string; // YYYY-MM-DD
  selectedSlots: CalculatedSlot[];
  paymentType: PaymentType;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function BookingSummary({
  selectedCourt,
  selectedDate,
  selectedSlots,
  paymentType,
}: BookingSummaryProps) {
  const court = COURTS[selectedCourt];
  const slots = [...selectedSlots].sort((a, b) => a.startHour - b.startHour);
  const hasSelected = slots.length > 0;
  const duration = slots.length;
  const isAdvance = paymentType === "ADVANCE";

  const { full, payNow, balanceDue } = calcTotals(slots, paymentType);
  const ratePerHour = duration ? Math.round(full / duration) : 0;

  const formattedDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
    "en-IN",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  const timeRange = hasSelected
    ? `${slots[0].startTime} – ${slots[slots.length - 1].endTime}`
    : "—";

  return (
    <div className="bs-card">
      {/* Header */}
      <div className="bs-header">
        <div className="bs-court-chip">
          {selectedCourt === "F" ? "FULL" : selectedCourt}
        </div>
        <div className="bs-header-text">
          <span className="eyebrow">Booking Summary</span>
          <h3 className="bs-title">{court.name}</h3>
          <span className="bs-sub">
            {court.subtitle} · {court.capacity}
          </span>
        </div>
        <span className={`bs-mode-badge ${isAdvance ? "adv" : "full"}`}>
          {isAdvance ? "ADVANCE" : "FULL PAYMENT"}
        </span>
      </div>

      {/* Match details */}
      <div className="bs-grid">
        <div className="bs-item">
          <span className="bs-label">Date</span>
          <span className="bs-value">{formattedDate}</span>
        </div>
        <div className="bs-item">
          <span className="bs-label">Time</span>
          <span className="bs-value">{timeRange}</span>
        </div>
        <div className="bs-item">
          <span className="bs-label">Duration</span>
          <span className="bs-value">
            {hasSelected
              ? `${duration} ${duration === 1 ? "Hour" : "Hours"}`
              : "—"}
          </span>
        </div>
        <div className="bs-item">
          <span className="bs-label">Venue</span>
          <span className="bs-value">OnePitch, Perambalur</span>
        </div>
      </div>

      {/* Slot chips */}
      <div className="bs-section">
        <span className="bs-label">Selected slots</span>
        {hasSelected ? (
          <div className="bs-chips">
            {slots.map((s) => (
              <span key={s.id} className="bs-chip">
                {s.startTime} – {s.endTime}
              </span>
            ))}
          </div>
        ) : (
          <p className="bs-empty">
            No slot selected yet. Go back and pick at least one hour.
          </p>
        )}
      </div>

      {/* Price breakdown */}
      <div className="bs-section">
        <span className="bs-label">Price breakdown</span>
        <div className="bs-rows">
          <div className="bs-row">
            <span>Rate per hour</span>
            <span>{hasSelected ? `${inr(ratePerHour)} / hr` : "—"}</span>
          </div>
          <div className="bs-row">
            <span>
              Slot total ({duration} × {inr(ratePerHour)})
            </span>
            <span>{inr(full)}</span>
          </div>
          <div className="bs-row">
            <span>Floodlight &amp; maintenance</span>
            <span className="bs-free">FREE</span>
          </div>

          {isAdvance && hasSelected && (
            <>
              <div className="bs-divider" />
              <div className="bs-row">
                <span>Advance payable now</span>
                <span>{inr(payNow)}</span>
              </div>
              <div className="bs-row bs-row-due">
                <span>Balance to pay at venue</span>
                <span>{inr(balanceDue)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="bs-total">
        <div>
          <span className="bs-total-title">Payable Now</span>
          <span className="bs-total-sub">
            {isAdvance
              ? `Remaining ${inr(balanceDue)} due at the turf`
              : "Inc. all amenities & floodlights"}
          </span>
        </div>
        <span className="bs-total-amount">{inr(payNow)}</span>
      </div>
    </div>
  );
}
