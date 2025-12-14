# Deployment Guide

## Quick Update

**1. Build locally:**

```bash
yarn build
```

**2. Transfer to instance:**

```bash
scp -r frontend/dist ubuntu@44.203.227.35:~/pointcloud-webtools/frontend/
scp -r frontend/public/wasm ubuntu@44.203.227.35:~/pointcloud-webtools/frontend/public/
```

**3. On Lightsail:**

```bash
ssh ubuntu@44.203.227.35
cd ~/pointcloud-webtools
git pull
./build.sh  # Only if Rust/C++/Cython code changed
yarn pm2:restart
```

## Useful Commands

```bash
yarn pm2:status      # Check status
yarn pm2:logs        # View logs
yarn pm2:restart     # Restart services
```
