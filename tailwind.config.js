/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#f6efe0', dark: '#eadfc6' },
        ink: { 50: '#eef2ef', 100: '#dce6df', 200: '#b9cdbf', 300: '#93b09c', 400: '#6c9078', 500: '#4a7460', 600: '#375a48', 700: '#2b4638', 800: '#1f342c', 900: '#152420', 950: '#0f1813' },
        rust: { 100: '#f4e3da', 200: '#e7c2ae', 300: '#e0a488', 400: '#cf7f57', 500: '#c1653f', 600: '#b5563a', 700: '#8f4230' },
        gold: { 100: '#f7ecc9', 300: '#e6c765', 400: '#d9b94f', 500: '#c9a227', 600: '#a9861d' }
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Archivo', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace']
      }
    }
  }
};
