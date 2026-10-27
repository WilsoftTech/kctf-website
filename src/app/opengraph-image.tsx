import { ImageResponse } from "next/og";
export const alt = "KCTF — People. Nature. A shared future.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#1a3025",
        color: "#f6f7f2",
        width: "100%",
        height: "100%",
        padding: "70px",
      }}
    >
      <div style={{ fontSize: 26, letterSpacing: 5 }}>
        KCTF / RUKUNGIRI, UGANDA
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 78,
          lineHeight: 1.06,
        }}
      >
        <span>Protecting nature.</span>
        <span style={{ color: "#b3d48b" }}>Empowering people.</span>
      </div>
      <div style={{ fontSize: 22 }}>
        Kigezi Community Transformation Foundation
      </div>
    </div>,
    size,
  );
}
