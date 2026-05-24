import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export async function POST(req: NextRequest) {
  try {
    // 1. Authorization Header Check
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized access. Invalid or missing secret token." },
        { status: 401 }
      );
    }

    // 2. Transaction Layer: Run clean up
    const result = await ReservationService.cleanupExpiredGlobal();

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
