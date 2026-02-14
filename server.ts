import { createServer } from "http";

import next from "next";
import { WebSocketServer, type WebSocket } from "ws";

import { subscribeMatchEvents } from "@/lib/runtime/match-events";

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
  const subscriptions = new WeakMap<WebSocket, { matchId?: string }>();
  const unsubscribeMatchEvents = subscribeMatchEvents((event) => {
    const payload = JSON.stringify(event);

    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) {
        continue;
      }

      const subscription = subscriptions.get(client);
      if (subscription?.matchId && subscription.matchId !== event.matchId) {
        continue;
      }

      client.send(payload);
    }
  });

  wss.on("connection", (socket) => {
    const subscription = subscriptions.get(socket);

    socket.send(
      JSON.stringify({
        type: "ws.connected",
        timestamp: new Date().toISOString(),
        message: "LLM Hold'em websocket connection established",
        matchId: subscription?.matchId ?? null,
      }),
    );

    socket.on("close", () => {
      subscriptions.delete(socket);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const matchId = url.searchParams.get("matchId") ?? undefined;

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      subscriptions.set(webSocket, { matchId });
      wss.emit("connection", webSocket, request);
    });
  });

  server.on("close", () => {
    unsubscribeMatchEvents();
  });

  server.listen(port, () => {
    console.log(`> Server ready on http://${host}:${port}`);
    console.log(`> WebSocket endpoint on ws://${host}:${port}/ws`);
  });
}

void bootstrap();
