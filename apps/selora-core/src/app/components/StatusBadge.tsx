import { cn } from "./ui/utils";

export type StatusType = 
  | "success" | "passed"
  | "warning" | "needs_review"
  | "danger" | "failed"
  | "info" | "queued"
  | "running" | "validating"
  | "ingested" | "generated" | "validated"
  | "auto_repaired" | "needs_human_review"
  | "archived" | "canceled" | "timed_out"
  | "normal" | "critical" | "exceeded";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  // Success states
  success: "bg-green-50 text-green-700 border-green-200",
  passed: "bg-green-50 text-green-700 border-green-200",
  validated: "bg-green-50 text-green-700 border-green-200",
  
  // Warning states
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  needs_review: "bg-amber-50 text-amber-700 border-amber-200",
  needs_human_review: "bg-amber-50 text-amber-700 border-amber-200",
  
  // Danger/Error states
  danger: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  exceeded: "bg-red-50 text-red-700 border-red-200",
  timed_out: "bg-red-50 text-red-700 border-red-200",
  
  // Info/Processing states
  info: "bg-blue-50 text-blue-700 border-blue-200",
  queued: "bg-blue-50 text-blue-700 border-blue-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  validating: "bg-blue-50 text-blue-700 border-blue-200",
  
  // Neutral states
  ingested: "bg-slate-50 text-slate-700 border-slate-200",
  generated: "bg-slate-50 text-slate-700 border-slate-200",
  auto_repaired: "bg-purple-50 text-purple-700 border-purple-200",
  archived: "bg-gray-50 text-gray-600 border-gray-200",
  canceled: "bg-gray-50 text-gray-600 border-gray-200",
  normal: "bg-slate-50 text-slate-700 border-slate-200",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
  const style = statusStyles[normalizedStatus] || statusStyles.info;
  
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border",
        style,
        className
      )}
    >
      {status}
    </span>
  );
}
