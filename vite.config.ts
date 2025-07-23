import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/sstest/',  // GitHub Pages 배포를 위해 추가: 네 저장소 이름으로 경로 맞춤
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)  // 중복된 키 제거: API 키를 제대로 정의
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),  // 필요 시 src 폴더로 변경 가능, 하지만 그대로 유지
        }
      }
    };
});