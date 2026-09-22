export function formatCount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}K`
  }
  return String(n)
}