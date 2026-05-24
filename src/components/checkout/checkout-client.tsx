"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Clock,
  ShoppingBag,
  CheckCircle2,
  Calendar,
  MapPin,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface Product {
  name: string;
  sku: string;
  price: any;
}

interface Warehouse {
  name: string;
  location: string;
}

interface ReservationItem {
  id: string;
  quantity: number;
  product: Product;
  warehouse: Warehouse;
}

interface Reservation {
  id: string;
  status: string;
  expiresAt: string;
  items: ReservationItem[];
}

interface CheckoutClientProps {
  reservation: Reservation;
}

export function CheckoutClient({ reservation }: CheckoutClientProps) {
  const router = useRouter();

  // Component states
  const [secondsLeft, setSecondsLeft] = useState<number>(600); // 10 minutes default
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Billing form states
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  // Calculate order totals
  const subtotal = reservation.items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0
  );
  const tax = subtotal * 0.0825; // 8.25% Sales tax
  const shipping = subtotal > 500 ? 0 : 15.0; // Free shipping above $500
  const grandTotal = subtotal + tax + shipping;

  // 1. Core Timer Ticking Mechanism
  useEffect(() => {
    if (reservation.status !== "PENDING" || isSuccess) return;

    const targetTime = new Date(reservation.expiresAt).getTime();

    const tick = () => {
      const now = new Date().getTime();
      const difference = targetTime - now;

      if (difference <= 0) {
        setSecondsLeft(0);
        setIsExpired(true);
        setErrorMessage("Checkout Lock Expired. The stock was returned to available inventory.");
        toast.error("Stock Lock Expired", {
          description: "Your reservation time expired. The locked inventory has been restored.",
          duration: 6000,
        });
        return;
      }

      setSecondsLeft(Math.floor(difference / 1000));
    };

    tick(); // run once immediately
    const timerId = setInterval(tick, 1000);

    return () => clearInterval(timerId);
  }, [reservation.expiresAt, reservation.status, isSuccess]);

  // Format seconds into MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  // Compute timer visual urgency ratio
  const progressRatio = (secondsLeft / 600) * 100;

  // 2. Complete Purchase Handler (Calls /confirm API)
  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isExpired) {
      setErrorMessage("Cannot complete checkout. This stock hold has expired.");
      return;
    }

    if (!email || !name || !cardNumber) {
      toast.error("Please fill out all billing credentials.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const toastId = toast.loading("Finalizing purchase and decrementing inventory...");

    try {
      const response = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 || response.status === 410) {
          // 409 / 410 Expiry / Overlap handling
          setErrorMessage(
            "Purchase Blocked: The inventory hold expired in the background before you submitted."
          );
          setIsExpired(true);
          toast.error("Hold Expired", {
            id: toastId,
            description: "Database stock locks were released prior to completing the transaction.",
            duration: 6000,
          });
          return;
        }
        throw new Error(data.message || data.error || "Failed to process payment.");
      }

      toast.success("Order Placed Successfully!", {
        id: toastId,
        description: "Payment processed and stocks decremented atomically.",
        duration: 5000,
      });

      setIsSuccess(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Payment Failed", {
        id: toastId,
        description: err.message || "An unexpected transaction error occurred.",
      });
      setErrorMessage(err.message || "Failed to finalize order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Cancel Booking Handler (Calls /release API)
  const handleCancel = async () => {
    const toastId = toast.loading("Releasing your stock hold allocation...");

    try {
      const response = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel hold.");
      }

      toast.success("Reservation Hold Canceled", {
        id: toastId,
        description: "Items returned to available stock list.",
      });

      router.push("/");
    } catch (err: any) {
      console.error(err);
      toast.error("Release Failed", {
        id: toastId,
        description: "Could not safely cancel hold.",
      });
    }
  };

  // 4. Order Confirmation success screen
  if (isSuccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card className="bg-card overflow-hidden border-emerald-500/20 shadow-lg">
          <CardHeader className="space-y-2 bg-emerald-500/10 py-8 text-center">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 animate-pulse text-emerald-500" />
            </div>
            <CardTitle className="text-foreground text-2xl font-extrabold">
              Order Confirmed!
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Thank you for your purchase. Stocks have been atomically decremented.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6">
            <div className="border-border bg-secondary/50 space-y-3 rounded-lg border p-4">
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>ORDER ID</span>
                <span className="text-foreground max-w-[200px] truncate font-mono font-bold">
                  {reservation.id}
                </span>
              </div>
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>ESTIMATED SHIPMENT</span>
                <span className="text-foreground flex items-center gap-1 font-bold">
                  <Calendar className="h-3.5 w-3.5" />
                  Within 24 Hours
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-muted-foreground border-border flex items-center gap-1.5 border-b pb-1 text-sm font-semibold tracking-wider uppercase">
                <ShoppingBag className="h-4 w-4" />
                Purchased Stock Breakdown
              </h4>

              {reservation.items.map((item) => (
                <div key={item.id} className="flex justify-between py-1 text-sm">
                  <div>
                    <span className="text-foreground font-bold">{item.product.name}</span>
                    <span className="text-muted-foreground mt-0.5 block flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3" />
                      Shipped from: {item.warehouse.name}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono">Qty: {item.quantity}</span>
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter className="bg-card/60 border-border flex justify-center border-t p-4">
            <Button onClick={() => router.push("/")} className="w-full sm:w-auto">
              Return to Catalog Room
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-4 lg:grid-cols-12">
      {/* Expiry Banner Alerts */}
      {errorMessage && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive flex animate-pulse items-start gap-2 rounded-lg border p-4 text-sm lg:col-span-12">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <span className="font-bold">Transaction Aborted:</span> {errorMessage}
          </div>
        </div>
      )}

      {/* Left Column: Billing Details & Payment Forms */}
      <div className="space-y-6 lg:col-span-7">
        <div className="flex items-center gap-2">
          <Button
            onClick={handleCancel}
            variant="ghost"
            size="sm"
            className="hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Abort & Return
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Secure Checkout</CardTitle>
            <CardDescription>Complete billing details to finalize stock bookings.</CardDescription>
          </CardHeader>
          <form onSubmit={handlePurchase}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@university.edu"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isExpired || isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Billing Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isExpired || isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="card">Card Payment Number</Label>
                <div className="relative">
                  <CreditCard className="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
                  <Input
                    id="card"
                    type="text"
                    placeholder="•••• •••• •••• ••••"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="pl-10 font-mono"
                    disabled={isExpired || isSubmitting}
                  />
                </div>
              </div>

              <div className="border-border bg-secondary/30 text-muted-foreground flex items-center gap-2 rounded-md border p-3 text-xs">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  Payments encrypted natively. Database pessimistic locks secure stock levels until
                  checkout complete.
                </span>
              </div>
            </CardContent>

            <CardFooter className="border-border flex flex-col gap-4 border-t pt-6 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Cancel Hold Allocation
              </Button>
              <Button
                type="submit"
                disabled={isExpired || isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/95 flex flex-1 items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Decrementing stocks...
                  </>
                ) : (
                  <>
                    Complete Payment ($
                    {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Right Column: Reservation Lock Timer & Billing Receipt */}
      <div className="space-y-6 lg:col-span-5">
        {/* Urgency Hold Timer Card */}
        <Card
          className={`overflow-hidden border-l-4 shadow-sm transition-all ${
            isExpired
              ? "border-l-destructive bg-destructive/5"
              : secondsLeft < 60
                ? "border-l-destructive bg-destructive/10 animate-pulse"
                : secondsLeft < 300
                  ? "border-l-amber-500 bg-amber-500/5"
                  : "border-l-primary bg-primary/5"
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
              <Clock className="text-foreground h-4 w-4" />
              Inventory Hold Guarantee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">RESERVATIONS EXPIRING IN</span>
              <span
                className={`font-mono text-2xl font-extrabold ${
                  isExpired || secondsLeft < 60 ? "text-destructive" : "text-foreground"
                }`}
              >
                {isExpired ? "00:00" : formatTime(secondsLeft)}
              </span>
            </div>

            {/* Hold progress bar */}
            {!isExpired && (
              <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    secondsLeft < 60
                      ? "bg-destructive"
                      : secondsLeft < 300
                        ? "bg-amber-500"
                        : "bg-primary"
                  }`}
                  style={{ width: `${progressRatio}%` }}
                />
              </div>
            )}

            <p className="text-muted-foreground mt-2 text-xs">
              {isExpired ? (
                <span className="text-destructive font-bold">
                  Lock Expired! Items returned back to shelves.
                </span>
              ) : (
                "These items are exclusively locked for you. Other shoppers cannot purchase them until your hold expires."
              )}
            </p>
          </CardContent>
        </Card>

        {/* Order Summary Billing breakdown */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="text-primary h-5 w-5" />
              Hold Receipt Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Basket Items List */}
            <div className="space-y-3">
              {reservation.items.map((item) => (
                <div key={item.id} className="flex justify-between py-1 text-sm">
                  <div>
                    <span className="text-foreground font-bold">{item.product.name}</span>
                    <span className="text-muted-foreground mt-0.5 block flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3" />
                      Warehouse: {item.warehouse.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-foreground block font-semibold">
                      $
                      {(Number(item.product.price) * item.quantity).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-muted-foreground block font-mono text-xs">
                      {item.quantity} x ${Number(item.product.price).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Calculations Breakdown */}
            <div className="text-muted-foreground space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Hold Subtotal</span>
                <span className="text-foreground font-mono">
                  ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Sales Tax (8.25%)</span>
                <span className="text-foreground font-mono">
                  ${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Secured Global Shipping</span>
                <span className="text-foreground font-mono">
                  {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
                </span>
              </div>
            </div>

            <Separator />

            {/* Grand Total */}
            <div className="flex items-baseline justify-between">
              <span className="text-foreground font-bold">Estimated Total</span>
              <span className="text-foreground font-mono text-xl font-black">
                ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
