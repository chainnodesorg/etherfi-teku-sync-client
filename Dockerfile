# syntax=docker/dockerfile:1

FROM node:22-alpine3.22

WORKDIR /app

COPY ["package.json", "package-lock.json", "./"]

RUN npm install

COPY . .

CMD [ "npm", "run", "start" ]
