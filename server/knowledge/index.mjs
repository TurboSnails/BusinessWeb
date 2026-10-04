import { configuredVault, port } from './config.mjs';
import { createKnowledgeServer } from './http.mjs';
try {
  const vault = configuredVault();
  await vault.init();
  const uiPort = port(process.env.KNOWLEDGE_UI_PORT, 5173);
  const apiPort = port(process.env.KNOWLEDGE_PORT, 8789);
  const server = createKnowledgeServer({ vault, token: process.env.KNOWLEDGE_TOKEN, allowedOrigins: [`http://localhost:${uiPort}`, `http://127.0.0.1:${uiPort}`] });
  server.on('error', error => { console.error(`知识服务启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(apiPort, '127.0.0.1', () => console.log(`知识服务：http://127.0.0.1:${apiPort}；Markdown Vault：${process.env.KNOWLEDGE_VAULT || '.local/SecondBrain'}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
} catch (error) { console.error(error.message); process.exitCode = 1; }
