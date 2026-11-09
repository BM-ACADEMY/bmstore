/** Stores in BUILDING status are previews: shown with this ribbon and never indexed (meta + X-Robots-Tag). */
export function PreviewRibbon({ label }: { label: string }) {
  return (
    <div data-bmstore-preview className="pointer-events-none fixed top-3 -right-11 z-[60] rotate-45 bg-[#b45309] text-white text-[12px] font-semibold uppercase tracking-[0.08em] px-14 py-2 shadow-card" role="status">
      {label}
    </div>
  );
}
