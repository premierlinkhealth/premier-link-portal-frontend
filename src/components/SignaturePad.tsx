// Finger / stylus signature pad (ported from the prototype).
//
// The nurse signs on a <canvas> with mouse or touch; the drawing is exported as a PNG
// data URL and persisted via the assessment's form_data. Works on iPad/touchscreen.
// Per the prototype, the attestation checkbox is the legal e-signature either way; this
// pad is a visual capture on top of it.

import { useEffect, useRef } from "react";

export default function SignaturePad({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  editable: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Initialise the context and re-draw any saved signature.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a3d2e";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
    // Re-run only on mount; live strokes are handled imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(ev: React.MouseEvent | React.TouchEvent): [number, number] {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const p = "touches" in ev ? ev.touches[0] : (ev as React.MouseEvent);
    return [(p.clientX - r.left) * (c.width / r.width), (p.clientY - r.top) * (c.height / r.height)];
  }
  function down(ev: React.MouseEvent | React.TouchEvent) {
    if (!editable) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const [x, y] = pos(ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ev.preventDefault();
  }
  function move(ev: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const [x, y] = pos(ev);
    ctx.lineTo(x, y);
    ctx.stroke();
    ev.preventDefault();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    onChange("");
  }

  // Read-only view: show the captured image if present.
  if (!editable) {
    return value ? (
      <img src={value} alt="Nurse signature" style={{ maxWidth: 420, width: "100%", border: "1px solid var(--line)", borderRadius: 8 }} />
    ) : (
      <span className="muted">No signature captured.</span>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="sigpad"
        width={420}
        height={110}
        style={{ width: "100%", maxWidth: 420 }}
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={down}
        onTouchMove={move}
        onTouchEnd={up}
      />
      <div>
        <button className="btn sm secondary" style={{ marginTop: 6 }} onClick={clear}>
          Clear signature
        </button>
      </div>
    </div>
  );
}
