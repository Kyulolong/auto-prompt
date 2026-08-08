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
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
