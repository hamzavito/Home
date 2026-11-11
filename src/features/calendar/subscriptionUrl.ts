/**
 * Preliminary validation for a user-provided calendar subscription URL.
 *
 * This does NOT make a URL safe to fetch. The future server-side fetcher must
 * resolve and validate every IPv4/IPv6 address, pin the vetted destination,
 * revalidate redirects, and enforce time/byte limits to prevent SSRF and DNS
 * rebinding. Never fetch these URLs directly from a browser.
 */
export function parseCalendarSubscriptionUrl(input: string): URL {
  if (input.length === 0 || input.length > 4096 || input !== input.trim()) {
    throw new Error('Ugyldigt kalenderlink')
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('Ugyldigt kalenderlink')
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.hostname.endsWith('.') ||
    !url.hostname.includes('.') ||
    url.hostname.includes('[') ||
    url.hostname.includes(']') ||
    url.hostname.includes(':') ||
    /^\d+(?:\.\d+){0,3}$/.test(url.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname.toLowerCase())
  ) {
    throw new Error('Kalenderlinket skal være en offentlig HTTPS-adresse')
  }

  return url
}
