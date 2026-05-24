"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

interface ReservationTimerProps {
  expiresAt: string | Date;
  status: string;
}

export function ReservationTimer({ expiresAt, status }: ReservationTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (status !== "PENDING") {
      return;
    }

    const targetDate = new Date(expiresAt).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance <= 0) {
        setTimeLeft("00:00");
        setIsExpired(true);
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
      const displaySeconds = seconds < 10 ? `0${seconds}` : seconds;

      setTimeLeft(`${displayMinutes}:${displaySeconds}`);
    };

    updateTimer(); // run once immediately
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [expiresAt, status]);

  if (status !== "PENDING") {
    return null;
  }

  if (isExpired) {
    return (
      <span className="text-destructive inline-flex items-center gap-1 font-mono text-xs font-semibold">
        <Timer className="h-3.5 w-3.5" />
        Timed Out
      </span>
    );
  }

  return (
    <span className="inline-flex animate-pulse items-center gap-1 font-mono text-xs font-semibold text-amber-500">
      <Timer className="h-3.5 w-3.5" />
      {timeLeft}
    </span>
  );
}
