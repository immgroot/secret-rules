import type { ReactNode, SVGProps } from "react";

// A single original 24px line family: 1.8px stroke, rounded caps and joins.
const icons = {
  create: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 7v10M7 12h10" /></>,
  join: <><path d="M13 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5M3 12h12m-4-4 4 4-4 4" /></>,
  players: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>,
  host: <><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5ZM6 21h12" /></>,
  ready: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  secret: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></>,
  rule: <><path d="M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h5" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M9 2h6m-3 3V2m0 7v5l3 2M19 5l2 2" /></>,
  score: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
  settings: <><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></>,
  audio: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 5V3H3v13h2" /></>,
  leave: <><path d="M10 3H4v18h6m3-13 4 4-4 4M8 12h13" /></>,
  warning: <><path d="m12 3 10 18H2ZM12 9v5m0 3v.1" /></>,
  success: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  failure: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  connection: <><path d="M2 7a16 16 0 0 1 20 0M5 11a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0" /><circle cx="12" cy="19" r="1" /></>,
  reconnect: <><path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  diagonal: <path d="M5 19 19 5M5 5h14v14" />,
  close: <path d="m6 6 12 12m0-12L6 18" />,
  play: <path d="m8 4 12 8-12 8Z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;
export const iconNames = Object.keys(icons) as IconName[];

export function GameIcon({ name, label, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; label?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} {...props}>{label && <title>{label}</title>}{icons[name]}</svg>;
}
