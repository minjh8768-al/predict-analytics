document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  const onScroll = () => {
    if (window.scrollY > 40) {
      nav.classList.add("solid");
    } else {
      nav.classList.remove("solid");
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("open");
      links.classList.toggle("open");
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        toggle.classList.remove("open");
        links.classList.remove("open");
      });
    });
  }

  const intro = document.querySelector(".hero");
  if (intro) {
    document.body.classList.add("intro-active");
    let dismissed = false;

    const dismissIntro = () => {
      if (dismissed) return;
      dismissed = true;
      intro.classList.add("intro-hide");
      document.body.classList.remove("intro-active");
      intro.addEventListener(
        "transitionend",
        () => {
          intro.style.display = "none";
          nav.classList.remove("nav-hero");
        },
        { once: true }
      );
    };

    document.querySelector(".intro-hint")?.addEventListener("click", dismissIntro);

    intro.addEventListener("click", (e) => {
      if (e.target.closest(".hero-subscribe")) return;
      dismissIntro();
    });
  }
});
