import { NextResponse } from "next/server";
import { WarehouseService } from "@/services/warehouse.service";

export async function GET() {
  try {
    // Invoke warehouse service to retrieve the list of hubs
    const warehouses = await WarehouseService.listWarehouses();

    return NextResponse.json(warehouses, { status: 200 });
  } catch (error: any) {
    console.error("GET /api/warehouses API Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message || "Failed to retrieve warehouses list.",
      },
      { status: 500 }
    );
  }
}
