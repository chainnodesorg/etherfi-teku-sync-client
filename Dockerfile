# syntax=docker/dockerfile:1

FROM node:18.3.0

WORKDIR /app

COPY ["package.json", "package-lock.json", "./"]

RUN npm install

COPY . .

CMD [ "npm", "run", "start" ]
