import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Authorization Header Check
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized access. Invalid or missing secret token." },
        { status: 401 }
      );
    }

    // 2. Transaction Layer: Run system-wide clean up
    console.log("⏱️ Cron Triggered: Releasing expired reservations...");
    const result = await ReservationService.cleanupExpiredGlobal();
    console.log(`⏱️ Cron Completed: Released ${result.count} reservations.`);

    return NextResponse.json({
      message: "Expired reservations clean up operation complete.",
      clearedCount: result.count,
    });
  } catch (error: any) {
    console.error("Cron clean up API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
