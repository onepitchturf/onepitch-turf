import { NextResponse } from "next/server";
import { getCourtPricing } from "@/lib/pricingService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pricing = await getCourtPricing();
    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    console.error("Pricing API error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load pricing." },
      { status: 503 },
    );
  }
}
