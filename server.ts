import { createServer } from "http";

import next from "next";
import { WebSocketServer } from "ws";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOSTNAME ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

async function bootstrap() {
  await app.prepare();

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "ws.connected",
        timestamp: new Date().toISOString(),
        message: "LLM Hold'em websocket connection established",
      }),
    );

    socket.on("message", (message) => {
      const payload = message.toString();
      socket.send(
        JSON.stringify({
          type: "ws.echo",
          timestamp: new Date().toISOString(),
          payload,
        }),
      );
    });
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request);
    });
  });

  server.listen(port, () => {
    console.log(`> Server ready on http://${host}:${port}`);
    console.log(`> WebSocket endpoint on ws://${host}:${port}/ws`);
  });
}

void bootstrap();
