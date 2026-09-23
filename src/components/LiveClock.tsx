import { useEffect, useState } from 'react'

export function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fn-clock" aria-label={`${date} ${time}`} title={`${date} ${time}`}>
      <span className="fn-clock-dot" />
      <span className="fn-clock-time">{time}</span>
      <span className="fn-clock-date">{date}</span>
    </div>
  )
}