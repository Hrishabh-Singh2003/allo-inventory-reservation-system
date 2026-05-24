import { NextResponse } from "next/server";
import { StockService } from "@/services/stock.service";

export async function GET() {
  try {
    // Invoke stock service to retrieve products along with inventories and availability ratios
    const products = await StockService.getProductStockDetails();

    return NextResponse.json(products, { status: 200 });
  } catch (error: any) {
    console.error("GET /api/products API Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message || "Failed to retrieve products list.",
      },
      { status: 500 }
    );
  }
}
