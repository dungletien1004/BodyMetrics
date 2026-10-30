"use client";

import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Người dùng", icon: Users, active: (p: string) => p === "/admin" || (p.startsWith("/admin/users/") && p !== "/admin/users/new") },
  { href: "/admin/users/new", label: "Thêm người dùng", icon: UserPlus, active: (p: string) => p === "/admin/users/new" },
];

// On phones the links drop to their own row under the brand.
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="order-last -mx-1 flex w-full gap-1 md:order-none md:mx-0 md:w-auto">
      {LINKS.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 border-b-2 px-2 pt-1 pb-2 text-sm transition md:rounded-lg md:border-b-0 md:px-3 md:py-1.5",
            active(pathname)
              ? "border-amber-400 font-medium text-white md:bg-white/10"
              : "border-transparent text-zinc-400 hover:text-white md:hover:bg-white/5",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}
