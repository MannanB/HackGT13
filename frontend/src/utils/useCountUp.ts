import { useEffect, useRef, useState } from 'react'

export function useCountUp(value: number, duration = 600) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const delta = value - from
    if (Math.abs(delta) < 0.01) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const next = from + delta * (1 - (1 - progress) ** 4)
      fromRef.current = next
      setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return display
}
