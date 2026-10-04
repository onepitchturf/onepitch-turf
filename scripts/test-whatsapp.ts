import assert from "node:assert/strict";
import {
  buildCustomerPayload,
  buildOwnerPayload,
  buildCustomerTemplateParams,
  buildOwnerTemplateParams,
} from "@/lib/whatsappService";
import { BookingRecord } from "@/lib/bookingStore";

console.log("=== RUNNING WHATSAPP NOTIFICATION PAYLOAD TESTS ===\n");

// ── Test Case 1: Advance Booking (Matching User's Sample) ────────────────────
const mockAdvanceBooking: BookingRecord = {
  id: "rec_adv_123",
  bookingRef: "TRF-985BBE38",
  courtId: "F",
  date: "2026-09-19",
  slotIds: ["slot-21-22", "slot-22-23"],
  startTime: "09:00 PM",
  endTime: "11:00 PM",
  durationHours: 2,
  priceTotal: 300,
  paymentType: "ADVANCE",
  balanceDue: 700,
  customerName: "Mohamed Arief",
  customerPhone: "9688689556",
  customerEmail: "arief@example.com",
  sportType: "Cricket",
  teamName: "Not provided",
  status: "CONFIRMED",
  paymentMethod: "UPI",
  paymentStatus: "PAID",
  paymentId: "pay_Tdo4ZD9HYAuJPA",
  orderId: "order_Tdo4QUBFNj0BoX",
  createdAt: 1726750000000,
};

// 1A. Customer Payload for Advance Booking
const customerPayload = buildCustomerPayload(
  mockAdvanceBooking,
  "919500723392",
);

console.log("Customer Advance Payload Output:");
console.log(JSON.stringify(customerPayload, null, 2));

assert.equal(customerPayload.messaging_product, "whatsapp");
assert.equal(customerPayload.to, "919500723392");
assert.equal(customerPayload.type, "template");
assert.equal(customerPayload.template.name, "turf_booking_customer_notify");
assert.equal(customerPayload.template.language.code, "en");

const customerParams =
  customerPayload.template.components[0].parameters.map((p) => p.text);
assert.equal(customerParams.length, 10, "Customer template must have exactly 10 parameters");

assert.deepEqual(customerParams, [
  "Mohamed Arief", // {{1}} Name
  "TRF-985BBE38", // {{2}} Ref
  "Full Turf", // {{3}} Court Name (Unified)
  "Cricket", // {{4}} Sport
  "Saturday, September 19, 2026", // {{5}} Date
  "09:00 PM - 11:00 PM", // {{6}} Time
  "300", // {{7}} Paid
  "pay_Tdo4ZD9HYAuJPA", // {{8}} Payment ID
  "Advance", // {{9}} Status
  "700", // {{10}} Balance
]);

// 1B. Owner Payload for Advance Booking
const ownerPayload = buildOwnerPayload(
  mockAdvanceBooking,
  "919952323211",
);

console.log("\nOwner Advance Payload Output:");
console.log(JSON.stringify(ownerPayload, null, 2));

assert.equal(ownerPayload.messaging_product, "whatsapp");
assert.equal(ownerPayload.to, "919952323211");
assert.equal(ownerPayload.type, "template");
assert.equal(ownerPayload.template.name, "turf_booking_owner_notify");
assert.equal(ownerPayload.template.language.code, "en");

const ownerParams =
  ownerPayload.template.components[0].parameters.map((p) => p.text);
assert.equal(ownerParams.length, 13, "Owner template must have exactly 13 parameters");

assert.deepEqual(ownerParams, [
  "Mohamed Arief", // {{1}} Name
  "+919688689556", // {{2}} Phone with +
  "TRF-985BBE38", // {{3}} Ref
  "Full Turf", // {{4}} Court Name (Unified)
  "Sat, 19 Sept, 2026", // {{5}} Formatted Date
  "09:00 PM - 11:00 PM", // {{6}} Time
  "Cricket", // {{7}} Sport
  "Not provided", // {{8}} Team
  "300", // {{9}} Paid
  "Advance via UPI", // {{10}} Status
  "pay_Tdo4ZD9HYAuJPA", // {{11}} Payment ID
  "order_Tdo4QUBFNj0BoX", // {{12}} Order ID
  "700", // {{13}} Balance
]);

console.log("\n✓ Test 1 Passed: Advance Booking payloads match schema perfectly!");

// ── Test Case 2: Full Payment Booking ─────────────────────────────────────────
const mockFullBooking: BookingRecord = {
  id: "rec_full_456",
  bookingRef: "TRF-AA11BB22",
  courtId: "C1",
  date: "2026-10-10",
  slotIds: ["slot-18-19"],
  startTime: "06:00 PM",
  endTime: "07:00 PM",
  durationHours: 1,
  priceTotal: 600,
  paymentType: "FULL",
  balanceDue: 0,
  customerName: "Rahul Sharma",
  customerPhone: "9876543210",
  customerEmail: "rahul@example.com",
  sportType: "Football",
  status: "CONFIRMED",
  paymentMethod: "UPI",
  paymentStatus: "PAID",
  paymentId: "pay_XYZ987654",
  createdAt: 1726750000000,
};

const fullCustomerParams = buildCustomerTemplateParams(mockFullBooking);
assert.equal(fullCustomerParams[2], "Court 1");
assert.equal(fullCustomerParams[6], "600");
assert.equal(fullCustomerParams[8], "Paid");
assert.equal(fullCustomerParams[9], "0");

const fullOwnerParams = buildOwnerTemplateParams(mockFullBooking);
assert.equal(fullOwnerParams[3], "Court 1");
assert.equal(fullOwnerParams[8], "600");
assert.equal(fullOwnerParams[9], "Paid via UPI");
assert.equal(fullOwnerParams[12], "0");

console.log("✓ Test 2 Passed: Full Payment Booking handles 0 balance and 'Paid' status!");

console.log("\n🎉 ALL WHATSAPP NOTIFICATION TESTS PASSED SUCCESSFULLY!\n");
