// The window's own state. The title bar is an overlay, so the traffic lights sit inside the
// sidebar and disappear in full screen; the layout needs to know which.
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Calls `onChange` with whether the window is in full screen, now and after every resize.
 * Resolves with a function that stops watching. Outside a Tauri window (a plain browser), it
 * reports nothing and the returned function does nothing.
 */
export async function watchFullscreen(
  onChange: (fullscreen: boolean) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  try {
    const win = getCurrentWindow()
    const read = () => win.isFullscreen().then(onChange, () => {})
    await read()
    return await win.onResized(() => void read())
  } catch {
    return () => {}
  }
}
