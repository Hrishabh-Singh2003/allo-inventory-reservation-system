import { StockService } from "@/services/stock.service";
import { WarehouseService } from "@/services/warehouse.service";
import { CatalogClient } from "@/components/dashboard/catalog-client";

// Force Dynamic rendering to always query fresh stock levels
export const dynamic = "force-dynamic";

export default async function Home() {
  // Query stock levels directly on server
  const productsRaw = await StockService.getProductStockDetails();
  const warehouses = await WarehouseService.listWarehouses();

  // Serialization handling: decimals inside JSON must be strings
  const products = productsRaw.map((p) => ({
    ...p,
    price: Number(p.price),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
          Inventory Control Center
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Real-time dual-quantity warehouse monitoring and transactional safety validations.
        </p>
      </div>

      <CatalogClient initialProducts={products} warehouses={warehouses} />
    </div>
  );
}
