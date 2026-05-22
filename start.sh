#!/bin/bash
set -e

cd server
npm ci
npx prisma generate
npx prisma migrate deploy
npm start
