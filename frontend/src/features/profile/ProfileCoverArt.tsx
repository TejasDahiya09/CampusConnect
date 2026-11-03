/** Decorative campus/network geometry, not an institution, map, badge or data visualization. */
export function ProfileCoverArt() {
  return (
    <svg
      className="sp-cover-art"
      viewBox="0 0 620 140"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="1">
        <path
          opacity=".18"
          d="M0 112h620M25 140 255 0M175 140 405 0M325 140 555 0M475 140 620 52"
        />
        <path
          opacity=".5"
          d="M55 112V76l50-24 50 24v36M75 112V85h60v27M205 112V46l36-20 36 20v66M224 112V79h35v33M342 112V65l66-28 66 28v47M360 112V76h96v36"
        />
        <path opacity=".38" d="M155 94h50M277 94h65M474 94h62V56M105 52V26h136M408 37V13h128v43" />
        <path
          opacity=".65"
          d="M92 87h10v10H92zM113 87h10v10h-10zM234 46h14v17h-14zM373 81h12v14h-12zM400 81h12v14h-12zM427 81h12v14h-12z"
        />
        <rect x="529" y="49" width="14" height="14" rx="3" opacity=".7" />
        <rect x="98" y="19" width="14" height="14" rx="3" opacity=".7" />
        <path opacity=".28" d="M536 63v49h84M55 112H0" />
      </g>
    </svg>
  );
}
