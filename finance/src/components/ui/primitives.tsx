"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-card border border-border rounded-2xl shadow-card p-5", className)} {...rest} />;
}

export function Button({
  className,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "destructive" }) {
  const styles = {
    primary: "bg-accent text-bg hover:opacity-90",
    secondary: "bg-card border border-border hover:bg-bg",
    ghost: "hover:bg-card",
    destructive: "bg-negative text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        styles,
        className,
      )}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent",
        className,
      )}
      {...rest}
    />
  );
}

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted block mb-1.5", className)} {...rest} />;
}

export function Badge({ className, children, tone = "neutral" }: { className?: string; children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "warning" }) {
  const tones = {
    neutral: "bg-card border border-border text-muted",
    positive: "bg-positive/10 text-positive border border-positive/20",
    negative: "bg-negative/10 text-negative border border-negative/20",
    warning: "bg-yellow-500/10 text-yellow-700 border border-yellow-500/20",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones, className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-border/40 rounded-lg", className)} />;
}
