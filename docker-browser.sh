#!/bin/bash
docker run -p 3000:3000 -e SCREEN_WIDTH=1280 -e SCREEN_HEIGHT=1024 -e SCREEN_DEPTH=16 -e DEFAULT_STEALTH=true browserless/chrome