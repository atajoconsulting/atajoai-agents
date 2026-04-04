import { UsersClient } from "@/components/app/users-client";
import { requireAdminSession } from "@/lib/auth-helpers";

export default async function UsersPage() {
  const session = await requireAdminSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Alta, roles y borrado de cuentas para el panel operativo.
        </p>
      </div>
      <UsersClient currentUserId={session.user.id} />
    </div>
  );
}
