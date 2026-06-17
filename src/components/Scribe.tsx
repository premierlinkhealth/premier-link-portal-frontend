// AI Visit Scribe
//
// ⚠️ COMPLIANCE: This in-browser Gemini path is for the PRE-PHI DEMO ONLY.
// Real patient PHI must NOT be sent to the public generativelanguage.googleapis.com
// endpoint with a client-side key. Before production, transcript analysis must route
// SERVER-SIDE through Vertex AI under Premier Link's signed Google HIPAA BAA, with the
// key held in the backend — never shipped to the browser. The VITE_GEMINI_API_KEY path
// below exists only so the demo can show the workflow end-to-end on non-PHI data.
//
// Behavior (ported from the prototype):
//  - Uses the browser Web Speech API to dictate the nurse's spoken notes into a live transcript.
//  - "Analyze with AI" sends the transcript to Gemini, asking it to extract vitals + suggested
//    HCC/ICD-10 codes, returned as confirmable chips.
//  - Graceful degradation: if SpeechRecognition is unavailable the transcript box is manual;
//    if no Gemini key is set, AI suggestions are off but the offline keyword pass + manual
//    code entry still work. Never hard-crashes.

import { useEffect, useRef, useState } from "react";
import {
  CodeSuggestion,
  HCC_V28,
  icdByCode,
  scribeConditions,
  rafTier,
  rafTagText,
  rafOf,
  ConfirmedCode,
} from "../coding";

interface VitalsPatch {
  bp?: string;
  pulse?: string;
  weight_lbs?: string;
  height_in?: string;
  meds?: string;
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function geminiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
}

interface GeminiCondition {
  icd10?: string;
  condition?: string;
  quote?: string;
}
interface GeminiResult {
  vitals?: { bp1?: string; bp2?: string; hr?: string; wt?: string; ht?: string };
  meds?: string;
  conditions?: GeminiCondition[];
}

// Demo-only direct call to Gemini. Production routes server-side via Vertex AI (see header).
async function geminiAnalyze(transcript: string): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) throw new Error("No Gemini key configured.");
  const prompt =
    "You are a Medicare risk-adjustment coding assistant reviewing a home-visit transcript (DEMO data, not real patients). " +
    "Extract vitals, and suggest diagnoses ONLY for chronic or risk-relevant conditions explicitly supported by the transcript wording. " +
    "Rules: (1) At most 6 conditions, ranked most clinically significant first. (2) Exactly ONE best ICD-10-CM code per condition — no near-duplicates or alternatives. " +
    "(3) Pick the most specific code the wording supports — NEVER a severity or complication the transcript does not state. " +
    "(4) Skip symptoms, one-off acute complaints, and speculation. (5) \"condition\" must be a short plain clinical name a nurse instantly recognizes, e.g. \"COPD\", \"CKD stage 4\", \"Type 2 diabetes with neuropathy\". " +
    "(6) \"quote\" is the exact transcript sentence that supports it. Codes without dots (e.g. E1122). " +
    'Return ONLY JSON, no markdown: {"vitals":{"bp1":"","bp2":"","hr":"","wt":"","ht":""},"meds":"","conditions":[{"icd10":"","condition":"","quote":""}]}\n\nTRANSCRIPT:\n' +
    transcript;

  // Matches the prototype's model. Real PHI must move to Vertex AI under the BAA before production.
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(key);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
  });
  if (!r.ok) throw new Error("Gemini " + r.status + ": " + (await r.text()).slice(0, 180));
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const c = (j.candidates || [])[0];
  let out = (c?.content?.parts || []).map((p) => p.text || "").join("");
  out = out.replace(/```json|```/g, "");
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Gemini returned no JSON.");
  return JSON.parse(out.slice(start, end + 1)) as GeminiResult;
}

function RafPill({ hcc }: { hcc: number }) {
  const tier = rafTier(hcc);
  if (!tier) return null;
  return <span className={`pill ${tier}`}>{rafTagText(hcc)}</span>;
}

