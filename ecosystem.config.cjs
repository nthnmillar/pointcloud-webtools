module.exports = {
  apps: [
    {
      name: 'pointcloud-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 3000 --outDir dist',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'pointcloud-backend',
      cwd: './backend',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
