import { useNavigate } from "react-router";
import { 
  LayoutDashboard, 
  Building2,
  FileText,
  BarChart3,
  Settings,
  AlertTriangle,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search or jump to..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => handleSelect("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/tenants")}>
            <Building2 className="mr-2 h-4 w-4" />
            <span>Tenants</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/audit")}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Audit</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/usage")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Usage & Quotas</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => handleSelect("/settings/lifecycle")}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            <span>Lifecycle</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/settings/quotas")}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Quotas</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
