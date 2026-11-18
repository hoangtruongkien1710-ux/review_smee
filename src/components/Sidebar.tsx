"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Search, UploadCloud, Settings, LogOut, UserRound } from "lucide-react";
import { Avatar, Logo, Menu, MenuItem, api } from "./ui";
import { cn } from "@/lib/utils";
import { useUploads } from "./UploadManager";
import { NotificationBell } from "./Notifications";
import type { SessionUser } from "@/lib/auth";

export function Sidebar({ user }: { user: SessionUser }) {
  const path = usePathname();
  const router = useRouter();
  const admin = user.role === "OWNER" || user.role === "ADMIN";
  const uploads = useUploads();
  const activeUploads = uploads.items.filter((x) => x.status === "uploading" || x.status === "queued").length;

  const items = [
    { href: "/", icon: Home, label: "Projects", active: path === "/" || path.startsWith("/projects") },
    { href: "#", icon: Search, label: "Tìm kiếm (sắp có)", disabled: true },
  ];

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-line bg-panel py-3 phone-land:hidden">
      <Link href="/" className="mb-4" title="Smee Review">
        <Logo size={30} />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            title={it.label}
            aria-disabled={it.disabled}
            className={cn(
              "flex size-10 items-center justify-center rounded-lg transition-colors",
              it.active ? "bg-accent/15 text-accent" : "text-mut hover:bg-panel-2 hover:text-fg",
              it.disabled && "pointer-events-none opacity-40",
            )}
          >
            <it.icon size={19} />
          </Link>
        ))}
        <NotificationBell />
        <button
          title="Danh sách upload"
          onClick={() => uploads.setOpen(!uploads.open)}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg text-mut hover:bg-panel-2 hover:text-fg",
            uploads.items.length === 0 && "opacity-40",
          )}
        >
          <UploadCloud size={19} />
          {activeUploads > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {activeUploads}
            </span>
          )}
        </button>
      </nav>
      <div className="flex flex-col items-center gap-2">
        {admin && (
          <Link
            href="/settings/users"
            title="Cài đặt"
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              path.startsWith("/settings") ? "bg-accent/15 text-accent" : "text-mut hover:bg-panel-2 hover:text-fg",
            )}
          >
            <Settings size={19} />
          </Link>
        )}
        <Menu align="left" up trigger={() => <button className="mt-1 rounded-full" title={user.name}><Avatar name={user.name} color={user.color} size={30} /></button>}>
          {(close) => (
            <div>
              <div className="border-b border-line px-2.5 py-2">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-mut">{user.email}</div>
              </div>
              <MenuItem
                icon={<UserRound size={15} />}
                onClick={() => {
                  close();
                  router.push("/account");
                }}
              >
                Tài khoản của tôi
              </MenuItem>
              <MenuItem
                icon={<LogOut size={15} />}
                onClick={async () => {
                  close();
                  await api("/api/auth/logout", { method: "POST" });
                  router.replace("/login");
                  router.refresh();
                }}
              >
                Đăng xuất
              </MenuItem>
            </div>
          )}
        </Menu>
      </div>
    </aside>
  );
}
