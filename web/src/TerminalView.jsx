import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

export default function TerminalView({ jobId, onState }) {
  const element = useRef(null);

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "DM Mono, Consolas, monospace",
      fontSize: 13,
      convertEol: true,
      theme: {
        background: "#0c0f11",
        foreground: "#d5dfd8",
        cursor: "#75d497",
        selectionBackground: "#345343",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element.current);
    fit.fit();

    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/terminal/${encodeURIComponent(jobId)}`,
    );
    socket.addEventListener("open", () => {
      fit.fit();
      onState("Terminal połączony.");
    });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "output") terminal.write(message.data);
    });
    socket.addEventListener("close", () =>
      onState("Terminal został odłączony."),
    );
    socket.addEventListener("error", () =>
      onState("Nie udało się połączyć z terminalem."),
    );
    terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });
    terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(element.current);

    return () => {
      resize.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, [jobId, onState]);

  return (
    <div className="terminal" ref={element} aria-label="Terminal Hermes" />
  );
}
