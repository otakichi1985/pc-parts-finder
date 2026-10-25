import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "search"
  | "memory"
  | "gpu"
  | "cpu"
  | "motherboard"
  | "ssd"
  | "keyword"
  | "external"
  | "refresh"
  | "alert"
  | "info"
  | "check"
  | "package"
  | "x";

const shapes: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7 7V4M12 7V4M17 7V4M7 17v3M12 17v3M17 17v3M7 11h2M11 11h2M15 11h2" />
    </>
  ),
  gpu: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="8" cy="12" r="2.4" />
      <circle cx="15" cy="12" r="2.4" />
      <path d="M20 10h2v4h-2" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" />
    </>
  ),
  motherboard: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="5" height="5" rx="1" />
      <path d="M16 7h2M16 10h2M7 16h11M7 13v6" />
    </>
  ),
  ssd: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 13h5" />
      <circle cx="16.5" cy="15.5" r="1" />
    </>
  ),
  keyword: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17.4" r=".7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r=".7" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 7" />,
  package: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({
  name,
  size = 18,
  className,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      className={["icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
