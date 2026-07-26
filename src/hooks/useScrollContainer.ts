import { createContext, useContext } from 'react'

/**
 * The app's scrolling element.
 *
 * The layout is a fixed-height grid, so the window never scrolls — `.content`
 * does. Anything reading or setting scroll position must go through this
 * instead of `window.scrollY` / `window.scrollTo`, which are always zero here.
 */
export const ScrollContainerContext = createContext<React.RefObject<HTMLElement | null> | null>(null)

export function useScrollContainer(): HTMLElement | null {
  return useContext(ScrollContainerContext)?.current ?? null
}
