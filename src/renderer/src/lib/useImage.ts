import { useEffect, useState } from 'react'

/** Load an HTMLImageElement (CORS-enabled so canvas exports stay untainted). */
export function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>()

  useEffect(() => {
    if (!url) {
      setImg(undefined)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    let active = true
    image.onload = () => {
      if (active) setImg(image)
    }
    image.src = url
    return () => {
      active = false
    }
  }, [url])

  return img
}
