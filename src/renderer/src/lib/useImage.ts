import { useEffect, useState } from 'react'

export interface UseImageResult {
  img: HTMLImageElement | undefined
  /** True when the src failed to load (missing/corrupt file). */
  error: boolean
}

/** Load an HTMLImageElement (CORS-enabled so canvas exports stay untainted). */
export function useImage(url: string | undefined): HTMLImageElement | undefined {
  return useImageWithStatus(url).img
}

/** Like useImage, but also reports load failures so callers can show a fallback. */
export function useImageWithStatus(url: string | undefined): UseImageResult {
  const [state, setState] = useState<UseImageResult>({ img: undefined, error: false })

  useEffect(() => {
    if (!url) {
      setState({ img: undefined, error: false })
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    let active = true
    image.onload = () => {
      if (active) setState({ img: image, error: false })
    }
    image.onerror = () => {
      if (active) setState({ img: undefined, error: true })
    }
    image.src = url
    return () => {
      active = false
    }
  }, [url])

  return state
}
