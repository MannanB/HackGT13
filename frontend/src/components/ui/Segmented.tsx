import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface Option<T extends string> {
  value: T
  label: ReactNode
  activeClass?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      className={cn('flex rounded-xl bg-ink-950/70 p-0.5 ring-1 ring-white/5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[10px] whitespace-nowrap font-medium transition-all duration-200',
              size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
              active
                ? (option.activeClass ?? 'bg-ink-700 text-fog-100 shadow-sm')
                : 'text-fog-400 hover:text-fog-100',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
