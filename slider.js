class ImageSlider {
    constructor(root, options = {}) {
        this.root = root;
        this.options = {
            duration: 500,        // slide animation time (ms)
            swipeThreshold: 50,   // min swipe distance (px)
            autoplay: true,       // slide automatically
            interval: 5000,       // time between auto slides (ms)
            ...options,
        };

        this.track = root.querySelector(".slider-track");
        this.slides = Array.from(this.track.children);
        this.total = this.slides.length;

        if (this.total === 0) return;

        this.index = 1; // position inside the track (clones included)
        this.isAnimating = false;
        this.fallbackTimer = null;
        this.touchStartX = null;
        this.autoplayTimer = null;
        this.isPaused = false;

        this.root.style.setProperty("--slider-duration", `${this.options.duration}ms`);

        this.addClones();
        this.createArrows();
        this.createDots();
        this.bindEvents();
        this.bindAutoplayEvents();

        this.setPosition(this.index, false);
        this.updateDots();
        this.startAutoplay();
    }

    /* ---------- Setup ---------- */

    addClones() {
        const firstClone = this.slides[0].cloneNode(true);
        const lastClone = this.slides[this.total - 1].cloneNode(true);

        [firstClone, lastClone].forEach((clone) => {
            clone.setAttribute("aria-hidden", "true");
            clone.dataset.clone = "true";
        });

        this.track.appendChild(firstClone);
        this.track.insertBefore(lastClone, this.track.firstChild);
    }

    createArrows() {
        this.prevBtn = this.createButton("slider-arrow slider-prev", "Previous image", "&#10094;");
        this.nextBtn = this.createButton("slider-arrow slider-next", "Next image", "&#10095;");
        this.root.append(this.prevBtn, this.nextBtn);
    }

    createDots() {
        this.dotsWrap = document.createElement("div");
        this.dotsWrap.className = "slider-dots";

        this.dots = this.slides.map((_, i) => {
            const dot = this.createButton("slider-dot", `Go to image ${i + 1}`, "");
            dot.dataset.index = i;
            this.dotsWrap.appendChild(dot);
            return dot;
        });

        this.root.appendChild(this.dotsWrap);

        // One image: nothing to navigate
        if (this.total < 2) {
            this.prevBtn.hidden = true;
            this.nextBtn.hidden = true;
            this.dotsWrap.hidden = true;
        }
    }

    createButton(className, label, html) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = className;
        btn.setAttribute("aria-label", label);
        btn.innerHTML = html;
        return btn;
    }

    bindEvents() {
        this.prevBtn.addEventListener("click", () => this.prev());
        this.nextBtn.addEventListener("click", () => this.next());

        this.dotsWrap.addEventListener("click", (e) => {
            const dot = e.target.closest(".slider-dot");
            if (dot) this.goTo(Number(dot.dataset.index));
        });

        this.track.addEventListener("transitionend", (e) => {
            if (e.target === this.track && e.propertyName === "transform") {
                this.finishTransition();
            }
        });

        // Keyboard arrows when the slider has focus
        this.root.tabIndex = 0;
        this.root.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight") this.next();
            if (e.key === "ArrowLeft") this.prev();
        });

        // Touch swipe
        this.root.addEventListener("touchstart", (e) => {
            this.touchStartX = e.touches[0].clientX;
        }, { passive: true });

        this.root.addEventListener("touchend", (e) => {
            if (this.touchStartX === null) return;
            const diff = e.changedTouches[0].clientX - this.touchStartX;
            this.touchStartX = null;
            if (Math.abs(diff) < this.options.swipeThreshold) return;
            diff < 0 ? this.next() : this.prev();
        });
    }

    /* ---------- Autoplay ---------- */

    // Pause while the user interacts with the slider, resume when they stop
    bindAutoplayEvents() {
        if (!this.options.autoplay || this.total < 2) return;

        // Mouse hovering over the slider
        this.root.addEventListener("mouseenter", () => this.pause());
        this.root.addEventListener("mouseleave", () => this.resume());

        // Keyboard focus on arrows, dots or the slider itself
        this.root.addEventListener("focusin", () => this.pause());
        this.root.addEventListener("focusout", () => this.resume());

        // Finger touching or swiping
        this.root.addEventListener("touchstart", () => this.pause(), { passive: true });
        // (touch screens keep a "sticky" hover state, so ignore it here)
        this.root.addEventListener("touchend", () => this.resume(true));
        this.root.addEventListener("touchcancel", () => this.resume(true));

        // Do not keep sliding while the browser tab is hidden
        document.addEventListener("visibilitychange", () => {
            document.hidden ? this.pause() : this.resume();
        });
    }

    startAutoplay() {
        if (!this.options.autoplay || this.total < 2) return;
        this.stopAutoplay();
        this.autoplayTimer = setInterval(() => this.next(), this.options.interval);
    }

    stopAutoplay() {
        clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
    }

    pause() {
        this.isPaused = true;
        this.stopAutoplay();
    }

    resume(ignoreHover = false) {
        // Stay paused if the pointer or keyboard focus is still inside the slider
        const hovering = !ignoreHover && this.root.matches(":hover");
        const keyboardFocus = this.root.querySelector(":focus-visible") !== null;
        if (document.hidden || hovering || keyboardFocus) return;
        this.isPaused = false;
        this.startAutoplay(); // restarts the full 5 second countdown
    }

    /* ---------- Navigation ---------- */

    next() {
        this.moveTo(this.index + 1);
    }

    prev() {
        this.moveTo(this.index - 1);
    }

    // Jump straight to a real slide (0-based), used by the dots
    goTo(realIndex) {
        if (realIndex === this.currentRealIndex()) return;
        this.moveTo(realIndex + 1);
    }

    moveTo(trackIndex) {
        if (this.isAnimating || this.total < 2) return;

        // Every move (manual or automatic) restarts the 5 second countdown
        if (!this.isPaused) this.startAutoplay();

        this.isAnimating = true;
        this.index = trackIndex;
        this.setPosition(this.index, true);
        this.updateDots();

        // Safety net in case transitionend never fires (hidden tab, reduced motion)
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = setTimeout(
            () => this.finishTransition(),
            this.options.duration + 100
        );
    }

    finishTransition() {
        if (!this.isAnimating) return;
        clearTimeout(this.fallbackTimer);
        this.isAnimating = false;

        // Landed on a clone: silently swap to the matching real slide
        if (this.index === 0) this.setPosition(this.total, false);
        else if (this.index === this.total + 1) this.setPosition(1, false);
    }

    /* ---------- Rendering ---------- */

    setPosition(trackIndex, animate) {
        this.index = trackIndex;
        this.track.style.transition = animate ? "" : "none";
        this.track.style.transform = `translateX(${-trackIndex * 100}%)`;

        if (!animate) {
            void this.track.offsetWidth; // flush styles so the jump is not animated
            this.track.style.transition = "";
        }
    }

    currentRealIndex() {
        return (this.index - 1 + this.total) % this.total;
    }

    updateDots() {
        const active = this.currentRealIndex();
        this.dots.forEach((dot, i) => {
            const isActive = i === active;
            dot.classList.toggle("active", isActive);
            dot.setAttribute("aria-current", isActive ? "true" : "false");
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-slider]").forEach((el) => new ImageSlider(el));
});

