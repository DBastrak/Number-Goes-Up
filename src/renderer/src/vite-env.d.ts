// Asset module declarations so the bundler's URL imports typecheck.
declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.mp3' {
  const src: string
  export default src
}
