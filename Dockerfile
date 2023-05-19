# syntax=docker/dockerfile:1

FROM node:18.16.0-alpine3.17

WORKDIR /app

COPY ["package.json", "package-lock.json", "./"]

RUN npm install

COPY . .

CMD [ "npm", "run", "start" ]
