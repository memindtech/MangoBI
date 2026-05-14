<script setup lang="ts">
/**
 * AppLogo — MangoBI brand mark
 *
 * Orange gradient rounded-square tile with a bold white "M" whose right
 * stroke continues out as an up-right arrow (the BI / growth signal).
 * Small white dot at the upper-left adds a notification-style accent.
 */
withDefaults(defineProps<{
  /** size in px (height = width) */
  size?: number
  /** drop the soft outer shadow when the logo sits on an already-colored surface */
  flat?: boolean
}>(), { size: 64, flat: false })
</script>

<template>
  <svg
    :width="size" :height="size"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="MangoBI"
    :class="flat ? '' : 'drop-shadow-md'"
  >
    <defs>
      <linearGradient id="mb-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#fb923c" />
        <stop offset="100%" stop-color="#ea580c" />
      </linearGradient>
      <radialGradient id="mb-shine" cx="0.75" cy="0.15" r="0.6">
        <stop offset="0%"   stop-color="white" stop-opacity="0.30" />
        <stop offset="100%" stop-color="white" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Rounded square tile -->
    <rect width="48" height="48" rx="10" fill="url(#mb-tile)" />
    <rect width="48" height="48" rx="10" fill="url(#mb-shine)" />

    <!-- Decorative dot, upper-left -->
    <circle cx="8" cy="9" r="2.2" fill="white" />

    <!-- M + arrow as one continuous heavy stroke
         M: (11,38) → up to (11,12) → V down to (24,30) → V up to (36,12)
         Arrow stem: (36,12) → (44,4)
         Right leg of M: (36,12) → (36,38)
         Arrowhead: chevron at (44,4) -->
    <g
      stroke="white"
      stroke-width="6"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- The "M" body -->
      <polyline points="11,38 11,12 24,30 36,12 36,38" />
      <!-- Arrow stem extending up-right from right leg's top -->
      <line x1="36" y1="12" x2="44" y2="4" />
      <!-- Arrowhead chevron pointing NE (tip at 44,4) -->
      <polyline points="39,4 44,4 44,9" />
    </g>
  </svg>
</template>
