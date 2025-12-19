module.exports = {
  apps: [{
    // --- 基础配置 ---
    name: "oc-workshop",        // PM2 进程列表中显示的应用名称
    script: "./app.js",         // 启动入口文件
    instances: "max",           // 开启的进程数，"max" 表示利用所有 CPU 核心，提高并发能力
    exec_mode: "cluster",       // 集群模式，让多进程共享端口，适合生产环境

    // --- 自动重启策略 ---
    watch: false,               // 生产环境关闭文件监控，避免频繁重启
    max_memory_restart: "200M", // 内存保护：当单个进程内存占用超过 200MB 时自动重启，防止内存泄露导致服务器宕机
    
    // --- 日志管理 ---
    // 阿里云日志服务可直接采集这些日志文件
    error_file: "./logs/err.log", // 错误日志路径
    out_file: "./logs/out.log",   // 普通日志路径
    merge_logs: true,             // 集群模式下合并所有进程的日志
    log_date_format: "YYYY-MM-DD HH:mm:ss", // 日志时间格式，方便排查问题

    // --- 环境变量配置 ---
    // 开发环境配置 (启动命令: pm2 start ecosystem.config.js)
    env: {
      NODE_ENV: "development",
      PORT: 3000
    },
    // 生产环境配置 (启动命令: pm2 start ecosystem.config.js --env production)
    env_production: {
      NODE_ENV: "production",
      PORT: 8080, // 阿里云等云厂商通常推荐使用 8080 或 80 端口
    }
  }]
};
