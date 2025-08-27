// ================= Utilities =================
function formatDateMMDDYYYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseISOorMMDDYYYY(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // from <input type="date"> if used
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

// ================= Data load =================
let offensesData = [];
let dataLoaded = false;
fetch("hha_disqualifying_offenses_full_with_names.json")
  .then((r) => r.json())
  .then((d) => {
    offensesData = d;
    dataLoaded = true;
  })
  .catch(() => {
    const results = document.getElementById("results");
    results.innerHTML = `
      <div class="result-badge yellow">⚠️ Could not load the offenses list.
      Make sure <strong>hha_disqualifying_offenses_full_with_names.json</strong> is in the same folder and
      you are running a local server (not opening the file directly).</div>`;
  });

// ================= DOM hooks =================
const offenseList = document.getElementById("offense-list");
document.getElementById("add-offense").addEventListener("click", addOffenseRow);
document
  .getElementById("check-btn")
  .addEventListener("click", checkEligibility);

// clear (✖) for the name input
document.querySelectorAll(".clear-input").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-target");
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
});

// start with one row
addOffenseRow();

// ================= Rows =================
function addOffenseRow() {
  const row = document.createElement("div");
  row.className = "offense-entry";
  row.innerHTML = `
    <input type="text" class="code" placeholder="Statute code (e.g., 2911.12)" inputmode="decimal" autocomplete="off" />
    <input type="text" class="date" placeholder="MM/DD/YYYY (optional)" inputmode="numeric" maxlength="10" autocomplete="off" />
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

    // Unknown code ⇒ treat as NOT disqualifying
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

    // Tier V ⇒ always eligible
    if (match.tier === 5) {
      results.push({
        code: match.statute_code,
        offense_name: match.offense_name || "",
        tier: match.tier,
        status: "✅ Eligible now (Tier V offense)",
      });
      return;
    }

    // Tier II–IV ⇒ need date to be accurate
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
    // strictest (latest) “eligible on”
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
