/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API, e.g. https://api.example.com */
  readonly API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
