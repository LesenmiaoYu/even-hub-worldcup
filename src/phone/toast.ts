let host: HTMLElement | null = null

function ensureHost() {
  if (host) return host
  host = document.createElement('div')
  host.className = 'toast-host'
  document.body.appendChild(host)
  return host
}

interface ToastOpts {
  variant?: 'default' | 'goal'
  durationMs?: number
}

export function toast(title: string, body?: string, opts: ToastOpts = {}) {
  const { variant = 'default', durationMs = 2500 } = opts
  const h = ensureHost()
  const el = document.createElement('div')
  el.className = `toast toast-${variant}`
  el.innerHTML = `<div class="t-title">${title}</div>${body ? `<div class="t-body">${body}</div>` : ''}`
  h.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  window.setTimeout(() => {
    el.classList.remove('show')
    window.setTimeout(() => el.remove(), 220)
  }, durationMs)
}
