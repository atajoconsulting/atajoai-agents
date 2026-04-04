import { AppSidebar } from "@/components/app/sidebar";
import { requireSession } from "@/lib/auth-helpers";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={session.user.role ?? "viewer"} />
      <main className="flex-1">
        <header className="border-b bg-background/80 px-8 py-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Sesion activa</p>
              <h2 className="text-lg font-semibold">{session.user.name}</h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {session.user.role}
              </p>
            </div>
          </div>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
