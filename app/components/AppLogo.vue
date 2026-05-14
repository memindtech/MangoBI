<script setup lang="ts">
/**
 * AppLogo — MangoBI brand mark
 *
 * Orange gradient rounded-square tile with a bold white "M" plus an
 * up-right arrow flying out of the right leg (the "growth / BI" signal).
 * A small white dot at the upper-left adds a notification-style accent.
 * Renders crisply from 24px (toolbar) up to 200px+ (splash).
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
      <!-- Background: warm orange diagonal gradient -->
      <linearGradient id="mb-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#fb923c" />
        <stop offset="55%"  stop-color="#f97316" />
        <stop offset="100%" stop-color="#c2410c" />
      </linearGradient>
      <!-- Top-right soft highlight -->
      <radialGradient id="mb-shine" cx="0.75" cy="0.15" r="0.6">
        <stop offset="0%"   stop-color="white" stop-opacity="0.35" />
        <stop offset="100%" stop-color="white" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Rounded square tile -->
    <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#mb-tile)" />
    <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#mb-shine)" />

    <!-- Decorative dot, upper-left -->
    <circle cx="8" cy="8.5" r="2.2" fill="white" opacity="0.9" />

    <!-- Up-right arrow flying out the right leg of M.
         Drawn as a vertical "up arrow" then rotated 35° clockwise around its base. -->
    <g transform="rotate(35 35 18)">
      <path
        d="M 33 18
           L 33 8
           L 28.5 8
           L 35 -0.5
           L 41.5 8
           L 37 8
           L 37 18
           Z"
        fill="white"
      />
    </g>

    <!-- Bold "M" letter (filled white).
         Legs ~7px thick; V dips to y=26; the right leg overlaps with the arrow base above. -->
    <path
      d="M 8 40
         L 8 13
         L 15 13
         L 24 26
         L 33 13
         L 40 13
         L 40 40
         L 33 40
         L 33 22
         L 27 30
         L 21 30
         L 15 22
         L 15 40
         Z"
      fill="white"
    />
  </svg>
</template>
