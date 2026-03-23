import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

interface RepairAttempt {
  id: string;
  date: string;
  type: "auto" | "manual";
  issue: string;
  resolution: string;
  status: "success" | "failed" | "pending";
  duration?: string;
}

interface RepairAttemptsHistoryProps {
  attempts: RepairAttempt[];
}

export function RepairAttemptsHistory({ attempts }: RepairAttemptsHistoryProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200">
            Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200">
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (attempts.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No repair attempts recorded</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b">
        <h3 className="font-semibold text-foreground">Repair Attempts History</h3>
        <p className="text-sm text-muted-foreground">
          Automatic and manual repair attempts for this test
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Resolution</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attempts.map((attempt) => (
            <TableRow key={attempt.id}>
              <TableCell className="text-sm text-muted-foreground">
                {attempt.date}
              </TableCell>
              <TableCell>
                <Badge variant={attempt.type === "auto" ? "default" : "secondary"}>
                  {attempt.type === "auto" ? "Auto Repair" : "Manual Fix"}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="text-sm text-foreground line-clamp-2">{attempt.issue}</p>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {attempt.resolution}
                </p>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusIcon(attempt.status)}
                  {getStatusBadge(attempt.status)}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {attempt.duration || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
