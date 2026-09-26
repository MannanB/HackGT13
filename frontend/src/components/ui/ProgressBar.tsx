export function ProgressBar({ value, className = 'bg-shut' }: { value: number; className?: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${className}`}
        style={{ width: `${Math.max(2, value * 100)}%` }}
      />
    </div>
  )
}
