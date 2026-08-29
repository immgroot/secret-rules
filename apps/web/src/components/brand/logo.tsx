import type { SVGProps } from "react";
import { markPath, pupilPath, wordmarkPaths } from "./artwork.ts";

type LogoProps = SVGProps<SVGSVGElement> & { label?: string; monochrome?: boolean };

export function LogoMark({ label, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} {...props}>
      {label && <title>{label}</title>}
      <path d={markPath} fillRule="evenodd" />
      <path d={pupilPath} />
    </svg>
  );
}

export function FullLogo({ label = "SECRET RULES", monochrome = false, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 220 64" fill="currentColor" role="img" aria-label={label} {...props}>
      <title>{label}</title>
      <g className={monochrome ? undefined : "brand-accent"}>
        <path d={markPath} fillRule="evenodd" />
        <path className="brand-pupil" d={pupilPath} />
      </g>
      {wordmarkPaths.map(({ d, transform }, index) => <path key={index} d={d} transform={transform} fillRule="evenodd" />)}
    </svg>
  );
}

export function MonochromeLogo(props: Omit<LogoProps, "monochrome">) {
  return <FullLogo {...props} monochrome />;
}
