# Build the static site with Node, then hand it to nginx. Nothing from the
# toolchain (or the 86MB model's zip) survives into the runtime image.

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# scripts/download-vosk-model.sh needs all four; node:*-alpine ships none of
# them. `tar` here is GNU tar, which lands in /usr/bin and so wins over
# busybox's /bin/tar on PATH.
RUN apk add --no-cache bash curl unzip tar

COPY package.json package-lock.json ./
RUN npm ci

# Fetched before the source is copied so the 86MB download gets a cache layer of
# its own — editing app code doesn't re-download the model. It only re-runs when
# the script itself changes.
COPY scripts/download-vosk-model.sh ./scripts/
RUN npm run get-model

COPY . .

# Vite 는 VITE_* 를 빌드할 때 번들에 박아버린다 — 런타임 env 로는 못 바꾼다.
# Coolify 에서는 환경변수를 "Build Variable" 로 표시해야 여기 build arg 로 들어온다.
#
# 비워둬도 된다. 그러면 보관함 UI 가 통째로 안 그려지고 앱은 예전과 똑같이 돈다
# (src/lib/supabase.ts 의 isLibraryConfigured). 그래서 키를 넣기 전에 배포해도
# 아무것도 깨지지 않는다.
#
# ARG 는 뒤따르는 레이어의 캐시를 깨므로 모델 다운로드보다 뒤에 둔다.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
