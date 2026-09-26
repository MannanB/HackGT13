import { useEffect, useState } from 'react'

export function useCountUp(value: number, active: boolean, duration = 720) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!active) {
      setDisplay(0)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      setDisplay(value * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, active, duration])

  return display
}
