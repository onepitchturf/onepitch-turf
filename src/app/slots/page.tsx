"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TurfVisualizer from "@/components/booking/TurfVisualizer";
import CourtSelector from "@/components/booking/CourtSelector";
import DateSelector from "@/components/booking/DateSelector";
import TimeSlotGrid from "@/components/booking/TimeSlotGrid";
import BookingSummary from "@/components/booking/BookingSummary";
import BookingModal from "@/components/booking/BookingModal";
import BookingSuccess from "@/components/booking/BookingSuccess";
import BookingBreadcrumb, {
  BookingStep,
} from "@/components/booking/BookingBreadcrumb";
import {
  CourtId,
  CourtPricing,
  PaymentType,
  CalculatedSlot,
  BookingRecord,
  formatISODate,
} from "@/lib/bookingStore";
import { useReveal } from "@/hooks/useReveal";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function BookingPage() {
  useReveal();

  // ── Booking data state ──────────────────────────────────────────────────────
  const [selectedCourt, setSelectedCourt] = useState<CourtId>("C1");
  const [paymentType, setPaymentType] = useState<PaymentType>("FULL");
  const [pricing, setPricing] = useState<Record<CourtId, CourtPricing> | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.success && setPricing(d.pricing))
      .catch((e) => console.error("Failed to load pricing:", e));
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    formatISODate(new Date()),
  );

  const [slots, setSlots] = useState<CalculatedSlot[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [confirmedBooking, setConfirmedBooking] =
    useState<BookingRecord | null>(null);

  const [conflictAlert, setConflictAlert] = useState<string | null>(null);

  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );

  // ── Multi-step navigation state ─────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<BookingStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<BookingStep>(1);

  // Push a history entry so browser Back navigates between steps
  const pushStepHistory = useCallback((step: BookingStep) => {
    window.history.pushState({ bookingStep: step }, "");
  }, []);

  // Navigate to a step (forward or backward breadcrumb click)
  const goToStep = useCallback(
    (step: BookingStep, pushHistory = true) => {
      setCurrentStep(step);
      if (step > maxReachedStep) {
        setMaxReachedStep(step);
      }
      if (pushHistory) {
        pushStepHistory(step);
      }
      // Scroll to top of booking content area on step change
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [maxReachedStep, pushStepHistory],
  );

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { bookingStep?: BookingStep } | null;
      if (state?.bookingStep) {
        // Navigate without pushing another history entry
        setCurrentStep(state.bookingStep);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    // Push initial state so Back from Step 1 exits the page correctly
    window.history.replaceState({ bookingStep: 1 }, "");

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  /**
   * Fetch authoritative availability from our backend API.
   */
  const fetchAvailability = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const res = await fetch(
          `/api/availability?court=${selectedCourt}&date=${selectedDate}`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          throw new Error(`Availability API returned ${res.status}`);
        }

        const data = await res.json();

        if (data.success) {
          setAvailabilityError(null);

          const latestSlots: CalculatedSlot[] = data.slots || [];

          setSlots(latestSlots);

          setSelectedSlotIds((prev) =>
            prev.filter((id) => {
              const match = latestSlots.find((slot) => slot.id === id);

              return match && match.status === "AVAILABLE";
            }),
          );
        } else {
          setAvailabilityError(
            data.error || "Unable to load live availability.",
          );
        }
      } catch (err) {
        console.error("Failed to load availability:", err);

        setAvailabilityError(
          "Unable to reach the live booking database. Please try again.",
        );
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [selectedCourt, selectedDate],
  );

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  useEffect(() => {
    const availabilityRefreshInterval = window.setInterval(() => {
      fetchAvailability(true);
    }, 60_000);

    return () => {
      window.clearInterval(availabilityRefreshInterval);
    };
  }, [fetchAvailability]);

  useEffect(() => {
    console.log("Starting OnePitch realtime connection...");

    const channel = supabaseBrowser
      .channel("onepitch-booking-availability")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
        },
        (payload) => {
          console.log(
            "🔥 OnePitch realtime booking change:",
            payload.eventType,
            payload,
          );

          fetchAvailability(true);
        },
      )
      .subscribe((status) => {
        console.log("OnePitch realtime status:", status);
      });

    return () => {
      console.log("Closing OnePitch realtime connection...");
      supabaseBrowser.removeChannel(channel);
    };
  }, [fetchAvailability]);

  const handleToggleSlot = (slotId: string) => {
    setSelectedSlotIds((prev) => {
      if (prev.includes(slotId)) {
        return prev.filter((id) => id !== slotId);
      }

      const clickedSlot = slots.find((slot) => slot.id === slotId);

      if (!clickedSlot || clickedSlot.status !== "AVAILABLE") {
        return prev;
      }

      if (prev.length === 0) {
        return [slotId];
      }

      const currentlySelected = slots
        .filter((slot) => prev.includes(slot.id))
        .sort((a, b) => a.startHour - b.startHour);

      const minHour = currentlySelected[0].startHour;
      const maxHour = currentlySelected[currentlySelected.length - 1].endHour;

      if (
        clickedSlot.endHour === minHour ||
        clickedSlot.startHour === maxHour
      ) {
        return [...prev, slotId];
      }

      return [slotId];
    });
  };

  const handleCourtChange = (court: CourtId) => {
    if (court !== selectedCourt) {
      setSelectedCourt(court);
      setSelectedSlotIds([]);
      setMaxReachedStep(1);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlotIds([]);
  };

  const handleBookingSuccess = (booking: BookingRecord) => {
    setConfirmedBooking(booking);
    fetchAvailability();
  };

  const handleBookAnother = () => {
    setConfirmedBooking(null);
    setSelectedSlotIds([]);
    setCurrentStep(1);
    setMaxReachedStep(1);
    window.history.replaceState({ bookingStep: 1 }, "");

    fetchAvailability();
  };

  const handleAvailabilityConflict = (msg: string) => {
    setConflictAlert(msg);
    fetchAvailability();

    setTimeout(() => {
      setConflictAlert(null);
    }, 5000);
  };

  const selectedSlotObjects = slots.filter((slot) =>
    selectedSlotIds.includes(slot.id),
  );

  const hasSlotSelected = selectedSlotIds.length > 0;

  const handleContinue = () => {
    const next = (currentStep + 1) as BookingStep;
    if (next > 3) return;
    goToStep(next);
  };

  const handleStepClick = (step: BookingStep) => {
    if (step <= maxReachedStep && step !== currentStep) {
      goToStep(step);
    }
  };

  return (
    <>
      <Header />

      <main className="booking-page-main">
        <div className="wrap booking-container-wrap">
          <div className="booking-page-header reveal">
            <h5 className="booking-main-title">
              RESERVE YOUR <em>MATCH SLOT</em>
            </h5>
          </div>

          {availabilityError && (
            <div
              className="global-conflict-toast"
              role="alert"
              aria-live="assertive"
            >
              <div className="toast-body">
                <strong>Booking unavailable:</strong> {availabilityError}
              </div>
            </div>
          )}

          {conflictAlert && (
            <div
              className="global-conflict-toast"
              role="alert"
              aria-live="assertive"
            >
              <div className="toast-icon">⚠️</div>

              <div className="toast-body">
                <strong>Availability Notice:</strong> {conflictAlert}
              </div>

              <button
                type="button"
                className="toast-close"
                onClick={() => setConflictAlert(null)}
              >
                ✕
              </button>
            </div>
          )}

          {confirmedBooking ? (
            <BookingSuccess
              booking={confirmedBooking}
              onBookAnother={handleBookAnother}
            />
          ) : (
            <>
              <BookingBreadcrumb
                currentStep={currentStep}
                maxReachedStep={maxReachedStep}
                onStepClick={handleStepClick}
              />

              <div className="booking-step-screen">
                {/* STEP 1: Select Zone */}
                {currentStep === 1 && (
                  <div className="step-content">
                    <div className="step-section-label">
                      <p className="step-screen-desc">
                        Choose a court from the interactive pitch map below,
                        then continue.
                      </p>
                    </div>

                    <div className="flow-step-card">
                      <TurfVisualizer
                        selectedCourt={selectedCourt}
                        onSelectCourt={handleCourtChange}
                      />
                    </div>

                    <div className="flow-step-card">
                      <CourtSelector
                        selectedCourt={selectedCourt}
                        onSelectCourt={handleCourtChange} // was setSelectedCourt
                        paymentType={paymentType}
                        onPaymentTypeChange={setPaymentType}
                        pricing={pricing}
                      />
                    </div>

                    <div className="step-footer">
                      <div className="step-footer-right">
                        <button
                          type="button"
                          className="btn btn-primary step-continue-btn"
                          onClick={handleContinue}
                        >
                          Continue to Booking Details →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Booking Details */}
                {currentStep === 2 && (
                  <div className="step-content">
                    <div className="step-section-label">
                      <p className="step-screen-desc">
                        Pick a date and select your preferred time slot(s).
                      </p>
                    </div>

                    <div className="flow-step-card">
                      <DateSelector
                        selectedDate={selectedDate}
                        onSelectDate={handleDateChange}
                        daysCount={7}
                      />
                    </div>

                    <div className="flow-step-card">
                      <TimeSlotGrid
                        slots={slots}
                        selectedSlotIds={selectedSlotIds}
                        onToggleSlot={handleToggleSlot}
                        isLoading={isLoading}
                        paymentType={paymentType}
                      />
                    </div>

                    <div className="step-footer">
                      <button
                        type="button"
                        className="btn btn-ghost step-back-btn"
                        onClick={() => goToStep(1)}
                      >
                        ← Back to Zone
                      </button>
                      <div className="step-footer-right">
                        {!hasSlotSelected && (
                          <span className="step-hint-text">
                            Select at least one slot to continue
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary step-continue-btn"
                          onClick={handleContinue}
                          disabled={!hasSlotSelected}
                        >
                          Continue to Review →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: Review & Pay */}
                {currentStep === 3 && (
                  <div className="step-content">
                    <div className="step-section-label">
                      <p className="step-screen-desc">
                        Review your booking summary, enter your details, and
                        complete payment.
                      </p>
                    </div>

                    <div className="flow-step-card">
                      {/* <BookingSummary
                        selectedCourt={selectedCourt}
                        selectedDate={selectedDate}
                        selectedSlots={selectedSlotObjects}
                        paymentType={paymentType}
                        onProceedToReview={() => {}}
                      /> */}
                      <BookingSummary
                        selectedCourt={selectedCourt}
                        selectedDate={selectedDate}
                        selectedSlots={selectedSlotObjects}
                        paymentType={paymentType}
                      />
                    </div>

                    <div className="flow-step-card">
                      <div className="inline-checkout-card">
                        <div className="inline-checkout-header">
                          <span className="eyebrow">
                            Checkout &amp; Verification
                          </span>
                          <h3 className="inline-checkout-title">
                            Player Details &amp; Payment
                          </h3>
                        </div>

                        <BookingModal
                          isOpen={true}
                          inlineMode={true}
                          onClose={() => goToStep(2)} // was missing; the Back button did nothing
                          selectedCourt={selectedCourt}
                          selectedDate={selectedDate}
                          selectedSlots={selectedSlotObjects}
                          paymentType={paymentType}
                          onBookingSuccess={handleBookingSuccess}
                          onAvailabilityConflict={handleAvailabilityConflict}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
