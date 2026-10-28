// Structured JSON logging (picked up by Workers Observability)
export function logJSON(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logRequest(fields: { method: string; path: string; status: number; ms: number; reqId: string }): void {
  logJSON(fields.status >= 500 ? 'error' : 'info', { msg: 'request', ...fields });
}
