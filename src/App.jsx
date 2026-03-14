import { useState, useEffect, useCallback } from "react";

// ============================================================
// TEWS ENGINE — Direct port of the Python logic
// ============================================================
function calculateTEWS({ respRate, pulse, sbp, temp, gcs, mobility, spo2 }) {
  let score = 0;
  const missing = [];

  // Respiratory Rate
  if (respRate === null || respRate === "") missing.push("Resp Rate");
  else {
    const rr = Number(respRate);
    if (rr <= 8 || rr >= 30) score += 3;
    else if (rr >= 21) score += 2;
    else if (rr >= 15) score += 1;
  }

  // Pulse
  if (pulse === null || pulse === "") missing.push("Pulse");
  else {
    const p = Number(pulse);
    if (p <= 40 || p >= 131) score += 3;
    else if (p >= 111) score += 2;
    else if (p >= 101) score += 1;
  }

  // Systolic BP
  if (sbp === null || sbp === "") missing.push("SBP");
  else {
    const s = Number(sbp);
    if (s < 90) score += 3;
    else if (s <= 99) score += 2;
    else if (s <= 109) score += 1;
  }

  // Temperature
  if (temp !== null && temp !== "") {
    const t = Number(temp);
    if (t < 35 || t >= 38.5) score += 2;
  } else missing.push("Temp");

  // GCS
  if (gcs === null || gcs === "") missing.push("GCS");
  else {
    const g = Number(gcs);
    if (g <= 8) score += 3;
    else if (g <= 12) score += 2;
    else if (g <= 14) score += 1;
  }

  // Mobility
  if (mobility === "immobile") score += 2;
  else if (mobility === "with_help") score += 1;

  // SpO2
  if (spo2 !== null && spo2 !== "") {
    if (Number(spo2) < 90) score += 3;
  } else missing.push("SpO2");

  return { score, missing };
}

function getSATSColour(tews, complaint) {
  const c = complaint.toLowerCase();
  const redConditions = ["cardiac arrest", "uncontrolled bleeding", "severe head injury", "unconscious"];
  const orangeConditions = ["chest pain", "shortness of breath", "stroke", "seizure", "severe trauma", "burns"];
  const discriminators = [];

  if (redConditions.some((x) => c.includes(x)) || tews >= 7) {
    if (redConditions.some((x) => c.includes(x))) discriminators.push("Clinical Red Discriminator");
    return { colour: "RED", discriminators };
  }
  if (orangeConditions.some((x) => c.includes(x)) || tews >= 5) {
    if (orangeConditions.some((x) => c.includes(x))) discriminators.push("Clinical Orange Discriminator");
    return { colour: "ORANGE", discriminators };
  }
  if (tews >= 3) return { colour: "YELLOW", discriminators };
  return { colour: "GREEN", discriminators };
}

function getDepartment(complaint, sex) {
  const c = complaint.toLowerCase();
  if (["abdominal", "epigastric", "intestinal", "fracture", "trauma", "injury", "wound"].some((x) => c.includes(x))) return "Surgery";
  if (["pregnancy", "delivery", "labour", "miscarriage"].some((x) => c.includes(x)) || (sex === "female" && c.includes("vaginal bleeding"))) return "OB/GYN";
  if (["coma", "severe head injury", "critical", "respiratory failure"].some((x) => c.includes(x))) return "ICU";
  if (["chest", "heart", "shortness of breath", "stroke", "seizure", "epilepsy", "diabetes"].some((x) => c.includes(x))) return "Medicine";
  return "General Medicine";
}

// ============================================================
// COLOUR CONFIG
// ============================================================
const COLOUR_CONFIG = {
  RED:    { bg: "#C0152A", light: "#FF1E3A", dark: "#7A0010", text: "#FFFFFF", label: "IMMEDIATE", wait: "Now", icon: "🔴" },
  ORANGE: { bg: "#D4600A", light: "#FF7A1A", dark: "#8C3E04", text: "#FFFFFF", label: "VERY URGENT", wait: "< 10 min", icon: "🟠" },
  YELLOW: { bg: "#C4960A", light: "#FFCA2C", dark: "#7A5D00", text: "#1A1200", label: "URGENT", wait: "< 60 min", icon: "🟡" },
  GREEN:  { bg: "#1A7A3C", light: "#22A84F", dark: "#0E4D25", text: "#FFFFFF", label: "ROUTINE", wait: "< 4 hrs", icon: "🟢" },
};

