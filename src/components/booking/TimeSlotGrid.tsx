"use client";

import React from "react";
import { CalculatedSlot, SlotPeriod, PaymentType } from "@/lib/bookingStore";

interface TimeSlotGridProps {
  slots: CalculatedSlot[];
  selectedSlotIds: string[];
  onToggleSlot: (slotId: string) => void;
  isLoading?: boolean;
  warning?: string | null;
  paymentType?: PaymentType;
}

export default function TimeSlotGrid({
  slots,
  selectedSlotIds,
  onToggleSlot,
  isLoading = false,
  warning = null,
  paymentType = "FULL",
}: TimeSlotGridProps) {
  const periods: Array<{
    id: SlotPeriod;
    title: string;
    subtitle: string;
    icon: string;
  }> = [
    {
      id: "morning",
      title: "Morning Slots",
      subtitle: "05:00 AM – 11:00 AM",
      icon: "🌅",
    },
    {
      id: "afternoon",
      title: "Afternoon Slots",
      subtitle: "11:00 AM – 04:00 PM",
      icon: "☀️",
    },
    {
      id: "evening",
      title: "Evening Floodlit",
      subtitle: "04:00 PM – 09:00 PM",
      icon: "🌆",
    },
    {
      id: "night",
      title: "Night Matches",
      subtitle: "09:00 PM – 01:00 AM",
      icon: "🌙",
    },
  ];

  return (
    <div className="time-slot-section">
      <div className="section-title-row">
        <div>
          {/* <span className="eyebrow">Step 3</span> */}
          {/* <h2 className="step-title">Select Available Time Slot</h2> */}
        </div>
        {/* <p className="step-desc">
          Click to select one or multiple consecutive hours. Real-time
          availability updates instantly.
        </p> */}
      </div>

      {warning && <div className="modal-error-banner">⚠️ {warning}</div>}

      {/* Visual Status Legend */}
      <div className="slot-legend-bar">
        <div className="legend-item">
          <span className="legend-box available-box"></span>
          <span>Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-box selected-box"></span>
          <span>Selected</span>
        </div>
        <div className="legend-item">
          <span className="legend-box booked-box"></span>
          <span>Booked</span>
        </div>
        <div className="legend-item">
          <span className="legend-box unavailable-box"></span>
          <span>Conflict / Unavailable</span>
        </div>
        {/* <div className="legend-item">
          <span className="legend-box expired-box"></span>
          <span>Passed</span>
        </div> */}
      </div>

      {isLoading ? (
        <div className="slots-loading-state">
          <div className="loading-spinner"></div>
          {/* <p>Loading</p> */}
        </div>
      ) : (
        <div className="periods-container">
          {periods.map((period) => {
            /**
             * Expired slots are removed from the UI.
             *
             * The backend decides when a slot becomes EXPIRED.
             * We simply don't render those slots here.
             */
            const periodSlots = slots.filter(
              (s) => s.period === period.id && s.status !== "EXPIRED",
            );
            if (periodSlots.length === 0) return null;

            return (
              <div key={period.id} className="period-block">
                <div className="period-header">
                  <span className="period-icon">{period.icon}</span>
                  <div>
                    <h4 className="period-title">{period.title}</h4>
                    <span className="period-subtitle">{period.subtitle}</span>
                  </div>
                </div>

                <div className="slots-grid">
                  {periodSlots.map((slot) => {
                    const isSelected = selectedSlotIds.includes(slot.id);
                    const isAvailable = slot.status === "AVAILABLE";
                    const isBooked = slot.status === "BOOKED";
                    const isUnavailable = slot.status === "UNAVAILABLE";
                    // const isExpired = slot.status === "EXPIRED";
                    const isHeld = slot.status === "HELD";

                    let statusClass = "slot-available";
                    if (isSelected) statusClass = "slot-selected";
                    else if (isBooked) statusClass = "slot-booked";
                    else if (isHeld) statusClass = "slot-held";
                    else if (isUnavailable) statusClass = "slot-unavailable";
                    // else if (isExpired) statusClass = "slot-expired";

                    return (
                      <div
                        key={slot.id}
                        className={`slot-card-item ${statusClass}`}
                        onClick={() => {
                          if (isAvailable || isSelected) {
                            onToggleSlot(slot.id);
                          }
                        }}
                        role="button"
                        tabIndex={isAvailable || isSelected ? 0 : -1}
                        aria-disabled={!isAvailable && !isSelected}
                        title={slot.conflictReason || slot.label}
                      >
                        <div className="slot-card-time">
                          <span className="time-range">{slot.startTime}</span>
                          <span className="time-dash">–</span>
                          <span className="time-end">{slot.endTime}</span>
                        </div>

                        <div className="slot-card-bottom">
                          {isSelected ? (
                            <span className="status-label selected-txt">
                              ✓ SELECTED
                            </span>
                          ) : isBooked ? (
                            <span className="status-label booked-txt">
                              BOOKED
                            </span>
                          ) : isHeld ? (
                            <span className="status-label held-txt">
                              IN CHECKOUT
                            </span>
                          ) : isUnavailable ? (
                            <span className="status-label unavail-txt">
                              CONFLICT
                            </span>
                          ) : (
                            <span className="status-label avail-txt">
                              ₹
                              {paymentType === "ADVANCE"
                                ? slot.advancePrice
                                : slot.price}
                            </span>
                          )}
                        </div>

                        {/* Hover Conflict Tooltip / Reason Tag */}
                        {isUnavailable && slot.conflictReason && (
                          <div
                            className="conflict-badge-banner"
                            title={slot.conflictReason}
                          >
                            <span>{slot.conflictReason}</span>
                          </div>
                        )}
                        {isBooked && slot.bookedBy && (
                          <div className="booked-team-tag">
                            <span>{slot.bookedBy}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
