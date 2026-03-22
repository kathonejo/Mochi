import {
  buildOpenClawSessionKey,
  extractOpenClawText,
  getLastUserMessageText,
  mergeOpenClawStreamText,
  nextOpenClawId,
  normalizeOpenClawGatewayUrl,
  type OpenClawChatRequestMessage,
} from "@/lib/site-mochi-openclaw-protocol";

export async function verifyOpenClawServerGateway(args: {
  gatewayUrl: string;
  gatewayToken: string;
  timeoutMs?: number;
}): Promise<void> {
  if (typeof WebSocket !== "function") {
    throw new Error("OPENCLAW_WEBSOCKET_UNAVAILABLE");
  }

  const normalizedUrl = normalizeOpenClawGatewayUrl(args.gatewayUrl);
  const authToken = String(args.gatewayToken || "").trim();
  if (!authToken) throw new Error("OPENCLAW_MISSING_TOKEN");

  const timeoutMs =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? Math.max(3_000, Math.min(30_000, Math.round(args.timeoutMs)))
      : 9_000;

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let settled = false;
    let authenticated = false;

    const timeout = setTimeout(() => {
      fail(new Error(`OPENCLAW_TIMEOUT:${normalizedUrl}`));
    }, timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ws && ws.readyState === ws.OPEN) ws.close(1000, "verified");
      resolve();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ws && ws.readyState === ws.OPEN) ws.close(1011, "error");
      reject(error);
    };

    try {
      ws = new WebSocket(normalizedUrl);
    } catch {
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
      return;
    }

    ws.addEventListener("message", (event) => {
      let data: any;
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === "event" && data.event === "connect.challenge") {
        ws?.send(
          JSON.stringify({
            type: "req",
            id: nextOpenClawId("connect"),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "gateway-client",
                version: "1.0.0",
                platform: "server",
                mode: "backend",
              },
              role: "operator",
              scopes: ["operator.read", "operator.write"],
              auth: { token: authToken },
            },
          }),
        );
        return;
      }

      if (data.type === "res" && data.ok === false) {
        const reason = data.error?.message || data.error?.code || "Authentication failed";
        fail(new Error(`OPENCLAW_AUTH_FAILED:${reason}`));
        return;
      }

      if (data.type === "res" && (data.payload?.type === "hello-ok" || data.ok === true)) {
        authenticated = true;
        finish();
      }
    });

    ws.addEventListener("error", () => {
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
    });

    ws.addEventListener("close", () => {
      if (settled) return;
      if (authenticated) {
        finish();
        return;
      }
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
    });
  });
}

