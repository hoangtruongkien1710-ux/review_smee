import { requirePageUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui";
import { UploadProvider } from "@/components/UploadManager";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <ToastProvider>
      <UploadProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar user={user} />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      </UploadProvider>
    </ToastProvider>
  );
}
