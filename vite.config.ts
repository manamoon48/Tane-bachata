import { defineConfig } from 'vite';

// 相対パスで出力し、GitHub Pages のサブパスでもそのまま動くようにする
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