export async function sendOpenClawServerChat(args: {
  messages: OpenClawChatRequestMessage[];
  gatewayUrl: string;
  gatewayToken: string;
  agentName: string;
  timeoutMs?: number;
}): Promise<string> {
  if (typeof WebSocket !== "function") {
    throw new Error("OPENCLAW_WEBSOCKET_UNAVAILABLE");
  }

  const normalizedUrl = normalizeOpenClawGatewayUrl(args.gatewayUrl);
  const authToken = String(args.gatewayToken || "").trim();
  if (!authToken) throw new Error("OPENCLAW_MISSING_TOKEN");

  const messageText = getLastUserMessageText(args.messages);
  if (!messageText) throw new Error("OPENCLAW_EMPTY_MESSAGE");

  const sessionKey = buildOpenClawSessionKey(args.agentName);
  const timeoutMs =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? Math.max(5_000, Math.min(120_000, Math.round(args.timeoutMs)))
      : 70_000;

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let settled = false;
    let authenticated = false;
    let chatRequestSent = false;
    let sawCompletion = false;
    let responseText = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let textFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const timeout = setTimeout(() => {
      fail(new Error(`OPENCLAW_TIMEOUT:${normalizedUrl}`));
    }, timeoutMs);

    const armIdleTimer = () => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (responseText) {
          finish(responseText);
          return;
        }
        fail(new Error(`OPENCLAW_IDLE_TIMEOUT:${normalizedUrl}`));
      }, 20_000);
    };

    const touchActivity = () => {
      armIdleTimer();
    };

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (textFlushTimer !== null) {
        clearTimeout(textFlushTimer);
        textFlushTimer = null;
      }
      if (ws && ws.readyState === ws.OPEN) ws.close(1000, "done");
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (textFlushTimer !== null) {
        clearTimeout(textFlushTimer);
        textFlushTimer = null;
      }
      if (ws && ws.readyState === ws.OPEN) ws.close(1011, "error");
      reject(error);
    };

    const armTextFlushTimer = () => {
      if (textFlushTimer !== null) clearTimeout(textFlushTimer);
      textFlushTimer = setTimeout(() => {
        if (settled || sawCompletion) return;
        if (responseText) {
          finish(responseText);
        }
      }, 4_000);
    };

    const pushText = (nextText: string) => {
      if (!nextText) return;
      responseText = mergeOpenClawStreamText(responseText, nextText);
      armTextFlushTimer();
      touchActivity();
    };

    try {
      ws = new WebSocket(normalizedUrl);
    } catch {
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
      return;
    }

    ws.addEventListener("open", touchActivity);

    ws.addEventListener("message", (event) => {
      let data: any;
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === "event" && data.event === "connect.challenge") {
        touchActivity();
        const connectReq = {
          type: "req",
          id: nextOpenClawId("connect"),
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "gateway-client",
              version: "1.0.0",
              platform: "server",
              mode: "backend",
            },
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            auth: { token: authToken },
          },
        };
        ws?.send(JSON.stringify(connectReq));
        return;
      }

      if (data.type === "res" && !authenticated && data.ok === false) {
        touchActivity();
        const reason = data.error?.message || data.error?.code || "Authentication failed";
        fail(new Error(`OPENCLAW_AUTH_FAILED:${reason}`));
        return;
      }

      if (data.type === "res" && !authenticated && (data.payload?.type === "hello-ok" || data.ok === true)) {
        touchActivity();
        authenticated = true;
        if (!chatRequestSent) {
          chatRequestSent = true;
          ws?.send(
            JSON.stringify({
              type: "req",
              id: nextOpenClawId("chat"),
              method: "chat.send",
              params: {
                sessionKey,
                message: messageText,
                idempotencyKey: nextOpenClawId("idem"),
              },
            }),
          );
        }
        return;
      }

      if (data.type === "event") {
        const payload = data.payload || {};
        const text = extractOpenClawText(payload);
        if (text) pushText(text);
        // Always touch activity for agent-related events so slow LLMs don't hit the idle timeout
        if (
          data.event === "agent" ||
          data.event === "chat" ||
          payload.state !== undefined ||
          payload.status !== undefined ||
          payload.type !== undefined ||
          payload.done !== undefined ||
          payload.errorMessage !== undefined
        ) {
          touchActivity();
        }
        if (payload.state === "error") {
          fail(new Error(`OPENCLAW_ERROR:${payload.errorMessage || "Chat failed"}`));
          return;
        }
        if (
          payload.state === "final" ||
          payload.status === "completed" ||
          payload.status === "done" ||
          payload.type === "done" ||
          payload.done === true
        ) {
          sawCompletion = true;
          finish(responseText || text || "(no response)");
        }
        return;
      }

      if (data.type === "res" && authenticated && data.ok === true) {
        if (data.payload?.runId) {
          touchActivity();
          return;
        }
        const text = extractOpenClawText(data.payload);
        if (text) pushText(text);
        if (
          data.payload?.state !== undefined ||
          data.payload?.status !== undefined ||
          data.payload?.type !== undefined ||
          data.payload?.done !== undefined
        ) {
          touchActivity();
        }
        if (
          data.payload?.state === "final" ||
          data.payload?.status === "completed" ||
          data.payload?.status === "done" ||
          data.payload?.done
        ) {
          sawCompletion = true;
          finish(responseText || text || "(no response)");
        }
        return;
      }

      if (data.type === "res" && authenticated && data.ok === false) {
        touchActivity();
        const reason = data.error?.message || data.error?.code || "Agent request failed";
        fail(new Error(`OPENCLAW_ERROR:${reason}`));
      }
    });

    ws.addEventListener("error", () => {
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
    });

    ws.addEventListener("close", (event) => {
      if (settled) return;
      if (sawCompletion && responseText) {
        finish(responseText);
        return;
      }
      if (responseText) {
        fail(new Error(`OPENCLAW_INCOMPLETE_CLOSE:${event.code}`));
        return;
      }
      if (event.code === 1000 || event.code === 1001) {
        fail(new Error("OPENCLAW_EMPTY_RESPONSE"));
        return;
      }
      fail(new Error(`OPENCLAW_CLOSED:${event.code}`));
    });

    armIdleTimer();
  });
}
