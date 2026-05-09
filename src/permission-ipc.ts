/**
 * 权限 IPC — 父子进程间的权限确认通信
 *
 * 父进程启动一个 localhost HTTP server，MCP 子进程在需要用户确认时
 * 向该 server 发 POST 请求并阻塞等待响应。
 */
import http from "node:http";

/** 权限请求结构（MCP → 父进程） */
export interface PermissionRequest {
  toolName: string;
  description: string;
}

/** 权限响应结构（父进程 → MCP） */
export interface PermissionResponse {
  decision: "allow" | "deny" | "always_allow";
}

/**
 * 父进程端：启动 permission IPC server
 * 当收到请求时调用 onRequest 回调，回调 resolve 后将结果返回给子进程
 */
export function startPermissionServer(
  onRequest: (req: PermissionRequest) => Promise<PermissionResponse>,
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/permission") {
        res.writeHead(404);
        res.end();
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as PermissionRequest;
          const response = await onRequest(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ decision: "deny" }));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind permission IPC server"));
        return;
      }
      resolve({
        port: addr.port,
        close: () => server.close(),
      });
    });

    server.on("error", reject);
  });
}

/**
 * 子进程端（MCP server）：请求父进程确认权限
 */
export async function requestPermission(
  port: number,
  req: PermissionRequest,
): Promise<PermissionResponse> {
  const body = JSON.stringify(req);
  return new Promise((resolve, reject) => {
    const httpReq = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/permission",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString()) as PermissionResponse;
            resolve(data);
          } catch {
            resolve({ decision: "deny" });
          }
        });
      },
    );
    httpReq.on("error", () => resolve({ decision: "deny" }));
    httpReq.write(body);
    httpReq.end();
  });
}
