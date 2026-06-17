// Visit photo capture.
//
// Two ways to attach photos (ported from the prototype): a camera-friendly file input
// (`capture="environment"` opens the rear camera on mobile/iPad) and a multi-file
// upload. A live getUserMedia path lets a laptop nurse snap a frame too. Everything is
// stored inline as data URLs so it persists through the assessment's form_data JSON.

import { useRef, useState } from "react";

export interface VisitPhoto {
  name: string;
  url: string; // data URL
}

function readFiles(files: FileList, cb: (photos: VisitPhoto[]) => void) {
  const arr = Array.from(files);
  const out: VisitPhoto[] = [];
  let left = arr.length;
  if (!left) return;
  arr.forEach((file) => {
    const r = new FileReader();
    r.onload = () => {
      out.push({ name: file.name || `photo-${Date.now()}.jpg`, url: String(r.result) });
      if (--left === 0) cb(out);
    };
    r.onerror = () => {
      if (--left === 0) cb(out);
    };
    r.readAsDataURL(file);
  });
}

export default function PhotoCapture({
  photos,
  onChange,
  editable,
}: {
  photos: VisitPhoto[];
  onChange: (next: VisitPhoto[]) => void;
  editable: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);

  function add(input: HTMLInputElement | null) {
    if (!input || !input.files || !input.files.length) return;
    readFiles(input.files, (added) => onChange([...photos, ...added]));
    input.value = "";
  }
  function remove(i: number) {
    onChange(photos.filter((_, j) => j !== i));
  }

  async function startCamera() {
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setLiveOn(true);
      // Attach after the <video> renders.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (e) {
      setCamErr("Camera unavailable: " + (e instanceof Error ? e.message : String(e)) + ". Use Take photo / Upload instead.");
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveOn(false);
  }
  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    onChange([...photos, { name: `capture-${Date.now()}.jpg`, url: canvas.toDataURL("image/jpeg", 0.85) }]);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Photos &amp; files (this visit)</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Wound photos, medication lists, anything from the visit. Saved with this assessment.
      </p>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((ph, i) => (
            <div className="photo-tile" key={i}>
              {/^data:image/.test(ph.url) ? (
                <img src={ph.url} alt={ph.name} />
              ) : (
                <span className="pill blue">FILE</span>
              )}
              <div className="muted" style={{ fontSize: 11, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ph.name}
              </div>
              {editable && (
                <a className="rm" onClick={() => remove(i)}>
                  remove
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn secondary sm" style={{ margin: 0, cursor: "pointer" }}>
              📷 Take photo
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={() => add(camRef.current)}
              />
            </label>
            <input ref={upRef} type="file" accept="image/*,.pdf" multiple style={{ width: "auto" }} />
            <button className="btn sm" onClick={() => add(upRef.current)}>
              Upload
            </button>
            {liveOn ? (
              <button className="btn sm secondary" onClick={stopCamera}>
                Close camera
              </button>
            ) : (
              <button className="btn sm secondary" onClick={startCamera}>
                Use laptop camera
              </button>
            )}
          </div>

          {camErr && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{camErr}</p>}

          {liveOn && (
            <div style={{ marginTop: 12 }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", maxWidth: 360, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
              <button className="btn sm" style={{ marginTop: 8 }} onClick={snap}>
                ◉ Capture frame
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
