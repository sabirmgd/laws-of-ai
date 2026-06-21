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

  // ---------- Filters ----------
  const filtersEl = $("#filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      const id = btn.dataset.filter;
      $$(".filter", filtersEl).forEach((b) =>
        b.classList.toggle("is-active", b === btn)
      );
      cards.forEach((c) => {
        const show = id === "all" || c.dataset.category === id;
        c.style.display = show ? "" : "none";
      });
      updateCount();
      track("category_filter", { category: id });
    });
  }

  // ---------- Live filter count ----------
  const countEl = $("#filtersCount");
  function updateCount() {
    if (!countEl) return;
    const n = cards.filter((c) => c.style.display !== "none").length;
    countEl.textContent = n + (n === 1 ? " law" : " laws");
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
    const cIcon = $(".card__icon", card);
    if (mIcon && cIcon) {
      mIcon.innerHTML = cIcon.innerHTML;
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
          ? `${d.sourceTitle} — ${d.sourceAuthor}`
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
