// 切换视图
function switchView(viewType) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  if (viewType === "card") {
    document.getElementById("cardView").classList.add("active");
  } else {
    document.getElementById("listView").classList.add("active");
  }
}

document.getElementById("searchBox").addEventListener("input", filterPlayers);
document.getElementById("ageFilter").addEventListener("change", filterPlayers);
document.getElementById("countryFilter").addEventListener("change", filterPlayers);
document.getElementById("genderFilter").addEventListener("change", filterPlayers);

function filterPlayers() {
  const searchText = document.getElementById("searchBox").value.toLowerCase();
  const ageValue = document.getElementById("ageFilter").value;
  const countryValue = document.getElementById("countryFilter").value;
  const genderValue = document.getElementById("genderFilter").value;

  document.querySelectorAll(".player-card, #listView tbody tr").forEach(el => {
    const name = (el.getAttribute("data-name") || "").toLowerCase();
    const ageStr = el.getAttribute("data-age") || "";
    const age = ageStr ? parseInt(ageStr) : null;
    const country = el.getAttribute("data-country") || "";
    const gender = el.getAttribute("data-gender") || "";

    let show = true;
    if (searchText) {
      show = name.includes(searchText);
    }
    if (show && ageValue !== "all" && age !== null) {
      if (ageValue === "u18" && !(age < 18)) show = false;
      if (ageValue === "u21" && !(age < 21)) show = false;
      if (ageValue === "u23" && !(age < 23)) show = false;
      if (ageValue === "adult" && !(age >= 23)) show = false;
    }
    if (show && countryValue !== "all" && country !== countryValue) show = false;
    if (show && genderValue !== "all" && gender !== genderValue) show = false;

    el.style.display = show ? "" : "none";
  });
}

// 简单表格排序（基于 text）
function sortTable(columnIndex) {
  let table = document.getElementById("listView");
  let switching = true;
  let dir = "asc";
  while (switching) {
    switching = false;
    let rows = table.rows;
    for (let i = 1; i < rows.length - 1; i++) {
      let shouldSwitch = false;
      let x = rows[i].getElementsByTagName("TD")[columnIndex];
      let y = rows[i + 1].getElementsByTagName("TD")[columnIndex];
      if (!x || !y) continue;
      let cmpX = (x.textContent || x.innerText).trim();
      let cmpY = (y.textContent || y.innerText).trim();
      // 尝试数值比较
      if (!isNaN(cmpX) && !isNaN(cmpY)) {
        cmpX = Number(cmpX);
        cmpY = Number(cmpY);
      }
      if (dir === "asc" && cmpX > cmpY) {
        shouldSwitch = true; break;
      } else if (dir === "desc" && cmpX < cmpY) {
        shouldSwitch = true; break;
      }
    }
    if (shouldSwitch) {
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
    } else {
      if (dir === "asc") { dir = "desc"; switching = true; }
    }
  }
}
