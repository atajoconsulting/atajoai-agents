"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileCog, Files, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "viewer" as const },
  { href: "/config", label: "Config", icon: FileCog, minRole: "editor" as const },
  { href: "/documents", label: "Documents", icon: Files, minRole: "viewer" as const },
  { href: "/settings/users", label: "Users", icon: Shield, minRole: "admin" as const },
];

const ROLE_LEVEL: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };

type Props = {
  role: string;
};

export function AppSidebar({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const userLevel = ROLE_LEVEL[role] ?? 0;

  async function handleSignOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r bg-card/60">
      <div className="border-b px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          AtajoAI
        </p>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Control Panel</h1>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-4">
        {items
          .filter((item) => userLevel >= (ROLE_LEVEL[item.minRole] ?? 0))
          .map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </nav>
      <div className="border-t p-4">
        <Button className="w-full justify-start" variant="ghost" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesion
        </Button>
      </div>
    </aside>
  );
}
