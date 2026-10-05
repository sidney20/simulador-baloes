import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // base relativa: funciona no GitHub Pages (subcaminho) e em qualquer estático
  base: './',
  plugins: [react()],
})