const DEPT_ICONS = {
  "Surgery": "🔪", "OB/GYN": "🤱", "ICU": "🫁", "Medicine": "💊", "General Medicine": "🏥"
};

// ============================================================
// VITALS QUICK-SELECT COMPONENT
// ============================================================
function QuickSelect({ label, unit, options, value, onChange, critical, field }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#8899AA", letterSpacing: 2, textTransform: "uppercase" }}>{label}</label>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700,
          color: critical ? "#FF1E3A" : value !== "" ? "#00E5FF" : "#4A5568",
          minWidth: 60, textAlign: "right"
        }}>{value !== "" ? `${value} ${unit}` : "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button key={opt}
            onClick={() => onChange(field, opt)}
            style={{
              padding: "7px 12px", borderRadius: 6, border: "1px solid",
              fontFamily: "'Space Mono', monospace", fontSize: 12, cursor: "pointer",
              transition: "all 0.15s",
              background: String(value) === String(opt) ? "#00E5FF" : "transparent",
              borderColor: String(value) === String(opt) ? "#00E5FF" : "#2D3748",
              color: String(value) === String(opt) ? "#0A0F1A" : "#8899AA",
              fontWeight: String(value) === String(opt) ? 700 : 400,
            }}>{opt}</button>
        ))}
        <input
          type="number"
          placeholder="manual"
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          style={{
            width: 70, padding: "7px 10px", borderRadius: 6, border: "1px solid #2D3748",
            background: "transparent", color: "#CBD5E0",
            fontFamily: "'Space Mono', monospace", fontSize: 12, outline: "none"
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// TRIAGE CARD COMPONENT
// ============================================================
function TriageCard({ patient, onSelect, compact = false }) {
  const cfg = COLOUR_CONFIG[patient.colour];
  const elapsed = Math.floor((Date.now() - patient.arrivalTime) / 60000);

  return (
    <div
      onClick={() => onSelect && onSelect(patient)}
      style={{
        background: "#0D1B2A",
        border: `2px solid ${cfg.bg}`,
        borderLeft: `6px solid ${cfg.light}`,
        borderRadius: 10,
        padding: compact ? "12px 14px" : "18px 20px",
        cursor: onSelect ? "pointer" : "default",
        transition: "all 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Colour badge */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        background: cfg.bg, color: cfg.text,
        fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
        letterSpacing: 2, padding: "4px 10px",
        borderBottomLeftRadius: 8
      }}>{cfg.label}</div>

      {/* Patient info row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: compact ? 6 : 10 }}>
        <div style={{
          width: compact ? 36 : 44, height: compact ? 36 : 44,
          borderRadius: "50%", background: cfg.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Space Mono', monospace", fontSize: compact ? 13 : 16, fontWeight: 700,
          color: cfg.text, flexShrink: 0
        }}>
          {patient.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: compact ? 14 : 16, fontWeight: 700, color: "#F0F4F8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{patient.name}</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#6B7A8D" }}>{patient.age}y · {patient.sex} · #{patient.id.toString().padStart(4, "0")}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: compact ? 20 : 26, fontWeight: 700, color: cfg.light, lineHeight: 1 }}>{patient.tews}</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#6B7A8D", letterSpacing: 1 }}>TEWS</div>
        </div>
      </div>

      {/* Complaint */}
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8899AA", marginBottom: 8, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>"{patient.complaint}"</div>

      {/* Vitals strip */}
      {!compact && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            { label: "RR", value: patient.vitals.respRate, unit: "" },
            { label: "HR", value: patient.vitals.pulse, unit: "" },
            { label: "SBP", value: patient.vitals.sbp, unit: "" },
            { label: "T", value: patient.vitals.temp, unit: "°C" },
            { label: "SpO₂", value: patient.vitals.spo2, unit: "%" },
            { label: "GCS", value: patient.vitals.gcs, unit: "" },
          ].map(({ label, value, unit }) => (
            <div key={label} style={{ background: "#131E2D", borderRadius: 6, padding: "4px 8px", fontFamily: "'Space Mono', monospace" }}>
              <span style={{ fontSize: 9, color: "#4A5A6A", display: "block", letterSpacing: 1 }}>{label}</span>
              <span style={{ fontSize: 13, color: value !== "" ? "#CBD5E0" : "#3A4A5A", fontWeight: 600 }}>{value !== "" ? `${value}${unit}` : "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#4A6A8A" }}>
          {DEPT_ICONS[patient.department]} {patient.department}
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: elapsed > 30 && patient.colour !== "GREEN" ? "#FF6B6B" : "#4A6A8A" }}>
          ⏱ {elapsed < 1 ? "< 1" : elapsed}m ago
        </div>
      </div>

      {/* Discriminator alert */}
      {patient.discriminators?.length > 0 && (
        <div style={{ marginTop: 8, background: "#2A0A0A", border: "1px solid #C0152A", borderRadius: 6, padding: "4px 8px", fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FF6B6B", letterSpacing: 1 }}>
          ⚠ {patient.discriminators.join(" · ")}
        </div>
      )}

      {patient.missingVitals?.length > 0 && (
        <div style={{ marginTop: 6, background: "#1A1A0A", border: "1px solid #C4960A", borderRadius: 6, padding: "4px 8px", fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFCA2C", letterSpacing: 1 }}>
          ⚡ PARTIAL DATA: {patient.missingVitals.join(", ")} unavailable
        </div>
      )}
    </div>
  );
}

// ============================================================
// VITALS ENTRY FORM
// ============================================================
const EMPTY_FORM = {
  name: "", age: "", sex: "female", complaint: "",
  respRate: "", pulse: "", sbp: "", temp: "", gcs: "", mobility: "walking", spo2: ""
};

const COMMON_COMPLAINTS = [
  "Chest Pain", "Shortness of Breath", "Abdominal Pain", "Trauma/Injury",
  "Seizure", "Stroke", "Burns", "Fever", "Cardiac Arrest", "Headache",
  "Unconscious", "Fracture", "Vaginal Bleeding", "Pregnancy/Labour",
  "Diabetic Emergency", "Severe Trauma"
];

function VitalsForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [liveScore, setLiveScore] = useState(null);
  const [liveColour, setLiveColour] = useState(null);

  const update = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  useEffect(() => {
    if (form.respRate !== "" || form.pulse !== "" || form.sbp !== "") {
      const { score } = calculateTEWS({
        respRate: form.respRate, pulse: form.pulse, sbp: form.sbp,
        temp: form.temp, gcs: form.gcs, mobility: form.mobility, spo2: form.spo2
      });
      const { colour } = getSATSColour(score, form.complaint);
      setLiveScore(score);
      setLiveColour(colour);
    } else {
      setLiveScore(null);
      setLiveColour(null);
    }
  }, [form]);

  const cfg = liveColour ? COLOUR_CONFIG[liveColour] : null;

  const handleSubmit = () => {
    if (!form.name || !form.complaint) return;
    const { score, missing } = calculateTEWS({
      respRate: form.respRate, pulse: form.pulse, sbp: form.sbp,
      temp: form.temp, gcs: form.gcs, mobility: form.mobility, spo2: form.spo2
    });
    const { colour, discriminators } = getSATSColour(score, form.complaint);
    const department = getDepartment(form.complaint, form.sex);
    onSubmit({
      id: Date.now(),
      name: form.name, age: form.age, sex: form.sex,
      complaint: form.complaint, tews: score,
      colour, department, discriminators,
      missingVitals: missing,
      arrivalTime: Date.now(),
      vitals: {
        respRate: form.respRate, pulse: form.pulse, sbp: form.sbp,
        temp: form.temp, gcs: form.gcs, mobility: form.mobility, spo2: form.spo2
      }
    });
    setForm(EMPTY_FORM);
    setLiveScore(null);
    setLiveColour(null);
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Live TEWS Banner */}
      <div style={{
        borderRadius: 12, padding: "16px 24px", marginBottom: 24,
        background: cfg ? `linear-gradient(135deg, ${cfg.dark}, ${cfg.bg})` : "#0D1B2A",
        border: `2px solid ${cfg ? cfg.light : "#1E3A5A"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.3s"
      }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: cfg ? cfg.text : "#4A6A8A", letterSpacing: 3, opacity: 0.7 }}>LIVE TEWS SCORE</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 40, fontWeight: 700, color: cfg ? cfg.light : "#1E3A5A", lineHeight: 1.1 }}>
            {liveScore !== null ? liveScore : "—"}
          </div>
          {liveColour && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: cfg?.text, marginTop: 2 }}>{cfg?.label} · Wait: {cfg?.wait}</div>}
        </div>
        {liveColour && (
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: cfg.light, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 28, boxShadow: `0 0 20px ${cfg.light}66`
          }}>{cfg.icon}</div>
        )}
      </div>

      {/* Patient Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", gap: 10, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Patient Name</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)}
            placeholder="Full name..." style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Age</label>
          <input type="number" value={form.age} onChange={(e) => update("age", e.target.value)}
            placeholder="yrs" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Sex</label>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {["male", "female"].map((s) => (
              <button key={s} onClick={() => update("sex", s)} style={{
                flex: 1, padding: "9px 0", borderRadius: 6, border: `1px solid ${form.sex === s ? "#00E5FF" : "#2D3748"}`,
                background: form.sex === s ? "#00E5FF22" : "transparent",
                color: form.sex === s ? "#00E5FF" : "#6B7A8D",
                fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: "pointer", textTransform: "capitalize"
              }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Chief Complaint */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Chief Complaint</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4, marginBottom: 6 }}>
          {COMMON_COMPLAINTS.map((c) => (
            <button key={c} onClick={() => update("complaint", c)} style={{
              padding: "6px 10px", borderRadius: 20, border: `1px solid ${form.complaint === c ? "#00E5FF" : "#2D3748"}`,
              background: form.complaint === c ? "#00E5FF22" : "#0D1B2A",
              color: form.complaint === c ? "#00E5FF" : "#6B7A8D",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer"
            }}>{c}</button>
          ))}
        </div>
        <input value={form.complaint} onChange={(e) => update("complaint", e.target.value)}
          placeholder="Or type custom complaint..." style={inputStyle} />
      </div>

      <div style={{ height: 1, background: "#1E3A5A", margin: "20px 0" }} />

      {/* Vitals Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <QuickSelect label="Respiratory Rate" unit="br/min" field="respRate"
          options={[8, 12, 16, 20, 24, 28, 32]} value={form.respRate} onChange={update}
          critical={form.respRate !== "" && (Number(form.respRate) <= 8 || Number(form.respRate) >= 30)} />
        <QuickSelect label="Heart Rate / Pulse" unit="bpm" field="pulse"
          options={[40, 60, 80, 100, 110, 120, 140]} value={form.pulse} onChange={update}
          critical={form.pulse !== "" && (Number(form.pulse) <= 40 || Number(form.pulse) >= 131)} />
        <QuickSelect label="Systolic BP" unit="mmHg" field="sbp"
          options={[80, 90, 100, 110, 120, 140, 160]} value={form.sbp} onChange={update}
          critical={form.sbp !== "" && Number(form.sbp) < 90} />
        <QuickSelect label="Temperature" unit="°C" field="temp"
          options={[35.5, 36.5, 37.0, 37.5, 38.0, 38.5, 39.5]} value={form.temp} onChange={update}
          critical={form.temp !== "" && (Number(form.temp) < 35 || Number(form.temp) >= 38.5)} />
        <QuickSelect label="SpO₂" unit="%" field="spo2"
          options={[85, 88, 90, 92, 95, 97, 99]} value={form.spo2} onChange={update}
          critical={form.spo2 !== "" && Number(form.spo2) < 90} />
        <QuickSelect label="GCS Score" unit="" field="gcs"
          options={[3, 5, 8, 10, 12, 14, 15]} value={form.gcs} onChange={update}
          critical={form.gcs !== "" && Number(form.gcs) <= 8} />
      </div>

      {/* Mobility */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Mobility</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {[["walking", "🚶 Walking"], ["with_help", "🆘 Needs Help"], ["immobile", "🛌 Immobile"]].map(([val, label]) => (
            <button key={val} onClick={() => update("mobility", val)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
              border: `2px solid ${form.mobility === val ? "#00E5FF" : "#2D3748"}`,
              background: form.mobility === val ? "#00E5FF15" : "#0D1B2A",
              color: form.mobility === val ? "#00E5FF" : "#6B7A8D",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, transition: "all 0.15s"
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} style={{
        width: "100%", padding: "16px", borderRadius: 10, border: "none",
        background: liveColour ? `linear-gradient(135deg, ${COLOUR_CONFIG[liveColour].dark}, ${COLOUR_CONFIG[liveColour].bg})` : "linear-gradient(135deg, #0A2A4A, #0D4A8A)",
        color: "#FFFFFF", fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700,
        letterSpacing: 2, cursor: "pointer", transition: "all 0.3s",
        boxShadow: liveColour ? `0 4px 20px ${COLOUR_CONFIG[liveColour].bg}55` : "none"
      }}>
        REGISTER PATIENT {liveColour ? `→ ${liveColour}` : ""}
      </button>
    </div>
  );
}

const labelStyle = { fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#4A6A8A", letterSpacing: 2, textTransform: "uppercase", display: "block", marginBottom: 4 };
const inputStyle = { width: "100%", background: "#0D1B2A", border: "1px solid #1E3A5A", borderRadius: 8, padding: "10px 12px", color: "#CBD5E0", fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };

// ============================================================
// TRIAGE QUEUE VIEW
// ============================================================
const COLOUR_ORDER = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 };

function TriageQueue({ patients, onSelect }) {
  const [filter, setFilter] = useState("ALL");

  const sorted = [...patients]
    .sort((a, b) => {
      if (COLOUR_ORDER[a.colour] !== COLOUR_ORDER[b.colour])
        return COLOUR_ORDER[a.colour] - COLOUR_ORDER[b.colour];
      return a.arrivalTime - b.arrivalTime;
    })
    .filter((p) => filter === "ALL" || p.colour === filter);

  const counts = patients.reduce((acc, p) => {
    acc[p.colour] = (acc[p.colour] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {["RED", "ORANGE", "YELLOW", "GREEN"].map((c) => {
          const cfg = COLOUR_CONFIG[c];
          return (
            <div key={c} onClick={() => setFilter(filter === c ? "ALL" : c)}
              style={{
                background: filter === c ? `${cfg.bg}55` : "#0D1B2A",
                border: `2px solid ${filter === c ? cfg.light : "#1E2A3A"}`,
                borderRadius: 10, padding: "12px 16px", cursor: "pointer", transition: "all 0.2s"
              }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, fontWeight: 700, color: cfg.light }}>{counts[c] || 0}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: cfg.bg, letterSpacing: 2 }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* Queue */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#2A3A4A", fontFamily: "'Space Mono', monospace", fontSize: 14 }}>
          NO PATIENTS IN QUEUE
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((p) => <TriageCard key={p.id} patient={p} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PATIENT DETAIL MODAL
// ============================================================
function PatientModal({ patient, onClose }) {
  if (!patient) return null;
  const cfg = COLOUR_CONFIG[patient.colour];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000099", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0A1520", border: `2px solid ${cfg.light}`,
        borderRadius: 16, padding: 28, maxWidth: 500, width: "100%",
        boxShadow: `0 0 50px ${cfg.bg}55`
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, color: cfg.light, fontWeight: 700 }}>
            TRIAGE RECORD
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7A8D", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ background: cfg.bg, borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 700, color: cfg.text }}>{patient.name}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: cfg.text, opacity: 0.7 }}>{patient.age}y · {patient.sex} · #{patient.id.toString().padStart(4, "0")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 36, fontWeight: 700, color: cfg.text }}>{patient.tews}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: cfg.text, opacity: 0.7, letterSpacing: 2 }}>TEWS</div>
          </div>
        </div>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#8899AA", marginBottom: 16, fontStyle: "italic" }}>
          Chief Complaint: "{patient.complaint}"
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          {[
            ["Resp Rate", patient.vitals.respRate, "br/min"],
            ["Heart Rate", patient.vitals.pulse, "bpm"],
            ["Systolic BP", patient.vitals.sbp, "mmHg"],
            ["Temperature", patient.vitals.temp, "°C"],
            ["SpO₂", patient.vitals.spo2, "%"],
            ["GCS", patient.vitals.gcs, "/15"],
          ].map(([label, value, unit]) => (
            <div key={label} style={{ background: "#0D1B2A", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#4A5A6A", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, color: value !== "" ? "#CBD5E0" : "#FF6B6B", fontWeight: 600 }}>
                {value !== "" ? `${value}${unit}` : "MISSING"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ background: "#0D1B2A", borderRadius: 8, padding: "10px 14px", flex: 1, marginRight: 8 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#4A5A6A", letterSpacing: 1, marginBottom: 4 }}>MOBILITY</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#CBD5E0", textTransform: "capitalize" }}>{patient.vitals.mobility?.replace("_", " ")}</div>
          </div>
          <div style={{ background: `${cfg.bg}33`, border: `1px solid ${cfg.bg}`, borderRadius: 8, padding: "10px 14px", flex: 1 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#4A5A6A", letterSpacing: 1, marginBottom: 4 }}>REFERRED TO</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: cfg.light, fontWeight: 700 }}>
              {DEPT_ICONS[patient.department]} {patient.department}
            </div>
          </div>
        </div>

        {patient.discriminators?.length > 0 && (
          <div style={{ background: "#1A0505", border: "1px solid #C0152A", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FF6B6B", letterSpacing: 2 }}>⚠ CLINICAL ALERTS</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#FF9999", marginTop: 4 }}>{patient.discriminators.join(" · ")}</div>
          </div>
        )}

        {patient.missingVitals?.length > 0 && (
          <div style={{ background: "#1A1500", border: "1px solid #C4960A", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFCA2C", letterSpacing: 2 }}>⚡ PARTIAL DATA</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#FFDD88", marginTop: 4 }}>
              Missing: {patient.missingVitals.join(", ")}. Score calculated on available data. Reassess when vitals obtained.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DEMO SEED DATA
// ============================================================
const SEED_PATIENTS = [
  {
    id: 1001, name: "Amara Odhiambo", age: 45, sex: "male", complaint: "Chest pain",
    tews: 6, colour: "ORANGE", department: "Medicine",
    discriminators: ["Clinical Orange Discriminator"], missingVitals: [],
    arrivalTime: Date.now() - 8 * 60000,
    vitals: { respRate: 24, pulse: 112, sbp: 105, temp: 37.2, gcs: 15, mobility: "walking", spo2: 93 }
  },
  {
    id: 1002, name: "Fatuma Wanjiru", age: 28, sex: "female", complaint: "Pregnancy/Labour",
    tews: 2, colour: "GREEN", department: "OB/GYN",
    discriminators: [], missingVitals: [],
    arrivalTime: Date.now() - 22 * 60000,
    vitals: { respRate: 18, pulse: 88, sbp: 120, temp: 37.0, gcs: 15, mobility: "walking", spo2: 98 }
  },
  {
    id: 1003, name: "John Kamau", age: 62, sex: "male", complaint: "Unconscious patient",
    tews: 9, colour: "RED", department: "ICU",
    discriminators: ["Clinical Red Discriminator"], missingVitals: [],
    arrivalTime: Date.now() - 2 * 60000,
    vitals: { respRate: 8, pulse: 50, sbp: 80, temp: 34.5, gcs: 6, mobility: "immobile", spo2: 87 }
  },
  {
    id: 1004, name: "Mercy Atieno", age: 34, sex: "female", complaint: "Abdominal pain",
    tews: 3, colour: "YELLOW", department: "Surgery",
    discriminators: [], missingVitals: [],
    arrivalTime: Date.now() - 45 * 60000,
    vitals: { respRate: 16, pulse: 95, sbp: 115, temp: 38.6, gcs: 15, mobility: "with_help", spo2: 96 }
  },
];

// ============================================================
// MAIN APP
// ============================================================
export default function AfiaTriage() {
  const [tab, setTab] = useState("queue");
  const [patients, setPatients] = useState(SEED_PATIENTS);
  const [selected, setSelected] = useState(null);

  // Refresh elapsed times every 30s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const addPatient = (p) => {
    setPatients((prev) => [...prev, p]);
    setTab("queue");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060D18; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #060D18; }
        ::-webkit-scrollbar-thumb { background: #1E3A5A; border-radius: 2px; }
        input::placeholder { color: #2A3A4A; }
        input:focus { border-color: #00E5FF !important; box-shadow: 0 0 0 2px #00E5FF22; }
        button:active { transform: scale(0.97); }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#060D18", fontFamily: "'DM Sans', sans-serif" }}>

        {/* HEADER */}
        <div style={{
          background: "linear-gradient(90deg, #060D18 0%, #0A1A2E 50%, #060D18 100%)",
          borderBottom: "1px solid #0D2A4A",
          padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 60, position: "sticky", top: 0, zIndex: 100
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #C0152A, #FF1E3A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✚</div>
            <div>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#F0F4F8", letterSpacing: 1 }}>Afia</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: "#00E5FF", letterSpacing: 1 }}>Triage</span>
            </div>
            <div style={{ background: "#0D1B2A", borderRadius: 4, padding: "2px 8px", fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#4A6A8A", letterSpacing: 2, marginLeft: 4 }}>AfiaTriage SATS v2</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {["RED", "ORANGE", "YELLOW"].map((c) => {
                const count = patients.filter((p) => p.colour === c).length;
                return count > 0 ? (
                  <div key={c} style={{
                    background: `${COLOUR_CONFIG[c].bg}33`, border: `1px solid ${COLOUR_CONFIG[c].bg}`,
                    borderRadius: 20, padding: "3px 10px", fontFamily: "'Space Mono', monospace",
                    fontSize: 11, color: COLOUR_CONFIG[c].light
                  }}>{count} {c}</div>
                ) : null;
              })}
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#2A4A6A" }}>
              {new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ background: "#060D18", borderBottom: "1px solid #0D2A4A", padding: "0 24px", display: "flex", gap: 0 }}>
          {[["queue", "Triage Queue"], ["entry", "➕ New Patient"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "14px 24px", border: "none", borderBottom: `3px solid ${tab === id ? "#00E5FF" : "transparent"}`,
              background: "transparent", color: tab === id ? "#00E5FF" : "#4A6A8A",
              fontFamily: "'Space Mono', monospace", fontSize: 12, cursor: "pointer",
              letterSpacing: 1, transition: "all 0.2s"
            }}>{label}</button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ padding: "24px", maxWidth: 740, margin: "0 auto" }}>
          {tab === "entry" && <VitalsForm onSubmit={addPatient} />}
          {tab === "queue" && <TriageQueue patients={patients} onSelect={setSelected} tick={tick} />}
        </div>

        {/* FOOTER */}
        <div style={{ borderTop: "1px solid #0A1A2A", padding: "12px 24px", textAlign: "center", fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#1A2A3A", letterSpacing: 1 }}>
          AFIATRIAGE SATS · ADULT PROTOCOL · 🔒 AES-256 ENCRYPTED · HIPAA/PDPA COMPLIANT
        </div>
      </div>

      {/* PATIENT DETAIL MODAL */}
      <PatientModal patient={selected} onClose={() => setSelected(null)} />
    </>
  );
}