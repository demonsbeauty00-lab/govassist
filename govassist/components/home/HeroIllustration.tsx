/**
 * A stylized approximation of the reference's "student in a hoodie holding
 * a phone" illustration — hand-built as flat SVG shapes in this app's own
 * brand colors, NOT a reproduction of the original artwork (that asset
 * isn't in this codebase, and there's no image-generation tool available
 * here that could faithfully recreate a specific illustrated person). If
 * the real asset becomes available later, drop it in as
 * /public/illustrations/hero-student.svg and swap this component for a
 * plain <img>/<Image> — the layout around it (HomeContent.tsx) already
 * expects a fixed square aspect ratio, so no other change is needed.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* floating accents */}
      <circle cx="24" cy="30" r="10" className="fill-caution-bg" />
      <path d="M126 24a8 8 0 0 1 8 8v6h-16v-6a8 8 0 0 1 8-8Z" className="fill-caution-fg" />
      <rect x="118" y="38" width="16" height="3" rx="1.5" className="fill-caution-fg" />
      <rect x="14" y="104" width="22" height="28" rx="3" className="fill-white stroke-brand-300" strokeWidth="1.5" />
      <rect x="18" y="110" width="14" height="2" rx="1" className="fill-brand-100" />
      <rect x="18" y="115" width="14" height="2" rx="1" className="fill-brand-100" />
      <rect x="18" y="120" width="9" height="2" rx="1" className="fill-brand-100" />
      <rect x="118" y="98" width="20" height="20" rx="10" className="fill-brand-50" />

      {/* graduation cap */}
      <g transform="translate(112 118)">
        <path d="M12 0 24 6 12 12 0 6Z" className="fill-ink" />
        <path d="M6 8.5v6c0 2 3 3.5 6 3.5s6-1.5 6-3.5v-6L12 12Z" className="fill-ink" />
      </g>

      {/* head */}
      <circle cx="80" cy="46" r="18" className="fill-[#f2c9a0]" />
      <path d="M62 40a18 18 0 0 1 34-6c2 6-2 10-8 8-6-2-14-4-20 0-3 2-5 0-6-2Z" className="fill-ink" />

      {/* hoodie body */}
      <path
        d="M46 150v-38c0-16 12-30 28-32h12c16 2 28 16 28 32v38Z"
        className="fill-brand-600"
      />
      {/* hood collar */}
      <path d="M62 82c6 6 12 8 18 8s12-2 18-8l-4 10c-4 4-9 6-14 6s-10-2-14-6Z" className="fill-brand-700" />
      {/* pocket */}
      <rect x="62" y="118" width="36" height="16" rx="6" className="fill-brand-700" />

      {/* left arm holding phone up */}
      <path d="M46 128c-6-10-8-22-4-34l8 2c-2 10-1 20 4 28Z" className="fill-brand-600" />
      <rect x="30" y="92" width="16" height="26" rx="3" className="fill-ink" />
      <rect x="32.5" y="96" width="11" height="16" rx="1.5" className="fill-brand-100" />

      {/* right arm resting */}
      <path d="M114 128c6-8 8-18 5-28l-8 2c2 8 1 16-3 22Z" className="fill-brand-600" />
    </svg>
  );
}
