"use client";

import React, { useState, useEffect } from "react";
import {
  CourtId,
  COURTS,
  CalculatedSlot,
  BookingRecord,
  PaymentType,
  calcTotals,
} from "@/lib/bookingStore";
import { validatePhoneNumber } from "@/lib/phoneValidation";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error("Razorpay checkout failed to load.")));
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout. Check your internet connection."));
    document.body.appendChild(script);
  });
}

interface BookingModalProps {
  isOpen: boolean;
  onClose?: () => void;
  paymentType: PaymentType;
  selectedCourt: CourtId;
  selectedDate: string;
  selectedSlots: CalculatedSlot[];
  onBookingSuccess: (booking: BookingRecord) => void;
  onAvailabilityConflict: (message: string) => void;
  /**
   * When true, renders as an inline page card (no backdrop overlay, no close ×).
   * The "Cancel" button navigates back (calls onClose which steps back in the flow).
   */
  inlineMode?: boolean;
}

export default function BookingModal({
  isOpen,
  onClose,
  paymentType,
  selectedCourt,
  selectedDate,
  selectedSlots,
  onBookingSuccess,
  onAvailabilityConflict,
  inlineMode = false,
}: BookingModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sportType, setSportType] = useState<string>("Cricket");
  const [paymentMethod, setPaymentMethod] = useState<string>("UPI");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 5-minute hold countdown timer — only used in legacy modal mode
  const [timeLeft, setTimeLeft] = useState<number>(300);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(300);
      setErrorMessage(null);

      // Clear personal data when modal closes
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setTeamName("");
      setSportType("Cricket");

      return;
    }

    // In inline mode there is no pre-held slot, so no countdown needed
    if (inlineMode) return;

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isOpen, inlineMode]);

  // Handle hold expiration OUTSIDE the state updater (legacy modal only)
  useEffect(() => {
    if (inlineMode || !isOpen || timeLeft !== 0) return;
    onAvailabilityConflict(
      "Your 5-minute temporary hold expired. Please reselect your slot.",
    );
  }, [inlineMode, isOpen, timeLeft, onClose, onAvailabilityConflict]);

  // Payment and validation failures are transient notifications.
  useEffect(() => {
    if (!errorMessage) return;
    const timeout = window.setTimeout(() => setErrorMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  const court = COURTS[selectedCourt];
  const sortedSlots = [...selectedSlots].sort(
    (a, b) => a.startHour - b.startHour,
  );
  const startTime = sortedSlots[0]?.startTime || "";
  const endTime = sortedSlots[sortedSlots.length - 1]?.endTime || "";
  const duration = sortedSlots.length;
  const { payNow: totalPrice } = calcTotals(sortedSlots, paymentType);
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    const phoneValidation = validatePhoneNumber(customerPhone);
    if (!phoneValidation.isValid) {
      setErrorMessage(
        phoneValidation.error || "Please enter a valid mobile number.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const bookingPayload = {
        courtId: selectedCourt,
        date: selectedDate,
        slotIds: selectedSlots.map((s) => s.id),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        teamName: teamName.trim() || undefined,
        sportType,
        paymentType, // new; flows to create-order, verify-payment, bookings
      };

      if (paymentMethod === "UPI") {
        const orderResponse = await fetch("/api/razorpay/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingPayload),
        });
        const orderData = await orderResponse.json();
        if (!orderResponse.ok || !orderData.success) {
          setErrorMessage(
            orderData.error || "Unable to start Razorpay payment.",
          );
          setIsSubmitting(false);
          return;
        }

        await loadRazorpayCheckout();
        if (!window.Razorpay)
          throw new Error("Razorpay checkout is unavailable.");
        const cleanPhone = bookingPayload.customerPhone.replace(/\D/g, "");

        const razorpayPhone = cleanPhone.startsWith("91")
          ? `+${cleanPhone}`
          : `+91${cleanPhone}`;
        const razorpay = new window.Razorpay({
          key: orderData.keyId,
          amount: orderData.amountInPaise,
          currency: orderData.currency,
          name: "OnePitch Turf",
          // image: `${window.location.origin}/images/onepitchturf_logo.jpg`,
          description: `${court.name} booking on ${selectedDate}`,
          order_id: orderData.orderId,
          prefill: {
            name: bookingPayload.customerName.trim(),
            contact: razorpayPhone,
            ...(bookingPayload.customerEmail?.trim()
              ? { email: bookingPayload.customerEmail.trim() }
              : {}),
          },
          theme: { color: "#0d0903" },
          modal: {
            ondismiss: () => {
              setIsSubmitting(false);
              setErrorMessage(
                "Payment was cancelled. Your slots remain held for a short time.",
              );
            },
          },
          handler: async (payment: Record<string, string>) => {
            try {
              const verifyResponse = await fetch(
                "/api/razorpay/verify-payment",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...bookingPayload,
                    holdToken: orderData.holdToken,
                    razorpay_order_id: payment.razorpay_order_id,
                    razorpay_payment_id: payment.razorpay_payment_id,
                    razorpay_signature: payment.razorpay_signature,
                  }),
                },
              );
              const verifyData = await verifyResponse.json();
              if (!verifyResponse.ok || !verifyData.success) {
                setErrorMessage(
                  verifyData.error ||
                    "Payment could not be verified. Please contact us with your payment ID.",
                );
                setIsSubmitting(false);
                return;
              }
              onBookingSuccess(verifyData.booking);
            } catch (error) {
              console.error(error);
              setErrorMessage(
                "Payment completed, but verification could not be reached. Please contact us before trying again.",
              );
              setIsSubmitting(false);
            }
          },
        });
        razorpay.open();
        return;
      }

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          ...bookingPayload,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Unable to confirm booking. Slot may have been taken.",
        );
        setIsSubmitting(false);
        onAvailabilityConflict(data.error || "Slot conflict detected.");
        return;
      }

      // Success!
      setIsSubmitting(false);
      onBookingSuccess(data.booking);
    } catch (err) {
      console.error(err);
      setErrorMessage(
        "Network error during final confirmation. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  // ── Inline mode (Step 3 embedded in the page) ──────────────────────────────
  if (inlineMode) {
    return (
      <div className="booking-inline-checkout">
        {/* Match Info Summary Pill */}
        {/* <div className="inline-checkout-summary">
          <div className="match-summary-item">
            <span className="label">Court</span>
            <span className="value highlight-text">
              {court.name} ({court.subtitle})
            </span>
          </div>
          <div className="match-summary-item">
            <span className="label">Date</span>
            <span className="value">{selectedDate}</span>
          </div>
          <div className="match-summary-item">
            <span className="label">Time</span>
            <span className="value">
              {startTime} – {endTime} ({duration} hr)
            </span>
          </div>
          <div className="match-summary-item">
            <span className="label">Total Amount</span>
            <span className="value price-tag">
              ₹{totalPrice.toLocaleString()}
            </span>
          </div>
        </div> */}

        {errorMessage && (
          <div className="modal-error-banner">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleConfirmBooking} className="modal-form">
          {/* Player Information Fields */}
          <div className="form-section">
            <h4 className="form-section-title">👤 Player &amp; Team Details</h4>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="customerName">Your name *</label>
                <input
                  id="customerName"
                  type="text"
                  required
                  placeholder="Enter Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="customerPhone">
                  Mobile Number (WhatsApp number)*
                </label>
                <input
                  id="customerPhone"
                  type="tel"
                  required
                  placeholder="eg: 941XXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="modal-input"
                />{" "}
                <label>
                  This number will be used for sending booking tickets
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="customerEmail">Your email</label>
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="eg: abc@gmail.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="teamName">Team / Club Name (Optional)</label>
                <input
                  id="teamName"
                  type="text"
                  placeholder="e.g. Perambalur Strikers"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="modal-input"
                />
              </div>
            </div>
          </div>

          {/* Sport Selection */}
          <div className="form-section">
            <h4 className="form-section-title">⚽ Sport Type</h4>
            <div className="sport-options-row">
              {["Cricket", "Football"].map((s) => (
                <label
                  key={s}
                  className={`sport-pill ${sportType === s ? "sport-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="sportType"
                    value={s}
                    checked={sportType === s}
                    onChange={(e) => setSportType(e.target.value)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          {/* <div className="form-section">
            <h4 className="form-section-title">💳 Payment Mode</h4>
            <div className="payment-methods-grid">
              <label
                className={`payment-card ${paymentMethod === "UPI" ? "pay-active" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="UPI"
                  checked={paymentMethod === "UPI"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <div className="pay-card-content">
                  <span className="pay-icon" aria-hidden="true">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="3"
                        y="5"
                        width="18"
                        height="14"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M3 9H21"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M7 14H10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M14 13L12.5 16H15L13.5 18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>

                  <div>
                    <strong>Instant UPI</strong>
                    <p>GPay, PhonePe, Paytm</p>
                  </div>
                </div>
              </label>
            </div>
          </div> */}

          {/* Step 3 Footer Actions */}
          <div className="inline-checkout-footer">
            <button
              type="button"
              className="btn btn-ghost step-back-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ← Back to Details
            </button>
            <button
              type="submit"
              className="btn btn-primary confirm-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="btn-loading">
                  <span className="loading-spinner small"></span> Verifying
                  &amp; Booking...
                </span>
              ) : (
                `${paymentType === "ADVANCE" ? "Pay Advance" : "Pay & Confirm"} (₹${totalPrice.toLocaleString()}) →`
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Legacy modal overlay mode (unchanged) ──────────────────────────────────
  return (
    <div className="modal-backdrop">
      <div className="modal-content-card">
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <span className="eyebrow">Checkout &amp; Verification</span>
            <h2 className="modal-title">Review &amp; Confirm Booking</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Temporary Hold Countdown Banner */}
        <div className="hold-timer-banner">
          <div className="timer-pulse-icon">⏳</div>
          <div className="timer-text">
            <span>SLOT TEMPORARILY HELD:</span>
            <span className="timer-countdown">{formatTimer(timeLeft)}</span>
            <small>Complete within 5 mins to secure your slot</small>
          </div>
        </div>

        {errorMessage && (
          <div className="modal-error-banner">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleConfirmBooking} className="modal-form">
          {/* Match Info Summary Pill */}
          <div className="modal-match-summary">
            <div className="match-summary-item">
              <span className="label">Court</span>
              <span className="value highlight-text">
                {court.name} ({court.subtitle})
              </span>
            </div>
            <div className="match-summary-item">
              <span className="label">Date</span>
              <span className="value">{selectedDate}</span>
            </div>
            <div className="match-summary-item">
              <span className="label">Time</span>
              <span className="value">
                {startTime} – {endTime} / ({duration} hr)
              </span>
            </div>
            <div className="match-summary-item">
              <span className="label">Total Amount</span>
              <span className="value price-tag">
                ₹{totalPrice.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Player Information Fields */}
          <div className="form-section">
            <h4 className="form-section-title">👤 Player &amp; Team Details</h4>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="customerName">Full Name *</label>
                <input
                  id="customerName"
                  type="text"
                  required
                  placeholder="Enter Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <label htmlFor="customerPhone">
                    Mobile Number (WhatsApp number)*
                  </label>
                </div>
                <input
                  id="customerPhone"
                  type="tel"
                  required
                  placeholder="Enter Mobile Number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="customerEmail">Email Address (Optional)</label>
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="Enter email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="teamName">Team / Club Name (Optional)</label>
                <input
                  id="teamName"
                  type="text"
                  placeholder="e.g. Perambalur Strikers"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="modal-input"
                />
              </div>
            </div>
          </div>

          {/* Sport Selection */}
          <div className="form-section">
            <h4 className="form-section-title">⚽ Sport Type</h4>
            <div className="sport-options-row">
              {["Cricket", "Football"].map((s) => (
                <label
                  key={s}
                  className={`sport-pill ${sportType === s ? "sport-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="sportType"
                    value={s}
                    checked={sportType === s}
                    onChange={(e) => setSportType(e.target.value)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="form-section">
            <h4 className="form-section-title">💳 Payment Mode</h4>
            <div className="payment-methods-grid">
              <label
                className={`payment-card ${paymentMethod === "UPI" ? "pay-active" : ""}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="UPI"
                  checked={paymentMethod === "UPI"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <div className="pay-card-content">
                  <span className="pay-icon" aria-hidden="true">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="3"
                        y="5"
                        width="18"
                        height="14"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M3 9H21"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M7 14H10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M14 13L12.5 16H15L13.5 18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>

                  <div>
                    <strong>Instant UPI</strong>
                    <p>GPay, PhonePe, Paytm</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary confirm-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="btn-loading">
                  <span className="loading-spinner small"></span> Verifying
                  &amp; Booking...
                </span>
              ) : (
                `Confirm & Book (₹${totalPrice.toLocaleString()}) →`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
