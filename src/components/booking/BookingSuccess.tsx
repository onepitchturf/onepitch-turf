"use client";

import React from "react";
import { BookingRecord, COURTS } from "@/lib/bookingStore";
import Link from "next/link";

interface BookingSuccessProps {
  booking: BookingRecord;
  onBookAnother: () => void;
}

export default function BookingSuccess({ booking, onBookAnother }: BookingSuccessProps) {
  const court = COURTS[booking.courtId];

  // Date formatting
  const dateObj = new Date(booking.date + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="success-screen-wrapper">
      <div className="success-card">
        {/* Celebration Header */}
        <div className="success-badge-icon">
          <div className="icon-circle">✓</div>
        </div>

        <span className="eyebrow success-eyebrow">Match Scheduled</span>
        <h2 className="success-title">BOOKING CONFIRMED</h2>
        <p className="success-subtitle">
          Your slot has been successfully reserved on the pitch. Confirmation
          alerts are sent automatically to you and the turf owner.
        </p>

        {/* Booking Reference Box */}
        <div className="booking-ref-box">
          <span className="ref-label">BOOKING ID</span>
          <span className="ref-number">{booking.bookingRef}</span>
        </div>

        {/* Receipt Details Card */}
        <div className="receipt-details-grid">
          <div className="receipt-item">
            <span className="receipt-label">Turf Facility</span>
            <span className="receipt-val">OnePitch Turf, Perambalur</span>
          </div>

          <div className="receipt-item">
            <span className="receipt-label">Court Reserved</span>
            <span className="receipt-val highlight-gold">
              {court.name} — {court.subtitle}
            </span>
          </div>

          <div className="receipt-item">
            <span className="receipt-label">Date</span>
            <span className="receipt-val">{formattedDate}</span>
          </div>

          <div className="receipt-item">
            <span className="receipt-label">Time Slot</span>
            <span className="receipt-val">
              {booking.startTime} – {booking.endTime}
            </span>
          </div>

          <div className="receipt-item">
            <span className="receipt-label">Match Duration</span>
            <span className="receipt-val">
              {booking.durationHours}{" "}
              {booking.durationHours === 1 ? "Hour" : "Hours"}
            </span>
          </div>

          <div className="receipt-item">
            <span className="receipt-label">Player / Contact</span>
            <span className="receipt-val">
              {booking.customerName} ({booking.customerPhone})
            </span>
          </div>

          {booking.teamName && (
            <div className="receipt-item">
              <span className="receipt-label">Team / Club</span>
              <span className="receipt-val">{booking.teamName}</span>
            </div>
          )}

          <div className="receipt-item total-paid-item">
            <span className="receipt-label">Total Amount</span>
            <span className="receipt-val total-price">
              ₹{booking.priceTotal.toLocaleString()}
            </span>{" "}
            {booking.balanceDue ? (
              <div className="receipt-item total-paid-item">
                <span className="receipt-label">Balance due</span>
                <span className="receipt-val total-price">
                  ₹{booking.balanceDue.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="success-actions-row"
          style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
        >
          {/* <a
            href={ownerWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary whatsapp-btn"
          >
            <span className="whatsapp-action-content">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L.07 24l6.34-1.66a11.86 11.86 0 0 0 5.64 1.43h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.16-3.42-8.41ZM12.06 21.77h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.76.99 1-3.67-.23-.38a9.87 9.87 0 0 1-1.51-5.24C2.16 6.43 6.59 2 12.05 2a9.83 9.83 0 0 1 6.99 2.9 9.84 9.84 0 0 1 2.89 7c0 5.46-4.43 9.87-9.87 9.87Zm5.41-7.39c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.09 4.5.71.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
              </svg>
              <span>Notify Turf Owner </span>
            </span>
          </a> */}

          <Link href="/" className="btn btn-ghost back-home-btn reflection-btn">
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Venue Rules Reminder */}
        <div className="venue-guidelines-box">
          <h5>⚡ Venue Guidelines &amp; Reminders:</h5>
          <ul>
            <li>⏰ Please arrive 10 minutes before your slot.</li>
            <li>
              🥎 Heavy-weight balls and balls above 90 GSM are not allowed.
            </li>
            <li>
              👶 Children under 10 years of age must be supervised by an adult.
            </li>
            <li>
              🚭 Smoking, alcohol, and chewing gum are not permitted on the
              premises.
            </li>
            <li>
              📋 Please read and follow all the rules displayed inside the turf.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
