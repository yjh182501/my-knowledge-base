const http = require('http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// ========== 配置区域 ==========
const PORT = 9091;                // Webhook 服务端口
const SECRET='yjh-...26';       // 必须和 GitHub Webhook Secret 一致
const DEPLOY_SCRIPT = '/home/yjh/deploy.sh';  // 部署脚本路径
const LOG_FILE = '/home/yjh/logs/webhook.log'; // Webhook 日志
// ==============================

function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = '[' + timestamp + '] ' + message + '\n';
  
  // 写入文件
  const fs = require('node:fs');
  fs.appendFileSync(LOG_FILE, logLine);
  
  // 同时输出到控制台
  console.log(logLine.trim());
}

function verifySignature(req, body) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) {
    log('缺少签名头 X-Hub-Signature-256');
    return false;
  }
  
  try {
    const hash = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    // 使用 timingSafeEqual 防止时序攻击
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash));
  } catch (e) {
    log('签名验证异常：' + e.message);
    return false;
  }
}

const server = http.createServer((req, res) => {
  // 只接受 POST 请求
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }
  
  // 只接受 webhook 路径
  if (req.url !== '/webhook') {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }
  
  let body = '';
  
  req.on('data', chunk => {
    body += chunk;
  });
  
  req.on('end', () => {
    // 验证签名
    if (!verifySignature(req, body)) {
      res.statusCode = 401;
      res.end('Invalid signature');
      log('签名验证失败');
      return;
    }
    
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      res.statusCode = 400;
      res.end('Invalid JSON');
      log('JSON 解析失败：' + e.message);
      return;
    }
    
    // 检查分支
    const ref = payload.ref;
    if (ref !== 'refs/heads/main') {
      res.statusCode = 200;
      res.end('Not main branch');
      log('跳过非 main 分支：' + ref);
      return;
    }
    
    log('触发部署：' + JSON.stringify({
      commit: payload.head_commit ? payload.head_commit.id.slice(0, 7) : 'unknown',
      message: payload.head_commit ? payload.head_commit.message : 'unknown',
      author: payload.head_commit && payload.head_commit.author ? payload.head_commit.author.name : 'unknown'
    }));
    
    // 执行部署脚本（后台运行，不阻塞响应）
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      shell: true
    });
    
    // 记录部署脚本的输出
    child.stdout.on('data', (data) => {
      log('[deploy] ' + data.toString().trim());
    });
    
    child.stderr.on('data', (data) => {
      log('[deploy error] ' + data.toString().trim());
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        res.statusCode = 200;
        res.end('Deployed successfully');
        log('部署成功');
      } else {
        res.statusCode = 500;
        res.end('Deploy failed');
        log('部署失败，退出码：' + code);
      }
    });
    
    child.unref(); // 允许主进程独立运行
  });
});

server.listen(PORT, '0.0.0.0', () => {
  log('Webhook server started on port ' + PORT);
  log('Secret: ' + SECRET.substring(0, 4) + '...' + SECRET.slice(-4));
});

// 优雅关闭
process.on('SIGTERM', function() {
  log('Received SIGTERM, shutting down...');
  server.close(function() {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', function() {
  log('Received SIGINT, shutting down...');
  server.close(function() {
    log('Server closed');
    process.exit(0);
  });
});
