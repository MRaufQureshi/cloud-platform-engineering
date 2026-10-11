// The "Simulator" menu button opens the T.H.E.O. web app. Its address changes after every
// rebuild, so Terraform writes it into config.json (next to index.html) and we read it here.
export async function initAppLink(): Promise<void> {
  const link = document.querySelector<HTMLAnchorElement>('#app-link')
  if (!link) return
  try {
    const response = await fetch('./config.json', { cache: 'no-store' })
    if (!response.ok) return
    const { appUrl } = await response.json()
    if (appUrl) link.href = appUrl
  } catch {
    // No config.json (for example `npm run dev`): the button stays inactive.
  }
}
