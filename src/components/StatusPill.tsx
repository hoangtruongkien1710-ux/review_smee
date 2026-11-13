"use client";

import { ChevronDown } from "lucide-react";
import { STATUSES, statusOf } from "@/lib/statuses";
import { Menu, MenuItem } from "./ui";
import { useT } from "./I18n";

export function StatusPill({
  value,
  onChange,
  disabled,
  size = "sm",
}: {
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const s = statusOf(value);
  const t = useT();
  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 ${size === "md" ? "h-7 text-sm" : "h-6 text-xs"} font-medium`}
      style={{ borderColor: s.color + "55", background: s.color + "1f", color: s.color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {t(s.label)}
      {!disabled && onChange && <ChevronDown size={12} />}
    </span>
  );
  if (disabled || !onChange) return pill;
  return (
    <Menu align="left" trigger={() => <button type="button">{pill}</button>}>
      {(close) =>
        STATUSES.map((x) => (
          <MenuItem
            key={x.key}
            onClick={() => {
              close();
              if (x.key !== value) onChange(x.key);
            }}
            icon={<span className="block size-2 rounded-full" style={{ background: x.color }} />}
          >
            {t(x.label)}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
