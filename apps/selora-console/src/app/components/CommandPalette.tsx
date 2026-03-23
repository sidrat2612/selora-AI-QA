import { useNavigate } from "react-router";
import { 
  LayoutDashboard, 
  FolderKanban, 
  FileCheck2, 
  PlayCircle,
  Settings,
  Users,
  Database,
  Shield
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
          <CommandItem onSelect={() => handleSelect("/suites")}>
            <FolderKanban className="mr-2 h-4 w-4" />
            <span>Suites</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/tests")}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            <span>Tests</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/runs")}>
            <PlayCircle className="mr-2 h-4 w-4" />
            <span>Runs</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => handleSelect("/settings/members")}>
            <Users className="mr-2 h-4 w-4" />
            <span>Members</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/settings/environments")}>
            <Database className="mr-2 h-4 w-4" />
            <span>Environments</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/settings/quotas")}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Quotas</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Admin">
          <CommandItem onSelect={() => handleSelect("/platform-admin")}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Platform Admin</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
