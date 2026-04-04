import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/login-form";
import { getServerSession } from "@/lib/auth-helpers";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <LoginForm />
    </main>
  );
}
