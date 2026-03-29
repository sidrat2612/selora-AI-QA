import { Skeleton } from "./ui/skeleton";
import { Card } from "./ui/card";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-border px-6 py-4 flex gap-4 last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton
              key={j}
              className="h-4 flex-1"
              style={{ maxWidth: j === 0 ? "40%" : "20%" }}
            />
          ))}
        </div>
      ))}
    </Card>
  );
}
