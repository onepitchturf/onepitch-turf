import { CourtId, CourtPricing } from "@/lib/bookingStore";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type DbCourtPricing = {
  court_id: CourtId;
  full_price_per_hour: number;
  advance_price_per_hour: number;
};

export async function getCourtPricing(): Promise<
  Record<CourtId, CourtPricing>
> {
  const { data, error } = await getSupabaseServerClient()
    .from("court_pricing")
    .select("court_id, full_price_per_hour, advance_price_per_hour");

  if (error) {
    throw error;
  }

  const pricing = {} as Record<CourtId, CourtPricing>;

  for (const row of (data || []) as DbCourtPricing[]) {
    pricing[row.court_id] = {
      courtId: row.court_id,
      fullPricePerHour: row.full_price_per_hour,
      advancePricePerHour: row.advance_price_per_hour,
    };
  }

  return pricing;
}
