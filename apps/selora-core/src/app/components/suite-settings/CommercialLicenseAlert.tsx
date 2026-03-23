import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

type CommercialLicenseAlertProps = {
  children: string;
};

export function CommercialLicenseAlert({ children }: CommercialLicenseAlertProps) {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
      <ShieldAlert className="h-4 w-4 text-amber-700" />
      <AlertTitle>Commercial license required</AlertTitle>
      <AlertDescription className="text-amber-800">{children}</AlertDescription>
    </Alert>
  );
}