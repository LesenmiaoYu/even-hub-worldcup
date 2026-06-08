export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'scrim'
    const confirmLabel = opts.confirmLabel ?? 'OK'
    const cancelLabel = opts.cancelLabel ?? 'Cancel'
    scrim.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-body">
          <div class="dialog-title">${opts.title}</div>
          ${opts.message ? `<div class="dialog-msg">${opts.message}</div>` : ''}
        </div>
        <div class="dialog-actions">
          <button data-act="cancel">${cancelLabel}</button>
          <button class="primary" data-act="confirm">${confirmLabel}</button>
        </div>
      </div>
    `
    document.body.appendChild(scrim)
    requestAnimationFrame(() => scrim.classList.add('show'))

    const close = (result: boolean) => {
      scrim.classList.remove('show')
      window.setTimeout(() => scrim.remove(), 180)
      resolve(result)
    }

    scrim.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t === scrim) return close(false)
      const act = t.dataset?.act
      if (act === 'confirm') close(true)
      else if (act === 'cancel') close(false)
    })
  })
}

export function alert(title: string, message?: string, label = 'OK'): Promise<void> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'scrim'
    scrim.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-body">
          <div class="dialog-title">${title}</div>
          ${message ? `<div class="dialog-msg">${message}</div>` : ''}
        </div>
        <div class="dialog-actions single">
          <button class="primary" data-act="ok">${label}</button>
        </div>
      </div>
    `
    document.body.appendChild(scrim)
    requestAnimationFrame(() => scrim.classList.add('show'))
    const close = () => {
      scrim.classList.remove('show')
      window.setTimeout(() => scrim.remove(), 180)
      resolve()
    }
    scrim.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t === scrim) return close()
      if (t.dataset?.act === 'ok') close()
    })
  })
}
