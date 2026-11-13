import { requirePageUser } from "@/lib/auth";
import { AccountForm } from "@/components/AccountForm";

export default async function AccountPage() {
  const me = await requirePageUser();
  return <AccountForm me={me} />;
}
