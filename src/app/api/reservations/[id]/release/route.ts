import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Resolve dynamic path parameters asynchronously (Next.js 15+ standard)
    const { id } = await params;

    // Business transaction execution
    const reservation = await ReservationService.releaseReservation(id);

    return NextResponse.json(reservation, { status: 200 });
  } catch (error: any) {
    console.error("Release Reservation API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
