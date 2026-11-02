import Link from "next/link";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={"brand " + (light ? "brand-light" : "")} aria-label="COVRA home">
      <span className="brand-mark" aria-hidden="true"><span className="brand-mark-core"/></span>
      <span className="brand-type">COVRA<span className="brand-period">.</span></span>
    </Link>
  );
}
