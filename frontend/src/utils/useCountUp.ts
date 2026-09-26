import { useEffect, useRef, useState } from 'react'

export function useCountUp(value: number, active: boolean, duration = 260) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (!active) {
      fromRef.current = 0
      setDisplay(0)
      return
    }
    const from = fromRef.current
    const delta = value - from
    if (Math.abs(delta) < 0.01) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const next = from + delta * eased
      fromRef.current = progress === 1 ? value : next
      setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, active, duration])

  return display
}
