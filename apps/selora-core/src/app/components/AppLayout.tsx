import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { 
  LayoutDashboard, 
  FolderKanban, 
  FileCheck2, 
  PlayCircle, 
  MessageSquare, 
  FileText, 
  Settings,
  Search,
  Bell,
  ChevronDown,
  Building2,
  Shield,
  Menu
} from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "./ui/utils";
import { CommandPalette } from "./CommandPalette";
import { useAuth, usePermissions } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { notifications as notificationsApi, type AppNotification as NotifType } from "../../lib/api-client";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Suites", href: "/suites", icon: FolderKanban },
  { name: "Tests", href: "/tests", icon: FileCheck2 },
  { name: "Runs", href: "/runs", icon: PlayCircle },
  { name: "Feedback", href: "/feedback", icon: MessageSquare },
  { name: "Audit", href: "/audit", icon: FileText },
];

const settingsNav = [
  { name: "Members", href: "/settings/members" },
  { name: "Execution", href: "/settings/execution" },
  { name: "Lifecycle", href: "/settings/lifecycle" },
  { name: "Quotas", href: "/settings/quotas" },
  { name: "Retention", href: "/settings/retention" },
  { name: "Environments", href: "/settings/environments" },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const permissions = usePermissions();
  const { workspaceMemberships, activeWorkspaceId, setActiveWorkspaceId } = useWorkspace();
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setNotifItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const activeWs = workspaceMemberships.find(m => m.workspaceId === activeWorkspaceId);
  const userInitials = user ? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "??";
  const userRole = activeWs?.role?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Member";

  // Build settings sub-nav based on permissions
  const settingsNav = useMemo(() => {
    const items: { name: string; href: string }[] = [];
    if (permissions.canManageMembers) items.push({ name: "Members", href: "/settings/members" });
    // Execution settings visible to admins and operators
    if (permissions.canManageCompany || permissions.canAuthorAutomation)
      items.push({ name: "Execution", href: "/settings/execution" });
    if (permissions.canManageCompany) items.push({ name: "Lifecycle", href: "/settings/lifecycle" });
    if (permissions.canManageCompany) items.push({ name: "Quotas", href: "/settings/quotas" });
    if (permissions.canManageCompany) items.push({ name: "Retention", href: "/settings/retention" });
    if (permissions.canManageEnvironments) items.push({ name: "Environments", href: "/settings/environments" });
    return items;
  }, [permissions]);

  const showSettings = settingsNav.length > 0;
  
  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };

  const isSettingsActive = location.pathname.startsWith("/settings");
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-white border-r border-slate-200 transition-transform",
          !sidebarOpen && "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-slate-200 px-6">
            <Shield className="h-7 w-7 text-emerald-600" />
            <span className="ml-3 text-xl font-semibold text-slate-900">Selora</span>
          </div>

          {/* Workspace Switcher */}
          <div className="border-b border-slate-200 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="text-sm truncate">{activeWs?.workspaceName ?? "Select Workspace"}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaceMemberships.map((m) => (
                  <DropdownMenuItem
                    key={m.workspaceId}
                    onClick={() => m.workspaceId && setActiveWorkspaceId(m.workspaceId)}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    {m.workspaceName ?? m.workspaceId}
                  </DropdownMenuItem>
                ))}
                {workspaceMemberships.length === 0 && (
                  <DropdownMenuItem disabled>No workspaces</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navigation.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}

            <div className="pt-4">
              {showSettings && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isSettingsActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <Settings className="h-5 w-5" />
                      Settings
                      <ChevronDown className="ml-auto h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {settingsNav.map((item) => (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link to={item.href} className="cursor-pointer">
                          {item.name}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </nav>

          {/* User Menu */}
          <div className="border-t border-slate-200 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                  <Avatar className="h-8 w-8 border border-emerald-200">
                    <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? "User avatar"} />
                    <AvatarFallback className="bg-emerald-100 text-sm font-medium text-emerald-700">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-900">{user?.name ?? "User"}</p>
                    <p className="text-xs text-slate-500">{userRole}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/account/profile">Profile Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account/preferences">Preferences</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn("lg:pl-64", !sidebarOpen && "lg:pl-0")}>
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 items-center gap-4">
            <Button
              variant="outline"
              className="w-full max-w-md justify-start text-slate-500 lg:w-64"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="mr-2 h-4 w-4" />
              Search or jump to...
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); if (open) fetchNotifications(); }}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notifications
                  {unreadCount > 0 && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await notificationsApi.markAllRead();
                        fetchNotifications();
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifItems.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-500 text-center">No notifications</div>
                ) : (
                  notifItems.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn("flex flex-col items-start gap-0.5 cursor-pointer", !n.read && "bg-blue-50")}
                      onClick={async () => {
                        if (!n.read) {
                          await notificationsApi.markRead(n.id);
                          fetchNotifications();
                        }
                      }}
                    >
                      <span className="text-sm font-medium">{n.title}</span>
                      {n.message && <span className="text-xs text-slate-500 line-clamp-2">{n.message}</span>}
                      <span className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
