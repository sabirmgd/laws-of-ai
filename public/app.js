(async function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  let data;
  try {
    const res = await fetch("laws.json", { cache: "no-cache" });
    data = await res.json();
  } catch (err) {
    console.error("Failed to load laws.json", err);
    return;
  }

  const catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  // ----- Hero -----
  $("#hero-subtitle").textContent = data.subtitle;
  $("#hero-intro").textContent = data.intro;
  $("#law-count").textContent = `${data.laws.length} laws`;
  $("#year").textContent = "2026";

  // ----- Filters -----
  const filtersEl = $("#filters");
  let activeFilter = "all";

  function makeFilter(id, label, accent) {
    const btn = document.createElement("button");
    btn.className = "filter" + (id === "all" ? " is-active" : "");
    btn.dataset.filter = id;
    btn.innerHTML =
      (accent ? `<span class="filter__dot" style="background:${accent}"></span>` : "") +
      `<span>${label}</span>`;
    btn.addEventListener("click", () => setFilter(id));
    return btn;
  }

  filtersEl.appendChild(makeFilter("all", "All laws", null));
  data.categories.forEach((c) => filtersEl.appendChild(makeFilter(c.id, c.name, c.accent)));

  function setFilter(id) {
    activeFilter = id;
    filtersEl.querySelectorAll(".filter").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.filter === id)
    );
    render();
  }

  // ----- Grid -----
  const gridEl = $("#grid");

  function render() {
    gridEl.innerHTML = "";
    const laws = data.laws.filter(
      (l) => activeFilter === "all" || l.category === activeFilter
    );
    laws.forEach((law, i) => {
      const cat = catById[law.category] || {};
      const accent = cat.accent || "#888";
      const card = document.createElement("button");
      card.className = "card";
      card.style.setProperty("--card-accent", accent);
      card.style.setProperty("--tag-color", accent);
      card.style.animationDelay = `${Math.min(i * 0.05, 0.5)}s`;
      card.innerHTML = `
        <div class="card__top">
          <span class="card__number">${String(law.number).padStart(2, "0")}</span>
          <span class="tag">${cat.name || ""}</span>
        </div>
        <h3 class="card__name">${law.name}</h3>
        <p class="card__tagline">${law.tagline}</p>
        <span class="card__cue">Read the law &rarr;</span>
      `;
      card.addEventListener("click", () => openModal(law));
      gridEl.appendChild(card);
    });
  }

  // ----- Modal -----
  const modal = $("#modal");

  function openModal(law) {
    const cat = catById[law.category] || {};
    const accent = cat.accent || "#888";
    $("#modal-number").textContent = "Law " + String(law.number).padStart(2, "0");
    const tag = $("#modal-tag");
    tag.textContent = cat.name || "";
    tag.style.setProperty("--tag-color", accent);
    $("#modal-name").textContent = law.name;
    const tl = $("#modal-tagline");
    tl.textContent = law.tagline;
    tl.style.color = accent;
    $("#modal-principle").textContent = law.principle;
    $("#modal-takeaway").textContent = law.takeaway;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  modal.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", closeModal)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  render();
})();
