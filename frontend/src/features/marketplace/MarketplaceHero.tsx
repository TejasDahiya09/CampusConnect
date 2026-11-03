export function MarketplaceHero() {
  return (
    <section className="cc-market-hero" aria-label="Campus essentials">
      <svg
        className="cc-market-campus"
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="market-campus-sky" x2="1" y2="1">
            <stop stopColor="#a6a2df" />
            <stop offset="1" stopColor="#49498c" />
          </linearGradient>
          <pattern id="market-campus-windows" width="32" height="44" patternUnits="userSpaceOnUse">
            <path d="M10 32V17a6 6 0 0 1 12 0v15Z" fill="#292957" opacity=".55" />
          </pattern>
        </defs>
        <path fill="url(#market-campus-sky)" d="M0 0h1200v400H0z" />
        <circle cx="880" cy="90" r="155" fill="#ded2f6" opacity=".22" />
        <path
          d="M360 340V215l160-65 160 65v125M765 340V115h92v225M750 115l61-50 61 50M920 340V210l130-60 150 60v130"
          fill="#c2b8c3"
        />
        <path
          d="M370 330V220h300v110M775 330V125h72v205M930 330V215h260v115"
          fill="url(#market-campus-windows)"
        />
        <path d="M0 365Q300 290 540 350T1200 330v70H0Z" fill="#343e66" />
        <path
          d="M0 400V230l35-75 35 75-20-5 38 90H60v85m1040 0V190l40-100 40 100-20-8 40 105h-35v113"
          fill="#253857"
          opacity=".8"
        />
        <path d="m660 400 100-60h90l130 60" fill="#b7b0cf" opacity=".4" />
      </svg>
      <div className="cc-market-hero-copy">
        <p className="cc-market-hero-eyebrow">The campus exchange</p>
        <h2>
          Campus essentials
          <br />
          for real life.
        </h2>
        <p>Buy and sell useful things with students across campus.</p>
      </div>
    </section>
  );
}
