import "@xterm/xterm/css/xterm.css";
import "../style.css";

export const metadata = {
  title: "Hermes Local",
  description: "Lokalny panel do zarządzania Hermes Agent.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
