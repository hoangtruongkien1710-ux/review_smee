import { ToastProvider } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="h-dvh overflow-hidden">{children}</div>
    </ToastProvider>
  );
}
