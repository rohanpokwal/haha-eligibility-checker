// ================= Utilities =================
function formatDateMMDDYYYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Accepts "YYYY-MM-DD" or "MM/DD/YYYY"; returns Date or null
function parseISOorMMDDYYYY(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [m, d, y] = value.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt) ? null : dt;
  }
  return null;
}

// Build MM/DD/YYYY from digits, auto-inserting slashes (for mobile numeric keyboard)
function formatAsDate(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8); // MMDDYYYY
  let mm = digits.slice(0, 2);
  let dd = digits.slice(2, 4);
  let yyyy = digits.slice(4, 8);

  if (mm.length === 2) {
    mm = String(Math.min(Math.max(parseInt(mm, 10) || 0, 1), 12)).padStart(
      2,
      "0"
    );
  }
  if (dd.length === 2) {
    dd = String(Math.min(Math.max(parseInt(dd, 10) || 0, 1), 31)).padStart(
      2,
      "0"
    );
  }

  let out = mm;
  if (dd) out += "/" + dd;
  if (yyyy) out += "/" + yyyy;
  return out;
}

// ================= Data load =================
let offensesData = [];
fetch("hha_disqualifying_offenses_full_with_names.json")
  .then((r) => r.json())
  .then((d) => {
    offensesData = d;
  })
  .catch(() => {
    const results = document.getElementById("results");
    results.innerHTML = `
      <div class="result-badge yellow">⚠️ Could not load the offenses list.
      Ensure <strong>hha_disqualifying_offenses_full_with_names.json</strong> is in the same folder and
      you are running a local server (or GitHub Pages).</div>`;
  });

// ================= DOM hooks =================
const offenseList = document.getElementById("offense-list");
document.getElementById("add-offense").addEventListener("click", addOffenseRow);
document
  .getElementById("check-btn")
  .addEventListener("click", checkEligibility);

// Clear (✖) for the name input
document.querySelectorAll(".clear-input").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-target");
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
});

// Event delegation for all current & future .date inputs
offenseList.addEventListener("input", (e) => {
  if (!e.target.classList.contains("date")) return;
  e.target.value = formatAsDate(e.target.value);
});
offenseList.addEventListener("keydown", (e) => {
  const el = e.target;
  if (!el.classList.contains("date")) return;
  if (e.key === "Backspace") {
    const pos = el.selectionStart;
    if (pos && el.value[pos - 1] === "/") {
      e.preventDefault();
      const before = el.value.slice(0, pos - 1);
      const after = el.value.slice(pos);
      el.value = before + after;
      const newPos = pos - 1;
      el.setSelectionRange(newPos, newPos);
    }
  }
});
offenseList.addEventListener("paste", (e) => {
  const el = e.target;
  if (!el.classList.contains("date")) return;
  const t = (e.clipboardData || window.clipboardData).getData("text").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    e.preventDefault();
    const [y, m, d] = t.split("-");
    el.value = `${m}/${d}/${y}`;
  }
});

// Start with one row
addOffenseRow();

// ================= Rows =================
function addOffenseRow() {
  const row = document.createElement("div");
  row.className = "offense-entry";
  row.innerHTML = `
    <input type="text" class="code" placeholder="Statute code (e.g., 2911.12)" inputmode="decimal" autocomplete="off" />
    <input type="text" class="date" placeholder="MM/DD/YYYY (optional)" inputmode="numeric" pattern="[0-9/]*" maxlength="10" autocomplete="off" />
    <button type="button" class="remove-btn" aria-label="Remove offense">✖</button>
  `;
  offenseList.appendChild(row);
  row
    .querySelector(".remove-btn")
    .addEventListener("click", () => offenseList.removeChild(row));
}

// ================= Core Logic =================
function checkEligibility() {
  const name = (
    document.getElementById("name").value || "The applicant"
  ).trim();
  const today = new Date();
  const rows = document.querySelectorAll(".offense-entry");

  const results = [];

  rows.forEach((row) => {
    const code = row.querySelector(".code").value.trim();
    const dateStr = row.querySelector(".date").value.trim();
    if (!code) return;

    const match = offensesData.find((o) => o.statute_code === code);

    // Unknown code ⇒ not disqualifying
    if (!match) {
      results.push({
        code,
        offense_name: "Not found in exclusion list",
        tier: "-",
        status: "✅ Eligible now (not a disqualifying offense)",
      });
      return;
    }

    // Tier I ⇒ permanent exclusion
    if (match.tier === 1) {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: "❌ Never eligible (Tier I offense)",
      });
      return;
    }

    // Tier V ⇒ eligible now
    if (match.tier === 5) {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: "✅ Eligible now (Tier V offense)",
      });
      return;
    }

    // Tier II–IV ⇒ require date for accuracy
    const dischargeDate = parseISOorMMDDYYYY(dateStr);
    if (!dischargeDate) {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: `⚠️ Tier ${match.tier} offense — requires a ${match.exclusion_years}-year exclusion period. Please enter a discharge date for accuracy.`,
      });
      return;
    }

    const eligibleDate = new Date(dischargeDate);
    eligibleDate.setFullYear(
      dischargeDate.getFullYear() + Number(match.exclusion_years)
    );

    if (eligibleDate > today) {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: `⚠️ Not eligible now — eligible on ${formatDateMMDDYYYY(
          eligibleDate
        )}`,
      });
    } else {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: "✅ Eligible now (exclusion period has passed)",
      });
    }
  });

  // ======== Summary ========
  let html = `<div class="result-summary">`;

  const hasNever = results.some((r) => r.status.startsWith("❌"));
  const needsDate = results.some((r) =>
    r.status.includes("Please enter a discharge date")
  );
  const futureDates = results
    .map((r) => {
      const m = r.status.match(/(\d{2}\/\d{2}\/\d{4})/);
      return m ? parseISOorMMDDYYYY(m[1]) : null;
    })
    .filter(Boolean);

  if (hasNever) {
    html += `<div class="result-badge red">❌ ${name} is NOT eligible to work as an HHA.</div>`;
  } else if (futureDates.length > 0) {
    // strictest: latest eligible date across offenses
    const maxDate = new Date(Math.max.apply(null, futureDates));
    html += `<div class="result-badge yellow">⚠️ ${name} is not eligible now, but will be eligible on ${formatDateMMDDYYYY(
      maxDate
    )}.</div>`;
  } else if (needsDate) {
    html += `<div class="result-badge yellow">⚠️ Eligibility cannot be calculated without a discharge date for all Tier II–IV offenses.</div>`;
  } else if (results.length > 0) {
    html += `<div class="result-badge green">✅ ${name} is eligible to work as an HHA now.</div>`;
  } else {
    html += `<div class="result-badge yellow">⚠️ Please add at least one offense to evaluate eligibility.</div>`;
  }
  html += `</div>`;

  // ======== Detail Table ========
  html += `<table><tr><th>Code</th><th>Offense</th><th>Tier</th><th>Result</th></tr>`;
  results.forEach((r) => {
    html += `<tr><td>${r.code}</td><td>${r.offense_name}</td><td>${r.tier}</td><td>${r.status}</td></tr>`;
  });
  html += `</table>`;

  document.getElementById("results").innerHTML = html;
}
