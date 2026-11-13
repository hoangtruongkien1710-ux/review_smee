import { ToastProvider } from "@/components/ui";
import { I18nProvider } from "@/components/I18n";
import { guestLang } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider initial={await guestLang()}>
      <ToastProvider>
        <div className="h-dvh overflow-hidden">{children}</div>
      </ToastProvider>
    </I18nProvider>
  );
}
