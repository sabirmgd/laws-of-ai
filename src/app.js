(function () {
  "use strict";

  // Progressive enhancement: the cards are already server-rendered in the DOM.
  // JS only adds filtering, the detail modal, and shareable #hash deep-links.

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
    };
  }

  function openCard(card, push) {
    const d = dataFromCard(card);
    $("#modal-number").textContent = "Law " + d.number;
    const tag = $("#modal-tag");
    tag.textContent = d.tag;
    tag.style.setProperty("--tag-color", d.accent);
    $("#modal-name").textContent = d.name;
    const tl = $("#modal-tagline");
    tl.textContent = d.tagline;
    tl.style.color = d.accent;
    $("#modal-principle").textContent = d.principle;
    $("#modal-takeaway").textContent = d.takeaway;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (push && card.id && location.hash !== "#" + card.id) {
      history.pushState(null, "", "#" + card.id);
    }
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