export default function Scribe({
  transcript,
  setTranscript,
  suggestions,
  setSuggestions,
  confirmed,
  onConfirm,
  onVitals,
}: {
  transcript: string;
  setTranscript: (t: string) => void;
  suggestions: CodeSuggestion[];
  setSuggestions: (s: CodeSuggestion[]) => void;
  confirmed: ConfirmedCode[];
  onConfirm: (code: string) => void;
  onVitals: (patch: VitalsPatch) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const srRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  const hasGemini = !!geminiKey();

  // Clean up the recognizer if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      const sr = srRef.current;
      if (sr) {
        sr.onend = null;
        try {
          sr.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  function startRecording() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    // Compliance announcement (prototype behavior): say it out loud so the patient is notified.
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance("A I scribing has begun. This visit is being recorded for documentation.")
        );
      }
    } catch {
      /* ignore */
    }
    if (!Ctor) {
      // No speech recognition: still allow manual transcript entry.
      setRecording(true);
      setNote("This browser has no built-in speech recognition — type the transcript below. Dictation works in Chrome/Edge and on iPad.");
      return;
    }
    const sr = new Ctor();
    sr.continuous = true;
    sr.interimResults = false;
    sr.lang = "en-US";
    sr.onresult = (ev: SpeechRecognitionEvent) => {
      let add = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) add += (add ? " " : "") + ev.results[i][0].transcript.trim();
      }
      if (add) {
        const next = transcriptRef.current + (transcriptRef.current ? " " : "") + add;
        transcriptRef.current = next;
        setTranscript(next);
      }
    };
    sr.onend = () => {
      // Auto-restart while still recording (Web Speech stops itself periodically).
      if (srRef.current) {
        try {
          sr.start();
        } catch {
          /* ignore */
        }
      }
    };
    sr.onerror = () => {
      /* keep the session alive; onend handles restart */
    };
    srRef.current = sr;
    try {
      sr.start();
    } catch {
      /* ignore */
    }
    setRecording(true);
    setNote(null);
  }

  function stopRecording() {
    const sr = srRef.current;
    if (sr) {
      sr.onend = null;
      try {
        sr.stop();
      } catch {
        /* ignore */
      }
    }
    srRef.current = null;
    setRecording(false);
  }

  // Offline keyword pass — no AI needed.
  function quickDraft() {
    const t = " " + transcript.toLowerCase().replace(/[,;:]/g, " ").replace(/\s+/g, " ") + " ";
    const patch: VitalsPatch = {};
    const bp =
      t.match(/(?:blood pressure|bp)\D{0,16}?(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/) ||
      t.match(/(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})/);
    if (bp) patch.bp = bp[1] + "/" + bp[2];
    const hr = t.match(/(?:heart rate|pulse|hr)\D{0,16}?(\d{2,3})/);
    if (hr) patch.pulse = hr[1];
    const wt = t.match(/(?:weight|weighs|weighed|weighing)\D{0,20}?(\d{2,3})/);
    if (wt) patch.weight_lbs = wt[1];
    const meds = t.match(/(?:medications?|taking|meds)(?:\s+(?:are|include|is|of))?\s+([a-z0-9 \-]{4,90}?)(?:\.|\band\s+(?:that|the|we|i)\b|$)/);
    if (meds) patch.meds = meds[1].trim();
    if (Object.keys(patch).length) onVitals(patch);

    const sugg = scribeConditions(transcript, confirmed);
    setSuggestions(sugg);
    setNote(
      (Object.keys(patch).length ? `Drafted ${Object.keys(patch).length} vital field(s). ` : "") +
        (sugg.length
          ? `Heard ${sugg.length} possible HCC condition(s) — review and add only what you clinically confirm.`
          : "Nothing recognized yet. Try: \"blood pressure 120 over 80, heart rate 72, weight 180, patient has COPD and chronic kidney disease\".")
    );
  }

  async function analyzeWithAi() {
    if (!transcript.trim()) {
      setNote("No transcript yet — dictate or type notes first.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const j = await geminiAnalyze(transcript);
      const patch: VitalsPatch = {};
      const v = j.vitals || {};
      if (v.bp1 && v.bp2) patch.bp = `${v.bp1}/${v.bp2}`;
      if (v.hr) patch.pulse = String(v.hr);
      if (v.wt) patch.weight_lbs = String(v.wt);
      if (v.ht) patch.height_in = String(v.ht);
      if (j.meds) patch.meds = String(j.meds);
      if (Object.keys(patch).length) onVitals(patch);

      const sugg: CodeSuggestion[] = [];
      (j.conditions || []).forEach((c) => {
        const e = c.icd10 ? icdByCode(c.icd10) : undefined;
        if (
          e &&
          !confirmed.some((x) => x.hcc === e[2] || x.code === e[0]) &&
          !sugg.some((s) => s.code === e[0])
        ) {
          sugg.push({
            code: e[0],
            label: e[1],
            hcc: e[2],
            name: String(c.condition || "").slice(0, 60),
            quote: String(c.quote || "").slice(0, 180),
          });
        }
      });
      sugg.sort((a, b) => (rafOf(b.hcc) || 0) - (rafOf(a.hcc) || 0));
      setSuggestions(sugg);
      setNote(`Gemini reviewed the transcript: ${Object.keys(patch).length} field(s) drafted, ${sugg.length} coding suggestion(s) ranked by value. Add only what you clinically confirm.`);
    } catch (e) {
      setNote("AI analysis failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>
        AI Visit Scribe <span className="pill blue">prototype</span>
      </h3>

      {!hasGemini && (
        <div className="notice" style={{ marginBottom: 10 }}>
          AI suggestions are off (no Gemini key on this build). You can still dictate the transcript and add HCC codes manually below.
        </div>
      )}

      {recording ? (
        <p style={{ margin: "6px 0" }}>
          <span className="rec-dot" />
          <b style={{ color: "var(--red)" }}>Recording</b> — say what you see ("blood pressure 120 over 80, heart rate 72…"). The patient was notified that scribing has begun.
        </p>
      ) : (
        <p className="muted" style={{ margin: "4px 0 10px", fontSize: 13 }}>
          Press start, speak your findings during the visit, and the scribe transcribes everything. It announces
          {" "}<b>"AI scribing has begun"</b> out loud for compliance, and the full transcript is saved with the HRA.{" "}
          {speechSupported() ? "" : "This browser has no built-in speech recognition — the transcript box is manual here, but dictation works in Chrome/Edge and on iPad. "}
          Production will use a HIPAA-covered transcription service.
        </p>
      )}

      <textarea
        rows={recording ? 4 : 3}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder={
          speechSupported()
            ? "Live transcript appears here as you speak…"
            : "Speech-to-text not available in this browser — type or dictate with the keyboard mic here."
        }
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {recording ? (
          <button className="btn danger" onClick={stopRecording}>
            ■ Stop scribing
          </button>
        ) : (
          <button className="btn" onClick={startRecording}>
            ● Start AI scribe
          </button>
        )}
        <button className="btn secondary" onClick={quickDraft} disabled={!transcript.trim()}>
          Quick draft (offline)
        </button>
        {hasGemini && (
          <button className="btn" onClick={analyzeWithAi} disabled={busy || !transcript.trim()}>
            {busy ? "🧠 Analyzing…" : "🧠 Analyze with AI (Gemini)"}
          </button>
        )}
        {words > 0 && <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{words} words captured</span>}
      </div>

      {note && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {note}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="ai-rev">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>
              🎙 Found in the visit — {suggestions.length} possible condition{suggestions.length === 1 ? "" : "s"} to review
            </b>
            <a style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer", fontWeight: 600 }} onClick={() => setSuggestions([])}>
              Dismiss all ✕
            </a>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "3px 0 2px" }}>
            Ranked by value. Add only what you clinically confirm — the quote shows where it came from.
          </p>
          {suggestions.map((s, i) => (
            <div className="ai-row" key={s.code}>
              <div style={{ minWidth: 0 }}>
                <div className="cn">{s.name || s.label}</div>
                <div className="meta">
                  {s.code} · HCC {s.hcc} — {HCC_V28[String(s.hcc)] || ""} &nbsp;
                  <RafPill hcc={s.hcc} />
                </div>
                {s.quote ? <div className="q">“{s.quote}”</div> : null}
              </div>
              <div className="acts">
                <button
                  className="btn sm"
                  onClick={() => {
                    onConfirm(s.code);
                    setSuggestions(suggestions.filter((x) => x.code !== s.code && x.hcc !== s.hcc));
                  }}
                >
                  ✓ Add
                </button>
                <button className="btn sm secondary" onClick={() => setSuggestions(suggestions.filter((_, j) => j !== i))}>
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
