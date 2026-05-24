"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Database, MapPin, Loader2, Plus, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string;
}

interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  warehouse: Warehouse;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: any;
  inventories: Inventory[];
}

interface CatalogClientProps {
  initialProducts: Product[];
  warehouses: Warehouse[];
}

export function CatalogClient({ initialProducts, warehouses }: CatalogClientProps) {
  const router = useRouter();

  // Modal / Selection states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Find stock levels in real time for selected choices
  const activeInventory = selectedProduct?.inventories.find(
    (inv) => inv.warehouseId === selectedWarehouseId
  );
  const maxAvailable = activeInventory ? activeInventory.availableQuantity : 0;

  const handleOpenReserve = (product: Product) => {
    setSelectedProduct(product);
    // Auto-select first warehouse with stock, or default first
    const firstWithStock = product.inventories.find((inv) => inv.availableQuantity > 0);
    setSelectedWarehouseId(
      firstWithStock?.warehouseId || product.inventories[0]?.warehouseId || ""
    );
    setQuantity(1);
  };

  const handleReserve = async () => {
    if (!selectedProduct || !selectedWarehouseId) return;

    if (quantity <= 0) {
      toast.error("Please enter a positive quantity.");
      return;
    }

    if (quantity > maxAvailable) {
      toast.error(`Cannot exceed maximum available stock (${maxAvailable}).`);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Executing concurrency-safe row lock transaction...");

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              productId: selectedProduct.id,
              warehouseId: selectedWarehouseId,
              quantity: quantity,
            },
          ],
          ttlMinutes: 10, // 10 minutes hold
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error("Overselling Blocked!", {
            id: toastId,
            description:
              data.message || "Simultaneous transaction reserved this inventory concurrently.",
            duration: 6000,
          });
          return;
        }
        throw new Error(data.message || data.error || "Failed to make reservation.");
      }

      toast.success("Reservation Hold Confirmed!", {
        id: toastId,
        description: `${quantity} unit(s) locked for 10 minutes. Complete checkout before time runs out.`,
        duration: 3000,
      });

      setSelectedProduct(null); // Close dialog
      // Navigate to checkout page with the newly created reservation ID
      router.push(`/checkout/${data.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error("Reservation Failed", {
        id: toastId,
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Introduction banner */}
      <div className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <h2 className="text-foreground text-xl font-bold tracking-tight">
          Interactive Inventory Control Room
        </h2>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Simulate checkouts, restocks, and multi-threaded race conditions. Select a product to
          place a secure 10-minute inventory reservation lock enforced by PostgreSQL Pessimistic row
          locking.
        </p>
      </div>

      {/* Grid listing products */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {initialProducts.map((product) => (
          <Card
            key={product.id}
            className="hover:border-primary/40 flex flex-col justify-between overflow-hidden transition-all hover:shadow-md"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <Badge
                  variant="outline"
                  className="text-muted-foreground font-mono text-xs uppercase"
                >
                  {product.sku}
                </Badge>
                <span className="text-primary text-lg font-bold">
                  ${Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <CardTitle className="mt-2 line-clamp-1 text-lg">{product.name}</CardTitle>
              <CardDescription className="line-clamp-2 min-h-8 text-xs">
                {product.description || "No description provided."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-muted-foreground border-border flex items-center gap-1.5 border-b pb-1 text-xs font-semibold tracking-wider uppercase">
                <Database className="h-3.5 w-3.5" />
                Warehouse Inventory Levels
              </div>

              <div className="space-y-3">
                {product.inventories.map((inv) => {
                  const available = inv.availableQuantity;
                  const reserved = inv.reservedQuantity;
                  const total = inv.totalQuantity;
                  const pctAvailable = total > 0 ? (available / total) * 100 : 0;

                  return (
                    <div key={inv.id} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground flex items-center gap-1 font-medium">
                          <MapPin className="text-muted-foreground h-3 w-3" />
                          {inv.warehouse.name
                            .replace("Hub", "")
                            .replace("Distribution Center", "")
                            .trim()}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {total === 0 ? (
                            <span className="text-destructive font-semibold">OUT OF STOCK</span>
                          ) : (
                            <>
                              <span className="text-foreground font-bold">{available}</span>
                              {" / "}
                              {total}
                              {reserved > 0 && (
                                <span className="ml-1 font-medium text-amber-500">
                                  ({reserved} reserved)
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </div>

                      {total > 0 && (
                        <div className="bg-secondary flex h-2 w-full overflow-hidden rounded-full">
                          {/* Available Stock portion */}
                          <div
                            className={`h-full rounded-l-full transition-all duration-500 ${
                              pctAvailable > 40
                                ? "bg-emerald-500"
                                : pctAvailable > 15
                                  ? "bg-amber-500"
                                  : "bg-destructive"
                            }`}
                            style={{ width: `${pctAvailable}%` }}
                          />
                          {/* Reserved Stock portion */}
                          <div
                            className="h-full bg-amber-500/40 transition-all duration-500"
                            style={{ width: `${(reserved / total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>

            <CardFooter className="border-border bg-card/40 border-t pt-2">
              <Button
                onClick={() => handleOpenReserve(product)}
                className="flex w-full items-center justify-center gap-1.5"
                variant={
                  product.inventories.some((inv) => inv.availableQuantity > 0)
                    ? "default"
                    : "outline"
                }
                disabled={!product.inventories.some((inv) => inv.availableQuantity > 0)}
              >
                {product.inventories.some((inv) => inv.availableQuantity > 0) ? (
                  <>
                    <Plus className="h-4 w-4" />
                    Reserve Stock
                  </>
                ) : (
                  "Completely Sold Out"
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Reservation Dialog Modal */}
      <Dialog
        open={selectedProduct !== null}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Lock Inventory Allocation</DialogTitle>
            <DialogDescription>
              This acquires a PostgreSQL row-level lock on the chosen stock row. No other checkout
              can alter this row until finished.
            </DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-4 py-4">
              <div className="bg-secondary rounded-lg p-3">
                <span className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                  Product
                </span>
                <span className="text-foreground block text-sm font-bold">
                  {selectedProduct.name}
                </span>
                <span className="text-muted-foreground mt-0.5 block font-mono text-xs uppercase">
                  {selectedProduct.sku}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="warehouse">Select Distribution Hub</Label>
                <Select
                  value={selectedWarehouseId}
                  onValueChange={(val) => {
                    setSelectedWarehouseId(val || "");
                    setQuantity(1);
                  }}
                >
                  <SelectTrigger id="warehouse" className="w-full">
                    <SelectValue placeholder="Choose a warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProduct.inventories.map((inv) => (
                      <SelectItem
                        key={inv.warehouseId}
                        value={inv.warehouseId}
                        disabled={inv.availableQuantity <= 0}
                      >
                        {inv.warehouse.name} ({inv.availableQuantity} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="quantity">Quantity to Reserve</Label>
                  <span className="text-muted-foreground text-xs font-semibold">
                    Available: <span className="text-foreground">{maxAvailable}</span> units
                  </span>
                </div>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={maxAvailable}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setQuantity(Math.min(Math.max(val, 1), maxAvailable));
                  }}
                  className="w-full font-mono"
                  disabled={maxAvailable <= 0}
                />
              </div>

              {maxAvailable > 0 && (
                <div className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <div>
                    <span className="font-bold">Database Hold Action:</span> Reserves {quantity}{" "}
                    item(s) for 10 minutes. Stocks available inside US-West will decrement locally.
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedProduct(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleReserve}
              disabled={isSubmitting || maxAvailable <= 0}
              className="flex items-center gap-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  Confirm Hold
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
