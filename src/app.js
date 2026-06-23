(function () {
  "use strict";

  // Progressive enhancement: the cards are already server-rendered in the DOM.
  // JS only adds filtering, the detail modal, and shareable #hash deep-links.

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- GA4 helper ----------
  // No-op when gtag isn't loaded yet (Consent Mode / blockers). Safe to call.
  const track = (name, params) => {
    if (typeof window.gtag === "function") {
      try { window.gtag("event", name, params || {}); } catch (_) {}
    }
  };

  const cards = $$(".card");
  const modal = $("#modal");
  if (!modal) return;

  // ---------- Viewed tracking (localStorage) ----------
  // Smart progress: cards the visitor has opened or marked are remembered
  // across visits, with an optional "hide viewed" filter to focus on the rest.
  const VIEWED_KEY = "loa:viewed:v1";
  const TOTAL = cards.length;
  let viewed = new Set();
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (raw) viewed = new Set(JSON.parse(raw));
  } catch (_) {}
  const saveViewed = () => {
    try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...viewed])); } catch (_) {}
  };

  const viewedToggle = $("#viewedToggle");
  const viewedCountEl = $("#viewedCount");
  let activeCategory = "all";
  let hideViewed = false;

  function reflectCard(card) {
    const on = viewed.has(card.id);
    card.classList.toggle("is-viewed", on);
    const btn = $(".card__viewed", card);
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function updateViewedUI() {
    const n = viewed.size;
    if (viewedCountEl) viewedCountEl.textContent = `${n} of ${TOTAL} viewed`;
    if (viewedToggle) {
      viewedToggle.hidden = n === 0;
      if (n === 0) { hideViewed = false; viewedToggle.setAttribute("aria-pressed", "false"); }
    }
  }

  function setViewed(card, on) {
    if (on) viewed.add(card.id); else viewed.delete(card.id);
    saveViewed();
    reflectCard(card);
    updateViewedUI();
    applyFilters();
  }

  // ---------- Unified filtering (category + hide-viewed) ----------
  function applyFilters() {
    cards.forEach((c) => {
      const catOk = activeCategory === "all" || c.dataset.category === activeCategory;
      const viewedOk = !hideViewed || !viewed.has(c.id);
      c.style.display = catOk && viewedOk ? "" : "none";
    });
    updateCount();
  }

  const countEl = $("#filtersCount");
  function updateCount() {
    if (!countEl) return;
    const n = cards.filter((c) => c.style.display !== "none").length;
    countEl.textContent = n + (n === 1 ? " law" : " laws");
  }

  // Initial paint of viewed state.
  cards.forEach(reflectCard);
  updateViewedUI();

  // Per-card viewed toggle (does not open the modal).
  cards.forEach((card) => {
    const btn = $(".card__viewed", card);
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const next = !viewed.has(card.id);
      setViewed(card, next);
      track(next ? "law_marked_viewed" : "law_unmarked_viewed", { law_slug: card.id });
    });
  });

  if (viewedToggle) {
    viewedToggle.addEventListener("click", () => {
      hideViewed = !hideViewed;
      viewedToggle.setAttribute("aria-pressed", hideViewed ? "true" : "false");
      applyFilters();
      track("viewed_filter_toggle", { hide_viewed: hideViewed });
    });
  }

  // ---------- Filters ----------
  const filtersEl = $("#filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      activeCategory = btn.dataset.filter;
      $$(".filter", filtersEl).forEach((b) =>
        b.classList.toggle("is-active", b === btn)
      );
      // Center the tapped pill in the horizontal scroller (mobile carousel feel).
      if (filtersEl.scrollWidth > filtersEl.clientWidth) {
        filtersEl.scrollTo({
          left: btn.offsetLeft - filtersEl.clientWidth / 2 + btn.clientWidth / 2,
          behavior: "smooth",
        });
      }
      applyFilters();
      track("category_filter", { category: activeCategory });
    });
  }

  // ---------- Sticky nav shadow + back-to-top + scroll_75 ----------
  const nav = $("#nav");
  const backtop = $("#backtop");
  let fired75 = false;
  const onScroll = () => {
    const doc = document.documentElement;
    const max = (doc.scrollHeight - doc.clientHeight) || 1;
    const y = window.scrollY || window.pageYOffset || 0;
    const pct = (y / max) * 100;
    if (nav) nav.classList.toggle("is-scrolled", y > 8);
    if (backtop) backtop.classList.toggle("is-on", y > 560);
    if (!fired75 && pct >= 75) {
      fired75 = true;
      track("scroll_75", { page_path: location.pathname });
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (backtop)
    backtop.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" })
    );

  // ---------- Newsletter signup tracking ----------
  const signupForm = document.querySelector(".signup__form");
  if (signupForm) {
    signupForm.addEventListener("submit", () => {
      track("newsletter_signup", { location: "home" });
    });
  }

  // ---------- Product checkout intent ----------
  document.querySelectorAll('[data-track="product_checkout_click"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("product_checkout_click", {
        product: link.dataset.product || "ai-agent-audit-kit",
        page_path: location.pathname,
      });
    });
  });

  // ---------- Source-click tracking (modal source link) ----------
  const modalSource = $("#modal-source");
  if (modalSource) {
    modalSource.addEventListener("click", () => {
      track("source_click", {
        source_url: modalSource.href,
        law_slug: location.hash || "",
      });
    });
  }

  // ---------- Modal ----------
  function dataFromCard(card) {
    return {
      number: $(".card__number", card)?.textContent.trim() || "",
      tag: $(".tag", card)?.textContent.trim() || "",
      name: $(".card__name", card)?.textContent.trim() || "",
      tagline: $(".card__tagline", card)?.textContent.trim() || "",
      principle: $(".card__principle", card)?.textContent.trim() || "",
      takeaway: $(".card__takeaway", card)?.textContent.trim() || "",
      accent: card.style.getPropertyValue("--card-accent") || "var(--accent)",
      sourceTitle: card.dataset.sourceTitle || "",
      sourceAuthor: card.dataset.sourceAuthor || "",
      sourceUrl: card.dataset.sourceUrl || "",
    };
  }

  function openCard(card, push) {
    const d = dataFromCard(card);
    $("#modal-number").textContent = "Law " + d.number;
    const mIcon = $("#modal-icon");
    const cVisual = $(".card__img", card) || $(".card__icon", card);
    if (mIcon && cVisual) {
      mIcon.innerHTML = cVisual.outerHTML;
      mIcon.style.color = d.accent;
    }
    const tag = $("#modal-tag");
    tag.textContent = d.tag;
    tag.style.setProperty("--tag-color", d.accent);
    $("#modal-name").textContent = d.name;
    const tl = $("#modal-tagline");
    tl.textContent = d.tagline;
    tl.style.color = d.accent;
    $("#modal-principle").textContent = d.principle;
    $("#modal-takeaway").textContent = d.takeaway;
    const srcEl = $("#modal-source");
    if (srcEl) {
      if (d.sourceUrl) {
        const label = d.sourceAuthor
          ? `${d.sourceTitle}, ${d.sourceAuthor}`
          : d.sourceTitle;
        srcEl.textContent = "Source: " + label;
        srcEl.href = d.sourceUrl;
        srcEl.style.color = d.accent;
        srcEl.hidden = false;
      } else {
        srcEl.hidden = true;
      }
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (push && card.id && location.hash !== "#" + card.id) {
      history.pushState(null, "", "#" + card.id);
    }
    track("law_open", { law_slug: card.id, category: card.dataset.category });
  }

  function closeModal(clearHash) {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (clearHash && location.hash) {
      history.pushState(null, "", location.pathname + location.search);
    }
  }

  cards.forEach((card) => {
    card.addEventListener("click", (e) => {
      // the viewed toggle handles its own click; don't open the modal for it
      if (e.target.closest("[data-viewed-toggle]")) return;
      // let the inner anchor manage the hash; we still open the modal
      if (e.target.closest(".card__link")) e.preventDefault();
      openCard(card, true);
    });
  });

  modal.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => closeModal(true))
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal(true);
  });

  // ---------- Deep-linking ----------
  function openFromHash() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!id) {
      if (!modal.hidden) closeModal(false);
      return;
    }
    const card = document.getElementById(id);
    if (card && card.classList.contains("card")) openCard(card, false);
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
