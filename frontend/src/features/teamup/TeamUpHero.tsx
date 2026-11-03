export function TeamUpHero() {
  return (
    <section className="cc-tu-hero" aria-labelledby="tu-hero-title">
      <div>
        <p className="cc-tu-eyebrow">Different skills. Shared ambition.</p>
        <h2 id="tu-hero-title">
          Good ideas need
          <br />
          good teammates.
        </h2>
        <p>Discover student projects. Find where your skills fit. Build something together.</p>
      </div>
      <svg className="cc-tu-hero-art" viewBox="0 0 580 240" fill="none" aria-hidden="true">
        <ellipse cx="350" cy="155" rx="210" ry="100" fill="currentColor" opacity=".05" />
        <path
          d="M90 80h120l70 55h170M120 200h100l60-65 120-75h85"
          stroke="currentColor"
          strokeOpacity=".25"
          strokeWidth="2"
        />
        <rect
          x="244"
          y="63"
          width="126"
          height="140"
          rx="16"
          fill="currentColor"
          fillOpacity=".13"
          stroke="currentColor"
          strokeOpacity=".35"
        />
        <path
          d="M267 94h78m-78 17h49m-49 58h78m-78 15h55"
          stroke="currentColor"
          strokeOpacity=".5"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="m285 133-12 10 12 10m34-20 12 10-12 10m-15-23-6 26"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="62"
          y="50"
          width="68"
          height="59"
          rx="12"
          fill="currentColor"
          fillOpacity=".1"
          stroke="currentColor"
          strokeOpacity=".3"
        />
        <path
          d="m80 78 9 9 22-21"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="455"
          cy="135"
          r="28"
          fill="currentColor"
          fillOpacity=".13"
          stroke="currentColor"
          strokeOpacity=".3"
        />
        <path
          d="M443 135h24m-12-12v24"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="120" cy="200" r="9" fill="currentColor" fillOpacity=".4" />
        <circle cx="485" cy="60" r="9" fill="currentColor" fillOpacity=".4" />
      </svg>
    </section>
  );
}
