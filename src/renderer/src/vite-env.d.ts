/// <reference types="vite/client" />

// simple-icons exposes its metadata via a subpath export the current TS
// moduleResolution can't see; declare it (an array of icon records).
declare module 'simple-icons/icons.json' {
  const icons: { title: string; slug: string; hex: string }[]
  export default icons
}
