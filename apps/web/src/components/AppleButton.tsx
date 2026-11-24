/** "Sign in with Apple" button in Apple's style: black (white in dark mode), Apple logo, standard label. */
export function AppleButton({ label, onClick, disabled, busy }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="button" className="btn apple block" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
        <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-57-156-127C44 790 0 671 0 557 0 375 118 279 235 279c62 0 114 41 153 41 37 0 95-43 166-43 27 0 124 2 188 64zM542 158c29-35 50-83 50-131 0-7-1-14-2-19-48 2-104 32-138 71-27 30-52 78-52 127 0 7 1 15 2 17 3 1 8 1 13 1 43 0 97-29 127-66z" />
      </svg>
      {label}
    </button>
  );
}
