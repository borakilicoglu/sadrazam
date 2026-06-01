FROM node:22

WORKDIR /app
RUN npm run build
RUN npx prisma generate
CMD ["node", "scripts/server.js"]
