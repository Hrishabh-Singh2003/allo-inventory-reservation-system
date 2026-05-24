"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Clock, AlertCircle, RefreshCw, Trash2, ShoppingCart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReservationTimer } from "./reservation-timer";
import Link from "next/link";

interface Product {
  name: string;
  sku: string;
}

interface Warehouse {
  name: string;
}

interface ReservationItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  product: Product;
  warehouse: Warehouse;
}

interface Reservation {
  id: string;
  status: string;
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
  items: ReservationItem[];
}

interface ReservationsClientProps {
  initialReservations: Reservation[];
}

export function ReservationsClient({ initialReservations }: ReservationsClientProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const handleConfirm = async (id: string) => {
    setIsUpdating(id);
    const toastId = toast.loading("Processing order confirmation transaction...");

    try {
      const response = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error("Confirmation Blocked!", {
            id: toastId,
            description: data.message || "This reservation hold has expired in the database.",
            duration: 5000,
          });
          return;
        }
        throw new Error(data.message || data.error || "Failed to confirm reservation.");
      }

      toast.success("Reservation Confirmed!", {
        id: toastId,
        description: "Physical stock decremented successfully. Order ready for shipment.",
        duration: 4000,
      });

      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error("Confirmation Failed", {
        id: toastId,
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRelease = async (id: string) => {
    setIsUpdating(id);
    const toastId = toast.loading("Releasing locked stock allocation...");

    try {
      const response = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to release reservation.");
      }

      toast.success("Stock Allocation Released", {
        id: toastId,
        description: "Reserved stock has been successfully restored to the available pool.",
        duration: 4000,
      });

      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error("Release Failed", {
        id: toastId,
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  // Scheduled Active Cleanup simulation trigger
  const handleTriggerCleanup = async () => {
    setIsClearing(true);
    const toastId = toast.loading("Simulating scheduled Cron job trigger...");

    try {
      const response = await fetch("/api/reservations/cleanup", {
        method: "POST",
        headers: {
          Authorization: "Bearer super-secret-cleanup-token-for-cron-scheduler",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Cron trigger execution failed.");
      }

      toast.success("Expiry Cron Script Finished!", {
        id: toastId,
        description: `Successfully found and released ${data.clearedCount} expired allocation(s).`,
        duration: 5000,
      });

      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error("Cron Trigger Failed", {
        id: toastId,
        description: err.message || "An unexpected error occurred during execution.",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-amber-500 text-white hover:bg-amber-600">Pending Hold</Badge>;
      case "CONFIRMED":
        return <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">Confirmed</Badge>;
      case "RELEASED":
        return (
          <Badge variant="secondary" className="text-muted-foreground">
            Released
          </Badge>
        );
      case "EXPIRED":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header Panel */}
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-foreground text-xl font-bold tracking-tight">
            Reservations Log & Controller
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Track allocations, observe active live countdowns, and verify JIT or Active Expiry
            mechanics.
          </p>
        </div>

        <Button
          onClick={handleTriggerCleanup}
          disabled={isClearing}
          variant="outline"
          className="flex items-center gap-1.5 self-start border-amber-500/30 text-amber-500 hover:bg-amber-500/10 sm:self-center"
        >
          {isClearing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Simulate Expiry Cron Job
        </Button>
      </div>

      {/* Main Reservation Log table */}
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        {initialReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Clock className="text-muted-foreground mb-3 h-10 w-10 animate-pulse" />
            <h3 className="text-foreground text-lg font-bold">No active bookings found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Go to the Catalog page, lock down some product allocations, and they will show up in
              this log center.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px] font-semibold">Reservation ID</TableHead>
                <TableHead className="min-w-[200px] font-semibold">Reserved Items</TableHead>
                <TableHead className="w-[120px] font-semibold">Status</TableHead>
                <TableHead className="w-[150px] font-semibold">Created At</TableHead>
                <TableHead className="w-[150px] font-semibold">Hold Expiry / Status</TableHead>
                <TableHead className="w-[160px] text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialReservations.map((res) => (
                <TableRow key={res.id} className="hover:bg-card/60 transition-colors">
                  <TableCell className="text-muted-foreground max-w-[120px] truncate font-mono text-xs">
                    {res.id}
                  </TableCell>

                  <TableCell className="space-y-1">
                    {res.items.map((item) => (
                      <div key={item.id} className="text-xs">
                        <span className="text-foreground font-semibold">{item.product.name}</span>
                        {" - "}
                        <span className="bg-secondary text-muted-foreground rounded px-1 py-0.5 font-mono text-[10px]">
                          Qty: {item.quantity}
                        </span>
                        {" from "}
                        <span className="text-muted-foreground font-medium">
                          {item.warehouse.name.replace("Hub", "").trim()}
                        </span>
                      </div>
                    ))}
                  </TableCell>

                  <TableCell>{getStatusBadge(res.status)}</TableCell>

                  <TableCell className="text-muted-foreground text-xs font-medium">
                    {new Date(res.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </TableCell>

                  <TableCell>
                    {res.status === "PENDING" ? (
                      <ReservationTimer expiresAt={res.expiresAt} status={res.status} />
                    ) : res.status === "CONFIRMED" ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-500">
                        <Check className="h-3.5 w-3.5" />
                        Confirmed
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Released
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {res.status === "PENDING" ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRelease(res.id)}
                          disabled={isUpdating !== null}
                          className="border-destructive/20 text-destructive hover:bg-destructive/10 h-8 px-2"
                        >
                          <X className="h-3.5 w-3.5" />
                          Release
                        </Button>
                        <Link href={`/checkout/${res.id}`}>
                          <Button
                            size="sm"
                            disabled={isUpdating !== null}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-2"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            Checkout
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs italic select-none">
                        No actions
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
